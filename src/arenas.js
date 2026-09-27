// Arenas rotate every ARENA_WAVES waves (Dungeon -> Crypt -> Library -> Lava Cave -> Dungeon ...).
// Tiles are [col, row] on the 24x18 grid; row/col 0 and the last row/col are the outer walls.
// Every arena must keep the bottom-left corner (stash, player starts, stash spikes) free and all
// floor reachable; GameScene.buildArena warns in the console if a layout breaks either rule.
//
// doors:   wall tiles where heroes enter; `inner` is the floor tile they appear on.
// pillars: solid interior tiles.
// traps:   groups of tiles that cycle off -> warn -> on (see SPIKE_CYCLE). `hazard` picks the look:
//          'spikes' or 'lava' (lava stays on a bit longer).
// barrels: 'normal' (from wave BARREL.firstWave, 50% chance) or 'frequent' (always rolling).
// colors:  palette overrides for this arena's floor (f/F/x) and wall bricks (C/c/m) textures.
// pillarTexture: optional sprite for interior pillars (default: the arena's wall bricks).

const ARENA_WAVES = 5;

const ARENAS = [
  {
    id: 'dungeon',
    name: 'The Dungeon',
    subtitle: 'Where it all began',
    colors: {},
    hazard: 'spikes',
    barrels: 'normal',
    doors: [
      { tile: [12, 0], inner: [12, 1] },
      { tile: [0, 8], inner: [1, 8] },
      { tile: [23, 8], inner: [22, 8] },
    ],
    pillars: [
      [5, 4], [6, 4], [17, 4], [18, 4],
      [5, 13], [6, 13], [17, 13], [18, 13],
      [11, 8], [12, 8], [11, 9], [12, 9],
    ],
    traps: [
      [[8, 6], [9, 6]], [[14, 6], [15, 6]],
      [[8, 11], [9, 11]], [[14, 11], [15, 11]],
    ],
  },
  {
    id: 'crypt',
    name: 'The Crypt',
    subtitle: 'Mind the coffins',
    colors: { f: '#26302b', F: '#2f3d35', x: '#1c241f', C: '#6f7d6a', c: '#5a6656', m: '#3a4538' },
    hazard: 'spikes',
    barrels: 'normal',
    doors: [
      { tile: [6, 0], inner: [6, 1] },
      { tile: [17, 0], inner: [17, 1] },
      { tile: [23, 12], inner: [22, 12] },
    ],
    pillars: [
      [5, 5], [6, 5], [17, 5], [18, 5],
      [11, 4], [12, 4], [8, 8], [9, 8], [14, 8], [15, 8],
      [11, 12], [12, 12], [17, 10], [18, 10], [19, 15], [20, 15],
    ],
    traps: [
      [[11, 8], [12, 8]], [[5, 10], [6, 10]],
      [[17, 8], [18, 8]], [[8, 14], [9, 14]],
    ],
  },
  {
    id: 'library',
    name: 'The Library',
    subtitle: 'Long aisles, rolling barrels',
    colors: { f: '#3a2c24', F: '#46352b', x: '#2c211b', C: '#8a6a4a', c: '#6e523a', m: '#4a3526' },
    pillarTexture: 'shelf',
    hazard: 'spikes',
    barrels: 'frequent',
    doors: [
      { tile: [0, 4], inner: [1, 4] },
      { tile: [23, 4], inner: [22, 4] },
      { tile: [12, 0], inner: [12, 1] },
    ],
    pillars: [
      // bookshelves
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
      [15, 6], [16, 6], [17, 6], [18, 6], [19, 6],
      [3, 9], [4, 9], [5, 9], [6, 9],
      [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [14, 9],
      [17, 9], [18, 9], [19, 9], [20, 9],
      [7, 12], [8, 12], [9, 12], [10, 12],
      [14, 12], [15, 12], [16, 12], [17, 12], [18, 12],
    ],
    traps: [
      [[12, 7], [13, 7]], [[19, 11], [20, 11]], [[11, 14], [12, 14]],
    ],
  },
  {
    id: 'lava',
    name: 'The Lava Cave',
    subtitle: 'The floor is (sometimes) lava',
    colors: { f: '#2a1d1d', F: '#382424', x: '#1e1414', C: '#6a4a44', c: '#553a35', m: '#3a2624' },
    hazard: 'lava',
    barrels: 'normal',
    doors: [
      { tile: [5, 0], inner: [5, 1] },
      { tile: [18, 0], inner: [18, 1] },
      { tile: [23, 9], inner: [22, 9] },
    ],
    pillars: [
      [9, 3], [10, 3], [9, 4],
      [15, 5], [16, 5], [16, 6],
      [6, 8], [7, 8], [7, 9],
      [12, 9], [13, 9], [12, 10],
      [18, 12], [19, 12], [19, 13],
      [10, 14], [11, 14],
    ],
    traps: [
      [[11, 6], [12, 6], [13, 6]], [[3, 5], [4, 5], [5, 5]],
      [[15, 15], [16, 15], [17, 15]], [[20, 6], [21, 6]], [[8, 11], [9, 11], [10, 11]],
    ],
  },
];

// Which arena a wave is played in.
function arenaForWave(wave) {
  return ARENAS[Math.floor((wave - 1) / ARENA_WAVES) % ARENAS.length];
}
