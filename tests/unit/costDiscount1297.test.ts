import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { buildingDiscountView, parseBuildingDiscountAge } from '../../src/domain/buildingDetailView';
import { buildingSimTechs } from '../../src/domain/buildingSim';
import { DAT } from '../../src/domain/datEffects';
import { duelToTrainTotal } from '../../src/domain/productionTransfer';
import {
  applicableSimCostTechs,
  buildSimEffectiveCost,
  costTechBadgeMap,
  mergeSimCostTechs,
  presetCostTechIds,
  type SimEffectiveCostView,
} from '../../src/domain/simEffectiveCost';
import { makeSimContext, simTechs } from '../../src/domain/simulator';
import { evaluateTrainTotal, mergeTrainTotalCostTech } from '../../src/domain/trainTotal';
import { unitCost, type UnitCostTech } from '../../src/domain/unitCost';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { trainingLines } from '../../src/features/duel/logic/trainingCostView';
import { SimEffectiveCost } from '../../src/shared/ui/sim/SimEffectiveCost';
import { trees } from './helpers';

const sim = makeSimContext(CORE.techs, trees);
const prodCtx = { core: CORE, trees };
const techInput = (id: number): UnitCostTech => {
  const t = CORE.techById[id]!;
  return { id: t.id, en: t.en, zh: t.zh };
};

describe('unitCost 单条 effect 过滤与 a:100 零键防护（#1297）', () => {
  it('Butalmapu (1380) 对掷石绳骑兵放行 -15% 且不写出 Food/Stone 零键，对科那不改价', () => {
    for (const id of [2569, 2571]) {
      const unit = CORE.unitById[id]!;
      const priced = unitCost(unit, 'Mapuche', 4, [techInput(1380)]);
      expect(priced.exact).toEqual({ Wood: 42.5, Gold: 46.75 });
      expect(priced.cost).toEqual({ Wood: 42.5, Gold: 47 });
      expect(priced.exact.Food).toBeUndefined();
      expect(priced.exact.Stone).toBeUndefined();
      expect(priced.cost.Food).toBeUndefined();
      expect(priced.cost.Stone).toBeUndefined();
      expect(priced.appliedTechs).toEqual([{ id: 1380, zh: '布图马普' }]);
      expect(priced.undecoded).toEqual([{ techId: 1380, tech: '布图马普', reason: '含未解码的资源或条件效果', res: 33, op: 'set' }]);
    }

    for (const id of [2566, 2568]) {
      const kona = CORE.unitById[id]!;
      const priced = unitCost(kona, 'Mapuche', 4, [techInput(1380)]);
      expect(priced.cost).toEqual(kona.cost);
      expect(priced.appliedTechs).toEqual([]);
      expect(priced.undecoded).toHaveLength(1);
    }
  });

  it('丝绸之路 (499) 与刹帝利 (835) 乘法不污染不存在的资源键，混合 res + 非法 op 仍整项跳过', () => {
    const cart = CORE.unitById[128]!;
    const silk = unitCost(cart, 'Italians', 4, [techInput(499)]);
    expect(silk.cost).toEqual({ Wood: 50, Gold: 25 });
    expect(silk.exact.Food).toBeUndefined();
    expect(silk.exact.Stone).toBeUndefined();
    expect(silk.cost.Food).toBeUndefined();
    expect(silk.cost.Stone).toBeUndefined();

    const archer = CORE.unitById[4]!;
    const ksh = unitCost(archer, 'Gurjaras', 4, [techInput(835)]);
    expect(ksh.cost).toEqual({ Wood: 25, Gold: 45 });
    expect(ksh.exact.Food).toBeUndefined();
    expect(ksh.cost.Food).toBeUndefined();

    const mixedBad = unitCost(cart, 'Italians', 4, [
      {
        id: 9999,
        en: 'BadMixed',
        zh: '非法混合',
        effects: [
          { res: 33, op: 'set', v: 99 },
          { a: 100, op: 'div', v: 2, t: [128] },
        ],
      },
    ]);
    expect(mixedBad.cost).toEqual(cart.cost);
    expect(mixedBad.appliedTechs).toEqual([]);
    expect(mixedBad.undecoded).toHaveLength(2);
  });

  it('非正向 add 遇不存在资源键不造 0 键，正向 add 正常写入', () => {
    const base = { id: 1, cost: { Wood: 50 } };
    const neg = unitCost(base, 'Franks', 4, [{ id: 1, en: 'Neg', zh: '负加', effects: [{ a: 105, op: 'add', v: -20, t: [1] }] }]);
    expect(neg.cost).toEqual({ Wood: 50 });
    expect(neg.cost.Gold).toBeUndefined();
    const pos = unitCost(base, 'Franks', 4, [{ id: 2, en: 'Pos', zh: '正加', effects: [{ a: 105, op: 'add', v: 15, t: [1] }] }]);
    expect(pos.cost).toEqual({ Wood: 50, Gold: 15 });
  });
});

