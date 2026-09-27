// Per-kind adventurer behavior. Each function runs once per frame as (scene, enemy, now).
// Windup states set `e.windTint`; GameScene.updateEnemy applies tints after the AI runs.
// scene.targetFor(e) is the nearest goblin the hero can see (null if all are down or smoke-hidden),
// or an active decoy coin; scene.chase(e) already falls back to wandering when there is none.
// scene.cd(ms) shortens attack cooldowns as hero threat rises.

const dist = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
const angleTo = (a, b) => Phaser.Math.Angle.Between(a.x, a.y, b.x, b.y);

// Ranged heroes: back off when too close, hold position with line of sight, otherwise close in.
function kite(scene, e, pc, d, los, minDist) {
  if (los && d < minDist) scene.moveAway(e, pc, scene.speedOf(e));
  else if (los) e.setVelocity(0, 0);
  else scene.chase(e);
}

// Pick (and periodically re-pick) the nearest pickable coin, with a BFS path to it in e.flow.
function targetCoin(scene, e, now, filter = () => true) {
  const valid = (c) => c && c.scene && c.ready && !c.collected && filter(c);
  if (!valid(e.coinTarget) || now >= e.nextPath) {
    e.nextPath = now + 300;
    const ec = e.body.center;
    let best = null, bestD = Infinity;
    for (const c of scene.coins.getChildren()) {
      if (!valid(c)) continue;
      const d = dist(ec, c);
      if (d < bestD) { bestD = d; best = c; }
    }
    e.coinTarget = best;
    if (best) {
      const t = worldToTile(best.x, best.y);
      e.flow = scene.bfs(t.c, t.r);
    }
  }
  return e.coinTarget;
}

