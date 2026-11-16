import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { countForBudget } from '../../src/domain/duel';
import { DAT } from '../../src/domain/datEffects';
import { applicableTrainingTechs, quoteTraining } from '../../src/domain/duelTrainingCost';
import { unitCost } from '../../src/domain/unitCost';
import { presetUpTo, simulate } from '../../src/domain/simulator';
import * as unitCostModule from '../../src/domain/unitCost';
import * as simulatorModule from '../../src/domain/simulator';
import { contextSearchAfterCanon } from '../../src/features/duel/logic/duelContext';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { DUEL_COST_MODEL, trainingLines } from '../../src/features/duel/logic/trainingCostView';
import type { Trees } from '../../src/domain/types';
import { ctx, techs, unit, units } from './helpers';

const byId = Object.fromEntries(units.map((item) => [item.id, item]));
const techByEn = (en: string) => techs.find((item) => item.en === en)!;
const side = (uid: number, civ: string, age: number, selected: 'f' | 'c' | number[]) => {
  const resolved = resolve(ctx, byId, { uid, civ, age, techs: selected, team: [] }, uid);
  if (isUnavail(resolved)) throw new Error(`${civ} ${uid} unavailable`);
  return resolved;
};
const earlyBohemian = { uid: 5, civ: 'Bohemians', age: 3, ageSet: true, techs: [], team: [] };

function withHandCannoneerTreeRow(change: (cell: unknown[]) => void) {
  const trees = structuredClone(ctx.trees);
  const treeMap = (trees as unknown as { t: Record<string, unknown[]> }).t;
  const blocks = treeMap.Bohemians!;
  const block = blocks.find(
    (value) => Array.isArray(value) && Array.isArray(value[3]) && value[3].some((cell) => Array.isArray(cell) && cell[2] === 'u' && cell[3] === 5),
  );
  if (!Array.isArray(block) || !Array.isArray(block[3])) throw new Error('Bohemian Hand Cannoneer tree row missing');
  const cell = block[3].find((value) => Array.isArray(value) && value[2] === 'u' && value[3] === 5);
  if (!Array.isArray(cell)) throw new Error('Bohemian Hand Cannoneer tree row missing');
  change(cell);
  return { ...ctx, trees: trees as Trees };
}

