import type {
  ItemDef,
  ItemRarity,
  MythicId,
  PlayerClass,
  Race,
  SkillNodeDef,
  SlotRarity,
  SubclassId,
} from './types.js';

export const GAME_TITLE = 'TBD';

export const MAX_PLAYERS = 3;
export const ROOM_CODE_LENGTH = 4;
export const TILE_SIZE = 64;
export const MOVE_COOLDOWN_MS = 130;
export const PORTAL_COOLDOWN_MS = 700;
export const EVENT_TILE_COOLDOWN_MS = 12_000;
export const COMBAT_TILE_COOLDOWN_MS = 12_000;
export const CHEST_RESPAWN_MS = 45_000;
export const MINIGAME_COOLDOWN_MS = 20_000;
export const STARTING_GOLD = 20;
export const MAX_INVENTORY_SLOTS = 5;
export const BOSS_PORTAL_MIN_LEVEL = 30;
export const TAVERN_MAX_PLAYS = 3;
export const TAVERN_WINDOW_MS = 15 * 60 * 1000;

export function xpForNextLevel(level: number): number {
  return Math.round(120 * Math.pow(1.16, Math.max(0, level - 1)));
}

/** 1 point every 2 levels through 10, then every 3 levels. */
export function skillPointOnLevel(level: number): boolean {
  if (level <= 1) return false;
  if (level <= 10) return level % 2 === 0;
  return (level - 10) % 3 === 0;
}

export const LOCAL_BOSS_KEY_IDS = [
  'key_valderroble',
  'key_solceniza',
  'key_ventisca',
  'key_astral',
] as const;

export const SLOT_COST_GOLD = 100;

export const SLOT_ODDS: Array<{ id: SlotRarity; label: string; pct: number }> = [
  { id: 'comun', label: 'Común', pct: 25 },
  { id: 'raro', label: 'Raro', pct: 35 },
  { id: 'epico', label: 'Épico', pct: 30 },
  { id: 'legendario', label: 'Legendario', pct: 9 },
  { id: 'mitico', label: 'Mítico', pct: 1 },
];

export const MYTHICS: Record<
  MythicId,
  { name: string; title: string; blurb: string }
> = {
  uriel: {
    name: 'Uriel',
    title: 'Defensa Absoluta',
    blurb: '3 rondas sin daño. Tres esquivas perfectas devuelven el golpe.',
  },
  raphael: {
    name: 'Raphael',
    title: 'Inteligencia Absoluta',
    blurb: '3 turnos enemigos: -30% de daño y cura un 15% de tu vida. Luego un haz de 150 y una maldición del 90%.',
  },
};

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
    description: 'Cura 1d4 más un 20% de tu Vida máxima.',
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
  id: 'potion' | 'bomb' | 'weapon_upgrade' | 'armor_upgrade' | 'luck_charm' | 'sanctum_key';
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
    description: 'Cura 1d4 más un 20% de tu Vida máxima (en combate o fuera de él).',
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
  {
    id: 'sanctum_key',
    name: 'Llave del Eclipse',
    category: 'charm',
    price: 10000,
    maxOwned: 1,
    description: 'Abre el camino a la sala secreta. Hace falta, además, la llave del jefe final y vencer a 3 criaturas celestes.',
  },
];

export const RACE_LIST: Race[] = ['Human', 'Elf', 'Dwarf'];

export const RACES: Record<Race, { name: string; perk: string; colorHex: string }> = {
  Human: {
    name: 'Humano',
    perk: '+10% EXP y 1 punto de habilidad extra al empezar.',
    colorHex: '#e7c27a',
  },
  Elf: {
    name: 'Elfo',
    perk: '+3 Suerte y la zona de esquiva perfecta es más ancha.',
    colorHex: '#6ee7b7',
  },
  Dwarf: {
    name: 'Enano',
    perk: '+8 Vida máxima y +2 Defensa.',
    colorHex: '#f0a08a',
  },
};

export const SUBCLASSES: Record<
  SubclassId,
  { name: string; race: Race; archetype: PlayerClass; perk: string }
