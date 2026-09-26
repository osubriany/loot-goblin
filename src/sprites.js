// Pixel-art sprites defined as strings. Each char maps to a PALETTE color; '.' is transparent.

const PALETTE = {
  k: '#1a1423', w: '#ffffff',
  G: '#6abe30', g: '#37946e',                 // goblin skin
  b: '#8f563b', B: '#5a3526',                 // leather / wood
  y: '#fbf236', Y: '#df7126',                 // gold
  S: '#cbdbfc', s: '#847e87',                 // steel
  r: '#ac3232', R: '#d95763',                 // red
  p: '#eec39a',                               // human skin
  h: '#4b692f',                               // archer hood
  v: '#76428a', V: '#3f3f74',                 // rogue cloak
  C: '#6b6880', c: '#57546a', m: '#3b3950',   // stone + mortar
  e: '#241b2f',                               // pit / empty
  D: '#5fcde4', d: '#306082',                 // gem
  f: '#2b2a3a', F: '#35334a', x: '#221f2d',   // floor
  I: '#3f6fc4', i: '#9fdcf2',                 // mage robe / ice
  n: '#e8e4d8',                               // cleric robe
  o: '#e8b83c', O: '#a0702a',                 // paladin gold armor
  L: '#9bab3c', l: '#5e6b1e',                 // chonk olive skin
};

const GOBLIN = [
  '................',
  '..g..........g..',
  '..gG........Gg..',
  '...gGGGGGGGGg...',
  '....GGGGGGGG....',
  '....GkwGGkwG....',
  '....GGGGGGGG....',
  '....GGwGGwGG....',
  '.....GGGGGG.....',
  '....bBbbbbBb....',
  '...GbbbbbbbbG...',
  '...G.bbyybb.G...',
  '.....bbbbbb.....',
  '.....gg..gg.....',
  '.....gg..gg.....',
  '....kkk..kkk....',
];

// Goblin skins are palette swaps of the base sprite (see SKINS in progress.js).
function skinRows(map) {
  return GOBLIN.map((row) => row.replace(/[GgbB]/g, (ch) => map[ch] || ch));
}

const TROPHY = [
  'y.yyyy.y',
  'y.yyyy.y',
  '.yyywyy.',
  '..yyyy..',
  '...yy...',
  '...YY...',
  '..YYYY..',
  '........',
];
const TROPHY_LOCKED = TROPHY.map((row) => row.replace(/[yw]/g, 's').replace(/Y/g, 'm'));

const KNIGHT = [
  '.......rr.......',
  '......rrr.......',
  '.....SSSSSS.....',
  '....SSSSSSSS....',
  '....SkkkkkkS....',
  '....SSSSSSSS....',
  '.....sSSSSs...S.',
  '...ssSSSSSSss.S.',
  '..sSsSSrrSSsSsS.',
  '..sSsSSrrSSs.sS.',
  '..sSsSSSSSSs..k.',
  '...s.SSSSSS.....',
  '.....ss..ss.....',
  '.....ss..ss.....',
  '.....ss..ss.....',
  '....kkk..kkk....',
];

const ARCHER = [
  '................',
  '......hhhh......',
  '.....hhhhhh.....',
  '....hhpppphh....',
  '....hpkppkph....',
  '....hppppppb....',
  '.....hppppb.b...',
  '....hhhhhhb..b..',
  '...phhhhhhbSSSb.',
  '....hhhhhhb..b..',
  '....hhhhhhhb.b..',
  '.....hhhhhhb....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '....kkk..kkk....',
];

const ROGUE = [
  '................',
  '......VVVV......',
  '.....VVVVVV.....',
  '....VVkkkkVV....',
  '....VkRkkRkV....',
  '....VVkkkkVV....',
  '.....VVVVVV.....',
  '....vvvvvvvv....',
  '...vvvvvvvvvv...',
  '..pvvvvvvvvvvSw.',
  '...vvvvvvvvvv...',
  '....vvvvvvvv....',
  '.....VV..VV.....',
  '.....VV..VV.....',
  '.....VV..VV.....',
  '....kkk..kkk....',
];

