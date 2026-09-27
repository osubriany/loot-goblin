// Between-runs shop: spend banked gold on attributes, abilities (one equipped per run) and perks.
// Left column: attributes. Right column: abilities, then perks.
class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  create() {
    // Phaser reuses this scene object between visits, so per-visit state must be reset here.
    this.leaving = false;
    Music.play('menu');
    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0).setAlpha(0.35);
    this.add.text(W / 2, 30, 'GOBLIN SHOP', textStyle(32, '#fbf236')).setOrigin(0.5);
    this.walletText = this.add.text(W / 2, 62, '', textStyle(20, '#fbf236')).setOrigin(0.5);
    this.threatText = this.add.text(W / 2, 86, '', textStyle(11, '#9badb7')).setOrigin(0.5);

    const ids = (kind) => Object.keys(UPGRADES).filter((id) => UPGRADES[id].kind === kind);
    const colW = 356, leftX = 20, rightX = 392, rowH = 46;
    this.add.text(leftX, 112, 'ATTRIBUTES', textStyle(14, '#ffffff')).setOrigin(0, 0.5);
    this.add.text(rightX, 112, 'ABILITIES  (equip one, use with E / Y)', textStyle(14, '#ffffff')).setOrigin(0, 0.5);
    const abilities = ids('ability');
    const perksY = 132 + abilities.length * rowH + 14;
    this.add.text(rightX, perksY - 10, 'PERKS', textStyle(14, '#ffffff')).setOrigin(0, 0.5);

    this.columns = [
      ids('attr').map((id, i) => this.createRow(id, leftX, 132 + i * rowH, colW)),
      [
        ...abilities.map((id, i) => this.createRow(id, rightX, 132 + i * rowH, colW)),
        ...ids('perk').map((id, i) => this.createRow(id, rightX, perksY + i * rowH, colW)),
      ],
    ];
    this.columns.forEach((col, c) => col.forEach((row, i) => { row.col = c; row.idx = i; }));

    this.message = this.add.text(W / 2, H - 42, 'Every coin you bank is added to your gold.', textStyle(13, '#ffffff')).setOrigin(0.5);
    this.add.text(W / 2, H - 18, 'ENTER/SPACE buy    E equip    P play    ESC back', textStyle(12, '#9badb7')).setOrigin(0.5);

    this.sel = { col: 0, idx: 0 };
    this.refresh();

    const kb = this.input.keyboard;
    const nav = (dc, di) => () => this.move(dc, di);
    ['UP', 'W'].forEach((k) => kb.on(`keydown-${k}`, nav(0, -1)));
    ['DOWN', 'S'].forEach((k) => kb.on(`keydown-${k}`, nav(0, 1)));
    ['LEFT', 'A'].forEach((k) => kb.on(`keydown-${k}`, nav(-1, 0)));
    ['RIGHT', 'D'].forEach((k) => kb.on(`keydown-${k}`, nav(1, 0)));
    ['ENTER', 'SPACE'].forEach((k) => kb.on(`keydown-${k}`, () => this.buy(this.selected().id)));
    kb.on('keydown-E', () => this.equip(this.selected().id));
    ['ESC', 'BACKSPACE', 'B'].forEach((k) => kb.on(`keydown-${k}`, () => this.leave('Menu')));
    kb.on('keydown-P', () => this.leave('Game'));

    if (this.input.gamepad) {
      const onPad = (_pad, { index }) => {
        if (index === PAD.up) this.move(0, -1);
        else if (index === PAD.down) this.move(0, 1);
        else if (index === PAD.left) this.move(-1, 0);
        else if (index === PAD.right) this.move(1, 0);
        else if (index === 0) this.buy(this.selected().id);
        else if (index === PAD.ability) this.equip(this.selected().id);
        else if (index === PAD.back) this.leave('Menu');
        else if (index === PAD.pause) this.leave('Game');
      };
      this.input.gamepad.on('down', onPad);
      this.events.once('shutdown', () => this.input.gamepad.off('down', onPad));
    }
  }

  createRow(id, x, y, w) {
    const u = UPGRADES[id];
    const row = { id, u };
    row.bg = this.add.rectangle(x, y, w, 42, 0x0d0b14, 0.85).setOrigin(0).setStrokeStyle(2, 0x3b3950);
    row.name = this.add.text(x + 10, y + 12, u.name, textStyle(14, '#ffffff')).setOrigin(0, 0.5);
    row.tag = this.add.text(x + 128, y + 12, '', textStyle(10, '#6abe30')).setOrigin(0, 0.5);
    row.pips = u.costs.map((_, i) => this.add.rectangle(x + 214 + i * 11, y + 12, 8, 8, 0x2a2438).setStrokeStyle(1, 0x6b6880));
    row.cost = this.add.text(x + w - 10, y + 12, '', textStyle(13, '#fbf236')).setOrigin(1, 0.5);
    row.desc = this.add.text(x + 10, y + 30, '', textStyle(10, '#9badb7')).setOrigin(0, 0.5);
    row.bg.setInteractive({ useHandCursor: true });
    row.bg.on('pointerover', () => { this.sel = { col: row.col, idx: row.idx }; this.refresh(); });
    // Click buys; clicking an owned ability you can't upgrade further (or afford) equips it.
    row.bg.on('pointerdown', () => {
      const cost = Progress.nextCost(id);
      if (u.kind === 'ability' && Progress.level(id) && (cost === null || Progress.load().wallet < cost)) this.equip(id);
      else this.buy(id);
    });
    return row;
  }

  selected() {
    return this.columns[this.sel.col][this.sel.idx];
  }

  move(dc, di) {
    const col = Phaser.Math.Clamp(this.sel.col + dc, 0, this.columns.length - 1);
    const idx = Phaser.Math.Clamp(dc ? this.sel.idx : this.sel.idx + di, 0, this.columns[col].length - 1);
    this.sel = { col, idx };
    this.refresh();
  }

  buy(id) {
    const u = UPGRADES[id];
    const cost = Progress.nextCost(id);
    if (cost === null) return this.say(`${u.name} is maxed out`, '#9badb7', 'nope');
    if (!Progress.buy(id)) return this.say(`Need ${cost - Progress.load().wallet} more gold for ${u.name}`, '#d95763', 'nope');
    const lvl = Progress.level(id);
    const equipped = u.kind === 'ability' && Progress.load().equipped === id;
    this.say(`Bought ${u.name}${u.costs.length > 1 ? ` level ${lvl}` : ''}${equipped && lvl === 1 ? ' (equipped)' : ''}`, '#6abe30', 'buy');
    const row = this.selectedRowFor(id);
    this.tweens.add({ targets: row.bg, scaleX: 1.02, scaleY: 1.1, duration: 80, yoyo: true });
    this.refresh();
  }

  equip(id) {
    const u = UPGRADES[id];
    if (u.kind !== 'ability') return this.say('Only abilities can be equipped', '#9badb7', 'nope');
    if (!Progress.equip(id)) return this.say(`Buy ${u.name} first`, '#d95763', 'nope');
    this.say(`${u.name} equipped`, '#6abe30', 'select');
    this.refresh();
  }

  selectedRowFor(id) {
    return this.columns.flat().find((r) => r.id === id);
  }

  say(text, color, sound) {
    this.message.setText(text).setColor(color);
    Sfx.play(sound);
  }

  refresh() {
    const p = Progress.load();
    this.walletText.setText(`GOLD ${p.wallet.toLocaleString()}`);
    this.threatText.setText(`Upgrade power ${Progress.power()}   ·   Hero threat ${threatLevel()}/${THREAT.cap}: `
      + 'heroes get faster, attack sooner and bring friends');

    for (const row of this.columns.flat()) {
      const { id, u } = row;
      const lvl = Progress.level(id);
      const max = u.costs.length;
      const cost = Progress.nextCost(id);
      const isSel = row === this.selected();
      row.bg.setStrokeStyle(2, isSel ? 0xfbf236 : 0x3b3950);
      row.name.setColor(lvl ? '#ffffff' : '#cbdbfc');
      row.pips.forEach((pip, i) => pip.setFillStyle(i < lvl ? 0xfbf236 : 0x2a2438));
      if (cost === null) row.cost.setText('MAX').setColor('#6abe30');
      else row.cost.setText(`${cost}g`).setColor(p.wallet >= cost ? '#fbf236' : '#d95763');

      if (u.kind === 'ability' && lvl) {
        const on = p.equipped === id;
        row.tag.setText(on ? 'EQUIPPED' : 'E: equip').setColor(on ? '#6abe30' : '#6b6880');
      } else {
        row.tag.setText('');
      }

      // Longest form first; fall back to shorter ones so the text stays inside the tile.
      let options;
      if (!lvl) options = [`next: ${u.desc(1)}`];
      else if (lvl >= max) options = [u.desc(lvl)];
      else options = [`${u.desc(lvl)}  >  ${u.desc(lvl + 1)}`, `next: ${u.desc(lvl + 1)}`];
      this.fitText(row.desc, options, row.bg.width - 20);
    }
  }

  // Use the first option that fits maxWidth; if none do, squeeze the last one horizontally.
  fitText(text, options, maxWidth) {
    text.setScale(1);
    for (const opt of options) {
      text.setText(opt);
      if (text.width <= maxWidth) return;
    }
    text.setScale(maxWidth / text.width, 1);
  }

  leave(scene) {
    if (this.leaving) return;
    this.leaving = true;
    Sfx.play('select');
    this.scene.start(scene, scene === 'Game' ? { coop: Store.getCoop() } : undefined);
  }
}
