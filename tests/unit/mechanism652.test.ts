import { describe, expect, it } from 'vitest';
import { chooseLane, chooseMap, chooseTeamSize, pickCiv, resetStart, skipStep } from '../../src/domain/startGame';

describe('#652 保留玩家文明', () => {
  const chosen = () => pickCiv(chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'flank'), 'Britons');
  it('改变地图或路位不会静默清空文明', () => {
    expect(chooseMap(chosen(), 'arena').choice.civ).toBe('Britons');
    expect(chooseLane(chosen(), 'pocket').choice.civ).toBe('Britons');
  });
  it('跳过地图保留文明，明确跳过文明才清空', () => {
    expect(skipStep({ ...chosen(), current: 'map' }).choice.civ).toBe('Britons');
    expect(skipStep({ ...chosen(), current: 'civ' }).choice.civ).toBeNull();
  });
});

import { beforeAll } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  DEFAULT_FLANK_SCENE,
  DEFAULT_SCENE,
  SCENE_ECO,
  coverageReason,
  scenarioRows,
  scenarioScope,
  type SceneContext,
} from '../../src/domain/positionScenarios';
import { firstStrike, retreatContact, supportArrival } from '../../src/domain/positionScenarioMath';
import { DAT } from '../../src/domain/datEffects';
let base: SceneContext;
beforeAll(async () => {
  base = { core: await loadCore(), trees: await loadTrees() };
});
function copy(): SceneContext {
  const units = structuredClone(base.core.units),
    techs = structuredClone(base.core.techs);
  return {
    ...base,
    core: { ...base.core, units, techs, unitById: Object.fromEntries(units.map((u) => [u.id, u])), techById: Object.fromEntries(techs.map((t) => [t.id, t])) },
    eco: structuredClone(SCENE_ECO),
  };
}
const row = (ctx: SceneContext, civ = 'Britons', config = DEFAULT_FLANK_SCENE, lane: 'flank' | 'pocket' = 'flank') =>
  scenarioRows(ctx, lane, config).find((r) => r.civ === civ)!;
