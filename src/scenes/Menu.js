const MODE_HELP = {
  solo: 'WASD / Arrows move    SHIFT / SPACE roll    E ability\nP pause   M mute   N music   (gamepads work too)',
  coop: 'P1: WASD move, LEFT SHIFT / SPACE roll, E ability\n'
    + 'P2: Arrows move, RIGHT SHIFT / ENTER roll, / ability\n'
    + 'Gamepads work too. Stand by a downed partner to revive them',
};

class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.started = false;
    Music.play('menu');
    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0).setAlpha(0.6);

    // Raining coins in the background.
    this.time.addEvent({
      delay: 220,
      loop: true,
      callback: () => {
        const coin = this.add.sprite(Phaser.Math.Between(0, W), -12, 'coin_0').play('coin_spin').setAlpha(0.5);
        this.tweens.add({ targets: coin, y: H + 20, duration: Phaser.Math.Between(2500, 4500), onComplete: () => coin.destroy() });
      },
    });

    const title = this.add.text(W / 2, 64, 'LOOT GOBLIN', textStyle(60, '#fbf236')).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 56, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(W / 2, 110, 'grab the gold. outrun the heroes.', textStyle(17, '#9badb7')).setOrigin(0.5);

    const lines = [
      'Gold is HEAVY: the more you carry, the slower you run',
      'Bank at your STASH: 10+ gold x1.5, 20+ gold x2',
      'Get caught: drop half your loot and lose a heart',
      'Finish BOUNTIES for hearts; chain them for a STREAK bonus',
      'Banked coins go to your GOLD: spend it in the SHOP between runs',
    ];
    this.add.text(W / 2, 190, lines.join('\n'), { ...textStyle(15, '#ffffff'), lineSpacing: 8, align: 'center' }).setOrigin(0.5);

    // Mode picker.
    this.options = ['1 PLAYER', '2 PLAYERS  (co-op)'].map((label, i) => {
      const t = this.add.text(W / 2, 272 + i * 34, label, textStyle(24, '#9badb7')).setOrigin(0.5);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.select(i === 1));
      t.on('pointerdown', () => { this.select(i === 1); this.start(); });
      return t;
    });
    this.cursor = this.add.text(0, 0, '>', textStyle(24, '#fbf236')).setOrigin(1, 0.5);
    this.tweens.add({ targets: this.cursor, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    this.helpText = this.add.text(W / 2, 358, '', { ...textStyle(13, '#9badb7'), align: 'center', lineSpacing: 3 }).setOrigin(0.5);

    // Skin pickers (P2's row only shows in co-op).
    this.skinRows = ['p1', 'p2'].map((player, i) => this.createSkinRow(player, 410 + i * 48));

    this.bestText = this.add.text(W / 2, 516, '', textStyle(18, '#ff9f43')).setOrigin(0.5);
    const prompt = this.add.text(W / 2, 548, 'PRESS SPACE OR ENTER TO START', textStyle(22, '#ffffff')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    const shop = this.add.text(W / 2 - 20, 578, `B  SHOP  (${Progress.load().wallet.toLocaleString()} gold)`, textStyle(14, '#fbf236'))
      .setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    shop.on('pointerdown', () => this.openScene('Shop'));
    const trophies = this.add.text(W / 2 + 20, 578, `T  TROPHY ROOM  (${Progress.count()}/${ACHIEVEMENTS.length})`, textStyle(14, '#fbf236'))
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    trophies.on('pointerdown', () => this.openScene('Trophies'));

    // A goblin fleeing a knight across the bottom of the screen.
    const y = H - 34;
    const gob = this.add.sprite(-60, y, 'gob_classic_0').setScale(2.5).play('gob_classic_walk');
    const knight = this.add.sprite(-200, y, 'knight_0').setScale(2.5).play('knight_walk');
    this.tweens.add({ targets: gob, x: W + 200, duration: 5200, repeat: -1 });
    this.tweens.add({ targets: knight, x: W + 60, duration: 5200, repeat: -1 });

    const kb = this.input.keyboard;
    ['UP', 'W', 'ONE'].forEach((key) => kb.on(`keydown-${key}`, () => this.select(false)));
    ['DOWN', 'S', 'TWO'].forEach((key) => kb.on(`keydown-${key}`, () => this.select(true)));
    ['SPACE', 'ENTER'].forEach((key) => kb.on(`keydown-${key}`, () => this.start()));
    kb.on('keydown-LEFT', () => this.cycleSkin(this.coop ? 'p2' : 'p1', -1));
    kb.on('keydown-RIGHT', () => this.cycleSkin(this.coop ? 'p2' : 'p1', 1));
    kb.on('keydown-A', () => this.cycleSkin('p1', -1));
    kb.on('keydown-D', () => this.cycleSkin('p1', 1));
    kb.on('keydown-T', () => this.openScene('Trophies'));
    kb.on('keydown-B', () => this.openScene('Shop'));
    kb.on('keydown-N', () => Music.toggle());

    if (this.input.gamepad) {
      const onPad = (pad, { index }) => {
        const player = this.input.gamepad.getAll().indexOf(pad) === 1 ? 'p2' : 'p1';
        if (index === PAD.up) this.select(false);
        else if (index === PAD.down) this.select(true);
        else if (index === PAD.left) this.cycleSkin(player, -1);
        else if (index === PAD.right) this.cycleSkin(player, 1);
        else if (index === PAD.trophies) this.openScene('Trophies');
        else if (index === PAD.shop) this.openScene('Shop');
        else if (index === 0 || index === PAD.pause) this.start();
      };
      this.input.gamepad.on('down', onPad);
      this.events.once('shutdown', () => this.input.gamepad.off('down', onPad));
    }

    this.coop = null;
    this.select(Store.getCoop());
  }

  createSkinRow(player, y) {
    const x = W / 2 - 170;
    const row = {
      player,
      label: this.add.text(x - 20, y, '', textStyle(14, '#9badb7')).setOrigin(1, 0.5),
      sprite: this.add.sprite(x + 12, y, 'gob_classic_0').setScale(1.4),
      name: this.add.text(x + 40, y - 8, '', textStyle(18, '#ffffff')).setOrigin(0, 0.5),
      perk: this.add.text(x + 40, y + 12, '', textStyle(12, '#9badb7')).setOrigin(0, 0.5),
    };
    row.name.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.cycleSkin(player, 1));
    return row;
  }

  refreshSkinRows() {
    this.skinRows.forEach((row) => {
      const visible = row.player === 'p1' || this.coop;
      [row.label, row.sprite, row.name, row.perk].forEach((o) => o.setVisible(visible));
      if (!visible) return;
      const skin = Progress.chosenSkin(row.player);
      const keys = this.coop ? (row.player === 'p1' ? 'A / D' : '< / >') : '< / >';
      row.label.setText(this.coop ? `${row.player.toUpperCase()} SKIN` : 'SKIN').setColor(skin.color);
      row.sprite.play(`gob_${skin.id}_walk`, true);
      row.name.setText(`${skin.name}   ${keys}`).setColor(skin.color);
      row.perk.setText(skin.perk);
    });
  }

  // Step through unlocked skins; in co-op the two players can't wear the same one.
  cycleSkin(player, dir) {
    if (this.started || (player === 'p2' && !this.coop)) return;
    const other = this.coop ? Progress.chosenSkin(player === 'p1' ? 'p2' : 'p1').id : null;
    const options = SKINS.filter((s) => Progress.skinUnlocked(s) && s.id !== other);
    const current = options.findIndex((s) => s.id === Progress.chosenSkin(player).id);
    const next = options[(current + dir + options.length) % options.length];
    Progress.setSkin(player, next.id);
    Sfx.play('coin');
    this.refreshSkinRows();
  }

  select(coop) {
    if (this.started || coop === this.coop) return;
    if (this.coop !== null) Sfx.play('coin');
    this.coop = coop;
    Store.setCoop(coop);
    // Co-op needs two different skins.
    if (coop && Progress.chosenSkin('p1').id === Progress.chosenSkin('p2').id) {
      Progress.setSkin('p2', Progress.chosenSkin('p1').id === 'frost' ? 'classic' : 'frost');
    }
    const chosen = this.options[coop ? 1 : 0];
    this.options.forEach((o) => o.setColor(o === chosen ? '#fbf236' : '#9badb7'));
    this.cursor.setPosition(chosen.x - chosen.width / 2 - 12, chosen.y);
    this.helpText.setText(MODE_HELP[coop ? 'coop' : 'solo']);
    const best = Store.getBest(coop);
    this.bestText.setText(best > 0 ? `BEST${coop ? ' (CO-OP)' : ''}  ${best}` : '');
    this.refreshSkinRows();
  }

  openScene(key) {
    if (this.started) return;
    this.started = true;
    Sfx.play('select');
    this.scene.start(key);
  }

  start() {
    if (this.started) return;
    this.started = true;
    Sfx.init();
    Sfx.play('select');
    this.scene.start('Game', { coop: this.coop });
  }
}
