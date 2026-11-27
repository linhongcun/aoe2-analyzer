import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import { ECO as eco } from '../../src/data/eco';
import { ageComparison, unitAtAge } from '../../src/domain/ageComparison';
import { armyResearchChoices, evaluateArmyCost } from '../../src/domain/armyCost';
import { emptyArmyCost } from '../../src/domain/armyCostConfig';
import {
  availableUnitAge,
  EARLY_MILITARY_TECH_AGES,
  EARLY_UNIT_AGES,
  militaryTechAge,
  SPEARMAN_UNIT_ID,
  trainingUnitAge,
  treeNodeEarliestAge,
  treeRowAge,
} from '../../src/domain/availabilityAge';
import { analyzeChampi } from '../../src/domain/champiCounters';
import { duel } from '../../src/domain/duel';
import { parseSide } from '../../src/domain/duelState';
import {
  calculateProduction,
  decodeProduction,
  DEFAULT_PRODUCTION,
  productionBuildings,
  productionTechAge,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { gatherModel } from '../../src/domain/realCost';
import { makeSimContext, presetUpTo, simTechs, type SimContext } from '../../src/domain/simulator';
import { evaluateTrainTotal, type TrainTotalConfig } from '../../src/domain/trainTotal';
import { techAvailable, unitAvailable } from '../../src/domain/unitAvailability';
import { upgradePlan } from '../../src/domain/upgradeComparison';
import { isUnavail, resolve, resolveSideAge, switchSideCiv } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

let ctx: ProductionContext;
let sim: SimContext;

beforeAll(async () => {
  const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
  ctx = { core, trees };
  sim = makeSimContext(core.techs, trees);
});

const prodConfig = (overrides: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  techs: [],
  rows: [],
  ...overrides,
});

const trainConfig = (overrides: Partial<TrainTotalConfig> = {}): TrainTotalConfig => ({
  civ: 'Franks',
  age: 3,
  ageRaw: null,
  techs: [],
  rows: [],
  ...overrides,
});

function treeEarliestAge(civ: string, kind: 'u' | 't', id: number): number | null {
  const age = treeNodeEarliestAge(ctx.trees, civ, kind, id);
  return Number.isFinite(age) ? age : null;
}

