import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import civs from '../../data/game/civs.json';
import eco from '../../data/game/eco.json';
import { loadCore, loadTrees } from '../../src/data';
import { litTreeIds } from '../../src/domain/availabilityAge';
import { discountedCost } from '../../src/domain/costDiscount';
import { groupFight } from '../../src/domain/duel';
import { productionTechs, type ProductionContext } from '../../src/domain/production';
import {
  countForTime,
  DEFAULT_MIN,
  DEFAULT_VILS,
  defaultGatherEcoTechIds,
  fmtClock,
  gatherModel,
  gatherUnsupportedSources,
  hasGatherAttrEffect,
  realCost,
  realCostOf,
} from '../../src/domain/realCost';
import { makeSimContext, type SimContext } from '../../src/domain/simulator';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { RealCostBlock } from '../../src/shared/ui/RealCost';

type Eff = { kind: string; attr?: string; target?: string; op?: string; v?: number };
const E = eco as unknown as {
  ecoTechs: Record<string, { effects: Eff[] }>;
  ecoTechDisabledCivs: Record<string, string[]>;
};

describe('Issue 1486 默认采集口径按文明科技树禁用与勃艮第提前时代过滤 + 波兰未计入去重', () => {
  let ctx: ProductionContext;
  let sim: SimContext;
  beforeAll(async () => {
    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
    ctx = { core, trees };
    sim = makeSimContext(core.techs, trees);
  });

  it('AC1：勃艮第 1–4 时代提前采集科技、单价用时与封建步弓/城堡弩手等采集时间胜负反转', () => {
    // 黑暗时代等同通用封建（计入 202/55/278/213）
    const bur1 = gatherModel(1, 'Burgundians');
    expect(bur1.rate).toEqual(gatherModel(2, '').rate);
    expect(bur1.rate.wood * 60).toBeCloseTo(22.44, 2);
    expect(bur1.rate.gold * 60).toBeCloseTo(21.24, 2);
    expect(bur1.rate.stone * 60).toBeCloseTo(20.32, 2);
    expect(gatherModel(2, 'Burgundians').rate).toEqual(gatherModel(3, '').rate);
    expect(gatherModel(3, 'Burgundians').rate).toEqual(gatherModel(4, '').rate);
    expect(gatherModel(4, 'Burgundians').rate).toEqual(gatherModel(4, '').rate);

    // 封建步弓手（4）：勃艮第 2:36 / 38 只 vs 不列颠 3:13 / 30 只 → 勃艮第胜
    const archer = ctx.core.unitById[4]!;
    const burArch = realCostOf(discountedCost(archer, 'Burgundians', 2), 2, 'Burgundians').rc;
    const briArch = realCostOf(discountedCost(archer, 'Britons', 2), 2, 'Britons').rc;
    expect(burArch.total).toBeCloseTo(156.84, 2);
    expect(fmtClock(burArch.per.Wood!)).toBe('0:52');
    expect(fmtClock(burArch.per.Gold!)).toBe('1:44');
    expect(fmtClock(burArch.total)).toBe('2:36');
    expect(countForTime(burArch.total, 10, 10)).toBe(38);
    expect(briArch.total).toBeCloseTo(193.99, 2);
    expect(fmtClock(briArch.total)).toBe('3:13');
    expect(countForTime(briArch.total, 10, 10)).toBe(30);

    const aFeudal = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Burgundians', age: 2, ageSet: true, techs: 'f', team: [] }, 4);
    const bFeudal = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Britons', age: 2, ageSet: true, techs: 'f', team: [] }, 4);
    if (isUnavail(aFeudal) || isUnavail(bFeudal)) throw new Error('Expected archers available');
    const feudalDuel = groupFight(aFeudal.F, 38, bFeudal.F, 30);
    if (feudalDuel.status === 'error') throw new Error(feudalDuel.reason);
    expect(feudalDuel.winner).toBe('a');
    expect(feudalDuel.aAlive).toBe(22);

    // 城堡弩手（24）：勃艮第 2:32 / 39 只 vs 法兰克 2:36 / 38 只 → 勃艮第胜
    const xbow = ctx.core.unitById[24]!;
    const burXbow = realCostOf(discountedCost(xbow, 'Burgundians', 3), 3, 'Burgundians').rc;
    const fraXbow = realCostOf(discountedCost(xbow, 'Franks', 3), 3, 'Franks').rc;
    expect(burXbow.total).toBeCloseTo(152.8, 2);
    expect(fmtClock(burXbow.per.Wood!)).toBe('0:48');
    expect(fmtClock(burXbow.per.Gold!)).toBe('1:44');
    expect(fmtClock(burXbow.total)).toBe('2:32');
    expect(countForTime(burXbow.total, 10, 10)).toBe(39);
    expect(fraXbow.total).toBeCloseTo(156.84, 2);
    expect(fmtClock(fraXbow.total)).toBe('2:36');
    expect(countForTime(fraXbow.total, 10, 10)).toBe(38);

    const aCastle = resolve(sim, ctx.core.unitById, { uid: 24, civ: 'Burgundians', age: 3, ageSet: true, techs: 'f', team: [] }, 24);
    const bCastle = resolve(sim, ctx.core.unitById, { uid: 24, civ: 'Franks', age: 3, ageSet: true, techs: 'f', team: [] }, 24);
    if (isUnavail(aCastle) || isUnavail(bCastle)) throw new Error('Expected xbows available');
    const castleDuel = groupFight(aCastle.F, 39, bCastle.F, 38);
    if (castleDuel.status === 'error') throw new Error(castleDuel.reason);
    expect(castleDuel.winner).toBe('a');
    expect(castleDuel.aAlive).toBe(7);

    // 单位详情 #/unit/4 默认城堡时代：勃艮第 2:32 vs 不列颠 2:36
    expect(fmtClock(realCost(archer.cost, gatherModel(3, 'Burgundians')).total)).toBe('2:32');
    expect(fmtClock(realCost(archer.cost, gatherModel(3, 'Britons')).total)).toBe('2:36');
  });

  it('AC2：缺双人锯/钻井采金法/钻井采石法代表文明精确速率与用时，空/未知/原型链文明兜底通用全科技', () => {
    // 条顿帝王游侠（569）：缺 182 采金 22.95/分、金 3:16、总 5:09（309.24s）、20 村 10 分派 38 只
    const paladin = ctx.core.unitById[569]!;
    const teuG4 = gatherModel(4, 'Teutons');
    expect(teuG4.rate.gold * 60).toBeCloseTo(22.95, 2);
    const teuPal = realCostOf(discountedCost(paladin, 'Teutons', 4), 4, 'Teutons').rc;
    const burPal = realCostOf(discountedCost(paladin, 'Burgundians', 4), 4, 'Burgundians').rc;
    expect(fmtClock(teuPal.per.Food!)).toBe('1:53');
    expect(fmtClock(teuPal.per.Gold!)).toBe('3:16');
    expect(teuPal.total).toBeCloseTo(309.24, 2);
    expect(fmtClock(teuPal.total)).toBe('5:09');
    expect(countForTime(teuPal.total, 20, 10)).toBe(38);
    expect(fmtClock(burPal.total)).toBe('4:46');
    expect(countForTime(burPal.total, 20, 10)).toBe(41);

    // 西班牙帝王火枪手（5）：缺 182 金 2:10、总 3:35（215.60s）、10 村 10 分派 27 只
    const hc = ctx.core.unitById[5]!;
    const spaHc = realCostOf(discountedCost(hc, 'Spanish', 4), 4, 'Spanish').rc;
    const burHc = realCostOf(discountedCost(hc, 'Burgundians', 4), 4, 'Burgundians').rc;
    expect(fmtClock(spaHc.per.Gold!)).toBe('2:10');
    expect(spaHc.total).toBeCloseTo(215.6, 2);
    expect(fmtClock(spaHc.total)).toBe('3:35');
    expect(countForTime(spaHc.total, 10, 10)).toBe(27);
    expect(fmtClock(burHc.total)).toBe('3:20');
    expect(countForTime(burHc.total, 10, 10)).toBe(29);

    // 波兰帝王劲弩手（492）：双缺 221 + 182，伐木 28.49/分、采金 22.95/分、木 0:52、金 1:57、总 2:50（170.28s）、派 35 只
    const arb = ctx.core.unitById[492]!;
    const polG4 = gatherModel(4, 'Poles');
    expect(polG4.rate.wood * 60).toBeCloseTo(28.49, 2);
    expect(polG4.rate.gold * 60).toBeCloseTo(22.95, 2);
    const polArb = realCostOf(discountedCost(arb, 'Poles', 4), 4, 'Poles').rc;
    const chiArb = realCostOf(discountedCost(arb, 'Chinese', 4), 4, 'Chinese').rc;
    expect(fmtClock(polArb.per.Wood!)).toBe('0:52');
    expect(fmtClock(polArb.per.Gold!)).toBe('1:57');
    expect(polArb.total).toBeCloseTo(170.28, 2);
    expect(fmtClock(polArb.total)).toBe('2:50');
    expect(countForTime(polArb.total, 10, 10)).toBe(35);
    expect(fmtClock(chiArb.total)).toBe('2:32');
    expect(countForTime(chiArb.total, 10, 10)).toBe(39);

    // 缺 279 钻井采石法（法兰克、不列颠）：城堡/帝王采石 21.89/分 vs 勃艮第 24.73/分
    for (const age of [3, 4]) {
      expect(gatherModel(age, 'Franks').rate.stone * 60).toBeCloseTo(21.89, 2);
      expect(gatherModel(age, 'Britons').rate.stone * 60).toBeCloseTo(21.89, 2);
      expect(gatherModel(age, 'Burgundians').rate.stone * 60).toBeCloseTo(24.73, 2);
    }

    // 空文明、未知文明与原型链键保持通用全科技兜底
    for (const age of [1, 2, 3, 4]) {
      const generic = gatherModel(age, '');
      for (const unknown of ['NoSuchCiv', 'constructor', '__proto__', 'toString']) {
        expect(gatherModel(age, unknown).rate, `${unknown}@${age}`).toEqual(generic.rate);
      }
    }
  });

  it('AC3：波兰 unsupported 合并去重为 2 行且无重复 label，RealCostBlock 仅渲染 1 行大庄园提示', () => {
    const pol = gatherModel(4, 'Poles');
    expect(pol.unsupported).toHaveLength(2);
    expect(pol.unsupported.map((x) => x.label)).toEqual(['波兰庄园农田加成', '波兰采石换金']);
    expect(new Set(pol.unsupported.map((x) => x.label)).size).toBe(pol.unsupported.length);
    const raw = gatherUnsupportedSources(4, 'Poles');
    expect(raw.map((x) => x.key)).toEqual(['res:237', 'res:238', 'res:239', 'res:241']);
    const expectedFolwarkTechs = [...new Set(raw.filter((x) => x.label === '波兰庄园农田加成').flatMap((x) => x.techs))];
    expect(pol.unsupported[0]!.techs).toEqual(expectedFolwarkTechs);

    const arb = ctx.core.unitById[492]!;
    const html = renderToStaticMarkup(
      createElement(RealCostBlock, {
        k: 'b',
        civ: 'Poles',
        civZh: '波兰',
        age: 4,
        d: discountedCost(arb, 'Poles', 4),
        vils: DEFAULT_VILS,
        min: DEFAULT_MIN,
      }),
    );
    const renderedRows = [...html.matchAll(/data-t="rc-unsupported">.*?<span title="([^"]*)">([^<]*)<\/span>/g)].map((m) => m[2]);
    expect(renderedRows).toEqual(['未计入：波兰 波兰庄园农田加成（大庄园替代磨坊，未建模）', '未计入：波兰 波兰采石换金（石矿工兼产黄金，未建模）']);
  });

  it('AC4：全站 56 文明 × 11 项采集 ecoTechs 禁用表与 trees.json 100% 一致，且 56 文明 × 4 时代默认科技集与速率等价于 productionTechs', () => {
    const disabledMap = E.ecoTechDisabledCivs;
    const gatherEcoIds = Object.entries(E.ecoTechs)
      .filter(([, rec]) => hasGatherAttrEffect(rec.effects))
      .map(([id]) => Number(id))
      .sort((a, b) => a - b);
    expect(gatherEcoIds).toEqual([13, 14, 55, 182, 202, 203, 213, 221, 249, 278, 279]);
    expect(
      Object.keys(disabledMap)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(gatherEcoIds);

    // 1. 核对 ecoTechDisabledCivs 与 trees.json 全站 56 文明 × 11 项采集科技 100% 一致
    for (const tid of gatherEcoIds) {
      const fromTrees = civs
        .filter((c) => !litTreeIds(ctx.trees, c.en, 't').has(tid))
        .map((c) => c.en)
        .sort();
      expect(disabledMap[String(tid)], `ecoTech ${tid}`).toEqual(fromTrees);
    }
    expect(disabledMap['221']).toHaveLength(20);
    expect(disabledMap['182']).toHaveLength(13);
    expect(disabledMap['279']).toHaveLength(19);
    expect(disabledMap['13']).toEqual(['Khitans']);
    expect(disabledMap['14']).toEqual(['Khitans']);
    expect(new Set([...disabledMap['221']!, ...disabledMap['182']!, ...disabledMap['279']!]).size).toBe(45);

    // 2. 全站 56 文明 × 4 时代：默认启用采集科技集 === productionTechs 对应采集科技集，且采集速率 bit-for-bit 一致
    const gatherEcoIdSet = new Set(gatherEcoIds);
    for (const c of civs) {
      const lit = litTreeIds(ctx.trees, c.en, 't');
      for (const age of [1, 2, 3, 4]) {
        const expectedIds = new Set(
          productionTechs(ctx, { civ: c.en, age })
            .map((t) => t.id)
            .filter((id) => gatherEcoIdSet.has(id)),
        );
        const actualIds = defaultGatherEcoTechIds(age, c.en);
        expect(
          [...actualIds].sort((a, b) => a - b),
          `${c.en}@${age} techIds`,
        ).toEqual([...expectedIds].sort((a, b) => a - b));
        expect(gatherModel(age, c.en).rate, `${c.en}@${age} rate`).toEqual(gatherModel(age, c.en, { techIds: expectedIds, availableTechIds: lit }).rate);
      }
    }
  });
});