describe('模拟器有效训练/建造价（全部 11 项费用科技与 5 种视图态）', () => {
  it.each([
    ['Franks', 2701, 1496, 4, { Wood: 40, Gold: 39 }],
    ['Persians', 24, 488, 4, { Wood: 50, Gold: 0 }],
    ['Magyars', 869, 514, 4, { Food: 80, Gold: 0 }],
    ['Malay', 74, 625, 4, { Food: 70, Gold: 0 }],
    ['Poles', 38, 782, 4, { Food: 60, Gold: 30 }],
    ['Gurjaras', 330, 835, 4, { Food: 41, Gold: 60 }],
    ['Bohemians', 125, 785, 4, { Food: 100, Gold: 0 }],
    ['Italians', 128, 499, 4, { Wood: 50, Gold: 25 }],
  ] as const)('单位费用科技 %s %d + %d 走统一 unitCost 链路', (civ, unitId, techId, age, expected) => {
    const u = CORE.unitById[unitId]!;
    const costTechs = applicableSimCostTechs(sim, u, civ);
    expect(costTechs.some((item) => item.tech.id === techId && item.supported && !item.partial)).toBe(true);
    expect(costTechBadgeMap(costTechs).get(techId)).toBe('cost');
    expect(presetCostTechIds(costTechs, 'all').has(techId)).toBe(true);

    const view = buildSimEffectiveCost(u, 'unit', civ, age, new Set([techId]), costTechs);
    expect(view.kind).toBe('changed');
    expect(view.cost).toEqual(expected);
    expect(view.appliedSources).toContain(CORE.techById[techId]!.zh);
    expect(view.undecodedTechNames).toEqual([]);
  });

  it('过滤零差额命中（瞿折罗 4/24 不误列 835），并在低时代保留高时代费用科技可见性', () => {
    expect(applicableSimCostTechs(sim, CORE.unitById[4]!, 'Gurjaras')).toEqual([]);
    expect(applicableSimCostTechs(sim, CORE.unitById[24]!, 'Gurjaras')).toEqual([]);

    // 封建民兵 74 在封建时代仍可看见帝王科技 625 强征兵役，但勾选仅在到达对应时代后生效。
    const militia = CORE.unitById[74]!;
    const malayTechs = applicableSimCostTechs(sim, militia, 'Malay');
    expect(malayTechs.some((item) => item.tech.id === 625)).toBe(true);
    const feudalView = buildSimEffectiveCost(militia, 'unit', 'Malay', 2, new Set([625]), malayTechs);
    expect(feudalView.kind).toBe('available');
    expect(feudalView.cost).toEqual(militia.cost);
  });

  it('文明被动折扣 + 373 造船匠叠加态（意大利渔船 13 / 高丽战船 21）完整拼接来源与提示', () => {
    const fishing = CORE.unitById[13]!;
    const itaTechs = applicableSimCostTechs(sim, fishing, 'Italians');
    expect(itaTechs.some((item) => item.tech.id === 373)).toBe(true);
    const itaPassive = buildSimEffectiveCost(fishing, 'unit', 'Italians', 4, new Set(), itaTechs);
    expect(itaPassive.kind).toBe('changed');
    expect(itaPassive.cost).toEqual({ Wood: 64 });
    expect(itaPassive.availableHint).toContain('造船匠');
    const itaStacked = buildSimEffectiveCost(fishing, 'unit', 'Italians', 4, new Set([373]), itaTechs);
    expect(itaStacked.cost).toEqual({ Wood: 51 });
    expect(itaStacked.availableHint).toBeNull();
    expect(itaStacked.appliedSources).toContain('造船匠');
    expect(itaStacked.appliedSources.some((line) => line.includes('意大利'))).toBe(true);

    const galley = CORE.unitById[21]!;
    const korTechs = applicableSimCostTechs(sim, galley, 'Koreans');
    const korPassive = buildSimEffectiveCost(galley, 'unit', 'Koreans', 4, new Set(), korTechs);
    expect(korPassive.cost).toEqual({ Wood: 72, Gold: 30 });
    expect(korPassive.availableHint).toContain('造船匠');
    const korStacked = buildSimEffectiveCost(galley, 'unit', 'Koreans', 4, new Set([373]), korTechs);
    expect(korStacked.cost).toEqual({ Wood: 57.5, Gold: 30 });
    expect(korStacked.appliedSources.length).toBeGreaterThanOrEqual(2);
    expect(korStacked.appliedSources).toContain('造船匠');
  });

  it('斯拉夫建筑 455 罗斯堡垒（82/79/234 走模拟合并，235/236 走领域层 unitCost 核验）', () => {
    const castle = CORE.buildingById[82]!;
    const castleTechs = applicableSimCostTechs(sim, castle, 'Slavs');
    expect(castleTechs.map((item) => item.tech.id)).toEqual([455]);
    const castleView = buildSimEffectiveCost(castle, 'building', 'Slavs', 4, new Set([455]), castleTechs);
    expect(castleView.kind).toBe('changed');
    expect(castleView.cost).toEqual({ Wood: 260, Stone: 390 });

    // 斯拉夫箭塔 79/234 原本不在 buildingSimTechs 的 b.techs 中，需靠 mergeSimCostTechs 补入 455。
    for (const id of [79, 234]) {
      const tower = CORE.buildingById[id]!;
      const costTechs = applicableSimCostTechs(sim, tower, 'Slavs');
      expect(costTechs.map((item) => item.tech.id)).toEqual([455]);
      const merged = mergeSimCostTechs(buildingSimTechs(sim, tower, 'Slavs'), costTechs);
      expect(merged.some((row) => row.t.id === 455)).toBe(true);
      const view = buildSimEffectiveCost(tower, 'building', 'Slavs', 4, new Set([455]), costTechs);
      expect(view.cost).toEqual({ Wood: 85, Stone: 75 });
    }

    // 斯拉夫科技树不含 235/236，直接在 unitCost 领域层核验 455 对二者的石木置换。
    expect(unitCost(CORE.buildingById[235]!, 'Slavs', 4, [techInput(455)]).cost).toEqual({ Wood: 85, Stone: 75 });
    expect(unitCost(CORE.buildingById[236]!, 'Slavs', 4, [techInput(455)]).cost).toEqual({ Wood: 50, Gold: 100, Stone: 75 });
  });

  it('覆盖全部 5 种视图态（含 1380 态 D 分支 2 与非法 op 态 D 分支 1 兜底）', () => {
    const bolas = CORE.unitById[2571]!;
    const mapucheTechs = applicableSimCostTechs(sim, bolas, 'Mapuche');
    expect(mapucheTechs).toHaveLength(1);
    expect(mapucheTechs[0]!.partial).toBe(true);
    expect(costTechBadgeMap(mapucheTechs).get(1380)).toBe('partial');
    expect(presetCostTechIds(mapucheTechs, 'all').has(1380)).toBe(false);

    const avail = buildSimEffectiveCost(bolas, 'unit', 'Mapuche', 4, new Set(), mapucheTechs);
    expect(avail.kind).toBe('available');
    expect(avail.availablePartialOnly).toBe(true);

    const partialChanged = buildSimEffectiveCost(bolas, 'unit', 'Mapuche', 4, new Set([1380]), mapucheTechs);
    expect(partialChanged.kind).toBe('changed-with-undecoded');
    expect(partialChanged.cost).toEqual({ Wood: 42.5, Gold: 47 });
    expect(partialChanged.undecodedTechNames).toEqual(['布图马普']);

    const knight = CORE.unitById[38]!;
    const plain = buildSimEffectiveCost(knight, 'unit', 'Franks', 4, new Set(), applicableSimCostTechs(sim, knight, 'Franks'));
    expect(plain.kind).toBe('plain');

    // 非法 op 兜底为 undecoded-only（态 D 分支 1）
    const hand = CORE.unitById[5]!;
    const wagonburg = CORE.techById[784]!;
    const prev = DAT.techs[wagonburg.en];
    DAT.techs[wagonburg.en] = { id: wagonburg.id, combat: false, rules: [], eco: [{ a: 103, op: 'div', v: 2, t: [5] }] };
    try {
      const techs = applicableSimCostTechs(sim, hand, 'Bohemians');
      expect(costTechBadgeMap(techs).get(wagonburg.id)).toBe('undecoded');
      const undecodedOnly = buildSimEffectiveCost(hand, 'unit', 'Bohemians', 4, new Set([wagonburg.id]), techs);
      expect(undecodedOnly.kind).toBe('undecoded-only');
      expect(undecodedOnly.cost).toEqual(hand.cost);
      expect(undecodedOnly.undecodedTechNames).toEqual([wagonburg.zh]);
    } finally {
      if (prev) DAT.techs[wagonburg.en] = prev;
      else delete DAT.techs[wagonburg.en];
    }
  });
});