describe('#1325 全量 56 文明单位与军事科技提前解锁时代防漂移对照', () => {
  it('全部 56 文明的单位最早可用时代与 trees.json 节点行时代一致（长矛兵专门规则独立守卫）', () => {
    expect(civs).toHaveLength(56);
    const mismatches: string[] = [];
    const expectedEarly: string[] = [];

    for (const civ of civs) {
      const seen = new Map<number, number>();
      for (const block of ctx.trees.t[civ.en] ?? []) {
        for (const cell of block[3]) {
          if (cell[2] !== 'u' || cell[4] !== 1) continue;
          const age = treeRowAge(cell[0]);
          const prev = seen.get(cell[3]);
          if (prev === undefined || age < prev) seen.set(cell[3], age);
        }
      }
      expect(seen.size, civ.en).toBeGreaterThan(0);

      for (const [uid, rowAge] of seen.entries()) {
        const unit = ctx.core.unitById[uid];
        expect(unit, `${civ.en} u${uid}`).toBeDefined();
        if (uid === SPEARMAN_UNIT_ID) {
          const expectedSpearman = civ.en === 'Armenians' ? 1 : 2;
          expect(rowAge, `${civ.en} spearman tree row`).toBe(expectedSpearman);
          expect(trainingUnitAge(civ.en, uid, unit!.age), `${civ.en} spearman trainingUnitAge`).toBe(expectedSpearman);
          expect(availableUnitAge(civ.en, uid, unit!.age, rowAge), `${civ.en} spearman availableUnitAge`).toBe(expectedSpearman);
          continue;
        }
        if (rowAge !== unit!.age) expectedEarly.push(`${civ.en}:${uid}=${rowAge}`);
        if (availableUnitAge(civ.en, uid, unit!.age, rowAge) !== rowAge || trainingUnitAge(civ.en, uid, unit!.age) !== rowAge) {
          mismatches.push(
            `${civ.en} u${uid}(${unit!.zh}): tree=${rowAge}, catalog=${unit!.age}, avail=${availableUnitAge(civ.en, uid, unit!.age, rowAge)}, train=${trainingUnitAge(civ.en, uid, unit!.age)}`,
          );
        }
        for (const age of [1, 2, 3, 4]) {
          expect(unitAvailable(ctx, civ.en, uid, age), `${civ.en} u${uid} age ${age}`).toBe(age >= rowAge);
        }
      }
    }

    expect(mismatches).toEqual([]);
    const registered = Object.entries(EARLY_UNIT_AGES)
      .flatMap(([civ, map]) => Object.entries(map).map(([id, age]) => `${civ}:${id}=${age}`))
      .sort();
    expect(registered).toEqual(expectedEarly.sort());
    expect(registered).toEqual([
      'Armenians:358=2',
      'Armenians:359=3',
      'Armenians:473=3',
      'Armenians:567=3',
      'Armenians:77=2',
      'Bohemians:5=3',
      'Burgundians:283=3',
      'Cumans:1258=2',
      'Cumans:422=3',
      'Khitans:474=3',
    ]);
  });

  it('全部 56 文明的非经济科技最早可用时代与 trees.json 一致（排除非目标勃艮第 16 项经济科技）', () => {
    expect(civs).toHaveLength(56);
    const mismatches: string[] = [];
    const expectedMilitaryEarly: string[] = [];
    const excludedEcoEarly: string[] = [];

    for (const civ of civs) {
      const seen = new Map<number, number>();
      for (const block of ctx.trees.t[civ.en] ?? []) {
        for (const cell of block[3]) {
          if (cell[2] !== 't' || cell[4] !== 1) continue;
          const age = treeRowAge(cell[0]);
          const prev = seen.get(cell[3]);
          if (prev === undefined || age < prev) seen.set(cell[3], age);
        }
      }
      expect(seen.size, civ.en).toBeGreaterThan(0);

      for (const [tid, rowAge] of seen.entries()) {
        const tech = ctx.core.techById[tid];
        expect(tech, `${civ.en} t${tid}`).toBeDefined();
        if (eco.ecoTechs[tid]) {
          if (rowAge !== tech!.age) excludedEcoEarly.push(`${civ.en}:${tid}=${rowAge}`);
          // 非目标守卫：militaryTechAge 不吞并经济科技
          expect(militaryTechAge(civ.en, tid, tech!.age), `${civ.en} eco t${tid}`).toBe(tech!.age);
          continue;
        }
        if (rowAge !== tech!.age) expectedMilitaryEarly.push(`${civ.en}:${tid}=${rowAge}`);
        if (militaryTechAge(civ.en, tid, tech!.age) !== rowAge || productionTechAge(tech!, civ.en) !== rowAge) {
          mismatches.push(
            `${civ.en} t${tid}(${tech!.zh}): tree=${rowAge}, catalog=${tech!.age}, military=${militaryTechAge(civ.en, tid, tech!.age)}, prod=${productionTechAge(tech!, civ.en)}`,
          );
        }
        for (const age of [1, 2, 3, 4]) {
          expect(techAvailable(ctx, civ.en, tid, age), `${civ.en} t${tid} age ${age}`).toBe(age >= rowAge);
        }
      }
    }

    expect(mismatches).toEqual([]);
    const registered = Object.entries(EARLY_MILITARY_TECH_AGES)
      .flatMap(([civ, map]) => Object.entries(map).map(([id, age]) => `${civ}:${id}=${age}`))
      .sort();
    expect(registered).toEqual(expectedMilitaryEarly.sort());
    expect(registered).toEqual(['Bohemians:47=3', 'Jurchens:377=3', 'Persians:436=3']);

    // 明确锁住被排除的提前经济科技仅为勃艮第 16 项，后续补丁若出现新差异会立刻暴露
    expect(excludedEcoEarly.sort()).toEqual([
      'Burgundians:12=3',
      'Burgundians:13=2',
      'Burgundians:14=1',
      'Burgundians:15=3',
      'Burgundians:182=2',
      'Burgundians:202=1',
      'Burgundians:203=2',
      'Burgundians:213=1',
      'Burgundians:221=3',
      'Burgundians:249=2',
      'Burgundians:278=1',
      'Burgundians:279=2',
      'Burgundians:48=2',
      'Burgundians:55=1',
      'Burgundians:65=2',
      'Burgundians:906=1',
    ]);
  });

  it('原型链键不会误命中提前解锁表', () => {
    for (const civ of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(militaryTechAge(civ, 47, 4)).toBe(4);
      expect(availableUnitAge(civ, 474, 4, 4)).toBe(4);
      expect(trainingUnitAge(civ, 474, 4)).toBe(4);
    }
  });
});