describe('#652 几何与整数边界', () => {
  it('普通到场包含期限，首兵不在t0', () => {
    expect(supportArrival(1, 30, 5, 0, 0, 'ready')?.count).toBe(5);
    expect(supportArrival(1, 30, 5, 0, 0, 'new')?.count).toBe(0);
    expect(supportArrival(1, 30, 5, 0, 30, 'new')?.count).toBe(1);
    expect(supportArrival(1, 30, 5, 0, 30 - 1e-6, 'new')?.count).toBe(0);
    expect(supportArrival(1, 30, 5, 0, 1200, 'new')?.count).toBe(5);
    expect(supportArrival(1, 30, 0, 0, 1200, 'ready')?.first).toBeNull();
  });
  it('同射程没有先手机会，威胁边界严格排除，贴身收益消失', () => {
    expect(firstStrike(7, 2, 7, 1, 12, 0)?.opportunities).toBe(0);
    expect(firstStrike(8, 2, 7, 1, 12, 1)?.opportunities).toBe(0);
    expect(firstStrike(8, 2, 7, 1, 12, 0.5)?.opportunities).toBe(1);
    expect(firstStrike(8, 2, 7, 1, 2, 0.5)?.opportunities).toBe(0);
    expect(firstStrike(8, 2, 7, 1, 12, 0)?.damage).toBeNull();
  });
  it('有限后撤增加接触时间，迟反应可失去窗口', () => {
    expect(retreatContact(8, 7, 0.96, 0.96, 0, 4)).toBeCloseTo(5.208333);
    expect(retreatContact(8, 7, 0.96, 0.96, 1.25, 12)).toBeCloseTo(1.041667);
    expect(retreatContact(8, 7, 0.96, 0.96, 0, 0)).toBeCloseTo(1.041667);
  });
  it('更快但相同整数到场，缺速度不出分', () => {
    const a = supportArrival(1.35, 30, 30, 30, 120, 'new')!,
      b = supportArrival(1.485, 30, 30, 30, 120, 'new')!;
    expect(a.count).toBe(b.count);
    expect(b.first!).toBeLessThan(a.first!);
    expect(supportArrival(NaN, 30, 30, 30, 120, 'new')).toBeNull();
  });
});
describe('#652 真实数据、门禁与建议传播', () => {
  it('确定性、参考输入与公开覆盖', () => {
    expect(scenarioRows(base, 'flank', DEFAULT_FLANK_SCENE)).toEqual(scenarioRows(base, 'flank', DEFAULT_FLANK_SCENE));
    const b = row(base);
    expect(b.status).toBe('ok');
    expect(b.count).toBe(42);
    expect(b.opening?.window).toBeCloseTo(1 / 0.96);
    expect(row(base, 'Mayans').count).toBe(53);
    expect(coverageReason('Lithuanians')).toContain('待核验');
  });
  it('同源射程同时改变己方和参考目标，不制造射程差', () => {
    const c = copy();
    c.core.unitById[24]!.rng += 1;
    const a = row(base),
      b = row(c);
    expect(b.stats!.rng).toBe(a.stats!.rng + 1);
    expect(b.opening!.window).toBeCloseTo(a.opening!.window);
    expect(b.signature).not.toBe(a.signature);
  });
  it('速度输入传播且不强求整数排名变化', () => {
    const c = copy();
    c.core.unitById[38]!.spd *= 1.1;
    const a = row(base, 'Britons', DEFAULT_SCENE, 'pocket'),
      b = row(c, 'Britons', DEFAULT_SCENE, 'pocket');
    expect(b.support!.travel).toBeLessThan(a.support!.travel);
    expect(b.signature).not.toBe(a.signature);
  });
  it('训练源副本传播到兵数与优先建议', () => {
    const c = copy();
    c.eco!.units[38]!.trainTime = 24;
    const a = row(base, 'Huns', DEFAULT_SCENE, 'pocket'),
      b = row(c, 'Huns', DEFAULT_SCENE, 'pocket');
    expect(a.cycle).toBe(25);
    expect(b.cycle).toBe(20);
    expect(a.support!.count).toBe(3);
    expect(b.support!.count).toBe(4);
  });
  it('折扣源有效数值变化会改变可负担数与摘要', () => {
    const original = DAT.costDiscounts.Mayans;
    try {
      DAT.costDiscounts.Mayans = structuredClone(original!);
      const group = DAT.costDiscounts.Mayans!.flatMap((d) => d.groups).find((g) => g.units.includes(24))!;
      group.tiers['3'] = 0.5;
      const b = row(base, 'Mayans');
      expect(b.status).toBe('ok');
      expect(b.count).toBeGreaterThan(53);
    } finally {
      DAT.costDiscounts.Mayans = original!;
    }
  });
  it('文字无关；新型效果结构与所选科技变化阻断', () => {
    const c = copy();
    c.core.unitById[24]!.desc = '无关说明';
    expect(row(c)).toEqual(row(base));
    c.eco!.civEco.Huns![0]!.effects.push({ kind: 'unknown', attr: 'workRate', target: 'unit:101', op: 'mul', v: 2 });
    expect(row(c, 'Huns', DEFAULT_SCENE, 'pocket').status).toBe('blocked');
    const saved = DAT.techs.Husbandry;
    try {
      DAT.techs.Husbandry = { ...saved!, eco: [...saved!.eco, { op: 'unknown', v: 1 }] };
      expect(row(base).status).toBe('blocked');
    } finally {
      DAT.techs.Husbandry = saved!;
    }
  });
  it('零预算、科技不足没有军队优先建议', () => {
    for (const budget of [0, 1, 100])
      for (const lane of ['flank', 'pocket'] as const) {
        const rows = scenarioRows(base, lane, { ...DEFAULT_SCENE, budget });
        expect(rows.every((r) => r.count === 0 && !r.preferred && r.status === 'budget')).toBe(true);
      }
  });
  it('未知时代、不可用路线、缺费用/升级来源/速度显式阻止', () => {
    expect(row(base, 'Britons', { ...DEFAULT_FLANK_SCENE, age: 4 }).status).toBe('blocked');
    for (const field of ['spd', 'cost', 'from_', 'atks', 'age'] as const) {
      const c = copy();
      delete (c.core.unitById[24] as unknown as Record<string, unknown>)[field];
      expect(['blocked', 'unavailable']).toContain(row(c).status);
    }
    const c = copy();
    c.core.unitById[24]!.civs = [];
    expect(row(c).status).toBe('unavailable');
    const d = copy();
    d.core.techs.find((t) => t.en === 'Bodkin Arrow')!.cost = {};
    expect(row(d).status).toBe('unavailable');
  });
  it('短期限与长预算窗优先项可反转', () => {
    const short = { ...DEFAULT_SCENE, distance: 10, deadline: 120 },
      long = { ...short, deadline: 1200 };
    expect(row(base, 'Huns', short, 'pocket').support!.count).toBeGreaterThan(row(base, 'Berbers', short, 'pocket').support!.count);
    expect(row(base, 'Huns', long, 'pocket').support!.count).toBeLessThan(row(base, 'Berbers', long, 'pocket').support!.count);
  });
  it('未知地图模式路位不套用结果', () => {
    expect(scenarioScope(resetStart().choice)).not.toBeNull();
    const choice = { mode: 'team' as const, teamSize: '4v4' as const, mapId: 'arabia', lane: 'flank' as const, civ: null };
    expect(scenarioScope(choice)).toBeNull();
    expect(scenarioScope({ ...choice, teamSize: '2v2' })).not.toBeNull();
    expect(scenarioScope({ ...choice, mapId: 'arena' })).not.toBeNull();
  });
});

// 模拟重新构建的数据模块：效果引擎在模块加载时编译规则，不能原地改闭包冒充重算。
import { vi } from 'vitest';
it('#652 已支持文明射程效果重载后传播到解释与建议', async () => {
  const changed = structuredClone(DAT);
  const fx = changed.civs
    .Britons!.bonus.flatMap((b) => b.rules)
    .flatMap((r) => r.fx)
    .find((f) => f.s === 'rng')!;
  fx.v += 1;
  vi.resetModules();
  vi.doMock('../../src/data/effects.json', () => ({ default: changed }));
  try {
    const rebuilt = await import('../../src/domain/positionScenarios');
    const result = rebuilt.scenarioRows(base, 'flank', DEFAULT_FLANK_SCENE).find((r) => r.civ === 'Britons')!;
    expect(result.status).toBe('ok');
    expect(result.opening!.window).toBeGreaterThan(row(base).opening!.window);
    expect(result.signature).not.toBe(row(base).signature);
  } finally {
    vi.doUnmock('../../src/data/effects.json');
    vi.resetModules();
  }
});
