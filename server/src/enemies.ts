import crypto from 'node:crypto';
import type { CombatEnemy } from '@tbd/shared';

interface EnemyTemplate {
  name: string;
  maxHp: number;
  ac: number;
  attackMod: number;
  initiativeMod: number;
  damageDice: string;
  xpReward: number;
  goldReward: number;
}

const REGION_ENEMIES: Record<string, EnemyTemplate[]> = {
  valderroble: [
    {
      name: 'Trasgo Saqueador',
      maxHp: 28,
      ac: 14,
      attackMod: 5,
      initiativeMod: 2,
      damageDice: '1d8+2',
      xpReward: 30,
      goldReward: 15,
    },
    {
      name: 'Lobo Huargo',
      maxHp: 32,
      ac: 14,
      attackMod: 6,
      initiativeMod: 3,
      damageDice: '1d8+3',
      xpReward: 35,
      goldReward: 18,
    },
    {
      name: 'Bandido del Robledal',
      maxHp: 36,
      ac: 15,
      attackMod: 6,
      initiativeMod: 2,
      damageDice: '1d10+3',
      xpReward: 40,
      goldReward: 22,
    },
  ],
  solceniza: [
    {
      name: 'Escorpión de Ceniza',
      maxHp: 38,
      ac: 15,
      attackMod: 6,
      initiativeMod: 2,
      damageDice: '1d10+3',
      xpReward: 42,
      goldReward: 24,
    },
    {
      name: 'Salamandra Ígnea',
      maxHp: 42,
      ac: 15,
      attackMod: 7,
      initiativeMod: 3,
      damageDice: '2d6+3',
      xpReward: 48,
      goldReward: 28,
    },
  ],
  ventisca: [
    {
      name: 'Espectro de Escarcha',
      maxHp: 40,
      ac: 16,
      attackMod: 7,
      initiativeMod: 3,
      damageDice: '2d6+3',
      xpReward: 48,
      goldReward: 28,
    },
    {
      name: 'Yeti de las Cumbres',
      maxHp: 48,
      ac: 15,
      attackMod: 7,
      initiativeMod: 2,
      damageDice: '2d6+4',
      xpReward: 55,
      goldReward: 34,
    },
  ],
  'plano-astral': [
    {
      name: 'Centinela Astral',
      maxHp: 46,
      ac: 17,
      attackMod: 8,
      initiativeMod: 3,
      damageDice: '2d6+4',
      xpReward: 60,
      goldReward: 38,
    },
    {
      name: 'Devorador de Éter',
      maxHp: 52,
      ac: 16,
      attackMod: 8,
      initiativeMod: 3,
      damageDice: '2d8+4',
      xpReward: 66,
      goldReward: 42,
    },
  ],
  'pantano-bruma': [
    {
      name: 'Saposaurio',
      maxHp: 38,
      ac: 15,
      attackMod: 6,
      initiativeMod: 2,
      damageDice: '1d10+3',
      xpReward: 44,
      goldReward: 26,
    },
    {
      name: 'Bruja del Lodo',
      maxHp: 36,
      ac: 16,
      attackMod: 7,
      initiativeMod: 3,
      damageDice: '2d6+3',
      xpReward: 46,
      goldReward: 28,
    },
  ],
  'ruinas-olvido': [
    {
      name: 'Esqueleto Guardián',
      maxHp: 42,
      ac: 16,
      attackMod: 7,
      initiativeMod: 2,
      damageDice: '2d6+3',
      xpReward: 50,
      goldReward: 30,
    },
    {
      name: 'Gárgola Antigua',
      maxHp: 46,
      ac: 17,
      attackMod: 7,
      initiativeMod: 2,
      damageDice: '2d6+4',
      xpReward: 54,
      goldReward: 34,
    },
  ],
  'archipielago-coral': [
    {
      name: 'Sirena Abisal',
      maxHp: 44,
      ac: 16,
      attackMod: 8,
      initiativeMod: 4,
      damageDice: '2d6+3',
      xpReward: 56,
      goldReward: 36,
    },
    {
      name: 'Cangrejo Gigante',
      maxHp: 52,
      ac: 17,
      attackMod: 7,
      initiativeMod: 1,
      damageDice: '2d8+3',
      xpReward: 62,
      goldReward: 40,
    },
  ],
  'abismo-cristal': [
    {
      name: 'Gólem de Cuarzo',
      maxHp: 56,
      ac: 18,
      attackMod: 8,
      initiativeMod: 2,
      damageDice: '2d8+4',
      xpReward: 68,
      goldReward: 44,
    },
    {
      name: 'Murciélago Sombrío',
      maxHp: 46,
      ac: 17,
      attackMod: 9,
      initiativeMod: 4,
      damageDice: '2d6+4',
      xpReward: 64,
      goldReward: 42,
    },
  ],
};

