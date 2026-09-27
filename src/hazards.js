// Arena hazards: cycling spike tiles, rolling barrels and the Trapper's bear traps.
// Spikes and barrels hurt the goblin and stun heroes, so heroes can be lured into them.
// All timing uses scene.clock, so everything freezes while paused.

const FRIENDLY_TINT = 0x9be08a;

const Hazards = {
  init(scene) {
    const makeGroup = (tiles, delay, friendly = false) => ({
      delay,
      friendly, // friendly spikes (Stash Spikes perk) only hurt heroes and glow green
      state: 'off',
      tiles: tiles.map(([c, r]) => {
        const { x, y } = tileCenter(c, r);
        const img = scene.add.image(x, y, 'spikes_off').setDepth(1);
        if (friendly) img.setTint(FRIENDLY_TINT);
        return { c, r, x, y, img };
      }),
    });
    // Staggered so the groups don't fire together.
    scene.spikeGroups = SPIKE_GROUPS.map((tiles, i) => makeGroup(tiles, 1500 + i * 1125));
    if (scene.upg.stashspikes) scene.spikeGroups.push(makeGroup(STASH_SPIKES, 800, true));

    scene.traps = [];
    scene.barrels = scene.physics.add.group();
    scene.physics.add.collider(scene.barrels, scene.walls, (b) => Hazards.breakBarrel(scene, b));
    for (const g of scene.goblins) {
      scene.physics.add.overlap(g, scene.barrels, (_g, b) => scene.hurtPlayer(g, b));
    }
    scene.physics.add.overlap(scene.enemies, scene.barrels, (e, b) => {
      if (b.hits.has(e)) return;
      b.hits.add(e);
      scene.stunEnemy(e, 1500, 'hazard');
    });
    scene.time.addEvent({ delay: BARREL.every, loop: true, callback: () => Hazards.trySpawnBarrel(scene) });

    scene.chips = scene.add.particles(0, 0, 'chip', {
      speed: { min: 80, max: 220 },
      lifespan: 500,
      scale: { start: 1.2, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 300,
      emitting: false,
    }).setDepth(900);
  },

  update(scene) {
    this.updateSpikes(scene);
    this.updateTraps(scene);
    for (const b of scene.barrels.getChildren()) {
      b.angle += (b.dir[0] + b.dir[1]) * 10;
      b.setDepth(b.y);
    }
  },

  // ---------------------------------------------------------------- spikes

  spikeState(scene, group) {
    const t = scene.clock - group.delay;
    if (t < 0) return 'off';
    const p = t % (SPIKE_CYCLE.off + SPIKE_CYCLE.warn + SPIKE_CYCLE.on);
    if (p < SPIKE_CYCLE.off) return 'off';
    return p < SPIKE_CYCLE.off + SPIKE_CYCLE.warn ? 'warn' : 'on';
  },

  updateSpikes(scene) {
    const alive = scene.goblins.filter((g) => !g.down);
    for (const grp of scene.spikeGroups) {
      const state = this.spikeState(scene, grp);
      const baseTint = (img) => (grp.friendly ? img.setTint(FRIENDLY_TINT) : img.clearTint());
      if (state !== grp.state) {
        grp.state = state;
        grp.tiles.forEach((t) => baseTint(t.img.setTexture(state === 'on' ? 'spikes_on' : 'spikes_off')));
        const near = alive.some((g) => Phaser.Math.Distance.Between(g.x, g.y, grp.tiles[0].x, grp.tiles[0].y) < 220);
        if (state === 'on' && near) Sfx.play('spikes');
      }
      if (state === 'warn') {
        const flash = Math.floor(scene.clock / 100) % 2 === 0;
        grp.tiles.forEach((t) => (flash ? t.img.setTint(grp.friendly ? 0x6abe30 : 0xff7070) : baseTint(t.img)));
      }
      if (state !== 'on') continue;

      const tileAt = (x, y) => {
        const tt = worldToTile(x, y);
        return grp.tiles.find((t) => t.c === tt.c && t.r === tt.r);
      };
      if (!grp.friendly) {
        for (const g of alive) {
          const hit = tileAt(g.body.center.x, g.body.center.y);
          if (hit) scene.hurtPlayer(g, hit);
        }
      }
      for (const e of scene.enemies.getChildren()) {
        if (tileAt(e.body.center.x, e.body.center.y)) scene.stunEnemy(e, 1500, 'hazard');
      }
    }
  },

  // ---------------------------------------------------------------- barrels

  trySpawnBarrel(scene, force = false) {
    if (scene.over) return;
    if (!force && (scene.stats.wave < BARREL.firstWave || Math.random() > BARREL.chance)) return;
    const lane = this.pickLane(scene);
    if (!lane) return;

    // Telegraph the lane before the barrel shows up.
    const g = scene.add.graphics().setDepth(2);
    g.fillStyle(0xd95763, 0.22);
    for (const [c, r] of lane.tiles) {
      const { x, y } = tileCenter(c, r);
      g.fillRect(x - TILE / 2, y - TILE / 2, TILE, TILE);
    }
    scene.tweens.add({ targets: g, alpha: 0.4, duration: 120, yoyo: true, repeat: -1 });
    Sfx.play('barrel');

    scene.time.delayedCall(BARREL.telegraph, () => {
      scene.tweens.killTweensOf(g);
      g.destroy();
      if (scene.over) return;
      const { x, y } = tileCenter(...lane.tiles[0]);
      const b = scene.barrels.create(x, y, 'barrel').setDepth(y);
      b.body.setCircle(11, 5, 5);
      b.hits = new Set();
      b.dir = lane.dir;
      b.body.setVelocity(lane.dir[0] * BARREL.speed, lane.dir[1] * BARREL.speed);
    });
  },

  // A straight run of floor tiles starting next to an outer wall.
  pickLane(scene) {
    const B = Phaser.Math.Between;
    for (let i = 0; i < 30; i++) {
      const side = B(0, 3);
      let c, r, dir;
      if (side === 0) { c = 1; r = B(1, ROWS - 2); dir = [1, 0]; }
      else if (side === 1) { c = COLS - 2; r = B(1, ROWS - 2); dir = [-1, 0]; }
      else if (side === 2) { r = 1; c = B(1, COLS - 2); dir = [0, 1]; }
      else { r = ROWS - 2; c = B(1, COLS - 2); dir = [0, -1]; }

      const tiles = [];
      while (scene.isFree(c, r)) { tiles.push([c, r]); c += dir[0]; r += dir[1]; }
      if (tiles.length < BARREL.minLane) continue;
      const nearStash = tiles.some(([tc, tr]) => {
        const p = tileCenter(tc, tr);
        return Phaser.Math.Distance.Between(p.x, p.y, scene.stash.x, scene.stash.y) < 40;
      });
      if (!nearStash) return { tiles, dir };
    }
    return null;
  },

  breakBarrel(scene, b) {
    if (!b.active) return;
    const at = { x: b.x - b.dir[0] * 10, y: b.y - b.dir[1] * 10 };
    Sfx.play('crash');
    scene.cameras.main.shake(100, 0.004);
    scene.chips.explode(14, b.x, b.y);
    b.destroy();
    scene.scatterCoins(2, at);
  },

  // ---------------------------------------------------------------- bear traps

  canPlace(scene, owner) {
    return scene.traps.length < TRAP.max && (owner.trapCount || 0) < TRAP.perTrapper;
  },

  placeTrap(scene, owner, x, y) {
    if (!this.canPlace(scene, owner)) return false;
    const t = worldToTile(x, y);
    if (!scene.isFree(t.c, t.r)) return false;
    if (Phaser.Math.Distance.Between(x, y, scene.stash.x, scene.stash.y) < 60) return false;
    if (scene.traps.some((o) => Phaser.Math.Distance.Between(o.x, o.y, x, y) < 24)) return false;

    const img = scene.add.image(x, y, 'beartrap_open').setDepth(3).setScale(0);
    scene.tweens.add({ targets: img, scale: 1, duration: 200, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: img, alpha: 0.6, delay: 1000, duration: 400 });
    scene.traps.push({ x, y, img, owner, armed: true, expireAt: scene.clock + TRAP.lifetime });
    owner.trapCount = (owner.trapCount || 0) + 1;
    Sfx.play('trapset');
    return true;
  },

  updateTraps(scene) {
    scene.traps = scene.traps.filter((t) => {
      if (scene.clock >= t.expireAt) {
        this.removeTrap(scene, t);
        return false;
      }
      if (!t.armed || scene.over) return true;
      // Rolling hops over traps.
      const victim = scene.goblins.find((g) => !g.down && scene.clock >= g.rollUntil &&
        Phaser.Math.Distance.Between(g.body.center.x, g.body.center.y, t.x, t.y) < 12);
      if (victim) {
        t.armed = false;
        t.expireAt = scene.clock + 1000;
        scene.tweens.killTweensOf(t.img);
        t.img.setTexture('beartrap_shut').setAlpha(1).setScale(1);
        scene.rootPlayer(victim, t);
      }
      return true;
    });
  },

  removeTrap(scene, t) {
    t.owner.trapCount--;
    scene.tweens.killTweensOf(t.img);
    scene.tweens.add({ targets: t.img, alpha: 0, duration: 250, onComplete: () => t.img.destroy() });
  },
};
