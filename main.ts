// main.ts — DUSTLINE's entrypoint for make.fun (threejs-fps-01).
//
// A Node 22 program, standard library only. It copies game/ and
// screenshots/ from this repository into the output directory (the
// MAKEFUN_OUTPUT_DIR environment variable, defaulting to /output) and
// writes output dossier.json with buildDossier from vendor/makefun-threejs.ts.
//
// It is deterministic: two runs over the same repository write byte-identical
// output, because the copy is a plain byte copy in sorted order and the
// dossier is a pure function of the copied files.

import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The caps the competition's scorer holds the dossier to.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

// Copy a directory tree byte for byte, visiting entries in sorted order so
// the run is deterministic. Symlinks are refused: game/ must be plain files.
// Copy a directory tree byte for byte, visiting entries in sorted order so
// the run is deterministic. Symlinks are refused: game/ must be plain files.
async function copyTree(srcDir: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dest);
    } else if (entry.isFile()) {
      await copyFile(src, dest);
    } else {
      throw new Error(`main.ts: refusing non-file entry in the game tree: ${src}`);
    }
  }
}

async function main(): Promise<void> {
  // Clear any stale output first, so a second run over a dirty directory
  // still produces exactly the current repository.
  await rm(join(OUT_DIR, 'game'), { recursive: true, force: true });
  await rm(join(OUT_DIR, 'screenshots'), { recursive: true, force: true });
  await rm(join(OUT_DIR, 'dossier.json'), { force: true });
  await mkdir(OUT_DIR, { recursive: true });

  await copyTree(join(REPO_ROOT, 'game'), join(OUT_DIR, 'game'));
  await copyTree(join(REPO_ROOT, 'screenshots'), join(OUT_DIR, 'screenshots'));

  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  await writeFile(join(OUT_DIR, 'dossier.json'), dossier);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});