describe('#1325 验收 1 & 2：3 处单位提前解锁修正（PK、持续生产、训练总价、阵容费用）', () => {
  it('验收 1：契丹重装骑射手（474）在城堡时代保持城堡并可通过 PK、持续生产、训练总价与阵容费用', () => {
    expect(treeEarliestAge('Khitans', 'u', 474)).toBe(3);

    // 单位 PK：a=474.Khitans.3.. 保持城堡时代，不再静默跳至帝王
    const duelCastle = resolve(sim, ctx.core.unitById, { uid: 474, civ: 'Khitans', age: 3, ageSet: true, techs: [], team: [] }, 474);
    expect(isUnavail(duelCastle)).toBe(false);
    if (isUnavail(duelCastle)) throw new Error('Expected Khitans HCA available in Castle Age');
    expect(duelCastle.age).toBe(3);
    expect(duelCastle.earlyAgeMarker).toEqual({ unitId: 474, civ: 'Khitans', age: 3 });

    // 封建时代仍不可用（PK 落回目录时代 4，持续生产拒绝）
    const duelFeudal = resolve(sim, ctx.core.unitById, { uid: 474, civ: 'Khitans', age: 2, ageSet: true, techs: [], team: [] }, 474);
    expect(isUnavail(duelFeudal)).toBe(false);
    if (!isUnavail(duelFeudal)) expect(duelFeudal.age).toBe(4);
    expect(productionBuildings(ctx, prodConfig({ civ: 'Khitans', age: 2 }), ctx.core.unitById[474]!)).toEqual([]);

    // 持续生产：civ=Khitans&age=3&rows=474:87:1
    const decoded = decodeProduction('?civ=Khitans&age=3&rows=474%3A87%3A1');
    expect(decoded.errors).toEqual([]);
    const prod = calculateProduction(ctx, decoded.config);
    expect(prod.errors).toEqual([]);
    expect(prod.lines).toHaveLength(1);
    expect(prod.lines[0]?.building).toBe(87);
    expect(prod.total).toBeGreaterThan(0);

    // 阵容新增费用：契丹城堡半价重装骑射手升级（450 食 250 金）与训练行同时通过
    const army = evaluateArmyCost(ctx, { ...emptyArmyCost('Khitans', '3'), rows: [{ unit: 474, qty: '5' }] });
    expect(army.blocked).toEqual([]);
    expect(army.partial).toBe(false);
    expect(army.training.lines[0]?.status).toBe('ok');
    expect(army.ledger.find((e) => e.id === 218)).toMatchObject({ status: 'planned', cost: { Food: 450, Gold: 250 } });

    // 混编 PK：城堡时代合法，封建时代拒绝
    expect(resolveMixedSide(sim, ctx.core, { civ: 'Khitans', age: '3', techs: [], team: [], rows: [{ uid: '474', qty: '5' }] }, 'a').errors).toEqual([]);
    expect(
      resolveMixedSide(sim, ctx.core, { civ: 'Khitans', age: '2', techs: [], team: [], rows: [{ uid: '474', qty: '5' }] }, 'a').errors.length,
    ).toBeGreaterThan(0);
  });

  it('验收 1 & 2：亚美尼亚冠军剑士（567）城堡可用；武士（75）黑暗不可用、封建可用', () => {
    expect(treeEarliestAge('Armenians', 'u', 567)).toBe(3);
    expect(treeEarliestAge('Armenians', 'u', 75)).toBe(2);

    // 亚美尼亚冠军剑士：城堡可用、封建不可用
    const champProd = calculateProduction(ctx, decodeProduction('?civ=Armenians&age=3&rows=567%3A12%3A1').config);
    expect(champProd.errors).toEqual([]);
    expect(champProd.lines).toHaveLength(1);
    expect(champProd.lines[0]?.building).toBe(12);
    expect(champProd.total).toBeGreaterThan(0);
    expect(productionBuildings(ctx, prodConfig({ civ: 'Armenians', age: 2 }), ctx.core.unitById[567]!)).toEqual([]);

    const champDuel = resolve(sim, ctx.core.unitById, { uid: 567, civ: 'Armenians', age: 3, ageSet: true, techs: [], team: [] }, 567);
    expect(isUnavail(champDuel)).toBe(false);
    if (!isUnavail(champDuel)) expect(champDuel.age).toBe(3);

    // 亚美尼亚武士（75）：黑暗不可用、封建可用
    const maaDark = calculateProduction(ctx, decodeProduction('?civ=Armenians&age=1&rows=75%3A12%3A1').config);
    expect(maaDark.errors.length).toBeGreaterThan(0);
    expect(unitAvailable(ctx, 'Armenians', 75, 1)).toBe(false);
    expect(evaluateTrainTotal(ctx, trainConfig({ civ: 'Armenians', age: 1, rows: [{ unit: 75, qty: '3' }] })).lines[0]?.status).toBe('unavail');

    const maaFeudal = calculateProduction(ctx, decodeProduction('?civ=Armenians&age=2&rows=75%3A12%3A1').config);
    expect(maaFeudal.errors).toEqual([]);
    expect(maaFeudal.total).toBeGreaterThan(0);
    expect(unitAvailable(ctx, 'Armenians', 75, 2)).toBe(true);
    expect(evaluateTrainTotal(ctx, trainConfig({ civ: 'Armenians', age: 2, rows: [{ unit: 75, qty: '3' }] })).lines[0]?.status).toBe('ok');
  });
});

