// DUSTLINE — local gate validator: mirrors the scorer's six rows as far as they
// can be checked without the server (game files, three.js bytes, references,
// screenshots, dossier match, JS parses). Run: node validate.mjs [outDir]
// Exit 1 on any failure, with the fix printed beside it.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const out = resolve(process.argv[2] || join(root, 'out'));
const kitGame = '/home/hatch/workspace/makefun/kit/threejs-fps-01/threejs-fps-01-kit/starter/game';
let fail = 0;
const bad = (row, msg) => { fail += 1; console.log(`FAIL ${row}: ${msg}`); };
const ok = (row, msg) => console.log(`ok   ${row}: ${msg}`);

function walk(dir, list = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, list);
    else if (e.isFile()) list.push(p);
    else bad('game_files', `not a plain file: ${p}`);
  }
  return list;
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// --- game_files ---------------------------------------------------------------
const gameDir = join(out, 'game');
const files = walk(gameDir);
const totalBytes = files.reduce((s, f) => s + statSync(f).size, 0);
if (files.length > 993) bad('game_files', `${files.length} files > 993`);
else ok('game_files', `${files.length} files, ${(totalBytes / 1048576).toFixed(2)} MiB`);
if (totalBytes > 50331648) bad('game_files', 'game/ over 48 MiB');
const idx = join(gameDir, 'index.html');
if (!existsSync(idx)) bad('game_files', 'game/index.html missing');
else if (statSync(idx).size > 1048576) bad('game_files', 'index.html over 1 MiB');

// --- three_js -----------------------------------------------------------------
const threeFiles = ['three.module.min.js', 'three.core.min.js'];
for (const name of threeFiles) {
  const got = join(gameDir, 'vendor', 'three', name);
  const want = join(kitGame, 'vendor', 'three', name);
  if (!existsSync(got)) bad('three_js', `${name} missing`);
  else if (sha(got) !== sha(want)) bad('three_js', `${name} bytes differ from the kit's 0.187.0`);
}
const html = existsSync(idx) ? readFileSync(idx, 'utf8') : '';
const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
if (maps.length !== 1) bad('three_js', `expected exactly 1 import map, found ${maps.length}`);
else {
  let imp;
  try { imp = JSON.parse(maps[0][1]); } catch { imp = null; }
  const target = imp?.imports?.three;
  if (target !== './vendor/three/three.module.min.js') bad('three_js', `import map "three" -> ${target}`);
  else ok('three_js', '0.187.0 byte-for-byte, import map maps "three" to ./vendor/three/three.module.min.js');
}

// --- references: every static import / import() must resolve inside game/ ------
const srcFiles = files.filter(f => ['.js', '.mjs'].includes(extname(f)));
let refFail = 0;
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  const specs = [
    ...text.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ...text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...text.matchAll(/import\s+['"]([^'"]+)['"]/g),
  ].map(m => m[1]);
  for (const s of specs) {
    if (s === 'three') continue;
    if (!s.startsWith('.')) { bad('references', `${f}: bare specifier ${s}`); refFail += 1; continue; }
    const resolved = resolve(dirname(f), s);
    if (!resolved.startsWith(gameDir + '/') || !existsSync(resolved)) {
      bad('references', `${f}: ${s} does not resolve inside game/`);
      refFail += 1;
    }
  }
}
if (!refFail) ok('references', `${srcFiles.length} modules, all specifiers resolve inside game/`);

// --- screenshots ---------------------------------------------------------------
function jpegSize(buf) {
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}
const shotDir = join(out, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter(n => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > 4) bad('screenshots', `${shots.length} screenshots, need 3 or 4`);
else {
  let shotOk = true;
  for (const name of shots) {
    const p = join(shotDir, name);
    const size = statSync(p).size;
    const buf = readFileSync(p);
    let dims = null;
    if (buf[0] === 0xff && buf[1] === 0xd8) dims = jpegSize(buf);
    else if (buf.slice(1, 4).toString() === 'PNG') dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (!dims) { bad('screenshots', `${name}: not a whole PNG or JPEG`); shotOk = false; continue; }
    const longSide = Math.max(dims.w, dims.h), shortSide = Math.min(dims.w, dims.h);
    if (size > 262144) { bad('screenshots', `${name}: ${size} bytes > 256 KiB`); shotOk = false; }
    if (longSide > 1280 || shortSide < 480) { bad('screenshots', `${name}: ${dims.w}x${dims.h} breaks the 1280 / 480 rule`); shotOk = false; }
  }
  if (shotOk) ok('screenshots', `${shots.length} shots, sizes and dimensions within the caps`);
}

// --- dossier_matches ------------------------------------------------------------
const dossier = join(out, 'dossier.json');
if (!existsSync(dossier)) bad('dossier_matches', 'dossier.json missing');
else if (statSync(dossier).size > 1572864) bad('dossier_matches', 'dossier.json over 1.5 MiB');
else ok('dossier_matches', `dossier.json present, ${statSync(dossier).size} bytes (byte-compare needs a second main.ts run)`);

// --- js_parses ------------------------------------------------------------------
let parseFail = 0;
for (const f of srcFiles) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'ignore' });
  } catch { bad('js_parses', `${f} does not parse`); parseFail += 1; }
}
if (!parseFail) ok('js_parses', `${srcFiles.length} modules parse as ES modules`);

console.log(fail ? `\n${fail} check(s) failed` : '\nALL LOCAL GATE CHECKS PASS');
process.exit(fail ? 1 : 0);
