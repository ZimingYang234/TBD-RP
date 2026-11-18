import type { ItemDef, ItemRarity, PlayerClass } from './types.js';

export const GAME_TITLE = 'TBD';

export const MAX_PLAYERS = 3;
export const ROOM_CODE_LENGTH = 4;
export const TILE_SIZE = 64;
export const MOVE_COOLDOWN_MS = 130;
export const PORTAL_COOLDOWN_MS = 700;
export const EVENT_TILE_COOLDOWN_MS = 12_000;
export const COMBAT_TILE_COOLDOWN_MS = 12_000;
export const CHEST_RESPAWN_MS = 45_000;
export const STARTING_GOLD = 20;
export const MAX_INVENTORY_SLOTS = 5;
export const BOSS_PORTAL_MIN_LEVEL = 10;
export const TAVERN_MAX_PLAYS = 3;
export const TAVERN_WINDOW_MS = 15 * 60 * 1000;

export function xpForNextLevel(level: number): number {
  return Math.round(100 * Math.pow(1.1, Math.max(0, level - 1)));
}

export const RARITY_LABELS: Record<ItemRarity, string> = {
  comun: 'Común',
  raro: 'Raro',
  epico: 'Épico',
  legendario: 'Legendario',
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  comun: '#9ca3af',
  raro: '#60a5fa',
  epico: '#c084fc',
  legendario: '#fbbf24',
};

export const ITEMS_BY_ID: Record<string, ItemDef> = {
  potion: {
    id: 'potion',
    name: 'Poción de vida',
    kind: 'consumable',
    rarity: 'comun',
    description: 'Recupera 1d6+4 de Vida.',
  },
  bomb: {
    id: 'bomb',
    name: 'Bomba arcana',
    kind: 'consumable',
    rarity: 'raro',
    description: 'Inflige 2d6+4 de daño directo en combate.',
  },
  elixir: {
    id: 'elixir',
    name: 'Elixir Dorado',
    kind: 'consumable',
    rarity: 'epico',
    description: 'Cura toda tu Vida y otorga +30 EXP.',
  },
  // Chest Weapons
  weapon_rusty: {
    id: 'weapon_rusty',
    name: 'Espada Oxidada',
    kind: 'weapon',
    rarity: 'comun',
    description: '+1 Ataque al equipar.',
    attackBonus: 1,
  },
  weapon_elven: {
    id: 'weapon_elven',
    name: 'Hoja Élfica',
    kind: 'weapon',
    rarity: 'raro',
    description: '+3 Ataque y +1 Suerte al equipar.',
    attackBonus: 3,
    luckBonus: 1,
  },
  weapon_fiery: {
    id: 'weapon_fiery',
    name: 'Mandoble Ígneo',
    kind: 'weapon',
    rarity: 'epico',
    description: '+5 Ataque y +2 Suerte al equipar.',
    attackBonus: 5,
    luckBonus: 2,
  },
  weapon_astral: {
    id: 'weapon_astral',
    name: 'Matadragones Astral',
    kind: 'weapon',
    rarity: 'legendario',
    description: '+8 Ataque y +4 Suerte al equipar.',
    attackBonus: 8,
    luckBonus: 4,
  },
  // Chest Armors
  armor_leather: {
    id: 'armor_leather',
    name: 'Cota de Cuero',
    kind: 'armor',
    rarity: 'comun',
    description: '+1 Defensa al equipar.',
    defenseBonus: 1,
  },
  armor_steel: {
    id: 'armor_steel',
    name: 'Malla de Acero',
    kind: 'armor',
    rarity: 'raro',
    description: '+3 Defensa y +3 Vida máx al equipar.',
    defenseBonus: 3,
    hpBonus: 3,
  },
  armor_glacial: {
    id: 'armor_glacial',
    name: 'Coraza Glacial',
    kind: 'armor',
    rarity: 'epico',
    description: '+5 Defensa y +6 Vida máx al equipar.',
    defenseBonus: 5,
    hpBonus: 6,
  },
  armor_eternal: {
    id: 'armor_eternal',
    name: 'Égida Eterna',
    kind: 'armor',
    rarity: 'legendario',
    description: '+8 Defensa y +10 Vida máx al equipar.',
    defenseBonus: 8,
    hpBonus: 10,
  },
};

export interface ShopItemDef {
  id: 'potion' | 'bomb' | 'weapon_upgrade' | 'armor_upgrade' | 'luck_charm';
  name: string;
  category: 'consumable' | 'gear' | 'charm';
  price: number;
  maxOwned: number;
  description: string;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  {
    id: 'potion',
    name: 'Poción de vida',
    category: 'consumable',
    price: 12,
    maxOwned: 5,
    description: 'Recupera 1d6+4 PV (en combate o fuera de él).',
  },
  {
    id: 'bomb',
    name: 'Bomba arcana',
    category: 'consumable',
    price: 20,
    maxOwned: 3,
    description: 'Inflige 2d6+4 de daño directo en combate.',
  },
  {
    id: 'weapon_upgrade',
    name: 'Filo rúnico',
    category: 'gear',
    price: 30,
    maxOwned: 2,
    description: '+2 permanente a tus tiradas de ataque.',
  },
  {
    id: 'armor_upgrade',
    name: 'Armadura templada',
    category: 'gear',
    price: 30,
    maxOwned: 2,
    description: '+2 permanente a tu Clase de Armadura (CA).',
  },
  {
    id: 'luck_charm',
    name: 'Amuleto de la Suerte',
    category: 'charm',
    price: 35,
    maxOwned: 2,
    description: '+2 permanente a tus tiradas de Suerte.',
  },
];

export interface ClassTemplate {
  id: PlayerClass;
  name: string;
  initial: string;
  maxHp: number;
  ac: number;
  attackMod: number;
  initiativeMod: number;
  damageDice: string;
  specialName: string;
  specialDesc: string;
  colorHex: string;
  colorNum: number;
  shortDesc: string;
}

export const PLAYER_CLASSES: Record<PlayerClass, ClassTemplate> = {
  Fighter: {
    id: 'Fighter',
    name: 'Guerrero',
    initial: 'G',
    maxHp: 24,
    ac: 15,
    attackMod: 4,
    initiativeMod: 1,
    damageDice: '1d8+3',
    specialName: 'Tajo Sísmico',
    specialDesc: 'Golpea a todos los enemigos',
    colorHex: '#e05a47',
    colorNum: 0xe05a47,
    shortDesc: 'Alta vida y armadura (PV 24, CA 15)',
  },
  Wizard: {
    id: 'Wizard',
    name: 'Mago',
    initial: 'M',
    maxHp: 16,
    ac: 12,
    attackMod: 5,
    initiativeMod: 2,
    damageDice: '1d10+2',
    specialName: 'Bola de Fuego',
    specialDesc: 'Daño directo (ignora CA)',
    colorHex: '#4a90e2',
    colorNum: 0x4a90e2,
    shortDesc: 'Poder arcano (PV 16, CA 12)',
  },
  Rogue: {
    id: 'Rogue',
    name: 'Pícaro',
    initial: 'P',
    maxHp: 19,
    ac: 14,
    attackMod: 5,
    initiativeMod: 3,
    damageDice: '1d6+4',
    specialName: 'Golpe Furtivo',
    specialDesc: 'Crítico fácil (15–20)',
    colorHex: '#48b878',
    colorNum: 0x48b878,
    shortDesc: 'Atacante ágil (PV 19, CA 14)',
  },
};

export const PLAYER_CLASS_LIST: PlayerClass[] = ['Fighter', 'Wizard', 'Rogue'];
