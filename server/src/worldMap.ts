import {
  BOSS_PORTAL_MIN_LEVEL,
  type ChestDef,
  type PortalDef,
  type RegionMap,
  type RegionTheme,
  type TileType,
} from '@tbd/shared';

const CHAR_TO_TILE: Record<string, TileType> = {
  '#': 'wall',
  '.': 'grass',
  ',': 'path',
  '~': 'water',
  P: 'portal',
  E: 'event',
  C: 'combat',
  S: 'shop',
  H: 'chest',
};

function parseGrid(rows: string[]): TileType[][] {
  return rows.map((row) => {
    if (row.length !== 20) {
      throw new Error(`Invalid map row width (${row.length}): ${row}`);
    }
    return row.split('').map((ch) => CHAR_TO_TILE[ch] ?? 'grass');
  });
}

function makeRegion(config: {
  id: string;
  name: string;
  subtitle: string;
  theme: RegionTheme;
  rows: string[];
  spawn: { x: number; y: number };
  portals: PortalDef[];
  chests: ChestDef[];
}): RegionMap {
  return {
    id: config.id,
    name: config.name,
    subtitle: config.subtitle,
    theme: config.theme,
    width: config.rows[0].length,
    height: config.rows.length,
    tiles: parseGrid(config.rows),
    spawn: config.spawn,
    portals: config.portals,
    chests: config.chests,
  };
}

export const STARTING_REGION_ID = 'valderroble';

