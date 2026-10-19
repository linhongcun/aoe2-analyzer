import { describe, expect, it } from 'vitest';
import { duel, fighterFrom } from '../../src/domain/duel';
import { TEAM_BONUSES } from '../../src/domain/effects';
import { makeSimContext, presetUpTo, simTechs, simulate, type SimContext } from '../../src/domain/simulator';
import { upgradeComparison, upgradePlan, type UpgradeSide } from '../../src/domain/upgradeComparison';
import type { Tech, Unit } from '../../src/domain/types';
import { ctx, tech, techs, trees, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u])) as Record<number, Unit>;
const side = (techs: UpgradeSide['techs'] = [], rest: Partial<UpgradeSide> = {}): UpgradeSide => ({
  uid: 38,
  civ: 'Byzantines',
  age: 3,
  techs,
  team: [],
  ...rest,
});
const comparison = (before: UpgradeSide, current: UpgradeSide, b = side([], { uid: 358 })) => upgradeComparison(ctx, byId, before, current, b, b);
const plan = (spec: UpgradeSide, context = ctx) => {
  const result = upgradePlan(context, byId, spec);
  if (!result.ok) throw new Error(result.reason);
  return result;
};
const changedTech = (id: number, changes: Partial<Tech>): SimContext =>
  makeSimContext(
    techs.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    trees,
  );

