class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(stats) {
    const coop = !!stats.coop;
    const best = Store.getBest(coop);
    const isBest = stats.banked > best;
    if (isBest) Store.setBest(stats.banked, coop);

    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0).setAlpha(0.35);

    this.add.text(W / 2, 68, 'CAUGHT!', textStyle(60, '#d95763')).setOrigin(0.5);
    // What landed the final blow, so each death teaches something.
    const caught = `${stats.caughtBy || 'Caught'} on wave ${stats.wave}${coop ? '  (co-op)' : ''}`;
    this.add.text(W / 2, 110, caught, textStyle(15, '#cbdbfc')).setOrigin(0.5);
    this.add.text(W / 2, 148, `SCORE  ${stats.banked}`, textStyle(34, '#fbf236')).setOrigin(0.5);

    // Near-misses are the strongest "one more try" hook, so call them out.
    const gap = best - stats.banked;
    const nearMiss = !isBest && best > 0 && gap <= Math.max(25, best * 0.15);
    if (isBest) {
      const beat = best > 0 ? `  (+${stats.banked - best} over your old best)` : '';
      const nb = this.add.text(W / 2, 190, `NEW BEST!${beat}`, textStyle(22, '#ff9f43')).setOrigin(0.5);
      this.tweens.add({ targets: nb, scale: 1.1, duration: 400, yoyo: true, repeat: -1 });
    } else if (nearMiss) {
      const nm = this.add.text(W / 2, 190, gap === 0 ? `TIED your best of ${best}!` : `SO CLOSE! Only ${gap} from your best (${best})`, textStyle(20, '#ff9f43')).setOrigin(0.5);
      this.tweens.add({ targets: nm, alpha: 0.5, duration: 450, yoyo: true, repeat: -1 });
    } else {
      this.add.text(W / 2, 190, `BEST  ${best}`, textStyle(20, '#9badb7')).setOrigin(0.5);
    }

    const secs = Math.floor(stats.elapsed / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const lines = [
      `Gold banked ...... ${stats.coinsBanked}`,
      `Biggest haul ..... ${stats.bestHaul}`,
      `Gold dropped ..... ${stats.goldLost}`,
      `Heroes shivved ... ${stats.kills}`,
      `Bounties claimed . ${stats.bounties}  (best streak ${stats.bestStreak})`,
      `Survived ......... ${time}`,
    ];
    this.add.text(W / 2, 285, lines.join('\n'), { ...textStyle(16, '#ffffff'), lineSpacing: 6 }).setOrigin(0.5);
    if (stats.power) this.add.text(W / 2, 371, `Upgrade power ${stats.power}`, textStyle(12, '#9badb7')).setOrigin(0.5);

    this.createGoldPanel(stats);

    const prompt = this.add.text(W / 2, 494, 'SPACE try again     B shop     M menu', textStyle(22, '#ffffff')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });

    const skins = stats.skins || ['gob_classic'];
    skins.forEach((key, i) => {
      const x = W / 2 + (i - (skins.length - 1) / 2) * 90;
      const gob = this.add.sprite(x, H - 90, `${key}_0`).setScale(3).setAngle(90).setAlpha(0.8);
      this.tweens.add({ targets: gob, y: H - 96, duration: 600, yoyo: true, repeat: -1, delay: i * 200 });
    });

    // Short delay so a held key from the last moment of play doesn't skip this screen.
    let leaving = false;
    const go = (scene, data) => {
      if (leaving) return;
      leaving = true;
      Sfx.play('select');
      this.scene.start(scene, data);
    };
    const retry = () => go('Game', { coop });
    const menu = () => go('Menu');
    const shop = () => go('Shop');
    this.time.delayedCall(600, () => {
      this.input.keyboard.once('keydown-SPACE', retry);
      this.input.keyboard.once('keydown-M', menu);
      this.input.keyboard.once('keydown-B', shop);
      this.input.once('pointerdown', retry);
      // Gamepad: A / Start retry, X shop, B menu.
      if (this.input.gamepad) {
        const onPad = (_pad, { index }) => {
          if (index === 0 || index === PAD.pause) retry();
          else if (index === PAD.shop) shop();
          else if (index === PAD.back) menu();
        };
        this.input.gamepad.on('down', onPad);
        this.events.once('shutdown', () => this.input.gamepad.off('down', onPad));
      }
    });
    this.time.delayedCall(1200, () => Music.play('menu', 84));
  }

  // Shop gold counts up from its pre-run total, then points at the next thing to buy:
  // everything now affordable (with the newly affordable ones called out), or the gap to the
  // cheapest next upgrade.
  createGoldPanel(stats) {
    const after = Progress.load().wallet;
    const earned = stats.goldEarned ?? stats.coinsBanked ?? 0; // shop gold, incl. Classic's bonus
    const before = Math.max(0, after - earned);
    const goal = this.nextGoal(after);

    const goldText = this.add.text(W / 2 + 8, 404, '', textStyle(24, '#fbf236')).setOrigin(1, 0.5);
    this.add.text(W / 2 + 18, 404, `+${earned} this run`, textStyle(15, earned ? '#6abe30' : '#9badb7')).setOrigin(0, 0.5);
    const goalText = this.add.text(W / 2, 433, '', textStyle(14, '#ffffff')).setOrigin(0.5);
    const barW = 320;
    this.add.rectangle(W / 2 - barW / 2, 454, barW, 8, 0x2a2438).setOrigin(0, 0.5);
    const bar = this.add.rectangle(W / 2 - barW / 2, 454, barW, 8, 0xfbf236).setOrigin(0, 0.5);

    const target = goal.target && goal.target.cost;
    const show = (wallet) => {
      goldText.setText(`GOLD ${Math.floor(wallet).toLocaleString()}`);
      bar.setScale(target ? Math.min(1, wallet / target) : 1, 1);
    };
    show(before);

    const finish = () => {
      show(after);
      if (goal.done) {
        goalText.setText('Everything in the shop is maxed out!').setColor('#6abe30');
        bar.fillColor = 0x6abe30;
      } else if (goal.affordable) {
        const fresh = goal.affordable.filter((o) => o.cost > before);
        const names = goal.affordable.slice(0, 2).map((o) => o.label).join(', ');
        const more = goal.affordable.length > 2 ? ` +${goal.affordable.length - 2} more` : '';
        goalText.setText(`${fresh.length ? 'NEW! ' : ''}You can afford ${names}${more}. B to shop!`).setColor('#6abe30');
        if (goalText.width > W - 40) goalText.setScale((W - 40) / goalText.width);
        bar.fillColor = 0x6abe30;
        this.tweens.add({ targets: goalText, scale: goalText.scaleX * 1.06, duration: 400, yoyo: true, repeat: -1 });
        if (fresh.length) Sfx.play('buy');
      } else {
        goalText.setText(`${(target - after).toLocaleString()} more gold until ${goal.target.label}`);
      }
    };

    if (earned <= 0) { finish(); return; }
    // Count up with ticks that rise in pitch as the total climbs.
    let lastTick = 0;
    this.tweens.addCounter({
      from: before, to: after, delay: 500, duration: Math.min(1600, 400 + earned * 15), ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        show(tw.getValue());
        const now = this.time.now;
        if (now - lastTick > 70) {
          lastTick = now;
          Sfx.play('tick', Math.floor(tw.progress * 20));
        }
      },
      onComplete: finish,
    });
  }

  nextGoal(wallet) {
    // "Quick Roll" for a first purchase, "Quick Roll Lv 2" for later levels.
    const label = (id, lvl) => (lvl > 0 ? `${UPGRADES[id].name} Lv ${lvl + 1}` : UPGRADES[id].name);
    const options = Object.keys(UPGRADES)
      .map((id) => ({ id, cost: Progress.nextCost(id), label: label(id, Progress.level(id)) }))
      .filter((o) => o.cost !== null)
      .sort((a, b) => a.cost - b.cost);
    if (!options.length) return { done: true };
    const affordable = options.filter((o) => o.cost <= wallet);
    return affordable.length ? { affordable } : { target: options[0] };
  }
}
