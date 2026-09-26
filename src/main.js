// Audio can only start after a user gesture; music waits for the same unlock.
const unlockAudio = () => { Sfx.init(); Music.start(); };
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('gamepadconnected', unlockAudio);

window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#14121c',
  pixelArt: true,
  audio: { noAudio: true },
  input: { gamepad: true },
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, TrophyScene, GameScene, GameOverScene],
});
