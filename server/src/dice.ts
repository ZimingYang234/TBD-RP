import crypto from 'node:crypto';

export function rollDie(sides: number): number {
  return crypto.randomInt(1, sides + 1);
}

export function rollD20(): number {
  return rollDie(20);
}

export interface DiceExprResult {
  rolls: number[];
  modifier: number;
  total: number;
}

/**
 * Parses expressions like "1d8+3", "2d6", "1d10-1" and rolls them on the server.
 */
export function rollDiceExpression(expr: string, doubleDice = false): DiceExprResult {
  const match = expr.trim().toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) {
    const fallback = rollDie(6);
    return { rolls: [fallback], modifier: 0, total: fallback };
  }

  const baseCount = Math.max(1, Number(match[1]));
  const sides = Math.max(2, Number(match[2]));
  const modifier = match[3] ? Number(match[3]) : 0;
  const count = doubleDice ? baseCount * 2 : baseCount;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }

  const sum = rolls.reduce((acc, n) => acc + n, 0);
  return {
    rolls,
    modifier,
    total: Math.max(1, sum + modifier),
  };
}
