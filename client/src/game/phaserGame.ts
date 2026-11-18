import Phaser from 'phaser';
import { TILE_SIZE, type PublicRoomState } from '@tbd/shared';
import { getSavedQuality, type GraphicsQuality } from '../ui/quality';
import { OverworldScene } from './OverworldScene';

export function createPhaserGame(
  parent: HTMLElement,
  room: PublicRoomState,
  quality: GraphicsQuality = getSavedQuality()
): { game: Phaser.Game; scene: OverworldScene } {
  const scene = new OverworldScene(quality);

  const game = new Phaser.Game({
    type: quality === 'low' ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    width: room.map.width * TILE_SIZE,
    height: room.map.height * TILE_SIZE,
    backgroundColor: '#0b0d14',
    render: {
      antialias: quality === 'high',
      antialiasGL: quality === 'high',
      pixelArt: false,
      roundPixels: true,
      powerPreference: quality === 'low' ? 'low-power' : 'default',
    },
    fps: {
      target: quality === 'low' ? 30 : 48,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  });

  return { game, scene };
}
