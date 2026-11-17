import type { PlayerClass } from './types.js';

export const GAME_TITLE = 'TBD';

export const MAX_PLAYERS = 3;
export const ROOM_CODE_LENGTH = 4;
export const TILE_SIZE = 64;
export const MOVE_COOLDOWN_MS = 130;
export const PORTAL_COOLDOWN_MS = 700;
export const EVENT_TILE_COOLDOWN_MS = 12_000;
export const COMBAT_TILE_COOLDOWN_MS = 12_000;
export const STARTING_GOLD = 20;

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
    colorHex: '#48b878',
    colorNum: 0x48b878,
    shortDesc: 'Atacante ágil (PV 19, CA 14)',
  },
};

export const PLAYER_CLASS_LIST: PlayerClass[] = ['Fighter', 'Wizard', 'Rogue'];
