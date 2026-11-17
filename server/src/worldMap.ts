import type { PortalDef, RegionMap, RegionTheme, TileType } from '@tbd/shared';

const CHAR_TO_TILE: Record<string, TileType> = {
  '#': 'wall',
  '.': 'grass',
  ',': 'path',
  '~': 'water',
  P: 'portal',
  E: 'event',
  C: 'combat',
  S: 'shop',
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
      '#.....C..,,........#',
      '#....~~..,,..~~....#',
      '#....~~..E,..~~....#',
      '#........,,........#',
      '#,,,,,,,S,,,,,,,,,P#',
      '#........,,........#',
      '#..#.....,,.....#..#',
      '#..#..E..,,.....#..#',
      '#........,,...C....#',
      '#....~~..,,..~~....#',
      '#........,,........#',
      '####################',
    ],
    portals: [
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
      '#.........,,..C....#',
      '#....##...,,...##..#',
      '#.........,E.......#',
      '#P,,,,,S,,,,.......#',
      '#.........,,.......#',
      '#..~~~....,,.......#',
      '#..~~~....,,..##...#',
      '#.........,,...C...#',
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
      '#........,,...C....#',
      '#.....E..,,........#',
      '#........,,...~~...#',
      '#..##....,,...~~...#',
      '#........,,,,,,,,,P#',
      '#........,,........#',
      '#...~~...,,..##....#',
      '#...~~C..,,........#',
      '#........,,..E.....#',
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
      '#...#....,,....#...#',
      '#P,,,,,,S,,,,,,,,..#',
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
    ],
  }),
};

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