describe('#943 单位 PK 训练价', () => {
  const kamandaran = techByEn('Kamandaran');
  const butalmapu = techByEn('Butalmapu');
  const crossbow = unit('Crossbowman');
  const archer = unit('Archer');
  const savar = unit('Savar');
  const cavalryArcher = unit('Cavalry Archer');
  const bolas = unit('Bolas Rider');

  it('满科技的波斯弩手套用已支持费用科技，萨瓦尔与骑射手不套', () => {
    const bow = side(crossbow.id, 'Persians', 4, 'f');
    expect(bow.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    expect(bow.training.before).toMatchObject({ Wood: 25, Gold: 45 });
    expect(bow.F.cost).toEqual(bow.training.price.cost);
    expect(bow.sel.has(kamandaran.id)).toBe(true);
    expect(bow.training.price.appliedTechs.map((item) => item.id)).toContain(kamandaran.id);
    expect(bow.training.price.cost.Food).toBeUndefined();

    const foot = side(archer.id, 'Persians', 4, 'f');
    expect(foot.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    expect(foot.sel.has(kamandaran.id)).toBe(true);

    const feudal = side(archer.id, 'Persians', 2, 'f');
    expect(feudal.sel.has(kamandaran.id)).toBe(false);
    expect(feudal.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });

    const horse = side(savar.id, 'Persians', 4, 'f');
    expect(horse.training.costs).toEqual([]);
    expect(horse.sel.has(kamandaran.id)).toBe(false);
    expect(horse.training.price.cost).toEqual({ Food: 60, Gold: 75 });

    const mounted = side(cavalryArcher.id, 'Persians', 4, 'f');
    expect(mounted.training.costs.some((item) => item.tech.id === kamandaran.id)).toBe(false);
    expect(mounted.training.price.cost).toMatchObject({ Wood: 40, Gold: 60 });
  });

  it('显式 id 可计入或撤销，非波斯误选不改价；战斗属性不因费用科技改变', () => {
    const priced = side(crossbow.id, 'Persians', 4, [kamandaran.id]);
    expect(priced.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    const combatOnly = presetUpTo(priced.avail, 4);
    expect(combatOnly.has(kamandaran.id)).toBe(false);
    const revoked = side(crossbow.id, 'Persians', 4, [...combatOnly]);
    expect(revoked.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });
    expect(trainingLines(revoked.training, revoked.sel).lines.map((line) => line.text)).toContain('可计入未勾选：波斯步弓手');

    const foreign = side(crossbow.id, 'Britons', 4, [kamandaran.id]);
    expect(foreign.sel.has(kamandaran.id)).toBe(false);
    expect(foreign.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });

    const full = side(crossbow.id, 'Persians', 4, 'f');
    const combat = simulate(ctx, crossbow, 'Persians', 4, combatOnly, new Set());
    expect(full.S.hp).toBe(combat.hp);
    expect(full.S.atk).toBe(combat.atk);
    expect(full.S.ma).toBe(combat.ma);
    expect(full.S.pa).toBe(combat.pa);
    expect(full.S.rof).toBe(combat.rof);
    expect(full.S.rng).toBe(combat.rng);
  });

  it('默认预算按当时单价下取整，研究费用不进入单价', () => {
    const savarSide = side(savar.id, 'Persians', 4, 'f');
    const withTech = side(crossbow.id, 'Persians', 4, 'f');
    const without = side(crossbow.id, 'Persians', 4, []);
    expect(countForBudget(savarSide.training.price.cost, 3000)).toBe(22);
    expect(countForBudget(withTech.training.price.cost, 3000)).toBe(60);
    expect(countForBudget(without.training.price.cost, 3000)).toBe(42);
    expect(countForBudget(withTech.training.price.cost, 1000)).toBe(20);
  });

  it('布图马普满科技默认未选，手选只记录且价格不变', () => {
    const costs = applicableTrainingTechs(ctx, bolas, 'Mapuche', 4);
    const item = costs.find((row) => row.tech.id === butalmapu.id);
    expect(item?.supported).toBe(false);
    const full = side(bolas.id, 'Mapuche', 4, 'f');
    expect(full.sel.has(butalmapu.id)).toBe(false);
    expect(full.training.price.cost).toEqual({ Wood: 50, Gold: 55 });
    const off = trainingLines(full.training, full.sel).lines.find((line) => line.id === butalmapu.id);
    expect(off).toMatchObject({
      state: 'off',
      text: '未计入：布图马普，本站尚不支持，当前价格不是完整效果后的最终价',
    });

    const recorded = side(bolas.id, 'Mapuche', 4, [butalmapu.id]);
    expect(recorded.training.price.cost).toEqual(full.training.price.cost);
    expect(trainingLines(recorded.training, recorded.sel).lines.find((line) => line.id === butalmapu.id)?.state).toBe('recorded');
    const note = trainingLines(full.training, full.sel).notes.find((line) => line.includes('布图马普'));
    expect(note).toContain('满科技不会自动勾选');
    expect(note).toContain('未选择不等于已研究');
    expect(note).toContain(`${butalmapu.cost.Food} 食物`);
    expect(note).toContain(`${butalmapu.rt} 秒`);
  });

  it('已计入短句和一次研究说明来自数据，页脚不再写旧句', () => {
    const full = side(crossbow.id, 'Persians', 4, 'f');
    const view = trainingLines(full.training, full.sel);
    expect(view.lines.find((line) => line.id === kamandaran.id)?.text).toBe('已计入：波斯步弓手（木材 +25，黄金 −45）');
    expect(view.notes.find((line) => line.startsWith('一次研究：波斯步弓手'))).toBe(
      `一次研究：波斯步弓手 ${kamandaran.cost.Food} 食物 ${kamandaran.cost.Gold} 黄金，${kamandaran.rt} 秒。这笔费用不摊进每名训练价，也不从派出预算里扣除。`,
    );
    expect(DUEL_COST_MODEL).not.toContain('需研究的科技折扣不计入');
    expect(DUEL_COST_MODEL).toContain('一次研究费用不摊进每名训练价，也不从派出预算里扣除。');
    const page = readFileSync('src/features/duel/components/Duel.tsx', 'utf8');
    const upgrade = readFileSync('src/features/duel/components/UpgradeComparison.tsx', 'utf8');
    expect(page).not.toContain('需研究的科技折扣不计入');
    expect(page).not.toContain('属性示意');
    expect(page).not.toContain('战斗结果待实现计算');
    expect(upgrade).toContain('单位训练费用（基础价）');
    expect(upgrade).not.toContain('已选科技后');
  });

  it('适用费用科技按运行时效果收集，报价与 unitCost 相同', () => {
    const found = applicableTrainingTechs(ctx, crossbow, 'Persians', 4).filter((item) => item.supported);
    expect(found.length).toBeGreaterThan(0);
    const quote = quoteTraining(crossbow, 'Persians', 4, new Set(found.map((item) => item.tech.id)), found);
    const direct = unitCost(
      crossbow,
      'Persians',
      4,
      found.map((item) => ({ id: item.tech.id, en: item.tech.en, zh: item.tech.zh })),
    );
    expect(quote.price.cost).toEqual(direct.cost);
    expect(quote.price.appliedTechs.map((item) => item.id)).toEqual(direct.appliedTechs.map((item) => item.id));
  });

  it('规范化写回后语境链读已写入的查询串', () => {
    expect(contextSearchAfterCanon('a=1', 'a=1', 'a=2')).toBe('a=2');
    expect(contextSearchAfterCanon('a=2', 'a=2', 'a=2')).toBeNull();
    expect(contextSearchAfterCanon('a=1', 'a=9', 'a=9')).toBe('a=9');
  });

  it('仅对真实合法的显式提前时代 Duel 输入保留单位价格档位', () => {
    const franks = resolve(ctx, byId, { uid: 93, civ: 'Franks', age: 3, ageSet: true, techs: [], team: [] }, 93);
    const early = resolve(ctx, byId, { uid: 5, civ: 'Bohemians', age: 3, ageSet: true, techs: [], team: [] }, 5);
    expect(isUnavail(franks)).toBe(false);
    if (isUnavail(franks)) throw new Error('Franks Spearman should be available in Castle Age');
    expect(franks.age).toBe(3);
    expect(franks.earlyAgeMarker).toBeUndefined();
    expect(isUnavail(early)).toBe(false);
    if (isUnavail(early)) throw new Error('Bohemian Hand Cannoneer should be available in Castle Age');
    expect(early.age).toBe(3);
    expect(early.earlyAgeMarker).toEqual({ unitId: 5, civ: 'Bohemians', age: 3 });
    expect(early.S).toEqual(simulate(ctx, byId[5]!, 'Bohemians', 3, early.sel, new Set()));

    const source = byId[5]!;
    const directEarly = unitCost(source, 'Bohemians', 3);
    const directCatalogue = unitCost(source, 'Bohemians', 4);
    const earlyCosts = applicableTrainingTechs(ctx, source, 'Bohemians', 3, early.earlyAgeMarker);
    const earlyQuote = quoteTraining(source, 'Bohemians', 3, new Set(), earlyCosts, new Set(), early.earlyAgeMarker);
    expect(early.training.costs).toEqual(earlyCosts);
    expect(early.training.price.discount.age).toBe(3);
    expect(early.training.price.cost).toEqual(directEarly.cost);
    expect(early.training.before).toEqual(directEarly.cost);
    expect(early.training.deltas).toEqual([]);
    expect(early.F.cost).toEqual(early.training.price.cost);
    expect(earlyQuote.price.discount.age).toBe(3);
    expect(earlyQuote.before).toEqual(directEarly.cost);

    const fallback = resolve(ctx, byId, { uid: 999_999, civ: 'Bohemians', age: 3, ageSet: true, techs: [], team: [] }, 5);
    expect(isUnavail(fallback)).toBe(false);
    if (isUnavail(fallback)) throw new Error('fallback unit should remain available');
    expect(fallback.earlyAgeMarker).toBeUndefined();
    expect(fallback.age).toBe(4);

    const noMarkerCosts = applicableTrainingTechs(ctx, source, 'Bohemians', 3);
    const noMarker = quoteTraining(source, 'Bohemians', 3, new Set(), noMarkerCosts, new Set());
    expect(noMarker.price.discount.age).toBe(4);
    expect(noMarker.price.cost).toEqual(directCatalogue.cost);
    expect(noMarker.before).toEqual(directCatalogue.cost);

    const badMarker = { unitId: 5, civ: 'Bohemians', age: 2 };
    const mismatched = quoteTraining(source, 'Bohemians', 3, new Set(), noMarkerCosts, new Set(), badMarker);
    expect(mismatched.price.discount.age).toBe(4);
    expect(mismatched.price.cost).toEqual(directCatalogue.cost);
  });

  it('提前时代验证拒绝不可用、隐式、回退或结构损坏的输入', () => {
    const noMarker = (state: ReturnType<typeof resolve>) => ('earlyAgeMarker' in state ? state.earlyAgeMarker : undefined);
    const resolveEarly = (spec: Partial<typeof earlyBohemian> = {}, context = ctx) => resolve(context, byId, { ...earlyBohemian, ...spec }, 5);

    expect(noMarker(resolveEarly({ age: 2 }))).toBeUndefined();
    expect(noMarker(resolveEarly({ ageSet: false }))).toBeUndefined();
    expect(noMarker(resolveEarly({ age: 3.5 }))).toBeUndefined();
    expect(noMarker(resolveEarly({ age: 0 }))).toBeUndefined();
    expect(noMarker(resolveEarly({ age: 5 }))).toBeUndefined();
    expect(noMarker(resolveEarly({ age: 4 }))).toBeUndefined();
    expect(noMarker(resolveEarly({ civ: 'UnknownCiv' }))).toBeUndefined();

    const mismatchedCiv = resolveEarly({ civ: 'Britons' });
    expect(isUnavail(mismatchedCiv)).toBe(true);

    const fallback = resolve(ctx, byId, { ...earlyBohemian, uid: 999_999 }, 5);
    expect(noMarker(fallback)).toBeUndefined();

    const disabledTree = withHandCannoneerTreeRow((cell) => (cell[4] = 0));
    expect(noMarker(resolveEarly({}, disabledTree))).toBeUndefined();

    const missingTree = { ...ctx.trees, t: { ...ctx.trees.t, Bohemians: undefined } } as unknown as Trees;
    expect(noMarker(resolveEarly({}, { ...ctx, trees: missingTree }))).toBeUndefined();

    const stringAgeTree = withHandCannoneerTreeRow((cell) => (cell[0] = '5'));
    expect(noMarker(resolveEarly({}, stringAgeTree))).toBeUndefined();
    const nullAgeTree = withHandCannoneerTreeRow((cell) => (cell[0] = null));
    expect(noMarker(resolveEarly({}, nullAgeTree))).toBeUndefined();

    expect(noMarker(resolveEarly())).toEqual({ unitId: 5, civ: 'Bohemians', age: 3 });
  });

  it('只接受与费用输入完全匹配的内部训练时代 marker', () => {
    const source = byId[5]!;
    const markers = [
      undefined,
      { unitId: 93, civ: 'Bohemians', age: 3 },
      { unitId: 5, civ: 'Franks', age: 3 },
      { unitId: 5, civ: 'Bohemians', age: 2 },
      { unitId: 5, civ: 'Bohemians', age: 3.5 },
      { unitId: 5, civ: 'Bohemians', age: 0 },
      { unitId: 5, civ: 'Bohemians', age: 5 },
      { unitId: 5, civ: 'Bohemians', age: 4 },
    ];
    for (const marker of markers) {
      const quote = quoteTraining(source, 'Bohemians', 3, new Set(), [], undefined, marker);
      expect(quote.price.discount.age).toBe(4);
    }
  });

  it('提前时代通过实际训练费用探测、before/delta/F.cost 和 simulate 参数', () => {
    const source = byId[5]!;
    const wagonburg = techByEn('Wagenburg Tactics');
    const previousDatTech = DAT.techs[wagonburg.en];
    DAT.techs[wagonburg.en] = {
      id: wagonburg.id,
      combat: false,
      rules: [],
      eco: [{ a: 103, op: 'mul', v: 0.5, t: [source.id] }],
    };
    const unitCostSpy = vi.spyOn(unitCostModule, 'unitCost');
    const simulateSpy = vi.spyOn(simulatorModule, 'simulate');
    try {
      const resolved = resolve(ctx, byId, { ...earlyBohemian, techs: [wagonburg.id] }, 5);
      expect(isUnavail(resolved)).toBe(false);
      if (isUnavail(resolved)) throw new Error('Bohemian Hand Cannoneer should be available in Castle Age');

      expect(resolved.earlyAgeMarker).toEqual({ unitId: source.id, civ: 'Bohemians', age: 3 });
      expect(resolved.age).toBe(3);
      expect(resolved.training.costs).toContainEqual({ tech: wagonburg, supported: true });
      expect(resolved.sel.has(wagonburg.id)).toBe(true);
      expect(
        unitCostSpy.mock.calls.some(
          ([unitInput, civ, age, applied]) =>
            unitInput.id === source.id && civ === 'Bohemians' && age === 3 && applied?.some((item) => item.id === wagonburg.id) === true,
        ),
      ).toBe(true);
      expect(unitCostSpy.mock.calls.every(([, , age]) => age === 3)).toBe(true);

      const before = unitCost(source, 'Bohemians', 3).cost;
      const after = unitCost(source, 'Bohemians', 3, [{ id: wagonburg.id, en: wagonburg.en, zh: wagonburg.zh }]).cost;
      expect(resolved.training.price.discount.age).toBe(3);
      expect(resolved.training.before).toEqual(before);
      expect(resolved.training.price.cost).toEqual(after);
      expect(resolved.training.deltas).toEqual([{ id: wagonburg.id, zh: wagonburg.zh, changes: [{ res: 'Food', delta: after.Food! - before.Food! }] }]);
      expect(resolved.F.cost).toEqual(after);
      expect(simulateSpy.mock.calls.some(([, unitInput, civ, age]) => unitInput.id === source.id && civ === 'Bohemians' && age === 3)).toBe(true);
    } finally {
      vi.restoreAllMocks();
      if (previousDatTech) DAT.techs[wagonburg.en] = previousDatTech;
      else delete DAT.techs[wagonburg.en];
    }
  });
});
