import type { RegionMap } from './types.js';

const FREE_REGIONS = new Set(['sala-fortuna', 'sala-secreta', 'nave-rota']);

export function portalKey(regionId: string, x: number, y: number): string {
  return `${regionId}:${x},${y}`;
}

export function portalNeedsRoad(targetRegionId: string, minLevel?: number): boolean {
  if ((minLevel ?? 0) >= 25) return false;
  return !FREE_REGIONS.has(targetRegionId);
}

/** 1 combate o evento en reinos de nivel 5, 2 en los de 15, 3 en los de 25 y en el jefe. */
export function roadTaskTarget(minLevel?: number): number {
  const level = minLevel ?? 5;
  if (level >= 25) return 3;
  if (level >= 15) return 2;
  return 1;
}

const MINI_WORLDS = new Set([
  'santuario-roble',
  'forja-oculta',
  'gruta-hielo',
  'observatorio-astral',
]);

/** One board per mini world: top-right, one tile away from the walls. */
export function questBoardSpot(map: RegionMap): { x: number; y: number } | null {
  if (!MINI_WORLDS.has(map.id)) return null;
  return { x: map.width - 3, y: 2 };
}