const MAGE = [
  '.......I........',
  '......III.......',
  '.....IIyII......',
  '....IIIIIII.....',
  '..IIIIIIIIIII...',
  '.....ppppp......',
  '.....pkpkp...i..',
  '.....pwwwp..iDi.',
  '....IIwwwII..b..',
  '...IIIIwIIII.b..',
  '...pIIIIIIIp.b..',
  '....IIIIIII..b..',
  '....IIIIIII.....',
  '.....II..II.....',
  '.....II..II.....',
  '....kkk..kkk....',
];

const CLERIC = [
  '................',
  '.....nnnnnn.....',
  '....nnnnnnnn....',
  '....nnppppnn....',
  '....npkppkpn....',
  '....nppppppn....',
  '.....nppppn.....',
  '....nnnnnnnn....',
  '...nnnnyynnnn...',
  '..pnnnyyyynnnp..',
  '...nnnnyynnnn...',
  '....nnnyynnnn...',
  '....nnnnnnnn....',
  '.....nn..nn.....',
  '.....nn..nn.....',
  '....kkk..kkk....',
];

const THIEF = [
  '................',
  '......BBBB......',
  '.....BBBBBB.....',
  '....BBkkkkBB....',
  '....BkwkkwkB....',
  '....BBkkkkBB....',
  '.....BBBBBB.....',
  '....bbbbbbbb.bb.',
  '...bbbbbbbbbbyyb',
  '..pbbbbbbbbbbyyb',
  '...bbbbbbbbb.bb.',
  '....bbbbbbbb....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '....kkk..kkk....',
];

const PALADIN = [
  '.......yy.......',
  '.....oooooo.....',
  '....oooooooo....',
  '....oOkkkkOo....',
  '....oooooooo....',
  '..r..oooooo..S..',
  '.rrooooooooooS..',
  '.rroOonnnnoOoS..',
  '.rroOonyynoOoS..',
  '.rroOonnnnoOoS..',
  '.rr.ooooooo.oo..',
  '..r.oOooooOo....',
  '.....oo..oo.....',
  '.....oo..oo.....',
  '.....oo..oo.....',
  '....kkk..kkk....',
];

const TRAPPER = [
  '................',
  '.....BbBbBb.....',
  '....BbBbBbBb....',
  '....pppppppp....',
  '....pkppppkp....',
  '....pppBBppp....',
  '.....pBBBBp.....',
  '....hhhhhhhh.ss.',
  '...hhbhhhhbhsSSs',
  '..phhbhhhhbhsSSs',
  '...hhbhhhhbh.ss.',
  '....hhhhhhhh....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '....kkk..kkk....',
];

const CHEST_SPRITE = [
  '................',
  '................',
  '..kkkkkkkkkkkk..',
  '.kbbbbbbbbbbbbk.',
  '.kbBBBBBBBBBBbk.',
  '.kbbbbbbbbbbbbk.',
  '.kyyyyyyyyyyyyk.',
  '.kyyyyykkyyyyyk.',
  '.kbbbbbkykbbbbk.',
  '.kbbbbbbkbbbbbk.',
  '.kbbbbbbbbbbbbk.',
  '.kyyyyyyyyyyyyk.',
  '.kbbbbbbbbbbbbk.',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
];

const BARREL_SPRITE = [
  '................',
  '....kkkkkkkk....',
  '..kkbbbbbbbbkk..',
  '.kbbbBbbbbBbbbk.',
  '.kssssssssssssk.',
  '.kbbbBbbbbBbbbk.',
  '.kbbbBbbbbBbbbk.',
  '.kbbbBbbbbBbbbk.',
  '.kbbbBbbbbBbbbk.',
  '.kbbbBbbbbBbbbk.',
  '.kbbbBbbbbBbbbk.',
  '.kssssssssssssk.',
  '.kbbbBbbbbBbbbk.',
  '..kkbbbbbbbbkk..',
  '....kkkkkkkk....',
  '................',
];

