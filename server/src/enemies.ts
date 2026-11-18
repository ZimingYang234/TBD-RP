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
      maxHp: 16,
      ac: 12,
      attackMod: 3,
      initiativeMod: 2,
      damageDice: '1d6+1',
      xpReward: 25,
      goldReward: 12,
    },
    {
      name: 'Lobo Huargo',
      maxHp: 20,
      ac: 13,
      attackMod: 4,
      initiativeMod: 3,
      damageDice: '1d8+2',
      xpReward: 30,
      goldReward: 15,
    },
    {
      name: 'Bandido del Robledal',
      maxHp: 22,
      ac: 13,
      attackMod: 4,
      initiativeMod: 2,
      damageDice: '1d8+2',
      xpReward: 35,
      goldReward: 20,
    },
  ],
  solceniza: [
    {
      name: 'Escorpión de Ceniza',
      maxHp: 22,
      ac: 14,
      attackMod: 4,
      initiativeMod: 2,
      damageDice: '1d8+2',
      xpReward: 35,
      goldReward: 20,
    },
    {
      name: 'Salamandra Ígnea',
      maxHp: 26,
      ac: 13,
      attackMod: 5,
      initiativeMod: 2,
      damageDice: '1d10+2',
      xpReward: 40,
      goldReward: 25,
    },
  ],
  ventisca: [
    {
      name: 'Espectro de Escarcha',
      maxHp: 24,
      ac: 14,
      attackMod: 5,
      initiativeMod: 3,
      damageDice: '1d8+3',
      xpReward: 40,
      goldReward: 24,
    },
    {
      name: 'Yeti de las Cumbres',
      maxHp: 30,
      ac: 13,
      attackMod: 5,
      initiativeMod: 1,
      damageDice: '1d10+3',
      xpReward: 45,
      goldReward: 28,
    },
  ],
  'plano-astral': [
    {
      name: 'Centinela Astral',
      maxHp: 28,
      ac: 15,
      attackMod: 5,
      initiativeMod: 3,
      damageDice: '1d10+3',
      xpReward: 50,
      goldReward: 32,
    },
    {
      name: 'Devorador de Éter',
      maxHp: 32,
      ac: 14,
      attackMod: 6,
      initiativeMod: 2,
      damageDice: '2d6+3',
      xpReward: 55,
      goldReward: 36,
    },
  ],
  'pantano-bruma': [
    {
      name: 'Saposaurio',
      maxHp: 24,
      ac: 13,
      attackMod: 4,
      initiativeMod: 2,
      damageDice: '1d8+2',
      xpReward: 36,
      goldReward: 22,
    },
    {
      name: 'Bruja del Lodo',
      maxHp: 22,
      ac: 14,
      attackMod: 5,
      initiativeMod: 3,
      damageDice: '1d8+3',
      xpReward: 38,
      goldReward: 24,
    },
  ],
  'ruinas-olvido': [
    {
      name: 'Esqueleto Guardián',
      maxHp: 26,
      ac: 14,
      attackMod: 5,
      initiativeMod: 2,
      damageDice: '1d8+3',
      xpReward: 42,
      goldReward: 26,
    },
    {
      name: 'Gárgola Antigua',
      maxHp: 30,
      ac: 15,
      attackMod: 5,
      initiativeMod: 2,
      damageDice: '1d10+2',
      xpReward: 46,
      goldReward: 30,
    },
  ],
  'archipielago-coral': [
    {
      name: 'Sirena Abisal',
      maxHp: 28,
      ac: 14,
      attackMod: 6,
      initiativeMod: 4,
      damageDice: '1d10+2',
      xpReward: 48,
      goldReward: 32,
    },
    {
      name: 'Cangrejo Gigante',
      maxHp: 34,
      ac: 16,
      attackMod: 5,
      initiativeMod: 1,
      damageDice: '2d6+2',
      xpReward: 52,
      goldReward: 34,
    },
  ],
  'abismo-cristal': [
    {
      name: 'Gólem de Cuarzo',
      maxHp: 36,
      ac: 16,
      attackMod: 6,
      initiativeMod: 1,
      damageDice: '2d6+3',
      xpReward: 58,
      goldReward: 38,
    },
    {
      name: 'Murciélago Sombrío',
      maxHp: 28,
      ac: 15,
      attackMod: 7,
      initiativeMod: 4,
      damageDice: '1d10+3',
      xpReward: 54,
      goldReward: 35,
    },
  ],
};

