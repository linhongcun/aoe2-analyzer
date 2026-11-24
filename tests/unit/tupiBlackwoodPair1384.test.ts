/**
 * issue 1384：图皮（精锐）黑檀木步弓手（2579 / 2581）成对训练全领域口径与渲染回归测试。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { ECO } from '../../src/data/eco';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { groupFight } from '../../src/domain/duel';
import { buildDuelBudgetErrorParts, formatDuelBudgetErrorText, resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { calculateProduction, type ProductionContext } from '../../src/domain/production';
import { canStepQuantity, stepQuantity } from '../../src/domain/qtyStepper';
import { realCostOf } from '../../src/domain/realCost';
import { buildSimEffectiveCost } from '../../src/domain/simEffectiveCost';
import { makeSimContext } from '../../src/domain/simulator';
import { formatTrade, tradeLosses } from '../../src/domain/trade';
import { batchesForQty, ceilToBatch, deliveredQty, isPairTrained, perUnitCost, perUnitTime, unitTrainCount } from '../../src/domain/trainBatch';
import { defaultTrainQty, evaluateTrainTotal } from '../../src/domain/trainTotal';
import type { Trees } from '../../src/domain/types';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { pairBatchQtyPatch } from '../../src/features/duel/components/DuelTradeAndBudget';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import { SimEffectiveCost } from '../../src/shared/ui/sim/SimEffectiveCost';
import { baseDrifts } from '../../scripts/check-cost-drift';

let core: Core;
let trees: Trees;
let ctx: ProductionContext;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
  ctx = { core, trees };
});

describe('#1384 trainBatch 纯函数与目录/eco 数据防漂移', () => {
  it('全目录仅 2579/2581 为 trainCount=2，爪刀勇士 1123/1125 与副形态为 1', () => {
    const pairIds = core.units.filter((u) => isPairTrained(u)).map((u) => u.id);
    expect(pairIds).toEqual([2579, 2581]);
    expect(unitTrainCount(core.unitById[2579])).toBe(2);
    expect(unitTrainCount(core.unitById[2581])).toBe(2);
    expect(unitTrainCount(core.unitById[1123])).toBe(1);
    expect(unitTrainCount(core.unitById[1125])).toBe(1);
    expect(ECO.units['2579']?.trainCount).toBe(2);
    expect(ECO.units['2581']?.trainCount).toBe(2);
    expect(ECO.units['1123']?.trainCount).toBeUndefined();
    expect(defaultTrainQty(core.unitById[2581])).toBe('2');
    expect(defaultTrainQty(core.unitById[492])).toBe('1');
    expect(resolveUnitForm(core, 1980).rawTarget?.trainCount).toBeUndefined();
  });

  it('非法或非整数 trainCount 自动归一化为 1，防止除零与 NaN', () => {
    expect(unitTrainCount({ trainCount: 0 })).toBe(1);
    expect(unitTrainCount({ trainCount: -2 })).toBe(1);
    expect(unitTrainCount({ trainCount: 1.5 })).toBe(1);
    expect(unitTrainCount({ trainCount: Number.NaN })).toBe(1);
    expect(perUnitCost({ Gold: 45, Wood: 40 }, 0)).toEqual({ Gold: 45, Wood: 40 });
    expect(perUnitCost({ Gold: 45, Wood: 40 }, 2)).toEqual({ Gold: 22.5, Wood: 20 });
    expect(Object.keys(perUnitCost({ Gold: 45, Wood: 40 }, 2))).toEqual(['Gold', 'Wood']);
    expect(perUnitTime(18, 2)).toBe(9);
    expect(perUnitTime(14, 2)).toBe(7);
    expect(perUnitTime(14, 0)).toBe(14);
    expect(batchesForQty(11, 2)).toBe(6);
    expect(deliveredQty(11, 2)).toBe(12);
    expect(batchesForQty(10, 2)).toBe(5);
    expect(deliveredQty(10, 2)).toBe(10);
    expect(ceilToBatch(1, 2, 200)).toBe(2);
    expect(ceilToBatch(5, 2, 200)).toBe(6);
    expect(ceilToBatch(6, 2, 200)).toBe(6);
    expect(ceilToBatch(199, 2, 200)).toBe(200);
    expect(ceilToBatch(201, 2, 200)).toBe(200);
  });

  it('baseDrifts 检测 units.json 与 eco.json 的 trainCount 漂移', () => {
    const unit2581 = core.unitById[2581]!;
    const eco2581 = ECO.units['2581']!;
    expect(baseDrifts([unit2581], { '2581': eco2581 }, [], {})).toEqual([]);
    expect(baseDrifts([unit2581], { '2581': { ...eco2581, trainCount: undefined } }, [], {})).toEqual([expect.stringContaining('每批产出数 目录 2 eco 1')]);
  });
});

describe('#1384 qtyStepper 成双步进（step=2）全边界', () => {
  const pairBounds = { min: 2, max: 1000, step: 2 };

  it('成双步进加减、奇数收敛与禁点边界', () => {
    expect(canStepQuantity('2', -1, pairBounds)).toBe(false);
    expect(canStepQuantity('1', -1, pairBounds)).toBe(false);
    expect(canStepQuantity('1', 1, pairBounds)).toBe(true);
    expect(canStepQuantity('3', -1, pairBounds)).toBe(true);
    expect(canStepQuantity('1000', 1, pairBounds)).toBe(false);
    expect(canStepQuantity('', -1, pairBounds)).toBe(false);
    expect(canStepQuantity('', 1, pairBounds)).toBe(true);

    expect(stepQuantity('', 1, pairBounds)).toBe('2');
    expect(stepQuantity('abc', 1, pairBounds)).toBe('2');
    expect(stepQuantity('abc', -1, pairBounds)).toBe('2');
    expect(stepQuantity('1', 1, pairBounds)).toBe('2');
    expect(stepQuantity('2', 1, pairBounds)).toBe('4');
    expect(stepQuantity('4', -1, pairBounds)).toBe('2');
    expect(stepQuantity('3', -1, pairBounds)).toBe('2');
    expect(stepQuantity('3', 1, pairBounds)).toBe('4');
    expect(stepQuantity('11', -1, pairBounds)).toBe('10');
    expect(stepQuantity('11', 1, pairBounds)).toBe('12');
    expect(stepQuantity('999', 1, pairBounds)).toBe('1000');
    expect(stepQuantity('2.5', -1, pairBounds)).toBe('2');
    expect(stepQuantity('2.5', 1, pairBounds)).toBe('4');
  });

  it('不传 step 时与原单步行为 100% 一致', () => {
    const std = { min: 0, max: 100 };
    expect(stepQuantity('', 1, std)).toBe('1');
    expect(stepQuantity('1', 1, std)).toBe('2');
    expect(stepQuantity('1', -1, std)).toBe('0');
  });
});

describe('#1384 单位 PK 预算整对购买、报错逐字文案、交换比与群战胜负反转', () => {
  it('m=r 预算 3000/3020/100/80 与 m=t 10v×10m / 1v×1m 口径与报错逐字吻合', () => {
    const cost = core.unitById[2581]!.cost;
    const r3000 = resolveSideBudgetCount('r', cost, 0, { bud: 3000, vils: 10, mins: 10 }, 2);
    expect(r3000).toMatchObject({ count: 70, batches: 35, trainCount: 2, error: null, unitCost: 85 });

    const r3020 = resolveSideBudgetCount('r', cost, 0, { bud: 3020, vils: 10, mins: 10 }, 2);
    expect(r3020).toMatchObject({ count: 70, batches: 35, trainCount: 2, error: null });

    const r100 = resolveSideBudgetCount('r', cost, 0, { bud: 100, vils: 10, mins: 10 }, 2);
    expect(r100).toMatchObject({ count: 2, batches: 1, trainCount: 2, error: null });

    const r80 = resolveSideBudgetCount('r', cost, 0, { bud: 80, vils: 10, mins: 10 }, 2);
    expect(r80).toMatchObject({ count: 0, batches: 0, trainCount: 2, error: 'under-budget' });
    const r80Parts = buildDuelBudgetErrorParts(
      { side: 'A', unitName: '精锐黑檀木步弓手', resolved: r80 },
      { side: 'B', unitName: '劲弩手', resolved: resolveSideBudgetCount('r', core.unitById[492]!.cost, 0, { bud: 80, vils: 10, mins: 10 }, 1) },
      { bud: 80, vils: 10, mins: 10 },
    )!;
    expect(formatDuelBudgetErrorText(r80Parts)).toBe(
      'A 方预算 80 不够训练 1 对（2 只）精锐黑檀木步弓手（每对 85）。双方都至少要有 1 个单位才能开打，请调高预算。',
    );

    const simCtx = makeSimContext(core.techs, trees);
    const sideA = resolve(simCtx, core.unitById, { uid: 2581, civ: 'Tupi', age: 4, techs: 'f', team: [] }, 2581);
    const sideB = resolve(simCtx, core.unitById, { uid: 492, civ: 'Britons', age: 4, techs: 'f', team: [] }, 492);
    if (isUnavail(sideA) || isUnavail(sideB)) throw new Error('expected available sides');
    const secA = realCostOf({ ...sideA.disc, cost: sideA.training.price.cost, exact: sideA.training.price.exact }, sideA.age, sideA.civ).rc.total;
    const secB = realCostOf({ ...sideB.disc, cost: sideB.training.price.cost, exact: sideB.training.price.exact }, sideB.age, sideB.civ).rc.total;

    const t10 = resolveSideBudgetCount('t', sideA.training.price.cost, secA, { bud: 3000, vils: 10, mins: 10 }, 2);
    expect(t10).toMatchObject({ count: 64, batches: 32, trainCount: 2, error: null });

    const t1 = resolveSideBudgetCount('t', sideA.training.price.cost, secA, { bud: 3000, vils: 1, mins: 1 }, 2);
    const t1B = resolveSideBudgetCount('t', sideB.training.price.cost, secB, { bud: 3000, vils: 1, mins: 1 }, 1);
    expect(t1).toMatchObject({ count: 0, batches: 0, trainCount: 2, error: 'under-time' });
    const t1Parts = buildDuelBudgetErrorParts(
      { side: 'A', unitName: sideA.u.zh, resolved: t1 },
      { side: 'B', unitName: sideB.u.zh, resolved: t1B },
      { bud: 3000, vils: 1, mins: 1 },
    )!;
    expect(formatDuelBudgetErrorText(t1Parts)).toContain('A 方 1 个村民 × 1:00 采不够 1 对（2 只）精锐黑檀木步弓手（每对 1 个村民需 3:01）');
  });

  it('70 只精锐黑檀木对 42 不列颠劲弩反胜剩 8 只，拉扯对 42 日本冠军零损，交换比按单只折算', () => {
    const simCtx = makeSimContext(core.techs, trees);
    const sideA = resolve(simCtx, core.unitById, { uid: 2581, civ: 'Tupi', age: 4, techs: 'f', team: [] }, 2581);
    const sideB = resolve(simCtx, core.unitById, { uid: 492, civ: 'Britons', age: 4, techs: 'f', team: [] }, 492);
    const sideChamp = resolve(simCtx, core.unitById, { uid: 567, civ: 'Japanese', age: 4, techs: 'f', team: [] }, 567);
    if (isUnavail(sideA) || isUnavail(sideB) || isUnavail(sideChamp)) throw new Error('expected available sides');

    const fightArb = groupFight(sideA.F, 70, sideB.F, 42);
    expect(fightArb.status).toBe('win');
    if (fightArb.status !== 'win') throw new Error('expected win');
    expect(fightArb.winner).toBe('a');
    expect(fightArb.aAlive).toBe(8);
    expect(fightArb.bAlive).toBe(0);

    const tr = tradeLosses({
      na: 70,
      nb: 42,
      aAlive: fightArb.aAlive,
      bAlive: fightArb.bAlive,
      costA: sideA.training.price.cost,
      costB: sideB.training.price.cost,
      trainCountA: unitTrainCount(sideA.u),
      trainCountB: unitTrainCount(sideB.u),
    });
    expect(tr.a).toEqual({ dead: 62, res: { Gold: 1395, Wood: 1240 }, total: 2635 });
    expect(tr.b.total).toBe(2940);
    expect(formatTrade(tr).value).toBe('1 : 1.12');

    // 奇数阵亡（61 阵亡）不产生浮点尾差
    const trOdd = tradeLosses({
      na: 70,
      nb: 42,
      aAlive: 9,
      bAlive: 0,
      costA: sideA.training.price.cost,
      costB: sideB.training.price.cost,
      trainCountA: 2,
      trainCountB: 1,
    });
    expect(trOdd.a).toEqual({ dead: 61, res: { Gold: 1372.5, Wood: 1220 }, total: 2592.5 });

    // 拉扯对 42 日本冠军：70 只零损
    const fightKite = groupFight(sideA.F, 70, sideChamp.F, 42, { kite: { a: true, b: false } });
    expect(fightKite.status).toBe('win');
    if (fightKite.status !== 'win') throw new Error('expected win');
    expect(fightKite.winner).toBe('a');
    expect(fightKite.aAlive).toBe(70);

    // N vs M：仅在非成对单位切入成对单位时向上取偶数；普通↔精锐或改科技/时代/文明保留原奇数
    const u569 = core.unitById[569]!;
    const u2579 = core.unitById[2579]!;
    const u2581 = core.unitById[2581]!;
    expect(pairBatchQtyPatch('n', 'a', u569, u2581, 11)).toEqual({ na: '12' });
    expect(pairBatchQtyPatch('n', 'a', u2581, u2579, 11)).toEqual({});
    expect(pairBatchQtyPatch('n', 'a', u2581, u2581, 11)).toEqual({});
    expect(pairBatchQtyPatch('1', 'a', u569, u2581, 11)).toEqual({});
  });
});

describe('#1384 持续生产、训练总价、阵容新增费用与模拟器有效训练价', () => {
  it('持续生产：1 座图皮城堡帝王无征招保持 171.43 木 / 192.86 金与 21 村民，产量修正为 8.57 个 / 分钟', () => {
    const res = calculateProduction(ctx, {
      civ: 'Tupi',
      age: 4,
      techs: [],
      walk: 3,
      farm: 1,
      rows: [{ unit: 2581, building: 82, count: '1' }],
    });
    expect(res.errors).toEqual([]);
    const line = res.lines[0]!;
    expect(line.trainCount).toBe(2);
    expect(line.seconds).toBe(14);
    expect(line.batchesPerMinute).toBeCloseTo(60 / 14, 6);
    expect(line.perMinute).toBeCloseTo(120 / 14, 6);
    expect(line.spend.Wood).toBeCloseTo((40 * 60) / 14, 6);
    expect(line.spend.Gold).toBeCloseTo((45 * 60) / 14, 6);
    expect(res.total).toBe(21);
    const byRes = Object.fromEntries(res.resources.map((r) => [r.key, r.rounded]));
    expect(byRes.Wood).toBe(10);
    expect(byRes.Gold).toBe(11);
  });

  it('训练总价与阵容新增费用：11 只精锐黑檀木按 6 对（240 木 + 270 金，实得 12 只）实付，偶数 10 只按 5 对', () => {
    const tt = evaluateTrainTotal(ctx, {
      civ: 'Tupi',
      age: 4,
      ageRaw: null,
      techs: [],
      rows: [
        { unit: 2581, qty: '11' },
        { unit: 492, qty: '5' },
      ],
    });
    expect(tt.lines[0]).toMatchObject({ trainCount: 2, qtyValue: 11, billedBatches: 6, deliveredQty: 12, subtotal: { Wood: 240, Gold: 270 } });
    expect(tt.total).toEqual({ Wood: 365, Gold: 495 });

    const ttEven = evaluateTrainTotal(ctx, {
      civ: 'Tupi',
      age: 4,
      ageRaw: null,
      techs: [],
      rows: [{ unit: 2581, qty: '10' }],
    });
    expect(ttEven.lines[0]).toMatchObject({ billedBatches: 5, deliveredQty: 10, subtotal: { Wood: 200, Gold: 225 } });

    const ac = evaluateArmyCost(ctx, {
      civ: 'Tupi',
      age: '4',
      done: [],
      targets: [],
      rows: [{ unit: 2581, qty: '11' }],
    });
    expect(ac.training.lines[0]).toMatchObject({ trainCount: 2, qtyValue: 11, billedBatches: 6, deliveredQty: 12 });
    expect(ac.training.lines[0]?.subtotal).toEqual({ Food: 0, Wood: 240, Gold: 270, Stone: 0 });
    expect(ac.trainingTotal).toEqual({ Food: 0, Wood: 240, Gold: 270, Stone: 0 });
  });

  it('SimEffectiveCost 在 plain 与 changed 分支均正确展示每对标签与动态折合每只', () => {
    const u2579 = core.unitById[2579]!;
    const plainView = buildSimEffectiveCost(u2579, 'unit', 'Tupi', 3, new Set(), [], 18);
    expect(plainView.trainCount).toBe(2);
    expect(plainView.trainSeconds).toBe(18);
    const plainHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: plainView }));
    expect(plainHtml).toContain('每对（<span class="num nw">2 只</span>）');
    expect(plainHtml).toContain('20 木');
    expect(plainHtml).toContain('22.5 金');
    expect(plainHtml).toContain('9 秒');

    // 合成折扣（changed 分支）同样带每对标签、每对训练价 scopeTag 与折合每只
    const changedHtml = renderToStaticMarkup(
      createElement(SimEffectiveCost, {
        view: {
          ...plainView,
          kind: 'changed',
          cost: { Wood: 30, Gold: 35 },
          deltas: [{ res: 'Wood', before: 40, after: 30, delta: -10, pct: 25 }],
          appliedSources: ['示例折扣'],
          trainSeconds: 14,
        },
      }),
    );
    expect(changedHtml).toContain('每对训练价 · 不含研究费');
    expect(changedHtml).toContain('15 木');
    expect(changedHtml).toContain('17.5 金');
    expect(changedHtml).toContain('7 秒');

    // 马来爪刀勇士反例（trainCount=1）零成对标注
    const u1123 = core.unitById[1123]!;
    const karambitHtml = renderToStaticMarkup(
      createElement(SimEffectiveCost, { view: buildSimEffectiveCost(u1123, 'unit', 'Malay', 3, new Set(), [], u1123.tt) }),
    );
    expect(karambitHtml).not.toContain('每对');
    expect(karambitHtml).not.toContain('折合每只');
  });
});
