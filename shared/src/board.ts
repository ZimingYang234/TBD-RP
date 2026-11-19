import type { PortalDef, RegionMap } from './types.js';

const FREE_REGIONS = new Set(['sala-fortuna', 'sala-secreta', 'nave-rota']);

export function portalKey(regionId: string, x: number, y: number): string {
  return `${regionId}:${x},${y}`;
}

export function portalNeedsRoad(targetRegionId: string): boolean {
  return !FREE_REGIONS.has(targetRegionId);
}

/** 1 combate o evento en reinos de nivel 5, 2 en los de 15, 3 en los de 25 y en el jefe. */
export function roadTaskTarget(minLevel?: number): number {
  const level = minLevel ?? 5;
  if (level >= 25) return 3;
  if (level >= 15) return 2;
  return 1;
}

export function questBoardSpot(map: RegionMap, portal: PortalDef): { x: number; y: number } | null {
  const offsets = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [2, 1],
    [-2, 1],
    [2, -1],
    [-2, -1],
    [3, 0],
    [-3, 0],
    [0, 3],
    [0, -3],
  ];
  for (const [dx, dy] of offsets) {
    const x = portal.x + dx;
    const y = portal.y + dy;
    if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) continue;
    const tile = map.tiles[y]?.[x];
    if (!tile || tile === 'wall' || tile === 'water' || tile === 'portal') continue;
    if (map.portals.some((p) => p.x === x && p.y === y)) continue;
    return { x, y };
  }
  return null;
}
