// Shared constants and helpers.

const TILE = 32;
const COLS = 24;
const ROWS = 18;
const HUD_H = 40;                // top bar (P1 + score)
const FOOT_H = 40;               // bottom bar (P2 in co-op + bounty board)
const ARENA_H = ROWS * TILE;
const W = COLS * TILE;           // 768
const H = HUD_H + ARENA_H + FOOT_H; // 656

const BASE_SPEED = 210;
const MIN_SPEED = 70;
const WEIGHT_FACTOR = 0.08;      // speed = BASE / (1 + carried * WEIGHT_FACTOR)
const WAVE_MS = 20000;

// Doors are wall tiles where adventurers enter; `inner` is the floor tile they appear on.
const DOORS = [
  { tile: [12, 0], inner: [12, 1] },
  { tile: [0, 8], inner: [1, 8] },
  { tile: [23, 8], inner: [22, 8] },
];

const PILLARS = [
  [5, 4], [6, 4], [17, 4], [18, 4],
  [5, 13], [6, 13], [17, 13], [18, 13],
  [11, 8], [12, 8], [11, 9], [12, 9],
];

const STASH_TILE = [2, 15];
const PLAYER_STARTS = [[4, 13], [4, 11]]; // P1, P2

// Movement keys are Phaser key names; roll keys are KeyboardEvent.code values
// (so left and right Shift can belong to different players).
const CONTROLS = {
  solo: {
    left: ['A', 'LEFT'], right: ['D', 'RIGHT'], up: ['W', 'UP'], down: ['S', 'DOWN'],
    roll: ['ShiftLeft', 'ShiftRight', 'Space'], ability: ['KeyE', 'KeyQ'], abilityKey: 'E',
  },
  p1: {
    left: ['A'], right: ['D'], up: ['W'], down: ['S'],
    roll: ['ShiftLeft', 'Space'], ability: ['KeyE'], abilityKey: 'E',
  },
  p2: {
    left: ['LEFT'], right: ['RIGHT'], up: ['UP'], down: ['DOWN'],
    roll: ['ShiftRight', 'Enter', 'NumpadEnter'], ability: ['Slash', 'ControlRight', 'Numpad0'], abilityKey: '/',
  },
};

// "Stash Spikes" perk: a ring of spike tiles near the stash that only hurt heroes.
const STASH_SPIKES = [[1, 13], [2, 13], [3, 13], [4, 13], [4, 14], [4, 15], [4, 16]];

// Co-op: stand next to a downed partner this long to bring them back.
const REVIVE = { time: 2000, hearts: 1, range: 34 };

// Consecutive bounties build a streak; each step adds 10% to banked points, up to 5 steps.
const STREAK = { step: 0.1, max: 5 };

// Standard-mapping button indices. Gamepad 1 drives P1, gamepad 2 drives P2 (keyboard still works).
// In game: Y uses the equipped ability, Back/Select rerolls the bounty. In menus: X opens the shop.
const PAD = {
  deadzone: 0.3, roll: [0, 1, 2, 5], ability: 3, reroll: 8, pause: 9,
  up: 12, down: 13, left: 14, right: 15, back: 1, trophies: 3, shop: 2,
};

// minWave: first wave the kind can appear; intro: banner shown the first time it does.
const ENEMY_TYPES = {
  knight: { speed: 80, minWave: 1 },
  archer: { speed: 70, minWave: 3, intro: 'An ARCHER joins the hunt!' },
  thief: { speed: 95, minWave: 4, intro: 'A THIEF is after the gold!' },
  rogue: { speed: 105, minWave: 5, intro: 'A ROGUE joins the hunt!' },
  trapper: { speed: 75, minWave: 6, intro: 'A TRAPPER sets bear traps!' },
  mage: { speed: 65, minWave: 7, intro: 'A MAGE conjures ice!' },
  cleric: { speed: 75, minWave: 9, intro: 'A CLERIC blesses the heroes!' },
  paladin: { speed: 65, boss: true },
};

const BOSS_EVERY = 10;           // every Nth wave is a boss wave
const BOSS_DURATION = 30000;     // survive this long for the bonus
const ICE_RADIUS = 32;

const ROLL = { speed: 480, duration: 180, cooldown: 1500, iframes: 100 };

const CHEST = { firstWave: 3, every: 40000, lifetime: 15000, openTime: 600, baseValue: 10 };

// Coins grabbed within `window` ms of each other chain; the best chain of a trip boosts the bank.
const COMBO = { window: 1500, step: 0.05, maxMult: 1.5 };

// Spike traps: each group of tiles cycles off -> warn -> on, staggered per group.
const SPIKE_GROUPS = [
  [[8, 6], [9, 6]], [[14, 6], [15, 6]],
  [[8, 11], [9, 11]], [[14, 11], [15, 11]],
];
const SPIKE_CYCLE = { off: 2500, warn: 500, on: 1500 };

const BARREL = { firstWave: 6, every: 20000, chance: 0.5, speed: 240, telegraph: 1000, minLane: 8 };

const TRAP = { every: 5000, perTrapper: 4, max: 8, lifetime: 20000, root: 1500 };

const POWERUPS = {
  potion: { label: 'HEART +1' },
  boots: { label: 'FEATHER BOOTS!', duration: 8000 },
  smoke: { label: 'SMOKE BOMB!', duration: 4000 },
};

function tileCenter(c, r) {
  return { x: c * TILE + TILE / 2, y: HUD_H + r * TILE + TILE / 2 };
}

function worldToTile(x, y) {
  return { c: Math.floor(x / TILE), r: Math.floor((y - HUD_H) / TILE) };
}

function textStyle(size, color) {
  return {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: '#000000',
    strokeThickness: Math.max(3, Math.round(size / 6)),
  };
}

// Best scores are kept separately for solo and co-op; the menu also remembers the last mode.
const Store = {
  key(coop) { return coop ? 'lootgoblin_best_coop' : 'lootgoblin_best'; },
  getBest(coop = false) {
    try { return parseInt(localStorage.getItem(this.key(coop)), 10) || 0; } catch (e) { return 0; }
  },
  setBest(v, coop = false) {
    try { localStorage.setItem(this.key(coop), String(v)); } catch (e) { /* storage unavailable */ }
  },
  getCoop() {
    try { return localStorage.getItem('lootgoblin_mode') === 'coop'; } catch (e) { return false; }
  },
  setCoop(coop) {
    try { localStorage.setItem('lootgoblin_mode', coop ? 'coop' : 'solo'); } catch (e) { /* storage unavailable */ }
  },
};
