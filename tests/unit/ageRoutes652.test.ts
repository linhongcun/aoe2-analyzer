import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { ageRoute, ageRoutes, DEFAULT_ROUTE, type AgeRoute, type RouteConfig } from '../../src/domain/ageRoutes';
import { FEUDAL_TECHS, routeProfile, routeWork, addCosts } from '../../src/domain/routeProfiles';
import { SCENE_ECO, type SceneContext } from '../../src/domain/positionScenarios';
import { DAT } from '../../src/domain/datEffects';
let ctx: SceneContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees(), eco: structuredClone(SCENE_ECO) };
});
const copy = () => structuredClone(ctx);
function row(civ = 'Britons', lane: 'flank' | 'pocket' = 'flank', config: Partial<RouteConfig> = {}, source = ctx): AgeRoute {
  const r = ageRoute(source, civ, lane, { ...DEFAULT_ROUTE, ...config });
  expect(r.ok, 'blocked: ' + (!r.ok ? r.reason : '')).toBe(true);
  return r as AgeRoute;
}
describe('#652 两时代合法性与输入门禁', () => {
  it('全部9个路位样本独立可算，参考样本不冒称推荐', () => {
    expect(ageRoutes(ctx, 'flank', DEFAULT_ROUTE).every((r) => r.ok)).toBe(true);
    expect(ageRoutes(ctx, 'pocket', DEFAULT_ROUTE).every((r) => r.ok)).toBe(true);
    expect(row('Franks').reference).toBe(true);
    expect(row('Britons', 'pocket').reference).toBe(true);
    expect(ageRoute(ctx, 'Mayans', 'pocket', DEFAULT_ROUTE).ok).toBe(false);
  });
  it('科技和单位时代合法，畜牧不能进入封建', () => {
    expect(routeProfile(ctx, 'Britons', 24, 2, FEUDAL_TECHS.flank).ok).toBe(false);
    expect(routeProfile(ctx, 'Huns', 448, 2, [...FEUDAL_TECHS.pocket, 'Husbandry']).ok).toBe(false);
    expect(routeProfile(ctx, 'Huns', 38, 2, FEUDAL_TECHS.pocket).ok).toBe(false);
    expect(routeProfile(ctx, 'Britons', 24, 3, ['Bodkin Arrow']).ok).toBe(false);
  });
  it('科技建筑尚不可用，不能仅检查生产建筑', () => {
    const c = copy();
    c.core.buildingById[103]!.age = 3;
    expect(ageRoute(c, 'Britons', 'flank', DEFAULT_ROUTE)).toMatchObject({ ok: false, reason: expect.stringContaining('封建') });
  });
  it('谱系与生产类别结构变化阻断，不允许侦骑升级骑士', () => {
    const c = copy();
    c.core.unitById[38]!.from_ = 448;
    expect(ageRoute(c, 'Huns', 'pocket', DEFAULT_ROUTE).ok).toBe(false);
    const d = copy();
    d.eco!.units[448]!.class = 12;
    expect(ageRoute(d, 'Huns', 'pocket', DEFAULT_ROUTE).ok).toBe(false);
  });
  it('费用缺一项、升级缺项、科技缺前置一律不视为免费', () => {
    const a = copy();
    delete a.core.unitById[4]!.cost.Gold;
    const b = copy();
    delete b.core.unitById[24]!.up![0].Gold;
    const c = copy();
    delete c.core.techById[199]!.cost.Gold;
    const d = copy();
    d.core.techById[200]!.pre = null;
    for (const source of [a, b, c, d]) expect(ageRoute(source, 'Britons', 'flank', DEFAULT_ROUTE).ok).toBe(false);
  });
  it('畸形攻击表与timeAt缺建筑不抛错也不静默回退', () => {
    const a = copy();
    a.core.unitById[4]!.atks = [null] as unknown as [string, number][];
    expect(() => ageRoute(a, 'Britons', 'flank', DEFAULT_ROUTE)).not.toThrow();
    expect(ageRoute(a, 'Britons', 'flank', DEFAULT_ROUTE).ok).toBe(false);
    const b = copy();
    b.eco!.units[4]!.timeAt = {};
    expect(ageRoute(b, 'Britons', 'flank', DEFAULT_ROUTE).ok).toBe(false);
  });
  it('缺机制或新增生产条件阻断', () => {
    const c = copy();
    c.eco!.civEco.Huns![0]!.effects.push({ kind: 'unknown', target: 'unit:101', attr: 'workRate', op: 'mul', v: 2 });
    expect(ageRoute(c, 'Huns', 'pocket', DEFAULT_ROUTE).ok).toBe(false);
    expect(ageRoute(ctx, 'Lithuanians', 'pocket', DEFAULT_ROUTE).ok).toBe(false);
  });
  it('数量只允许有界整数，预算/距离/期限有限非负', () => {
    for (const config of [
      { survivors: 1.5 },
      { survivors: 101 },
      { newLimit: -1 },
      { feudalBudget: NaN },
      { castleBudget: Infinity },
      { deadline: 3601 },
      { distance: -1 },
    ])
      expect(ageRoute(ctx, 'Britons', 'flank', { ...DEFAULT_ROUTE, ...config }).ok).toBe(false);
  });
});
describe('#652 增量费用与部队继承', () => {
  it('存量升级仅收锥子箭与弩手升级一次，不重买存量或箭羽', () => {
    const a = row('Britons', 'flank', { feudalBudget: 6000, survivors: 6, newLimit: 0 });
    const b = row('Britons', 'flank', { feudalBudget: 6000, survivors: 12, newLimit: 0 });
    expect(a.castleLedger.spent).toEqual({ Food: 375, Gold: 200, Wood: 0 });
    expect(b.castleLedger.spent).toEqual(a.castleLedger.spent);
    expect(a.newTechs.map((t) => t.id)).toEqual([200]);
    expect(a.upgraded).toBe(6);
    expect(b.upgraded).toBe(12);
    expect(a.newCount).toBe(0);
    expect(a.newSupport.first).toBeNull();
  });
  it('新产费用独立增加，不能重复买存量', () => {
    const a = row('Britons', 'flank', { newLimit: 0 }),
      b = row('Britons', 'flank', { newLimit: 6 });
    expect(b.castleLedger.spent.Food).toBe(a.castleLedger.spent.Food);
    expect(b.castleLedger.spent.Gold! - a.castleLedger.spent.Gold!).toBe(6 * 45);
    expect(b.castleLedger.spent.Wood! - a.castleLedger.spent.Wood!).toBe(6 * 25);
    expect(b.upgraded).toBe(a.upgraded);
  });
  it('封建包未付时城堡必须补前置，零旧兵仍可购买新兵', () => {
    const r = row('Britons', 'flank', { feudalBudget: 0, survivors: 6 });
    expect(r.survivors).toBe(0);
    expect(r.feudalLedger.spent).toEqual({});
    expect(r.newTechs.map((t) => t.id)).toEqual([199, 211, 200]);
    expect(r.castleLedger.required).toEqual({ Food: 575, Gold: 250 });
    expect(r.newCount).toBeGreaterThan(0);
  });
  it('升级额度不足：保留步弓，仍获得城堡时代文明属性', () => {
    const r = row('Britons', 'flank', { castleBudget: 0 });
    expect(r.castleLedger.packagePaid).toBe(false);
    expect(r.retained.unit.id).toBe(4);
    expect(r.retained.stats.rng).toBe(r.feudal.stats.rng + 1);
    expect(r.retained.techs.map((t) => t.id)).toEqual([199, 211]);
    expect(r.newCount).toBe(0);
    expect(r.upgraded).toBe(0);
    expect(r.castleLedger.spent).toEqual({});
  });
  it('零存量且零新增不购买无用途升级；零追加不会虚构部队', () => {
    const r = row('Britons', 'flank', { survivors: 0, newLimit: 0 });
    expect(r.castleLedger.spentWork).toBe(0);
    expect(r.upgraded).toBe(0);
    const z = row('Huns', 'pocket', { feudalBudget: 0, castleBudget: 0 });
    expect(z.feudalLedger.count + z.newCount + z.survivors).toBe(0);
    expect(z.cumulativeWork).toBe(0);
  });
  it('侦骑绝不变骑士，骑士单独花费及生产', () => {
    const r = row('Huns', 'pocket');
    expect(r.retained.unit.id).toBe(448);
    expect(r.castle.unit.from_).toBeNull();
    expect(r.upgraded).toBe(0);
    expect(r.castleLedger.required).toEqual({ Food: 150 });
    expect(r.castleLedger.spent).toEqual({ Food: 510, Gold: 450 });
    expect(r.newSupport.first).toBeCloseTo(r.castle.cycle + DEFAULT_ROUTE.distance / r.castle.stats.spd);
  });
  it('畜牧付费一次且作用保留侦骑，无新增则不额外付费', () => {
    const yes = row('Huns', 'pocket'),
      no = row('Huns', 'pocket', { husbandry: false }),
      idle = row('Huns', 'pocket', { newLimit: 0 });
    expect(yes.retained.stats.spd).toBeCloseTo(no.retained.stats.spd * 1.1);
    expect(yes.castleLedger.spent.Food! - no.castleLedger.spent.Food!).toBe(150);
    expect(idle.retained.stats.spd).toBe(no.retained.stats.spd);
    expect(idle.castleLedger.spentWork).toBe(0);
  });
  it('恰好固定费可升级存量，差一点则不部分购买', () => {
    const fixed = row().castleLedger.fixedWork;
    const exact = row('Britons', 'flank', { castleBudget: fixed, newLimit: 0 });
    const less = row('Britons', 'flank', { castleBudget: fixed - 1e-5, newLimit: 0 });
    expect(exact.upgraded).toBe(exact.survivors);
    expect(exact.upgraded).toBeGreaterThan(0);
    expect(less.upgraded).toBe(0);
    expect(less.castleLedger.spentWork).toBe(0);
  });
  it('整兵预算边界与包含截止，首兵不在t0', () => {
    const original = row('Huns', 'pocket', { distance: 0 });
    const budget = original.castleLedger.fixedWork + routeWork(original.castle.cost);
    const r = row('Huns', 'pocket', { castleBudget: budget, distance: 0, deadline: original.castle.cycle });
    expect(r.newCount).toBe(1);
    expect(r.newSupport.count).toBe(1);
    expect(row('Huns', 'pocket', { castleBudget: budget - 1e-5 }).newCount).toBe(0);
    expect(row('Huns', 'pocket', { distance: 0, deadline: 0 }).newSupport.count).toBe(0);
  });
  it('损失不退款、封建余额不结转、累计资源守恒', () => {
    const kept = row(),
      lost = row('Britons', 'flank', { survivors: 0 });
    expect(kept.feudalLedger.spent).toEqual(lost.feudalLedger.spent);
    expect(kept.cumulative).toEqual(addCosts(kept.feudalLedger.spent, kept.castleLedger.spent));
    expect(kept.cumulativeWork).toBeCloseTo(kept.feudalLedger.spentWork + kept.castleLedger.spentWork);
    expect(kept.feudalLedger.spentWork).toBeLessThanOrEqual(DEFAULT_ROUTE.feudalBudget + 1e-8);
    expect(kept.castleLedger.spentWork).toBeLessThanOrEqual(DEFAULT_ROUTE.castleBudget + 1e-8);
    expect(row('Britons', 'flank', { feudalBudget: 12000, castleBudget: 0 }).upgraded).toBe(0);
  });
});
describe('#652 真实文明数据及扰动', () => {
  it('玛雅分时代折扣；柏柏尔封建无骑兵折扣；自身团队生产只一次', () => {
    const m = row('Mayans'),
      b = row('Berbers', 'pocket'),
      h = row('Huns', 'pocket');
    expect(m.feudal.cost).toEqual({ Gold: 40.5, Wood: 22.5 });
    expect(m.castle.cost).toEqual({ Gold: 36, Wood: 20 });
    expect(b.feudal.cost).toEqual({ Food: 80 });
    expect(b.castle.cost).toEqual({ Food: 51, Gold: 64 });
    expect(h.feudal.cycle).toBe(25);
    expect(h.castle.cycle).toBe(25);
    expect(row().feudal.cycle).toBeCloseTo(35 / 1.1);
  });
  it('封建时代侦骑通用效果和法兰克生命，越南与埃塞效果均真实应用', () => {
    const h = row('Huns', 'pocket'),
      f = row('Franks', 'pocket');
    expect(h.feudal.stats.spd).toBeCloseTo(1.55);
    expect(h.feudal.stats.atk).toBe(6);
    expect(f.feudal.stats.hp).toBeGreaterThan(h.feudal.stats.hp);
    expect(row('Vietnamese').feudal.stats.hp).toBe(36);
    expect(row('Ethiopians').feudal.stats.rof).toBeLessThan(row('Franks').feudal.stats.rof);
  });
  it('价格、升级费用与生产数据扰动真正改变结果和摘要', () => {
    const a = copy();
    a.core.unitById[4]!.cost.Wood! *= 2;
    expect(row('Britons', 'flank', {}, a).feudalLedger.count).toBeLessThan(row().feudalLedger.count);
    const b = copy();
    b.core.unitById[24]!.up![0].Gold! += 100;
    expect(row('Britons', 'flank', {}, b).castleLedger.fixedWork).toBeGreaterThan(row().castleLedger.fixedWork);
    const c = copy();
    c.eco!.units[38]!.trainTime *= 2;
    expect(row('Huns', 'pocket', {}, c).newSupport.first!).toBeGreaterThan(row('Huns', 'pocket').newSupport.first!);
    expect(row('Huns', 'pocket', {}, c).signature).not.toBe(row('Huns', 'pocket').signature);
  });
  it('数值折扣按两个时代传播，说明文字不影响结果', () => {
    const saved = DAT.costDiscounts.Mayans;
    try {
      DAT.costDiscounts.Mayans = structuredClone(saved!);
      DAT.costDiscounts.Mayans!.flatMap((d) => d.groups).find((g) => g.units.includes(4))!.tiers['2'] = 0.5;
      const r = row('Mayans');
      expect(r.feudal.cost.Gold).toBe(22.5);
      expect(r.castle.cost.Gold).toBe(36);
    } finally {
      DAT.costDiscounts.Mayans = saved!;
    }
    const c = copy();
    c.core.unitById[4]!.desc = '无关描述';
    c.core.techById[199]!.zh = '文字变化';
    expect(row('Britons', 'flank', {}, c).signature).toBe(row().signature);
  });
});
it('#652 重新加载受支持的generic数值能改变封建侦骑属性', async () => {
  const changed = structuredClone(DAT);
  const effect = changed.generic
    .find((g) => g.tech === 20)!
    .rules.find((r) => r.t.includes(448))!
    .fx.find((e) => e.s === 'spd')!;
  effect.v += 0.1;
  vi.resetModules();
  vi.doMock('../../src/data/effects.json', () => ({ default: changed }));
  try {
    const rebuilt = await import('../../src/domain/ageRoutes');
    const r = rebuilt.ageRoute(ctx, 'Huns', 'pocket', DEFAULT_ROUTE) as AgeRoute;
    expect(r.ok).toBe(true);
    expect(r.feudal.stats.spd).toBeCloseTo(row('Huns', 'pocket').feudal.stats.spd + 0.1);
  } finally {
    vi.doUnmock('../../src/data/effects.json');
    vi.resetModules();
  }
});
