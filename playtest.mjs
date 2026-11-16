// playtest.mjs — a live headless playtest of DUSTLINE.
// Loads the game in test mode (3 s buy, 25 s live rounds), fires the
// player's weapon once with a synthetic mouse press, then waits for round 1
// to end and round 2 to start. Passes only with zero page errors, shots
// fired by the bots, and a round turnover. Run: node playtest.mjs

import { CDP, startGameServer, stopServer, sleep } from './cdp.mjs';

const PORT = 8137;
const BASE = `http://127.0.0.1:${PORT}/index.html?test=1`;

const server = await startGameServer(PORT);
const cdp = new CDP(9222);
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

let exitCode = 0;
try {
  await cdp.launch('about:blank');
  await cdp.newTarget(BASE);
  await cdp.waitFor('window.__DUSTLINE !== undefined', 30000);
  await cdp.waitFor('document.querySelector("#game canvas") !== null', 10000);

  // Wait for the live phase, then fire the player's weapon once.
  await cdp.waitFor('window.__DUSTLINE.phase === "live"', 20000);
  const shotsBefore = await cdp.evaluate('window.__DUSTLINE.shots');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  await sleep(800);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
  const shotsAfterClick = await cdp.evaluate('window.__DUSTLINE.shots');
  check('player weapon fires on click', shotsAfterClick > shotsBefore, `shots ${shotsBefore} -> ${shotsAfterClick}`);

  // The round must end and the next one must start on its own.
  await cdp.waitFor('window.__DUSTLINE.round >= 2', 90000);
  const end = await cdp.evaluate(
    '(() => ({ phase: window.__DUSTLINE.phase, round: window.__DUSTLINE.round, shots: window.__DUSTLINE.shots, score: window.__DUSTLINE.score }))()',
  );
  check('round 1 ends and round 2 starts', end.round >= 2, `round ${end.round}, phase ${end.phase}`);
  check('bots fight (shots fired)', end.shots > 10, `${end.shots} shots total`);
  check('score recorded', end.score.V + end.score.J >= 1, `V ${end.score.V} — J ${end.score.J}`);
  check('zero page errors', cdp.errors.length === 0, cdp.errors.join(' | ') || 'none');
} catch (err) {
  check('playtest completed', false, String(err && err.message ? err.message : err));
} finally {
  await cdp.close();
  stopServer(server);
}

exitCode = results.every((r) => r.ok) ? 0 : 1;
console.log(exitCode === 0 ? 'playtest: ALL PASS' : 'playtest: FAILED');
process.exit(exitCode);
