import { describe, expect, it } from 'vitest';
import { decodeStartGame as decodeSceneState } from '../../src/domain/startGameCodec';
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
  scenarioProfile,
  scenarioScope,
  scenarioComparisons,
  type SceneContext,
} from '../../src/domain/positionScenarios';
import { firstStrike, retreatContact, supportArrival } from '../../src/domain/positionScenarioMath';
import { DAT } from '../../src/domain/datEffects';
let base: SceneContext;
beforeAll(async () => {
  base = { core: await loadCore(), trees: await loadTrees() };
});

describe('#652 合法方案、付款边界与固定参考目标', () => {
  it('六个弓线包真实付前置与一次升级，人数依据各自剩余预算', () => {
    const expected = [[], [199], [199, 200], [211], [199, 211], [199, 200, 211]];
    const rows = scenarioComparisons(base, 'flank', DEFAULT_FLANK_SCENE).Britons!;
    expect(rows).toHaveLength(6);
    rows.forEach((r, i) => {
      expect(r.status).toBe('ok');
      expect(r.technologies!.map((t) => t.id)).toEqual(expected[i]);
      const paid = { ...base.core.unitById[24]!.up![0] };
      for (const id of expected[i]!) for (const [key, value] of Object.entries(base.core.techById[id]!.cost)) paid[key] = (paid[key] ?? 0) + value;
      expect(r.fixed).toEqual(paid);
      expect(r.count).toBe(Math.floor((DEFAULT_FLANK_SCENE.budget - r.fixedSeconds!) / r.unitSeconds!));
      expect(r.upgrade).toEqual({ Food: 175, Gold: 100 });
    });
    expect(rows[0]!.count).toBeGreaterThan(rows[5]!.count!);
    expect(rows[0]!.stats!.rng).toBe(rows[5]!.stats!.rng - 2);
  });
  it('中路四包保留独立畜牧选择，骑士无侦骑升级收费', () => {
    for (const husbandry of [false, true]) {
      const rows = scenarioComparisons(base, 'pocket', { ...DEFAULT_SCENE, husbandry }).Britons!;
      expect(rows).toHaveLength(4);
      const expected = [[], [67], [81], [67, 81]].map((ids) => (husbandry ? [...ids, 39] : ids));
      rows.forEach((r, i) => {
        expect(r.technologies!.map((t) => t.id)).toEqual(expected[i]);
        expect(r.upgrade).toEqual({});
        expect(r.upgradeSeconds).toBe(0);
      });
      expect(rows[0]!.fixed).toEqual(husbandry ? base.core.techById[39]!.cost : {});
      expect(rows[0]!.stats!.spd).toBeCloseTo(base.core.unitById[38]!.spd * (husbandry ? 1.1 : 1));
    }
  });
  it('自己换包或减少预算不改变明确敌方共同包，属性源变化仍传播到目标', () => {
    const common = row(base),
      none = row(base, 'Britons', { ...DEFAULT_FLANK_SCENE, techPlan: 'none', budget: 2000 });
    expect(none.target).toEqual(common.target);
    expect(none.target).toMatchObject({ civ: 'Franks', plan: 'common' });
    expect(none.baseline!.plan).toBe('none');
    expect(none.stats!.rng).toBe(common.stats!.rng - 2);
    const changed = copy();
    changed.core.unitById[24]!.rng += 1;
    expect(row(changed).target!.stats.rng).toBe(common.target!.stats.rng + 1);
    expect(row(changed).target!.signature).not.toBe(common.target!.signature);
  });
  it('不足固定费、恰付固定费、恰好一兵区分报价与已拥有属性', () => {
    const quote = scenarioProfile(base, 'Britons', 'flank', DEFAULT_FLANK_SCENE);
    for (const [budget, funding, count] of [
      [quote.fixedSeconds! - 0.0001, 'fixed-shortfall', 0],
      [quote.fixedSeconds!, 'no-unit', 0],
      [quote.fixedSeconds! + quote.unitSeconds!, 'funded', 1],
    ] as const) {
      const result = scenarioProfile(base, 'Britons', 'flank', { ...DEFAULT_FLANK_SCENE, budget });
      expect(result).toMatchObject({ funding, count, fixed: quote.fixed });
      expect(Boolean(result.stats)).toBe(count > 0);
    }
    const empty = scenarioProfile(base, 'Britons', 'pocket', { ...DEFAULT_SCENE, budget: 0, techPlan: 'none', husbandry: false });
    expect(empty).toMatchObject({ funding: 'no-unit', fixed: {}, fixedSeconds: 0, count: 0 });
    expect(empty.stats).toBeUndefined();
  });
  it('none仍保留已核实文明固有加成，不假授予共同科技', () => {
    const cfg = { ...DEFAULT_SCENE, techPlan: 'none' as const, husbandry: false };
    expect(row(base, 'Franks', cfg, 'pocket').stats!.hp).toBeGreaterThan(row(base, 'Britons', cfg, 'pocket').stats!.hp);
    expect(row(base, 'Huns', cfg, 'pocket').cycle).toBe(25);
    const bow = { ...DEFAULT_FLANK_SCENE, techPlan: 'none' as const };
    expect(row(base, 'Britons', bow).stats!.rng).toBe(row(base, 'Franks', bow).stats!.rng + 1);
    expect(row(base, 'Mayans', bow).cost!.Gold).toBeLessThan(row(base, 'Franks', bow).cost!.Gold!);
  });
  it('解释基线不可用仍保留自身到场，但明确对照未完成', () => {
    const changed = copy();
    changed.trees = structuredClone(base.trees);
    const forging = changed.trees.t.Britons!.flatMap((b) => b[3]).find((c) => c[2] === 't' && c[3] === 67)!;
    forging[4] = 0;
    const result = row(changed, 'Franks', DEFAULT_SCENE, 'pocket');
    expect(result.status).toBe('ok');
    expect(result.support!.count).toBeGreaterThan(0);
    expect(result.baseline).toBeUndefined();
    expect(result.explanation).toContain('同方案解释对照不可核验');
  });
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

describe('#652 完备场景真实缺口', () => {
  it('none在低预算形成部队，不强制共同包且弩手解锁仍收费', () => {
    const cfg = { ...DEFAULT_FLANK_SCENE, budget: 2000, techPlan: 'none' as const };
    const chosen = scenarioProfile(base, 'Britons', 'flank', cfg);
    const common = scenarioProfile(base, 'Britons', 'flank', { ...cfg, techPlan: 'common' });
    console.log(
      JSON.stringify({
        gap: 'techPlan',
        none: { status: chosen.status, count: chosen.count, fixed: chosen.fixed },
        common: { status: common.status, count: common.count },
      }),
    );
    expect(chosen.status).toBe('ok');
    expect(chosen.count).toBeGreaterThan(0);
    expect(chosen.fixed).toEqual(base.core.unitById[24]!.up![0]);
    expect(common.count).toBe(0);
  });
  it.each(['unit', 'tech', 'upgrade'])('缺一个%s费用资源键显式blocked', (kind) => {
    const c = copy();
    if (kind === 'unit') delete c.core.unitById[24]!.cost.Gold;
    else if (kind === 'tech') delete c.core.techById[199]!.cost.Gold;
    else delete c.core.unitById[24]!.up![0].Gold;
    const result = scenarioProfile(c, 'Britons', 'flank', DEFAULT_FLANK_SCENE);
    console.log(JSON.stringify({ gap: 'partial-cost', kind, status: result.status, count: result.count, fixed: result.fixed }));
    expect(result.status).toBe('blocked');
  });
  it('坏攻击tuple不抛异常而显式blocked', () => {
    const c = copy();
    c.core.unitById[24]!.atks = [null] as unknown as (typeof c.core.unitById)[24]['atks'];
    let result: ReturnType<typeof scenarioProfile> | undefined;
    expect(() => {
      result = scenarioProfile(c, 'Britons', 'flank', DEFAULT_FLANK_SCENE);
    }).not.toThrow();
    expect(result?.status).toBe('blocked');
  });
  it('显式timeAt空对象不能静默回退trainTime', () => {
    const c = copy();
    c.eco!.units[38]!.timeAt = {};
    expect(scenarioProfile(c, 'Britons', 'pocket', DEFAULT_SCENE).status).toBe('blocked');
  });
  it('尚未到生产建筑时代不能产生合法部队', () => {
    const c = copy();
    c.core = { ...c.core, buildingById: { ...c.core.buildingById, 87: { ...c.core.buildingById[87]!, age: 4 } } };
    expect(scenarioProfile(c, 'Britons', 'flank', DEFAULT_FLANK_SCENE).status).toBe('unavailable');
  });
  const state = () => ({ ...chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'flank'), sceneConfig: { ...DEFAULT_FLANK_SCENE } });
  it('旧八字段v1恢复正规化为common对象', () => {
    const legacy = state();
    delete (legacy.sceneConfig as Record<string, unknown>).techPlan;
    const result = decodeSceneState(JSON.stringify({ version: 1, state: legacy }), new Set(['arabia']));
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') expect((result.state.sceneConfig as unknown as Record<string, unknown>).techPlan).toBe('common');
  });
  it('新合法none字段恢复而非被当多余键拒绝', () => {
    const next = state();
    const scene = { ...next.sceneConfig, techPlan: 'none' };
    const result = decodeSceneState(JSON.stringify({ version: 1, state: { ...next, sceneConfig: scene } }), new Set(['arabia']));
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') expect((result.state.sceneConfig as unknown as Record<string, unknown>).techPlan).toBe('none');
  });
});
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
      const entry = DAT.costDiscounts.Mayans!.find((d) => d.groups.some((g) => g.units.includes(24)))!;
      const group = entry.groups.find((g) => g.units.includes(24))!;
      group.tiers['3'] = 0.5;
      entry.text = { ...entry.text, '3': 50 };
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
    const choice = { mode: 'team' as const, teamSize: '4v4' as const, mapId: 'arabia', lane: 'flank' as const, civ: null, opponent: null, mates: [] };
    expect(scenarioScope(choice)).toBeNull();
    expect(scenarioScope({ ...choice, teamSize: '2v2' })).not.toBeNull();
    expect(scenarioScope({ ...choice, mapId: 'arena' })).not.toBeNull();
  });
});

