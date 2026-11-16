// DUSTLINE — live playtest: drives the fixed-step simulation directly through
// window.__dustline.advance() (headless renderers throttle requestAnimationFrame,
// so real-time waiting proves nothing). Verifies: buy -> live, bots fight and
// die, a round ends, the next round starts, and no page errors appear.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const server = spawn('node', ['serve.ts', '--port', '8094'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors += 1; console.log('[pageerror]', String(e).slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error') { errors += 1; console.log('[console.error]', m.text().slice(0, 300)); } });

await page.goto('http://127.0.0.1:8094/', { waitUntil: 'load' });
await page.click('#start-btn');

const sample = () => page.evaluate(() => {
  const d = window.__dustline;
  if (!d) return null;
  const s = d.state;
  return {
    phase: s.phase, round: s.round, t: Math.round(s.roundTimeLeft),
    score: `${s.score.vanguard}-${s.score.jackals}`,
    hp: Math.round(d.player.hp), alive: d.player.alive,
    vAlive: s.bots.filter((b) => b.team === 'vanguard' && b.alive).length,
    jAlive: s.bots.filter((b) => b.team === 'jackals' && b.alive).length,
    bomb: s.bomb.state, money: s.money, kills: s.kills, feed: s.killfeed.length,
  };
});
const advance = (sec) => page.evaluate((s) => window.__dustline.advance(s), sec);

console.log('start:', JSON.stringify(await sample()));
console.log('advance 13s (buy phase):', JSON.stringify(await advance(13)));
console.log('after buy:', JSON.stringify(await sample()));
let roundEnded = false;
for (let i = 0; i < 14; i++) {
  await advance(10);
  const s = await sample();
  console.log(`+${(i + 1) * 10}s live:`, JSON.stringify(s));
  if (s.phase === 'roundEnd' || s.phase === 'matchEnd') { roundEnded = true; break; }
  if (!s) break;
}
console.log(roundEnded ? 'ROUND ENDED — round flow works' : 'ROUND DID NOT END in 140 sim-seconds');
if (roundEnded) {
  await advance(5);
  console.log('after round end:', JSON.stringify(await sample()));
}
await browser.close();
server.kill();
console.log(errors ? `${errors} page error(s)` : 'NO PAGE ERRORS');
process.exit(errors || !roundEnded ? 1 : 0);
