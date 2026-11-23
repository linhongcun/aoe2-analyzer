/**
 * issue 1368：单位 PK 排除零造价精锐钦察（1260 → 1233）、共享 unitOptionLabel 同名全目录去重、
 * countForBudget 零造价/不足 1 个及等采集时间零数量统一口径回归测试。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { countForBudget } from '../../src/domain/duel';
import {
  buildDuelBudgetErrorParts,
  DUEL_UNIT_REPLACED_NOTE,
  formatDuelBudgetErrorText,
  formatMixedUnitReplacedNote,
  isDuelExcludedUnit,
  replaceDuelUnitId,
  resolveSideBudgetCount,
  sanitizeMixedDuelUnits,
} from '../../src/domain/duelBudget';
import { collapse } from '../../src/domain/family';
import { emptyMixedDuel } from '../../src/domain/mixedDuelParams';
import type { ProductionContext } from '../../src/domain/production';
import { countForTime, fmtClock, realCostOf } from '../../src/domain/realCost';
import { makeSimContext } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { unitOptionLabel } from '../../src/domain/unitOptionLabel';
import { buildEnterMixedParams } from '../../src/features/duel/logic/duelKiteView';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

let core: Core;
let trees: Trees;
let prodCtx: ProductionContext;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
  prodCtx = { core, trees };
});

describe('#1368 PK 排除 1260 与共享 unitOptionLabel 全目录同名去重', () => {
  it('单兵种（家族折叠后）与混编（全目录去 1260）均不含 1260，且同一下拉无任何两个选项显示名相同', () => {
    const singleUnits = collapse(
      core.units.filter((u) => u.civs.length && !isDuelExcludedUnit(u.id)),
      core.fam,
    ).map((entry) => entry.u);
    const mixedUnits = core.units.filter((u) => u.civs.length && !isDuelExcludedUnit(u.id));

    expect(singleUnits.some((u) => u.id === 1260)).toBe(false);
    expect(mixedUnits.some((u) => u.id === 1260)).toBe(false);
    expect(singleUnits).toHaveLength(163);
    expect(mixedUnits).toHaveLength(247);

    for (const [name, list] of [
      ['单兵种', singleUnits],
      ['混编', mixedUnits],
    ] as const) {
      const labels = list.map((u) => unitOptionLabel({ core }, u, list));
      expect(new Set(labels).size, `${name} 存在重复显示名`).toBe(labels.length);
      for (const label of labels) {
        expect(label, `${name} 显示名不应含编号：${label}`).not.toMatch(/\d/);
      }
    }

    // 单兵种仅战车、楼船两组加后缀（共 4 项）；混编 13 组加后缀（共 26 项）
    const singleSuffixed = singleUnits.filter((u) => unitOptionLabel({ core }, u, singleUnits) !== u.zh);
    const mixedSuffixed = mixedUnits.filter((u) => unitOptionLabel({ core }, u, mixedUnits) !== u.zh);
    expect(singleSuffixed).toHaveLength(4);
    expect(mixedSuffixed).toHaveLength(26);

    // 关键代表项核对：单兵种与混编均以完整候选列表作 siblings，不受搜索子集影响
    expect(unitOptionLabel({ core }, core.unitById[1759]!, singleUnits)).toBe('战车（城堡）');
    expect(unitOptionLabel({ core }, core.unitById[1962]!, singleUnits)).toBe('战车（攻城武器厂）');
    expect(unitOptionLabel({ core }, core.unitById[1750]!, singleUnits)).toBe('楼船（Thirisadai）');
    expect(unitOptionLabel({ core }, core.unitById[1948]!, singleUnits)).toBe('楼船（Lou Chuan）');
    expect(unitOptionLabel({ core }, core.unitById[759]!, mixedUnits)).toBe('近卫军（兵营）');
    expect(unitOptionLabel({ core }, core.unitById[41]!, mixedUnits)).toBe('近卫军（城堡）');
    expect(unitOptionLabel({ core }, core.unitById[761]!, mixedUnits)).toBe('精锐近卫军（兵营）');
    expect(unitOptionLabel({ core }, core.unitById[555]!, mixedUnits)).toBe('精锐近卫军（城堡）');
    expect(unitOptionLabel({ core }, core.unitById[93]!, mixedUnits)).toBe('长矛兵（兵营）');
    expect(unitOptionLabel({ core }, core.unitById[1786]!, mixedUnits)).toBe('长矛兵（城楼）');
    expect(unitOptionLabel({ core }, core.unitById[1233]!, mixedUnits)).toBe('精锐钦察');

    // 团队规划仍保留 1260 的专门标签
    expect(unitOptionLabel(prodCtx, core.unitById[1260]!, core.units)).toBe('精锐钦察（库曼雇佣兵）');
  });

  it('单兵种与混编 1260 替换为 1233，保留数量并输出逐字提示文案', () => {
    expect(isDuelExcludedUnit(1260)).toBe(true);
    expect(isDuelExcludedUnit(1233)).toBe(false);
    expect(replaceDuelUnitId(1260)).toBe(1233);
    expect(replaceDuelUnitId(1233)).toBe(1233);
    expect(DUEL_UNIT_REPLACED_NOTE).toBe(
      '链接里的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。',
    );

    const base = emptyMixedDuel('DE-188329');
    const unchanged = sanitizeMixedDuelUnits({
      ...base,
      a: { ...base.a, civ: 'Cumans', rows: [{ uid: '1233', qty: '10' }] },
      b: { ...base.b, civ: 'Japanese', rows: [{ uid: '567', qty: '10' }] },
    });
    expect(unchanged.positions).toEqual([]);

    const mixed = sanitizeMixedDuelUnits({
      ...base,
      a: { ...base.a, civ: 'Cumans', rows: [{ uid: '1260', qty: '15' }] },
      b: {
        ...base.b,
        civ: 'Cumans',
        rows: [
          { uid: '1231', qty: '6' },
          { uid: '1260', qty: '8' },
        ],
      },
    });
    expect(mixed.positions).toEqual(['A 方第 1 行', 'B 方第 2 行']);
    expect(mixed.input.a.rows).toEqual([{ uid: '1233', qty: '15' }]);
    expect(mixed.input.b.rows).toEqual([
      { uid: '1231', qty: '6' },
      { uid: '1233', qty: '8' },
    ]);
    expect(formatMixedUnitReplacedNote(mixed.positions)).toBe(
      '链接中 A 方第 1 行、B 方第 2 行 的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。',
    );
  });

  it('混编同侧并存 1260 与 1233（相邻/非相邻/重复 1260）不覆写为重复 1233 且由校验明确拦截', () => {
    const base = emptyMixedDuel('DE-188329');
    const simCtx = makeSimContext(core.techs, trees);
    const colliding = sanitizeMixedDuelUnits({
      ...base,
      a: {
        ...base.a,
        civ: 'Cumans',
        rows: [
          { uid: '1260', qty: '15' },
          { uid: '567', qty: '5' },
          { uid: '1233', qty: '8' },
        ],
      },
      b: { ...base.b, civ: 'Cumans', rows: [{ uid: '1260', qty: '10' }] },
    });
    // A 方冲突跳过自动替换（保留原始行序且不制造重复 1233）；B 方无冲突正常替换
    expect(colliding.positions).toEqual(['B 方第 1 行']);
    expect(colliding.input.a.rows).toEqual([
      { uid: '1260', qty: '15' },
      { uid: '567', qty: '5' },
      { uid: '1233', qty: '8' },
    ]);
    expect(colliding.input.b.rows).toEqual([{ uid: '1233', qty: '10' }]);

    const viewA = resolveMixedSide(simCtx, core, colliding.input.a, 'a');
    expect(viewA.army).toBeNull();
    expect(viewA.errors.some((e) => e.field === 'mix-a-unit-0' && e.message.includes('单位 PK 不再提供'))).toBe(true);
    expect(viewA.errors.some((e) => e.message.includes('单位重复'))).toBe(false);

    const dup1260 = sanitizeMixedDuelUnits({
      ...base,
      a: {
        ...base.a,
        civ: 'Cumans',
        rows: [
          { uid: '1260', qty: '6' },
          { uid: '1260', qty: '4' },
        ],
      },
      b: { ...base.b, civ: 'Japanese', rows: [{ uid: '567', qty: '10' }] },
    });
    expect(dup1260.positions).toEqual([]);
    expect(dup1260.input.a.rows.map((r) => r.uid)).toEqual(['1260', '1260']);
  });
});

describe('#1368 零造价与不足 1 个统一口径', () => {
  it('countForBudget 遇零造价返回 null，预算不足返回 0，正常按单价下取整', () => {
    const u1260 = core.unitById[1260]!;
    const u1233 = core.unitById[1233]!;
    expect(countForBudget(u1260.cost, 3000)).toBeNull();
    expect(countForBudget({}, 3000)).toBeNull();
    expect(countForBudget({ Food: 0, Wood: 0 }, 3000)).toBeNull();
    expect(countForBudget(u1233.cost, 3000)).toBe(31);
    expect(countForBudget({ Food: 70, Gold: 50 }, 100)).toBe(0);
    expect(countForBudget({ Food: 70, Gold: 50 }, 120)).toBe(1);
    expect(countForBudget({ Food: 50, Gold: 20 }, 100)).toBe(1);
  });

  it('零造价领域兜底给出逐字错误文案', () => {
    const u1260 = core.unitById[1260]!;
    const u567 = core.unitById[567]!;
    const budget = { bud: 3000, vils: 10, mins: 10 };
    const resA = resolveSideBudgetCount('r', u1260.cost, 0, budget);
    const resB = resolveSideBudgetCount('r', u567.cost, 0, budget);
    expect(resA.count).toBeNull();
    expect(resB.count).toBe(42);
    const parts = buildDuelBudgetErrorParts({ side: 'A', unitName: u1260.zh, resolved: resA }, { side: 'B', unitName: u567.zh, resolved: resB }, budget);
    expect(parts).not.toBeNull();
    expect(formatDuelBudgetErrorText(parts!)).toBe('A 方的精锐钦察没有训练造价，不能按资源预算换算。');
  });

  it('等资源预算不足 1 个：单侧与双侧文案逐字一致且关键数字标记 .num.nw', () => {
    const budget = { bud: 100, vils: 10, mins: 10 };
    const leitis = core.unitById[1236]!; // 70F + 50G = 120
    const champ = core.unitById[567]!; // 50F + 20G = 70
    const paladin = core.unitById[569]!; // 60F + 75G = 135

    const oneSide = buildDuelBudgetErrorParts(
      { side: 'A', unitName: leitis.zh, resolved: resolveSideBudgetCount('r', leitis.cost, 0, budget) },
      { side: 'B', unitName: champ.zh, resolved: resolveSideBudgetCount('r', champ.cost, 0, budget) },
      budget,
    )!;
    expect(formatDuelBudgetErrorText(oneSide)).toBe('A 方预算 100 不够训练 1 个精锐烈堤司（每名 120）。双方都至少要有 1 个单位才能开打，请调高预算。');
    expect(oneSide.filter((p) => p.num).map((p) => p.text)).toEqual(['100', '1 个', '120', '1 个']);

    const bothSides = buildDuelBudgetErrorParts(
      { side: 'A', unitName: leitis.zh, resolved: resolveSideBudgetCount('r', leitis.cost, 0, budget) },
      { side: 'B', unitName: paladin.zh, resolved: resolveSideBudgetCount('r', paladin.cost, 0, budget) },
      budget,
    )!;
    expect(formatDuelBudgetErrorText(bothSides)).toBe(
      'A 方预算 100 不够训练 1 个精锐烈堤司（每名 120）；B 方预算 100 不够训练 1 个游侠（每名 135）。双方都至少要有 1 个单位才能开打，请调高预算。',
    );
  });

  it('等采集时间不足 1 个：卡片与战斗数量均为 0，单侧与双侧文案逐字一致', () => {
    const simCtx = makeSimContext(core.techs, trees);
    const sideA = resolve(simCtx, core.unitById, { uid: 1233, civ: 'Cumans', age: 4, ageSet: true, techs: 'f', team: [] }, 1233);
    const sideB = resolve(simCtx, core.unitById, { uid: 567, civ: 'Japanese', age: 4, ageSet: true, techs: 'f', team: [] }, 567);
    expect(isUnavail(sideA)).toBe(false);
    expect(isUnavail(sideB)).toBe(false);
    if (isUnavail(sideA) || isUnavail(sideB)) return;

    const secA = realCostOf({ ...sideA.disc, cost: sideA.training.price.cost, exact: sideA.training.price.exact }, sideA.age, sideA.civ).rc.total;
    const secB = realCostOf({ ...sideB.disc, cost: sideB.training.price.cost, exact: sideB.training.price.exact }, sideB.age, sideB.civ).rc.total;
    const budget = { bud: 3000, vils: 1, mins: 3 };
    const cardCountA = countForTime(secA, budget.vils, budget.mins);
    const resolvedA = resolveSideBudgetCount('t', sideA.training.price.cost, secA, budget);
    const resolvedB = resolveSideBudgetCount('t', sideB.training.price.cost, secB, budget);
    expect(cardCountA).toBe(0);
    expect(resolvedA.count).toBe(0);
    expect(resolvedB.count).toBe(1);
    expect(fmtClock(secA)).toBe('3:17');

    const oneSide = buildDuelBudgetErrorParts(
      { side: 'A', unitName: sideA.u.zh, resolved: resolvedA },
      { side: 'B', unitName: sideB.u.zh, resolved: resolvedB },
      budget,
    )!;
    expect(formatDuelBudgetErrorText(oneSide)).toBe(
      'A 方 1 个村民 × 3:00 采不够 1 个精锐钦察（1 个村民需 3:17）。双方都至少要有 1 个单位才能开打，请增加村民或分钟数。',
    );
    expect(oneSide.filter((p) => p.num).map((p) => p.text)).toEqual(['1 个村民', '3:00', '1 个', '1 个村民', '3:17', '1 个']);

    const tight = { bud: 3000, vils: 1, mins: 1 };
    const bothSides = buildDuelBudgetErrorParts(
      { side: 'A', unitName: sideA.u.zh, resolved: resolveSideBudgetCount('t', sideA.training.price.cost, secA, tight) },
      { side: 'B', unitName: sideB.u.zh, resolved: resolveSideBudgetCount('t', sideB.training.price.cost, secB, tight) },
      tight,
    )!;
    expect(formatDuelBudgetErrorText(bothSides)).toBe(
      `A 方 1 个村民 × 1:00 采不够 1 个精锐钦察（1 个村民需 ${fmtClock(secA)}）；B 方 1 个村民 × 1:00 采不够 1 个冠军剑士（1 个村民需 ${fmtClock(secB)}）。双方都至少要有 1 个单位才能开打，请增加村民或分钟数。`,
    );
  });

  it('等资源 / 等采集时间不足 1 个或零造价切入混编时不虚增为 10，非预算模式保留默认 10', () => {
    const simCtx = makeSimContext(core.techs, trees);
    const sideA = resolve(simCtx, core.unitById, { uid: 1236, civ: 'Lithuanians', age: 4, ageSet: true, techs: 'f', team: [] }, 1236);
    const sideB = resolve(simCtx, core.unitById, { uid: 567, civ: 'Japanese', age: 4, ageSet: true, techs: 'f', team: [] }, 567);
    if (isUnavail(sideA) || isUnavail(sideB)) throw new Error('Expected available sides');

    const rParams = buildEnterMixedParams(sideA, sideB, 'r', { na: 10, nb: 10, cntA: 0, cntB: 1 }, { a: false, b: false });
    expect(JSON.parse(rParams.get('ma')!).rows).toEqual([{ uid: '1236', qty: '' }]);
    expect(JSON.parse(rParams.get('mb')!).rows).toEqual([{ uid: '567', qty: '1' }]);

    const tNullParams = buildEnterMixedParams(sideA, sideB, 't', { na: 10, nb: 10, cntA: null, cntB: 2 }, { a: false, b: false });
    expect(JSON.parse(tNullParams.get('ma')!).rows).toEqual([{ uid: '1236', qty: '' }]);
    expect(JSON.parse(tNullParams.get('mb')!).rows).toEqual([{ uid: '567', qty: '2' }]);

    const nDefaultParams = buildEnterMixedParams(sideA, sideB, 'n', { na: 0, nb: 15, cntA: 0, cntB: 0 }, { a: false, b: false });
    expect(JSON.parse(nDefaultParams.get('ma')!).rows).toEqual([{ uid: '1236', qty: '10' }]);
    expect(JSON.parse(nDefaultParams.get('mb')!).rows).toEqual([{ uid: '567', qty: '15' }]);
  });
});
