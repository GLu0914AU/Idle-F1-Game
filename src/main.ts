import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { GAME_H, GAME_W, RES } from './resolution';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1020',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W * RES,
    height: GAME_H * RES,
  },
  scene: [GameScene],
});
