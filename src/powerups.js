// Power-up pickups. Buffs belong to the goblin that grabbed them (goblin.buffs) and their
// timers are compared against scene.clock, so they freeze while the game is paused.

const PowerUps = {
  init(scene) {
    scene.powerups = scene.physics.add.group();
    for (const g of scene.goblins) {
      scene.physics.add.overlap(g, scene.powerups, (_g, pu) => PowerUps.collect(scene, g, pu));
    }
    scene.time.addEvent({ delay: 12000, loop: true, callback: () => PowerUps.trySpawn(scene) });
  },

  trySpawn(scene, forceKind = null) {
    if (scene.over) return;
    if (!forceKind && (scene.stats.wave < 2 || scene.powerups.countActive(true) > 0 || Math.random() > 0.35)) return;

    let kind = forceKind;
    if (!kind) {
      const pool = ['boots', 'smoke'];
      if (scene.goblins.some((g) => !g.down && g.hearts < g.maxHearts)) pool.push('potion', 'potion');
      kind = Phaser.Utils.Array.GetRandom(pool);
    }
    const spot = scene.randomFreeSpot(120);
    if (!spot) return;

    const pu = scene.powerups.create(spot.x, spot.y, kind).setDepth(5);
    pu.kind = kind;
    pu.expireAt = scene.clock + 10000;
    pu.setScale(0);
    scene.tweens.add({ targets: pu, scale: 1.25, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: pu, y: pu.y - 5, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.ring(pu.x, pu.y, 28, 0xffffff);
  },

  // Expire old pickups, blinking during their last 3 seconds.
  update(scene) {
    for (const pu of scene.powerups.getChildren().slice()) {
      const left = pu.expireAt - scene.clock;
      if (left <= 0) {
        scene.tweens.killTweensOf(pu);
        pu.destroy();
      } else {
        pu.setVisible(left > 3000 || Math.floor(left / 150) % 2 === 0);
      }
    }
  },

  collect(scene, g, pu) {
    if (scene.over || g.down || !pu.active) return;
    const kind = pu.kind;
    const { x, y } = pu;
    scene.tweens.killTweensOf(pu);
    pu.destroy();
    Sfx.play('powerup');
    scene.floatText(x, y - 16, POWERUPS[kind].label, '#ffffff', 16, 1200);

    if (kind === 'potion') {
      // Heal the grabber, or their partner if the grabber is already at full health.
      const patient = [g, ...scene.goblins.filter((o) => o !== g && !o.down)].find((o) => o.hearts < o.maxHearts);
      if (patient) {
        patient.hearts++;
        scene.tweens.add({ targets: patient.hud.hearts[patient.hearts - 1], scale: 1.8, duration: 150, yoyo: true });
      } else {
        scene.stats.banked += 10;
      }
    } else {
      g.buffs[kind] = scene.clock + scene.buffDuration(g, kind);
      if (kind === 'smoke') PowerUps.smokePuff(scene, g);
    }
  },

  smokePuff(scene, g) {
    const p = g.body.center;
    for (let i = 0; i < 10; i++) {
      const c = scene.add.circle(
        p.x + Phaser.Math.Between(-14, 14), p.y + Phaser.Math.Between(-14, 14),
        Phaser.Math.Between(6, 12), 0x847e87, 0.8,
      ).setDepth(850);
      scene.tweens.add({ targets: c, scale: 3, alpha: 0, duration: Phaser.Math.Between(500, 900), onComplete: () => c.destroy() });
    }
  },
};
