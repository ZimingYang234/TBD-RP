import Phaser from 'phaser';
import { TILE_SIZE, type PublicRoomState } from '@tbd/shared';
import { getSavedQuality, isLowPowerDevice, type GraphicsQuality } from '../ui/quality';
import { OverworldScene } from './OverworldScene';

export function createPhaserGame(
  parent: HTMLElement,
  room: PublicRoomState,
  quality: GraphicsQuality = getSavedQuality()
): { game: Phaser.Game; scene: OverworldScene } {
  const scene = new OverworldScene(quality);
  const lowPower = isLowPowerDevice();
  // Canvas on anything that is not an explicit high-end desktop. WebGL context
  // loss is what makes Chromebook tabs reload.
  const useCanvas = lowPower || quality !== 'high';

  const game = new Phaser.Game({
    type: useCanvas ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    width: room.map.width * TILE_SIZE,
    height: room.map.height * TILE_SIZE,
    backgroundColor: '#0c0e14',
    disableContextMenu: true,
    banner: false,
    audio: {
      noAudio: true,
    },
    render: {
      antialias: false,
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
      transparent: false,
      powerPreference: 'low-power',
    },
    fps: {
      target: lowPower || quality === 'low' ? 24 : quality === 'medium' ? 30 : 40,
      min: 12,
      forceSetTimeOut: false,
      smoothStep: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  });

  const onVisibility = (): void => {
    if (document.hidden) game.loop.sleep();
    else game.loop.wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  game.events.once('destroy', () => {
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { game, scene };
}