describe('建筑详情文明被动折后造价（buildingDiscountView）', () => {
  it('parseBuildingDiscountAge 仅接受 1-4 且钳位到目录时代', () => {
    expect(parseBuildingDiscountAge(3, null)).toBe(3);
    expect(parseBuildingDiscountAge(3, '1')).toBe(3);
    expect(parseBuildingDiscountAge(3, '4')).toBe(4);
    expect(parseBuildingDiscountAge(1, 'bad')).toBe(1);
    expect(parseBuildingDiscountAge(1, '9')).toBe(1);
  });

  it('法兰克城堡与不列颠城镇中心跨时代可变，亚美尼亚/马里恒定，无折扣返回 omit', () => {
    const castle = CORE.buildingById[82]!;
    const frCastle = buildingDiscountView(castle, 'Franks', null);
    expect(frCastle.kind).toBe('price');
    if (frCastle.kind === 'price') {
      expect(frCastle.variesByAge).toBe(true);
      expect(frCastle.ages).toEqual([3, 4]);
      expect(frCastle.selectedAge).toBe(3);
      expect(frCastle.cost).toEqual({ Stone: 552.5, Wood: 0 });
    }
    const frImp = buildingDiscountView(castle, 'Franks', '4');
    expect(frImp.kind).toBe('price');
    if (frImp.kind === 'price') {
      expect(frImp.selectedAge).toBe(4);
      expect(frImp.cost).toEqual({ Stone: 487.5, Wood: 0 });
      expect(frImp.deltas).toEqual([{ res: 'Stone', before: 650, after: 487.5, delta: -162.5, pct: 25 }]);
    }

    const tc = CORE.buildingById[109]!;
    const britDark = buildingDiscountView(tc, 'Britons', null);
    expect(britDark.kind).toBe('price');
    if (britDark.kind === 'price') {
      expect(britDark.variesByAge).toBe(true);
      expect(britDark.ages).toEqual([1, 2, 3, 4]);
      expect(britDark.selectedAge).toBe(1);
      expect(britDark.activeAtSelectedAge).toBe(false);
      expect(britDark.firstDiscountAge).toBe(3);
    }
    const britCastle = buildingDiscountView(tc, 'Britons', '3');
    expect(britCastle.kind).toBe('price');
    if (britCastle.kind === 'price') {
      expect(britCastle.activeAtSelectedAge).toBe(true);
      expect(britCastle.cost).toEqual({ Wood: 137.5, Stone: 100 });
    }

    const muleCart = CORE.buildingById[1808]!;
    const arm = buildingDiscountView(muleCart, 'Armenians', null);
    expect(arm.kind).toBe('price');
    if (arm.kind === 'price') {
      expect(arm.variesByAge).toBe(false);
      expect(arm.cost).toEqual({ Food: 15, Wood: 60 });
    }

    expect(buildingDiscountView(castle, null, null)).toEqual({ kind: 'omit' });
    expect(buildingDiscountView(castle, 'Britons', '4')).toEqual({ kind: 'omit' });
  });
});

