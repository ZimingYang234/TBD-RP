import crypto from 'node:crypto';
import {
  BOSS_PORTAL_MIN_LEVEL,
  type ChestDef,
  type PortalDef,
  type RegionMap,
  type RegionTheme,
  type RoamingMonster,
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
  M: 'minigame',
  F: 'spring',
  X: 'trap',
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
  modifierLabel?: string;
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
    modifierLabel: config.modifierLabel,
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
    modifierLabel: 'Brisa Curativa (+1 Vida al inicio de tu turno)',
    theme: 'verdant',
    spawn: { x: 9, y: 7 },
    rows: [
      '####################',
      '#........,P........#',
      '#..#####.,,....##P.#',
      '#.#H..C..,,..F.....#',
      '#..#####.,,..~~....#',
      '#....~~..E,..~~....#',
      '#........,,........#',
      '#P,,,,,,S,,,,,,,,,P#',
      '#........,,..X.....#',
      '#..#.....,,..#####.#',
      '#..#..E..,,..#H..#.#',
      '#........,,..#.#C..#',
      '#....~~..,,..#~~~#.#',
      '#........,P........#',
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
      {
        x: 10,
        y: 13,
        label: '→ Pantano Bruma',
        targetRegionId: 'pantano-bruma',
        targetX: 10,
        targetY: 2,
      },
      {
        x: 17,
        y: 2,
        label: '🔒 Claro Secreto',
        targetRegionId: 'santuario-roble',
        targetX: 2,
        targetY: 7,
        requiredKey: 'key_valderroble',
        requiredKeyLabel: 'Llave de Valderroble',
      },
    ],
    chests: [
      { x: 3, y: 3, rarity: 'comun' },
      { x: 14, y: 10, rarity: 'raro' },
    ],
  }),

  solceniza: makeRegion({
    id: 'solceniza',
    name: 'Reino de Solceniza',
    subtitle: 'Dunas y Forjas Ardientes',
    modifierLabel: 'Calor Abrasador (+1 daño de fuego)',
    theme: 'desert',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#.........P........#',
      '#...~~~..,,..~~~~#.#',
      '#...~~~..,,..~H.C..#',
      '#........,,..~~~~#.#',
      '#....##..,,....##..#',
      '#........,E........#',
      '#P,,,,,S,,,,,,,,,,P#',
      '#........,,........#',
      '#..~~~...,,........#',
      '#.~H.C...,,...##...#',
      '#..~~~...,,........#',
      '#......E.,,........#',
      '#........,P........#',
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
      {
        x: 18,
        y: 7,
        label: '→ Ruinas Olvido',
        targetRegionId: 'ruinas-olvido',
        targetX: 2,
        targetY: 7,
      },
      {
        x: 10,
        y: 13,
        label: '🔒 Forja Oculta',
        targetRegionId: 'forja-oculta',
        targetX: 2,
        targetY: 7,
        requiredKey: 'key_solceniza',
        requiredKeyLabel: 'Llave de Solceniza',
      },
    ],
    chests: [
      { x: 14, y: 3, rarity: 'raro' },
      { x: 3, y: 10, rarity: 'epico' },
    ],
  }),

  ventisca: makeRegion({
    id: 'ventisca',
    name: 'Reino de Ventisca',
    subtitle: 'Cumbres del Invierno Eterno',
    modifierLabel: 'Frío Cortante (+1 Defensa a todos)',
    theme: 'frost',
    spawn: { x: 10, y: 12 },
    rows: [
      '####################',
      '#..~~.....P....~~..#',
      '#..~~..##..##.####.#',
      '#........,,...C.H#.#',
      '#.....E..,,...~~~~.#',
      '#........,,...~~...#',
      '#..##....,,...~~...#',
      '#P,,,,,,,S,,,,,,,,P#',
      '#........,,........#',
      '#...~~~..,,..##....#',
      '#..#H.C..,,........#',
      '#...~~~..,,..E.....#',
      '#........,,........#',
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
      {
        x: 1,
        y: 7,
        label: '→ Archipiélago',
        targetRegionId: 'archipielago-coral',
        targetX: 17,
        targetY: 7,
      },
      {
        x: 10,
        y: 1,
        label: '🔒 Gruta Secreta',
        targetRegionId: 'gruta-hielo',
        targetX: 2,
        targetY: 7,
        requiredKey: 'key_ventisca',
        requiredKeyLabel: 'Llave de Ventisca',
      },
    ],
    chests: [
      { x: 16, y: 3, rarity: 'raro' },
      { x: 4, y: 10, rarity: 'epico' },
    ],
  }),

  'plano-astral': makeRegion({
    id: 'plano-astral',
    name: 'Plano Astral',
    subtitle: 'Santuario entre Estrellas',
    modifierLabel: 'Energía Arcana (+2 daño mágico)',
    theme: 'astral',
    spawn: { x: 10, y: 7 },
    rows: [
      '####################',
      '#..~~.....P....~~..#',
      '#..~~....##....~~P.#',
      '#..####..,,........#',
      '#..#H.C..,,...E....#',
      '#..####..,,....#...#',
      '#...#....,,....#...#',
      '#P,,,,,,S,,,,,,,,,P#',
      '#...#....,,....#...#',
      '#...#....,,....#...#',
      '#........,,..####..#',
      '#..~~....,,..C.H#..#',
      '#..~~....,,..~~~~..#',
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
      {
        x: 10,
        y: 1,
        label: '→ Abismo Cristal',
        targetRegionId: 'abismo-cristal',
        targetX: 10,
        targetY: 12,
      },
      {
        x: 17,
        y: 2,
        label: '🔒 Observatorio',
        targetRegionId: 'observatorio-astral',
        targetX: 2,
        targetY: 7,
        requiredKey: 'key_astral',
        requiredKeyLabel: 'Llave Astral',
      },
    ],
    chests: [
      { x: 4, y: 4, rarity: 'epico' },
      { x: 15, y: 11, rarity: 'legendario' },
    ],
  }),

  'pantano-bruma': makeRegion({
    id: 'pantano-bruma',
    name: 'Pantano de la Bruma',
    subtitle: 'Ciénagas de Niebla Eterna',
    modifierLabel: 'Niebla Tóxica (probabilidad de veneno)',
    theme: 'swamp',
    spawn: { x: 10, y: 2 },
    rows: [
      '####################',
      '#..~~.....P....~~..#',
      '#..~~~~..,,..~~~~..#',
      '#..~H.C..,,........#',
      '#..~~~~..,,..~~....#',
      '#.....E..,,..~~....#',
      '#........,,........#',
      '#...,,,,S,,,,,,,,,P#',
      '#........,,........#',
      '#..~~~...,,..~~~~..#',
      '#..~~~...,,...C.H#.#',
      '#.....C..,,..~~~~..#',
      '#........,,..E.....#',
      '#........,,........#',
      '####################',
    ],
    portals: [
      {
        x: 10,
        y: 1,
        label: '→ Valderroble',
        targetRegionId: 'valderroble',
        targetX: 10,
        targetY: 12,
      },
      {
        x: 18,
        y: 7,
        label: '→ Ruinas Olvido',
        targetRegionId: 'ruinas-olvido',
        targetX: 2,
        targetY: 7,
      },
    ],
    chests: [
      { x: 4, y: 3, rarity: 'raro' },
      { x: 16, y: 10, rarity: 'epico' },
    ],
  }),

  'ruinas-olvido': makeRegion({
    id: 'ruinas-olvido',
    name: 'Ruinas del Olvido',
    subtitle: 'Templos de Piedra Antigua',
    modifierLabel: 'Ecos Antiguos (+10% EXP extra)',
    theme: 'ruins',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..##..........##..#',
      '#..##....,,..####..#',
      '#.....E..,,..C.H#..#',
      '#..####..,,..####..#',
      '#........,,........#',
      '#........,,........#',
      '#P,,,,,,S,,,,,.....#',
      '#........,,........#',
      '#..####..,,...~~...#',
      '#..#H.C..,,...~~...#',
      '#..####..,,....E...#',
      '#........,,........#',
      '#.........P........#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Solceniza',
        targetRegionId: 'solceniza',
        targetX: 17,
        targetY: 7,
      },
      {
        x: 10,
        y: 13,
        label: '→ Pantano Bruma',
        targetRegionId: 'pantano-bruma',
        targetX: 17,
        targetY: 7,
      },
    ],
    chests: [
      { x: 15, y: 3, rarity: 'raro' },
      { x: 4, y: 10, rarity: 'epico' },
    ],
  }),

  'archipielago-coral': makeRegion({
    id: 'archipielago-coral',
    name: 'Archipiélago de Coral',
    subtitle: 'Islas de Arrecifes Profundos',
    modifierLabel: 'Marea Rápida (+2 Iniciativa al grupo)',
    theme: 'ocean',
    spawn: { x: 17, y: 7 },
    rows: [
      '####################',
      '#..~~~....P...~~~..#',
      '#..~~~~..,,...~~~..#',
      '#..~H.C..,,........#',
      '#..~~~~..,,....E...#',
      '#........,,..~~~...#',
      '#.....E..,,..~~~...#',
      '#...,,,,S,,,,,,,,,P#',
      '#........,,........#',
      '#..~~~...,,..~~~~..#',
      '#..~~~...,,..C.H~..#',
      '#........,,..~~~~..#',
      '#....C...,,........#',
      '#........,,........#',
      '####################',
    ],
    portals: [
      {
        x: 18,
        y: 7,
        label: '→ Ventisca',
        targetRegionId: 'ventisca',
        targetX: 2,
        targetY: 7,
      },
      {
        x: 10,
        y: 1,
        label: '→ Abismo Cristal',
        targetRegionId: 'abismo-cristal',
        targetX: 10,
        targetY: 12,
      },
    ],
    chests: [
      { x: 4, y: 3, rarity: 'raro' },
      { x: 15, y: 10, rarity: 'epico' },
    ],
  }),

  'abismo-cristal': makeRegion({
    id: 'abismo-cristal',
    name: 'Abismo de Cristal',
    subtitle: 'Cavernas de Cuarzo Vivo',
    modifierLabel: 'Cristales Cargados (+1 Ataque al grupo)',
    theme: 'cavern',
    spawn: { x: 10, y: 12 },
    rows: [
      '####################',
      '#..##..........##..#',
      '#..#####.,,....##..#',
      '#..#H.C..,,...E....#',
      '#..#####.,,........#',
      '#.....E..,,...##...#',
      '#........,,...##...#',
      '#P,,,,,,S,,,,......#',
      '#........,,........#',
      '#..##....,,..#####.#',
      '#..##....,,..C.H##.#',
      '#........,,..#####.#',
      '#........,,........#',
      '#.........P........#',
      '####################',
    ],
    portals: [
      {
        x: 10,
        y: 13,
        label: '→ Plano Astral',
        targetRegionId: 'plano-astral',
        targetX: 10,
        targetY: 3,
      },
      {
        x: 1,
        y: 7,
        label: '→ Archipiélago',
        targetRegionId: 'archipielago-coral',
        targetX: 10,
        targetY: 2,
      },
    ],
    chests: [
      { x: 4, y: 3, rarity: 'epico' },
      { x: 15, y: 10, rarity: 'legendario' },
    ],
  }),

  'santuario-roble': makeRegion({
    id: 'santuario-roble',
    name: 'Claro Secreto del Roble',
    subtitle: 'Santuario Oculto de Valderroble',
    theme: 'verdant',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#..................#',
      '#......M...........#',
      '#...##........##...#',
      '#..................#',
      '#P,,,,,,...,,,,,H..#',
      '#..................#',
      '#...##........##...#',
      '#............M.....#',
      '#..................#',
      '#..~~..##..##..~~..#',
      '#..~~..........~~..#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Valderroble',
        targetRegionId: 'valderroble',
        targetX: 17,
        targetY: 3,
      },
    ],
    chests: [{ x: 16, y: 7, rarity: 'raro' }],
  }),

  'forja-oculta': makeRegion({
    id: 'forja-oculta',
    name: 'Forja Oculta de Solceniza',
    subtitle: 'Crisol Secreto del Desierto',
    theme: 'desert',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#..................#',
      '#......M...........#',
      '#...##........##...#',
      '#..................#',
      '#P,,,,,,...,,,,,H..#',
      '#..................#',
      '#...##........##...#',
      '#............M.....#',
      '#..................#',
      '#..~~..##..##..~~..#',
      '#..~~..........~~..#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Solceniza',
        targetRegionId: 'solceniza',
        targetX: 10,
        targetY: 12,
      },
    ],
    chests: [{ x: 16, y: 7, rarity: 'epico' }],
  }),

  'gruta-hielo': makeRegion({
    id: 'gruta-hielo',
    name: 'Gruta Secreta de Ventisca',
    subtitle: 'Caverna Oculta de Escarcha',
    theme: 'frost',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#..................#',
      '#......M...........#',
      '#...##........##...#',
      '#..................#',
      '#P,,,,,,...,,,,,H..#',
      '#..................#',
      '#...##........##...#',
      '#............M.....#',
      '#..................#',
      '#..~~..##..##..~~..#',
      '#..~~..........~~..#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Ventisca',
        targetRegionId: 'ventisca',
        targetX: 10,
        targetY: 2,
      },
    ],
    chests: [{ x: 16, y: 7, rarity: 'epico' }],
  }),

  'observatorio-astral': makeRegion({
    id: 'observatorio-astral',
    name: 'Observatorio Secreto Astral',
    subtitle: 'Cúpula Oculta de las Estrellas',
    theme: 'astral',
    spawn: { x: 2, y: 7 },
    rows: [
      '####################',
      '#..~~..........~~..#',
      '#..~~..##..##..~~..#',
      '#..................#',
      '#......M...........#',
      '#...##........##...#',
      '#..................#',
      '#P,,,,,,...,,,,,H..#',
      '#..................#',
      '#...##........##...#',
      '#............M.....#',
      '#..................#',
      '#..~~..##..##..~~..#',
      '#..~~..........~~..#',
      '####################',
    ],
    portals: [
      {
        x: 1,
        y: 7,
        label: '→ Plano Astral',
        targetRegionId: 'plano-astral',
        targetX: 17,
        targetY: 3,
      },
    ],
    chests: [{ x: 16, y: 7, rarity: 'legendario' }],
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

export function spawnRoamingMonstersForRegion(map: RegionMap): RoamingMonster[] {
  const isMiniWorld =
    map.id === 'santuario-roble' ||
    map.id === 'forja-oculta' ||
    map.id === 'gruta-hielo' ||
    map.id === 'observatorio-astral';
  if (isMiniWorld || map.id === 'camara-final') return [];

  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 2; y < map.height - 2; y++) {
    for (let x = 2; x < map.width - 2; x++) {
      const t = map.tiles[y]?.[x];
      if ((t === 'grass' || t === 'path') && Math.abs(x - map.spawn.x) + Math.abs(y - map.spawn.y) >= 4) {
        candidates.push({ x, y });
      }
    }
  }
  const names = ['Patrulla Hostil', 'Acechador'];
  const result: RoamingMonster[] = [];
  for (let i = 0; i < 2 && candidates.length > 0; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    const pos = candidates.splice(idx, 1)[0];
    result.push({
      id: crypto.randomUUID(),
      name: names[i],
      x: pos.x,
      y: pos.y,
    });
  }
  return result;
}