> = {
  knight: { name: 'Caballero', race: 'Human', archetype: 'Fighter', perk: '+1 Ataque' },
  rogue: { name: 'Pícaro', race: 'Human', archetype: 'Rogue', perk: '+1 Suerte' },
  mage: { name: 'Mago', race: 'Human', archetype: 'Wizard', perk: '+1 Ataque' },
  explorer: { name: 'Explorador', race: 'Elf', archetype: 'Rogue', perk: '+2 Suerte' },
  summoner: { name: 'Invocador', race: 'Elf', archetype: 'Wizard', perk: '+1 Ataque' },
  dancer: { name: 'Bailarín', race: 'Elf', archetype: 'Rogue', perk: '+2 Suerte' },
  guardian: { name: 'Guardián', race: 'Dwarf', archetype: 'Fighter', perk: '+4 Vida y +1 Defensa' },
  forgemaster: { name: 'Forjador', race: 'Dwarf', archetype: 'Fighter', perk: '+2 Ataque' },
  berserker: { name: 'Berserker', race: 'Dwarf', archetype: 'Fighter', perk: '+3 Ataque y -1 Defensa' },
};

export const SKILL_TREE: SkillNodeDef[] = [
  {
    id: 'martial_1',
    branch: 'Marcial',
    tier: 1,
    name: 'Fuerza Constante',
    kind: 'passive',
    cost: 1,
    description: 'Pasiva: +2 Ataque permanente.',
  },
  {
    id: 'martial_2',
    branch: 'Marcial',
    tier: 2,
    name: 'Golpe Seguro',
    kind: 'active',
    cost: 2,
    requires: 'martial_1',
    combatAction: 'skill_safe',
    description: 'Activa (1/combate): Nunca falla. Inflige 10 + Ataque + 10% de tu Vida.',
  },
  {
    id: 'guard_1',
    branch: 'Baluarte',
    tier: 1,
    name: 'Piel de Hierro',
    kind: 'passive',
    cost: 1,
    description: 'Pasiva: +2 Defensa y +4 Vida máx permanentes.',
  },
  {
    id: 'guard_2',
    branch: 'Baluarte',
    tier: 2,
    name: 'Escudo de Grupo',
    kind: 'active',
    cost: 2,
    requires: 'guard_1',
    combatAction: 'skill_shield',
    description: 'Activa (1/combate): Cura al grupo según tu Vida y da +2 Defensa.',
  },
  {
    id: 'focus_1',
    branch: 'Arcano',
    tier: 1,
    name: 'Mente Clara',
    kind: 'passive',
    cost: 1,
    description: 'Pasiva: +1 Ataque y +3 Suerte permanentes.',
  },
  {
    id: 'focus_2',
    branch: 'Arcano',
    tier: 2,
    name: 'Descarga Certera',
    kind: 'active',
    cost: 2,
    requires: 'focus_1',
    combatAction: 'skill_pierce',
    description: 'Activa (1/combate): Ignora Defensa e inflige 14 + mitad de Ataque + 10% de tu Vida.',
  },
  {
    id: 'martial_3',
    branch: 'Marcial',
    tier: 3,
    name: 'Maestría del Filo',
    kind: 'passive',
    cost: 3,
    requires: 'martial_2',
    description: 'Pasiva: +3 Ataque permanente.',
  },
  {
    id: 'guard_3',
    branch: 'Baluarte',
    tier: 3,
    name: 'Muralla Viviente',
    kind: 'passive',
    cost: 3,
    requires: 'guard_2',
    description: 'Pasiva: +3 Defensa y +6 Vida máxima.',
  },
  {
    id: 'focus_3',
    branch: 'Arcano',
    tier: 3,
    name: 'Ojo del Oráculo',
    kind: 'passive',
    cost: 3,
    requires: 'focus_2',
    description: 'Pasiva: +4 Suerte permanente.',
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

/** Extra damage added to the player's attacks, based on max HP. */
export function lifeDamageBonus(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * 0.1));
}

/** Flat part of a potion heal, based on max HP. A 1d4 is rolled on top. */
export function potionHealFlat(maxHp: number): number {
  return Math.max(2, Math.round(maxHp * 0.2));
}

export const BOSS_KEY_BY_REGION: Record<string, { id: string; label: string }> = {
  valderroble: { id: 'key_valderroble', label: 'Llave de Valderroble' },
  solceniza: { id: 'key_solceniza', label: 'Llave de Solceniza' },
  ventisca: { id: 'key_ventisca', label: 'Llave de Ventisca' },
  'plano-astral': { id: 'key_astral', label: 'Llave Astral' },
};
