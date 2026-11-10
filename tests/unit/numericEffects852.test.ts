import { describe, expect, it } from 'vitest';
import { applyEffects } from '../../src/domain/simulator';
import { applyEffectValue, applyMod, pushMod } from '../../src/domain/numericEffects';
import * as buildSimEffects from '../../src/domain/buildSimEffects';
import type { Effect, StatSet } from '../../src/domain/types';

const SCALAR_KEYS = ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'los', 'acc', 'minr', 'gar', 'bt', 'barm'] as const;
type ScalarKey = (typeof SCALAR_KEYS)[number];
type Op = { op: 'set' | 'mul' | 'add'; v: number };

const OPS: Op[] = [
  { op: 'set', v: 7 },
  { op: 'mul', v: 1.5 },
  { op: 'add', v: 2.5 },
];

function stats(): StatSet {
  return {
    hp: 40,
    atk: 5,
    ma: 1,
    pa: 2,
    rng: 3,
    spd: 0.9,
    los: 4,
    rof: 2,
    acc: 100,
    minr: 0,
    gar: 0,
    bt: 20,
    barm: 1,
    bonus: { 步兵: 2 },
    armc: {},
    rofx: 1,
  };
}

function sequences(length: number): Op[][] {
  if (length === 0) return [[]];
  const rest = sequences(length - 1);
  return OPS.flatMap((op) => rest.map((tail) => [op, ...tail]));
}

/** 旧模拟器的逐条算术：保持顺序与浮点运算次序，作为零变化参照。 */
function legacySequential(base: number, seq: Op[]): number {
  let value = base;
  for (const { op, v } of seq) {
    if (op === 'mul') value *= v;
    else if (op === 'set') value = v;
    else value += v;
  }
  return value;
}

describe('共享 set/mul/add 求值（issue 852）', () => {
  it('逐条 applyEffects 与 pushMod 聚合求值对所有顺序一致', () => {
    for (const seq of sequences(4)) {
      for (const key of SCALAR_KEYS) {
        const s = stats();
        const base = s[key as ScalarKey];
        applyEffects(
          s,
          seq.map(({ op, v }) => ({ s: key, op, v }) as Effect),
        );
        let mod: ReturnType<typeof pushMod> | undefined;
        for (const { op, v } of seq) mod = pushMod(mod, op, v);
        // 聚合会把多次 mul 合并成一次乘法，浮点末位可能与逐条乘法不同；语义按 12 位有效数字对齐。
        expect(s[key as ScalarKey], `${key}: ${seq.map((x) => `${x.op}:${x.v}`).join(' ')}`).toBeCloseTo(applyMod(base, mod), 12);
        // 模拟器仍按原顺序逐条计算，实际输出必须逐位不变。
        expect(s[key as ScalarKey]).toBe(legacySequential(base, seq));
      }
    }
  });

  it('applyEffectValue 与单条 pushMod + applyMod 同义，未知 op 按 add 处理', () => {
    for (const base of [0, 1, 7.5, -2]) {
      expect(applyEffectValue(base, 'set', 3)).toBe(3);
      expect(applyEffectValue(base, 'mul', 3)).toBe(base * 3);
      expect(applyEffectValue(base, 'add', 3)).toBe(base + 3);
      expect(applyEffectValue(base, undefined, 3)).toBe(base + 3);
      expect(applyEffectValue(base, 'unexpected', 3)).toBe(base + 3);
    }
  });

  it('buildSimEffects 只重新导出共享实现，没有第二份本地定义', () => {
    expect(buildSimEffects.pushMod).toBe(pushMod);
    expect(buildSimEffects.applyMod).toBe(applyMod);
  });
});
