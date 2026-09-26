# Loot Goblin

A 2D pixel-art arcade game built with [Phaser 3](https://phaser.io). You're a goblin grabbing gold while adventurers chase you. Gold is heavy: the more you carry, the slower you run. Bank it at your stash before the heroes catch you.

## Running it

There's no build step. Serve the folder with any static web server and open it in a browser:

```bash
py -m http.server 8765
```

Then go to http://localhost:8765/. Add `?debug=1` to the URL for test keys: 1–7 and T spawn heroes, 8–0 spawn power-ups, C spawns a chest, B rolls a barrel, G adds 10 gold.

## Controls

| | Move | Dodge roll |
|---|---|---|
| Solo | WASD or arrows | Shift or Space |
| Co-op P1 | WASD | Left Shift or Space |
| Co-op P2 | Arrows | Right Shift or Enter |

Gamepads work too: the stick or d-pad moves, A/B/X/RB rolls, and Start pauses. P pauses, M mutes, N toggles music, and T on the menu opens the trophy room.

## Features

- Solo and 2-player co-op, with revives
- 9 hero types, including a Paladin boss every 10 waves
- Power-ups, treasure chests, spike traps, rolling barrels and bear traps
- Combo, haul and bounty-streak score multipliers
- A bounty board each wave
- 16 achievements, and 8 unlockable skins with perks
- A chiptune soundtrack

All art and audio are generated in code: sprites are pixel strings in `src/sprites.js`, and music and sound effects are synthesized with WebAudio.
