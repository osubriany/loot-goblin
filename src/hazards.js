// Arena hazards: cycling spike/lava tiles, rolling barrels and the Trapper's bear traps.
// Spikes, lava and barrels hurt the goblin and stun heroes, so heroes can be lured into them.
// All timing uses scene.clock, so everything freezes while paused.

const FRIENDLY_TINT = 0x9be08a;

// Per-look trap settings. Lava erupts a little longer than spikes. Textures are per arena
// (spikes_<arena>_off etc., built in sprites.js) so traps match the arena's floor colors.
const TRAP_LOOKS = {
  spikes: { warnTint: 0xff7070, sound: 'spikes', cycle: SPIKE_CYCLE },
  lava: { warnTint: 0xffd070, sound: 'sizzle', cycle: { off: 2500, warn: 600, on: 2200 } },
};

const Hazards = {
  init(scene) {
    scene.spikeGroups = [];
    this.buildTraps(scene);

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
    // Frequent-barrel arenas get a second roll halfway between the regular ones.
    scene.time.addEvent({
      delay: BARREL.every, startAt: BARREL.every / 2, loop: true,
      callback: () => { if (scene.arena.barrels === 'frequent') Hazards.trySpawnBarrel(scene); },
    });

    scene.chips = scene.add.particles(0, 0, 'chip', {
      speed: { min: 80, max: 220 },
      lifespan: 500,
      scale: { start: 1.2, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 300,
      emitting: false,
    }).setDepth(900);
  },

  // (Re)create the arena's trap tiles, plus the Stash Spikes perk ring. Called on arena changes too.
  buildTraps(scene) {
    for (const grp of scene.spikeGroups) grp.tiles.forEach((t) => t.img.destroy());
    const arena = scene.arena;
    const makeGroup = (tiles, delay, look, friendly = false) => {
      const tint = friendly ? FRIENDLY_TINT : 0xffffff;
      const tex = { off: `${look}_${arena.id}_off`, on: `${look}_${arena.id}_on` };
      return {
        delay: scene.clock + delay,
        look: TRAP_LOOKS[look],
        tex,
        tint,
        friendly, // friendly spikes (Stash Spikes perk) only hurt heroes and glow green
        state: 'off',
        tiles: tiles.map(([c, r]) => {
          const { x, y } = tileCenter(c, r);
          const img = scene.add.image(x, y, tex.off).setDepth(1).setTint(tint);
          return { c, r, x, y, img, cause: look === 'lava' ? 'lava' : 'spikes' }; // cause: for "caught by"
        }),
      };
    };
    // Staggered so the groups don't fire together.
    scene.spikeGroups = arena.traps.map((tiles, i) => makeGroup(tiles, 1500 + i * 1125, arena.hazard));
    if (scene.upg.stashspikes) scene.spikeGroups.push(makeGroup(STASH_SPIKES, 800, 'spikes', true));
  },

  // Remove barrels and bear traps (used when the arena changes).
  clearArena(scene) {
    scene.barrels.clear(true, true);
    for (const t of scene.traps) {
      t.owner.trapCount = 0;
      scene.tweens.killTweensOf(t.img);
      t.img.destroy();
    }
    scene.traps = [];
  },

  update(scene) {
    this.updateSpikes(scene);
    this.updateTraps(scene);
    for (const b of scene.barrels.getChildren()) {
      b.angle += (b.dir[0] + b.dir[1]) * 10;
      b.setDepth(b.y);
    }
  },

  // ---------------------------------------------------------------- spikes & lava

  spikeState(scene, group) {
    const t = scene.clock - group.delay;
    if (t < 0) return 'off';
    const c = group.look.cycle;
    const p = t % (c.off + c.warn + c.on);
    if (p < c.off) return 'off';
    return p < c.off + c.warn ? 'warn' : 'on';
  },

  updateSpikes(scene) {
    const alive = scene.goblins.filter((g) => !g.down);
    for (const grp of scene.spikeGroups) {
      const state = this.spikeState(scene, grp);
      if (state !== grp.state) {
        grp.state = state;
        grp.tiles.forEach((t) => t.img.setTexture(state === 'on' ? grp.tex.on : grp.tex.off).setTint(grp.tint));
        const near = alive.some((g) => Phaser.Math.Distance.Between(g.x, g.y, grp.tiles[0].x, grp.tiles[0].y) < 220);
        if (state === 'on' && near) Sfx.play(grp.look.sound);
      }
      if (state === 'warn') {
        const flash = Math.floor(scene.clock / 100) % 2 === 0;
        const warnTint = grp.friendly ? 0x6abe30 : grp.look.warnTint;
        grp.tiles.forEach((t) => t.img.setTint(flash ? warnTint : grp.tint));
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

  // Normal arenas: from BARREL.firstWave, sometimes. 'frequent' arenas (the Library): always.
  trySpawnBarrel(scene, force = false) {
    if (scene.over || scene.transitioning) return;
    const frequent = scene.arena.barrels === 'frequent';
    if (!force && !frequent && (scene.stats.wave < BARREL.firstWave || Math.random() > BARREL.chance)) return;
    const lane = this.pickLane(scene);
    if (!lane) return;
    const arenaGen = scene.arenaGen;

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
      if (scene.over || scene.arenaGen !== arenaGen) return; // arena changed: that lane is gone
      const { x, y } = tileCenter(...lane.tiles[0]);
      const b = scene.barrels.create(x, y, 'barrel').setDepth(y);
      b.body.setCircle(11, 5, 5);
      b.hits = new Set();
      b.dir = lane.dir;
      b.cause = 'barrel';
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
