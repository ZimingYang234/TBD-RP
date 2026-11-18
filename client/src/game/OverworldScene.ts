import Phaser from 'phaser';
import {
  MOVE_COOLDOWN_MS,
  PLAYER_CLASSES,
  TILE_SIZE,
  type Direction,
  type PlayerClass,
  type PublicPlayerState,
  type PublicRoomState,
  type RegionTheme,
  type TileType,
} from '@tbd/shared';
import { getSavedQuality, type GraphicsQuality } from '../ui/quality';

const CANVAS_FONT_FAMILY = "'Segoe UI', Roboto, system-ui, sans-serif";

interface PlayerSpriteBundle {
  container: Phaser.GameObjects.Container;
  avatar: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Ellipse | null;
  label: Phaser.GameObjects.Text;
  tileX: number;
  tileY: number;
}

interface ThemePalette {
  grassA: number;
  grassB: number;
  grassDetail: number;
  grassAccent: number;
  pathBase: number;
  pathStoneA: number;
  pathStoneB: number;
  wallFace: number;
  wallTop: number;
  wallHighlight: number;
  waterBase: number;
  waterDeep: number;
  waterHighlight: number;
  portalBase: number;
  portalGlow: number;
  portalCore: number;
  eventTile: number;
  eventGlow: number;
}

