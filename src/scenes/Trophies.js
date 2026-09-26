// Trophy room: every achievement (earned or not), lifetime stats, and the skin collection.
class TrophyScene extends Phaser.Scene {
  constructor() { super('Trophies'); }

  create() {
    Music.play('menu');
    const p = Progress.load();
    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0).setAlpha(0.35);

    this.add.text(W / 2, 36, 'TROPHY ROOM', textStyle(36, '#fbf236')).setOrigin(0.5);
    const summary = `${Progress.count()}/${ACHIEVEMENTS.length} achievements     `
      + `lifetime score ${p.lifetimeGold.toLocaleString()}     runs ${p.runs}`;
    this.add.text(W / 2, 72, summary, textStyle(13, '#9badb7')).setOrigin(0.5);

    // Achievements: two columns of eight.
    ACHIEVEMENTS.forEach((a, i) => {
      const x = i < 8 ? 34 : W / 2 + 10;
      const y = 108 + (i % 8) * 40;
      const got = Progress.has(a.id);
      this.add.image(x + 10, y, got ? 'trophy' : 'trophy_locked').setScale(1.6);
      this.add.text(x + 32, y - 8, a.name, textStyle(14, got ? '#fbf236' : '#6b6880')).setOrigin(0, 0.5);
      this.add.text(x + 32, y + 9, a.desc, textStyle(11, got ? '#ffffff' : '#57546a')).setOrigin(0, 0.5);
    });

    // Skins: locked ones are silhouettes; select one to read its perk and how to unlock it.
    this.add.text(W / 2, 438, 'SKINS', textStyle(20, '#ffffff')).setOrigin(0.5);
    const spacing = 88, x0 = W / 2 - ((SKINS.length - 1) * spacing) / 2;
    this.skinCards = SKINS.map((s, i) => {
      const x = x0 + i * spacing;
      const unlocked = Progress.skinUnlocked(s);
      const sprite = this.add.sprite(x, 484, `gob_${s.id}_0`).setScale(2);
      if (unlocked) sprite.play(`gob_${s.id}_walk`);
      else sprite.setTintFill(0x4a4560);
      this.add.text(x, 522, unlocked ? s.name : '???', textStyle(12, unlocked ? s.color : '#6b6880')).setOrigin(0.5);
      sprite.setInteractive({ useHandCursor: true }).on('pointerover', () => this.showSkin(i));
      return { sprite, skin: s, unlocked };
    });
    this.selector = this.add.rectangle(0, 500, 70, 76).setStrokeStyle(2, 0xfbf236).setFillStyle();
    this.info = this.add.text(W / 2, 566, '', { ...textStyle(14, '#ffffff'), align: 'center' }).setOrigin(0.5);
    this.showSkin(0);

    this.add.text(W / 2, H - 34, '< / >  browse skins        ESC / SPACE  back', textStyle(14, '#9badb7')).setOrigin(0.5);

    const back = () => { Sfx.play('select'); this.scene.start('Menu'); };
    const kb = this.input.keyboard;
    ['ESC', 'SPACE', 'ENTER', 'T', 'BACKSPACE'].forEach((key) => kb.once(`keydown-${key}`, back));
    kb.on('keydown-LEFT', () => this.showSkin(this.current - 1));
    kb.on('keydown-RIGHT', () => this.showSkin(this.current + 1));
    kb.on('keydown-A', () => this.showSkin(this.current - 1));
    kb.on('keydown-D', () => this.showSkin(this.current + 1));
    if (this.input.gamepad) {
      const onPad = (_pad, { index }) => {
        if (index === PAD.left) this.showSkin(this.current - 1);
        else if (index === PAD.right) this.showSkin(this.current + 1);
        else if (index === PAD.back || index === PAD.trophies || index === 0) back();
      };
      this.input.gamepad.on('down', onPad);
      this.events.once('shutdown', () => this.input.gamepad.off('down', onPad));
    }
  }

  showSkin(i) {
    const n = this.skinCards.length;
    this.current = (i + n) % n;
    const card = this.skinCards[this.current];
    this.selector.setPosition(card.sprite.x, 500);
    const s = card.skin;
    if (card.unlocked) {
      this.info.setText(`${s.name}: ${s.perk}`).setColor(s.color);
    } else {
      const a = ACHIEVEMENTS.find((x) => x.id === s.unlock);
      this.info.setText(`LOCKED. Earn "${a.name}" to unlock\n(${a.desc})`).setColor('#9badb7');
    }
  }
}
