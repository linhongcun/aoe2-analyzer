import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { loadTrees } from '../../src/data';
import { buildBuildingCivRank } from '../../src/domain/buildingCivRank';
import { buildingSimTechs, filterBuildingExtraTeam, parseBuildingTeamParam, simulateBuilding } from '../../src/domain/buildingSim';
import { calculateConstruction, DEFAULT_CONSTRUCTION } from '../../src/domain/construction';
import { damageSources } from '../../src/domain/damageBreakdown';
import { groupFight } from '../../src/domain/duel';
import { TEAM_BLD, TEAM_BONUSES, TEAM_BUILDING_BONUSES } from '../../src/domain/effects';
import { formatHp } from '../../src/domain/hpFormat';
import { mixedFight } from '../../src/domain/mixedFight';
import { decodeMixedDuel } from '../../src/domain/mixedDuelParams';
import { calculateProduction, DEFAULT_PRODUCTION } from '../../src/domain/production';
import { allNumeric, makeSimContext, simTechs, simulate } from '../../src/domain/simulator';
import { buildUnitCivRank } from '../../src/domain/unitCivRank';
import { upgradeComparison, upgradePlan } from '../../src/domain/upgradeComparison';
import { buildEnterMixedParams } from '../../src/features/duel/logic/duelKiteView';
import { isUnavail, resolve, switchSideCiv } from '../../src/features/duel/logic/duelSide';
import { filterMixedTeamOnCivChange, resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { unitTrainCount } from '../../src/domain/trainBatch';

const trees = await loadTrees();
const simCtx = makeSimContext(CORE.techs, trees);
const prodCtx = { core: CORE, trees };

const unitTeamIndex = (civ: string) => TEAM_BONUSES.findIndex(([c]) => c === civ);
const bldTeamIndex = (civ: string) => TEAM_BUILDING_BONUSES.findIndex(([c]) => c === civ);

describe('#1481 全站统一本方常驻团队加成与 4 国建筑 TEAM_BLD', () => {
  it('全站 23 国单位 TEAM_BONUSES 自动生效、trace 标明本方常驻且对旧链本方索引幂等去重', () => {
    expect(TEAM_BONUSES).toHaveLength(23);

    for (let i = 0; i < TEAM_BONUSES.length; i++) {
      const [civ, label, pred] = TEAM_BONUSES[i]!;
      const u = CORE.units.find((x) => x.civs.includes(civ) && pred(x));
      expect(u, `No unit found for ${civ}`).toBeDefined();
      if (!u) continue;

      const ownSteps: string[] = [];
      const autoStats = simulate(simCtx, u, civ, 4, new Set(), new Set(), (step) => ownSteps.push(step.source));
      expect(ownSteps, `${civ} should record own permanent team bonus`).toContain(`本方常驻团队加成：${label}`);

      // 旧链显式带本方索引：逐项完全等价，绝不双重叠加
      const dupSteps: string[] = [];
      const dupStats = simulate(simCtx, u, civ, 4, new Set(), new Set([i]), (step) => dupSteps.push(step.source));
      expect(dupStats, `${civ} idempotent stats`).toEqual(autoStats);
      expect(
        dupSteps.filter((s) => s.includes(label)),
        `${civ} applied once`,
      ).toHaveLength(1);

      // 额外盟友：他国显式传索引按「团队加成：…」生效且改变至少一项属性
      const otherCiv = u.civs.find((c) => c !== civ && !TEAM_BONUSES.some(([tc, , p]) => tc === c && p(u)));
      if (otherCiv) {
        const allySteps: string[] = [];
        const withoutAlly = simulate(simCtx, u, otherCiv, 4, new Set(), new Set());
        const withAlly = simulate(simCtx, u, otherCiv, 4, new Set(), new Set([i]), (step) => allySteps.push(step.source));
        expect(allySteps, `${otherCiv} with ally ${civ}`).toContain(`团队加成：${label}`);
        expect(withAlly, `${otherCiv} with ally ${civ} should differ`).not.toEqual(withoutAlly);
      }
    }

    // 7 国战斗克制本方团队加成逐项核验
    const combatCases: [string, number, string, number][] = [
      ['Khitans', 567, '弓手', 2],
      ['Persians', 283, '弓手', 2],
      ['Poles', 448, '弓手', 1],
      ['Varangians', 38, '步兵', 1],
      ['Wei', 448, '攻城武器', 2],
      ['Hindustanis', 329, '标准建筑', 2],
      ['Saracens', 4, '标准建筑', 3],
    ];
    for (const [civ, uid, vs, delta] of combatCases) {
      const u = CORE.unitById[uid]!;
      const idx = unitTeamIndex(civ);
      expect(idx).toBeGreaterThanOrEqual(0);
      const baseVal = u.atks.find(([n]) => n === vs)?.[1] ?? 0;
      const auto = simulate(simCtx, u, civ, 4, new Set(), new Set());
      const dup = simulate(simCtx, u, civ, 4, new Set(), new Set([idx]));
      expect(auto.bonus[vs], `${civ} ${uid} bonus vs ${vs}`).toBe(baseVal + delta);
      expect(dup.bonus[vs], `${civ} ${uid} idempotent bonus vs ${vs}`).toBe(baseVal + delta);
    }

    // damageSources 明细清晰区分本方常驻与额外盟友
    const khitanChamp = CORE.unitById[567]!;
    const dmg = damageSources(simCtx, khitanChamp, 'Khitans', 4, new Set(), new Set());
    expect(dmg.sources.some((s) => s.source.startsWith('本方常驻团队加成：契丹：'))).toBe(true);
  });

  it('单位满科技对照：高棉重型弩炮射程 9 登顶、罗马最小射程 1，三国训练时间与持续生产零矛盾', () => {
    const scorp = CORE.unitById[542]!;
    const rank542 = buildUnitCivRank(simCtx, scorp, 4);
    const khmerRow = rank542.rows.find((r) => r.civ === 'Khmer')!;
    expect(khmerRow.rng).toBe(9);
    const rngChamp = rank542.champions.find((c) => c.col === 'rng')!;
    expect(rngChamp).toBeDefined();
    expect(rngChamp.formattedValue).toBe('9');
    expect(rngChamp.civs.map((c) => c.civ)).toEqual(['Khmer']);

    const romansScorp = simulate(simCtx, scorp, 'Romans', 4, allNumeric(simTechs(simCtx, scorp, 'Romans')), new Set());
    expect(romansScorp.minr).toBe(1);

    // 三国训练时间与持续生产（单建筑无征招）精确对齐
    const trainCases: [number, string, number, number, number[]][] = [
      [5, 'Turks', 87, 27.2, [47]],
      [330, 'Gurjaras', 101, 17.6, []],
      [474, 'Magyars', 87, 24.0, []],
    ];
    for (const [uid, civ, building, expectedSec, prodTechs] of trainCases) {
      const rank = buildUnitCivRank(simCtx, CORE.unitById[uid]!, 4);
      const row = rank.rows.find((r) => r.civ === civ)!;
      expect(row.bt, `${civ} ${uid} rank bt`).toBeCloseTo(expectedSec, 6);
      const prod = calculateProduction(prodCtx, {
        ...DEFAULT_PRODUCTION,
        civ,
        age: 4,
        techs: prodTechs,
        rows: [{ unit: uid, building, count: '1' }],
      });
      expect(prod.errors).toEqual([]);
      expect(prod.lines[0]!.seconds, `${civ} ${uid} production seconds`).toBeCloseTo(expectedSec, 6);
    }
  });

  it('建筑模拟器与建筑满科技对照完整消费 4 国 TEAM_BLD，且支持额外盟友与旧链幂等去重', () => {
    expect(TEAM_BUILDING_BONUSES.map(([c]) => c)).toEqual(['Cumans', 'Ethiopians', 'Malay', 'Wu']);
    for (const [civ] of TEAM_BUILDING_BONUSES) {
      expect((TEAM_BLD[civ] ?? []).length).toBeGreaterThan(0);
    }

    const cumansIdx = bldTeamIndex('Cumans');
    const ethIdx = bldTeamIndex('Ethiopians');
    const malayIdx = bldTeamIndex('Malay');
    const wuIdx = bldTeamIndex('Wu');

    // 1. 库曼木栅栏（72）黑暗 200、封建–帝王 333.33；木城门（792）533.33；法兰克选库曼盟友 333.33
    const palisade = CORE.buildingById[72]!;
    const palisadeGate = CORE.buildingById[792]!;
    expect(formatHp(simulateBuilding(simCtx, palisade, 'Cumans', 1, new Set()).hp)).toBe('200');
    const cumanImpWall = simulateBuilding(simCtx, palisade, 'Cumans', 4, allNumeric(buildingSimTechs(simCtx, palisade, 'Cumans')));
    const cumanImpWallDup = simulateBuilding(simCtx, palisade, 'Cumans', 4, allNumeric(buildingSimTechs(simCtx, palisade, 'Cumans')), new Set([cumansIdx]));
    expect(formatHp(cumanImpWall.hp)).toBe('333.33');
    expect(cumanImpWallDup).toEqual(cumanImpWall);
    expect(formatHp(simulateBuilding(simCtx, palisadeGate, 'Cumans', 4, new Set()).hp)).toBe('533.33');

    const franksWallNoAlly = simulateBuilding(simCtx, palisade, 'Franks', 4, allNumeric(buildingSimTechs(simCtx, palisade, 'Franks')));
    const franksWallWithCumans = simulateBuilding(
      simCtx,
      palisade,
      'Franks',
      4,
      allNumeric(buildingSimTechs(simCtx, palisade, 'Franks')),
      new Set([cumansIdx]),
    );
    expect(formatHp(franksWallNoAlly.hp)).toBe('250');
    expect(formatHp(franksWallWithCumans.hp)).toBe('333.33');

    // 木栅栏满科技对照：黑暗第 1（200）、封建第 1（333.33）、帝王第 2（333.33，超中国 325 仅次拜占庭 349.98）
    const wallDark = buildBuildingCivRank(prodCtx, palisade, 1);
    expect(wallDark.rows[0]!.civ).toBe('Cumans');
    expect(formatHp(wallDark.rows[0]!.hp)).toBe('200');
    const wallFeudal = buildBuildingCivRank(prodCtx, palisade, 2);
    expect(wallFeudal.rows[0]!.civ).toBe('Cumans');
    expect(formatHp(wallFeudal.rows[0]!.hp)).toBe('333.33');
    const wallImp = buildBuildingCivRank(prodCtx, palisade, 4);
    expect(wallImp.rows[0]!.civ).toBe('Byzantines');
    expect(wallImp.rows[1]!.civ).toBe('Cumans');
    expect(formatHp(wallImp.rows[1]!.hp)).toBe('333.33');
    expect(wallImp.rows[2]!.civ).toBe('Chinese');

    // 2. 埃塞俄比亚哨站（598）视野 +3（帝王满科技 20 -> 23，含 Tech 101/102/103 跨时代 +6，Issue 1518）
    const outpost = CORE.buildingById[598]!;
    const ethOutpost = simulateBuilding(simCtx, outpost, 'Ethiopians', 4, allNumeric(buildingSimTechs(simCtx, outpost, 'Ethiopians')));
    const ethOutpostDup = simulateBuilding(simCtx, outpost, 'Ethiopians', 4, allNumeric(buildingSimTechs(simCtx, outpost, 'Ethiopians')), new Set([ethIdx]));
    const frOutpost = simulateBuilding(simCtx, outpost, 'Franks', 4, allNumeric(buildingSimTechs(simCtx, outpost, 'Franks')));
    expect(ethOutpost.los).toBe(23);
    expect(frOutpost.los).toBe(20);
    expect(ethOutpostDup).toEqual(ethOutpost);

    // 3. 马来船坞（45）视野 +6（16 -> 22）、巨港（1189）视野 +6（21 -> 27）
    const dock = CORE.buildingById[45]!;
    const harbor = CORE.buildingById[1189]!;
    const malayDock = simulateBuilding(simCtx, dock, 'Malay', 4, allNumeric(buildingSimTechs(simCtx, dock, 'Malay')));
    const malayHarbor = simulateBuilding(simCtx, harbor, 'Malay', 4, allNumeric(buildingSimTechs(simCtx, harbor, 'Malay')));
    const malayHarborDup = simulateBuilding(simCtx, harbor, 'Malay', 4, allNumeric(buildingSimTechs(simCtx, harbor, 'Malay')), new Set([malayIdx]));
    expect(malayDock.los).toBe(22);
    expect(malayHarbor.los).toBe(27);
    expect(malayHarborDup).toEqual(malayHarbor);

    // 4. 吴房屋（70）建造时间 ×0.5（空科技 12.5s，帝王脚踏起重机 10.4s，与 construction.ts 一致）
    const house = CORE.buildingById[70]!;
    const wuHouseEmpty = simulateBuilding(simCtx, house, 'Wu', 1, new Set());
    const wuHouseFull = simulateBuilding(simCtx, house, 'Wu', 4, allNumeric(buildingSimTechs(simCtx, house, 'Wu')));
    const wuHouseDup = simulateBuilding(simCtx, house, 'Wu', 4, allNumeric(buildingSimTechs(simCtx, house, 'Wu')), new Set([wuIdx]));
    expect(wuHouseEmpty.bt).toBe(12.5);
    expect(wuHouseFull.bt).toBe(10.4);
    expect(wuHouseDup).toEqual(wuHouseFull);
    const wuConstr = calculateConstruction(prodCtx, { ...DEFAULT_CONSTRUCTION, buildingId: 70, civ: 'Wu', age: 1, builders: '1', techs: [] });
    expect(wuConstr.single).toBeCloseTo(12.5, 6);
  });

  it('单位 PK（单兵等资源 3000 与混编罗马逆转）默认含本方常驻且与旧链完全一致，切文明/升级比较去重本方索引', () => {
    const romansIdx = unitTeamIndex('Romans');
    const khmerIdx = unitTeamIndex('Khmer');
    expect(romansIdx).toBeGreaterThanOrEqual(0);
    expect(khmerIdx).toBeGreaterThanOrEqual(0);

    // 单兵等资源 3000：罗马重型弩炮 vs 高棉重型弩炮
    const aAuto = resolve(simCtx, CORE.unitById, { uid: 542, civ: 'Romans', age: 4, ageSet: true, techs: 'f', team: [] }, 542);
    const bAuto = resolve(simCtx, CORE.unitById, { uid: 542, civ: 'Khmer', age: 4, ageSet: true, techs: 'f', team: [] }, 542);
    const aLegacy = resolve(simCtx, CORE.unitById, { uid: 542, civ: 'Romans', age: 4, ageSet: true, techs: 'f', team: [romansIdx] }, 542);
    const bLegacy = resolve(simCtx, CORE.unitById, { uid: 542, civ: 'Khmer', age: 4, ageSet: true, techs: 'f', team: [khmerIdx] }, 542);
    if (isUnavail(aAuto) || isUnavail(bAuto) || isUnavail(aLegacy) || isUnavail(bLegacy)) throw new Error('Expected available');

    expect(aAuto.S).toEqual(aLegacy.S);
    expect(bAuto.S).toEqual(bLegacy.S);
    expect(aAuto.S.minr).toBe(1);
    expect(bAuto.S.rng).toBe(9);

    const nA = resolveSideBudgetCount('r', aAuto.training.price.cost, 0, { bud: 3000, vils: 10, mins: 10 }, unitTrainCount(aAuto.u)).count!;
    const nB = resolveSideBudgetCount('r', bAuto.training.price.cost, 0, { bud: 3000, vils: 10, mins: 10 }, unitTrainCount(bAuto.u)).count!;
    expect([nA, nB]).toEqual([26, 20]);
    const gAuto = groupFight(aAuto.F, nA, bAuto.F, nB);
    const gLegacy = groupFight(aLegacy.F, nA, bLegacy.F, nB);
    expect(gAuto).toEqual(gLegacy);
    expect(gAuto.status).toBe('win');
    if (gAuto.status === 'error') throw new Error(gAuto.reason);
    expect(gAuto.winner).toBe('a');
    expect(gAuto.aAlive).toBe(18);
    expect(Math.round(gAuto.hpLeft)).toBe(1052);
    expect(Number(gAuto.duration.toFixed(1))).toBe(24.1);

    // 混编 PK 逆转：罗马 33 长戟 + 18 重型弩炮 vs 不列颠 33 长戟 + 28 劲弩
    const romansMixBase = {
      civ: 'Romans',
      age: '4',
      techs: ['67', '74', '68', '76', '215', '883', '47', '75', '377'],
      team: [] as string[],
      rows: [
        { uid: '359', qty: '33' },
        { uid: '542', qty: '18' },
      ],
    };
    const britonsMix = {
      civ: 'Britons',
      age: '4',
      techs: ['67', '74', '199', '211', '602', '3', '68', '76', '200', '212', '215', '47', '75', '77', '201', '219'],
      team: [] as string[],
      rows: [
        { uid: '359', qty: '33' },
        { uid: '492', qty: '28' },
      ],
    };
    const mixAutoA = resolveMixedSide(simCtx, CORE, romansMixBase, 'a');
    const mixLegacyA = resolveMixedSide(simCtx, CORE, { ...romansMixBase, team: [String(romansIdx)] }, 'a');
    const mixB = resolveMixedSide(simCtx, CORE, britonsMix, 'b');
    expect(mixAutoA.errors).toEqual([]);
    expect(mixLegacyA.errors).toEqual([]);
    expect(mixB.errors).toEqual([]);

    const fightAuto = mixedFight(mixAutoA.army!, mixB.army!);
    const fightLegacy = mixedFight(mixLegacyA.army!, mixB.army!);
    expect(fightAuto).toEqual(fightLegacy);
    expect(fightAuto.status).toBe('win');
    if (fightAuto.status !== 'win') throw new Error('Expected win');
    expect(fightAuto.winner).toBe('a');
    expect(fightAuto.a.rows[1]!.alive).toBe(5);
    expect(formatHp(fightAuto.a.total.hp)).toBe('253.20');

    // switchSideCiv 切到罗马时剔除罗马自身索引，保留高棉额外盟友索引
    const switched = switchSideCiv(
      { byId: CORE.unitById, techById: CORE.techById, trees },
      { uid: 542, civ: 'Britons', age: 4, ageSet: true, techs: 'f', team: [romansIdx, khmerIdx] },
      CORE.unitById[542]!,
      'Romans',
    );
    expect(switched.team).toEqual([khmerIdx]);

    // 从携带旧链本方索引的罗马切到不列颠时，同步剥离原文明（罗马）索引，保留高棉额外盟友
    const switchedAway = switchSideCiv(
      { byId: CORE.unitById, techById: CORE.techById, trees },
      { uid: 542, civ: 'Romans', age: 4, ageSet: true, techs: 'f', team: [romansIdx, khmerIdx] },
      CORE.unitById[542]!,
      'Britons',
    );
    expect(switchedAway.team).toEqual([khmerIdx]);
    expect(
      switchSideCiv(
        { byId: CORE.unitById, techById: CORE.techById, trees },
        { uid: 542, civ: 'Romans', age: 4, ageSet: true, techs: 'f', team: [romansIdx] },
        CORE.unitById[542]!,
        'Britons',
      ).team,
    ).toEqual([]);

    // 混编切文明时同步剥离原文明与目标文明本方索引，不把原文明旧链残留泄漏为新文明额外盟友
    expect(filterMixedTeamOnCivChange('Romans', 'Britons', [String(romansIdx)])).toEqual([]);
    expect(filterMixedTeamOnCivChange('Romans', 'Britons', [String(romansIdx), String(khmerIdx)])).toEqual([String(khmerIdx)]);
    expect(filterMixedTeamOnCivChange('Romans', 'Khmer', [String(romansIdx), String(khmerIdx)])).toEqual([]);
    const turksIdx = String(unitTeamIndex('Turks'));
    expect(filterMixedTeamOnCivChange('Turks', 'Britons', [turksIdx])).toEqual([]);

    // 单兵旧链进入混编时剥离本方索引与无效/重复索引，保留有效额外盟友
    const enterMixed = buildEnterMixedParams(aLegacy, bLegacy, 'r', { na: 26, nb: 20, cntA: 26, cntB: 20 }, { a: false, b: false });
    const decodedEnter = decodeMixedDuel(enterMixed);
    expect(decodedEnter.errors).toEqual([]);
    expect(decodedEnter.input.a.team).toEqual([]);
    expect(decodedEnter.input.b.team).toEqual([]);
    const aWithExtra = resolve(
      simCtx,
      CORE.unitById,
      { uid: 542, civ: 'Romans', age: 4, ageSet: true, techs: 'f', team: [romansIdx, khmerIdx, khmerIdx, 999] },
      542,
    );
    if (isUnavail(aWithExtra)) throw new Error('Expected available');
    const enterMixedWithAlly = buildEnterMixedParams(aWithExtra, bAuto, 'r', { na: 26, nb: 20, cntA: 26, cntB: 20 }, { a: false, b: false });
    expect(decodeMixedDuel(enterMixedWithAlly).input.a.team).toEqual([String(khmerIdx)]);

    // 建筑模拟器 ?team= 严格解析：空白、+、小数、负零、十六进制、科学计数、负数与空串均返回空；越界、本方与不适用建筑由 filterBuildingExtraTeam 拦截
    for (const bad of [' ', '\t', '+', 'abc, ', '0.0', '-0', '0x0', '1e0', '-1', '']) {
      expect(parseBuildingTeamParam(bad), `parseBuildingTeamParam(${JSON.stringify(bad)})`).toEqual([]);
    }
    expect(parseBuildingTeamParam('99')).toEqual([99]);
    expect(parseBuildingTeamParam('0, ,1,0.0,abc,0')).toEqual([0, 1, 0]);
    const palisadeWall = CORE.buildingById[72]!;
    const outpostBld = CORE.buildingById[598]!;
    expect(filterBuildingExtraTeam(palisadeWall, 'Franks', parseBuildingTeamParam(' ,+,0.0,-0,0x0,1e0'))).toEqual([]);
    expect(filterBuildingExtraTeam(palisadeWall, 'Franks', parseBuildingTeamParam('0,1,99'))).toEqual([0]);
    expect(filterBuildingExtraTeam(palisadeWall, 'Cumans', parseBuildingTeamParam('0'))).toEqual([]);
    expect(filterBuildingExtraTeam(outpostBld, 'Franks', parseBuildingTeamParam('0,1'))).toEqual([1]);

    // upgradePlan / upgradeComparison 对本方团队索引幂等去重
    const upEmpty = upgradePlan(simCtx, CORE.unitById, { uid: 542, civ: 'Romans', age: 4, techs: [], team: [] });
    const upLegacy = upgradePlan(simCtx, CORE.unitById, { uid: 542, civ: 'Romans', age: 4, techs: [], team: [romansIdx] });
    expect(upEmpty.ok && upLegacy.ok).toBe(true);
    if (upEmpty.ok && upLegacy.ok) {
      expect(upEmpty.spec.team).toEqual([]);
      expect(upLegacy.spec.team).toEqual([]);
      expect(upLegacy.S).toEqual(upEmpty.S);
      const cmp = upgradeComparison(
        simCtx,
        CORE.unitById,
        { uid: 542, civ: 'Romans', age: 4, techs: [], team: [] },
        { uid: 542, civ: 'Romans', age: 4, techs: [47], team: [romansIdx] },
        { uid: 542, civ: 'Khmer', age: 4, techs: [], team: [] },
        { uid: 542, civ: 'Khmer', age: 4, techs: [], team: [khmerIdx] },
      );
      expect(cmp.ok).toBe(true);
    }
  });

  it('mixedTrainingTransfer：本方常驻或旧链本方索引放行且同链，非本方 bt/eco 盟友继续拦截', () => {
    const cases: [string, string, string][] = [
      ['Romans', '542', '10'],
      ['Turks', '5', '10'],
      ['Gurjaras', '330', '10'],
      ['Magyars', '474', '10'],
    ];
    for (const [civ, uid, qty] of cases) {
      const ownIdx = String(unitTeamIndex(civ));
      const cleanInput = { civ, age: '4', techs: [] as string[], team: [] as string[], rows: [{ uid, qty }] };
      const legacyInput = { ...cleanInput, team: [ownIdx] };
      const cleanTransfer = mixedTrainingTransfer(prodCtx, cleanInput, 'a', resolveMixedSide(simCtx, CORE, cleanInput, 'a'));
      const legacyTransfer = mixedTrainingTransfer(prodCtx, legacyInput, 'a', resolveMixedSide(simCtx, CORE, legacyInput, 'a'));
      expect(cleanTransfer, `${civ} clean transfer`).toHaveProperty('to');
      expect(legacyTransfer, `${civ} legacy own team transfer`).toHaveProperty('to');
      if ('to' in cleanTransfer && 'to' in legacyTransfer) {
        expect(legacyTransfer.to).toBe(cleanTransfer.to);
        expect(legacyTransfer.notice.omitted).toEqual(cleanTransfer.notice.omitted);
      }
    }

    // 非本方含 bt 的额外盟友（土耳其 + 瞿折罗）仍保守拦截
    const gurjarasIdx = String(unitTeamIndex('Gurjaras'));
    const turksWithGurjaras = { civ: 'Turks', age: '4', techs: [] as string[], team: [gurjarasIdx], rows: [{ uid: '5', qty: '10' }] };
    const blocked = mixedTrainingTransfer(prodCtx, turksWithGurjaras, 'a', resolveMixedSide(simCtx, CORE, turksWithGurjaras, 'a'));
    expect(blocked).toMatchObject({ errors: [{ field: 'mix-a-team', message: expect.stringContaining('瞿折罗') }] });

    // 非本方纯战斗额外盟友（土耳其 + 高棉）放行并写入 omitted
    const khmerIdx = String(unitTeamIndex('Khmer'));
    const turksWithKhmer = { civ: 'Turks', age: '4', techs: [] as string[], team: [khmerIdx], rows: [{ uid: '5', qty: '10' }] };
    const allowedWithNote = mixedTrainingTransfer(prodCtx, turksWithKhmer, 'a', resolveMixedSide(simCtx, CORE, turksWithKhmer, 'a'));
    expect(allowedWithNote).toHaveProperty('to');
    if ('to' in allowedWithNote) {
      expect(allowedWithNote.notice.omitted).toContain('高棉：蝎式弩射程 +1（仅影响战斗）');
    }
  });
});
