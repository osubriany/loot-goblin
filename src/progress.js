// Persistent progress: achievements, lifetime stats and goblin skins (each skin has a perk and
// is unlocked by an achievement). Stored in localStorage; the game still works if that fails.

const ACHIEVEMENTS = [
  { id: 'first_bank', name: 'Piggy Bank', desc: 'Bank gold for the first time' },
  { id: 'haul_20', name: 'Heavy Lifter', desc: 'Bank 20+ gold in one trip' },
  { id: 'haul_40', name: 'Pack Mule', desc: 'Bank 40+ gold in one trip' },
  { id: 'combo_11', name: 'Chain Snatcher', desc: 'Reach an 11-coin combo' },
  { id: 'score_500', name: 'Hoarder', desc: 'Score 500 points in one run' },
  { id: 'score_2000', name: "Dragon's Hoard", desc: 'Score 2,000 points in one run' },
  { id: 'wave_10', name: 'Survivor', desc: 'Reach wave 10' },
  { id: 'paladin_untouched', name: 'Untouchable', desc: 'Outlast the Paladin without a hit' },
  { id: 'rob_chest_thief', name: 'Thief of Thieves', desc: 'Rob back a thief who stole a chest' },
  { id: 'spikes_5', name: 'Pincushion Party', desc: 'Stun 5 heroes with hazards in one run' },
  { id: 'streak_5', name: 'Bounty Hunter', desc: 'Reach a 5-bounty streak' },
  { id: 'chest_3', name: 'Treasure Hunter', desc: 'Open 3 chests in one run' },
  { id: 'roll_escape', name: 'Houdini', desc: 'Roll out of a bear trap' },
  { id: 'revive', name: 'No Goblin Left Behind', desc: 'Revive your partner in co-op' },
  { id: 'coop_wave10', name: 'Better Together', desc: 'Reach wave 10 in co-op' },
  { id: 'lifetime_5000', name: 'Goblin Tycoon', desc: 'Score 5,000 points across all runs' },
];

// map: goblin sprite palette swaps (G/g skin, b/B clothes). unlock: achievement id (none = free).
const SKINS = [
  { id: 'classic', name: 'Classic', map: {}, color: '#6abe30', trail: 0x6abe30, perk: '+5% shop gold from banking' },
  { id: 'frost', name: 'Frost', map: { G: 'i', g: 'I' }, color: '#9fdcf2', trail: 0x5fcde4, perk: 'Immune to ice; chills heroes that hit you' },
  { id: 'ember', name: 'Ember', map: { G: 'R', g: 'r' }, color: '#d95763', trail: 0xd95763, perk: 'Dodge rolls cost no gold', unlock: 'haul_20' },
  { id: 'shadow', name: 'Shadow', map: { G: 'v', g: 'V', b: 'm', B: 'e' }, color: '#b48cff', trail: 0x76428a, perk: 'Smoke bombs last twice as long', unlock: 'combo_11' },
  { id: 'chonk', name: 'Chonk', map: { G: 'L', g: 'l' }, color: '#9bab3c', trail: 0x9bab3c, perk: '4 hearts, but 10% slower', unlock: 'wave_10', scale: 1.12 },
  { id: 'sprinter', name: 'Sprinter', map: { G: 'D', g: 'd' }, color: '#5fcde4', trail: 0x5fcde4, perk: 'Roll cooldown 30% shorter', unlock: 'streak_5' },
  { id: 'ghost', name: 'Ghost', map: { G: 'n', g: 's', b: 'S', B: 's' }, color: '#e8e4d8', trail: 0xe8e4d8, perk: 'Revives 2x faster, longer safety after hits', unlock: 'revive' },
  { id: 'golden', name: 'Golden', map: { G: 'y', g: 'Y' }, color: '#fbf236', trail: 0xfbf236, perk: '+10% points when banking', unlock: 'score_2000' },
];

const Progress = {
  KEY: 'lootgoblin_progress',
  data: null,

  load() {
    if (this.data) return this.data;
    let d = {};
    try { d = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { /* storage unavailable */ }
    this.data = {
      achievements: d.achievements || {},
      lifetimeGold: d.lifetimeGold || 0,
      runs: d.runs || 0,
      skins: d.skins || { p1: 'classic', p2: 'frost' },
      wallet: d.wallet || 0,          // shop gold: every coin banked, kept between runs
      upgrades: d.upgrades || {},     // upgrade id -> level bought
      equipped: d.equipped || null,   // the one active ability taken into runs
    };
    return this.data;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  },

  has(id) {
    return !!this.load().achievements[id];
  },

  // True only the first time an achievement is earned.
  unlock(id) {
    if (this.has(id)) return false;
    this.data.achievements[id] = Date.now();
    this.save();
    return true;
  },

  count() {
    return ACHIEVEMENTS.filter((a) => this.has(a.id)).length;
  },

  skin(id) {
    return SKINS.find((s) => s.id === id) || SKINS[0];
  },

  skinUnlocked(skin) {
    return !skin.unlock || this.has(skin.unlock);
  },

  // The skin a player picked, falling back to the free default if it is somehow locked.
  chosenSkin(player) {
    const s = this.skin(this.load().skins[player]);
    return this.skinUnlocked(s) ? s : SKINS[player === 'p1' ? 0 : 1];
  },

  setSkin(player, id) {
    this.load().skins[player] = id;
    this.save();
  },

  addRun(banked) {
    const d = this.load();
    d.runs++;
    d.lifetimeGold += banked;
    this.save();
  },

  // ---- shop (see UPGRADES in upgrades.js)

  addGold(n) {
    this.load().wallet += n;
    this.save();
  },

  level(id) {
    return this.load().upgrades[id] || 0;
  },

  // Price of the next level, or null when maxed.
  nextCost(id) {
    const costs = UPGRADES[id].costs;
    const l = this.level(id);
    return l < costs.length ? costs[l] : null;
  },

  buy(id) {
    const cost = this.nextCost(id);
    if (cost === null || this.load().wallet < cost) return false;
    this.data.wallet -= cost;
    this.data.upgrades[id] = this.level(id) + 1;
    // The first ability bought gets equipped automatically.
    if (UPGRADES[id].kind === 'ability' && !this.data.equipped) this.data.equipped = id;
    this.save();
    return true;
  },

  equip(id) {
    if (UPGRADES[id].kind !== 'ability' || !this.level(id)) return false;
    this.load().equipped = id;
    this.save();
    return true;
  },

  // Total upgrade levels owned; drives hero scaling.
  power() {
    return Object.values(this.load().upgrades).reduce((sum, l) => sum + l, 0);
  },
};