export function spawnEnemiesForParty(regionId: string, partySize: number): CombatEnemy[] {
  const pool = REGION_ENEMIES[regionId] ?? REGION_ENEMIES.valderroble;
  const count = partySize >= 2 ? 2 : 1;
  const enemies: CombatEnemy[] = [];

  for (let i = 0; i < count; i++) {
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const suffix = count > 1 ? ` ${i === 0 ? 'I' : 'II'}` : '';
    enemies.push({
      id: crypto.randomUUID(),
      name: `${tpl.name}${suffix}`,
      hp: tpl.maxHp,
      maxHp: tpl.maxHp,
      ac: tpl.ac,
      attackMod: tpl.attackMod,
      initiativeMod: tpl.initiativeMod,
      damageDice: tpl.damageDice,
      xpReward: tpl.xpReward,
      goldReward: tpl.goldReward,
    });
  }

  return enemies;
}

const REGION_BOSSES: Record<string, EnemyTemplate> = {
  valderroble: {
    name: 'Rey Trasgo Gruk',
    maxHp: 42,
    ac: 14,
    attackMod: 5,
    initiativeMod: 2,
    damageDice: '1d10+3',
    xpReward: 100,
    goldReward: 90,
  },
  solceniza: {
    name: 'Dragón Menor de Ceniza',
    maxHp: 48,
    ac: 15,
    attackMod: 6,
    initiativeMod: 3,
    damageDice: '2d6+3',
    xpReward: 120,
    goldReward: 110,
  },
  ventisca: {
    name: 'Señor de la Escarcha',
    maxHp: 50,
    ac: 15,
    attackMod: 6,
    initiativeMod: 2,
    damageDice: '2d6+4',
    xpReward: 130,
    goldReward: 120,
  },
  'plano-astral': {
    name: 'Titán del Vacío',
    maxHp: 56,
    ac: 16,
    attackMod: 7,
    initiativeMod: 3,
    damageDice: '2d8+3',
    xpReward: 150,
    goldReward: 140,
  },
  'pantano-bruma': {
    name: 'Hidra del Pantano',
    maxHp: 54,
    ac: 14,
    attackMod: 6,
    initiativeMod: 2,
    damageDice: '2d6+3',
    xpReward: 135,
    goldReward: 125,
  },
  'ruinas-olvido': {
    name: 'Coloso de Piedra',
    maxHp: 62,
    ac: 16,
    attackMod: 6,
    initiativeMod: 1,
    damageDice: '2d8+3',
    xpReward: 150,
    goldReward: 135,
  },
  'archipielago-coral': {
    name: 'Leviatán de Coral',
    maxHp: 64,
    ac: 15,
    attackMod: 7,
    initiativeMod: 3,
    damageDice: '2d8+4',
    xpReward: 165,
    goldReward: 150,
  },
  'abismo-cristal': {
    name: 'Dragón de Cristal',
    maxHp: 72,
    ac: 17,
    attackMod: 8,
    initiativeMod: 3,
    damageDice: '2d10+4',
    xpReward: 190,
    goldReward: 175,
  },
  'camara-final': {
    name: 'Emperador del Abismo',
    maxHp: 140,
    ac: 18,
    attackMod: 9,
    initiativeMod: 4,
    damageDice: '3d6+5',
    xpReward: 320,
    goldReward: 260,
  },
};

export function spawnBossForRegion(regionId: string, partySize: number): CombatEnemy {
  const tpl = REGION_BOSSES[regionId] ?? REGION_BOSSES.valderroble;
  const extraHp = Math.max(0, partySize - 1) * 14;
  return {
    id: crypto.randomUUID(),
    name: tpl.name,
    isBoss: true,
    hp: tpl.maxHp + extraHp,
    maxHp: tpl.maxHp + extraHp,
    ac: tpl.ac,
    attackMod: tpl.attackMod,
    initiativeMod: tpl.initiativeMod,
    damageDice: tpl.damageDice,
    xpReward: tpl.xpReward,
    goldReward: tpl.goldReward,
  };
}
