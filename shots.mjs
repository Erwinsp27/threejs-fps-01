// shots.mjs — take DUSTLINE's four screenshots with headless Chromium.
// Each shot loads the game with a ?shot=N autopilot preset (a real render
// of the game's own code, never edited or composited) and captures it at
// 1280x720 JPEG. Run: node shots.mjs

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDP, startGameServer, stopServer, sleep } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8138;

const spec = JSON.parse(await readFile(join(ROOT, 'shots.json'), 'utf8'));

const server = await startGameServer(PORT);
const cdp = new CDP(9223);
let failed = false;
try {
  await cdp.launch('about:blank');
  for (const shot of spec.shots) {
    const url = `http://127.0.0.1:${PORT}${shot.url}`;
    if (cdp.targetId) {
      await cdp.navigate(url);
    } else {
      await cdp.newTarget(url);
    }
    await cdp.waitFor('window.__DUSTLINE !== undefined', 30000);
    await sleep(shot.waitMs);
    const file = join(ROOT, 'screenshots', shot.file);
    await cdp.screenshot(file);
    const size = (await stat(file)).size;
    console.log(`${shot.file}: ${size} bytes${size > 256 * 1024 ? ' — TOO BIG (cap 256 KiB)' : ''}`);
    if (size > 256 * 1024) failed = true;
    if (cdp.errors.length) {
      console.log(`  page errors during ${shot.file}:`);
      for (const e of cdp.errors) console.log('   - ' + e);
      failed = true;
    }
    cdp.errors.length = 0;
  }
} finally {
  await cdp.close();
  stopServer(server);
}

if (failed) {
  console.error('shots: FAILED');
  process.exit(1);
}
console.log('shots: all 4 screenshots captured');