// 模拟重新构建的数据模块：效果引擎在模块加载时编译规则，不能原地改闭包冒充重算。
import { vi } from 'vitest';

it.each([0, -1])('#652 完备解释：真实射程优势变为%s后不再按文明名写更远', async (value) => {
  const changed = structuredClone(DAT);
  const entry = changed.civs.Britons!.bonus.find(
    (b) => b.age === 3 && b.req.length === 0 && b.rules.some((r) => r.t.includes(24) && r.fx.some((f) => f.s === 'rng')),
  )!;
  const effect = entry.rules.find((r) => r.t.includes(24))!.fx.find((f) => f.s === 'rng')!;
  expect(effect.v).toBe(1);
  effect.v = value;
  vi.resetModules();
  vi.doMock('../../src/data/effects.json', () => ({ default: changed }));
  let view: import('react-test-renderer').ReactTestRenderer | undefined;
  let unmount: (() => Promise<void>) | undefined;
  try {
    const [{ createElement: h }, { create, act }, { MemoryRouter }, data, model, game, { default: Scenes }] = await Promise.all([
      import('react'),
      import('react-test-renderer'),
      import('react-router-dom'),
      import('../../src/data'),
      import('../../src/domain/positionScenarios'),
      import('../../src/domain/startGame'),
      import('../../src/features/home/components/ScenarioSuggestions'),
    ]);
    const [core, trees] = await Promise.all([data.loadCore(), data.loadTrees()]);
    const rows = model.scenarioRows({ core, trees }, 'flank', model.DEFAULT_FLANK_SCENE);
    const own = rows.find((r) => r.civ === 'Britons')!,
      reference = rows.find((r) => r.civ === 'Franks')!;
    expect(model.coverageReason('Britons')).toBeNull();
    expect(own.status).toBe('ok');
    expect(reference.status).toBe('ok');
    expect(own.stats!.rng).toBe(reference.stats!.rng + value);
    expect(own.opening!.opportunities).toBe(0);
    const state = game.chooseLane(game.chooseMap(game.chooseTeamSize(game.resetStart(), '4v4'), 'arabia'), 'flank');
    await act(async () => {
      view = create(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Scenes, { state, onChange: () => {} })));
      await Promise.all([data.loadCore(), data.loadTrees()]);
    });
    unmount = async () => {
      await act(async () => {
        view?.unmount();
      });
    };
    const why = view!.root.findByProps({ 'data-testid': 'scene-Britons' }).findByProps({ className: 'start-why' });
    const text = (node: import('react-test-renderer').ReactTestInstance | string): string =>
      typeof node === 'string' ? node : node.children.map(text).join('');
    const rendered = text(why);
    console.log(
      JSON.stringify({
        gap: 'derived-reason',
        ownRange: own.stats!.rng,
        referenceRange: reference.stats!.rng,
        opportunities: own.opening!.opportunities,
        rendered,
      }),
    );
    expect(rendered.length).toBeGreaterThan(10);
    expect(rendered).toContain('无先手机会');
    expect(rendered).not.toContain('射程更远');
  } finally {
    await unmount?.();
    vi.doUnmock('../../src/data/effects.json');
    vi.resetModules();
  }
});
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