describe('#1325 验收 3–5：3 项军事科技提前解锁（阵容费用、PK 预设、训练总价与对照守卫）', () => {
  it('验收 3：阵容新增费用在城堡时代放行三组科技并计入研究费，封建时代与普通文明拒绝', () => {
    const cases = [
      // 女真文明加成：攻城与防御科技木材消耗 -75%（600 → 150）
      { civ: 'Jurchens', unit: 1904, techId: 377, cost: { Food: 500, Wood: 150 }, otherCiv: 'Khitans' },
      { civ: 'Persians', unit: 39, techId: 436, cost: { Food: 200, Gold: 250 }, otherCiv: 'Huns' },
      { civ: 'Bohemians', unit: 4, techId: 47, cost: { Food: 300, Gold: 200 }, otherCiv: 'Britons' },
    ] as const;

    for (const c of cases) {
      const castleBase = { ...emptyArmyCost(c.civ, '3'), rows: [{ unit: c.unit, qty: '1' }] };
      expect(armyResearchChoices(ctx, castleBase), `${c.civ} castle choices`).toContain(c.techId);
      const castleRes = evaluateArmyCost(ctx, { ...castleBase, targets: [`t:${c.techId}`] });
      expect(castleRes.partial, `${c.civ} castle partial`).toBe(false);
      expect(castleRes.ledger.find((e) => e.id === c.techId)).toMatchObject({ status: 'planned', cost: c.cost });
      expect(castleRes.researchTotal).toMatchObject(c.cost);

      // 封建时代不可选、手动指定目标被拒
      const feudalBase = { ...emptyArmyCost(c.civ, '2'), rows: [{ unit: c.unit, qty: '1' }] };
      expect(armyResearchChoices(ctx, feudalBase), `${c.civ} feudal choices`).not.toContain(c.techId);
      const feudalRes = evaluateArmyCost(ctx, { ...feudalBase, targets: [`t:${c.techId}`] });
      expect(feudalRes.ledger.find((e) => e.id === c.techId)?.status).toBe('invalid');

      // 普通文明在城堡时代不可选、帝王时代可选
      const otherCastle = { ...emptyArmyCost(c.otherCiv, '3'), rows: [{ unit: c.unit, qty: '1' }] };
      expect(armyResearchChoices(ctx, otherCastle), `${c.otherCiv} castle choices`).not.toContain(c.techId);
      const otherImp = { ...emptyArmyCost(c.otherCiv, '4'), rows: [{ unit: c.unit, qty: '1' }] };
      expect(armyResearchChoices(ctx, otherImp), `${c.otherCiv} imp choices`).toContain(c.techId);
    }
  });

  it('验收 4：单位 PK、混编 PK 与升级对比在城堡时代「当前时代科技」带上对应军事科技并体现数值效果', () => {
    // 1. 波希米亚远程单位（步弓手 4 / 弩手 24）：化学 +1 攻击；火枪手 5 无数值效果不进 presetUpTo
    const bohArcherC = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Bohemians', age: 3, ageSet: true, techs: 'c', team: [] }, 4);
    const britArcherC = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Britons', age: 3, ageSet: true, techs: 'c', team: [] }, 4);
    if (isUnavail(bohArcherC) || isUnavail(britArcherC)) throw new Error('Expected archers available');
    expect(bohArcherC.sel.has(47)).toBe(true);
    expect(britArcherC.sel.has(47)).toBe(false);
    expect(bohArcherC.S.atk).toBe(britArcherC.S.atk + 1);

    const bohXbowC = resolve(sim, ctx.core.unitById, { uid: 24, civ: 'Bohemians', age: 3, ageSet: true, techs: 'c', team: [] }, 24);
    if (isUnavail(bohXbowC)) throw new Error('Expected Bohemians Crossbowman available');
    expect(bohXbowC.sel.has(47)).toBe(true);
    expect(presetUpTo(simTechs(sim, ctx.core.unitById[5]!, 'Bohemians'), 3, 'Bohemians').has(47)).toBe(false);

    // 2. 女真攻城单位（火箭推车 1904 / 弩炮 279）：攻城技师 +1 射程、+1 视野、对建筑 ×1.2
    const jurRocketC = resolve(sim, ctx.core.unitById, { uid: 1904, civ: 'Jurchens', age: 3, ageSet: true, techs: 'c', team: [] }, 1904);
    const khiRocketC = resolve(sim, ctx.core.unitById, { uid: 1904, civ: 'Khitans', age: 3, ageSet: true, techs: 'c', team: [] }, 1904);
    if (isUnavail(jurRocketC) || isUnavail(khiRocketC)) throw new Error('Expected Rocket Carts available');
    expect(jurRocketC.sel.has(377)).toBe(true);
    expect(khiRocketC.sel.has(377)).toBe(false);
    expect(jurRocketC.S.rng).toBe(khiRocketC.S.rng + 1);
    expect(jurRocketC.S.los).toBe(khiRocketC.S.los + 1);

    const jurScorpC = resolve(sim, ctx.core.unitById, { uid: 279, civ: 'Jurchens', age: 3, ageSet: true, techs: 'c', team: [] }, 279);
    if (isUnavail(jurScorpC)) throw new Error('Expected Jurchens Scorpion available');
    expect(jurScorpC.sel.has(377)).toBe(true);

    // 3. 波斯骑射手（39）：帕提亚战术 +1 近防、+2 远防、对长矛兵 +2
    const perCaC = resolve(sim, ctx.core.unitById, { uid: 39, civ: 'Persians', age: 3, ageSet: true, techs: 'c', team: [] }, 39);
    const hunCaC = resolve(sim, ctx.core.unitById, { uid: 39, civ: 'Huns', age: 3, ageSet: true, techs: 'c', team: [] }, 39);
    if (isUnavail(perCaC) || isUnavail(hunCaC)) throw new Error('Expected Cavalry Archers available');
    expect(perCaC.sel.has(436)).toBe(true);
    expect(hunCaC.sel.has(436)).toBe(false);
    expect(perCaC.S.ma).toBe(hunCaC.S.ma + 1);
    expect(perCaC.S.pa).toBe(hunCaC.S.pa + 2);
    expect(perCaC.S.bonus['长矛兵']).toBe((hunCaC.S.bonus['长矛兵'] ?? 0) + 2);

    // 混编 PK 与升级对比同步放行城堡期三项科技
    expect(resolveMixedSide(sim, ctx.core, { civ: 'Bohemians', age: '3', techs: ['47'], team: [], rows: [{ uid: '24', qty: '10' }] }, 'a').errors).toEqual([]);
    expect(resolveMixedSide(sim, ctx.core, { civ: 'Jurchens', age: '3', techs: ['377'], team: [], rows: [{ uid: '1904', qty: '4' }] }, 'a').errors).toEqual([]);
    expect(resolveMixedSide(sim, ctx.core, { civ: 'Persians', age: '3', techs: ['436'], team: [], rows: [{ uid: '39', qty: '10' }] }, 'a').errors).toEqual([]);

    const up = upgradePlan(sim, ctx.core.unitById, { uid: 39, civ: 'Persians', age: 3, techs: 'c', team: [] });
    expect(up.ok).toBe(true);
    if (up.ok) expect(up.sel.has(436)).toBe(true);
  });

  it('验收 5：波希米亚火枪手化学前置、trainTotal 错误时代提示、既有 8 条单位提前、长矛兵及勃艮第非目标守卫', () => {
    // 波希米亚火枪手（5）在城堡时代仍须先研究化学（47）
    expect(productionBuildings(ctx, prodConfig({ civ: 'Bohemians', age: 3, techs: [] }), ctx.core.unitById[5]!)).toEqual([]);
    expect(productionBuildings(ctx, prodConfig({ civ: 'Bohemians', age: 3, techs: [47] }), ctx.core.unitById[5]!)).toEqual([87]);
    const bohArmy = evaluateArmyCost(ctx, { ...emptyArmyCost('Bohemians', '3'), rows: [{ unit: 5, qty: '2' }] });
    expect(bohArmy.partial).toBe(false);
    expect(bohArmy.ledger.find((e) => e.id === 47)?.status).toBe('planned');

    // trainTotal：显式携带 377/436 时，城堡时代不误报「帝王时代起可研究」，封建时代报「城堡时代起可研究」
    const jurCastleTotal = evaluateTrainTotal(ctx, trainConfig({ civ: 'Jurchens', age: 3, techs: [377], rows: [{ unit: 1904, qty: '1' }] }));
    const jurCastleTech = jurCastleTotal.techs.find((t) => t.id === 377)!;
    expect(jurCastleTech.invalidReason).toBe('攻城技师在当前条件下不可用，已停止计入。');

    const jurFeudalTotal = evaluateTrainTotal(ctx, trainConfig({ civ: 'Jurchens', age: 2, techs: [377], rows: [{ unit: 4, qty: '1' }] }));
    expect(jurFeudalTotal.techs.find((t) => t.id === 377)?.invalidReason).toContain('城堡时代起可研究');

    const perCastleTotal = evaluateTrainTotal(ctx, trainConfig({ civ: 'Persians', age: 3, techs: [436], rows: [{ unit: 39, qty: '1' }] }));
    expect(perCastleTotal.techs.find((t) => t.id === 436)?.invalidReason).toBe('帕提亚战术在当前条件下不可用，已停止计入。');

    const perFeudalTotal = evaluateTrainTotal(ctx, trainConfig({ civ: 'Persians', age: 2, techs: [436], rows: [{ unit: 4, qty: '1' }] }));
    expect(perFeudalTotal.techs.find((t) => t.id === 436)?.invalidReason).toContain('城堡时代起可研究');

    // 长矛兵规则不变：亚美尼亚黑暗可用，他文明黑暗不可用、封建可用
    expect(unitAvailable(ctx, 'Armenians', 93, 1)).toBe(true);
    expect(unitAvailable(ctx, 'Franks', 93, 1)).toBe(false);
    expect(unitAvailable(ctx, 'Franks', 93, 2)).toBe(true);

    // 非目标守卫：realCost 勃艮第不因本次改动提前启用封建经济科技
    expect(gatherModel(1, 'Burgundians').rate).toEqual(gatherModel(1, 'Franks').rate);
  });
});

