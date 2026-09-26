class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(stats) {
    const coop = !!stats.coop;
    const best = Store.getBest(coop);
    const isBest = stats.banked > best;
    if (isBest) Store.setBest(stats.banked, coop);

    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0).setAlpha(0.35);

    this.add.text(W / 2, 110, 'CAUGHT!', textStyle(64, '#d95763')).setOrigin(0.5);
    this.add.text(W / 2, 190, `SCORE  ${stats.banked}`, textStyle(36, '#fbf236')).setOrigin(0.5);
    if (coop) this.add.text(W / 2, 156, 'CO-OP', textStyle(16, '#9fdcf2')).setOrigin(0.5);

    if (isBest) {
      const nb = this.add.text(W / 2, 240, 'NEW BEST!', textStyle(26, '#ff9f43')).setOrigin(0.5);
      this.tweens.add({ targets: nb, scale: 1.15, duration: 400, yoyo: true, repeat: -1 });
    } else {
      this.add.text(W / 2, 240, `BEST  ${best}`, textStyle(22, '#9badb7')).setOrigin(0.5);
    }

    const secs = Math.floor(stats.elapsed / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const lines = [
      `Gold banked ...... ${stats.coinsBanked}`,
      `Biggest haul ..... ${stats.bestHaul}`,
      `Gold dropped ..... ${stats.goldLost}`,
      `Bounties claimed . ${stats.bounties}  (best streak ${stats.bestStreak})`,
      `Survived ......... ${time}  (wave ${stats.wave})`,
    ];
    this.add.text(W / 2, 350, lines.join('\n'), { ...textStyle(18, '#ffffff'), lineSpacing: 10 }).setOrigin(0.5);

    const prompt = this.add.text(W / 2, 480, 'SPACE / A  try again      M / B  menu', textStyle(22, '#ffffff')).setOrigin(0.5);
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
    this.time.delayedCall(600, () => {
      this.input.keyboard.once('keydown-SPACE', retry);
      this.input.keyboard.once('keydown-M', menu);
      this.input.once('pointerdown', retry);
      if (this.input.gamepad) {
        const onPad = (_pad, { index }) => {
          if (index === 0 || index === PAD.pause) retry();
          else if (index === PAD.back) menu();
        };
        this.input.gamepad.on('down', onPad);
        this.events.once('shutdown', () => this.input.gamepad.off('down', onPad));
      }
    });
    this.time.delayedCall(1200, () => Music.play('menu', 84));
  }
}
