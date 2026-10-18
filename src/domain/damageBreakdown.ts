import { damageByClass, damagePerHit, expectedHit, fighterFrom } from './duel';
import { baseStats, simulate, type SimContext, type SimStep } from './simulator';
import type { Unit } from './types';

export interface DamageSource {
  source: string;
  techId?: number;
  changes: { stat: string; before: number; after: number }[];
}

/** 按引擎实际施加顺序记录，乘法和覆盖效果也以施加前后的数值呈现。 */
export function damageSources(ctx: SimContext, u: Unit, civ: string, age: number, sel: ReadonlySet<number>, team: ReadonlySet<number>) {
  const sources: DamageSource[] = [];
  const record = ({ source, techId, before, after }: SimStep) => {
    const changes: DamageSource['changes'] = [];
    for (const [key, name] of [
      ['atk', '攻击'],
      ['ma', '近战护甲'],
      ['pa', '穿刺护甲'],
    ] as const) {
      if (before[key] !== after[key]) changes.push({ stat: name, before: before[key], after: after[key] });
    }
    for (const key of new Set([...Object.keys(before.bonus), ...Object.keys(after.bonus)])) {
      const a = before.bonus[key] ?? 0,
        b = after.bonus[key] ?? 0;
      if (a !== b) changes.push({ stat: `对${key}加成`, before: a, after: b });
    }
    if (changes.length) sources.push({ source, techId, changes });
  };
  const stats = simulate(ctx, u, civ, age, sel, team, record);
  return { sources, base: fighterFrom(u, baseStats(u)), fighter: fighterFrom(u, stats) };
}

export function damageBreakdown(a: ReturnType<typeof fighterFrom>, b: ReturnType<typeof fighterFrom>) {
  const rows = damageByClass(a, b);
  const subtotal = rows.reduce((sum, row) => sum + row.damage, 0);
  return { rows, subtotal, minimum: Math.max(0, 1 - subtotal), total: damagePerHit(a, b), expected: expectedHit(a, b) };
}
