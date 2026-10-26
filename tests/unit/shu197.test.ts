import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const percent = E.civEco.Shu!.find((r) => (r as { tech?: number }).tech === 1071)!.effects.find((e) => e.res === 502)!.v!;
const ratio = percent / 100;
const baseRate = (e: EcoData, task: string, tiles: number) => {
  const b = e.villager.tasks[task]!;
  return b.carry / (b.carry / b.workRate + (2 * tiles) / e.villager.speed);
};
const probe = (task: Task): BuildOrder => ({
  id: 'shu-income-probe',
  name: { zh: '采集核对', en: 'income probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: 4 },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps: [
    { vils: 3, actions: [{ type: 'gather', task, count: 3 }] },
    { vils: 4, actions: [] },
  ],
});
const run = (bo: BuildOrder, civ = 'Shu', e = E, tiles = 2) => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const without = (tech: number): EcoData => ({ ...E, civEco: { ...E.civEco, Shu: E.civEco.Shu!.filter((r) => (r as { tech?: number }).tech !== tech) } });

// 固定输入＋公开百分比语义推导本站连续模型oracle；不是客户端逐笔到账实测。
describe('#197 蜀伐木兼产食物', () => {
  it('来源行：1071的502 set7为百分数，marker33 set16不当作倍率', () => {
    expect(percent).toBe(7);
    expect(E.civEco.Shu!.find((r) => (r as { tech?: number }).tech === 1071)!.effects).toEqual([
      { kind: 'res', label: null, op: 'set', res: 502, v: 7 },
      { kind: 'res', label: null, op: 'set', res: 33, v: 16 },
    ]);
    const discounted = E.civEco.Shu!.find((r) => (r as { tech?: number }).tech === 1067)!.effects;
    expect(discounted.map((effect) => effect.tech)).toEqual([100, 237, 437, 199, 200, 201, 211, 212, 219, 436, 218]);
    expect(discounted.every((effect) => effect.kind === 'techCost' && effect.res === -1 && effect.op === 'mul' && effect.v === 0.75)).toBe(true);
  });
  it.each([1, 3, 7])('距离%s：实际库存保留木材，另增有效伐木收入×res502/100食物', (tiles) => {
    const s = run(probe('wood'), 'Shu', E, tiles).steps[1]!;
    const g = run(probe('wood'), 'Generic', E, tiles).steps[1]!;
    expect(s.startAt).toBe(g.startAt);
    const wood = 3 * baseRate(E, 'wood', tiles) * s.startAt;
    expect(s.stock.wood).toBe(Math.floor(200 + wood));
    expect(s.stock.wood).toBe(g.stock.wood);
    expect(s.stock.food).toBe(Math.floor(200 - E.villager.cost.Food! + wood * ratio));
    expect(s.stock.food).toBeGreaterThan(g.stock.food);
    const r = gatherRate(E, 'Shu', 'wood', tiles);
    expect(r).toMatchObject({ carry: E.villager.tasks.wood!.carry, workRate: E.villager.tasks.wood!.workRate });
    expect(r.rate).toBeCloseTo(baseRate(E, 'wood', tiles), 12);
    expect(r.extraIncome).toEqual({ food: r.rate * ratio });
  });
  it('辅助读数允许零距离，兼产仍为有效主资源率的百分比', () => {
    const r = gatherRate(E, 'Shu', 'wood', 0);
    expect(r.rate).toBe(E.villager.tasks.wood!.workRate);
    expect(r.extraIncome).toEqual({ food: r.rate * ratio });
  });
  it('携带量改变伐木往返效率，食物兼产共用同一次携带和走路', () => {
    const e = structuredClone(E);
    e.villager.tasks.wood!.carry *= 2;
    const s = run(probe('wood'), 'Shu', e).steps[1]!;
    const wood = 3 * baseRate(e, 'wood', 2) * s.startAt;
    expect(s.stock).toMatchObject({ wood: Math.floor(200 + wood), food: Math.floor(150 + wood * ratio) });
  });
  it.each(['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish', 'gold', 'stone'] as Task[])('%s不产生伐木兼产食物，库存及时间与通用相同', (task) => {
    expect(run(probe(task)).steps).toEqual(run(probe(task), 'Generic').steps);
    expect(gatherRate(E, 'Shu', task === 'boar' || task === 'deer' ? 'hunt' : task).extraIncome).toEqual({});
  });
  it('换时代不叠加1071，费用隔离后升级时刻与通用相同', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const bo = probe('wood');
    bo.target = { age: 3, vils: 3 };
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'wood', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ];
    const s = run(bo, 'Shu', e);
    expect(s.ageUps).toEqual(run(bo, 'Generic', e).ageUps);
    for (const step of s.steps.slice(1)) {
      const wood = 3 * baseRate(e, 'wood', 2) * step.startAt;
      expect(step.stock).toMatchObject({ wood: Math.floor(200 + wood), food: Math.floor(200 + wood * ratio) });
    }
  });
  it.each([202, 213])('科技%s改变同一伐木有效率；兼产仍只乘固定比例一次', (tech) => {
    const e = structuredClone(E);
    e.techs[tech] = { ...e.techs[tech]!, at: 109, cost: {}, researchTime: 0 };
    const bo = probe('wood');
    bo.steps[0]!.actions.push({ type: 'research', tech });
    const s = run(bo, 'Shu', e).steps[1]!;
    const b = E.villager.tasks.wood!;
    const effects = E.ecoTechs[tech]!.effects;
    const modifier = (attr: string, target: string) => effects.find((x) => x.attr === attr && x.target === target)?.v ?? 1;
    const workRate = b.workRate * modifier('workRate', 'task:wood');
    const carry = b.carry * modifier('carry', 'class:4');
    const speed = E.villager.speed * modifier('speed', 'class:4');
    const upgraded = carry / (carry / workRate + 4 / speed);
    const wood = 3 * (baseRate(E, 'wood', 2) * 0.1 + upgraded * (s.startAt - 0.1));
    expect(s.stock).toMatchObject({ wood: Math.floor(200 + wood), food: Math.floor(150 + wood * ratio) });
  });
  it('木材支出不减少兼产基数，食物不是从库存余额变化推算', () => {
    const e = structuredClone(E);
    e.techs[22] = { ...e.techs[22]!, cost: { Wood: 50 }, researchTime: 0 };
    const bo = probe('wood');
    bo.steps[0]!.actions.push({ type: 'research', tech: 22 });
    const s = run(bo, 'Shu', e).steps[1]!;
    const wood = 3 * baseRate(E, 'wood', 2) * s.startAt;
    expect(s.stock).toMatchObject({ wood: Math.floor(150 + wood), food: Math.floor(150 + wood * ratio) });
  });
  it.each([199, 200, 211])('研究科技%s实际支付75%费用，沿用既有逐资源Math.round，研究时间不变', (tech) => {
    const e = structuredClone(E);
    e.techs[tech] = { ...e.techs[tech]!, at: 109 };
    const bo = probe('sheep');
    bo.target.vils = 3;
    bo.steps = [
      { vils: 3, actions: [{ type: 'research', tech }] },
      { vils: 3, actions: [] },
    ];
    const s = run(bo, 'Shu', e);
    const g = run(bo, 'Generic', e);
    const cost = E.techs[tech]!.cost;
    expect(s.steps[1]!.stock).toEqual({
      food: 200 - Math.round((cost.Food ?? 0) * 0.75),
      wood: 200 - Math.round((cost.Wood ?? 0) * 0.75),
      gold: 100 - Math.round((cost.Gold ?? 0) * 0.75),
      stone: 200 - Math.round((cost.Stone ?? 0) * 0.75),
    });
    expect(s.steps[0]!.doneAt - s.steps[0]!.startAt).toBe(g.steps[0]!.doneAt - g.steps[0]!.startAt);
  });
  it('真实弓手开局分别移除兼产/折扣，实际库存或费用都能独立变化', () => {
    const bo = structuredClone(buildOrders.find((b) => b.id === 'archers-19')!);
    // 原末步快照在付费前；加一个无动作检查点读取同一真实开局付费后的库存，不改变任何研究或采集动作。
    bo.steps.push({ vils: 21, actions: [] });
    const s = run(bo);
    expect(s.steps).not.toEqual(run(bo, 'Shu', without(1071)).steps);
    const noDiscount = run(bo, 'Shu', without(1067));
    const paid = s.steps.at(-1)!;
    const plain = noDiscount.steps.at(-1)!;
    expect(paid.startAt).toBe(plain.startAt);
    expect(paid.stock.wood).toBe(plain.stock.wood);
    expect(paid.stock.food - plain.stock.food).toBe(100 - Math.round(100 * 0.75));
    expect(paid.stock.gold - plain.stock.gold).toBe(50 - Math.round(50 * 0.75));
    expect(bo.steps.some((step) => step.actions.some((action) => action.type === 'research' && action.tech === 199))).toBe(true);
  });
  it('317可观察边界：三个方案均末步研究199，原快照无变化；不能把内部实际付费伪造为旧输出变化', () => {
    const related = buildOrders.filter((bo) => bo.steps.some((step) => step.actions.some((action) => action.type === 'research' && action.tech === 199)));
    expect(related).toHaveLength(3);
    for (const bo of related)
      expect(bo.steps.findIndex((step) => step.actions.some((action) => action.type === 'research' && action.tech === 199))).toBe(bo.steps.length - 1);
    for (const bo of buildOrders) {
      const recorded = (e: EcoData) => simulateBuild(bo, 'Shu', e, ups, { walkTiles: 4 }).steps.map((step) => [step.doneAt, step.stock]);
      expect(recorded(E), bo.id).toEqual(recorded(without(1067)));
    }
  });
  it.each(['other-tech', 'unknown-companion', 'wrong-op', 'missing-marker', 'wrong-marker'])('502护栏：%s不让辅助读数或库存漏算半条科技', (variant) => {
    const e = structuredClone(E);
    const row = e.civEco.Shu!.find((r) => (r as { tech?: number }).tech === 1071)!;
    if (variant === 'other-tech') (row as { tech?: number }).tech = 9998;
    else if (variant === 'wrong-op') row.effects[0]!.op = 'add';
    else if (variant === 'missing-marker') row.effects = row.effects.filter((effect) => effect.res !== 33);
    else if (variant === 'wrong-marker') row.effects.find((effect) => effect.res === 33)!.v = 15;
    else row.effects.push({ kind: 'res', res: 9999, op: 'add', v: 1 });
    expect(simSupport(e, 'Shu', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Shu', 'wood').extraIncome).toEqual({});
    expect(civSimNotes(e, 'Shu')).not.toContain('伐木兼产食物按连续收入估算');
    expect(run(probe('wood'), 'Shu', e).steps[1]!.stock.food).toBe(150);
  });
  it('支持、附注与独立真实成本边界一致', () => {
    expect(simSupport(E, 'Shu', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Shu').join('')).toContain('伐木兼产食物按连续收入估算');
    for (const age of [1, 2, 3, 4]) {
      expect(gatherModel(age, 'Shu').unsupported.map((x) => x.label)).toContain('伐木同时产食物');
      expect(gatherModel(age, 'Shu').rate).toEqual(gatherModel(age).rate);
    }
  });
  it('提示明确骑士模板不是蜀合法开局，不自动替换黑光铠骑兵', () => {
    expect(civSimNotes(E, 'Shu')).toContain('蜀不能训练骑士；骑士方案仅供通用模板经济估算。');
  });
  it('全部8个开局默认不计团队；显式team参数对当前非经济团队效果也不改变结果', () => {
    expect(buildOrders).toHaveLength(8);
    for (const bo of buildOrders) {
      const plain = simulateBuild(bo, 'Shu', E, ups);
      expect(simulateBuild(bo, 'Shu', E, ups, { team: true })).toEqual({ ...plain, params: { ...plain.params, team: true } });
    }
  });
});