describe('下游 partial 闭环（混编 PK、单兵交接、训练总价与 PK 卡头）', () => {
  it('混编 PK 合并保留 partial=true 且自动预设跳过 1380，计算训练费用交接成功；手选仍保守拦截', () => {
    const input = {
      civ: 'Mapuche',
      age: '4',
      team: [] as string[],
      techs: [] as string[],
      rows: [{ uid: '2569', qty: '5' }],
    };
    const view = resolveMixedSide(sim, CORE, input, 'a');
    const butalmapu = view.techs.find((item) => item.t.id === 1380);
    expect(butalmapu).toBeDefined();
    expect(butalmapu?.cost).toBe(false);
    expect(butalmapu?.partial).toBe(true);

    // 模拟点击「满科技」预设：跳过 partial (1380)
    const presetTechs = view.techs.filter((t) => (t.numeric || (t.cost && !t.partial)) && t.t.age <= 4).map((t) => String(t.t.id));
    expect(presetTechs).not.toContain('1380');
    const presetInput = { ...input, techs: presetTechs };
    const plan = mixedTrainingTransfer(prodCtx, presetInput, 'a', resolveMixedSide(sim, CORE, presetInput, 'a'));
    expect(plan).toHaveProperty('to');

    // 手动勾选 1380 仍由 mixedTrainingTransfer fail-closed 拦截
    const manualInput = { ...input, techs: ['1380'] };
    const blocked = mixedTrainingTransfer(prodCtx, manualInput, 'a', resolveMixedSide(sim, CORE, manualInput, 'a'));
    expect(blocked).toMatchObject({ errors: [{ field: 'mix-a-techs', message: expect.stringContaining('布图马普') }] });
  });

  it('单兵 PK 到训练总价交接：满科技不带入 1380，手选 1380 可正常带入', () => {
    const bolas = CORE.unitById[2569]!;
    const full = duelToTrainTotal(prodCtx, { side: 'a', unit: bolas, civ: 'Mapuche', age: 4, count: 10, techs: 'f' });
    expect(full.config.techs).not.toContain(1380);

    const manual = duelToTrainTotal(prodCtx, { side: 'a', unit: bolas, civ: 'Mapuche', age: 4, count: 10, techs: [1380], selected: new Set([1380]) });
    expect(manual.config.techs).toContain(1380);
  });

  it('训练总价感知 partial：2569 与 93/2566 科技栏与行说明均无自相矛盾且保持 incomplete=true', () => {
    const onBolas = evaluateTrainTotal(prodCtx, {
      civ: 'Mapuche',
      age: 4,
      ageRaw: null,
      techs: [1380],
      rows: [{ unit: 2569, qty: '2' }],
    });
    expect(onBolas.incomplete).toBe(true);
    expect(onBolas.lines[0]?.cost).toEqual({ Wood: 42.5, Gold: 47 });
    const bolasNotes = onBolas.lines[0]?.notes.join('\n') ?? '';
    expect(bolasNotes).toContain('已按可解码条目计入：布图马普');
    expect(bolasNotes).not.toContain('单价未改');
    const bolasChoice = onBolas.techs.find((t) => t.id === 1380);
    expect(bolasChoice?.partial).toBe(true);
    expect(bolasChoice?.hint).toContain('已按可解码条目计入至少一行，另含未解码效果');

    const onOther = evaluateTrainTotal(prodCtx, {
      civ: 'Mapuche',
      age: 4,
      ageRaw: null,
      techs: [1380],
      rows: [
        { unit: 93, qty: '1' },
        { unit: 2566, qty: '1' },
      ],
    });
    expect(onOther.incomplete).toBe(true);
    for (const line of onOther.lines) {
      expect(line.notes.join('\n')).toContain('布图马普含未解码资源或条件效果，对本单位未改单价，结果仅为估算。');
    }
    const otherChoice = onOther.techs.find((t) => t.id === 1380);
    expect(otherChoice?.hint).toContain('可解码费用条目未作用到当前已计入的单位，另含未解码效果');
  });

  it('单位 PK 卡头常显行与模拟 avail 一致呈现 partial 边界', () => {
    const resolved = resolve(sim, CORE.unitById, { uid: 2571, civ: 'Mapuche', age: 4, techs: [1380], team: [] }, 2571);
    expect(isUnavail(resolved)).toBe(false);
    if (isUnavail(resolved)) return;
    expect(resolved.training.price.cost).toEqual({ Wood: 42.5, Gold: 47 });
    const view = trainingLines(resolved.training, resolved.sel);
    expect(view.lines[0]).toMatchObject({ kind: 'applied', partial: true });
    expect(view.lines[0]?.text).toContain('另含未解码效果，当前价格非完整最终价');
    expect(simTechs(sim, CORE.unitById[2571]!, 'Mapuche').some((row) => row.t.id === 1380)).toBe(true);
  });

  it('trainTotal 跨单位合并费用科技候选保守保留 partial（不因后单位无 partial 而洗白）', () => {
    const tech = CORE.techById[1380]!;
    const a = mergeTrainTotalCostTech({ tech, supported: true, partial: true }, { tech, supported: true });
    expect(a).toEqual({ tech, supported: true, partial: true });

    const b = mergeTrainTotalCostTech({ tech, supported: true }, { tech, supported: true, partial: true });
    expect(b).toEqual({ tech, supported: true, partial: true });

    const c = mergeTrainTotalCostTech({ tech, supported: false }, { tech, supported: true, partial: true });
    expect(c).toEqual({ tech, supported: true, partial: true });

    const d = mergeTrainTotalCostTech({ tech, supported: true }, { tech, supported: true });
    expect(d).toEqual({ tech, supported: true });
    expect('partial' in d).toBe(false);

    const first = { tech, supported: true, partial: true };
    expect(mergeTrainTotalCostTech(undefined, first)).toBe(first);
  });
});

