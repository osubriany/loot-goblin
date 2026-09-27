# Loot Goblin

A 2D pixel-art arcade game built with [Phaser 3](https://phaser.io). You're a goblin grabbing gold while adventurers chase you. Gold is heavy: the more you carry, the slower you run. Bank it at your stash before the heroes catch you.

## Running it

There's no build step. Serve the folder with any static web server and open it in a browser:

```bash
py -m http.server 8765
```

Then go to http://localhost:8765/. Add `?debug=1` to the URL for test keys: 1–7 and T spawn heroes, 8–0 spawn power-ups, C spawns a chest, B rolls a barrel, G adds 10 gold, V jumps to the next arena.

## Controls

| | Move | Dodge roll | Ability |
|---|---|---|---|
| Solo | WASD or arrows | Shift or Space | E or Q |
| Co-op P1 | WASD | Left Shift or Space | E |
| Co-op P2 | Arrows | Right Shift or Enter | / or Right Ctrl |

Gamepads work too: the stick or d-pad moves, A/B/X/RB rolls, Y uses your ability, Back rerolls the bounty, and Start pauses. P pauses, M mutes, N toggles music, and R rerolls the bounty (with the perk). On the menu, B opens the shop and T opens the trophy room.

## Shop

Every coin you bank also goes into your gold, which carries over between runs. Spend it in the shop, reached from the menu or the game-over screen:

- **Attributes** (multi-level, each level costs more): run speed, max hearts, weight tolerance, roll cooldown, loot kept when hit, coin pickup radius, bank bonus, post-hit safety, and luck.
- **Abilities** (equip one per run): Shiv (kill a hero), Caltrops, Coin Magnet, Smoke Pouch, and Decoy Coin.
- **Perks**: Second Wind, Head Start, Bounty Reroll, and Stash Spikes.

Heroes scale with your total upgrade level ("hero threat"): they get faster, attack sooner and arrive in bigger numbers.

## Features

- Solo and 2-player co-op, with revives
- 4 rotating arenas (Dungeon, Crypt, Library, Lava Cave), each with its own layout and hazards, changing every 5 waves
- 9 hero types, including a Paladin boss every 10 waves
- Power-ups, treasure chests, spike traps, rolling barrels and bear traps
- Combo, haul and bounty-streak score multipliers
- A bounty board each wave
- A roguelite shop with persistent gold, upgrades and abilities
- 16 achievements, and 8 unlockable skins with perks
- A chiptune soundtrack

All art and audio are generated in code: sprites are pixel strings in `src/sprites.js`, and music and sound effects are synthesized with WebAudio.
