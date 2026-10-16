/**
 * #24 PK 等资源 · 文明训练费用加成。
 * 数值来源：src/data/effects.json 的 costDiscounts（scripts/effects_build.py 由 DE 185872 .dat 的费用效果导出）。
 * 场景数字：Reid #24 comment 6114992360（61/42、66/22、49/66、37/66、蒙古 30、22/30），本文件独立重算后一致。
 * 取整：四舍五入（hongcun 游戏内实测拜占庭散兵 19 食物 / 26 木头，#24 comment 6106912488）。
 */
import { describe, expect, it } from 'vitest';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { DAT } from '../../src/domain/datEffects';
import { countForBudget } from '../../src/domain/duel';
import { unit, units } from './helpers';

const D = (en: string, civ: string, age: number) => discountedCost(unit(en), civ, age);
const N = (en: string, civ: string, age: number) => countForBudget(D(en, civ, age).cost, 3000);

describe('手算金标准', () => {
  it('拜占庭长戟兵 35F/25W × 0.75 = 26.25/18.75 得 26/19（四舍五入），合计 45，3000 得 66 个', () => {
    const d = D('Halberdier', 'Byzantines', 4);
    expect(d.exact).toEqual({ Food: 26.25, Wood: 18.75 });
    expect(d.cost).toEqual({ Food: 26, Wood: 19 });
    expect(N('Halberdier', 'Byzantines', 4)).toBe(66);
  });
  it('拜占庭精锐掷矛手显示 19 食物 / 26 木头（hongcun 游戏内实测）', () => {
    expect(D('Elite Skirmisher', 'Byzantines', 4).cost).toEqual({ Food: 19, Wood: 26 });
  });
  it('柏柏尔骆驼兵城堡时代：55×0.85=46.75得47，60×0.85=51，合计 98 得 30 个（v3 稿的 32 是帝王档，稿子错）', () => {
    expect(D('Camel Rider', 'Berbers', 3).cost).toEqual({ Food: 47, Gold: 51 });
    expect(N('Camel Rider', 'Berbers', 3)).toBe(30);
  });
});

describe('折扣档位跟随所选时代', () => {
  it('柏柏尔骆驼：城堡 −15%，帝王 −20%', () => {
    expect(D('Camel Rider', 'Berbers', 3).applied[0]!.pct).toBe(15);
    expect(D('Camel Rider', 'Berbers', 4).applied[0]!.pct).toBe(20);
    expect(D('Camel Rider', 'Berbers', 4).cost).toEqual({ Food: 44, Gold: 48 });
  });
  it('匈奴骑射手：城堡 −10%，帝王 −20%', () => {
    expect(D('Cavalry Archer', 'Huns', 3).applied[0]!.pct).toBe(10);
    expect(D('Cavalry Archer', 'Huns', 4).applied[0]!.pct).toBe(20);
  });
  it('哥特步兵四档 15/20/25/30（.dat 逐时代累计）；长矛兵帝王 35×0.7=24.5 落在 .5：#129 起直接显示 .5', () => {
    expect([1, 2, 3].map((a) => D('Spearman', 'Goths', a).applied[0]?.pct)).toEqual([15, 20, 25]);
    expect(D('Champion', 'Goths', 4).applied[0]!.pct).toBe(30);
    const sp = D('Spearman', 'Goths', 4);
    expect(sp.applied[0]!.pct).toBe(30);
    expect(sp.half).toEqual([]);
    expect(sp.cost).toEqual({ Food: 24.5, Wood: 17.5 });
  });
  it('未选时代：按单位最早可用时代取价', () => {
    expect(priceAge(unit('Camel Rider').age, null)).toBe(3);
    expect(priceAge(3, 4)).toBe(4);
    expect(priceAge(4, 2)).toBe(4);
  });
});

describe('Reid 场景（3000 资源）', () => {
  it.each([
    ['Champion', 'Goths', 4, 61],
    ['Arbalester', 'Britons', 4, 42],
    ['Halberdier', 'Byzantines', 4, 66],
    ['Paladin', 'Franks', 4, 22],
    ['Arbalester', 'Portuguese', 4, 49],
    ['Elite Skirmisher', 'Byzantines', 4, 66],
    ['Heavy Cavalry Archer', 'Huns', 4, 37],
    ['Heavy Cavalry Archer', 'Mongols', 4, 30],
    ['Knight', 'Franks', 3, 22],
    ['Camel Rider', 'Berbers', 3, 30],
  ] as const)('%s（%s，时代 %i）得 %i 个', (en, civ, age, n) => expect(N(en, civ, age)).toBe(n));
  it('葡萄牙只减黄金；蒙古射速加成不算折扣', () => {
    expect(D('Arbalester', 'Portuguese', 4).applied[0]!.res).toEqual(['Gold']);
    const m = D('Heavy Cavalry Archer', 'Mongols', 4);
    expect(m.applied).toEqual([]);
    expect(m.unsupported).toEqual([]);
  });
});