const THEME_PALETTES: Record<RegionTheme, ThemePalette> = {
  verdant: {
    grassA: 0x356947,
    grassB: 0x3b724d,
    grassDetail: 0x2b573b,
    grassAccent: 0x6abf7b,
    pathBase: 0x6e5b42,
    pathStoneA: 0x998261,
    pathStoneB: 0x877153,
    wallFace: 0x353b4a,
    wallTop: 0x4f566b,
    wallHighlight: 0x6c758f,
    waterBase: 0x245887,
    waterDeep: 0x1b4369,
    waterHighlight: 0x63aee8,
    portalBase: 0x331c59,
    portalGlow: 0xa78bfa,
    portalCore: 0xf3e8ff,
    eventTile: 0xf5b942,
    eventGlow: 0xfde68a,
  },
  desert: {
    grassA: 0xb38344,
    grassB: 0xbe8d4c,
    grassDetail: 0x9c6e35,
    grassAccent: 0xd9ad6a,
    pathBase: 0x8a6437,
    pathStoneA: 0xd9b882,
    pathStoneB: 0xc9a56d,
    wallFace: 0x3d2a22,
    wallTop: 0x5c4034,
    wallHighlight: 0x7d5848,
    waterBase: 0xb83518,
    waterDeep: 0x8c220c,
    waterHighlight: 0xff8a3d,
    portalBase: 0x3d1e54,
    portalGlow: 0xf59e0b,
    portalCore: 0xfef3c7,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  frost: {
    grassA: 0xb5cbe0,
    grassB: 0xc2d7eb,
    grassDetail: 0x9bb5cf,
    grassAccent: 0xe6f2fc,
    pathBase: 0x5d738a,
    pathStoneA: 0x8aa1b8,
    pathStoneB: 0x7991a8,
    wallFace: 0x2d4059,
    wallTop: 0x466385,
    wallHighlight: 0x7192b8,
    waterBase: 0x1c4a75,
    waterDeep: 0x133454,
    waterHighlight: 0x8fd3ff,
    portalBase: 0x23346b,
    portalGlow: 0x60a5fa,
    portalCore: 0xe0f2fe,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  astral: {
    grassA: 0x221a38,
    grassB: 0x281f42,
    grassDetail: 0x181229,
    grassAccent: 0x7c5cbf,
    pathBase: 0x352954,
    pathStoneA: 0x574485,
    pathStoneB: 0x4a3973,
    wallFace: 0x130e21,
    wallTop: 0x2a2045,
    wallHighlight: 0x493875,
    waterBase: 0x0e091a,
    waterDeep: 0x07040f,
    waterHighlight: 0xc084fc,
    portalBase: 0x33165c,
    portalGlow: 0xe879f9,
    portalCore: 0xfdf4ff,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
};

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export class OverworldScene extends Phaser.Scene {
  private quality: GraphicsQuality;
  private room: PublicRoomState | null = null;
  private renderedRegionId: string | null = null;
  private myPlayerId: string | null = null;
  private onMoveRequest: ((dir: Direction) => void) | null = null;

  private mapLayer: Phaser.GameObjects.Graphics | null = null;
  private shadowLayer: Phaser.GameObjects.Graphics | null = null;
  private propObjects: Phaser.GameObjects.GameObject[] = [];
  private playerSprites = new Map<string, PlayerSpriteBundle>();
  private bannerContainer: Phaser.GameObjects.Container | null = null;

  private clickTarget: { x: number; y: number } | null = null;
  private clickMarker: Phaser.GameObjects.Arc | null = null;
  private hoverTooltip: Phaser.GameObjects.Text | null = null;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  } | null = null;
  private lastMoveSentAt = 0;
  private isSceneReady = false;
  private inputBlocked = false;

  constructor(initialQuality: GraphicsQuality = getSavedQuality()) {
    super({ key: 'OverworldScene' });
    this.quality = initialQuality;
  }

  public setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    if (blocked) {
      this.clearClickTarget();
      if (this.isSceneReady) this.tweens.pauseAll();
    } else if (this.isSceneReady) {
      this.tweens.resumeAll();
    }
  }

  private getTextResolution(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (this.quality === 'low') return Math.max(1.5, Math.min(dpr, 2));
    return Math.max(2, Math.min(dpr, 2.5));
  }

  public setQuality(quality: GraphicsQuality): void {
    if (this.quality === quality) return;
    this.quality = quality;

    if (!this.isSceneReady) return;

    this.cameras.main?.setRoundPixels(true);
    this.redrawMap();
    this.rebuildPlayerSprites();

    if (this.bannerContainer) {
      const res = this.getTextResolution();
      for (const child of this.bannerContainer.list) {
        if (child instanceof Phaser.GameObjects.Text) {
          child.setResolution(res);
        }
      }
    }
  }

  public configure(
    room: PublicRoomState,
    myPlayerId: string,
    onMoveRequest: (dir: Direction) => void
  ): void {
    const regionChanged = this.renderedRegionId !== null && this.renderedRegionId !== room.regionId;
    this.room = room;
    this.myPlayerId = myPlayerId;
    this.onMoveRequest = onMoveRequest;

    if (this.isSceneReady) {
      if (this.renderedRegionId !== room.regionId) {
        this.redrawMap();
      }
      this.syncPlayers(room.players, regionChanged);
    }
  }

  public showRegionBanner(title: string, subtitle: string): void {
    if (!this.isSceneReady) return;
    if (this.bannerContainer) {
      this.tweens.killTweensOf(this.bannerContainer);
      this.bannerContainer.destroy();
      this.bannerContainer = null;
    }

    const res = this.getTextResolution();
    const centerX = (this.room?.map.width ?? 20) * TILE_SIZE * 0.5;
    const bg = this.add
      .rectangle(0, 0, 540, 86, 0x10131e, 0.94)
      .setStrokeStyle(2, 0xf0b44c);
    const innerLine = this.add
      .rectangle(0, 0, 526, 72)
      .setStrokeStyle(1, 0xf0b44c, 0.32);

    const titleText = this.add
      .text(0, -14, title, {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#f7c45f',
        stroke: '#090b10',
        strokeThickness: 3,
        resolution: res,
      })
      .setOrigin(0.5);
    const subText = this.add
      .text(0, 17, subtitle, {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '15px',
        color: '#e2e8f5',
        stroke: '#090b10',
        strokeThickness: 2,
        resolution: res,
      })
      .setOrigin(0.5);

    const container = this.add.container(centerX, 72, [bg, innerLine, titleText, subText]);
    container.setDepth(50);
    container.setAlpha(0);
    this.bannerContainer = container;

    if (this.quality !== 'low') {
      this.cameras.main.flash(220, 167, 139, 250, false);
    }

    this.tweens.add({
      targets: container,
      alpha: 1,
      y: 80,
      duration: 240,
      hold: 2000,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.bannerContainer === container) {
          container.destroy();
          this.bannerContainer = null;
        }
      },
    });
  }

  public create(): void {
    this.isSceneReady = true;
    this.cameras.main.setRoundPixels(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isSceneReady = false;
    });

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.mapLayer = this.add.graphics().setDepth(1);
    this.shadowLayer = this.add.graphics().setDepth(2);

    this.clickMarker = this.add
      .circle(0, 0, TILE_SIZE * 0.28, 0xf0b44c, 0.2)
      .setStrokeStyle(2, 0xf0b44c, 0.9)
      .setDepth(8)
      .setVisible(false);

    this.hoverTooltip = this.add
      .text(0, 0, '', {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f8fafc',
        backgroundColor: '#0f121be6',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(45)
      .setResolution(this.getTextResolution())
      .setVisible(false);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inputBlocked || !this.room || this.room.phase !== 'playing') return;
      const tx = Math.floor(pointer.worldX / TILE_SIZE);
      const ty = Math.floor(pointer.worldY / TILE_SIZE);
      if (tx < 0 || ty < 0 || tx >= this.room.map.width || ty >= this.room.map.height) return;
      const tile = this.room.map.tiles[ty]?.[tx];
      if (tile === 'wall' || tile === 'water') return;

      this.clickTarget = { x: tx, y: ty };
      this.clickMarker
        ?.setPosition(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2)
        .setVisible(true);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.room || !this.hoverTooltip) return;
      const tx = Math.floor(pointer.worldX / TILE_SIZE);
      const ty = Math.floor(pointer.worldY / TILE_SIZE);
      if (tx < 0 || ty < 0 || tx >= this.room.map.width || ty >= this.room.map.height) {
        this.hoverTooltip.setVisible(false);
        return;
      }

      const tile = this.room.map.tiles[ty]?.[tx];
      let tip: string | null = null;
      if (tile === 'portal') {
        const portal = this.room.map.portals.find((p) => p.x === tx && p.y === ty);
        tip = portal ? `Portal ${portal.label}` : 'Portal';
      } else if (tile === 'event') {
        tip = 'Evento (haz clic o camina aquí)';
      } else if (tile === 'combat') {
        tip = 'Combate (haz clic o camina aquí)';
      } else if (tile === 'shop') {
        tip = 'Tienda (haz clic o camina aquí)';
      }

      if (!tip) {
        this.hoverTooltip.setVisible(false);
        return;
      }

      const px = Phaser.Math.Clamp(
        tx * TILE_SIZE + TILE_SIZE / 2,
        90,
        this.room.map.width * TILE_SIZE - 90
      );
      const py = Math.max(36, ty * TILE_SIZE - 4);
      this.hoverTooltip.setText(tip).setPosition(px, py).setVisible(true);
    });

    if (this.room) {
      this.redrawMap();
      this.syncPlayers(this.room.players, true);
      this.showRegionBanner(this.room.map.name, this.room.map.subtitle);
    }
  }

  public update(time: number): void {
    if (this.inputBlocked || !this.room || this.room.phase !== 'playing' || !this.onMoveRequest) {
      return;
    }
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
      return;
    }
    if (time - this.lastMoveSentAt < MOVE_COOLDOWN_MS) return;

    const keyDir = this.readDirectionInput();
    if (keyDir) {
      this.clearClickTarget();
      this.lastMoveSentAt = time;
      this.onMoveRequest(keyDir);
      return;
    }

    const clickDir = this.readClickStepDirection();
    if (clickDir) {
      this.lastMoveSentAt = time;
      this.onMoveRequest(clickDir);
    }
  }

  private clearClickTarget(): void {
    this.clickTarget = null;
    this.clickMarker?.setVisible(false);
  }

  private isWalkableTile(x: number, y: number): boolean {
    if (!this.room) return false;
    const { map } = this.room;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    const tile = map.tiles[y]?.[x];
    return tile !== 'wall' && tile !== 'water';
  }

  private readClickStepDirection(): Direction | null {
    if (!this.clickTarget || !this.room || !this.myPlayerId) return null;
    const me = this.room.players.find((p) => p.id === this.myPlayerId);
    if (!me) return null;

    const dx = this.clickTarget.x - me.x;
    const dy = this.clickTarget.y - me.y;
    if (dx === 0 && dy === 0) {
      this.clearClickTarget();
      return null;
    }

    const primaryHoriz = Math.abs(dx) >= Math.abs(dy);
    const candidates: Direction[] = [];
    if (primaryHoriz) {
      if (dx > 0) candidates.push('right');
      if (dx < 0) candidates.push('left');
      if (dy > 0) candidates.push('down');
      if (dy < 0) candidates.push('up');
    } else {
      if (dy > 0) candidates.push('down');
      if (dy < 0) candidates.push('up');
      if (dx > 0) candidates.push('right');
      if (dx < 0) candidates.push('left');
    }

    const deltas: Record<Direction, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };

    for (const dir of candidates) {
      const d = deltas[dir];
      if (this.isWalkableTile(me.x + d.dx, me.y + d.dy)) {
        return dir;
      }
    }

    this.clearClickTarget();
    return null;
  }

  private readDirectionInput(): Direction | null {
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) return 'up';
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) return 'down';
    if (this.cursors?.left.isDown || this.wasd?.A.isDown) return 'left';
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) return 'right';
    return null;
  }

  private clearPropObjects(): void {
    for (const obj of this.propObjects) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.propObjects = [];
  }

  private rebuildPlayerSprites(): void {
    for (const bundle of this.playerSprites.values()) {
      this.tweens.killTweensOf(bundle.avatar);
      this.tweens.killTweensOf(bundle.container);
      bundle.container.destroy();
    }
    this.playerSprites.clear();

    if (this.room) {
      this.syncPlayers(this.room.players, true);
    }
  }

  private redrawMap(): void {
    if (!this.mapLayer || !this.shadowLayer || !this.room) return;
    const { map } = this.room;
    const palette = THEME_PALETTES[map.theme] ?? THEME_PALETTES.verdant;
    const q = this.quality;
    const textRes = this.getTextResolution();

    this.renderedRegionId = map.id;
    this.clearClickTarget();
    this.mapLayer.clear();
    this.shadowLayer.clear();
    this.clearPropObjects();

    const g = this.mapLayer;
    const s = this.shadowLayer;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile: TileType = map.tiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const rnd = hash2D(x, y);

        if (tile === 'grass' || tile === 'event' || tile === 'combat' || tile === 'shop') {
          const base = (x + y) % 2 === 0 ? palette.grassA : palette.grassB;
          g.fillStyle(base, 1);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          // Terrain details for medium and high quality
          if (q !== 'low' && rnd < (q === 'high' ? 0.42 : 0.25)) {
            const dx = px + 14 + Math.floor(rnd * 30);
            const dy = py + 14 + Math.floor(hash2D(y, x) * 30);

            if (map.theme === 'verdant') {
              g.fillStyle(palette.grassDetail, 0.7);
              g.fillRect(dx, dy, 3, 7);
              g.fillRect(dx + 5, dy + 2, 3, 5);
              if (q === 'high' && rnd < 0.14) {
                g.fillStyle(0xf2e894, 0.9);
                g.fillCircle(dx + 9, dy + 1, 2.5);
              }
            } else if (map.theme === 'desert') {
              g.fillStyle(palette.grassDetail, 0.5);
              g.fillRoundedRect(dx - 8, dy, 18, 3, 1.5);
              if (q === 'high') {
                g.fillStyle(palette.grassAccent, 0.45);
                g.fillRoundedRect(dx - 6, dy - 2, 12, 2, 1);
              }
            } else if (map.theme === 'frost') {
              g.fillStyle(palette.grassAccent, 0.75);
              g.fillCircle(dx, dy, 2.5);
              if (q === 'high') {
                g.fillStyle(palette.grassDetail, 0.45);
                g.fillEllipse(dx + 6, dy + 8, 12, 5);
              }
            } else {
              g.fillStyle(palette.grassAccent, 0.65);
              g.fillCircle(dx, dy, 2);
              if (q === 'high' && rnd < 0.16) {
                g.fillStyle(0xffffff, 0.75);
                g.fillCircle(dx + 12, dy - 6, 1.5);
              }
            }
          }

          if (tile === 'event') {
            this.spawnEventMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2, palette);
          } else if (tile === 'combat') {
            this.spawnCombatMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          } else if (tile === 'shop') {
            this.spawnShopMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          }
        } else if (tile === 'path') {
          g.fillStyle(palette.pathBase, 1);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          if (q === 'low') {
            g.fillStyle(palette.pathStoneA, 0.55);
            g.fillRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12);
          } else {
            // Cobblestone pavers
            g.fillStyle(palette.pathStoneA, 1);
            g.fillRoundedRect(px + 4, py + 4, 26, 25, 6);
            g.fillRoundedRect(px + 33, py + 32, 27, 28, 6);

            g.fillStyle(palette.pathStoneB, 1);
            g.fillRoundedRect(px + 33, py + 4, 27, 25, 6);
            g.fillRoundedRect(px + 4, py + 32, 26, 28, 6);

            if (q === 'high') {
              // Subtle bevel highlight
              g.fillStyle(0xffffff, 0.11);
              g.fillRoundedRect(px + 7, py + 6, 20, 4, 2);
              g.fillRoundedRect(px + 36, py + 34, 21, 4, 2);
            }
          }
        } else if (tile === 'wall') {
          g.fillStyle(palette.wallFace, 1);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          if (q === 'low') {
            g.fillStyle(palette.wallTop, 1);
            g.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 14);
          } else {
            g.fillStyle(palette.wallTop, 1);
            g.fillRoundedRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 14, 6);

            if (q === 'high') {
              g.fillStyle(palette.wallHighlight, 0.85);
              g.fillRoundedRect(px + 5, py + 4, TILE_SIZE - 10, 6, 3);
            }

            // Stone brick seam
            g.lineStyle(1, 0x000000, 0.28);
            g.lineBetween(px + 6, py + TILE_SIZE - 14, px + TILE_SIZE - 6, py + TILE_SIZE - 14);
            g.lineBetween(px + TILE_SIZE / 2, py + 8, px + TILE_SIZE / 2, py + TILE_SIZE - 14);

            // Soft shadow onto walkable tile below
            const below = map.tiles[y + 1]?.[x];
            if (below && below !== 'wall') {
              s.fillStyle(0x000000, q === 'high' ? 0.28 : 0.18);
              s.fillRect(px, py + TILE_SIZE, TILE_SIZE, q === 'high' ? 10 : 7);
            }
          }
        } else if (tile === 'water') {
          g.fillStyle(palette.waterDeep, 1);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          if (q === 'low') {
            g.fillStyle(palette.waterBase, 1);
            g.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else {
            g.fillStyle(palette.waterBase, 1);
            g.fillRoundedRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6, 8);

            g.fillStyle(palette.waterHighlight, 0.42);
            g.fillRoundedRect(px + 11, py + 18, 22, 4, 2);
            g.fillRoundedRect(px + 25, py + 39, 26, 4, 2);

            if (q === 'high' && rnd < 0.5) {
              g.fillStyle(0xffffff, 0.38);
              g.fillCircle(px + 18, py + 42, 2);
            }
          }
        } else if (tile === 'portal') {
          g.fillStyle(palette.pathBase, 1);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          g.fillStyle(palette.portalBase, 0.92);
          if (q === 'low') {
            g.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
          } else {
            g.fillRoundedRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8, 12);
          }
        }

        if (q === 'high') {
          g.lineStyle(1, 0x000000, 0.08);
          g.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Portals & crisp destination labels
    const mapPixelWidth = map.width * TILE_SIZE;
    for (const portal of map.portals) {
      const cx = portal.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = portal.y * TILE_SIZE + TILE_SIZE / 2;

      const ring = this.add
        .circle(cx, cy, TILE_SIZE * 0.34, palette.portalBase, 0.7)
        .setStrokeStyle(3, palette.portalGlow)
        .setDepth(5);
      const core = this.add.circle(cx, cy, TILE_SIZE * 0.12, palette.portalCore, 0.95).setDepth(7);

      if (q === 'low') {
        this.propObjects.push(ring, core);
      } else if (q === 'medium') {
        const innerRing = this.add
          .circle(cx, cy, TILE_SIZE * 0.22)
          .setStrokeStyle(2, palette.portalCore, 0.7)
          .setDepth(6);

        this.tweens.add({
          targets: [ring, innerRing],
          scale: { from: 0.95, to: 1.05 },
          duration: 950,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        this.propObjects.push(ring, innerRing, core);
      } else {
        const aura = this.add.circle(cx, cy, TILE_SIZE * 0.44, palette.portalGlow, 0.22).setDepth(4);
        const innerRing = this.add
          .circle(cx, cy, TILE_SIZE * 0.22)
          .setStrokeStyle(2, palette.portalCore, 0.75)
          .setDepth(6);

        this.tweens.add({
          targets: aura,
          scale: { from: 0.9, to: 1.2 },
          alpha: { from: 0.18, to: 0.42 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        this.tweens.add({
          targets: [ring, innerRing],
          scale: { from: 0.94, to: 1.06 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        this.propObjects.push(aura, ring, innerRing, core);
      }

      const aboveTile = map.tiles[portal.y - 1]?.[portal.x];
      const belowTile = map.tiles[portal.y + 1]?.[portal.x];
      const placeBelow =
        portal.y <= 1 || (aboveTile === 'wall' && belowTile !== undefined && belowTile !== 'wall');
      const labelY = placeBelow ? cy + 40 : cy - 40;
      const labelX = Math.max(76, Math.min(mapPixelWidth - 76, cx));

      const label = this.add
        .text(labelX, labelY, portal.label, {
          fontFamily: CANVAS_FONT_FAMILY,
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#f8f0ff',
          backgroundColor: '#160e26eb',
          stroke: '#090512',
          strokeThickness: 2,
          padding: { x: 8, y: 4 },
          resolution: textRes,
          shadow:
            q === 'low'
              ? undefined
              : { offsetX: 0, offsetY: 1, color: '#000000', blur: 3, stroke: true, fill: true },
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.propObjects.push(label);
    }
  }

  private spawnShopMarker(cx: number, cy: number): void {
    const q = this.quality;
    const base = this.add
      .circle(cx, cy, q === 'low' ? 15 : 19, 0x133836, 0.9)
      .setStrokeStyle(2, 0x2dd4bf, 0.9)
      .setDepth(3);

    const coin = this.add
      .circle(cx, cy, 9, 0xf2b749, 1)
      .setStrokeStyle(2, 0xfff3c4, 0.95)
      .setDepth(4);

    const mark = this.add
      .text(cx, cy, '$', {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#2b1c04',
        resolution: this.getTextResolution(),
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.propObjects.push(base, coin, mark);
  }

  private spawnCombatMarker(cx: number, cy: number): void {
    const q = this.quality;
    const base = this.add
      .circle(cx, cy, q === 'low' ? 15 : 19, 0x3b1216, 0.86)
      .setStrokeStyle(2, 0xe05a47, 0.9)
      .setDepth(3);

    if (q === 'high') {
      const aura = this.add
        .circle(cx, cy, 24, 0xe05a47, 0.14)
        .setStrokeStyle(1.5, 0xff8575, 0.45)
        .setDepth(2);
      this.tweens.add({
        targets: aura,
        scale: { from: 0.94, to: 1.12 },
        alpha: { from: 0.12, to: 0.28 },
        duration: 1050,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.propObjects.push(aura);
    }

    const swords = this.add.graphics().setDepth(4);
    swords.lineStyle(2.5, 0xf3d5d0, 1);
    swords.lineBetween(cx - 8, cy + 8, cx + 8, cy - 8);
    swords.lineBetween(cx - 8, cy - 8, cx + 8, cy + 8);
    swords.lineStyle(2, 0xf0b44c, 1);
    swords.lineBetween(cx - 9, cy + 4, cx - 4, cy + 9);
    swords.lineBetween(cx + 4, cy + 9, cx + 9, cy + 4);

    this.propObjects.push(base, swords);
  }

  private spawnEventMarker(cx: number, cy: number, palette: ThemePalette): void {
    const q = this.quality;

    if (q !== 'low') {
      if (q === 'high') {
        const runeHalo = this.add
          .circle(cx, cy, 24, palette.eventTile, 0.14)
          .setStrokeStyle(1.5, palette.eventGlow, 0.45)
          .setDepth(2);

        this.tweens.add({
          targets: runeHalo,
          scale: { from: 0.94, to: 1.1 },
          alpha: { from: 0.1, to: 0.25 },
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        this.propObjects.push(runeHalo);
      }

      const pedestal = this.add
        .circle(cx, cy, 18, 0x1e2230, 0.72)
        .setStrokeStyle(2, palette.eventTile, 0.85)
        .setDepth(3);
      this.propObjects.push(pedestal);
    }

    const gem = this.add
      .polygon(cx, cy, [0, -11, 9, 0, 0, 11, -9, 0], palette.eventTile, 0.95)
      .setStrokeStyle(2, palette.eventGlow, 0.9)
      .setDepth(4);

    if (q !== 'low') {
      this.tweens.add({
        targets: gem,
        y: cy - 4,
        scale: { from: 0.95, to: 1.08 },
        duration: 950,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.propObjects.push(gem);
  }

  private createHeroAvatar(playerClass: PlayerClass): Phaser.GameObjects.Container {
    const cfg = PLAYER_CLASSES[playerClass];
    const avatar = this.add.container(0, 0);
    const q = this.quality;

    if (q !== 'low') {
      const shadow = this.add.ellipse(0, 18, 34, 14, 0x000000, q === 'high' ? 0.38 : 0.28);
      avatar.add(shadow);
    }

    // Cloak / torso
    const cloak = this.add
      .ellipse(0, 5, 28, 26, cfg.colorNum, 1)
      .setStrokeStyle(2, 0x10131c);
    avatar.add(cloak);

    if (playerClass === 'Fighter') {
      const helm = this.add.circle(0, -8, 11, 0xd1d7e0, 1).setStrokeStyle(2, 0x1c212b);
      const visor = this.add.rectangle(0, -7, 12, 4, 0x262c3a);
      const plume = this.add.ellipse(0, -20, 7, 10, cfg.colorNum, 1).setStrokeStyle(1.5, 0x10131c);

      const shield = this.add
        .polygon(-14, 4, [-6, -9, 6, -9, 6, 3, 0, 11, -6, 3], 0x9aa6b8, 1)
        .setStrokeStyle(2, 0xf0b44c);

      const blade = this.add.rectangle(15, -4, 4, 22, 0xe5ebf2).setStrokeStyle(1, 0x2a3140);
      const guard = this.add.rectangle(15, 6, 11, 3, 0xf0b44c);

      avatar.add([plume, helm, visor, shield, blade, guard]);
    } else if (playerClass === 'Wizard') {
      const head = this.add.circle(0, -6, 10, 0xf3d2b3, 1).setStrokeStyle(1.5, 0x1c212b);
      const hatBrim = this.add.ellipse(0, -13, 28, 9, 0x265899, 1).setStrokeStyle(1.5, 0x10131c);
      const hatCone = this.add
        .polygon(0, -22, [-10, 9, 0, -13, 10, 9], 0x3574c4, 1)
        .setStrokeStyle(1.5, 0x10131c);
      const hatBand = this.add.rectangle(0, -15, 16, 3, 0xf0b44c);

      const staff = this.add.rectangle(16, -2, 4, 34, 0x7c4e2d).setStrokeStyle(1, 0x29170a);
      const orbGlow = this.add.circle(16, -20, 8, 0x67e8f9, 0.35);
      const orb = this.add.circle(16, -20, 5, 0x67e8f9, 1).setStrokeStyle(1.5, 0xffffff);

      avatar.add([head, hatBrim, hatCone, hatBand, staff, orbGlow, orb]);
    } else {
      const hood = this.add.circle(0, -8, 11.5, 0x235e3e, 1).setStrokeStyle(2, 0x10131c);
      const face = this.add.circle(0, -7, 7, 0x1a1e29, 1);
      const eyes = this.add.rectangle(0, -8, 8, 2.5, 0xd7f9e6);

      const daggerL = this.add
        .polygon(-15, 2, [0, -10, 3, 4, -3, 4], 0xdce4ee, 1)
        .setStrokeStyle(1, 0x1c212b);
      daggerL.setAngle(-20);
      const daggerR = this.add
        .polygon(15, 2, [0, -10, 3, 4, -3, 4], 0xdce4ee, 1)
        .setStrokeStyle(1, 0x1c212b);
      daggerR.setAngle(20);

      avatar.add([hood, face, eyes, daggerL, daggerR]);
    }

    // Crisp class crest initial
    const crest = this.add
      .text(0, 7, cfg.initial, {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#090b10',
        strokeThickness: 3,
        resolution: this.getTextResolution(),
      })
      .setOrigin(0.5);
    avatar.add(crest);

    if (q === 'high') {
      this.tweens.add({
        targets: avatar,
        y: -2.5,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    return avatar;
  }

  public syncPlayers(players: PublicPlayerState[], snapImmediately = false): void {
    if (!this.isSceneReady) return;

    const activeIds = new Set(players.map((p) => p.id));

    for (const [id, bundle] of this.playerSprites.entries()) {
      if (!activeIds.has(id)) {
        this.tweens.killTweensOf(bundle.avatar);
        this.tweens.killTweensOf(bundle.container);
        bundle.container.destroy();
        this.playerSprites.delete(id);
      }
    }

    const res = this.getTextResolution();
    const useShadow = this.quality !== 'low';

    for (const player of players) {
      let bundle = this.playerSprites.get(player.id);
      const targetX = player.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = player.y * TILE_SIZE + TILE_SIZE / 2;

      if (!bundle) {
        const isMe = player.id === this.myPlayerId;
        const container = this.add.container(targetX, targetY);

        const ring = isMe
          ? this.add
              .ellipse(0, 16, 44, 22, 0xf0b44c, 0.22)
              .setStrokeStyle(2, 0xf0b44c, 0.9)
          : null;

        const avatar = this.createHeroAvatar(player.playerClass);

        const label = this.add
          .text(0, -TILE_SIZE * 0.6, player.name, {
            fontFamily: CANVAS_FONT_FAMILY,
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#f8fafc',
            backgroundColor: '#0e111ae6',
            stroke: '#090b10',
            strokeThickness: 2,
            padding: { x: 8, y: 3 },
            resolution: res,
            shadow: useShadow
              ? { offsetX: 0, offsetY: 1, color: '#000000', blur: 3, stroke: true, fill: true }
              : undefined,
          })
          .setOrigin(0.5);

        if (ring) container.add(ring);
        container.add([avatar, label]);
        container.setDepth(isMe ? 20 : 12);

        bundle = {
          container,
          avatar,
          ring,
          label,
          tileX: player.x,
          tileY: player.y,
        };
        this.playerSprites.set(player.id, bundle);
      }

      bundle.container.setAlpha(player.connected ? 1 : 0.45);
      bundle.label.setText(player.connected ? player.name : `${player.name} (desc.)`);

      if (bundle.tileX !== player.x || bundle.tileY !== player.y) {
        if (snapImmediately) {
          this.tweens.killTweensOf(bundle.container);
          bundle.tileX = player.x;
          bundle.tileY = player.y;
          bundle.container.setPosition(targetX, targetY);
        } else {
          this.movePlayerSprite(player.id, player.x, player.y);
        }
      }
    }
  }

  public movePlayerSprite(playerId: string, tileX: number, tileY: number): void {
    const bundle = this.playerSprites.get(playerId);
    if (!bundle) return;

    bundle.tileX = tileX;
    bundle.tileY = tileY;
    const targetX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.tweens.killTweensOf(bundle.container);
    this.tweens.add({
      targets: bundle.container,
      x: targetX,
      y: targetY,
      duration: 105,
      ease: 'Sine.easeOut',
    });
  }
}
