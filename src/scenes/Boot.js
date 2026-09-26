class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    buildTextures(this);

    const walk = (name, fps) => this.anims.create({
      key: `${name}_walk`,
      frames: [{ key: `${name}_0` }, { key: `${name}_1` }],
      frameRate: fps,
      repeat: -1,
    });
    SKINS.forEach((s) => walk(`gob_${s.id}`, 8));
    walk('knight', 6);
    walk('archer', 6);
    walk('rogue', 9);
    walk('mage', 5);
    walk('cleric', 5);
    walk('thief', 10);
    walk('paladin', 5);
    walk('trapper', 7);

    this.anims.create({
      key: 'coin_spin',
      frames: [{ key: 'coin_0' }, { key: 'coin_1' }],
      frameRate: 5,
      repeat: -1,
    });

    this.scene.start('Menu');
  }
}