describe('低时代超龄科技提示与未解码文明折扣告警防漏（P1-2 / P2-2）', () => {
  it('马来民兵 74 封建时代传入 625：unselected 仍列出强征兵役并注明帝王时代起，空名防守绝不渲染空引号', () => {
    const militia = CORE.unitById[74]!;
    const malayTechs = applicableSimCostTechs(sim, militia, 'Malay');
    const feudalView = buildSimEffectiveCost(militia, 'unit', 'Malay', 2, new Set([625]), malayTechs);
    expect(feudalView.kind).toBe('available');
    expect(feudalView.availableTechNames).toEqual(['强征兵役']);
    expect(feudalView.availableRequiresAge).toBe(4);
    const feudalHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: feudalView }));
    expect(feudalHtml).toContain('勾选「强征兵役」（帝王时代起）后生效');
    expect(feudalHtml).not.toContain('「」');

    // 防守性渲染：即使外部误传空的 availableTechNames 也不渲染「」
    const emptyAvailView: SimEffectiveCostView = {
      ...feudalView,
      availableTechNames: [],
      availableRequiresAge: null,
    };
    const emptyAvailHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: emptyAvailView }));
    expect(emptyAvailHtml).toContain('（与目录一致）');
    expect(emptyAvailHtml).not.toContain('「」');
  });

  it('未解码文明折扣（含无 idx 回退标签）绝不被 plain/available 提前返回吞掉', () => {
    const knight = CORE.unitById[38]!;
    const knightTechs = applicableSimCostTechs(sim, knight, 'Franks');
    const prevTable = DAT.costDiscounts.Franks;
    try {
      // 注入 1 条无法与文案匹配的文明折扣（带 idx=0）
      DAT.costDiscounts.Franks = [
        ...(prevTable ?? []),
        {
          idx: 0,
          text: null,
          ok: false,
          techs: [99999],
          groups: [{ units: [38], res: ['Gold'], tiers: { '4': 0.77 } }],
        },
      ];
      const withIdxView = buildSimEffectiveCost(knight, 'unit', 'Franks', 4, new Set(), knightTechs);
      expect(withIdxView.kind).toBe('undecoded-only');
      expect(withIdxView.unsupportedDiscountLabels).toHaveLength(1);
      const withIdxHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: withIdxView }));
      expect(withIdxHtml).toContain('data-t="sim-effective-unsupported-discount"');
      expect(withIdxHtml).toContain('以下文明折扣暂未计入');

      // 注入无 idx（idx: null）的文明折扣：仍走兜底标签并渲染告警
      DAT.costDiscounts.Franks = [
        ...(prevTable ?? []),
        {
          idx: null,
          text: null,
          ok: false,
          techs: [99998],
          groups: [{ units: [38], res: ['Gold'], tiers: { '4': 0.77 } }],
        },
      ];
      const nullIdxView = buildSimEffectiveCost(knight, 'unit', 'Franks', 4, new Set(), knightTechs);
      expect(nullIdxView.kind).toBe('undecoded-only');
      expect(nullIdxView.unsupportedDiscountLabels).toEqual(['法兰克未解码文明折扣']);
      const nullIdxHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: nullIdxView }));
      expect(nullIdxHtml).toContain('以下文明折扣暂未计入：法兰克未解码文明折扣。');
    } finally {
      if (prevTable) DAT.costDiscounts.Franks = prevTable;
      else delete DAT.costDiscounts.Franks;
    }

    // 防守性渲染：即便外部手工构造 plain / available 视图附带 unsupportedDiscountLabels，组件也照常呈现告警
    const baseView: SimEffectiveCostView = {
      entityKind: 'unit',
      kind: 'plain',
      base: knight.cost,
      cost: knight.cost,
      deltas: [],
      appliedSources: [],
      availableTechNames: [],
      availableRequiresAge: null,
      availablePartialOnly: false,
      availableHint: null,
      undecodedTechNames: [],
      unsupportedDiscountLabels: ['测试文明折扣'],
    };
    const plainWarnHtml = renderToStaticMarkup(createElement(SimEffectiveCost, { view: baseView }));
    expect(plainWarnHtml).toContain('data-t="sim-effective-unsupported-discount"');
    expect(plainWarnHtml).toContain('以下文明折扣暂未计入：测试文明折扣。');

    const availWarnHtml = renderToStaticMarkup(
      createElement(SimEffectiveCost, {
        view: { ...baseView, kind: 'available', availableTechNames: ['测试科技'] },
      }),
    );
    expect(availWarnHtml).toContain('data-t="sim-effective-unsupported-discount"');
    expect(availWarnHtml).toContain('以下文明折扣暂未计入：测试文明折扣。');
  });
});