describe('#1325 复核回归：显式科技时代过滤、蔷琵对照透传 civ、各时代对比提前解锁单位', () => {
  it('P1-1：单兵 PK 显式携带超时代军事科技时按目标文明时代过滤，不泄露属性且切入混编无报错', () => {
    // 城堡波希米亚步弓手（4）显式选化学（47）合法；切到不列颠后过滤掉 47，不增加攻击，切入混编无错误
    const boh = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Bohemians', age: 3, ageSet: true, techs: [47], team: [] }, 4);
    const britWith47 = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Britons', age: 3, ageSet: true, techs: [47], team: [] }, 4);
    const britBase = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Britons', age: 3, ageSet: true, techs: [], team: [] }, 4);
    if (isUnavail(boh) || isUnavail(britWith47) || isUnavail(britBase)) throw new Error('Expected archers available');
    expect(boh.sel.has(47)).toBe(true);
    expect(britWith47.sel.has(47)).toBe(false);
    expect(britWith47.S.atk).toBe(britBase.S.atk);
    expect(boh.S.atk).toBe(britBase.S.atk + 1);
    expect(
      resolveMixedSide(sim, ctx.core, { civ: 'Britons', age: '3', techs: [...britWith47.sel].map(String), team: [], rows: [{ uid: '4', qty: '10' }] }, 'a')
        .errors,
    ).toEqual([]);

    // 普通帝王科技（护腕 201）在城堡时代显式传入同样被拦截
    const britBracer = resolve(sim, ctx.core.unitById, { uid: 4, civ: 'Britons', age: 3, ageSet: true, techs: [201], team: [] }, 4);
    if (isUnavail(britBracer)) throw new Error('Expected Britons archer available');
    expect(britBracer.sel.has(201)).toBe(false);
    expect(britBracer.S.atk).toBe(britBase.S.atk);

    // 女真攻城技师（377）切契丹、波斯帕提亚战术（436）切匈人在城堡时代同样过滤
    const jur = resolve(sim, ctx.core.unitById, { uid: 1904, civ: 'Jurchens', age: 3, ageSet: true, techs: [377], team: [] }, 1904);
    const khi = resolve(sim, ctx.core.unitById, { uid: 1904, civ: 'Khitans', age: 3, ageSet: true, techs: [377], team: [] }, 1904);
    if (isUnavail(jur) || isUnavail(khi)) throw new Error('Expected Rocket Carts available');
    expect(jur.sel.has(377)).toBe(true);
    expect(khi.sel.has(377)).toBe(false);
    expect(jur.S.rng).toBe(khi.S.rng + 1);

    const per = resolve(sim, ctx.core.unitById, { uid: 39, civ: 'Persians', age: 3, ageSet: true, techs: [436], team: [] }, 39);
    const hun = resolve(sim, ctx.core.unitById, { uid: 39, civ: 'Huns', age: 3, ageSet: true, techs: [436], team: [] }, 39);
    if (isUnavail(per) || isUnavail(hun)) throw new Error('Expected Cavalry Archers available');
    expect(per.sel.has(436)).toBe(true);
    expect(hun.sel.has(436)).toBe(false);
    expect(per.S.ma).toBe(hun.S.ma + 1);
    expect(per.S.pa).toBe(hun.S.pa + 2);
  });

  it('P1-2：蔷琵对照在波希米亚城堡时代弩手（24）包含化学（47）且与 pkPath 解析结果一致', () => {
    for (const opp of ['Muisca', 'Incas', 'Mapuche', 'Tupi']) {
      const analysis = analyzeChampi(ctx, 'Bohemians', opp, 188329);
      expect(analysis.state, opp).toBe('ready');
      if (analysis.state !== 'ready') throw new Error(`Expected ready for Bohemians vs ${opp}`);
      const castle = analysis.cards.find((card) => card.age === 3);
      const xbow = castle?.candidates.find((row) => row.unitId === 24);
      expect(xbow?.state, opp).toBe('ok');
      if (!xbow || xbow.state !== 'ok') throw new Error(`Expected Crossbowman ok for Bohemians vs ${opp}`);

      expect(xbow.a.civ).toBe('Bohemians');
      expect(xbow.a.techIds, opp).toContain(47);

      const query = new URLSearchParams(xbow.pkPath.split('?')[1]);
      const aSpec = parseSide(query.get('a'), xbow.a.spec);
      const bSpec = parseSide(query.get('b'), xbow.b.spec);
      const aResolved = resolve(sim, ctx.core.unitById, aSpec, xbow.a.unit.id);
      const bResolved = resolve(sim, ctx.core.unitById, bSpec, xbow.b.unit.id);
      if (isUnavail(aResolved) || isUnavail(bResolved)) throw new Error('Expected pkPath sides available');

      expect(xbow.a.stats, opp).toEqual(aResolved.S);
      expect(xbow.b.stats, opp).toEqual(bResolved.S);
      expect(xbow.result, opp).toEqual(duel(aResolved.F, bResolved.F));
      const aCombatSel = [...aResolved.sel].filter((id) => aResolved.avail.some((item) => item.t.id === id && item.ef)).sort((x, y) => x - y);
      expect(xbow.a.techIds, opp).toEqual(aCombatSel);
    }
  });

  it('P1-3：unitAtAge 与 ageComparison 识别所有提前解锁单位并在未解锁时代正确回溯', () => {
    const byId = ctx.core.unitById;
    const cases: [number, string, [number | null, number | null, number | null, number | null]][] = [
      [474, 'Khitans', [null, null, 474, 474]],
      [474, 'Huns', [null, null, 39, 474]],
      [567, 'Armenians', [74, 77, 567, 567]],
      [75, 'Armenians', [74, 75, 75, 75]],
      [5, 'Bohemians', [null, null, 5, 5]],
      [283, 'Burgundians', [null, null, 283, 283]],
      [422, 'Cumans', [null, 1258, 422, 422]],
      [359, 'Armenians', [93, 358, 359, 359]],
      [359, 'Franks', [null, 93, 358, 359]],
    ];

    for (const [uid, civ, expected] of cases) {
      for (const age of [1, 2, 3, 4] as const) {
        expect(unitAtAge(byId, uid, civ, age, ctx.trees)?.id ?? null, `${civ} u${uid} age ${age} (with trees)`).toBe(expected[age - 1]);
        expect(unitAtAge(byId, uid, civ, age)?.id ?? null, `${civ} u${uid} age ${age} (without trees)`).toBe(expected[age - 1]);
      }
    }

    const rows = ageComparison(sim, byId, { uid: 474, civ: 'Khitans', team: [] }, { uid: 567, civ: 'Armenians', team: [] });
    expect(rows.map((r) => [r.age, r.a?.u.id ?? null, r.b?.u.id ?? null])).toEqual([
      [1, null, 74],
      [2, null, 77],
      [3, 474, 567],
      [4, 474, 567],
    ]);
    const castleRow = rows.find((r) => r.age === 3)!;
    const khitanCastle = resolve(sim, byId, { uid: 474, civ: 'Khitans', age: 3, ageSet: true, techs: 'f', team: [] }, 474);
    const armCastle = resolve(sim, byId, { uid: 567, civ: 'Armenians', age: 3, ageSet: true, techs: 'f', team: [] }, 567);
    if (isUnavail(khitanCastle) || isUnavail(armCastle)) throw new Error('Expected castle early units available');
    expect(castleRow.result).toEqual(duel(khitanCastle.F, armCastle.F));

    const hcRows = ageComparison(sim, byId, { uid: 5, civ: 'Bohemians', team: [] }, { uid: 24, civ: 'Britons', team: [] });
    expect(hcRows.find((r) => r.age === 3)?.a?.u.id).toBe(5);
    expect(hcRows.find((r) => r.age === 3)?.result).not.toBeNull();
    expect(hcRows.find((r) => r.age === 2)?.a).toBeNull();
  });

  it('Round 2 P1-1：Side 与 UnavailSide 切文明使用同源 resolveSideAge 裁剪显式科技，不沿用旧文明抬高后的 side.age', () => {
    const byId = ctx.core.unitById;
    const hca = byId[474]!;
    const sideData = { byId, techById: ctx.core.techById, trees: ctx.trees };

    // 路径 A（Side.onCivChange）：城堡波斯 39 勾 436（与合法封建科技 199）→ 切 474（波斯 side.age 被抬高到 4，但 spec.age 仍为 3）→ 切契丹
    const persianHcaSpec = { uid: 474, civ: 'Persians', age: 3, ageSet: true, techs: [199, 436], team: [] };
    const persianResolved = resolve(sim, byId, persianHcaSpec, 474);
    expect(isUnavail(persianResolved)).toBe(false);
    if (!isUnavail(persianResolved)) expect(persianResolved.age).toBe(4);

    expect(resolveSideAge(sideData, 'Khitans', hca, persianHcaSpec.age, persianHcaSpec.ageSet)).toEqual({
      age: 3,
      earlyAgeMarker: { unitId: 474, civ: 'Khitans', age: 3 },
    });
    const khitanFromPersian = switchSideCiv(sideData, persianHcaSpec, hca, 'Khitans');
    expect(khitanFromPersian.techs).toEqual([199]);
    const khitanResolved = resolve(sim, byId, khitanFromPersian, 474);
    expect(isUnavail(khitanResolved)).toBe(false);
    if (isUnavail(khitanResolved)) throw new Error('Expected Khitans HCA available in Castle Age');
    expect(khitanResolved.age).toBe(3);
    expect(khitanResolved.sel.has(436)).toBe(false);
    expect(khitanResolved.sel.has(199)).toBe(true);
    expect(upgradePlan(sim, byId, khitanFromPersian).ok).toBe(true);
    // 随后升帝王不会幽灵复活 436
    const khitanImp = resolve(sim, byId, { ...khitanFromPersian, age: 4, ageSet: true }, 474);
    if (isUnavail(khitanImp)) throw new Error('Expected Khitans HCA available in Imperial Age');
    expect(khitanImp.sel.has(436)).toBe(false);

    // 仅带 436 时切契丹后 techs 清空为 []
    const khitanEmpty = switchSideCiv(sideData, { ...persianHcaSpec, techs: [436] }, hca, 'Khitans');
    expect(khitanEmpty.techs).toEqual([]);
    expect(upgradePlan(sim, byId, khitanEmpty).ok).toBe(true);

    // 路径 B（UnavailSide 切文明）：城堡波希米亚 4 勾 47 → 切波希米亚不可造的 474（UnavailSide side.age=4, spec.age=3）→ 切契丹
    const bohHcaSpec = { uid: 474, civ: 'Bohemians', age: 3, ageSet: true, techs: [47], team: [] };
    const bohUnavail = resolve(sim, byId, bohHcaSpec, 474);
    expect(isUnavail(bohUnavail)).toBe(true);
    if (isUnavail(bohUnavail)) expect(bohUnavail.age).toBe(4);

    const khitanFromUnavail = switchSideCiv(sideData, bohHcaSpec, hca, 'Khitans');
    expect(khitanFromUnavail.techs).toEqual([]);
    const khitanAfterUnavail = resolve(sim, byId, khitanFromUnavail, 474);
    expect(isUnavail(khitanAfterUnavail)).toBe(false);
    if (isUnavail(khitanAfterUnavail)) throw new Error('Expected Khitans HCA available after leaving UnavailSide');
    expect(khitanAfterUnavail.age).toBe(3);
    expect(khitanAfterUnavail.sel.has(47)).toBe(false);
    expect(upgradePlan(sim, byId, khitanFromUnavail).ok).toBe(true);

    // 非提前解锁文明（匈奴）或未显式指定时代（ageSet: false）均按 Math.max(u.age, spec.age) 解析为帝王
    expect(resolveSideAge(sideData, 'Huns', hca, 3, true)).toEqual({ age: 4 });
    expect(resolveSideAge(sideData, 'Khitans', hca, 3, false)).toEqual({ age: 4 });
  });
});