it('issue 652 已选未覆盖文明区分路线不存在与机制未审', () => {
  expect(scenarioProfile(base, 'Mayans', 'pocket', DEFAULT_SCENE).status).toBe('unavailable');
  expect(scenarioProfile(base, 'Lithuanians', 'pocket', DEFAULT_SCENE).status).toBe('blocked');
});

import { selectStartOpening } from '../../src/domain/openingBuildChoices';
import { buildOrders } from '../../src/data/buildOrders';
import { civByEn } from '../../src/data';
describe('真实本局开局选择 #667', () => {
  it('按路位从同文明候选选择，保留成员优先和通用标记', () => {
    for (const [civ, lane, bo, kind] of [
      ['Britons', 'flank', 'archers-19', 'listed'],
      ['Mayans', 'flank', 'archers-19', 'listed'],
      ['Ethiopians', 'flank', 'archers-19', 'listed'],
      ['Huns', 'pocket', 'scouts-18', 'listed'],
      ['Franks', 'pocket', 'scouts-18', 'listed'],
      ['Berbers', 'pocket', 'fast-castle-knights', 'listed'],
      ['Vietnamese', 'flank', 'archers-19', 'generic'],
      ['Incas', 'flank', undefined, 'generic'],
      ['Mayans', 'pocket', undefined, 'listed'],
    ] as const) {
      const selected = selectStartOpening(civByEn(civ)!, buildOrders, lane);
      expect(selected.order?.id, civ + lane).toBe(bo);
      expect(selected.kind).toBe(kind);
      if (selected.order)
        expect(selected.order.steps.find((s) => s.phase === (selected.order!.target.age === 2 ? 'feudal-click' : 'castle-click'))?.vils).toBe(
          selected.order.target.vils,
        );
    }
  });
});