export function spawnEnemiesForParty(
  regionId: string,
  partySize: number,
  avgLevel = 1
): CombatEnemy[] {
  const pool = REGION_ENEMIES[regionId] ?? REGION_ENEMIES.valderroble;
  const count = partySize >= 2 ? 2 : 1;
  const enemies: CombatEnemy[] = [];
  const lvAbove1 = Math.max(0, avgLevel - 1);
  const extraHp = lvAbove1 * 6;
  const extraAtk = Math.floor(lvAbove1 / 2);
  const extraAc = Math.floor(lvAbove1 / 3);
  const numerals = ['I', 'II', 'III'];

  for (let i = 0; i < count; i++) {
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const suffix = count > 1 ? ` ${numerals[i] ?? String(i + 1)}` : '';
    const maxHp = tpl.maxHp + extraHp;
    enemies.push({
      id: crypto.randomUUID(),
      name: `${tpl.name}${suffix}`,
      hp: maxHp,
      maxHp,
      ac: tpl.ac + extraAc,
      attackMod: tpl.attackMod + extraAtk,
      initiativeMod: tpl.initiativeMod,
      damageDice: tpl.damageDice,
      xpReward: tpl.xpReward + lvAbove1 * 6,
      goldReward: tpl.goldReward + lvAbove1 * 4,
    });
  }

  return enemies;
}

const REGION_BOSSES: Record<string, EnemyTemplate> = {
  valderroble: {
    name: 'Rey Trasgo Gruk',
    maxHp: 85,
    ac: 15,
    attackMod: 6,
    initiativeMod: 2,
    damageDice: '2d6+4',
    xpReward: 120,
    goldReward: 100,
  },
  solceniza: {
    name: 'Dragón Menor de Ceniza',
    maxHp: 105,
    ac: 16,
    attackMod: 7,
    initiativeMod: 3,
    damageDice: '2d8+4',
    xpReward: 145,
    goldReward: 125,
  },
  ventisca: {
    name: 'Señor de la Escarcha',
    maxHp: 115,
    ac: 16,
    attackMod: 7,
    initiativeMod: 2,
    damageDice: '2d8+5',
    xpReward: 160,
    goldReward: 135,
  },
  'plano-astral': {
    name: 'Titán del Vacío',
    maxHp: 135,
    ac: 17,
    attackMod: 8,
    initiativeMod: 3,
    damageDice: '3d6+5',
    xpReward: 185,
    goldReward: 160,
  },
  'pantano-bruma': {
    name: 'Hidra del Pantano',
    maxHp: 110,
    ac: 15,
    attackMod: 7,
    initiativeMod: 2,
    damageDice: '2d8+4',
    xpReward: 150,
    goldReward: 130,
  },
  'ruinas-olvido': {
    name: 'Coloso de Piedra',
    maxHp: 125,
    ac: 17,
    attackMod: 7,
    initiativeMod: 1,
    damageDice: '2d8+5',
    xpReward: 165,
    goldReward: 145,
  },
  'archipielago-coral': {
    name: 'Leviatán de Coral',
    maxHp: 130,
    ac: 16,
    attackMod: 8,
    initiativeMod: 3,
    damageDice: '3d6+4',
    xpReward: 180,
    goldReward: 160,
  },
  'abismo-cristal': {
    name: 'Dragón de Cristal',
    maxHp: 145,
    ac: 17,
    attackMod: 8,
    initiativeMod: 3,
    damageDice: '3d6+5',
    xpReward: 210,
    goldReward: 185,
  },
  'camara-final': {
    name: 'Emperador del Abismo',
    maxHp: 240,
    ac: 19,
    attackMod: 10,
    initiativeMod: 4,
    damageDice: '3d8+6',
    xpReward: 380,
    goldReward: 300,
  },
};

export function spawnBossForRegion(
  regionId: string,
  partySize: number,
  avgLevel = 1
): CombatEnemy {
  const tpl = REGION_BOSSES[regionId] ?? REGION_BOSSES.valderroble;
  const lvAbove1 = Math.max(0, avgLevel - 1);
  const extraHp = Math.max(0, partySize - 1) * 30 + lvAbove1 * 10;
  const extraAtk = Math.floor(lvAbove1 / 3);
  const extraAc = Math.floor(lvAbove1 / 4);
  const maxHp = tpl.maxHp + extraHp;
  return {
    id: crypto.randomUUID(),
    name: tpl.name,
    isBoss: true,
    hp: maxHp,
    maxHp,
    ac: tpl.ac + extraAc,
    attackMod: tpl.attackMod + extraAtk,
    initiativeMod: tpl.initiativeMod,
    damageDice: tpl.damageDice,
    xpReward: tpl.xpReward + lvAbove1 * 15,
    goldReward: tpl.goldReward + lvAbove1 * 10,
  };
}
