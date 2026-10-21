/**
 * v0.29.0 验收（#329）A 组 #317 部分：取自 Kent 的 test/v0290-acceptance @ 43b1e50 的 tests/unit/v0290-A.test.ts，
 * 只拆出 #317 的 describe，断言原样不改；#312 / #265 / #314 随各自 PR 带入。
 * - #317 罗马「是否计入」标签：真值由工具本身算出（真实成本 gatherModel / 等资源 discountedCost），清单存 fixtures 供 e2e 逐页核对。
 */
import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import { civBonuses } from '../../src/domain/civBonus';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { gatherModel } from '../../src/domain/realCost';
import type { Civ } from '../../src/domain/types';
import toolUsed from '../e2e/fixtures/v0290-317-tool-used.json';
import { units } from './helpers';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((c) => c.en === en)!;

// ---------- #317 ----------
// 公开来源：https://ageofempires.fandom.com/wiki/Romans_(Age_of_Empires_II) 「Villagers gather, build, and repair 5% faster」「Scorpions cost -50% gold」
// 本站 .dat：eco.json civEco.Romans tech 887 workRate ×1.05（class:4），tech 892 goldCost ×0.5（unit 279/542）
interface Used {
  civ: string;
  idx: number;
  src: string;
  zh: string;
  realCostGather: boolean;
  costDiscount: boolean;
}
/** 由工具本身判定：真实成本的采集模型在任一时代应用了这条加成，或等资源 / 真实成本的折扣在任一单位、任一时代应用了这条加成 */
function computeToolUsed(): Used[] {
  const out: Used[] = [];
  for (const c of civs)
    for (const b of civBonuses(c)) {
      if (b.team || typeof b.idx !== 'number') continue;
      const idx = b.idx;
      const realCostGather = [1, 2, 3, 4].some((age) => gatherModel(age, c.en).applied.some((line) => line.source === b.zh));
      const costDiscount = units.some((u) =>
        [1, 2, 3, 4].some((age) => discountedCost(u, c.en, priceAge(u.age, age)).applied.some((line) => line.idx === idx)),
      );
      if (realCostGather || costDiscount) out.push({ civ: c.en, idx, src: b.src, zh: b.zh, realCostGather, costDiscount });
    }
  return out;
}

describe('#317 文明加成「是否计入」与工具实际计算一致', () => {
  const used = computeToolUsed();
  it('工具实际使用的加成清单与 e2e 逐页核对的清单一致（数值不变则清单不变）', () => {
    expect(used).toEqual(toolUsed);
  });
  it('罗马第 1 条：真实成本的采集模型计入村民 +5%（农田无往返，恰为 ×1.05；伐木 / 采金 / 采石含往返步行，增幅小于 5% 但大于 0），与 .dat tech 887 一致', () => {
    expect(used.find((u) => u.civ === 'Romans' && u.idx === 0)).toMatchObject({ src: 'eco', realCostGather: true });
    for (const age of [1, 2, 3, 4]) {
      const g = gatherModel(age, 'Romans');
      expect(g.applied, `${age}`).toEqual([{ label: '村民采集速度 +5%', techs: [887], source: '村民收集、建造和修理的速度 +5%' }]);
      const rome = g.rate,
        base = gatherModel(age, '').rate;
      // 农田另乘 1.038095 是否重复计算由 #197 跟踪；真实成本只乘 1.05，这里锁住现状不变
      expect(rome.farm / base.farm, `${age} farm`).toBeCloseTo(1.05, 12);
      for (const task of ['wood', 'gold', 'stone'] as const) {
        expect(rome[task] / base[task], `${age} ${task}`).toBeGreaterThan(1);
        expect(rome[task] / base[task], `${age} ${task}`).toBeLessThan(1.05);
      }
    }
  });
  it('罗马第 3 条：蝎式弩黄金 -50% 已计入等资源 / 真实成本的折后价（75 木 75 金 到 75 木 37.5 金）', () => {
    expect(used.find((u) => u.civ === 'Romans' && u.idx === 2)).toMatchObject({ src: 'eco', costDiscount: true });
    const scorpion = units.find((u) => u.id === 279)!;
    const d = discountedCost(scorpion, 'Romans', priceAge(scorpion.age, 3));
    expect(d.base).toEqual({ Gold: 75, Wood: 75 }); // aoe2techtree.net data.json Unit 279 SCBAL：Wood 75 / Gold 75
    expect(d.exact).toEqual({ Gold: 37.5, Wood: 75 });
  });
  it('罗马 4 条加成里，第 1、3 条的 src 都是 eco（同一机制），第 2、4 条为 dat 已计入', () => {
    expect(civBonuses(civ('Romans')).map((b) => [b.idx, b.src])).toEqual([
      [0, 'eco'],
      [1, 'dat'],
      [2, 'eco'],
      [3, 'dat'],
      ['team', 'dat'],
    ]);
  });
});
