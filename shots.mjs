// DUSTLINE — screenshot runner: serves game/, opens each staged shot in headless
// Chromium (SwiftShader WebGL), waits for window.__shotReady, and saves a JPEG.
// Usage: node shots.mjs  (expects `playwright-core` installed and the headless
// shell downloaded by `npx playwright install chromium-headless-shell`).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', '8091'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));

for (const shot of shots) {
  const url = `http://127.0.0.1:8091/${shot.query}`;
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
  } catch {
    console.log(`TIMEOUT waiting for __shotReady: ${shot.name}`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 300));
  const out = join(here, 'screenshots', shot.name);
  await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
  console.log(`saved ${shot.name}`);
}
await browser.close();
server.kill();
console.log('done');
