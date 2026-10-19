import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import ecoRaw from '../../src/data/eco.json';
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
import { gatherModel } from '../../src/domain/realCost';
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
  it.each(['Armenians', 'Aztecs', 'Danes', 'Muisca', 'Wei', 'Spanish', 'Khitans'])('%s不完整机制禁止有限平衡结论', (civ) => {
    const r = run({ civ });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.complete).toBe(false);
    expect(r.balance).toBeNull();
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
