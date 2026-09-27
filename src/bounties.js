// Bounty board: one random goal per wave. Finishing it gives a heart to the most hurt goblin,
// or bonus points if everyone is at full health, and grows the streak multiplier on banking.
// Missing or failing one resets the streak. Progress is shared in co-op.
//
// Game code reports what happens through Bounties.event(scene, type, amount):
//   coin, bank (amount = gold banked), combo (amount = chain length), hazardStun, chest, rob, hit.
// mode: 'sum' adds the amount, 'count' adds 1 per event, 'max' keeps the best single amount.

const BOUNTY_DEFS = {
  coins: { minWave: 1, text: (n) => `Grab ${n} coins`, target: (w) => 10 + w * 2, event: 'coin', mode: 'count' },
  bigbank: { minWave: 1, text: (n) => `Bank ${n}+ gold in one trip`, target: (w) => Math.min(25, 8 + w), event: 'bank', mode: 'max' },
  banks: { minWave: 1, text: (n) => `Bank gold ${n} times`, target: () => 3, event: 'bank', mode: 'count' },
  combo: { minWave: 2, text: (n) => `Chain a ${n}-coin combo`, target: (w) => Math.min(10, 4 + Math.floor(w / 2)), event: 'combo', mode: 'max' },
  stun: { minWave: 2, text: (n) => `Stun ${n} heroes on spikes/barrels`, target: () => 2, event: 'hazardStun', mode: 'count' },
  untouched: { minWave: 2, text: () => 'Finish the wave without a hit', target: () => 1, event: null },
  chest: {
    minWave: 3, text: () => 'Open a treasure chest', target: () => 1, event: 'chest', mode: 'count',
    setup: (scene) => scene.spawnChest(),
  },
  rob: {
    minWave: 4, text: () => "Rob back a thief's loot", target: () => 1, event: 'rob', mode: 'count',
    setup: (scene) => scene.time.delayedCall(1200, () => scene.spawnEnemy('thief')),
  },
};

const Bounties = {
  start(scene) {
    const wave = scene.stats.wave;
    const lastId = scene.bounty && scene.bounty.id;
    const ids = Object.keys(BOUNTY_DEFS).filter((id) => BOUNTY_DEFS[id].minWave <= wave && id !== lastId);
    const id = Phaser.Utils.Array.GetRandom(ids);
    const def = BOUNTY_DEFS[id];
    scene.bounty = { id, def, target: def.target(wave), progress: 0, done: false, failed: false, endsAt: scene.clock + WAVE_MS };
    if (def.setup) def.setup(scene);
    Sfx.play('newbounty');
    if (scene.bountyText) scene.tweens.add({ targets: [scene.bountyLabel, scene.bountyText], scale: 1.25, duration: 150, yoyo: true, repeat: 1 });
  },

  // "Bounty Reroll" perk: swap the current bounty once per wave, keeping the same deadline.
  canReroll(scene) {
    const b = scene.bounty;
    return scene.upg.reroll > 0 && b && !b.done && !b.failed && scene.rerolledWave !== scene.stats.wave;
  },

  reroll(scene) {
    if (!this.canReroll(scene)) return;
    const endsAt = scene.bounty.endsAt;
    scene.rerolledWave = scene.stats.wave;
    this.start(scene);
    scene.bounty.endsAt = endsAt;
    scene.floatText(W / 2, HUD_H + 70, 'BOUNTY REROLLED', '#ff9f43', 18, 1200);
  },

  event(scene, type, amount = 1) {
    const b = scene.bounty;
    if (!b || b.done || b.failed) return;
    if (type === 'hit' && b.id === 'untouched') {
      b.failed = true;
      this.breakStreak(scene, 'BOUNTY FAILED');
      return;
    }
    if (b.def.event !== type) return;
    if (b.def.mode === 'max') b.progress = Math.max(b.progress, amount);
    else if (b.def.mode === 'count') b.progress += 1;
    else b.progress += amount;
    if (b.progress >= b.target) this.complete(scene);
  },

  // Called as a wave ends, before the next bounty is drawn.
  finish(scene) {
    const b = scene.bounty;
    if (!b || b.done) return;
    if (b.id === 'untouched' && !b.failed) {
      b.progress = 1;
      this.complete(scene);
    } else if (!b.failed) {
      this.breakStreak(scene, 'BOUNTY MISSED');
    }
  },

  // Consecutive completed bounties boost banked points (see GameScene.bank).
  streakMult(scene) {
    return 1 + STREAK.step * Math.min(scene.stats.streak, STREAK.max);
  },

  breakStreak(scene, reason) {
    const lost = scene.stats.streak > 0;
    scene.stats.streak = 0;
    scene.floatText(W / 2, HUD_H + 70, lost ? `${reason}  (streak lost)` : reason, '#d95763', 18, 1400);
  },

  complete(scene) {
    const b = scene.bounty;
    b.done = true;
    const s = scene.stats;
    s.bounties++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (s.streak >= 5) scene.achieve('streak_5');
    const hurt = scene.goblins
      .filter((g) => !g.down && g.hearts < g.maxHearts)
      .sort((a, c) => a.hearts - c.hearts)[0];
    let reward;
    if (hurt) {
      hurt.hearts++;
      scene.popHeart(hurt, hurt.hearts - 1);
      reward = scene.coop ? `+1 HEART for ${hurt.label}` : '+1 HEART';
    } else {
      const pts = 15 * scene.stats.wave;
      scene.stats.banked += pts;
      reward = `+${pts} POINTS`;
    }
    const streak = s.streak > 1 ? `  STREAK ${s.streak}` : '';
    scene.floatText(W / 2, HUD_H + 70, `BOUNTY COMPLETE!  ${reward}${streak}`, '#6abe30', 20, 1800);
    Sfx.play('bounty');
  },
};
