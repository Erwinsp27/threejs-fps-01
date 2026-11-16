// validate.mjs — the local gate for DUSTLINE. Checks the files the
// competition's scorer will check (game limits, three.js bytes, references
// resolving inside game/, screenshot sizes and dimensions, dossier
// determinism) plus the local hygiene the entry needs (LICENSE, ESM parse,
// no network references, no stray files). Run: node validate.mjs

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GAME = join(ROOT, 'game');

const EXPECTED = {
  threeModule: 'ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b',
  threeCore: '613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578',
  dossierLib: 'f9622210e6a0aed70d6f13273a24c9c4a661b5e272edf8fef21197fac6de7969',
};

const failures = [];
const notes = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
}
function note(text) {
  notes.push(text);
  console.log('      ' + text);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) out.push(p);
    else failures.push('non-file entry: ' + p);
  }
  return out;
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function main() {
  // --- root files ---
  const rootFiles = ['main.ts', 'package.json', 'README.md', 'LICENSE', 'serve.ts', 'shots.json', 'shots.mjs', 'playtest.mjs', 'cdp.mjs', 'validate.mjs', '.gitignore'];
  for (const f of rootFiles) {
    try {
      await stat(join(ROOT, f));
    } catch {
      check('root file present: ' + f, false);
    }
  }
  check('root files present', failures.length === 0);
  const license = await readFile(join(ROOT, 'LICENSE'), 'utf8');
  check('LICENSE is MIT with SPDX first line', license.split('\n')[0].trim() === 'SPDX-License-Identifier: MIT');

  // --- three.js bytes ---
  const modBuf = await readFile(join(GAME, 'vendor/three/three.module.min.js'));
  const coreBuf = await readFile(join(GAME, 'vendor/three/three.core.min.js'));
  check('three.module.min.js is 0.187.0', sha256(modBuf) === EXPECTED.threeModule);
  check('three.core.min.js is 0.187.0', sha256(coreBuf) === EXPECTED.threeCore);
  const libBuf = await readFile(join(ROOT, 'vendor/makefun-threejs.ts'));
  check('vendor/makefun-threejs.ts unchanged', sha256(libBuf) === EXPECTED.dossierLib);

  // --- game tree limits ---
  const files = await walk(GAME);
  let totalBytes = 0;
  for (const f of files) totalBytes += (await stat(f)).size;
  const indexStat = await stat(join(GAME, 'index.html'));
  check('game/ file count <= 993', files.length <= 993, `${files.length} files`);
  check('game/ bytes <= 48 MiB', totalBytes <= 48 * 1024 * 1024, `${(totalBytes / 1024).toFixed(1)} KiB`);
  check('game/index.html <= 1 MiB', indexStat.size <= 1024 * 1024, `${indexStat.size} bytes`);

  // --- import map + references ---
  const indexHtml = await readFile(join(GAME, 'index.html'), 'utf8');
  const mapMatch = /"three"\s*:\s*"([^"]+)"/.exec(indexHtml);
  check('import map maps "three"', !!mapMatch, mapMatch ? mapMatch[1] : 'missing');
  if (mapMatch) {
    const target = resolve(GAME, mapMatch[1].replace(/^\.\//, ''));
    check('import map target is the vendored module', target === join(GAME, 'vendor/three/three.module.min.js'));
  }
  // Every static import in every game module must resolve inside game/.
  const srcFiles = files.filter((f) => f.endsWith('.js') && !f.includes('/vendor/'));
  let refsOk = true;
  for (const f of srcFiles) {
    const text = await readFile(f, 'utf8');
    if (/https?:\/\//.test(text)) {
      refsOk = false;
      note('network reference in ' + f.replace(ROOT, ''));
    }
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imports) {
      if (spec === 'three') continue;
      const resolved = resolve(dirname(f), spec);
      try {
        await stat(resolved);
      } catch {
        refsOk = false;
        note('unresolvable import ' + spec + ' in ' + f.replace(ROOT, ''));
      }
    }
  }
  if (/https?:\/\//.test(indexHtml)) refsOk = false;
  check('references resolve inside game/, no network', refsOk);

  // --- ESM parse ---
  const tmpDir = join(ROOT, '.validate-tmp');
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  let parseOk = true;
  for (const f of srcFiles) {
    const tmp = join(tmpDir, 'check.mjs');
    await copyFile(f, tmp);
    try {
      await execFileAsync(process.execPath, ['--check', tmp], { timeout: 15000 });
    } catch (e) {
      parseOk = false;
      note('parse failed: ' + f.replace(ROOT, '') + ' — ' + String(e.stderr || e.message).split('\n')[0]);
    }
  }
  await rm(tmpDir, { recursive: true, force: true });
  check('game modules parse as ES modules', parseOk, `${srcFiles.length} files`);

  // --- screenshots ---
  const shotDir = join(ROOT, 'screenshots');
  let shots = [];
  try {
    shots = (await readdir(shotDir)).filter((n) => !n.startsWith('.')).sort();
  } catch {
    shots = [];
  }
  check('3 or 4 screenshots', shots.length >= 3 && shots.length <= 4, `${shots.length} found`);
  let shotsOk = shots.length >= 3 && shots.length <= 4;
  for (const name of shots) {
    const buf = await readFile(join(shotDir, name));
    const size = buf.length <= 256 * 1024;
    const dims = name.endsWith('.png') ? pngSize(buf) : jpegSize(buf);
    const dimsOk = !!dims && Math.max(dims.width, dims.height) <= 1280 && Math.min(dims.width, dims.height) >= 480;
    if (!size || !dimsOk) shotsOk = false;
    console.log(`      ${name}: ${buf.length} bytes, ${dims ? dims.width + 'x' + dims.height : 'unreadable'}`);
  }
  check('screenshots within size and dimension caps', shotsOk);

  // --- dossier determinism: run main.ts twice, compare every byte ---
  const outA = join(ROOT, 'out');
  const outB = join(ROOT, 'out2');
  await rm(outA, { recursive: true, force: true });
  await rm(outB, { recursive: true, force: true });
  let detOk = false;
  try {
    await execFileAsync(process.execPath, ['main.ts'], {
      env: { ...process.env, MAKEFUN_OUTPUT_DIR: outA },
      timeout: 60000,
    });
    await execFileAsync(process.execPath, ['main.ts'], {
      env: { ...process.env, MAKEFUN_OUTPUT_DIR: outB },
      timeout: 60000,
    });
    const filesA = (await walk(outA)).map((f) => f.slice(outA.length)).sort();
    const filesB = (await walk(outB)).map((f) => f.slice(outB.length)).sort();
    detOk = JSON.stringify(filesA) === JSON.stringify(filesB);
    if (detOk) {
      for (const rel of filesA) {
        const a = await readFile(join(outA, rel));
        const b = await readFile(join(outB, rel));
        if (!a.equals(b)) {
          detOk = false;
          note('determinism mismatch: ' + rel);
          break;
        }
      }
    }
    const dossier = await readFile(join(outA, 'dossier.json'));
    check('dossier.json written and <= 1.5 MiB', dossier.length <= 1.5 * 1024 * 1024, `${dossier.length} bytes`);
  } catch (e) {
    note('main.ts run failed: ' + String(e.stderr || e.message).split('\n')[0]);
  }
  check('main.ts deterministic across two runs', detOk);
  await rm(outA, { recursive: true, force: true });
  await rm(outB, { recursive: true, force: true });

  // --- stray files ---
  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const allowedRoot = new Set([...rootFiles, 'game', 'screenshots', 'vendor', '.git']);
  const stray = rootEntries.filter((e) => !allowedRoot.has(e.name)).map((e) => e.name);
  check('no stray files at repo root', stray.length === 0, stray.join(', ') || 'clean');

  console.log(failures.length === 0 ? 'validate: ALL PASS' : `validate: ${failures.length} FAILURES`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('validate crashed: ' + String(e && e.stack ? e.stack : e));
  process.exit(1);
});
