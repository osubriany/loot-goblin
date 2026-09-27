const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const INF = 9999;
const DEBUG_SPAWNS = {
  ONE: 'knight', TWO: 'archer', THREE: 'rogue', FOUR: 'thief', FIVE: 'mage', SIX: 'cleric', SEVEN: 'paladin',
  EIGHT: 'potion', NINE: 'boots', ZERO: 'smoke',
  T: 'trapper', C: 'chest', B: 'barrel',
};

// One goblin per player. Per-goblin state (hearts, carried gold, roll/knockback timers, combo,
// buffs) lives on the goblin sprite; the score and wave in this.stats are shared.
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create(data) {
    this.coop = !!(data && data.coop);
    this.stats = {
      banked: 0, wave: 1, elapsed: 0, coinsBanked: 0, goldLost: 0, bestHaul: 0,
      bounties: 0, streak: 0, bestStreak: 0, chests: 0, hazardStuns: 0, kills: 0, coop: this.coop,
    };
    // Shop upgrades are read once per run: id -> level (0 = not owned).
    this.upg = Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, Progress.level(id)]));
    const equipped = Progress.load().equipped;
    this.ability = equipped && this.upg[equipped] ? equipped : null;
    // Heroes scale with how powered-up the goblins are.
    this.threat = threatLevel();
    this.heroSpeedMul = 1 + this.threat * THREAT.speedPer;
    this.heroCdMul = 1 - this.threat * THREAT.cooldownPer;
    this.stats.power = Progress.power();
    this.decoy = null;
    this.caltrops = [];
    this.abilityRequests = new Set();
    this.rerollRequested = false;
    this.rerolledWave = 0;
    this.bossHit = false;    // for the "Untouchable" achievement
    this.toastQueue = [];
    this.toastBusy = false;
    this.clock = 0;          // game-time ms; stops while paused
    this.paused = false;
    this.over = false;
    this.iceZones = [];
    this.boss = null;
    this.bossEnd = 0;
    this.chest = null;
    this.bounty = null;
    this.rollRequests = new Set();
    this.debug = new URLSearchParams(window.location.search).has('debug');
    this.anims.resumeAll();

    this.transitioning = false; // true while the screen is faded out for an arena change
    this.frozen = false;        // true during a hit-stop freeze-frame
    this.displayBanked = 0;     // the HUD score counts up toward stats.banked
    this.bestAtStart = Store.getBest(this.coop);
    this.pbShown = false;
    this.arenaGen = 0;          // bumps on every arena change so stale delayed effects can bail
    this.floor = null;
    this.walls = null;
    this.buildArena(arenaForWave(1));
    this.createStash();
    this.createGoblins();

    this.coins = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.arrows = this.physics.add.group();

    this.physics.add.collider(this.enemies, this.walls, (e) => {
      if (e.kind === 'paladin' && e.mode === 'charge') this.stunEnemy(e);
    });
    // Heroes on their way out pass through the others so doorways never jam.
    this.physics.add.collider(this.enemies, this.enemies, null, (a, b) => a.mode !== 'leave' && b.mode !== 'leave');
    this.physics.add.collider(this.arrows, this.walls, (arrow) => { Sfx.play('thunk'); arrow.destroy(); });
    for (const g of this.goblins) {
      this.physics.add.collider(g, this.walls);
      this.physics.add.overlap(g, this.coins, (_g, coin) => this.collectCoin(g, coin));
      this.physics.add.overlap(g, this.enemies, (_g, e) => this.touchEnemy(g, e));
      this.physics.add.overlap(g, this.arrows, (_g, arrow) => { if (this.hurtPlayer(g, arrow)) arrow.destroy(); });
    }
    PowerUps.init(this);
    Hazards.init(this);

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 200 },
      lifespan: 600,
      scale: { start: 1, end: 0 },
      gravityY: 200,
      emitting: false,
    }).setDepth(900);

    this.createHud();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,P,ESC,M,N,G,V,' + Object.keys(DEBUG_SPAWNS).join(','));
    // Rolls and abilities come from raw key events so left/right keys can belong to different players.
    const onKey = (ev) => {
      if (ev.repeat) return;
      for (const g of this.goblins) {
        if (g.controls.roll.includes(ev.code)) this.rollRequests.add(g);
        if (g.controls.ability.includes(ev.code)) this.abilityRequests.add(g);
      }
      if (ev.code === 'KeyR') this.rerollRequested = true;
    };
    this.input.keyboard.on('keydown', onKey);
    // Gamepad N drives goblin N: face buttons / right bumper roll, Y ability, Back reroll, Start pauses.
    // The plugin's 'down' event passes (pad, button, value); the button knows its index.
    const onPad = (pad, { index }) => {
      if (index === PAD.pause) { this.togglePause(); return; }
      if (index === PAD.reroll) { this.rerollRequested = true; return; }
      const g = this.goblins[this.padIndex(pad)];
      if (g && PAD.roll.includes(index)) this.rollRequests.add(g);
      if (g && index === PAD.ability) this.abilityRequests.add(g);
    };
    if (this.input.gamepad) this.input.gamepad.on('down', onPad);
    this.events.once('shutdown', () => {
      this.input.keyboard.off('keydown', onKey);
      if (this.input.gamepad) this.input.gamepad.off('down', onPad);
    });
    Music.play('main', this.mainBpm());

    this.time.addEvent({ delay: 1100, loop: true, callback: () => this.spawnRandomCoin() });
    this.time.addEvent({ delay: WAVE_MS, loop: true, callback: () => this.nextWave() });
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.computeFlowField() });
    this.time.addEvent({
      delay: CHEST.every, loop: true,
      callback: () => { if (this.stats.wave >= CHEST.firstWave) this.spawnChest(); },
    });
    this.time.delayedCall(2500, () => this.spawnEnemy('knight'));
    if (this.coop) this.time.delayedCall(6000, () => this.spawnEnemy('knight'));
    if (this.threat >= 15) this.time.delayedCall(9000, () => this.spawnEnemy('knight'));

    if (this.upg.headstart) {
      for (const g of this.goblins) g.buffs.boots = POWERUPS.boots.duration;
    }
    for (let i = 0; i < 4; i++) this.spawnRandomCoin();
    this.computeFlowField();
    this.banner('WAVE 1', 'Grab gold, bank it at your STASH');
    Bounties.start(this);
    if (this.debug) this.floatText(W / 2, H - FOOT_H - 40, 'DEBUG: 1-7/T heroes, 8-0 power-ups, C chest, B barrel, G +10 gold, V next arena', '#9badb7', 14, 4000);
  }

  // ---------------------------------------------------------------- arena

  // Lay out an arena: grid, floor tint, wall/door sprites and door paths. Reuses the same floor
  // sprite and wall group on later calls, so colliders registered against this.walls stay valid.
  buildArena(arena) {
    this.arena = arena;
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? 1 : 0);
      this.grid.push(row);
    }
    arena.pillars.forEach(([c, r]) => { this.grid[r][c] = 1; });

    const floorKey = `floor_${arena.id}`;
    if (!this.floor) this.floor = this.add.tileSprite(0, HUD_H, W, ARENA_H, floorKey).setOrigin(0);
    else this.floor.setTexture(floorKey);

    if (this.walls) this.walls.clear(true, true);
    else this.walls = this.physics.add.staticGroup();
    this.doors = [];
    const wallKey = `wall_${arena.id}`;
    const pillarKey = arena.pillarTexture || wallKey;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.grid[r][c]) continue;
        const door = arena.doors.find((d) => d.tile[0] === c && d.tile[1] === r);
        const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
        const { x, y } = tileCenter(c, r);
        const sprite = this.walls.create(x, y, door ? 'door' : border ? wallKey : pillarKey).setDepth(1);
        if (door) this.doors.push({ ...door, sprite });
      }
    }
    // The layout is fixed until the next arena change, so door paths are computed once here.
    this.doorFlows = this.doors.map((d) => this.bfs(...d.inner));
    this.validateArena(arena);
  }

  // Developer check: the shared corner must be clear and every floor tile reachable from the stash.
  validateArena(arena) {
    const mustBeFree = [STASH_TILE, ...PLAYER_STARTS, ...STASH_SPIKES, ...arena.doors.map((d) => d.inner), ...arena.traps.flat()];
    const blocked = mustBeFree.filter(([c, r]) => !this.isFree(c, r));
    if (blocked.length) console.warn(`Arena ${arena.id}: required tiles are solid`, blocked);
    const flow = this.bfs(...STASH_TILE);
    let unreachable = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (this.isFree(c, r) && flow[r * COLS + c] === INF) unreachable++;
    }
    if (unreachable) console.warn(`Arena ${arena.id}: ${unreachable} floor tiles can't be reached`);
  }

  createStash() {
    const s = tileCenter(...STASH_TILE);
    this.stash = this.add.image(s.x, s.y, 'stash').setDepth(2);
    this.add.text(s.x, s.y - 34, 'STASH', textStyle(12, '#fbf236')).setOrigin(0.5).setDepth(3);
  }

  // Fade out, swap in the next arena, put everyone somewhere legal, fade back in, then continue.
  changeArena(arena, then) {
    this.transitioning = true;
    this.physics.world.pause();
    const cam = this.cameras.main;
    cam.fadeOut(350, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this.arenaGen++;
      this.clearArenaObjects();
      this.buildArena(arena);
      Hazards.buildTraps(this);
      this.relocateActors();
      this.computeFlowField();
      for (let i = 0; i < 4; i++) this.spawnRandomCoin();
      cam.fadeIn(350, 0, 0, 0);
      this.banner(arena.name.toUpperCase(), arena.subtitle);
      Sfx.play('arena');
      cam.once('camerafadeincomplete', () => {
        this.transitioning = false;
        this.physics.world.resume();
        for (const g of this.goblins) if (!g.down) g.invulnUntil = Math.max(g.invulnUntil, this.clock + 1500);
        then();
      });
    });
  }

  // Things tied to the old layout: floor loot, traps, patches, projectiles, the chest and decoy.
  clearArenaObjects() {
    this.tweens.killTweensOf([...this.coins.getChildren(), ...this.powerups.getChildren()]);
    this.coins.clear(true, true);
    this.arrows.clear(true, true);
    this.powerups.clear(true, true);
    Hazards.clearArena(this);
    this.iceZones.forEach((z) => z.g.destroy());
    this.iceZones = [];
    this.caltrops.forEach((p) => p.gfx.destroy());
    this.caltrops = [];
    if (this.chest) this.removeChest();
    if (this.decoy) this.endDecoy();
  }

  // Anyone now standing inside a wall moves to the nearest open tile; heroes forget old paths.
  relocateActors() {
    const move = (sprite, bodyOffsetY) => {
      const bc = sprite.body.center;
      const t = worldToTile(bc.x, bc.y);
      if (this.isFree(t.c, t.r)) return;
      const spot = this.nearestFreeTile(t.c, t.r);
      const { x, y } = tileCenter(spot.c, spot.r);
      sprite.body.reset(x, y - bodyOffsetY);
    };
    for (const g of this.goblins) {
      if (g.down) {
        // Downed goblins have no active body; move the sprite itself.
        const t = worldToTile(g.x, g.y + 8);
        if (!this.isFree(t.c, t.r)) {
          const s = this.nearestFreeTile(t.c, t.r);
          const p = tileCenter(s.c, s.r);
          g.setPosition(p.x, p.y - 8);
        }
      } else {
        move(g, 8);
      }
    }
    for (const e of this.enemies.getChildren()) {
      if (e.gone) continue;
      move(e, 7 * (e.width / 32)); // hero bodies sit ~7px (scaled) below the sprite center
      this.clearLine(e);
      Object.assign(e, { coinTarget: null, chestTarget: null, flow: null, wanderTo: null, leaveDoor: undefined, windTint: null });
      if (['aim', 'cast', 'windup', 'dash', 'telegraph', 'charge'].includes(e.mode)) e.mode = 'move';
    }
  }

  nearestFreeTile(c, r) {
    for (let radius = 1; radius < Math.max(COLS, ROWS); radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) === radius && this.isFree(c + dc, r + dr)) return { c: c + dc, r: r + dr };
        }
      }
    }
    return { c: STASH_TILE[0], r: STASH_TILE[1] };
  }

  isFree(c, r) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && this.grid[r][c] === 0;
  }

  // Samples along the line; with `pad` also checks two parallel lines so a body of that half-width fits.
  hasLOS(x1, y1, x2, y2, pad = 0) {
    const clear = (ax, ay, bx, by) => {
      const steps = Math.ceil(Phaser.Math.Distance.Between(ax, ay, bx, by) / 8);
      for (let i = 1; i < steps; i++) {
        const t = worldToTile(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
        if (!this.isFree(t.c, t.r)) return false;
      }
      return true;
    };
    if (!clear(x1, y1, x2, y2)) return false;
    if (!pad) return true;
    const a = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    const ox = -Math.sin(a) * pad, oy = Math.cos(a) * pad;
    return clear(x1 + ox, y1 + oy, x2 + ox, y2 + oy) && clear(x1 - ox, y1 - oy, x2 - ox, y2 - oy);
  }

  // BFS distance from a tile to every floor tile; enemies walk downhill toward it.
  bfs(startC, startR) {
    const flow = new Array(COLS * ROWS).fill(INF);
    if (!this.isFree(startC, startR)) return flow;
    flow[startR * COLS + startC] = 0;
    const queue = [[startC, startR]];
    for (let qi = 0; qi < queue.length; qi++) {
      const [c, r] = queue[qi];
      const d = flow[r * COLS + c];
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (!this.isFree(nc, nr) || flow[nr * COLS + nc] !== INF) continue;
        if (dc && dr && (!this.isFree(c + dc, r) || !this.isFree(c, r + dr))) continue; // no corner cutting
        flow[nr * COLS + nc] = d + 1;
        queue.push([nc, nr]);
      }
    }
    return flow;
  }

  // One flow field per goblin, refreshed a few times a second.
  computeFlowField() {
    for (const g of this.goblins) {
      if (g.down) continue;
      const t = worldToTile(g.body.center.x, g.body.center.y);
      if (this.isFree(t.c, t.r)) g.flow = this.bfs(t.c, t.r);
    }
  }

  // Next point to walk toward on the way to `target`, following `flow` around obstacles.
  nextStep(e, flow, target) {
    const ec = e.body.center;
    if (!flow || this.hasLOS(ec.x, ec.y, target.x, target.y, 9)) return target;
    const t = worldToTile(ec.x, ec.y);
    if (!this.isFree(t.c, t.r)) return target;
    let best = null, bestD = flow[t.r * COLS + t.c];
    for (const [dc, dr] of DIRS) {
      const nc = t.c + dc, nr = t.r + dr;
      if (!this.isFree(nc, nr)) continue;
      if (dc && dr && (!this.isFree(t.c + dc, t.r) || !this.isFree(t.c, t.r + dr))) continue;
      const d = flow[nr * COLS + nc];
      if (d < bestD) { bestD = d; best = [nc, nr]; }
    }
    return best ? tileCenter(...best) : target;
  }

  // ---------------------------------------------------------------- goblins

  createGoblins() {
    const count = this.coop ? 2 : 1;
    this.goblins = [];
    for (let i = 0; i < count; i++) {
      const { x, y } = tileCenter(...PLAYER_STARTS[i]);
      const def = Progress.chosenSkin(i === 0 ? 'p1' : 'p2');
      const skin = `gob_${def.id}`;
      const g = this.physics.add.sprite(x, y, `${skin}_0`);
      g.body.setSize(14, 12).setOffset(9, 18);
      const maxHearts = (def.id === 'chonk' ? 4 : 3) + this.upg.hearts; // Tough Hide
      Object.assign(g, {
        idx: i,
        skin,
        perk: def.id,          // skin perks are keyed by skin id (see SKINS)
        baseScale: def.scale || 1,
        label: `P${i + 1}`,
        color: def.color,
        trailColor: def.trail,
        controls: this.coop ? (i === 0 ? CONTROLS.p1 : CONTROLS.p2) : CONTROLS.solo,
        maxHearts,
        hearts: maxHearts,
        carried: 0,
        invulnUntil: 0,
        knockUntil: 0,
        rollUntil: 0,
        nextRoll: 0,
        rootedUntil: 0,
        blinking: false,
        combo: 0,          // current pickup chain
        comboUntil: 0,     // chain breaks after this
        tripCombo: 0,      // best chain since the last bank
        buffs: { boots: 0, smoke: 0 },   // buff -> clock time it ends
        buffLen: {},                     // buff -> full length of the current buff (for HUD bars)
        nextTrail: 0,
        down: false,
        reviveProgress: 0,
        flow: null,
        secondWinds: this.upg.secondwind,
        abilityReadyAt: 0,
        abilityCd: 1,
      });
      this.goblins.push(g);
    }
  }

  buffActive(g, kind) {
    return g.buffs[kind] > this.clock;
  }

  buffDuration(g, kind) {
    return POWERUPS[kind].duration * (kind === 'smoke' && g.perk === 'shadow' ? 2 : 1);
  }

  // Frost goblins are immune to ice.
  onIce(g) {
    if (g.perk === 'frost') return false;
    const pc = g.body.center;
    return this.iceZones.some((z) => Phaser.Math.Distance.Between(pc.x, pc.y, z.x, z.y) < z.r);
  }

  currentSpeed(g) {
    const weight = this.buffActive(g, 'boots') ? 0 : g.carried;
    const factor = WEIGHT_FACTOR * (1 - 0.12 * this.upg.back); // Strong Back
    let speed = Math.max(MIN_SPEED, BASE_SPEED / (1 + weight * factor));
    speed *= 1 + 0.05 * this.upg.speed; // Nimble Feet
    if (g.perk === 'chonk') speed *= 0.9;
    return this.onIce(g) ? speed * 0.5 : speed;
  }

  // Hero attack cooldowns shrink as hero threat rises.
  cd(ms) {
    return ms * this.heroCdMul;
  }

  // Which connected gamepad (0, 1, ...) this pad is, so pad N can drive goblin N.
  padIndex(pad) {
    return this.input.gamepad ? this.input.gamepad.getAll().indexOf(pad) : -1;
  }

  padFor(g) {
    return this.input.gamepad ? this.input.gamepad.getAll()[g.idx] || null : null;
  }

  // Nearest goblin a hero can go after: not down and not hidden by a smoke bomb.
  // An active decoy coin draws everyone except the Paladin (too wise) and Trapper (busy).
  targetFor(e) {
    if (this.decoy && e.kind !== 'paladin' && e.kind !== 'trapper') return this.decoy;
    let best = null, bestD = Infinity;
    for (const g of this.goblins) {
      if (g.down || this.buffActive(g, 'smoke')) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, g.x, g.y);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  moveGoblin(g) {
    if (g.down) return;
    // The bigger the pile of gold, the fatter the goblin.
    g.setScale(g.baseScale * (1 + Math.min(g.carried, 30) * 0.012));
    g.setDepth(g.y);
    if (!g.blinking) g.setAlpha(this.buffActive(g, 'smoke') ? 0.45 : 1);
    if (this.onIce(g)) g.setTint(0xbfe8ff); else g.clearTint();
    if (this.clock < g.knockUntil || this.clock < g.rollUntil) return;
    if (this.clock < g.rootedUntil) {
      g.setVelocity(0, 0);
      g.anims.stop();
      return;
    }

    const { vx, vy } = this.inputDir(g);
    if (vx || vy) {
      const speed = this.currentSpeed(g);
      const len = Math.hypot(vx, vy);
      g.setVelocity((vx / len) * speed, (vy / len) * speed);
      g.anims.play(`${g.skin}_walk`, true);
      g.anims.timeScale = 0.5 + (0.7 * speed) / BASE_SPEED;
      if (vx) g.setFlipX(vx < 0);
    } else {
      g.setVelocity(0, 0);
      if (g.anims.isPlaying) { g.anims.stop(); g.setTexture(`${g.skin}_0`); }
    }
  }

  // Keyboard first; otherwise this goblin's gamepad (left stick, then d-pad).
  inputDir(g) {
    const k = this.keys, c = g.controls;
    const held = (names) => names.some((n) => k[n].isDown);
    const vx = (held(c.right) ? 1 : 0) - (held(c.left) ? 1 : 0);
    const vy = (held(c.down) ? 1 : 0) - (held(c.up) ? 1 : 0);
    if (vx || vy) return { vx, vy };
    const pad = this.padFor(g);
    if (!pad) return { vx: 0, vy: 0 };
    const sx = pad.leftStick.x, sy = pad.leftStick.y;
    if (Math.hypot(sx, sy) > PAD.deadzone) return { vx: sx, vy: sy };
    return { vx: (pad.right ? 1 : 0) - (pad.left ? 1 : 0), vy: (pad.down ? 1 : 0) - (pad.up ? 1 : 0) };
  }

  tryRoll(g) {
    if (g.down || this.clock < g.nextRoll || this.clock < g.knockUntil) return;
    let { vx, vy } = this.inputDir(g);
    if (!vx && !vy) vx = g.flipX ? -1 : 1;
    const len = Math.hypot(vx, vy);
    g.setVelocity((vx / len) * ROLL.speed, (vy / len) * ROLL.speed);
    if (this.clock < g.rootedUntil) this.achieve('roll_escape');
    g.rootedUntil = 0; // rolling wrenches free of a bear trap
    g.rollUntil = this.clock + ROLL.duration;
    const rollCd = ROLL.cooldown * (1 - 0.15 * this.upg.roll) * (g.perk === 'sprinter' ? 0.5 : 1); // Quick Roll
    g.nextRoll = this.clock + rollCd;
    g.invulnUntil = Math.max(g.invulnUntil, g.rollUntil + ROLL.iframes);

    if (g.carried > 0 && g.perk !== 'ember') {
      g.carried--;
      this.stats.goldLost++;
      this.floatText(g.x, g.y - 22, '-1', '#ff5a5a', 14);
    }
    Sfx.play('roll');
    this.tweens.add({
      targets: g, angle: vx < 0 ? -360 : 360, duration: ROLL.duration,
      onComplete: () => { if (!g.down) g.setAngle(0); },
    });
    for (let i = 0; i < 3; i++) this.time.delayedCall(i * 55, () => this.ghost(g, g.trailColor, 0.5));
  }

  // A fading silhouette copy of a goblin (roll trail, boots trail).
  ghost(g, color, alpha, duration = 250) {
    const img = this.add.image(g.x, g.y, g.texture.key)
      .setFlipX(g.flipX).setScale(g.scaleX).setAngle(g.angle)
      .setTintFill(color).setAlpha(alpha).setDepth(g.depth - 1);
    this.tweens.add({ targets: img, alpha: 0, duration, onComplete: () => img.destroy() });
  }

  blink(g, repeats) {
    g.blinking = true;
    this.tweens.add({
      targets: g, alpha: 0.25, duration: 100, yoyo: true, repeat: repeats,
      onComplete: () => { g.blinking = false; g.setAlpha(1); },
    });
  }

  rootPlayer(g, trap) {
    g.rootedUntil = this.clock + TRAP.root;
    g.setVelocity(0, 0);
    g.body.reset(trap.x, trap.y - 8); // body center sits 8px below the sprite center
    this.cameras.main.shake(120, 0.006);
    this.floatText(trap.x, trap.y - 30, 'SNAP!', '#cbdbfc', 18);
    Sfx.play('snap');
  }

  touchEnemy(g, e) {
    if (g.down || e.spawning || e.gone || e.mode === 'stun') return;
    if (e.kind === 'thief') this.bumpThief(e);
    else if (!e.harmless) this.hurtPlayer(g, e);
  }

  hurtPlayer(g, src) {
    if (this.over || g.down || this.clock < g.invulnUntil) return false;
    g.hearts--;
    g.invulnUntil = this.clock + (g.perk === 'ghost' ? 2600 : 1600) + 400 * this.upg.iron; // Iron Will
    g.combo = 0;
    g.tripCombo = 0;
    Bounties.event(this, 'hit');
    if (this.boss && this.boss.mode !== 'leave') this.bossHit = true;

    const pc = g.body.center;
    const a = Phaser.Math.Angle.Between(src.x, src.y, pc.x, pc.y);
    g.setVelocity(Math.cos(a) * 300, Math.sin(a) * 300);
    g.knockUntil = this.clock + 160;

    const drop = Math.floor((g.carried * (5 - this.upg.pockets)) / 10); // Deep Pockets: 50% -> 20%
    if (drop > 0) {
      g.carried -= drop;
      this.stats.goldLost += drop;
      this.scatterCoins(drop, pc);
      this.floatText(pc.x, pc.y - 26, `-${drop}`, '#ff5a5a', 22);
      Sfx.play('drop');
    }

    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(140, 160, 30, 30);
    Sfx.play('hit');
    this.popHeart(g, g.hearts);

    if (g.hearts <= 0) {
      if (g.secondWinds > 0) {
        this.secondWind(g);
        return true;
      }
      this.knockOut(g);
      return true;
    }
    this.blink(g, 7);
    return true;
  }

  // "Second Wind" perk: get back up with 1 heart instead of going down.
  secondWind(g) {
    g.secondWinds--;
    g.hearts = 1;
    g.invulnUntil = this.clock + 2500;
    this.blink(g, 11);
    this.banner('SECOND WIND!', g.secondWinds ? `${g.secondWinds} left this run` : '');
    this.sparks.explode(30, g.x, g.y);
    Sfx.play('revive');
  }

  popHeart(g, i) {
    const icons = g.hud.hearts;
    const icon = icons[Math.min(i, icons.length - 1)];
    if (icon) this.tweens.add({ targets: icon, scale: 1.8, duration: 130, yoyo: true });
  }

  // Out of hearts. Solo (or last goblin standing) ends the run; otherwise wait for a revive.
  knockOut(g) {
    if (!this.goblins.some((o) => o !== g && !o.down)) {
      this.gameOver();
      return;
    }
    this.tweens.killTweensOf(g);
    g.blinking = false;
    g.down = true;
    g.reviveProgress = 0;
    if (g.carried) {
      this.stats.goldLost += g.carried;
      this.scatterCoins(g.carried, g.body.center);
      g.carried = 0;
    }
    g.setVelocity(0, 0);
    g.body.enable = false;
    g.anims.stop();
    g.setTexture(`${g.skin}_0`).setAngle(90).setScale(1).setTint(0x888888).setAlpha(0.75);
    g.reviveArc = g.reviveArc || this.add.graphics().setDepth(960);
    this.banner(`${g.label} IS DOWN`, 'Stand next to them to revive');
    Sfx.play('down');
  }

  updateRevive(g, delta) {
    if (!g.down) return;
    const helper = this.goblins.find((o) => !o.down &&
      Phaser.Math.Distance.Between(o.body.center.x, o.body.center.y, g.x, g.y + 8) < REVIVE.range);
    const rate = helper && helper.perk === 'ghost' ? 2 : 1;
    g.reviveProgress = helper ? g.reviveProgress + delta * rate : Math.max(0, g.reviveProgress - delta);

    const arc = g.reviveArc;
    arc.clear();
    const pulse = 0.4 + 0.3 * Math.sin(this.clock / 150);
    arc.lineStyle(2, 0x6abe30, pulse).strokeCircle(g.x, g.y + 4, REVIVE.range);
    if (g.reviveProgress > 0) {
      const frac = Math.min(1, g.reviveProgress / REVIVE.time);
      arc.lineStyle(4, 0x000000, 0.6).strokeCircle(g.x, g.y - 26, 9);
      arc.lineStyle(4, 0x6abe30, 1).beginPath();
      arc.arc(g.x, g.y - 26, 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false).strokePath();
    }
    if (g.reviveProgress >= REVIVE.time) this.revive(g);
  }

  revive(g) {
    g.down = false;
    g.hearts = REVIVE.hearts;
    g.reviveProgress = 0;
    g.reviveArc.clear();
    g.body.enable = true;
    g.body.reset(g.x, g.y);
    g.setAngle(0).clearTint().setAlpha(1);
    g.invulnUntil = this.clock + 2000;
    this.blink(g, 9);
    this.floatText(g.x, g.y - 30, 'REVIVED!', '#6abe30', 20, 1200);
    this.sparks.explode(24, g.x, g.y);
    Sfx.play('revive');
    this.achieve('revive');
  }

  // ---------------------------------------------------------------- gold

  spawnCoin(x, y, value, gem = false) {
    const coin = this.coins.create(x, y, gem ? 'gem' : 'coin_0');
    coin.value = value;
    coin.gem = gem;
    coin.ready = true;
    coin.collected = false;
    coin.setDepth(4);
    coin.body.setSize(14, 14);
    if (!gem) coin.play('coin_spin');
    return coin;
  }

  randomFreeSpot(minPlayerDist) {
    for (let i = 0; i < 40; i++) {
      const c = Phaser.Math.Between(1, COLS - 2), r = Phaser.Math.Between(1, ROWS - 2);
      if (!this.isFree(c, r)) continue;
      const { x, y } = tileCenter(c, r);
      if (Phaser.Math.Distance.Between(x, y, this.stash.x, this.stash.y) < 56) continue;
      if (this.goblins.some((g) => Phaser.Math.Distance.Between(x, y, g.x, g.y) < minPlayerDist)) continue;
      if (this.coins.getChildren().some((o) => !o.collected && Phaser.Math.Distance.Between(o.x, o.y, x, y) < 24)) continue;
      return { x: x + Phaser.Math.Between(-6, 6), y: y + Phaser.Math.Between(-6, 6) };
    }
    return null;
  }

  spawnRandomCoin() {
    if (this.over) return;
    const live = this.coins.getChildren().filter((c) => !c.collected).length;
    const cap = Math.min(6 + Math.floor(this.stats.wave / 2), 10) + (this.coop ? 3 : 0);
    if (live >= cap) return;
    const spot = this.randomFreeSpot(96);
    if (!spot) return;
    const gem = Math.random() < 0.08 + 0.04 * this.upg.luck; // Lucky Charm
    const coin = this.spawnCoin(spot.x, spot.y, gem ? 5 : 1, gem);
    coin.setScale(0);
    this.tweens.add({ targets: coin, scale: 1, duration: 250, ease: 'Back.easeOut' });
    if (gem) this.tweens.add({ targets: coin, y: coin.y - 4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  collectCoin(g, coin) {
    if (!coin.ready || coin.collected || this.over || g.down) return;
    coin.collected = true;
    coin.body.enable = false;
    g.carried += coin.value;
    Sfx.play(coin.gem ? 'gem' : 'coin');
    if (!coin.magnetPulled) this.registerPickup(g); // Coin Magnet pulls don't build combos
    Bounties.event(this, 'coin');
    if (coin.value > 1) this.floatText(coin.x, coin.y - 12, `+${coin.value}`, coin.gem ? '#5fcde4' : '#fbf236', 16);
    this.tweens.killTweensOf(coin);
    this.tweens.add({ targets: coin, y: coin.y - 18, scale: 1.6, alpha: 0, duration: 220, onComplete: () => coin.destroy() });
  }

  // Loot flies out from `from` and can be picked up once it lands.
  scatterCoins(amount, from) {
    from = { x: from.x, y: from.y };
    const pieces = Math.min(amount, 16);
    const base = Math.floor(amount / pieces), extra = amount % pieces;
    for (let i = 0; i < pieces; i++) {
      let tx = from.x, ty = from.y;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(48, 120);
        const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
        const t = worldToTile(x, y);
        if (this.isFree(t.c, t.r)) { tx = x; ty = y; break; }
      }
      const coin = this.spawnCoin(from.x, from.y, base + (i < extra ? 1 : 0));
      coin.ready = false;
      this.tweens.add({ targets: coin, x: tx, duration: 550, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: coin, y: ty, duration: 550, ease: 'Bounce.easeOut', onComplete: () => { coin.ready = true; } });
    }
  }

  checkStash(g) {
    if (g.down || !g.carried) return;
    const b = g.body.center;
    if (Phaser.Math.Distance.Between(b.x, b.y, this.stash.x, this.stash.y) < 28) this.bank(g);
  }

  // --- combo

  registerPickup(g) {
    g.combo = this.clock < g.comboUntil ? g.combo + 1 : 1;
    g.comboUntil = this.clock + COMBO.window;
    g.tripCombo = Math.max(g.tripCombo, g.combo);
    Bounties.event(this, 'combo', g.combo);
    if (g.combo >= 11) this.achieve('combo_11');
    if (g.combo >= 2) {
      this.floatText(g.x, g.y - 28, `x${g.combo}`, '#ff9f43', 12 + Math.min(g.combo, 10), 600);
      Sfx.play('combo', g.combo);
    }
  }

  // The first coin of a chain doesn't count, so a 11-coin chain hits the x1.5 cap.
  comboMult(g) {
    return Math.min(COMBO.maxMult, 1 + COMBO.step * Math.max(0, g.tripCombo - 1));
  }

  bank(g) {
    const s = this.stats;
    const c = g.carried;
    const haul = c >= 20 ? 2 : c >= 10 ? 1.5 : 1;
    const combo = this.comboMult(g);
    const streak = Bounties.streakMult(this);
    const golden = (g.perk === 'golden' ? 1.1 : 1) * (1 + 0.05 * this.upg.greed); // Greedy Stash
    const pts = Math.round(c * haul * combo * streak * golden);
    s.banked += pts;
    s.coinsBanked += c;
    s.bestHaul = Math.max(s.bestHaul, c);
    Progress.addGold(c); // banked coins become shop gold
    g.carried = 0;
    g.combo = 0;
    g.tripCombo = 0;
    Bounties.event(this, 'bank', c);
    this.achieve('first_bank');
    if (c >= 20) this.achieve('haul_20');
    if (c >= 40) this.achieve('haul_40');

    const bonus = haul > 1 || combo > 1 || streak > 1;
    const parts = [];
    if (haul > 1) parts.push(`HAUL x${haul}`);
    if (combo > 1) parts.push(`COMBO x${combo.toFixed(2)}`);
    if (streak > 1) parts.push(`STREAK x${streak.toFixed(1)}`);

    // Celebrate in proportion to the haul. Every bank showers coins into the stash; big hauls add
    // a freeze-frame, and huge ones a gold flash and camera punch.
    const tier = c >= 20 ? 'huge' : c >= 10 ? 'big' : 'normal';
    this.coinShower(g, c);
    Sfx.play(tier === 'huge' ? 'huge' : bonus ? 'bigbank' : 'bank');
    this.floatText(this.stash.x + 30, this.stash.y - 24, `+${pts}`, '#fbf236', { normal: 26, big: 32, huge: 40 }[tier], 1200);
    if (bonus) this.floatText(this.stash.x + 130, this.stash.y - 56, parts.join(' · '), '#ff9f43', 15, 1600);
    this.sparks.explode({ normal: bonus ? 30 : 16, big: 45, huge: 70 }[tier], this.stash.x, this.stash.y);
    this.tweens.add({ targets: this.stash, scale: { normal: 1.3, big: 1.45, huge: 1.6 }[tier], duration: 90, yoyo: true });
    if (tier === 'big') {
      this.hitStop(90);
      this.cameras.main.shake(120, 0.004);
    } else if (tier === 'huge') {
      this.hitStop(160);
      this.cameras.main.flash(200, 255, 220, 90);
      this.tweens.add({ targets: this.cameras.main, zoom: 1.05, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      this.floatText(this.stash.x + 110, this.stash.y - 90, 'HUGE HAUL!', '#fbf236', 30, 1400);
    }
  }

  // Coins arc from the goblin into the stash one after another, each landing with a rising tick.
  coinShower(g, count) {
    const n = Math.min(count, 24);
    const sx = g.x, sy = g.y - 8;
    for (let i = 0; i < n; i++) {
      const coin = this.add.sprite(sx, sy, 'coin_0').play('coin_spin').setDepth(960);
      const tx = this.stash.x + Phaser.Math.Between(-10, 10), ty = this.stash.y + Phaser.Math.Between(-6, 6);
      const lift = Phaser.Math.Between(40, 80);
      this.tweens.addCounter({
        from: 0, to: 1, duration: 380, delay: i * 35, ease: 'Quad.easeIn',
        onUpdate: (tw) => {
          const v = tw.getValue();
          coin.setPosition(sx + (tx - sx) * v, sy + (ty - sy) * v - Math.sin(v * Math.PI) * lift);
        },
        onComplete: () => {
          coin.destroy();
          Sfx.play('tick', i);
          if (i % 4 === 0) this.tweens.add({ targets: this.stash, scale: 1.12, duration: 50, yoyo: true });
        },
      });
    }
  }

  // Brief freeze-frame that sells impact. Visual tweens keep playing; gameplay pauses.
  hitStop(ms) {
    if (this.frozen) return;
    this.frozen = true;
    this.physics.world.pause();
    this.time.delayedCall(ms, () => {
      this.frozen = false;
      if (!this.paused && !this.transitioning && !this.over) this.physics.world.resume();
    });
  }

  // First time this run's score passes the best from before the run.
  celebratePersonalBest() {
    this.pbShown = true;
    Sfx.play('pb');
    // Upper arena, clear of the HUD, toasts (top right) and the stash popups (bottom left).
    const y = HUD_H + 160;
    const t = this.add.text(W / 2, y, 'NEW PERSONAL BEST!', textStyle(30, '#fbf236')).setOrigin(0.5).setDepth(1500).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: y - 20, delay: 1800, duration: 500, onComplete: () => t.destroy() });
    this.sparks.explode(40, W / 2, y);
    this.bankedText.setColor('#fbf236'); // stays gold for the rest of the run
  }

  // ---------------------------------------------------------------- adventurers

  // Prefer a door that no goblin is standing near.
  pickDoor() {
    const scored = this.doors.map((d) => {
      const { x, y } = tileCenter(...d.inner);
      const dist = Math.min(...this.goblins.map((g) => Phaser.Math.Distance.Between(x, y, g.x, g.y)));
      return { d, dist };
    });
    const far = scored.filter((s) => s.dist > 220);
    if (far.length) return Phaser.Utils.Array.GetRandom(far).d;
    return scored.sort((a, b) => b.dist - a.dist)[0].d;
  }

  pickType() {
    const pool = [];
    for (const [kind, t] of Object.entries(ENEMY_TYPES)) {
      if (t.boss || this.stats.wave < t.minWave) continue;
      pool.push(kind);
      if (kind === 'knight') pool.push(kind);
    }
    return Phaser.Utils.Array.GetRandom(pool);
  }

  spawnEnemy(type) {
    if (this.over) return null;
    const door = this.pickDoor();
    const { x, y } = tileCenter(...door.inner);
    const e = this.enemies.create(x, y, `${type}_0`);
    const f = e.width / 32; // paladin is drawn larger
    e.body.setSize(16 * f, 14 * f).setOffset(8 * f, 16 * f);
    if (type === 'paladin') e.body.setMass(6);

    Object.assign(e, {
      kind: type,
      speed: ENEMY_TYPES[type].speed * Math.min(1.4, 1 + (this.stats.wave - 1) * 0.03) * this.heroSpeedMul,
      mode: 'move',
      spawning: true,
      gone: false,
      harmless: type === 'thief',
      windTint: null,
      blessUntil: 0,
      stolen: 0,
      stolenCount: 0,
      nextShot: this.clock + 1500,
      nextDash: this.clock + 1500,
      nextCast: this.clock + 1500,
      nextBless: this.clock + 2000,
      nextCharge: this.clock + 2000,
      nextTrap: this.clock + 2000,
      trapCount: 0,
      nextPath: 0,
    });
    e.setAlpha(0).setDepth(y);
    this.tweens.add({
      targets: e, alpha: 1, duration: 700,
      onComplete: () => { e.spawning = false; e.play(`${type}_walk`); },
    });

    this.flashDoor(door);
    Sfx.play('spawn');
    return e;
  }

  flashDoor(door) {
    door.sprite.setTintFill(0xfbf236);
    const gen = this.arenaGen;
    this.time.delayedCall(300, () => { if (gen === this.arenaGen) door.sprite.clearTint(); });
  }

  speedOf(e) {
    return e.speed * (e.blessUntil > this.clock ? 1.35 : 1);
  }

  moveToward(e, target, speed) {
    const ec = e.body.center;
    const a = Phaser.Math.Angle.Between(ec.x, ec.y, target.x, target.y);
    e.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }

  moveAway(e, from, speed) {
    const ec = e.body.center;
    const a = Phaser.Math.Angle.Between(from.x, from.y, ec.x, ec.y);
    e.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }

  wander(e, speed) {
    if (!e.wanderTo || this.clock > e.wanderUntil || Phaser.Math.Distance.Between(e.body.center.x, e.body.center.y, e.wanderTo.x, e.wanderTo.y) < 12) {
      e.wanderTo = this.randomFreeSpot(0) || { x: e.x, y: e.y };
      e.wanderUntil = this.clock + 1800;
    }
    this.moveToward(e, e.wanderTo, speed);
  }

  // Head for the nearest visible goblin; with none (all down or smoke-bombed), mill about.
  chase(e, speed = this.speedOf(e)) {
    const g = this.targetFor(e);
    if (!g) this.wander(e, speed * 0.6);
    else this.moveToward(e, this.nextStep(e, g.flow, g.body.center), speed);
  }

  // Walk to the nearest door and vanish.
  leave(e) {
    if (e.leaveDoor === undefined) {
      const t = worldToTile(e.body.center.x, e.body.center.y);
      const idx = this.isFree(t.c, t.r) ? t.r * COLS + t.c : -1;
      e.leaveDoor = 0;
      if (idx >= 0) this.doorFlows.forEach((flow, i) => { if (flow[idx] < this.doorFlows[e.leaveDoor][idx]) e.leaveDoor = i; });
    }
    const target = tileCenter(...this.doors[e.leaveDoor].inner);
    if (Phaser.Math.Distance.Between(e.body.center.x, e.body.center.y, target.x, target.y) < 14) {
      this.despawnEnemy(e);
      return;
    }
    this.moveToward(e, this.nextStep(e, this.doorFlows[e.leaveDoor], target), this.speedOf(e) * 1.2);
  }

  despawnEnemy(e) {
    e.gone = true;
    e.setVelocity(0, 0);
    e.body.enable = false;
    this.clearLine(e);
    this.clearStars(e);
    if (e.kind === 'thief' && e.stolen > 0) this.floatText(e.x, e.y - 24, `${e.stolen} gold stolen!`, '#b48cff', 16, 1200);
    if (e === this.boss) this.boss = null;
    this.flashDoor(this.doors[e.leaveDoor]);
    this.tweens.add({ targets: e, alpha: 0, duration: 250, onComplete: () => e.destroy() });
  }

  updateEnemy(e) {
    if (e.gone) return;
    if (e.spawning) { e.setVelocity(0, 0); return; }
    if (e.mode === 'stun') {
      e.setVelocity(0, 0);
      if (this.clock >= e.stunEnd) {
        e.mode = 'move';
        e.nextCharge = this.clock + this.cd(2500);
        this.clearStars(e);
      }
    } else {
      ENEMY_AI[e.kind](this, e, this.clock);
    }
    if (e.gone) return;

    const tint = e.windTint || (e.blessUntil > this.clock ? 0xfff3a0 : null);
    if (tint) e.setTint(tint); else e.clearTint();
    if (Math.abs(e.body.velocity.x) > 1) e.setFlipX(e.body.velocity.x < 0);
    e.setDepth(e.y);
    if (e.stars) {
      e.stars.forEach((s, i) => {
        const a = this.clock / 150 + (i * Math.PI * 2) / 3;
        s.setPosition(e.x + Math.cos(a) * 18, e.y - e.displayHeight / 2 + Math.sin(a) * 5);
      });
    }
  }

  // Shoots at the goblin it aimed at, or whoever is nearest if that one went down or vanished.
  fireArrow(e, target) {
    const stale = !target || target.down || this.buffActive(target, 'smoke') || (target.isDecoy && target !== this.decoy);
    if (stale) target = this.targetFor(e);
    if (!target) return;
    const from = e.body.center, to = target.body.center;
    const a = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const arrow = this.arrows.create(from.x, from.y, 'arrow');
    arrow.setRotation(a).setDepth(800);
    arrow.body.setSize(6, 6);
    arrow.body.setVelocity(Math.cos(a) * 270, Math.sin(a) * 270);
    arrow.dieAt = this.clock + 3000;
    Sfx.play('shoot');
  }

  // --- thief

  stealCoin(e, coin) {
    coin.collected = true;
    coin.body.enable = false;
    e.stolen += coin.value;
    e.stolenCount++;
    e.coinTarget = null;
    this.tweens.killTweensOf(coin);
    this.tweens.add({ targets: coin, x: e.x, y: e.y, scale: 0.4, alpha: 0, duration: 150, onComplete: () => coin.destroy() });
    Sfx.play('steal');
    e.setScale(1 + e.stolenCount * 0.08);
    if (e.stolenCount >= 3) {
      e.mode = 'leave';
      this.floatText(e.x, e.y - 26, 'HEHEHE', '#b48cff', 14);
    }
  }

  bumpThief(e) {
    if (e.mode === 'leave' && !e.stolen) return;
    if (e.stolen > 0) {
      this.scatterCoins(e.stolen, e.body.center);
      this.floatText(e.x, e.y - 26, 'GOT IT BACK!', '#6abe30', 16);
      Sfx.play('drop');
      Bounties.event(this, 'rob');
      if (e.hadChest) this.achieve('rob_chest_thief');
      e.stolen = 0;
      e.stolenCount = 0;
      e.setScale(1);
    }
    e.mode = 'leave'; // flees empty-handed
  }

  // --- treasure chest

  spawnChest() {
    if (this.over || this.chest) return;
    const spot = this.randomFreeSpot(200);
    if (!spot) return;
    const img = this.add.image(spot.x, spot.y, 'chest').setDepth(4).setScale(0);
    this.tweens.add({ targets: img, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.chest = {
      x: spot.x, y: spot.y, img,
      value: CHEST.baseValue + this.stats.wave,
      expireAt: this.clock + CHEST.lifetime,
      progress: 0,
      arc: this.add.graphics().setDepth(960),
      nextRing: 0,
    };
    this.floatText(spot.x, spot.y - 24, 'TREASURE!', '#fbf236', 18, 1400);
    Sfx.play('chest');
  }

  updateChest(delta) {
    const c = this.chest;
    if (!c) return;
    const left = c.expireAt - this.clock;
    if (left <= 0) { this.removeChest(); return; }
    c.img.setVisible(left > 3000 || Math.floor(left / 150) % 2 === 0);
    if (this.clock >= c.nextRing) { this.ring(c.x, c.y, 30, 0xfbf236); c.nextRing = this.clock + 1000; }

    // Stand on the chest to pick the lock; stepping off resets it.
    const opener = this.goblins.find((g) => !g.down &&
      Phaser.Math.Distance.Between(g.body.center.x, g.body.center.y, c.x, c.y) < 20);
    c.progress = opener ? c.progress + delta : 0;
    c.arc.clear();
    if (c.progress > 0) {
      const frac = Math.min(1, c.progress / CHEST.openTime);
      c.arc.lineStyle(4, 0x000000, 0.6).strokeCircle(c.x, c.y - 26, 9);
      c.arc.lineStyle(4, 0xfbf236, 1).beginPath();
      c.arc.arc(c.x, c.y - 26, 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false).strokePath();
    }
    if (c.progress >= CHEST.openTime) this.openChest(opener);
  }

  openChest(g) {
    const c = this.chest;
    g.carried += c.value;
    this.registerPickup(g);
    Bounties.event(this, 'chest');
    if (++this.stats.chests >= 3) this.achieve('chest_3');
    this.floatText(c.x, c.y - 24, `+${c.value}`, '#fbf236', 24, 1200);
    this.sparks.explode(40, c.x, c.y);
    this.cameras.main.shake(120, 0.005);
    Sfx.play('unlock');
    this.removeChest();
  }

  stealChest(thief) {
    const c = this.chest;
    thief.stolen += c.value;
    thief.stolenCount = 3;
    thief.hadChest = true;
    thief.mode = 'leave';
    thief.setScale(1.3);
    this.floatText(c.x, c.y - 24, 'THE CHEST!', '#b48cff', 18, 1200);
    Sfx.play('steal');
    this.removeChest();
  }

  removeChest() {
    const c = this.chest;
    this.chest = null;
    c.arc.destroy();
    this.tweens.add({ targets: c.img, scale: 0, alpha: 0, duration: 200, onComplete: () => c.img.destroy() });
  }

  // --- mage

  createIce(x, y) {
    const g = this.add.graphics({ x, y }).setDepth(3);
    g.fillStyle(0x9fdcf2, 0.35).fillCircle(0, 0, ICE_RADIUS);
    g.lineStyle(2, 0xcbe8f7, 0.9).strokeCircle(0, 0, ICE_RADIUS);
    g.lineStyle(1, 0xffffff, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.lineBetween(Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 20, Math.sin(a) * 20);
    }
    g.setScale(0.2);
    this.tweens.add({ targets: g, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.iceZones.push({ x, y, r: ICE_RADIUS, until: this.clock + 5000, g });
    Sfx.play('ice');
  }

  updateIce() {
    this.iceZones = this.iceZones.filter((z) => {
      if (this.clock < z.until) return true;
      this.tweens.add({ targets: z.g, alpha: 0, duration: 300, onComplete: () => z.g.destroy() });
      return false;
    });
  }

  telegraphCircle(x, y, r, duration, color) {
    const g = this.add.graphics({ x, y }).setDepth(3);
    g.fillStyle(color, 0.15).fillCircle(0, 0, r);
    g.lineStyle(2, color, 0.9).strokeCircle(0, 0, r);
    this.tweens.add({ targets: g, alpha: 0.3, duration: 100, yoyo: true, repeat: Math.floor(duration / 200) - 1, onComplete: () => g.destroy() });
  }

  ring(x, y, r, color) {
    const g = this.add.graphics({ x, y }).setDepth(850);
    g.lineStyle(3, color, 0.9).strokeCircle(0, 0, r);
    g.setScale(0.1);
    this.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  // --- paladin boss

  startBoss() {
    const e = this.spawnEnemy('paladin');
    if (!e) return;
    this.boss = e;
    this.bossHit = false;
    this.bossEnd = this.clock + BOSS_DURATION + 700;
    this.banner('THE PALADIN ARRIVES', `Survive ${BOSS_DURATION / 1000} seconds!`);
    Sfx.play('boss');
    Music.play('boss');
    this.cameras.main.shake(400, 0.008);
  }

  updateBoss() {
    const b = this.boss;
    if (!b || b.gone || b.spawning || b.mode === 'leave' || this.clock < this.bossEnd) return;
    this.clearLine(b);
    this.clearStars(b);
    b.windTint = null;
    b.mode = 'leave';
    b.harmless = true;
    const bonus = 25 * this.stats.wave;
    this.stats.banked += bonus;
    this.banner('PALADIN RETREATS', `+${bonus} survival bonus`);
    Sfx.play('bossleave');
    Music.play('main', this.mainBpm());
    if (!this.bossHit) this.achieve('paladin_untouched');
    for (const g of this.goblins) if (!g.down) this.sparks.explode(30, g.x, g.y);
  }

  drawChargeLine(e) {
    const ec = e.body.center;
    const cos = Math.cos(e.chargeAngle), sin = Math.sin(e.chargeAngle);
    let len = 0;
    while (len < 800) {
      const t = worldToTile(ec.x + cos * (len + 8), ec.y + sin * (len + 8));
      if (!this.isFree(t.c, t.r)) break;
      len += 8;
    }
    const g = this.add.graphics().setDepth(700);
    g.lineStyle(10, 0xd95763, 0.5).lineBetween(ec.x, ec.y, ec.x + cos * len, ec.y + sin * len);
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(ec.x, ec.y, ec.x + cos * len, ec.y + sin * len);
    this.tweens.add({ targets: g, alpha: 0.3, duration: 100, yoyo: true, repeat: -1 });
    e.line = g;
  }

  clearLine(e) {
    if (!e.line) return;
    this.tweens.killTweensOf(e.line);
    e.line.destroy();
    e.line = null;
  }

  // Any hero can be stunned (Paladin wall slam, spikes, barrels). Stunned heroes are harmless.
  // cause 'hazard' (spikes/barrels) counts toward the stun bounty.
  stunEnemy(e, ms = 1200, cause = null) {
    if (e.gone || e.spawning || e.mode === 'stun' || e.mode === 'leave') return;
    this.clearLine(e);
    e.windTint = null;
    e.mode = 'stun';
    e.stunEnd = this.clock + ms;
    e.setVelocity(0, 0);
    if (e.kind === 'paladin') this.cameras.main.shake(250, 0.015);
    this.floatText(e.x, e.y - e.displayHeight / 2 - 10, 'STUNNED!', '#fbf236', e.kind === 'paladin' ? 18 : 13);
    Sfx.play('stun');
    this.clearStars(e);
    e.stars = [0, 1, 2].map(() => this.add.image(e.x, e.y, 'spark').setDepth(1200));
    if (cause === 'hazard') {
      Bounties.event(this, 'hazardStun');
      if (++this.stats.hazardStuns >= 5) this.achieve('spikes_5');
    }
  }

  clearStars(e) {
    if (!e.stars) return;
    e.stars.forEach((s) => s.destroy());
    e.stars = null;
  }

  // --- waves

  nextWave() {
    if (this.over || this.transitioning) return;
    Bounties.finish(this);
    const s = this.stats;
    s.wave++;
    if (s.wave >= 10) {
      this.achieve('wave_10');
      if (this.coop) this.achieve('coop_wave10');
    }
    // Every ARENA_WAVES waves the arena rotates; its intro plays before the wave's heroes arrive.
    const arena = arenaForWave(s.wave);
    if (arena !== this.arena) {
      this.changeArena(arena, () => this.time.delayedCall(1400, () => { if (!this.over) this.beginWave(); }));
    } else {
      this.beginWave();
    }
  }

  beginWave() {
    const s = this.stats;
    if (!this.boss) Music.play('main', this.mainBpm());
    if (s.wave % BOSS_EVERY === 0 && !this.boss) {
      this.startBoss();
    } else {
      const fresh = Object.entries(ENEMY_TYPES).find(([, t]) => !t.boss && t.minWave === s.wave);
      const type = fresh ? fresh[0] : this.pickType();
      this.banner(`WAVE ${s.wave}`, fresh ? fresh[1].intro : '');
      Sfx.play('wave');
      this.spawnEnemy(type);
      // Extra heroes: every 4th wave, and every other wave in co-op.
      // Hero threat: +1 hero every 3rd wave from threat 10, every 2nd from 20, every wave from 30.
      const threatEvery = this.threat >= 30 ? 1 : this.threat >= 20 ? 2 : this.threat >= 10 ? 3 : 0;
      const extra = (s.wave % 4 === 0 ? 1 : 0) + (this.coop && s.wave % 2 === 0 ? 1 : 0)
        + (threatEvery && s.wave % threatEvery === 0 ? 1 : 0);
      for (let i = 0; i < extra; i++) this.time.delayedCall(1500 * (i + 1), () => this.spawnEnemy(this.pickType()));
    }
    Bounties.start(this);
  }

  // ---------------------------------------------------------------- HUD & effects

  createHud() {
    const D = 1000;
    const top = HUD_H / 2, foot = H - FOOT_H / 2;
    this.add.rectangle(0, 0, W, HUD_H, 0x0d0b14).setOrigin(0).setDepth(D);
    this.add.rectangle(0, HUD_H - 2, W, 2, 0x3b3950).setOrigin(0).setDepth(D);
    this.add.rectangle(0, H - FOOT_H, W, FOOT_H, 0x0d0b14).setOrigin(0).setDepth(D);
    this.add.rectangle(0, H - FOOT_H, W, 2, 0x3b3950).setOrigin(0).setDepth(D);

    // P1 on the top bar with its combo on the top wall; P2 on the bottom bar with its combo on the bottom wall.
    const wallTop = HUD_H + 13, wallBottom = HUD_H + ARENA_H - 19;
    this.goblins.forEach((g, i) => this.createPlayerHud(g, i === 0 ? top : foot, i === 0 ? wallTop : wallBottom));

    this.bankedText = this.add.text(540, top, 'BANKED 0', textStyle(20, '#ffffff')).setOrigin(0.5).setDepth(D + 1);
    this.waveText = this.add.text(660, top, 'WAVE 1', textStyle(16, '#9badb7')).setOrigin(0.5).setDepth(D + 1);
    this.timeText = this.add.text(W - 14, top, '0:00', textStyle(16, '#9badb7')).setOrigin(1, 0.5).setDepth(D + 1);

    if (!this.coop) {
      this.add.text(14, foot, 'SHIFT/SPACE roll   E ability   P pause   M mute   N music', textStyle(12, '#6b6880')).setOrigin(0, 0.5).setDepth(D + 1);
    }

    // Bounty board: bottom bar, right side.
    const bx = 470, l1 = H - FOOT_H + 13, l2 = H - FOOT_H + 29;
    this.bountyLabel = this.add.text(bx, l1, 'BOUNTY', textStyle(11, '#ff9f43')).setOrigin(0, 0.5).setDepth(D + 1);
    this.bountyText = this.add.text(bx + 48, l1, '', textStyle(12, '#ffffff')).setOrigin(0, 0.5).setDepth(D + 1);
    this.add.rectangle(bx, l2, 100, 6, 0x2a2438).setOrigin(0, 0.5).setDepth(D + 1);
    this.bountyBar = this.add.rectangle(bx, l2, 100, 6, 0xff9f43).setOrigin(0, 0.5).setDepth(D + 2);
    this.bountyProg = this.add.text(bx + 106, l2, '', textStyle(11, '#ffffff')).setOrigin(0, 0.5).setDepth(D + 1);
    this.streakText = this.add.text(624, l2, '', textStyle(11, '#fbf236')).setOrigin(0, 0.5).setDepth(D + 1);
    this.add.rectangle(706, l2, 50, 3, 0x2a2438).setOrigin(0, 0.5).setDepth(D + 1);
    this.bountyTime = this.add.rectangle(706, l2, 50, 3, 0x9badb7).setOrigin(0, 0.5).setDepth(D + 2);

    // Boss survival timer sits on the bottom wall.
    const by = HUD_H + ARENA_H - 16;
    this.bossBar = this.add.rectangle(W / 2 - 150, by, 300, 10, 0xd95763).setOrigin(0, 0.5).setDepth(D + 1);
    this.bossUi = [
      this.add.rectangle(W / 2, by, 306, 16, 0x0d0b14).setDepth(D),
      this.bossBar,
      this.add.text(W / 2, by, 'PALADIN: SURVIVE', textStyle(11, '#ffffff')).setOrigin(0.5).setDepth(D + 2),
    ];
  }

  createPlayerHud(g, y, comboY) {
    const D = 1000;
    const x0 = this.coop ? 26 : 0;
    const h = {};
    if (this.coop) this.add.text(4, y, g.label, textStyle(13, g.color)).setOrigin(0, 0.5).setDepth(D + 1);
    if (g.maxHearts > 4) {
      // Too many to draw: one heart and an "n/max" count.
      h.hearts = [this.add.image(x0 + 22, y, 'heart').setDepth(D + 1)];
      h.heartText = this.add.text(x0 + 38, y, '', textStyle(16, '#d95763')).setOrigin(0, 0.5).setDepth(D + 1);
    } else {
      const spacing = g.maxHearts > 3 ? 23 : 28;
      h.hearts = Array.from({ length: g.maxHearts }, (_, i) => this.add.image(x0 + 22 + i * spacing, y, 'heart').setDepth(D + 1));
    }
    this.add.image(x0 + 118, y, 'coin_0').setDepth(D + 1);
    h.carried = this.add.text(x0 + 132, y, '0', textStyle(20, '#fbf236')).setOrigin(0, 0.5).setDepth(D + 1);
    this.add.text(x0 + 186, y, 'SPEED', textStyle(12, '#9badb7')).setOrigin(0, 0.5).setDepth(D + 1);
    this.add.rectangle(x0 + 236, y, 100, 12, 0x2a2438).setOrigin(0, 0.5).setDepth(D + 1);
    h.speedBar = this.add.rectangle(x0 + 236, y, 100, 12, 0x6abe30).setOrigin(0, 0.5).setDepth(D + 2);
    h.roll = this.add.text(x0 + 348, y, 'ROLL', textStyle(12, g.color)).setOrigin(0, 0.5).setDepth(D + 1);
    h.buffs = ['boots', 'smoke'].map((kind, i) => {
      const x = x0 + 402 + i * 26;
      return {
        kind,
        icon: this.add.image(x, y - 3, kind).setDepth(D + 1),
        bar: this.add.rectangle(x - 10, y + 12, 20, 3, 0xffffff).setOrigin(0, 0.5).setDepth(D + 1),
      };
    });
    h.comboText = this.add.text(40, comboY, '', textStyle(14, '#ff9f43')).setOrigin(0, 0.5).setDepth(D + 1);
    h.comboBar = this.add.rectangle(40, comboY + 11, 80, 3, 0xff9f43).setOrigin(0, 0.5).setDepth(D + 1);
    h.tripText = this.add.text(150, comboY, '', textStyle(12, '#fbf236')).setOrigin(0, 0.5).setDepth(D + 1);
    // Equipped ability: key + name with a recharge bar, on the same wall row as the combo.
    if (this.ability) {
      h.abilityLabel = `${g.controls.abilityKey}: ${UPGRADES[this.ability].name.toUpperCase()}`;
      h.abilityText = this.add.text(560, comboY, h.abilityLabel, textStyle(12, g.color)).setOrigin(0, 0.5).setDepth(D + 1);
      this.add.rectangle(560, comboY + 11, 90, 3, 0x2a2438).setOrigin(0, 0.5).setDepth(D + 1);
      h.abilityBar = this.add.rectangle(560, comboY + 11, 90, 3, 0xfbf236).setOrigin(0, 0.5).setDepth(D + 2);
    }
    g.hud = h;
  }

  updatePlayerHud(g) {
    const h = g.hud;
    if (h.heartText) {
      h.hearts[0].setTexture(g.hearts > 0 ? 'heart' : 'heart_empty');
      h.heartText.setText(`${g.hearts}/${g.maxHearts}`);
    } else {
      h.hearts.forEach((icon, i) => icon.setTexture(i < g.hearts ? 'heart' : 'heart_empty'));
    }
    if (h.abilityText) {
      const left = g.abilityReadyAt - this.clock;
      const ready = left <= 0 && !g.down;
      // Show a seconds countdown for long cooldowns (e.g. "E: SHIV 42s").
      h.abilityText.setText(left > 1500 ? `${h.abilityLabel} ${Math.ceil(left / 1000)}s` : h.abilityLabel);
      h.abilityText.setAlpha(ready ? 1 : 0.6);
      h.abilityBar.setScale(ready ? 1 : Phaser.Math.Clamp(1 - left / g.abilityCd, 0, 1), 1);
      h.abilityBar.fillColor = ready ? 0x6abe30 : 0xfbf236;
    }
    h.carried.setText(g.down ? 'DOWN' : String(g.carried)).setColor(g.down ? '#d95763' : '#fbf236');
    const f = g.down ? 0 : Math.min(1, this.currentSpeed(g) / BASE_SPEED);
    h.speedBar.setScale(f, 1);
    h.speedBar.fillColor = f > 0.6 ? 0x6abe30 : f > 0.4 ? 0xfbf236 : 0xd95763;
    h.roll.setAlpha(!g.down && this.clock >= g.nextRoll ? 1 : 0.25);

    for (const b of h.buffs) {
      const left = g.buffs[b.kind] - this.clock;
      const on = left > 0 && !g.down;
      b.icon.setVisible(on);
      b.bar.setVisible(on);
      if (on) b.bar.setScale(Math.min(1, left / (g.buffLen[b.kind] || this.buffDuration(g, b.kind))), 1);
    }

    const chaining = g.combo >= 2;
    const prefix = this.coop ? `${g.label} ` : '';
    h.comboText.setText(chaining ? `${prefix}COMBO ${g.combo}` : '');
    h.comboBar.setVisible(chaining);
    if (chaining) h.comboBar.setScale(Math.max(0, (g.comboUntil - this.clock) / COMBO.window), 1);
    const mult = this.comboMult(g);
    h.tripText.setText(mult > 1 ? `bank x${mult.toFixed(2)}` : '');
  }

  updateBountyHud() {
    const b = this.bounty;
    if (!b) return;
    this.bountyLabel.setText(Bounties.canReroll(this) ? 'BOUNTY [R]' : 'BOUNTY');
    this.bountyText.setX(this.bountyLabel.x + this.bountyLabel.width + 6).setText(b.def.text(b.target));
    let prog;
    if (b.done) prog = 'DONE!';
    else if (b.failed) prog = 'FAILED';
    else if (b.id === 'untouched') prog = 'no hits yet';
    else prog = `${Math.min(b.progress, b.target)}/${b.target}`;
    this.bountyProg.setText(prog).setColor(b.done ? '#6abe30' : b.failed ? '#d95763' : '#ffffff');
    const frac = b.done ? 1 : b.failed ? 0 : b.id === 'untouched' ? 1 : Math.min(1, b.progress / b.target);
    this.bountyBar.setScale(frac, 1);
    this.bountyBar.fillColor = b.done ? 0x6abe30 : 0xff9f43;
    this.bountyTime.setScale(Phaser.Math.Clamp((b.endsAt - this.clock) / WAVE_MS, 0, 1), 1);
    const streak = Bounties.streakMult(this);
    this.streakText.setText(streak > 1 ? `STREAK x${streak.toFixed(1)}` : '');
  }

  updateHud() {
    const s = this.stats;
    this.goblins.forEach((g) => this.updatePlayerHud(g));
    this.updateBountyHud();

    const bossOn = !!this.boss && this.boss.mode !== 'leave';
    this.bossUi.forEach((o) => o.setVisible(bossOn));
    if (bossOn) this.bossBar.setScale(Phaser.Math.Clamp((this.bossEnd - this.clock) / BOSS_DURATION, 0, 1), 1);

    // Count the score up instead of jumping, so banking feels like money pouring in.
    const gap = s.banked - this.displayBanked;
    this.displayBanked = gap < 1 ? s.banked : this.displayBanked + Math.max(1, gap * 0.12);
    this.bankedText.setText(`BANKED ${Math.floor(this.displayBanked)}`);
    if (!this.pbShown && this.bestAtStart > 0 && s.banked > this.bestAtStart) this.celebratePersonalBest();
    if (s.banked >= 500) this.achieve('score_500');
    if (s.banked >= 2000) this.achieve('score_2000');
    this.waveText.setText(`WAVE ${s.wave}`);
    const secs = Math.floor(s.elapsed / 1000);
    this.timeText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  }

  // ---------------------------------------------------------------- shop abilities & attributes

  // "Magnet Paws": grab ready coins within a radius without touching them.
  magnetPaws(g) {
    if (!this.upg.magnet || g.down) return;
    const r = 18 + 12 * this.upg.magnet;
    const pc = g.body.center;
    for (const coin of this.coins.getChildren()) {
      if (coin.ready && !coin.collected && Phaser.Math.Distance.Between(pc.x, pc.y, coin.x, coin.y) < r) this.collectCoin(g, coin);
    }
  }

  // The equipped ability (E / Y). Each use function returns its cooldown in ms.
  useAbility(g) {
    if (!this.ability || g.down) return;
    if (this.clock < g.abilityReadyAt) { Sfx.play('nope'); return; }
    const lvl = this.upg[this.ability];
    const use = {
      shiv: () => this.useShiv(g, lvl),
      caltrops: () => this.useCaltrops(g, lvl),
      coinmagnet: () => this.useCoinMagnet(g, lvl),
      smokepouch: () => this.useSmokePouch(g, lvl),
      decoy: () => this.useDecoy(g, lvl),
    }[this.ability];
    const cd = use();
    g.abilityCd = cd;
    g.abilityReadyAt = this.clock + cd;
  }

  facing(g) {
    return g.flipX ? -1 : 1;
  }

  // Stab the nearest hero in front: it's taken out for good. Bosses can never be killed; at level 3
  // the stab stuns them instead. Only a real kill (or boss stun) spends the long cooldown.
  useShiv(g, lvl) {
    const pc = g.body.center, dir = this.facing(g);
    const slash = this.add.graphics().setDepth(900);
    slash.lineStyle(3, 0xffffff, 0.9).beginPath();
    slash.arc(pc.x + dir * 10, pc.y - 4, 24, dir > 0 ? -1 : Math.PI - 1, dir > 0 ? 1 : Math.PI + 1, false).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, duration: 180, onComplete: () => slash.destroy() });
    Sfx.play('shiv');

    // Nearest hero in reach, preferring ones that can actually be killed over bosses.
    const isBoss = (e) => !!ENEMY_TYPES[e.kind].boss;
    let target = null, best = Infinity;
    for (const e of this.enemies.getChildren()) {
      if (e.gone || e.spawning) continue;
      const ec = e.body.center;
      const d = Phaser.Math.Distance.Between(pc.x, pc.y, ec.x, ec.y);
      const reach = isBoss(e) ? 56 : 44;
      // Anything touching counts; further out it has to be on the side we face.
      if (d > reach || (d > 20 && Math.sign(ec.x - pc.x) !== dir)) continue;
      const score = d + (isBoss(e) ? 1000 : 0);
      if (score < best) { best = score; target = e; }
    }
    const MISS_CD = 1000;
    if (!target) return MISS_CD;
    if (isBoss(target)) {
      if (lvl < 3) {
        this.floatText(target.x, target.y - 40, 'TOO TOUGH!', '#9badb7', 14);
        return MISS_CD;
      }
      this.stunEnemy(target, ABILITY_STATS.shiv.bossStun);
      return ABILITY_STATS.shiv.cooldown[lvl - 1];
    }
    this.killEnemy(target);
    return ABILITY_STATS.shiv.cooldown[lvl - 1];
  }

  // Remove a hero for good (Shiv). Bosses are never killable.
  killEnemy(e) {
    if (ENEMY_TYPES[e.kind].boss) return;
    e.gone = true;
    e.setVelocity(0, 0);
    e.body.enable = false;
    this.clearLine(e);
    this.clearStars(e);
    this.stats.kills++;
    this.scatterCoins(2 + e.stolen, e.body.center);
    this.floatText(e.x, e.y - 24, 'SHIV!', '#d95763', 16);
    this.cameras.main.shake(100, 0.006);
    Sfx.play('kill');
    e.anims.stop();
    e.setTintFill(0xd95763);
    this.tweens.add({ targets: e, angle: 90, alpha: 0, y: e.y + 6, duration: 450, onComplete: () => e.destroy() });
  }

  // Drop a patch of caltrops behind you; heroes that step in are stunned (once every few seconds).
  // Only a couple of patches can be out; a new one replaces the oldest.
  useCaltrops(g, lvl) {
    const stats = ABILITY_STATS.caltrops;
    while (this.caltrops.length >= stats.maxPatches) {
      const old = this.caltrops.shift();
      this.tweens.add({ targets: old.gfx, alpha: 0, duration: 200, onComplete: () => old.gfx.destroy() });
    }
    const pc = g.body.center, back = -this.facing(g);
    const x = pc.x + back * 18, y = pc.y;
    const gfx = this.add.graphics({ x, y }).setDepth(3);
    gfx.lineStyle(2, 0xcbdbfc, 0.9);
    for (let i = 0; i < 9; i++) {
      const cx = Phaser.Math.Between(-20, 20), cy = Phaser.Math.Between(-16, 16);
      gfx.lineBetween(cx - 3, cy - 3, cx + 3, cy + 3).lineBetween(cx - 3, cy + 3, cx + 3, cy - 3);
    }
    gfx.setScale(0.3);
    this.tweens.add({ targets: gfx, scale: 1, duration: 150, ease: 'Back.easeOut' });
    this.caltrops.push({ x, y, r: 26, until: this.clock + ABILITY_STATS.caltrops.duration[lvl - 1], gfx });
    Sfx.play('caltrops');
    return ABILITY_STATS.caltrops.cooldown[lvl - 1];
  }

  updateCaltrops() {
    this.caltrops = this.caltrops.filter((p) => {
      if (this.clock >= p.until) {
        this.tweens.add({ targets: p.gfx, alpha: 0, duration: 300, onComplete: () => p.gfx.destroy() });
        return false;
      }
      for (const e of this.enemies.getChildren()) {
        if (e.gone || e.spawning || (e.caltropSafe || 0) > this.clock) continue;
        if (Phaser.Math.Distance.Between(e.body.center.x, e.body.center.y, p.x, p.y) < p.r) {
          e.caltropSafe = this.clock + ABILITY_STATS.caltrops.immunity;
          this.stunEnemy(e, ABILITY_STATS.caltrops.stun, 'hazard');
        }
      }
      return true;
    });
  }

  // Yank every nearby coin to you.
  useCoinMagnet(g, lvl) {
    const r = ABILITY_STATS.coinmagnet.radius[lvl - 1];
    const pc = g.body.center;
    this.ring(pc.x, pc.y, r, 0xfbf236);
    Sfx.play('magnet');
    for (const coin of this.coins.getChildren()) {
      if (!coin.ready || coin.collected || Phaser.Math.Distance.Between(pc.x, pc.y, coin.x, coin.y) > r) continue;
      coin.ready = false;
      coin.magnetPulled = true;
      this.tweens.killTweensOf(coin);
      this.tweens.add({
        targets: coin, x: pc.x, y: pc.y, duration: 250, ease: 'Quad.easeIn',
        onComplete: () => { coin.ready = true; if (!g.down) this.collectCoin(g, coin); },
      });
    }
    return ABILITY_STATS.coinmagnet.cooldown[lvl - 1];
  }

  useSmokePouch(g, lvl) {
    // Shadow gets +50% on pouch smoke (it doubles Smoke Bomb pickups, which are rarer).
    const len = POWERUPS.smoke.duration * (g.perk === 'shadow' ? ABILITY_STATS.smokepouch.shadowBonus : 1);
    g.buffs.smoke = this.clock + len;
    g.buffLen.smoke = len;
    PowerUps.smokePuff(this, g);
    Sfx.play('powerup');
    return ABILITY_STATS.smokepouch.cooldown[lvl - 1];
  }

  // Toss a shiny fake coin; most heroes (and thieves) chase it until it pops.
  useDecoy(g, lvl) {
    if (this.decoy) this.endDecoy();
    const pc = g.body.center, dir = this.facing(g);
    let x = pc.x, y = pc.y;
    for (let d = 110; d >= 0; d -= 10) {
      const t = worldToTile(pc.x + dir * d, pc.y);
      if (this.isFree(t.c, t.r)) { x = pc.x + dir * d; break; }
    }
    const img = this.add.sprite(pc.x, pc.y, 'coin_0').play('coin_spin').setScale(1.8).setDepth(5);
    this.tweens.add({ targets: img, x, duration: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: img, y: y - 24, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    const t = worldToTile(x, y);
    this.decoy = {
      x, y, img, isDecoy: true, down: false, buffs: {},
      body: { center: { x, y } },
      flow: this.bfs(t.c, t.r),
      until: this.clock + ABILITY_STATS.decoy.duration[lvl - 1],
      nextRing: this.clock + 300,
    };
    Sfx.play('decoy');
    return ABILITY_STATS.decoy.cooldown[lvl - 1];
  }

  updateDecoy() {
    const d = this.decoy;
    if (!d) return;
    if (this.clock >= d.until) { this.endDecoy(); return; }
    // A hero that reaches the decoy pops it, so where you throw it matters.
    const reached = this.enemies.getChildren().some((e) => !e.gone && !e.spawning && e.mode !== 'stun'
      && this.targetFor(e) === d && Phaser.Math.Distance.Between(e.body.center.x, e.body.center.y, d.x, d.y) < 18);
    if (reached) {
      this.floatText(d.x, d.y - 20, 'POP!', '#fbf236', 14);
      this.endDecoy();
      return;
    }
    if (this.clock >= d.nextRing) {
      this.ring(d.x, d.y, 30, 0xfbf236);
      d.nextRing = this.clock + 500;
    }
  }

  endDecoy() {
    const d = this.decoy;
    this.decoy = null;
    this.tweens.killTweensOf(d.img);
    this.chips.explode(10, d.x, d.y);
    this.tweens.add({ targets: d.img, scale: 0, alpha: 0, duration: 200, onComplete: () => d.img.destroy() });
  }

  mainBpm() {
    return SONGS.main.bpm + Math.min(this.stats.wave - 1, 12) * 3;
  }

  // Unlock an achievement (and any skin tied to it) with a toast, only the first time.
  achieve(id) {
    if (!Progress.unlock(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    this.toast('ACHIEVEMENT UNLOCKED', a.name, 'trophy');
    const skin = SKINS.find((s) => s.unlock === id);
    if (skin) this.toast('NEW SKIN UNLOCKED', `${skin.name}: ${skin.perk}`, `gob_${skin.id}_0`);
  }

  toast(title, text, icon) {
    this.toastQueue.push({ title, text, icon });
    if (!this.toastBusy) this.nextToast();
  }

  // Toasts slide in under the top-right of the HUD, one at a time.
  nextToast() {
    const t = this.toastQueue.shift();
    if (!t) { this.toastBusy = false; return; }
    this.toastBusy = true;
    Sfx.play('achieve');
    const w = 320, h = 44;
    const restX = W - 8 - w / 2, y = HUD_H + 72; // below the ability readout on the top wall
    const box = this.add.container(W + w / 2, y).setDepth(1600);
    box.add([
      this.add.rectangle(0, 0, w, h, 0x0d0b14, 0.92).setStrokeStyle(2, 0xfbf236),
      this.add.image(-w / 2 + 22, 0, t.icon).setScale(t.icon === 'trophy' ? 1.5 : 1),
      this.add.text(-w / 2 + 44, -9, t.title, textStyle(10, '#ff9f43')).setOrigin(0, 0.5),
      this.add.text(-w / 2 + 44, 8, t.text, textStyle(12, '#ffffff')).setOrigin(0, 0.5),
    ]);
    this.tweens.add({ targets: box, x: restX, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: box, x: W + w / 2, delay: 2800, duration: 250, ease: 'Quad.easeIn',
      onComplete: () => { box.destroy(); this.nextToast(); },
    });
  }

  floatText(x, y, msg, color, size = 20, duration = 900) {
    const t = this.add.text(x, y, msg, textStyle(size, color)).setOrigin(0.5).setDepth(950);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  banner(title, sub) {
    const items = [this.add.text(W / 2, H / 2 - 30, title, textStyle(44, '#ffffff'))];
    if (sub) items.push(this.add.text(W / 2, H / 2 + 16, sub, textStyle(20, '#ff9f43')));
    items.forEach((t) => t.setOrigin(0.5).setDepth(1500).setAlpha(0).setScale(0.4));
    this.tweens.add({ targets: items, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: items, alpha: 0, delay: 1500, duration: 400, onComplete: () => items.forEach((t) => t.destroy()) });
  }

  togglePause() {
    if (this.over || this.transitioning) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      this.time.paused = true;
      this.tweens.pauseAll();
      this.anims.pauseAll();
      Music.pause();
      const help = 'P / Start to resume\n\nE / Y ability    R / Back reroll bounty\nM mute all    N music on/off';
      this.pauseUi = [
        this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(2000),
        this.add.text(W / 2, H / 2 - 40, 'PAUSED', textStyle(36, '#ffffff')).setOrigin(0.5).setDepth(2001),
        this.add.text(W / 2, H / 2 + 20, help, { ...textStyle(16, '#9badb7'), align: 'center' }).setOrigin(0.5).setDepth(2001),
      ];
    } else {
      this.physics.world.resume();
      this.time.paused = false;
      this.tweens.resumeAll();
      this.anims.resumeAll();
      Music.resume();
      this.pauseUi.forEach((o) => o.destroy());
    }
  }

  gameOver() {
    this.over = true;
    this.physics.world.pause();
    Music.stop();
    Sfx.play('gameover');
    Progress.addRun(this.stats.banked);
    if (Progress.load().lifetimeGold >= 5000) this.achieve('lifetime_5000');
    this.stats.skins = this.goblins.map((g) => g.skin);
    this.stats.wallet = Progress.load().wallet;
    if (this.decoy) this.endDecoy();
    for (const g of this.goblins) {
      this.tweens.killTweensOf(g);
      g.anims.stop();
      g.setAlpha(1).clearTint();
      if (g.reviveArc) g.reviveArc.clear();
      this.tweens.add({ targets: g, angle: g.angle + 720, scale: 0, duration: 1000, ease: 'Cubic.easeIn' });
    }
    this.updateHud();
    this.time.delayedCall(1500, () => this.scene.start('GameOver', { ...this.stats }));
  }

  handleDebugKeys() {
    const k = this.keys;
    for (const [key, what] of Object.entries(DEBUG_SPAWNS)) {
      if (!Phaser.Input.Keyboard.JustDown(k[key])) continue;
      if (what === 'chest') this.spawnChest();
      else if (what === 'barrel') Hazards.trySpawnBarrel(this, true);
      else if (POWERUPS[what]) PowerUps.trySpawn(this, what);
      else if (what === 'paladin') { if (!this.boss) this.startBoss(); }
      else this.spawnEnemy(what);
    }
    if (Phaser.Input.Keyboard.JustDown(k.G)) this.goblins[0].carried += 10;
    // V: jump to the next arena.
    if (Phaser.Input.Keyboard.JustDown(k.V) && !this.transitioning) {
      const next = ARENAS[(ARENAS.indexOf(this.arena) + 1) % ARENAS.length];
      this.changeArena(next, () => {});
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time, delta) {
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.P) || Phaser.Input.Keyboard.JustDown(k.ESC)) this.togglePause();
    if (Phaser.Input.Keyboard.JustDown(k.M)) {
      const muted = Sfx.toggleMute();
      this.floatText(W / 2, HUD_H + 30, muted ? 'MUTED' : 'SOUND ON', '#9badb7', 16);
    }
    if (Phaser.Input.Keyboard.JustDown(k.N)) {
      const on = Music.toggle();
      this.floatText(W / 2, HUD_H + 30, on ? 'MUSIC ON' : 'MUSIC OFF', '#9badb7', 16);
    }
    // Everything freezes while paused, after game over, and during an arena change fade.
    if (this.paused || this.over || this.transitioning) {
      this.rollRequests.clear();
      this.abilityRequests.clear();
      this.rerollRequested = false;
      return;
    }
    // Hit-stop: gameplay holds for a moment (inputs stay queued); the score keeps counting up.
    if (this.frozen) {
      this.updateHud();
      return;
    }
    if (this.debug) this.handleDebugKeys();

    this.clock += delta;
    this.stats.elapsed += delta;

    for (const g of this.rollRequests) this.tryRoll(g);
    this.rollRequests.clear();
    for (const g of this.abilityRequests) this.useAbility(g);
    this.abilityRequests.clear();
    if (this.rerollRequested) Bounties.reroll(this);
    this.rerollRequested = false;
    for (const g of this.goblins) {
      this.moveGoblin(g);
      this.checkStash(g);
      this.updateRevive(g, delta);
      this.magnetPaws(g);
      if (g.combo && this.clock >= g.comboUntil) g.combo = 0;
      if (!g.down && this.buffActive(g, 'boots') && this.clock >= g.nextTrail) {
        this.ghost(g, 0xfbf236, 0.45);
        g.nextTrail = this.clock + 60;
      }
    }
    this.enemies.getChildren().slice().forEach((e) => this.updateEnemy(e));
    this.arrows.getChildren().slice().forEach((a) => { if (this.clock > a.dieAt) a.destroy(); });
    this.updateIce();
    this.updateCaltrops();
    this.updateDecoy();
    this.updateChest(delta);
    Hazards.update(this);
    PowerUps.update(this);
    this.updateBoss();
    this.updateHud();
  }
}