import { DEFAULT_ROUTE } from '../../src/domain/startGameInputs';
import { decodeStartGame, encodeStartGame } from '../../src/domain/startGameCodec';
it('#672 已确认参与者能使用唯一严格本局协议恢复', () => {
  const state = chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket');
  const input = { ...state, choice: { ...state.choice, opponent: 'Japanese', mates: ['Persians', 'Mayans', 'Persians'] } };
  expect(decodeStartGame(encodeStartGame(input), new Set(['arabia']))).toEqual({ kind: 'valid', state: input });
});

import { choose1v1, enterLobby, finishFlow, backStep, editStep, pickOpponent, setMate } from '../../src/domain/startGame';
import { decodeStartSearch, encodeStartSearch } from '../../src/domain/startGameCodec';
describe('#672 参与者的状态、清理与唯一v1迁移', () => {
  const team = () => chooseLane(chooseMap(chooseTeamSize(resetStart(), '4v4'), 'arabia'), 'pocket');
  const chosen = () => pickOpponent(setMate(setMate(setMate(pickCiv(team(), 'Mongols'), 0, 'Persians'), 1, 'Mayans'), 2, 'Persians'), 'Japanese');
  it('默认、普通完成、清空与主动跳过分别有准确语义', () => {
    for (const state of [resetStart(), enterLobby()]) expect(state.choice).toMatchObject({ opponent: null, mates: [] });
    const state = chosen();
    expect(state.current).toBe('opponent');
    expect(state.skipped.opponent).toBe(false);
    const cleared = pickOpponent(state, null);
    expect(cleared.current).toBe('opponent');
    expect(cleared.skipped.opponent).toBe(false);
    expect(finishFlow(cleared).skipped.opponent).toBe(false);
    const skipped = skipStep(state);
    expect(skipped.choice.opponent).toBeNull();
    expect(skipped.skipped.opponent).toBe(true);
    expect(skipped.current).toBeNull();
    expect(skipped.choice.mates).toEqual(state.choice.mates);
    expect(skipped.choice.civ).toBe('Mongols');
  });
  it('更改已知条件保留真实的人；1v1、跳过模式和新局清队友', () => {
    const state = chosen(),
      people = { opponent: 'Japanese', mates: ['Persians', 'Mayans', 'Persians'] };
    for (const next of [
      chooseMap(state, 'arena'),
      chooseLane(state, 'flank'),
      pickCiv(state, 'Huns'),
      chooseTeamSize(state, '2v2'),
      backStep(state),
      editStep(finishFlow(state), 'civ'),
    ])
      expect(next.choice).toMatchObject(people);
    const solo = choose1v1(state);
    expect(solo.choice).toMatchObject({ opponent: 'Japanese', mates: [], lane: null });
    expect(chooseTeamSize(solo, '4v4').choice.mates).toEqual([]);
    expect(skipStep({ ...state, current: 'mode' }).choice).toMatchObject({ mates: [], opponent: 'Japanese', lane: null });
  });
  it('0到3、重复、改选和移除保留顺序；非法索引/非组队不追加', () => {
    const state = chosen();
    expect(setMate(state, 3, 'Huns')).toBe(state);
    expect(setMate(state, -1, 'Huns')).toBe(state);
    expect(setMate(state, 1.5, 'Huns')).toBe(state);
    expect(setMate(resetStart(), 0, 'Huns').choice.mates).toEqual([]);
    const changed = setMate(state, 1, 'Japanese');
    expect(changed.choice.mates).toEqual(['Persians', 'Japanese', 'Persians']);
    expect(setMate(changed, 0, null).choice.mates).toEqual(['Japanese', 'Persians']);
    expect(state.choice.mates).toEqual(['Persians', 'Mayans', 'Persians']);
  });
  it('旧v1各字段独立缺省；两配置/flags与可选空对手摘要仍有效', () => {
    const source = { ...chosen(), sceneConfig: { ...DEFAULT_SCENE, budget: 2000 }, routeConfig: { ...DEFAULT_ROUTE, feudalBudget: 6000 } };
    for (const missing of [['opponent'], ['mates'], ['opponent', 'mates']]) {
      const raw = JSON.parse(encodeStartGame(source));
      for (const key of missing) delete raw.state.choice[key];
      const expected = {
        ...source,
        choice: { ...source.choice, opponent: missing.includes('opponent') ? null : 'Japanese', mates: missing.includes('mates') ? [] : source.choice.mates },
      };
      expect(decodeStartGame(JSON.stringify(raw), new Set(['arabia']))).toEqual({ kind: 'valid', state: expected });
    }
    const empty = finishFlow(pickOpponent(source, null));
    expect(decodeStartSearch(encodeStartSearch(empty), new Set(['arabia']))).toEqual({ kind: 'valid', state: empty });
    const skipped = skipStep(source);
    expect(decodeStartSearch(encodeStartSearch(skipped), new Set(['arabia']))).toEqual({ kind: 'valid', state: skipped });
  });
  it.each([0, 1, 2, 3])('严格接受%d名含重复的队友、保留独立对手', (count) => {
    const state = chosen();
    state.choice.mates = ['Mongols', 'Japanese', 'Mongols'].slice(0, count);
    expect(decodeStartSearch(encodeStartSearch(state), new Set(['arabia']))).toEqual({ kind: 'valid', state });
  });
  it('出现的坏字段拒绝，非组队隐藏队友与skip矛盾不被修复', () => {
    for (const patch of [
      { opponent: '' },
      { opponent: 'Unknown' },
      { opponent: 1 },
      { mates: null },
      { mates: 'Persians' },
      { mates: {} },
      { mates: [''] },
      { mates: ['Unknown'] },
      { mates: ['Persians', 'Mayans', 'Huns', 'Franks'] },
      { extra: true },
    ]) {
      const state = chosen(),
        raw = { ...state, choice: { ...state.choice, ...patch } };
      expect(decodeStartGame(JSON.stringify({ version: 1, state: raw }), new Set(['arabia']))).toEqual({ kind: 'invalid' });
    }
    const state = chosen();
    for (const bad of [
      { ...state, skipped: { ...state.skipped, opponent: true } },
      { ...choose1v1(state), choice: { ...choose1v1(state).choice, mates: ['Persians'] } },
      { ...resetStart(), choice: { ...resetStart().choice, mates: ['Persians'] } },
    ])
      expect(decodeStartGame(encodeStartGame(bad), new Set(['arabia']))).toEqual({ kind: 'invalid' });
  });
});
