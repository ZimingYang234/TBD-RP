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