const BEARTRAP_OPEN = [
  '................',
  '................',
  '................',
  '................',
  '..S.S.S..S.S.S..',
  '.ssssss..ssssss.',
  '.s....s..s....s.',
  '.s..kkkkkkkk..s.',
  '.s..kbbyybbk..s.',
  '.s..kkkkkkkk..s.',
  '.s....s..s....s.',
  '.ssssss..ssssss.',
  '..S.S.S..S.S.S..',
  '................',
  '................',
  '................',
];

const BEARTRAP_SHUT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...ssssssssss...',
  '..sSsSsSsSsSss..',
  '..kkkkbyybkkkk..',
  '..ssSsSsSsSsSs..',
  '...ssssssssss...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const POTION = [
  '...kk...',
  '...bb...',
  '..kRRk..',
  '.kRwRRk.',
  '.kRRRRk.',
  '.kRRRrk.',
  '..kkkk..',
  '........',
];

const BOOTS = [
  '..w.....',
  '.wBBB...',
  '.wbbB...',
  '..bbB...',
  '..bbbbb.',
  '..bbbbbk',
  '..kkkkkk',
  '........',
];

const SMOKE = [
  '.....y..',
  '....y...',
  '...kk...',
  '.kkssk..',
  'kssssSk.',
  'ksssssk.',
  '.kssssk.',
  '..kkkk..',
];

const COIN_A = [
  '..kkkk..',
  '.kyyyyk.',
  'kyywyyYk',
  'kywyyyYk',
  'kyyyyyYk',
  'kyyyyYYk',
  '.kYYYYk.',
  '..kkkk..',
];

const COIN_B = [
  '...kk...',
  '..kyyk..',
  '..kwyk..',
  '..kyyk..',
  '..kyyk..',
  '..kyYk..',
  '..kYYk..',
  '...kk...',
];

const GEM = [
  '..kkkk..',
  '.kDwDdk.',
  'kDwDDddk',
  'kDDDDddk',
  '.kDDddk.',
  '..kDdk..',
  '...kk...',
  '........',
];

const HEART = [
  '.kk.kk..',
  'kRrkrrk.',
  'kRrrrrk.',
  'krrrrrk.',
  '.krrrk..',
  '..krk...',
  '...k....',
  '........',
];

const HEART_EMPTY = HEART.map((row) => row.replace(/[Rr]/g, 'e'));

const ARROW = [
  'w.....S.',
  '.bbbbbSS',
  'w.....S.',
];

const STASH = [
  '................',
  '....BBBBBBBB....',
  '..BBbbbbbbbbBB..',
  '.BbbeeeeeeeebbB.',
  'Bbbeeeeeeeeeebbb',
  'Bbeeeeyyyyeeeebb',
  'Bbeeeyywyyyeeebb',
  'BbeeyyyyyYyyeebb',
  'BbeeyyYyyyyYyebb',
  'Bbeeeyyyyyyyeebb',
  'Bbbeeeeeeeeeebbb',
  '.BbbeeeeeeeebbB.',
  '..BBbbbbbbbbBB..',
  '....BBBBBBBB....',
  '................',
  '................',
];

const BRICK_A = ['CCCCCCCmCCCCCCCm', 'CccccCCmCccccCCm', 'CccccCCmCccccCCm', 'mmmmmmmmmmmmmmmm'];
const BRICK_B = ['CCCmCCCCCCCmCCCC', 'cccmCccccCCmCccc', 'cccmCccccCCmCccc', 'mmmmmmmmmmmmmmmm'];
const WALL = [...BRICK_A, ...BRICK_B, ...BRICK_A, ...BRICK_B];

const DOOR = [
  'mmmmmmmmmmmmmmmm',
  'mBBBBBBBBBBBBBBm',
  ...Array(6).fill('mBbbbBbbbbBbbbBm'),
  'mBbbbBbbbbBbyyBm',
  ...Array(6).fill('mBbbbBbbbbBbbbBm'),
  'mBBBBBBBBBBBBBBm',
];