describe('数据读不出 / 对不上：折扣未计入，按原价，不出估算值', () => {
  it('ok=false 的加成进 unsupported，价格为原价', () => {
    const table = { Byzantines: DAT.costDiscounts.Byzantines!.map((x) => ({ ...x, ok: false })) };
    const d = discountedCost(unit('Halberdier'), 'Byzantines', 4, { table });
    expect(d.cost).toEqual(unit('Halberdier').cost);
    expect(d.applied).toEqual([]);
    expect(d.unsupported).toHaveLength(1);
    expect(JSON.stringify(d.unsupported)).not.toMatch(/pct/);
  });
  it('真实数据中与文本对不上的（如朝鲜）显示未计入', () => {
    const bad = Object.entries(DAT.costDiscounts).filter(([, v]) => v.some((x) => !x.ok));
    expect(bad.length).toBeGreaterThan(0);
  });
  it('无该文明数据：按原价，无说明行', () => {
    const d = discountedCost(unit('Halberdier'), 'Byzantines', 4, { table: {} });
    expect(d.cost).toEqual(unit('Halberdier').cost);
    expect(d.applied.length + d.unsupported.length).toBe(0);
  });
});

describe('不影响费用', () => {
  it('马扎尔铁匠攻击升级免费不改单位价格，列入 noCost', () => {
    const d = discountedCost(unit('Hussar'), 'Magyars', 4, { techIds: new Set([67, 68, 75]) });
    expect(d.cost).toEqual({ Food: 68 });
    expect(d.noCost.map((x) => x.text)).toEqual(['近战攻击升级免费']);
  });
});

describe('.5 规则（#129 规则 B）：折后价恰为 .5 的直接显示 .5，不再记「未计入」', () => {
  it('roundHalfPrice：就近 0.5，x.25 / x.75 往大取', async () => {
    const { roundHalfPrice } = await import('../../src/domain/costDiscount');
    expect(roundHalfPrice((25 * 70) / 100)).toBe(17.5);
    expect(roundHalfPrice((35 * 75) / 100)).toBe(26.5); // 26.25
    expect(roundHalfPrice((25 * 75) / 100)).toBe(19); // 18.75
  });
  // 独立扫描：所有 单位 × 文明 × 时代 × 资源，按 .dat 档位换算的整数百分比 p，原价 × (100 − p) 除以 100 余 50 即为 .5
  const cases: [string, string, number, string][] = [];
  Object.entries(DAT.costDiscounts).forEach(([civ, list]) =>
    list.forEach((d) => {
      if (!d.ok) return;
      d.groups.forEach((g) =>
        g.units.forEach((id) => {
          const u = units.find((x) => x.id === id);
          if (!u || !u.civs.includes(civ)) return;
          Object.entries(g.tiers).forEach(([a, m]) => {
            if (+a < u.age) return;
            const p = Math.round((1 - m) * 100);
            g.res.forEach((r) => {
              const b = u.cost[r];
              const c: [string, string, number, string] = [u.en, civ, +a, r];
              if (b && (b * (100 - p)) % 100 === 50 && !cases.some((x) => x.join() === c.join())) cases.push(c);
            });
          });
        }),
      );
    }),
  );
  it('扫描结果非空，且清单固定（数据变更时需复核）', () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.map((c) => c.join('|')).sort()).toMatchSnapshot();
  });
  it('每个 .5 情况：不标「未计入」、该资源显示精确的 .5 价', () => {
    cases.forEach(([en, civ, age, r]) => {
      units
        .filter((x) => x.en === en && x.civs.includes(civ))
        .forEach((u) => {
          const d = discountedCost(u, civ, age);
          expect(d.half, `${en} ${civ} ${age} ${r}`).toEqual([]);
          expect(d.cost[r]! % 1, `${en} ${civ} ${age} ${r}`).toBe(0.5);
        });
    });
  });
  it('朝鲜（高丽，数据与文本对不上）仍是「折扣未计入」', () => {
    const u = unit('Crossbowman');
    const d = discountedCost(u, 'Koreans', 3);
    expect(d.unsupported.length).toBe(1);
    expect(d.half).toEqual([]);
    expect(d.cost).toEqual(u.cost);
  });
});
