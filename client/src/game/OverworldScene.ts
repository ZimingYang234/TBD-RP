import Phaser from 'phaser';
import {
  MOVE_COOLDOWN_MS,
  PLAYER_CLASSES,
  RARITY_LABELS,
  TILE_SIZE,
  type Direction,
  type ItemRarity,
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
  labelEl: HTMLDivElement | null;
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
  boss: {
    grassA: 0x1b1521,
    grassB: 0x221a29,
    grassDetail: 0x3b1f2b,
    grassAccent: 0xd97706,
    pathBase: 0x2e2130,
    pathStoneA: 0x52394a,
    pathStoneB: 0x432d3c,
    wallFace: 0x110c14,
    wallTop: 0x2c2030,
    wallHighlight: 0xb45309,
    waterBase: 0x3b0b12,
    waterDeep: 0x220408,
    waterHighlight: 0xef4444,
    portalBase: 0x521b1b,
    portalGlow: 0xfbbf24,
    portalCore: 0xfef3c7,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  swamp: {
    grassA: 0x2d4a3a,
    grassB: 0x345443,
    grassDetail: 0x20382b,
    grassAccent: 0x65a376,
    pathBase: 0x4e4a38,
    pathStoneA: 0x6e6850,
    pathStoneB: 0x605b45,
    wallFace: 0x212b26,
    wallTop: 0x35453d,
    wallHighlight: 0x4f665a,
    waterBase: 0x2f5241,
    waterDeep: 0x1e382b,
    waterHighlight: 0x84cc8c,
    portalBase: 0x1e3a3a,
    portalGlow: 0x34d399,
    portalCore: 0xd1fae5,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  ruins: {
    grassA: 0x4a4e42,
    grassB: 0x53574a,
    grassDetail: 0x393d32,
    grassAccent: 0x849173,
    pathBase: 0x6b665c,
    pathStoneA: 0x8c8679,
    pathStoneB: 0x7d776b,
    wallFace: 0x2e2d2b,
    wallTop: 0x4d4b46,
    wallHighlight: 0x737068,
    waterBase: 0x2b4c5e,
    waterDeep: 0x1c3542,
    waterHighlight: 0x7dd3fc,
    portalBase: 0x2d2a4a,
    portalGlow: 0x818cf8,
    portalCore: 0xe0e7ff,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  ocean: {
    grassA: 0xc9b382,
    grassB: 0xd4be8d,
    grassDetail: 0xb09968,
    grassAccent: 0xf2dfb1,
    pathBase: 0x9c865b,
    pathStoneA: 0xc7b185,
    pathStoneB: 0xb59f74,
    wallFace: 0x3d3347,
    wallTop: 0x66496b,
    wallHighlight: 0xf472b6,
    waterBase: 0x0e7490,
    waterDeep: 0x155e75,
    waterHighlight: 0x67e8f9,
    portalBase: 0x164e63,
    portalGlow: 0x22d3ee,
    portalCore: 0xecfeff,
    eventTile: 0xf5b942,
    eventGlow: 0xfef08a,
  },
  cavern: {
    grassA: 0x232036,
    grassB: 0x2b2742,
    grassDetail: 0x191626,
    grassAccent: 0x8b5cf6,
    pathBase: 0x373252,
    pathStoneA: 0x524b78,
    pathStoneB: 0x474169,
    wallFace: 0x151224,
    wallTop: 0x322a54,
    wallHighlight: 0x67e8f9,
    waterBase: 0x1e2959,
    waterDeep: 0x121938,
    waterHighlight: 0x60a5fa,
    portalBase: 0x2e1065,
    portalGlow: 0x38bdf8,
    portalCore: 0xe0f2fe,
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
  private roamingSprites = new Map<string, Phaser.GameObjects.Container>();
  private blueCreatureSprite: Phaser.GameObjects.Container | null = null;
  private playerSprites = new Map<string, PlayerSpriteBundle>();
  private lastHoverTileKey = '';
  private bannerContainer: Phaser.GameObjects.Container | null = null;

  private clickTarget: { x: number; y: number } | null = null;
  private clickMarker: Phaser.GameObjects.Arc | null = null;
  private domOverlayEl: HTMLDivElement | null = null;
  private domTooltipEl: HTMLDivElement | null = null;
  private domBannerEl: HTMLDivElement | null = null;
  private domPortalEls: HTMLDivElement[] = [];
  private domBannerTimer: number | null = null;

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
      this.syncRoamingMonsters(room.roamingMonsters ?? []);
      this.syncBlueCreature(room.blueCreature ?? null);
    }
  }

  public showRegionBanner(title: string, subtitle: string): void {
    if (!this.isSceneReady) return;
    const overlay = this.ensureDomOverlay();
    if (!overlay) return;

    if (this.domBannerTimer !== null) {
      window.clearTimeout(this.domBannerTimer);
      this.domBannerTimer = null;
    }
    this.domBannerEl?.remove();

    const banner = document.createElement('div');
    banner.className = 'map-banner-dom';
    banner.innerHTML = `<div class="map-banner-title"></div><div class="map-banner-sub"></div>`;
    banner.querySelector('.map-banner-title')!.textContent = title;
    banner.querySelector('.map-banner-sub')!.textContent = subtitle;
    overlay.appendChild(banner);
    this.domBannerEl = banner;

    if (this.quality !== 'low') {
      this.cameras.main.flash(200, 167, 139, 250, false);
    }

    this.domBannerTimer = window.setTimeout(() => {
      banner.classList.add('fade-out');
      window.setTimeout(() => {
        if (this.domBannerEl === banner) {
          banner.remove();
          this.domBannerEl = null;
        }
      }, 280);
    }, 2200);
  }

  private ensureDomOverlay(): HTMLDivElement | null {
    const canvas = this.game?.canvas;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return null;

    if (!this.domOverlayEl) {
      const overlay = document.createElement('div');
      overlay.className = 'map-dom-overlay';
      parent.appendChild(overlay);
      this.domOverlayEl = overlay;

      const tooltip = document.createElement('div');
      tooltip.className = 'map-tooltip-label';
      tooltip.style.display = 'none';
      overlay.appendChild(tooltip);
      this.domTooltipEl = tooltip;
    }

    this.syncDomOverlayBounds();
    return this.domOverlayEl;
  }

  private syncDomOverlayBounds(): void {
    const canvas = this.game?.canvas;
    if (!canvas || !this.domOverlayEl) return;
    this.domOverlayEl.style.left = `${canvas.offsetLeft}px`;
    this.domOverlayEl.style.top = `${canvas.offsetTop}px`;
    this.domOverlayEl.style.width = `${canvas.clientWidth}px`;
    this.domOverlayEl.style.height = `${canvas.clientHeight}px`;
  }

  private positionDomLabel(el: HTMLElement, worldX: number, worldY: number): void {
    const map = this.room?.map;
    if (!map) return;
    const mapW = map.width * TILE_SIZE;
    const mapH = map.height * TILE_SIZE;
    el.style.left = `${(worldX / mapW) * 100}%`;
    el.style.top = `${(worldY / mapH) * 100}%`;
  }

  public create(): void {
    this.isSceneReady = true;
    this.cameras.main.setRoundPixels(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isSceneReady = false;
      if (this.domBannerTimer !== null) {
        window.clearTimeout(this.domBannerTimer);
        this.domBannerTimer = null;
      }
      this.domOverlayEl?.remove();
      this.domOverlayEl = null;
      this.domTooltipEl = null;
      this.domBannerEl = null;
      this.domPortalEls = [];
    });

    this.scale.on('resize', () => {
      this.syncDomOverlayBounds();
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

    this.ensureDomOverlay();

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
      if (!this.room || !this.domTooltipEl) return;
      const tx = Math.floor(pointer.worldX / TILE_SIZE);
      const ty = Math.floor(pointer.worldY / TILE_SIZE);
      const hoverKey = `${tx},${ty}`;
      if (hoverKey === this.lastHoverTileKey) return;
      this.lastHoverTileKey = hoverKey;

      if (tx < 0 || ty < 0 || tx >= this.room.map.width || ty >= this.room.map.height) {
        this.domTooltipEl.style.display = 'none';
        return;
      }

      const tile = this.room.map.tiles[ty]?.[tx];
      let tip: string | null = null;
      if (tile === 'portal') {
        const portal = this.room.map.portals.find((p) => p.x === tx && p.y === ty);
        tip = portal ? `Portal ${portal.label}` : 'Portal';
      } else if (tile === 'event') {
        tip = 'Evento (clic o camina aquí)';
      } else if (tile === 'combat') {
        tip = 'Combate (clic o camina aquí)';
      } else if (tile === 'shop') {
        tip = 'Tienda (clic o camina aquí)';
      } else if (tile === 'minigame') {
        tip = 'Minijuego (clic o camina aquí)';
      } else if (tile === 'spring') {
        tip = 'Fuente Curativa (+8 Vida)';
      } else if (tile === 'trap') {
        tip = 'Trampa oculta';
      } else if (tile === 'secret_question') {
        tip = 'Enigma Secreto (?)';
      } else if (tile === 'chest') {
        const chest = this.room.map.chests?.find((c) => c.x === tx && c.y === ty);
        tip = chest ? `Cofre ${RARITY_LABELS[chest.rarity]} (clic o camina aquí)` : 'Cofre';
      }

      if (!tip) {
        this.domTooltipEl.style.display = 'none';
        return;
      }

      this.domTooltipEl.textContent = tip;
      this.positionDomLabel(
        this.domTooltipEl,
        tx * TILE_SIZE + TILE_SIZE / 2,
        ty * TILE_SIZE - 8
      );
      this.domTooltipEl.style.display = 'block';
    });

    this.input.on('gameout', () => {
      this.lastHoverTileKey = '';
      if (this.domTooltipEl) this.domTooltipEl.style.display = 'none';
    });

    if (this.room) {
      this.redrawMap();
      this.syncPlayers(this.room.players, true);
      this.syncRoamingMonsters(this.room.roamingMonsters ?? []);
      this.syncBlueCreature(this.room.blueCreature ?? null);
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
    for (const el of this.domPortalEls) {
      el.remove();
    }
    this.domPortalEls = [];
  }

  private rebuildPlayerSprites(): void {
    for (const bundle of this.playerSprites.values()) {
      this.tweens.killTweensOf(bundle.avatar);
      this.tweens.killTweensOf(bundle.container);
      bundle.labelEl?.remove();
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

        if (
          tile === 'grass' ||
          tile === 'event' ||
          tile === 'combat' ||
          tile === 'shop' ||
          tile === 'chest' ||
          tile === 'minigame' ||
          tile === 'spring' ||
          tile === 'trap' ||
          tile === 'secret_question'
        ) {
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
          } else if (tile === 'minigame') {
            this.spawnMinigameMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          } else if (tile === 'spring') {
            this.spawnSpringMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          } else if (tile === 'trap') {
            this.spawnTrapMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          } else if (tile === 'secret_question') {
            this.spawnSecretQuestionMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          } else if (tile === 'chest') {
            const chest = map.chests?.find((c) => c.x === x && c.y === y);
            this.spawnChestMarker(px + TILE_SIZE / 2, py + TILE_SIZE / 2, chest?.rarity ?? 'comun');
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

      const overlay = this.ensureDomOverlay();
      if (overlay) {
        const portalEl = document.createElement('div');
        portalEl.className = 'map-portal-label';
        portalEl.textContent = portal.label;
        this.positionDomLabel(portalEl, labelX, labelY);
        overlay.appendChild(portalEl);
        this.domPortalEls.push(portalEl);
      }
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

  private spawnMinigameMarker(cx: number, cy: number): void {
    const q = this.quality;
    const base = this.add
      .circle(cx, cy, q === 'low' ? 16 : 20, 0x312e81, 0.92)
      .setStrokeStyle(2.5, 0x22d3ee, 0.95)
      .setDepth(3);

    const star = this.add
      .polygon(
        cx,
        cy,
        [0, -12, 3.5, -3.5, 12, 0, 3.5, 3.5, 0, 12, -3.5, 3.5, -12, 0, -3.5, -3.5],
        0x22d3ee,
        0.95
      )
      .setStrokeStyle(1.5, 0xe0f2fe, 0.95)
      .setDepth(4);

    if (q !== 'low') {
      this.tweens.add({
        targets: star,
        scale: { from: 0.92, to: 1.12 },
        angle: { from: -8, to: 8 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.propObjects.push(base, star);
  }

  private spawnSpringMarker(cx: number, cy: number): void {
    const outer = this.add
      .circle(cx, cy, 18, 0x0e7490, 0.85)
      .setStrokeStyle(2, 0x22d3ee, 0.95)
      .setDepth(3);
    const inner = this.add.circle(cx, cy, 8, 0xa5f3fc, 0.95).setDepth(4);
    this.propObjects.push(outer, inner);
  }

  private spawnTrapMarker(cx: number, cy: number): void {
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(2, 0x9ca3af, 0.75);
    g.strokeCircle(cx, cy, 11);
    g.lineBetween(cx - 8, cy - 8, cx + 8, cy + 8);
    g.lineBetween(cx - 8, cy + 8, cx + 8, cy - 8);
    this.propObjects.push(g);
  }

  private spawnSecretQuestionMarker(cx: number, cy: number): void {
    const aura = this.add
      .circle(cx, cy, 22, 0x38bdf8, 0.25)
      .setStrokeStyle(2, 0xfbbf24, 0.95)
      .setDepth(4);
    const qText = this.add
      .text(cx, cy, '?', {
        fontFamily: CANVAS_FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#fef08a',
        resolution: this.getTextResolution(),
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.propObjects.push(aura, qText);
  }

  public syncBlueCreature(creature: { regionId: string; x: number; y: number } | null): void {
    if (!this.isSceneReady || !this.room) return;
    if (!creature || creature.regionId !== this.room.regionId) {
      if (this.blueCreatureSprite) {
        this.blueCreatureSprite.destroy();
        this.blueCreatureSprite = null;
      }
      return;
    }

    const cx = creature.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = creature.y * TILE_SIZE + TILE_SIZE / 2;
    if (!this.blueCreatureSprite) {
      // Small light-blue creature with bright white eyes
      const body = this.add
        .circle(0, 2, 12, 0x38bdf8, 1)
        .setStrokeStyle(2, 0xe0f2fe, 0.95);
      const eyeL = this.add.circle(-4, -1, 3, 0xffffff, 1);
      const eyeR = this.add.circle(4, -1, 3, 0xffffff, 1);
      this.blueCreatureSprite = this.add.container(cx, cy, [body, eyeL, eyeR]).setDepth(16);
    } else {
      this.blueCreatureSprite.setPosition(cx, cy);
    }
  }

  public syncRoamingMonsters(monsters: Array<{ id: string; name: string; x: number; y: number }>): void {
    if (!this.isSceneReady) return;
    const activeIds = new Set(monsters.map((m) => m.id));
    for (const [id, sprite] of this.roamingSprites.entries()) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.roamingSprites.delete(id);
      }
    }

    for (const m of monsters) {
      const cx = m.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = m.y * TILE_SIZE + TILE_SIZE / 2;
      let container = this.roamingSprites.get(m.id);
      if (!container) {
        const body = this.add
          .circle(0, 0, 14, 0x991b1b, 0.95)
          .setStrokeStyle(2, 0xfca5a5, 0.95);
        const eyeL = this.add.circle(-4, -2, 2.5, 0xfef08a, 1);
        const eyeR = this.add.circle(4, -2, 2.5, 0xfef08a, 1);
        container = this.add.container(cx, cy, [body, eyeL, eyeR]).setDepth(14);
        this.roamingSprites.set(m.id, container);
      } else {
        container.setPosition(cx, cy);
      }
    }
  }

  private spawnChestMarker(cx: number, cy: number, rarity: ItemRarity): void {
    const chestColors: Record<ItemRarity, { body: number; trim: number }> = {
      comun: { body: 0x7c5836, trim: 0x9ca3af },
      raro: { body: 0x1e40af, trim: 0x60a5fa },
      epico: { body: 0x581c87, trim: 0xc084fc },
      legendario: { body: 0x92400e, trim: 0xfbbf24 },
    };
    const palette = chestColors[rarity];
    const base = this.add
      .circle(cx, cy, this.quality === 'low' ? 15 : 19, 0x0f121b, 0.72)
      .setStrokeStyle(2, palette.trim, 0.9)
      .setDepth(3);

    const box = this.add
      .rectangle(cx, cy + 2, 22, 15, palette.body, 1)
      .setStrokeStyle(2, palette.trim, 1)
      .setDepth(4);
    const lid = this.add
      .rectangle(cx, cy - 5, 24, 6, palette.trim, 0.95)
      .setDepth(5);
    const clasp = this.add.rectangle(cx, cy, 5, 6, 0xfef3c7, 1).setDepth(6);

    this.propObjects.push(base, box, lid, clasp);
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
        bundle.labelEl?.remove();
        bundle.container.destroy();
        this.playerSprites.delete(id);
      }
    }

    const overlay = this.ensureDomOverlay();

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

        if (ring) container.add(ring);
        container.add([avatar]);
        container.setDepth(isMe ? 20 : 12);

        let labelEl: HTMLDivElement | null = null;
        if (overlay) {
          labelEl = document.createElement('div');
          labelEl.className = `map-player-label${isMe ? ' me' : ''}`;
          overlay.appendChild(labelEl);
          this.positionDomLabel(labelEl, targetX, targetY - TILE_SIZE * 0.6);
        }

        bundle = {
          container,
          avatar,
          ring,
          labelEl,
          tileX: player.x,
          tileY: player.y,
        };
        this.playerSprites.set(player.id, bundle);
      }

      bundle.container.setAlpha(player.connected ? 1 : 0.45);
      if (bundle.labelEl) {
        bundle.labelEl.textContent = player.connected ? player.name : `${player.name} (desc.)`;
        bundle.labelEl.style.opacity = player.connected ? '1' : '0.6';
      }

      if (bundle.tileX !== player.x || bundle.tileY !== player.y) {
        if (snapImmediately) {
          this.tweens.killTweensOf(bundle.container);
          bundle.tileX = player.x;
          bundle.tileY = player.y;
          bundle.container.setPosition(targetX, targetY);
          if (bundle.labelEl) {
            this.positionDomLabel(bundle.labelEl, targetX, targetY - TILE_SIZE * 0.6);
          }
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
      onUpdate: () => {
        if (bundle.labelEl) {
          this.positionDomLabel(
            bundle.labelEl,
            bundle.container.x,
            bundle.container.y - TILE_SIZE * 0.6
          );
        }
      },
      onComplete: () => {
        if (bundle.labelEl) {
          this.positionDomLabel(bundle.labelEl, targetX, targetY - TILE_SIZE * 0.6);
        }
      },
    });
  }
}
