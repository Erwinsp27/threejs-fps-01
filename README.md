# DUSTLINE — Tactical FPS

An original Counter-Strike-style tactical first-person shooter built on
three.js 0.187.0, entered in make.fun's **threejs-fps-01** bounty
("Build the best FPS with three.js"). Single-player against nine bots, from
static files — no build step, no network requests, no audio files.

## The game

**Refinery Yard** is a 64 × 44 m industrial yard with three lanes and two
bomb sites: **Site A Refinery** in the north-east and **Site B Silo** in the
south-east. You are on **Vanguard** (you + 4 bots) attacking; the **Jackals**
(5 bots) defend.

- **Rounds:** first to 5 rounds wins, max 9. Each round opens with a 12 s
  buy phase, then 100 s of live play.
- **Objective:** plant the bomb (hold **E** for 3.5 s inside a site) and
  defend it for 35 s, defuse it (hold **E** for 5 s), or eliminate the other
  team. If time runs out with no plant, the defenders win the round.
- **Economy:** start at $800. Kills pay +$300, a round win +$3,250, a loss
  +$1,900 plus a growing streak bonus. Spend it in the buy menu (**B**).
- **Arsenal:** P9 Sidearm (free), VK-7 Carbine ($2,700), M590 Scattergun
  ($1,500), Longbow DMR ($3,100), plus Smoke ($400) and Frag ($300)
  grenades.
- **Gunplay:** headshots deal 2.5× damage. Weapons have recoil, spread and
  bloom that punish firing on the move; crouching steadies your aim and
  walking slow keeps your spread tight. Stopping to aim pays.
- **Bots:** waypoint navigation with breadth-first pathfinding, holding
  angles, rotating between sites, planting and defusing. They see with a
  110° field of view and a line-of-sight raycast (smoke blocks sight), hear
  gunfire and come to investigate, and fight in bursts with a human-like
  reaction delay.
- **Tech:** fixed 60 Hz simulation kept apart from rendering, pooled
  tracers / impacts / smoke (nothing allocated per frame in the hot loop),
  synthesized WebAudio sounds, and a full HUD (health, ammo, timer, score,
  money, buy menu, killfeed, plant/defuse bar).

## How to run

Node.js 22.18+ and a desktop browser with WebGL 2 (Chrome recommended).

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open http://localhost:8080, click **CLICK TO PLAY**, and the pointer locks
to your mouse. No install step: `game/` is plain ES modules and three.js
0.187.0 is vendored under `game/vendor/three/`.

## How to play

| Key | Action |
| --- | ------ |
| W A S D | Move |
| Mouse | Look (click the game to lock the pointer) |
| Click | Fire / throw selected grenade |
| R | Reload |
| Ctrl or C | Crouch |
| Shift | Walk slow (steadier aim) |
| 1–4 | Pistol / Carbine / Scattergun / DMR |
| 5 / 6 | Smoke / Frag grenade |
| B | Buy menu (buy phase only; 1–6 buy) |
| E (hold) | Plant the bomb / defuse the bomb |

Tips: the bomb carrier is marked on the HUD — escort them, or pick the bomb
up if they fall. Smoke a site before you push it. Hold angles instead of
wide-peeking: the bots do.

## Layout

```
main.ts                  entrypoint: copies game/ + screenshots/ to /output
                         and writes dossier.json (deterministic, two runs
                         are byte-identical)
serve.ts                 local static server (node serve.ts)
shots.json / shots.mjs   the four screenshots and the script that takes them
playtest.mjs             live headless playtest (zero page errors, bots
                         fight, rounds turn over)
validate.mjs             local gate: three.js bytes, references, screenshots,
                         dossier determinism
game/
  index.html             import map ("three" -> vendored module) + HUD
  vendor/three/          three.js 0.187.0, byte for byte from the kit
  src/
    palette.js           the one colour palette for scene and HUD
    state.js             match state: phases, rounds, economy, bomb
    world.js             Refinery Yard: map data, collision, line of sight,
                         waypoint graph + BFS
    weapons.js           the armoury: damage, spread, recoil, prices
    combat.js            shooting, grenades, damage, vision
    input.js             keyboard, mouse, pointer lock
    player.js            movement, look, recoil, buying, plant/defuse
    bots.js              bot AI: lanes, holds, rotates, plants, defuses
    audio.js             synthesized WebAudio sounds (no audio files)
    effects.js           pooled tracers, impacts, muzzle flash, smoke
    hud.js               the DOM HUD
    main.js              bootstrap: fixed 60 Hz sim + render loop
screenshots/             four real renders of the game (see shots.mjs)
vendor/
  makefun-threejs.ts     the kit's dossier library, unchanged
```

## License

MIT — see [LICENSE](LICENSE).