describe('#205 固定版本升级前后对比', () => {
  it('锻造改变骑士镜像的击杀阈值，逐列等于独立 PK', () => {
    const b = side();
    const result = comparison(side(), side([67]), b);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const independent = (ids: number[]) => fighterFrom(byId[38]!, simulate(ctx, byId[38]!, 'Byzantines', 3, new Set(ids), new Set()));
    expect(result.beforeResult).toEqual(duel(independent([]), independent([])));
    expect(result.currentResult).toEqual(duel(independent([67]), independent([])));
    expect([result.beforeResult.ab.dmg, result.currentResult.ab.dmg]).toEqual([8, 9]);
    expect([result.beforeResult.ab.hits, result.currentResult.ab.hits]).toEqual([13, 12]);
    expect(result.beforeResult.ab.time).toBeCloseTo(21.6);
    expect(result.currentResult.ab.time).toBeCloseTo(19.8);
    expect([result.beforeResult.winner, result.currentResult.winner]).toEqual(['draw', 'a']);
    expect(result.cost).toEqual({ Food: 150 });
    expect(result.time).toBe(50);
  });

  it('铸铁提高攻击但骑士对长枪兵击杀次数保持 5', () => {
    const result = comparison(side([67]), side([68]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const b = byId[358]!;
    const opponent = fighterFrom(b, simulate(ctx, b, 'Byzantines', 3, new Set(), new Set()));
    const independent = (ids: number[]) => duel(fighterFrom(byId[38]!, simulate(ctx, byId[38]!, 'Byzantines', 3, new Set(ids), new Set())), opponent);
    expect(result.beforeResult).toEqual(independent([67]));
    expect(result.currentResult).toEqual(independent([67, 68]));
    expect([result.beforeResult.ab.dmg, result.currentResult.ab.dmg]).toEqual([11, 12]);
    expect([result.beforeResult.ab.hits, result.currentResult.ab.hits]).toEqual([5, 5]);
    expect(result.currentResult.ab.time).toBeCloseTo(7.2);
    expect(result.added.map((t) => t.id)).toEqual([68]);
    expect(result.cost).toEqual({ Food: 220, Gold: 120 });
    expect(result.time).toBe(75);
  });

  it('畜牧改变移速，但现有模型中的双向战斗结果保持一致', () => {
    const result = comparison(side([67]), side([67, 39]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.before.S.spd).toBeCloseTo(1.35);
    expect(result.current.S.spd).toBeCloseTo(1.485);
    expect(result.currentResult).toEqual(result.beforeResult);
    expect(result.cost).toEqual({ Food: 150 });
    expect(result.time).toBe(40);
  });

  it('尚未改变科技时两列相同，科研投入为零', () => {
    const result = comparison(side([68]), side([67, 68]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.currentResult).toEqual(result.beforeResult);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.cost).toEqual({});
    expect(result.time).toBe(0);
  });

  it('保留零命中率和自爆单位的现有战斗语义', () => {
    const b = side();
    const organGun = side([], { uid: 1001, civ: 'Portuguese' });
    const ranged = comparison(organGun, organGun, b);
    expect(ranged.ok).toBe(true);
    if (!ranged.ok) return;
    expect(ranged.beforeResult.ab.hits).toBe(Infinity);
    expect(ranged.currentResult.ab.time).toBe(Infinity);
    expect(ranged.currentResult).toEqual(ranged.beforeResult);
    const petard = side([], { uid: 440 });
    const explosive = comparison(petard, petard, b);
    expect(explosive.ok).toBe(true);
    if (!explosive.ok) return;
    expect(explosive.currentResult.ab.time).toBeNull();
    expect(explosive.currentResult.ab.dps).toBeNull();
    expect(explosive.currentResult).toEqual(explosive.beforeResult);
  });

  it('时代门控使数值差为零时，仍允许已支持的科技', () => {
    const villager = side([], { uid: 83, civ: 'Incas', age: 2 });
    const before = plan(villager);
    const after = plan({ ...villager, techs: [67] });
    expect(after.spec.techs).toEqual([67]);
    expect(after.S).toEqual(before.S);
  });
});

describe('#205 科技闭包与基础费用', () => {
  it('补齐、排序、去重所有前置，保存的完整配置可再次解析', () => {
    const result = comparison(side(), side([68, 68]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.current.spec.techs).toEqual([67, 68]);
    expect(result.current.techs.map((t) => t.id)).toEqual([67, 68]);
    expect(result.current.prerequisites.map((t) => t.id)).toEqual([67]);
    expect(result.addedPrerequisites.map((t) => t.id)).toEqual([67]);
    expect(result.cost).toEqual({ Food: 370, Gold: 120 });
    expect(result.time).toBe(125);
    expect(plan(result.current.spec).spec).toEqual(result.current.spec);
  });

  it('取消科技列出差集但不退款，已有前置不重复收费', () => {
    const result = comparison(side([67, 39]), side([68]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added.map((t) => t.id)).toEqual([68]);
    expect(result.removed.map((t) => t.id)).toEqual([39]);
    expect(result.addedPrerequisites).toEqual([]);
    expect(result.cost).toEqual({ Food: 220, Gold: 120 });
    expect(result.time).toBe(75);
    const removed = comparison(side([68]), side());
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.removed.map((t) => t.id)).toEqual([67, 68]);
    expect(removed.cost).toEqual({});
    expect(removed.time).toBe(0);
  });

  it.each(['f', 'c'] as const)('展开 %s 预设，仅选择当前时代数值科技', (preset) => {
    const result = plan(side(preset));
    const expected = [...presetUpTo(simTechs(ctx, byId[38]!, 'Byzantines'), 3)].sort((a, b) => a - b);
    expect(result.spec.techs).toEqual(expected);
    expect(result.S).toEqual(simulate(ctx, byId[38]!, 'Byzantines', 3, new Set(expected), new Set()));
    expect(result.techs.every((t) => t.age <= 3)).toBe(true);
  });

  it('允许必要的无直接效果前置，完整分享配置可重载；独立选择仍拒绝', () => {
    const required = tech('Ballistics');
    const context = changedTech(68, { pre: required.id });
    const result = plan(side([68]), context);
    expect(result.spec.techs).toEqual([68, required.id].sort((a, b) => a - b));
    expect(result.prerequisites.map((t) => t.id)).toEqual([required.id]);
    expect(plan(result.spec, context).spec).toEqual(result.spec);
    expect(upgradePlan(context, byId, side([required.id])).ok).toBe(false);
  });

  it.each([
    ['循环前置', () => changedTech(67, { pre: 68 })],
    ['缺失前置', () => changedTech(68, { pre: 999999 })],
    ['未来时代前置', () => changedTech(67, { age: 4 })],
    ['不可用前置', () => changedTech(68, { pre: tech('Blast Furnace').id })],
  ] as const)('拒绝%s', (_, context) => {
    expect(upgradePlan(context(), byId, side([68])).ok).toBe(false);
  });
});

describe('#205 非法计划与上下文失效', () => {
  const unsupportedTeam = TEAM_BONUSES.findIndex(([, , pred]) => !pred(byId[38]!));
  const supportedTeam = TEAM_BONUSES.findIndex(([, , pred]) => pred(byId[38]!));
  const supportedPikeTeam = TEAM_BONUSES.findIndex(([, , pred]) => pred(byId[358]!));

  it.each([
    ['未知单位', { uid: 999999 }],
    ['未知文明', { civ: 'MissingCiv' }],
    ['文明不能生产该单位', { civ: 'Aztecs' }],
    ['单位时代未到', { age: 2 }],
    ['超出时代范围', { age: 5 }],
    ['非整数时代', { age: 3.5 }],
    ['未知科技', { techs: [999999] }],
    ['非整数科技', { techs: [67.5] }],
    ['未来科技', { techs: [tech('Plate Barding Armor').id] }],
    ['文明不支持的科技', { techs: [tech('Blast Furnace').id] }],
    ['单位不支持的科技', { techs: [tech('Fletching').id] }],
    ['无效果文本科技', { techs: [tech('Conscription').id], age: 4 }],
    ['无效团队索引', { team: [TEAM_BONUSES.length] }],
    ['非整数团队索引', { team: [0.5] }],
    ['负团队索引', { team: [-1] }],
    ['单位不支持的团队加成', { team: [unsupportedTeam] }],
  ] satisfies [string, Partial<UpgradeSide>][])('拒绝%s且不静默回退', (_, changes) => {
    const result = upgradePlan(ctx, byId, side([], changes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toBe('');
  });

  it('团队加成去重排序并传入同一个模拟器', () => {
    expect(supportedTeam).toBeGreaterThanOrEqual(0);
    const supported = TEAM_BONUSES.flatMap(([, , pred], i) => (pred(byId[38]!) ? [i] : []));
    const result = plan(side([], { team: [...supported].reverse().concat(supported) }));
    expect(result.spec.team).toEqual(supported);
    expect(result.S).toEqual(simulate(ctx, byId[38]!, 'Byzantines', 3, new Set(), new Set(supported)));
  });

  it.each([
    ['A 单位', { uid: 358 }],
    ['A 文明', { civ: 'Franks' }],
    ['A 时代', { age: 4 }],
    ['A 团队', { team: [supportedTeam] }],
  ] satisfies [string, Partial<UpgradeSide>][])('%s变化使比较失效', (_, changes) => {
    expect(comparison(side(), side([], changes)).ok).toBe(false);
  });

  it.each([
    ['B 单位', { uid: 38 }],
    ['B 文明', { civ: 'Franks' }],
    ['B 时代', { age: 4 }],
    ['B 科技', { techs: [67] }],
    ['B 团队', { team: [supportedPikeTeam] }],
  ] satisfies [string, Partial<UpgradeSide>][])('%s变化使比较失效', (_, changes) => {
    const fixed = side([], { uid: 358 });
    expect(upgradeComparison(ctx, byId, side(), side([67]), fixed, { ...fixed, ...changes }).ok).toBe(false);
  });

  it('固定 B 比较正规化配置，允许等价的预设、顺序与重复项', () => {
    const full = plan(side('c'));
    const result = upgradeComparison(ctx, byId, side(), side([67]), side('f'), { ...full.spec, techs: [...full.spec.techs].reverse().concat(full.spec.techs) });
    expect(result.ok).toBe(true);
  });
});
