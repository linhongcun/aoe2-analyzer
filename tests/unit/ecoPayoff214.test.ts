import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import ecoRaw from '../../data/game/eco.json';
import {
  calculateEcoPayoff,
  decodeEcoPayoff,
  DEFAULT_PAYOFF,
  encodeEcoPayoff,
  payoffAvailable,
  payoffResearch,
  PAYOFF_TARGETS,
  type EcoPayoffConfig,
} from '../../src/domain/ecoPayoff';
import { fmtClock, gatherModel } from '../../src/domain/realCost';
import type { ProductionContext } from '../../src/domain/production';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const eco = ecoRaw as unknown as {
  techs: Record<string, { cost: Record<string, number>; researchTime: number }>;
  civEco: Record<string, { age: number; effects: { kind: string; tech?: number; op?: string; res?: number | string; v?: number }[] }[]>;
};
const plan = (values: Partial<EcoPayoffConfig> = {}): EcoPayoffConfig => ({ ...DEFAULT_PAYOFF, known: [], workers: { ...DEFAULT_PAYOFF.workers }, ...values });
const run = (values: Partial<EcoPayoffConfig> = {}) => calculateEcoPayoff(ctx, plan(values));

describe('issue 214 固定数据经济科技收益', () => {
  it('七项目标前后速率均与显式采集模型一致，原默认口径不变', () => {
    const old = gatherModel(3);
    for (const id of PAYOFF_TARGETS) {
      const t = ctx.core.techById[id]!,
        known: number[] = [];
      let pre = t.pre;
      while (pre) {
        known.unshift(pre);
        pre = ctx.core.techById[pre]!.pre;
      }
      const r = run({ civ: 'Byzantines', target: id, age: t.age, known });
      expect(r.errors, t.en).toEqual([]);
      const before = gatherModel(t.age, 'Byzantines', { techIds: new Set(known), walkTiles: 3 });
      const after = gatherModel(t.age, 'Byzantines', { techIds: new Set([...known, id]), walkTiles: 3 });
      const task = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' } as const;
      for (const row of r.resources) {
        expect(row.beforeRate).toBe(before.rate[task[row.key]]);
        expect(row.afterRate).toBe(after.rate[task[row.key]]);
      }
      expect(r.time).toBe(eco.techs[id]!.researchTime);
      expect(r.cost).toEqual(eco.techs[id]!.cost);
    }
    expect(gatherModel(3)).toEqual(old);
  });
  it('研究前及恰好完成时无额外收入，完成后按秒累计', () => {
    const t = eco.techs['202']!.researchTime;
    expect(run({ minutes: String((t - 1) / 60) }).resources[1]!.gain).toBe(0);
    expect(run({ minutes: String(t / 60) }).resources[1]!.gain).toBe(0);
    const r = run({ minutes: String((t + 60) / 60) });
    expect(r.resources[1]!.gain).toBeCloseTo(r.resources[1]!.gainPerMinute, 10);
  });
  it('人数翻倍仅增量翻倍，研究投入不变；零人数不产生有限平衡时间', () => {
    const a = run(),
      b = run({ workers: { Food: '0', Wood: '20', Gold: '0', Stone: '0' } }),
      zero = run({ workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' } });
    expect(b.resources[1]!.gain).toBeCloseTo(a.resources[1]!.gain * 2, 10);
    expect(b.investment).toBe(a.investment);
    expect(b.balance! - b.time).toBeCloseTo((a.balance! - a.time) / 2, 10);
    expect(zero.balance).toBeNull();
    expect(zero.windowLabourGain).toBe(0);
  });
  it('费用逐资源折合劳动量，不直接相加；平衡公式可独立核对', () => {
    const r = run(),
      food = r.resources[0]!,
      wood = r.resources[1]!;
    const expected = eco.techs['202']!.cost.Food! / food.beforeRate + eco.techs['202']!.cost.Wood! / wood.beforeRate;
    expect(r.investment).toBeCloseTo(expected, 10);
    const delta = (10 * (wood.afterRate - wood.beforeRate)) / wood.beforeRate;
    expect(r.balance).toBeCloseTo(eco.techs['202']!.researchTime + expected / delta, 8);
  });
  it('已研究目标不重复收费或产生增量', () => {
    const r = run({ known: [202] });
    expect(r.state).toBe('already');
    expect(r.cost).toEqual({});
    expect(r.time).toBe(0);
    expect(r.balance).toBeNull();
    expect(r.resources.every((x) => x.gain === 0)).toBe(true);
  });
  it('前置不足阻断且不自动补齐；已有科技的前置同样校验', () => {
    const r = run({ age: 3, target: 203 });
    expect(r.state).toBe('invalid');
    expect(r.errors.join()).toContain('双刃斧');
    expect(r.known.has(202)).toBe(false);
    expect(run({ age: 4, target: 221, known: [203] }).errors.join()).toContain('已有弓锯缺少前置');
    expect(run({ age: 3, target: 203, known: [202] }).errors).toEqual([]);
  });
  it('勃艮第提前一时代，食品折扣只应用一次且木材不打折', () => {
    const r = run({ civ: 'Burgundians', age: 1 });
    const multiplier = eco.civEco.Burgundians!.flatMap((x) => x.effects).find((x) => x.kind === 'techCost' && x.tech === 202 && x.res === 'Food')!.v!;
    expect(r.errors).toEqual([]);
    expect(r.cost.Food).toBe(Math.round(eco.techs['202']!.cost.Food! * multiplier));
    expect(r.cost.Wood).toBe(eco.techs['202']!.cost.Wood);
    expect(run({ civ: 'Franks', age: 1 }).state).toBe('invalid');
  });
  it('中国按所选时代最后费用倍率覆盖，不连乘', () => {
    for (const age of [2, 3, 4]) {
      const rate = eco.civEco
        .Chinese!.filter((r) => r.age <= age)
        .sort((a, b) => a.age - b.age)
        .flatMap((r) => r.effects)
        .filter((e) => e.kind === 'res' && e.res === 85)
        .at(-1)!.v!;
      const r = run({ civ: 'Chinese', age });
      expect(r.cost.Food).toBe(Math.round(eco.techs['202']!.cost.Food! * rate));
      expect(r.cost.Wood).toBe(Math.round(eco.techs['202']!.cost.Wood! * rate));
    }
  });
  it('越南只免木，不误判全免费；研究时间读eco乘法', () => {
    const r = run({ civ: 'Vietnamese' });
    const ratio = eco.civEco.Vietnamese!.flatMap((r) => r.effects).find((e) => e.kind === 'techTime' && e.tech === 202)!.v!;
    expect(r.state).toBe('ready');
    expect(r.cost.Food).toBe(eco.techs['202']!.cost.Food);
    expect(r.cost.Wood).toBe(0);
    expect(r.time).toBe(eco.techs['202']!.researchTime * ratio);
    expect(run({ civ: 'Vietnamese', age: 3, target: 182, known: [55] }).state).toBe('invalid');
  });
  it('缅甸伐木与波希米亚采矿自动免费，到时代才生效', () => {
    const burma = run({ civ: 'Burmese' }),
      bohemia = run({ civ: 'Bohemians', target: 55 });
    for (const r of [burma, bohemia]) {
      expect(r.state).toBe('free');
      expect(r.cost).toEqual({});
      expect(r.time).toBe(0);
      expect(r.balance).toBeNull();
      expect(r.resources.every((x) => x.gain === 0)).toBe(true);
    }
    expect(run({ civ: 'Burmese', age: 1 }).state).toBe('invalid');
  });
  it('葡萄牙自身团队科研时间修正一次', () => {
    const r = run({ civ: 'Portuguese' }),
      factor = eco.civEco.Portuguese!.flatMap((r) => r.effects).find((e) => e.kind === 'res' && e.res === 86)!.v!;
    expect(r.time).toBeCloseTo(eco.techs['202']!.researchTime * factor, 10);
  });
  it.each(['Aztecs', 'Danes', 'Muisca', 'Wei', 'Spanish', 'Khitans'])('%s不完整机制禁止有限平衡结论', (civ) => {
    const r = run({ civ });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.complete).toBe(false);
    expect(r.balance).toBeNull();
  });
  it('issue 1521：丹麦精确仅输出 1 条未计入告警并阻断平衡，马普切与瓦兰吉人仍可计算有限回本平衡', () => {
    const workers = { Food: '10', Wood: '10', Gold: '0', Stone: '0' };
    for (const age of [2, 3, 4]) {
      const r = run({ civ: 'Danes', age, target: 202, known: [], workers, distance: '3', minutes: '10' });
      expect(r.errors, `Danes@${age}`).toEqual([]);
      expect(r.warnings, `Danes@${age}`).toEqual(['食物采集加成：采集机制未完整计入。']);
      expect(r.complete, `Danes@${age}`).toBe(false);
      expect(r.balance, `Danes@${age}`).toBeNull();
    }
    for (const civ of ['Mapuche', 'Varangians'] as const) {
      const r = run({ civ, age: 4, target: 202, known: [], workers, distance: '3', minutes: '10' });
      expect(r.errors, civ).toEqual([]);
      expect(r.warnings, civ).toEqual([]);
      expect(r.complete, civ).toBe(true);
      expect(r.balance, civ).not.toBeNull();
      expect(Number.isFinite(r.balance), civ).toBe(true);
    }
  });
  it('Issue 1532：契丹全时代精确仅输出 1 条牧场未计入告警（零重复）并阻断有限平衡', () => {
    const workers = { Food: '10', Wood: '10', Gold: '0', Stone: '0' };
    for (const [age, target, known] of [
      [2, 202, []],
      [3, 203, [202]],
      [4, 221, [202, 203]],
    ] as const) {
      const r = run({ civ: 'Khitans', age, target, known: [...known], workers, distance: '3', minutes: '10' });
      expect(r.errors, `Khitans@${age}`).toEqual([]);
      expect(r.warnings, `Khitans@${age}`).toEqual(['牧场取代农田：采集机制未完整计入。']);
      expect(r.complete, `Khitans@${age}`).toBe(false);
      expect(r.balance, `Khitans@${age}`).toBeNull();
    }
  });
  it('推车仅可设置为已有采集条件，不是目标；前置必须满足', () => {
    expect(payoffAvailable(ctx, plan({ age: 3 })).some((t) => t.id === 213)).toBe(true);
    expect(run({ known: [213] }).resources[1]!.beforeRate).toBeGreaterThan(run().resources[1]!.beforeRate);
    expect(run({ target: 213 }).state).toBe('invalid');
    expect(run({ age: 3, known: [249] }).state).toBe('invalid');
  });
  it.each(['-1', '201', '1.5', 'NaN', 'Infinity', ''])('非法人数%s阻止计算', (n) => {
    const r = run({ workers: { Food: '0', Wood: n, Gold: '0', Stone: '0' } });
    expect(r.state).toBe('invalid');
    expect(r.balance).toBeNull();
    expect(r.resources).toEqual([]);
  });
  it('非法时间/距离/时代/文明/科技都不产生数值结论', () => {
    for (const values of [
      { minutes: '0' },
      { minutes: '121' },
      { minutes: 'NaN' },
      { distance: '-1' },
      { distance: 'Infinity' },
      { age: 5 },
      { civ: 'missing' },
      { target: 999999 },
      { known: [999999] },
    ])
      expect(run(values).state).toBe('invalid');
  });
  it('参数完整往返，非法参数和重复参数有明确错误，数量原文保留', () => {
    const config = plan({
      civ: 'Burgundians',
      age: 3,
      target: 203,
      known: [202, 213],
      workers: { Food: '3', Wood: '17', Gold: '2', Stone: '0' },
      distance: '1.5',
      minutes: '8.5',
    });
    expect(decodeEcoPayoff('?' + encodeEcoPayoff(config))).toEqual({ config, errors: [] });
    expect(decodeEcoPayoff('?target=NaN&known=bad&age=2&age=3').errors).toHaveLength(3);
    const decoded = decodeEcoPayoff('?wood=-1&distance=no');
    expect(decoded.config.workers.Wood).toBe('-1');
    expect(calculateEcoPayoff(ctx, decoded.config).state).toBe('invalid');
  });
  it('直接科研API的零项补全不改变通用价格', () => {
    expect(payoffResearch({ civ: 'Franks', age: 2 }, ctx.core.techById[202]!).cost).toEqual(eco.techs['202']!.cost);
  });
});

describe('Issue 1473 亚美尼亚骡车科技 +40% 与波希米亚前置过滤', () => {
  const workersOf = (key: 'Food' | 'Wood' | 'Gold' | 'Stone', n: string) => ({
    Food: '0',
    Wood: '0',
    Gold: '0',
    Stone: '0',
    [key]: n,
  });

  it.each([
    {
      name: '封建双刃斧 202（无推车）',
      age: 2,
      target: 202,
      known: [] as number[],
      res: 'Wood' as const,
      n: '10',
      beforeMin: 18.1,
      afterMin: 21.79,
      gainPerMin: 36.88,
      gain: 353.47,
      balSec: 198.95,
      balClock: '3:18',
    },
    {
      name: '城堡弓锯 203（已研 202，无推车）',
      age: 3,
      target: 203,
      known: [202],
      res: 'Wood' as const,
      n: '12',
      beforeMin: 21.79,
      afterMin: 25.92,
      gainPerMin: 49.5,
      gain: 453.77,
      balSec: 295.8,
      balClock: '4:55',
    },
    {
      name: '城堡弓锯 203（已研 202 + 213 推车）',
      age: 3,
      target: 203,
      known: [202, 213],
      res: 'Wood' as const,
      n: '12',
      beforeMin: 23.62,
      afterMin: 28.54,
      gainPerMin: 59.09,
      gain: 541.62,
      balSec: 264.68,
      balClock: '4:24',
    },
    {
      name: '封建金矿开采 55（无推车）',
      age: 2,
      target: 55,
      known: [] as number[],
      res: 'Gold' as const,
      n: '10',
      beforeMin: 17.74,
      afterMin: 20.51,
      gainPerMin: 27.71,
      gain: 263.2,
      balSec: 310.01,
      balClock: '5:10',
    },
    {
      name: '帝王钻井采金法 182（已研 55，无推车）',
      age: 4,
      target: 182,
      known: [55],
      res: 'Gold' as const,
      n: '12',
      beforeMin: 20.51,
      afterMin: 23.55,
      gainPerMin: 36.47,
      gain: 319.15,
      balSec: 400.5,
      balClock: '6:40',
    },
    {
      name: '帝王钻井采金法 182（已研 55 + 213 + 249）',
      age: 4,
      target: 182,
      known: [55, 213, 249],
      res: 'Gold' as const,
      n: '12',
      beforeMin: 24.0,
      afterMin: 28.26,
      gainPerMin: 51.2,
      gain: 447.98,
      balSec: 331.34,
      balClock: '5:31',
    },
    {
      name: '封建石矿开采 278（无推车）',
      age: 2,
      target: 278,
      known: [] as number[],
      res: 'Stone' as const,
      n: '10',
      beforeMin: 17.01,
      afterMin: 19.7,
      gainPerMin: 26.92,
      gain: 255.75,
      balSec: 306.24,
      balClock: '5:06',
    },
  ])('亚美尼亚 $name 叠加骡车 +40% 并给出精确平衡时间', ({ age, target, known, res, n, beforeMin, afterMin, gainPerMin, gain, balSec, balClock }) => {
    const r = run({ civ: 'Armenians', age, target, known, workers: workersOf(res, n), distance: '3', minutes: '10' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.state).toBe('ready');
    const row = r.resources.find((x) => x.key === res)!;
    expect(row.beforeRate * 60).toBeCloseTo(beforeMin, 2);
    expect(row.afterRate * 60).toBeCloseTo(afterMin, 2);
    expect(row.gainPerMinute).toBeCloseTo(gainPerMin, 2);
    expect(row.gain).toBeCloseTo(gain, 2);
    expect(r.balance).toBeCloseTo(balSec, 2);
    expect(fmtClock(r.balance!)).toBe(balClock);
  });

  it('亚美尼亚禁用双人锯 221 与钻井采石法 279 仍判不可用，且各时代零伪告警', () => {
    expect(run({ civ: 'Armenians', age: 4, target: 221, known: [202, 203] }).state).toBe('invalid');
    expect(run({ civ: 'Armenians', age: 3, target: 279, known: [278] }).state).toBe('invalid');
    for (const [age, target, known] of [
      [2, 202, []],
      [3, 203, [202]],
      [4, 182, [55]],
    ] as const) {
      const r = run({ civ: 'Armenians', age, target, known: [...known] });
      expect(r.warnings).toEqual([]);
      expect(r.warnings.join()).not.toContain('伐木 +18%');
      expect(r.warnings.join()).not.toContain('采石 +11%');
    }
  });

  it('波希米亚城堡弓锯未研究狂热 252 时不再触发村民移速 +15% 伪告警并正常给出平衡时间', () => {
    const r = run({ civ: 'Bohemians', age: 3, target: 203, known: [202], workers: workersOf('Wood', '12'), distance: '3', minutes: '10' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.balance).toBeCloseTo(388.54, 2);
    expect(fmtClock(r.balance!)).toBe('6:28');
  });

  it('合并去重 before.unsupported 与 after.unsupported：目标科技本身触发未建模行时不漏报', () => {
    const franksRows = eco.civEco.Franks ?? (eco.civEco.Franks = []);
    const probe = {
      age: 2,
      source: 'bonus',
      tech: 999999,
      name: 'probe-1473',
      requires: [202],
      effects: [{ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 1.05 }],
    };
    franksRows.push(probe as unknown as (typeof franksRows)[number]);
    try {
      const r = run({ civ: 'Franks', age: 2, target: 202, known: [] });
      expect(r.errors).toEqual([]);
      expect(r.warnings).toContain('伐木 +5%：采集机制未完整计入。');
      expect(r.complete).toBe(false);
      expect(r.balance).toBeNull();
    } finally {
      franksRows.pop();
    }
  });
});