const FLOOR = (() => {
  const rows = [];
  for (let r = 0; r < 16; r++) {
    let row = '';
    for (let c = 0; c < 16; c++) row += r === 15 || c === 15 ? 'x' : 'f';
    rows.push(row);
  }
  for (const [c, r] of [[4, 3], [5, 3], [11, 10], [2, 12], [9, 6]]) {
    rows[r] = rows[r].slice(0, c) + 'F' + rows[r].slice(c + 1);
  }
  return rows;
})();

// Spike tiles: the floor with a 3x3 grid of holes; the "on" version has blades poking out.
function spikeTile(on) {
  const rows = [...FLOOR];
  const set = (c, r, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
  for (const r of [4, 9, 14]) {
    for (const c of [2, 7, 12]) {
      set(c, r, 'e'); set(c + 1, r, 'e');
      if (on) { set(c, r - 2, 'S'); set(c, r - 1, 'S'); set(c + 1, r - 1, 's'); }
    }
  }
  return rows;
}

// Second walk frame: spread the legs by shifting the bottom three rows outward.
function walkFrame(rows) {
  return rows.map((row, i) => {
    if (i < rows.length - 3) return row;
    const left = row.slice(0, 8), right = row.slice(8);
    return left.slice(1) + '.' + '.' + right.slice(0, 7);
  });
}

// key -> [rows, pixel size]
const SPRITES = {
  trophy: [TROPHY, 2], trophy_locked: [TROPHY_LOCKED, 2],
  knight_0: [KNIGHT, 2], knight_1: [walkFrame(KNIGHT), 2],
  archer_0: [ARCHER, 2], archer_1: [walkFrame(ARCHER), 2],
  rogue_0: [ROGUE, 2], rogue_1: [walkFrame(ROGUE), 2],
  mage_0: [MAGE, 2], mage_1: [walkFrame(MAGE), 2],
  cleric_0: [CLERIC, 2], cleric_1: [walkFrame(CLERIC), 2],
  thief_0: [THIEF, 2], thief_1: [walkFrame(THIEF), 2],
  paladin_0: [PALADIN, 3], paladin_1: [walkFrame(PALADIN), 3],
  trapper_0: [TRAPPER, 2], trapper_1: [walkFrame(TRAPPER), 2],
  chest: [CHEST_SPRITE, 2], barrel: [BARREL_SPRITE, 2],
  beartrap_open: [BEARTRAP_OPEN, 2], beartrap_shut: [BEARTRAP_SHUT, 2],
  spikes_off: [spikeTile(false), 2], spikes_on: [spikeTile(true), 2],
  chip: [['bB', 'Bb'], 2],
  potion: [POTION, 2], boots: [BOOTS, 2], smoke: [SMOKE, 2],
  coin_0: [COIN_A, 2], coin_1: [COIN_B, 2],
  gem: [GEM, 2],
  heart: [HEART, 3], heart_empty: [HEART_EMPTY, 3],
  arrow: [ARROW, 2],
  stash: [STASH, 3],
  wall: [WALL, 2], door: [DOOR, 2], floor: [FLOOR, 2],
  spark: [['yy', 'yy'], 2],
};

for (const s of SKINS) {
  const rows = skinRows(s.map);
  SPRITES[`gob_${s.id}_0`] = [rows, 2];
  SPRITES[`gob_${s.id}_1`] = [walkFrame(rows), 2];
}

function buildTextures(scene) {
  for (const [key, [rows, px]] of Object.entries(SPRITES)) {
    const width = Math.max(...rows.map((r) => r.length));
    const data = rows.map((r) => r.padEnd(width, '.'));
    for (const ch of new Set(data.join(''))) {
      if (ch !== '.' && !PALETTE[ch]) console.warn(`Sprite ${key}: unknown palette char "${ch}"`);
    }
    scene.textures.generate(key, { data, pixelWidth: px, palette: PALETTE });
  }
}
