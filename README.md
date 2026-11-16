# DUSTLINE — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 from static files with no build step and no
network request. Two teams fight short rounds in the Refinery Yard: Vanguard
attacks and plants the charge at Site A (Refinery) or Site B (Silo); Jackals
defend. First to 5 rounds takes the match.

## What is in the game

- **Complete FPS**: first-person view, mouse look, WASD movement with
  acceleration, crouching, AABB collision with the map, a weapon that fires,
  reloads and runs out of ammunition, and a HUD with health, ammunition, the
  round timer, the score, money and the kill feed.
- **Gunplay where accuracy counts**: hitboxes with headshots (2.5x), recoil
  and spread that punish firing on the move, bloom per shot, and a crouch
  bonus — stopping to aim pays.
- **Tactics**: a bomb to plant and defuse, money earned each round and spent
  in a buy menu, four weapons (P9 Sidearm, VK-9 Hornet SMG, AR-7 Longshot
  rifle, LW-50 Deadeye sniper) and two grenades (Popper frag, Veil smoke).
  Bots follow waypoint routes through the map, hold angles, react to what
  they see and hear, rotate on the plant, and plant / defuse the charge.
- **The map**: an original three-lane yard (Pipes north, Mid, Alley south)
  with crates, tanks, a silo and sightlines worth playing, in a dusk-desert
  palette (sand, rust, teal) with a low sun and warm haze.
- **Sound**: every effect is synthesized with WebAudio — no audio files.
- **Code**: one module per job, a fixed 60 Hz simulation kept apart from
  rendering, pooled tracers / particles / smoke (no allocations in hot loops),
  and all mutable state in one object (`state.js`).

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome, click **CLICK TO DEPLOY**,
and play. `B` opens the buy menu, `E` plants the charge at a site,
`G` / `H` throw frag / smoke, `R` reloads, `Ctrl` crouches, `M` mutes.

## Screenshots

The four screenshots in `screenshots/` are real renders of this game's own
code, staged deterministically with `?shot=start|fight|site|end&seed=1`
(see `shots.json`): the round opening, a mid-lane firefight, a planted charge
at Site B under smoke, and a round won.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `dossier.json` with the vendored `makefun-threejs.ts`
library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.