export const REGIONS: Record<string, RegionMap> = {
  valderroble: makeRegion({
    id: 'valderroble',
    name: 'Reino de Valderroble',
    subtitle: 'Encrucijada Esmeralda',
    theme: 'verdant',
    spawn: { x: 9, y: 7 },
    rows: [
      '####################',
      '#........,P........#',
      '#..##....,,....##..#',
      '#..H..C..,,........#',
      '#....~~..,,..~~....#',
      '#....~~..E,..~~....#',
      '#........,,........#',
      '#P,,,,,,S,,,,,,,,,P#',
      '#........,,........#',
      '#..#.....,,.....#..#',
      '#..#..E..,,.....#..#',
      '#........,,...C..H.#',
      '#....~~..,,..~~....#',
      '#........,,........#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Jefe Final (Nv.10+)',
        targetRegionId: 'camara-final',
        targetX: 2,
        targetY: 7,
        minLevel: BOSS_PORTAL_MIN_LEVEL,
      },
      {
        x: 10,
        y: 1,
        label: '→ Ventisca',
        targetRegionId: 'ventisca',
        targetX: 10,
        targetY: 12,
      },
      {
        x: 18,
        y: 7,
        label: '→ Solceniza',
        targetRegionId: 'solceniza',
        targetX: 2,
        targetY: 7,
      },
    ],
    chests: [
      { x: 3, y: 3, rarity: 'comun' },
      { x: 17, y: 11, rarity: 'raro' },
    ],
  }),

  solceniza: makeRegion({
    id: 'solceniza',
    name: 'Reino de Solceniza',
    subtitle: 'Dunas y Forjas Ardientes',
    theme: 'desert',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#.........P........#',
      '#...~~~...,,..~~~..#',
      '#...~~~...,,..~~~..#',
      '#.........,,..C..H.#',
      '#....##...,,...##..#',
      '#.........,E.......#',
      '#P,,,,,S,,,,.......#',
      '#.........,,.......#',
      '#..~~~....,,.......#',
      '#..~~~....,,..##...#',
      '#..H......,,...C...#',
      '#......E..,,.......#',
      '#.........,,.......#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Valderroble',
        targetRegionId: 'valderroble',
        targetX: 17,
        targetY: 7,
      },
      {
        x: 10,
        y: 1,
        label: '→ Plano Astral',
        targetRegionId: 'plano-astral',
        targetX: 10,
        targetY: 12,
      },
    ],
    chests: [
      { x: 17, y: 4, rarity: 'raro' },
      { x: 3, y: 11, rarity: 'epico' },
    ],
  }),

  ventisca: makeRegion({
    id: 'ventisca',
    name: 'Reino de Ventisca',
    subtitle: 'Cumbres del Invierno Eterno',
    theme: 'frost',
    spawn: { x: 10, y: 12 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#........,,...C..H.#',
      '#.....E..,,........#',
      '#........,,...~~...#',
      '#..##....,,...~~...#',
      '#........,,,,,,,,,P#',
      '#........,,........#',
      '#...~~...,,..##....#',
      '#...~~C..,,........#',
      '#..H.....,,..E.....#',
      '#........,,S.......#',
      '#.........P........#',
      '####################',
    ],
    portals: [
      {
        x: 10,
        y: 13,
        label: '→ Valderroble',
        targetRegionId: 'valderroble',
        targetX: 10,
        targetY: 2,
      },
      {
        x: 18,
        y: 7,
        label: '→ Plano Astral',
        targetRegionId: 'plano-astral',
        targetX: 2,
        targetY: 7,
      },
    ],
    chests: [
      { x: 17, y: 3, rarity: 'raro' },
      { x: 3, y: 11, rarity: 'epico' },
    ],
  }),

  'plano-astral': makeRegion({
    id: 'plano-astral',
    name: 'Plano Astral',
    subtitle: 'Santuario entre Estrellas',
    theme: 'astral',
    spawn: { x: 10, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~....##....~~..#',
      '#...C....,,........#',
      '#....E...,,...E....#',
      '#...#....,,....#...#',
      '#...#..H.,,..H.#...#',
      '#P,,,,,,S,,,,,,,,,P#',
      '#...#....,,....#...#',
      '#...#....,,....#...#',
      '#........,,....C...#',
      '#..~~....,,....~~..#',
      '#..~~....,,....~~..#',
      '#.........P........#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Ventisca',
        targetRegionId: 'ventisca',
        targetX: 17,
        targetY: 7,
      },
      {
        x: 10,
        y: 13,
        label: '→ Solceniza',
        targetRegionId: 'solceniza',
        targetX: 10,
        targetY: 2,
      },
      {
        x: 18,
        y: 7,
        label: '→ Jefe Final (Nv.10+)',
        targetRegionId: 'camara-final',
        targetX: 2,
        targetY: 7,
        minLevel: BOSS_PORTAL_MIN_LEVEL,
      },
    ],
    chests: [
      { x: 7, y: 6, rarity: 'epico' },
      { x: 13, y: 6, rarity: 'legendario' },
    ],
  }),

  'camara-final': makeRegion({
    id: 'camara-final',
    name: 'Cámara del Rey Final',
    subtitle: 'Santuario del Emperador (Nv. 10+)',
    theme: 'boss',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#........,,.....H..#',
      '#........,,........#',
      '#...#....,,....#...#',
      '#...#..........#...#',
      '#P,,,,,,...C.......#',
      '#...#..........#...#',
      '#...#....,,....#...#',
      '#........,,........#',
      '#..~~..##,,##..~~..#',
      '#..~~....,,.....H..#',
      '#........,,........#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Valderroble',
        targetRegionId: 'valderroble',
        targetX: 2,
        targetY: 7,
      },
    ],
    chests: [
      { x: 16, y: 3, rarity: 'legendario' },
      { x: 16, y: 12, rarity: 'legendario' },
    ],
  }),
};

export function findChestAt(map: RegionMap, x: number, y: number): ChestDef | undefined {
  return map.chests.find((c) => c.x === x && c.y === y);
}

export function getRegion(regionId: string): RegionMap {
  return REGIONS[regionId] ?? REGIONS[STARTING_REGION_ID];
}

export function isTileWalkable(map: RegionMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return false;
  }
  const tile = map.tiles[y]?.[x];
  return tile !== 'wall' && tile !== 'water';
}

export function findPortalAt(map: RegionMap, x: number, y: number): PortalDef | undefined {
  return map.portals.find((p) => p.x === x && p.y === y);
}

export function findWalkableNearby(map: RegionMap, originX: number, originY: number, slotIndex: number): { x: number; y: number } {
  const candidateOffsets = [
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];

  // Try slot-preferred offset first, avoiding portal tiles so party doesn't chain-teleport
  const ordered = [
    candidateOffsets[slotIndex % candidateOffsets.length],
    ...candidateOffsets,
  ];

  for (const off of ordered) {
    const cx = originX + off.dx;
    const cy = originY + off.dy;
    if (isTileWalkable(map, cx, cy) && !findPortalAt(map, cx, cy)) {
      return { x: cx, y: cy };
    }
  }

  return { x: originX, y: originY };
}