const ENEMY_AI = {
  knight(scene, e) {
    scene.chase(e);
  },

  archer(scene, e, now) {
    if (e.mode === 'aim') {
      e.setVelocity(0, 0);
      if (now >= e.fireAt) {
        e.windTint = null;
        scene.fireArrow(e, e.aimTarget);
        e.mode = 'move';
        e.nextShot = now + scene.cd(1700);
      }
      return;
    }
    const tgt = scene.targetFor(e);
    if (!tgt) return scene.chase(e);
    const ec = e.body.center, pc = tgt.body.center, d = dist(ec, pc);
    const los = d < 280 && scene.hasLOS(ec.x, ec.y, pc.x, pc.y, 3);
    if (los && now >= e.nextShot) {
      e.mode = 'aim';
      e.aimTarget = tgt;
      e.fireAt = now + 380;
      e.windTint = 0xff9f43;
      Sfx.play('windup');
    } else {
      kite(scene, e, pc, d, los, 140);
    }
  },

  rogue(scene, e, now) {
    if (e.mode === 'windup') {
      e.setVelocity(0, 0);
      if (now >= e.dashAt) {
        e.windTint = null;
        const a = angleTo(e.body.center, e.dashTarget);
        e.setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
        e.mode = 'dash';
        e.dashEnd = now + 320;
        Sfx.play('dash');
      }
      return;
    }
    if (e.mode === 'dash') {
      if (now >= e.dashEnd) { e.mode = 'move'; e.nextDash = now + scene.cd(2300); }
      return;
    }
    const tgt = scene.targetFor(e);
    if (!tgt) return scene.chase(e);
    const ec = e.body.center, pc = tgt.body.center;
    if (dist(ec, pc) < 220 && now >= e.nextDash && scene.hasLOS(ec.x, ec.y, pc.x, pc.y, 9)) {
      e.mode = 'windup';
      e.dashAt = now + 320;
      e.dashTarget = { x: pc.x, y: pc.y };
      e.windTint = 0xd95763;
    } else {
      scene.chase(e);
    }
  },

  // Drops a slowing ice patch where the goblin stood when the cast began (telegraphed by a ring).
  mage(scene, e, now) {
    if (e.mode === 'cast') {
      e.setVelocity(0, 0);
      if (now >= e.castAt) {
        e.windTint = null;
        e.mode = 'move';
        e.nextCast = now + scene.cd(3800);
        scene.createIce(e.castTarget.x, e.castTarget.y);
      }
      return;
    }
    const tgt = scene.targetFor(e);
    if (!tgt) return scene.chase(e);
    const ec = e.body.center, pc = tgt.body.center, d = dist(ec, pc);
    const los = d < 300 && scene.hasLOS(ec.x, ec.y, pc.x, pc.y);
    if (los && now >= e.nextCast) {
      e.mode = 'cast';
      e.castAt = now + 600;
      e.castTarget = { x: pc.x, y: pc.y };
      e.windTint = 0x5fcde4;
      scene.telegraphCircle(pc.x, pc.y, ICE_RADIUS, 600, 0x9fdcf2);
      Sfx.play('windup');
    } else {
      kite(scene, e, pc, d, los, 160);
    }
  },

  // Tags along with the nearest ally and periodically speeds up everyone nearby.
  cleric(scene, e, now) {
    const ec = e.body.center;
    let ally = null, best = Infinity;
    for (const o of scene.enemies.getChildren()) {
      if (o === e || o.gone || o.spawning || o.kind === 'cleric' || o.harmless) continue;
      const d = dist(ec, o.body.center);
      if (d < best) { best = d; ally = o; }
    }
    if (ally && best > 56 && scene.hasLOS(ec.x, ec.y, ally.body.center.x, ally.body.center.y, 9)) {
      scene.moveToward(e, ally.body.center, scene.speedOf(e));
    } else {
      scene.chase(e);
    }

    if (now >= e.nextBless) {
      e.nextBless = now + scene.cd(4000);
      let blessed = 0;
      for (const o of scene.enemies.getChildren()) {
        if (o === e || o.gone || dist(ec, o.body.center) > 120) continue;
        o.blessUntil = now + 4000;
        blessed++;
      }
      scene.ring(ec.x, ec.y, 120, 0xfbf236);
      if (blessed) Sfx.play('bless');
    }
  },

  // Harmless, but steals floor gold (a treasure chest first). Leaves through a door after 3 coins;
  // bump it to get them back.
  thief(scene, e, now) {
    if (e.mode === 'leave') return scene.leave(e);
    const ec = e.body.center;

    // A decoy coin is irresistible.
    if (scene.decoy) return scene.moveToward(e, scene.nextStep(e, scene.decoy.flow, scene.decoy), scene.speedOf(e));

    const chest = scene.chest;
    if (chest) {
      if (dist(ec, chest) < 16) return scene.stealChest(e);
      if (e.chestTarget !== chest || now >= e.nextPath) {
        e.chestTarget = chest;
        e.nextPath = now + 300;
        const t = worldToTile(chest.x, chest.y);
        e.flow = scene.bfs(t.c, t.r);
      }
      return scene.moveToward(e, scene.nextStep(e, e.flow, chest), scene.speedOf(e));
    }

    const coin = targetCoin(scene, e, now);
    if (!coin) {
      if (e.stolenCount > 0) e.mode = 'leave';
      else scene.wander(e, scene.speedOf(e) * 0.6);
    } else if (dist(ec, coin) < 14) {
      scene.stealCoin(e, coin);
    } else {
      scene.moveToward(e, scene.nextStep(e, e.flow, coin), scene.speedOf(e));
    }
  },

  // Seeds bear traps on coins (and in open floor), and keeps its distance from the goblin.
  trapper(scene, e, now) {
    const ec = e.body.center;
    const tgt = scene.targetFor(e);
    if (tgt && dist(ec, tgt.body.center) < 120) {
      scene.moveAway(e, tgt.body.center, scene.speedOf(e));
      return;
    }
    if (!Hazards.canPlace(scene, e)) {
      scene.wander(e, scene.speedOf(e) * 0.7);
      return;
    }
    const ready = now >= e.nextTrap;
    const coin = targetCoin(scene, e, now, (c) => !c.trapped);
    if (coin) {
      if (dist(ec, coin) < 20) {
        e.setVelocity(0, 0);
        if (ready) {
          if (Hazards.placeTrap(scene, e, coin.x, coin.y)) e.nextTrap = now + scene.cd(TRAP.every);
          coin.trapped = true; // placed, or the spot was invalid: skip this coin either way
          e.coinTarget = null;
        }
      } else {
        scene.moveToward(e, scene.nextStep(e, e.flow, coin), scene.speedOf(e));
      }
    } else {
      scene.wander(e, scene.speedOf(e) * 0.7);
      if (ready && Hazards.placeTrap(scene, e, ec.x, ec.y)) e.nextTrap = now + scene.cd(TRAP.every);
    }
  },

  // Boss: telegraphs a straight-line charge, and gets stunned if it slams into a wall.
  paladin(scene, e, now) {
    if (e.mode === 'leave') return scene.leave(e);
    if (e.mode === 'telegraph') {
      e.setVelocity(0, 0);
      if (now >= e.chargeAt) {
        e.mode = 'charge';
        e.windTint = null;
        e.chargeEnd = now + 1400;
        scene.clearLine(e);
        Sfx.play('charge');
      }
      return;
    }
    if (e.mode === 'charge') {
      if (now >= e.chargeEnd) {
        e.mode = 'move';
        e.nextCharge = now + scene.cd(3000);
      } else {
        e.setVelocity(Math.cos(e.chargeAngle) * 420, Math.sin(e.chargeAngle) * 420);
      }
      return;
    }
    const tgt = scene.targetFor(e);
    if (!tgt) return scene.chase(e);
    const ec = e.body.center, pc = tgt.body.center;
    if (now >= e.nextCharge && dist(ec, pc) < 420 && scene.hasLOS(ec.x, ec.y, pc.x, pc.y, 14)) {
      e.mode = 'telegraph';
      e.chargeAngle = angleTo(ec, pc);
      e.chargeAt = now + 800;
      e.windTint = 0xd95763;
      scene.drawChargeLine(e);
      Sfx.play('windup');
    } else {
      scene.chase(e);
    }
  },
};
