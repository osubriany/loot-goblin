// Shop catalog. Gold banked in runs goes to a persistent wallet (Progress.wallet) that buys these.
// Each level costs more than the last. kind: 'attr' (passive), 'ability' (one equipped per run,
// used with E / Y), 'perk' (one-off run bonuses). desc(level) describes the effect at that level.

const ABILITY_STATS = {
  shiv: { cooldown: [12000, 9000, 6000] },
  caltrops: { cooldown: [10000, 8000, 6000], duration: [5000, 6000, 7000] },
  coinmagnet: { cooldown: [9000, 7000, 5000], radius: [150, 200, 260] },
  smokepouch: { cooldown: [16000, 11000] },
  decoy: { cooldown: [12000, 8000], duration: [3000, 5000] },
};

const secs = (ms) => `${ms / 1000}s`;

const UPGRADES = {
  speed: { kind: 'attr', name: 'Nimble Feet', costs: [60, 120, 220, 380, 600], desc: (l) => `+${5 * l}% run speed` },
  hearts: { kind: 'attr', name: 'Tough Hide', costs: [150, 400, 900], desc: (l) => `+${l} max heart${l > 1 ? 's' : ''}` },
  back: { kind: 'attr', name: 'Strong Back', costs: [80, 180, 350, 600], desc: (l) => `gold slows you ${12 * l}% less` },
  roll: { kind: 'attr', name: 'Quick Roll', costs: [70, 160, 320], desc: (l) => `-${15 * l}% roll cooldown` },
  pockets: { kind: 'attr', name: 'Deep Pockets', costs: [100, 250, 500], desc: (l) => `drop ${50 - 10 * l}% of loot when hit` },
  magnet: { kind: 'attr', name: 'Magnet Paws', costs: [90, 200, 400], desc: (l) => `grab coins from ${18 + 12 * l}px away` },
  greed: { kind: 'attr', name: 'Greedy Stash', costs: [120, 250, 450, 750, 1200], desc: (l) => `+${5 * l}% bank points` },
  iron: { kind: 'attr', name: 'Iron Will', costs: [100, 300], desc: (l) => `+${(0.4 * l).toFixed(1)}s safety after hits` },
  luck: { kind: 'attr', name: 'Lucky Charm', costs: [150, 350, 700], desc: (l) => `more gems (+${4 * l}%) and power-ups` },

  shiv: {
    kind: 'ability', name: 'Shiv', costs: [300, 500, 900],
    desc: (l) => `kill a hero, ${secs(ABILITY_STATS.shiv.cooldown[l - 1])} cd${l >= 3 ? ', stuns Paladin' : ''}`,
  },
  caltrops: {
    kind: 'ability', name: 'Caltrops', costs: [200, 350, 600],
    desc: (l) => `${secs(ABILITY_STATS.caltrops.duration[l - 1])} stun patch, ${secs(ABILITY_STATS.caltrops.cooldown[l - 1])} cd`,
  },
  coinmagnet: {
    kind: 'ability', name: 'Coin Magnet', costs: [150, 300, 500],
    desc: (l) => `pull coins in ${ABILITY_STATS.coinmagnet.radius[l - 1]}px, ${secs(ABILITY_STATS.coinmagnet.cooldown[l - 1])} cd`,
  },
  smokepouch: {
    kind: 'ability', name: 'Smoke Pouch', costs: [250, 450],
    desc: (l) => `smoke bomb on demand, ${secs(ABILITY_STATS.smokepouch.cooldown[l - 1])} cd`,
  },
  decoy: {
    kind: 'ability', name: 'Decoy Coin', costs: [180, 350],
    desc: (l) => `${secs(ABILITY_STATS.decoy.duration[l - 1])} lure for heroes, ${secs(ABILITY_STATS.decoy.cooldown[l - 1])} cd`,
  },

  secondwind: { kind: 'perk', name: 'Second Wind', costs: [400, 1000], desc: (l) => `get back up ${l}x per run` },
  headstart: { kind: 'perk', name: 'Head Start', costs: [150], desc: () => 'start runs with Feather Boots' },
  reroll: { kind: 'perk', name: 'Bounty Reroll', costs: [200], desc: () => 'reroll a bounty once a wave (R)' },
  stashspikes: { kind: 'perk', name: 'Stash Spikes', costs: [350], desc: () => 'spikes guard your stash' },
};

// Heroes scale with your total upgrade levels ("hero threat"), capped so maxed goblins stay beatable.
const THREAT = {
  cap: 40,
  speedPer: 0.008,     // +0.8% hero speed per level
  cooldownPer: 0.006,  // -0.6% hero attack cooldowns per level
};

function threatLevel() {
  return Math.min(Progress.power(), THREAT.cap);
}
