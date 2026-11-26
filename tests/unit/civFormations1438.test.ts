import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { militaryTechAge } from '../../src/domain/availabilityAge';
import { duel, groupFight, oneVOneFight } from '../../src/domain/duel';
import { resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { decodeDuelKite, decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { applicableSimCostTechs, mergeSimCostTechs } from '../../src/domain/simEffectiveCost';
import { makeSimContext, parseUnitPath, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { unitTrainCount } from '../../src/domain/trainBatch';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const linkFor = (civ: string, routeId: string, label: string) => {
  const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
  expect(link, `${civ}/${routeId} missing link: ${label}`).toBeDefined();
  return link!;
};
const paramsOf = (href: string) => new URLSearchParams(new URL(href).hash.split('?')[1] ?? '');

type KiteExpect = readonly [retreated: number, capHit: boolean] | null;
type ExplicitCase = readonly [string, string, string, number, number, KiteExpect, 'a' | 'b', number, number];
type BudgetCase = readonly [string, string, string, KiteExpect, 'a' | 'b', number, number];

const TUPI_EXPLICIT: readonly ExplicitCase[] = [
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个不列颠劲弩手（胜，剩 61/120）', 120, 60, null, 'a', 61, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个日本劲弩手（胜，剩 81/120）', 120, 60, null, 'a', 81, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个西班牙翼骑兵（胜，剩 81/120）', 120, 60, null, 'a', 81, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个土耳其翼骑兵（胜，剩 9/120）', 120, 60, null, 'a', 9, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 拉扯对 60 个土耳其翼骑兵（胜，剩 25/120）', 120, 60, [7.9, false], 'a', 25, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个日本冠军剑士（胜，剩 18/120）', 120, 60, null, 'a', 18, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 个法兰克长戟兵（胜，剩 118/120）', 120, 60, null, 'a', 118, 120],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对法兰克游侠 60 名（负，游侠剩 44/60）', 120, 60, null, 'b', 44, 60],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 拉扯对法兰克游侠 60 名（负，游侠剩 42/60）', 120, 60, [10.1, false], 'b', 42, 60],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 名精锐掷矛手（负，掷矛剩 26/60）', 120, 60, null, 'b', 26, 60],
  ['Tupi', 'tupi-blackwood-halberdier', '同人口 60 · 120 只精锐黑檀木步弓手 站桩对 60 名日本重装骑射手（负，骑射剩 48/60）', 120, 60, null, 'b', 48, 60],
];

const MUISCA_EXPLICIT: readonly ExplicitCase[] = [
  ['Muisca', 'muisca-arbalester-temple-champi', '42v42 · 穆伊斯卡劲弩手 站桩对日本劲弩手（负，敌剩 20/42）', 42, 42, null, 'b', 20, 42],
  ['Muisca', 'muisca-arbalester-temple-champi', '42v50 · 穆伊斯卡劲弩手 站桩对西班牙精锐掷矛手（负，掷矛剩 41/50）', 42, 50, null, 'b', 41, 50],
  ['Muisca', 'muisca-arbalester-skirmisher', '42v42 · 穆伊斯卡劲弩手 站桩对日本劲弩手（负，敌剩 20/42）', 42, 42, null, 'b', 20, 42],
  ['Muisca', 'muisca-arbalester-skirmisher', '42v50 · 穆伊斯卡劲弩手 站桩对西班牙精锐掷矛手（负，掷矛剩 41/50）', 42, 50, null, 'b', 41, 50],
];

const CAVALRY_ARCHER_EXPLICIT: readonly ExplicitCase[] = [
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '30v30 · 保加利亚重装骑射手 对女真重装骑射手（胜，剩 9/30）', 30, 30, null, 'a', 9, 30],
  ['Jurchens', 'jurchens-steppe-siege-field', '30v30 · 女真重装骑射手 对保加利亚重装骑射手（负，保加利亚剩 9/30）', 30, 30, null, 'b', 9, 30],
];

const JAPANESE_BUDGET: readonly BudgetCase[] = [
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名日本重装骑射手 站桩对法兰克游侠 22 名（负，游侠剩 2/22）', null, 'b', 2, 22],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名蒙古重装骑射手 站桩对法兰克游侠 22 名（胜，剩 3/30）', null, 'a', 3, 30],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名蒙古重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 17/30）', [36.8, false], 'a', 17, 30],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 37 名匈奴重装骑射手 站桩对法兰克游侠 22 名（胜，剩 10/37）', null, 'a', 10, 37],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 37 名匈奴重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 22/37）', [40.0, true], 'a', 22, 37],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名马扎尔重装骑射手 站桩对法兰克游侠 22 名（胜，剩 10/30）', null, 'a', 10, 30],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名马扎尔重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 19/30）', [40.0, true], 'a', 19, 30],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名土耳其重装骑射手 站桩对法兰克游侠 22 名（胜，剩 6/30）', null, 'a', 6, 30],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名土耳其重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 15/30）', [40.0, true], 'a', 15, 30],
];

const LATE_CAVALRY_BUDGET: readonly BudgetCase[] = [
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名保加利亚重装骑射手 站桩对 42 个不列颠劲弩手（胜，剩 4/30）', null, 'a', 4, 30],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名女真重装骑射手 站桩对 42 个不列颠劲弩手（负，劲弩剩 15/42）', null, 'b', 15, 42],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 30 名女真重装骑射手 站桩对 42 个不列颠劲弩手（负，劲弩剩 15/42）', null, 'b', 15, 42],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名女真重装骑射手 拉扯对 42 个日本冠军剑士（胜，剩 12/30）', [35.7, false], 'a', 12, 30],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 30 名女真重装骑射手 拉扯对 42 个日本冠军剑士（胜，剩 12/30）', [35.7, false], 'a', 12, 30],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 27 名精锐草原枪兵 对 22 名保加利亚重装骑士（胜，剩 7/27）', null, 'a', 7, 27],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 27 名精锐草原枪兵 对 22 名保加利亚重装骑士（胜，剩 7/27）', null, 'a', 7, 27],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 27 名草原枪兵 对 22 名保加利亚骑士（城堡，胜，剩 3/27）', null, 'a', 3, 27],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 27 名草原枪兵 对 22 名保加利亚骑士（城堡，胜，剩 3/27）', null, 'a', 3, 27],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 37 名马镫翼骑兵 对 37 名女真翼骑兵（胜，剩 1/37）', null, 'a', 1, 37],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 37 名女真翼骑兵 对 37 名马镫翼骑兵（负，保加利亚剩 1/37）', null, 'b', 1, 37],
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '预算 3000 · 30 名未研扳指保加利亚骑射手 对 30 名女真骑射手（城堡，负，女真剩 13/30）',
    null,
    'b',
    13,
    30,
  ],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 30 名女真骑射手 对 30 名未研扳指保加利亚骑射手（城堡，胜，剩 13/30）', null, 'a', 13, 30],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名保加利亚骑射手（含扳指）对 30 名女真骑射手（城堡，胜，剩 20/30）', null, 'a', 20, 30],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 30 名女真骑射手 对 30 名保加利亚骑射手（含扳指）（城堡，负，保加利亚剩 20/30）', null, 'b', 20, 30],
];

describe('#1438 六国策略反馈同步专项回归', () => {
  it('同人口与 30v30 新增复现链接均按 URL 显式数量解码并与领域引擎（含拉扯距离）一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    const cases = [...TUPI_EXPLICIT, ...MUISCA_EXPLICIT, ...CAVALRY_ARCHER_EXPLICIT];
    expect(cases).toHaveLength(17);

    for (const [civ, routeId, label, naExpected, nbExpected, kiteExpected, winnerExpected, aliveExpected, initialExpected] of cases) {
      const kaExpected = kiteExpected !== null;
      const params = paramsOf(linkFor(civ, routeId, label).href);
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.na, decoded.nb, kite.a, kite.b], label).toEqual(['n', naExpected, nbExpected, kaExpected, false]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const fight = groupFight(sideA.F, decoded.na, sideB.F, decoded.nb, kaExpected ? { kite: { a: true, b: false } } : undefined);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      expect([winnerExpected === 'a' ? fight.aAlive : fight.bAlive, winnerExpected === 'a' ? decoded.na : decoded.nb], label).toEqual([
        aliveExpected,
        initialExpected,
      ]);
      if (kiteExpected) {
        const [retreated, capHit] = kiteExpected;
        expect(fight.contact.kite?.a.triggered, `${label} kite triggered`).toBe(true);
        expect(fight.contact.kite?.a.retreated, `${label} kite retreated`).toBeCloseTo(retreated, 1);
        expect(fight.contact.kite?.a.capHit, `${label} kite capHit`).toBe(capHit);
      }
    }
  });

  it('日本五国骑射横评与保加利亚／女真后期对照新增链接均按预算解码并与领域引擎（含拉扯距离）一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    const cases = [...JAPANESE_BUDGET, ...LATE_CAVALRY_BUDGET];
    expect(cases).toHaveLength(24);

    for (const [civ, routeId, label, kiteExpected, winnerExpected, aliveExpected, initialExpected] of cases) {
      const kaExpected = kiteExpected !== null;
      const params = paramsOf(linkFor(civ, routeId, label).href);
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.bud, kite.a, kite.b], label).toEqual(['r', 3000, kaExpected, false]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const budgetA = resolveSideBudgetCount('r', sideA.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideA.u));
      const budgetB = resolveSideBudgetCount('r', sideB.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideB.u));
      expect([budgetA.error, budgetB.error], label).toEqual([null, null]);
      const fight = groupFight(sideA.F, budgetA.count!, sideB.F, budgetB.count!, kaExpected ? { kite: { a: true, b: false } } : undefined);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      expect([winnerExpected === 'a' ? fight.aAlive : fight.bAlive, winnerExpected === 'a' ? budgetA.count! : budgetB.count!], label).toEqual([
        aliveExpected,
        initialExpected,
      ]);
      if (kiteExpected) {
        const [retreated, capHit] = kiteExpected;
        expect(fight.contact.kite?.a.triggered, `${label} kite triggered`).toBe(true);
        expect(fight.contact.kite?.a.retreated, `${label} kite retreated`).toBeCloseTo(retreated, 1);
        expect(fight.contact.kite?.a.capHit, `${label} kite capHit`).toBe(capHit);
      }
    }
  });

  it('穆伊斯卡 5/2 甲 1v1 静态/接敌双口径、日本护甲类扫描与西班牙 10 国重装骑马弩 URL 面板均与固定数据一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    for (const [label, staticDur, contactDur, postMeleeDur, dmg, hits] of [
      ['1v1 · 西班牙翼骑兵 对日本劲弩手（击杀用时 7.6 秒）', 7.6, 13.33, 8.1, 8, 5],
      ['1v1 · 西班牙翼骑兵 对穆伊斯卡劲弩手（击杀用时 11.4 秒）', 11.4, 17.11, 11.9, 6, 7],
    ] as const) {
      const params = paramsOf(linkFor('Muisca', 'muisca-arbalester-temple-champi', label).href);
      expect(decodeDuelParams(params).mode, label).toBe('1');
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const staticResult = duel(sideA.F, sideB.F);
      expect([staticResult.outcome, staticResult.winner], label).toEqual(['win', 'a']);
      expect(staticResult.duration, `${label} static`).toBeCloseTo(staticDur, 5);
      expect([staticResult.ab.dmg, staticResult.ab.hits], label).toEqual([dmg, hits]);

      const contactResult = oneVOneFight(sideA.F, sideB.F);
      expect(contactResult.mode, `${label} contact mode`).toBe('contact');
      if (contactResult.mode === 'contact') {
        expect([contactResult.status, contactResult.winner], `${label} contact win`).toEqual(['win', 'a']);
        expect(contactResult.duration, `${label} contact duration`).toBeCloseTo(contactDur, 1);
        expect(contactResult.contact.meleeAt, `${label} meleeAt`).not.toBeNull();
        expect(contactResult.duration - (contactResult.contact.meleeAt ?? 0), `${label} post-melee`).toBeCloseTo(postMeleeDur, 1);
      }
    }

    const japaneseHca = resolve(ctx, core.unitById, parseSide('474.Japanese.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    expect(isUnavail(japaneseHca)).toBe(false);
    if (!isUnavail(japaneseHca)) {
      expect(japaneseHca.F.attack['弓手']).toBe(2);
      expect(japaneseHca.F.attack['掷矛手']).toBe(-2);
    }
    const units = Object.values(core.unitById);
    const hasClass = (unit: (typeof units)[number], name: string) => unit.armc.some(([cls]) => cls === name);
    const archerOnly = units.filter((unit) => hasClass(unit, '弓手') && !hasClass(unit, '掷矛手'));
    const archerAndSkirmisher = units.filter((unit) => hasClass(unit, '弓手') && hasClass(unit, '掷矛手'));
    expect(archerOnly).toHaveLength(47);
    expect(archerAndSkirmisher).toHaveLength(8);
    for (const id of [5, 773])
      expect(
        archerOnly.some((unit) => unit.id === id),
        `archer-only ${id}`,
      ).toBe(true);
    for (const id of [6, 185, 1012, 2562, 2564])
      expect(
        archerAndSkirmisher.some((unit) => unit.id === id),
        `archer+skirmisher ${id}`,
      ).toBe(true);

    // 按真实 useSimState URL 解析逻辑验证西班牙与波兰「满科技模拟」链接（避免空 tech URL 回退零科技面板）
    const verifySimPanelUrl = (label: string, expectedCiv: string, expectedMa: number, expectedPa: number) => {
      const href = linkFor('Spanish', 'spanish-hmc-hussar', label).href;
      const hash = new URL(href).hash.slice(1);
      const [pathname, search = ''] = hash.split('?');
      expect(new URLSearchParams(search).get('tab'), label).toBe('sim');
      const rt = parseUnitPath(pathname!);
      expect(rt, `${label} parseUnitPath`).not.toBeNull();
      expect([rt!.id, rt!.civ, rt!.age], label).toEqual([2701, expectedCiv, 4]);
      const unit = core.unitById[rt!.id]!;
      const costTechs = applicableSimCostTechs(ctx, unit, expectedCiv);
      const costTechIds = new Set(costTechs.map((item) => item.tech.id));
      const avail = mergeSimCostTechs(simTechs(ctx, unit, expectedCiv), costTechs);
      const ok = new Set(
        avail.filter((x) => (x.ef || costTechIds.has(x.t.id)) && militaryTechAge(expectedCiv, x.t.id, x.t.age) <= rt!.age!).map((x) => x.t.id),
      );
      const sel = new Set(rt!.ids.filter((id) => ok.has(id)));
      const preset = presetUpTo(simTechs(ctx, unit, expectedCiv), 4, expectedCiv);
      expect(
        [...sel].sort((a, b) => a - b),
        `${label} full-tech selection`,
      ).toEqual([...preset].sort((a, b) => a - b));
      const stats = simulate(ctx, unit, expectedCiv, 4, sel, new Set(rt!.team));
      expect(stats, label).toMatchObject({ ma: expectedMa, pa: expectedPa, rng: 7, acc: 100 });
      expect(stats.rof, label).toBeCloseTo(2.25, 5);
      expect((stats.atk * stats.acc) / 100 / stats.rof, label).toBeCloseTo(5.33, 2);
      expect(stats.bonus['步兵'] ?? 0, label).toBe(0);
    };
    verifySimPanelUrl('重装骑马弩兵（西班牙 · 满科技模拟）', 'Spanish', 5, 4);
    verifySimPanelUrl('重装骑马弩兵（波兰 · 满科技模拟）', 'Poles', 4, 2);

    const hmcCivs = ['Britons', 'Celts', 'Danes', 'Franks', 'Poles', 'Saxons', 'Sicilians', 'Spanish', 'Teutons', 'Varangians'] as const;
    expect(core.unitById[2701]!.civs).toEqual([...hmcCivs]);
    for (const civ of ['Spanish', 'Danes', 'Saxons', 'Poles'] as const) {
      const unit = core.unitById[2701]!;
      const techs = presetUpTo(simTechs(ctx, unit, civ), 4, civ);
      const stats = simulate(ctx, unit, civ, 4, techs, new Set());
      expect(stats.rof, civ).toBeCloseTo(2.25, 5);
      expect(stats.acc, civ).toBe(100);
      expect((stats.atk * stats.acc) / 100 / stats.rof, civ).toBeCloseTo(5.33, 2);
    }
  });

  it('本轮状态、认可留痕与关键避坑文案不落为实战承诺，保女城堡兵种与穆伊斯卡计时口径严格一致', () => {
    expect(route('Tupi', 'tupi-blackwood-halberdier').playtest).toBe('reported');
    expect(route('Tupi', 'tupi-blackwood-halberdier').evidence.recognition).toContain('明确实战使用过纯精锐黑檀木步弓手');
    expect(route('Tupi', 'tupi-blackwood-halberdier').evidence.playtest).toContain('箭毒持续伤害与战败返还 15% 资源未建模');
    for (const [civ, routeId] of [
      ['Muisca', 'muisca-arbalester-temple-champi'],
      ['Muisca', 'muisca-arbalester-skirmisher'],
      ['Japanese', 'japanese-halberdier-hca-trebuchet'],
      ['Spanish', 'spanish-hmc-hussar'],
      ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege'],
      ['Jurchens', 'jurchens-steppe-siege-field'],
    ] as const) {
      const r = route(civ, routeId);
      expect(r.playtest, `${civ}/${routeId}`).toBe('pending');
      expect(r.evidence.recognition, `${civ}/${routeId}`).toBeTruthy();
      expect(r.evidence.recordedVersion, `${civ}/${routeId}`).toContain('v0.99.58 · DE 188329');
    }

    const muiscaMain = route('Muisca', 'muisca-arbalester-temple-champi');
    expect(muiscaMain.evidence.scope).toContain('刀数 +40%');
    expect(muiscaMain.evidence.scope).toContain('静态首刀命中后击杀用时 11.4 秒，较日本劲弩 +50%');
    expect(muiscaMain.evidence.scope).toContain('13.3 至 17.1 秒');
    expect(muiscaMain.evidence.scope).toContain('近战接敌至倒地约 8.1 至 11.9 秒');
    expect(muiscaMain.evidence.scope).not.toContain('存活时间 +50%');
    const muiscaSkirm = route('Muisca', 'muisca-arbalester-skirmisher');
    expect(muiscaSkirm.evidence.scope).toContain('静态首刀命中后击杀用时 7.6 秒升至 11.4 秒，较日本劲弩 +50%');
    expect(muiscaSkirm.evidence.scope).toContain('13.3 至 17.1 秒');
    expect(muiscaSkirm.evidence.scope).toContain('近战接敌至倒地约 8.1 至 11.9 秒');
    expect(muiscaSkirm.evidence.scope).not.toContain('存活时间 +50%');
    expect(route('Tupi', 'tupi-blackwood-halberdier').evidence.sourceLines).toEqual(expect.arrayContaining([1432, 1433, 1434, 1435]));

    for (const [civ, routeId] of [
      ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege'],
      ['Jurchens', 'jurchens-steppe-siege-field'],
    ] as const) {
      const r = route(civ, routeId);
      const joined = [r.reason, r.limitation, r.evidence.scope].join('\n');
      expect(joined, `${civ} castle ordinary steppe lancer`).toContain('城堡时代普通草原枪兵');
      expect(joined, `${civ} hussar 37v37`).toContain('37v37');
      expect(joined, `${civ} castle CA 13/30`).toContain('13/30');
      expect(joined, `${civ} castle CA 20/30`).toContain('20/30');
      expect(joined, `${civ} no elite steppe lancer in castle`).not.toMatch(/精锐草原枪兵对保加利亚骑士|精锐草原枪兵[^。\n]{0,12}在城堡/);
    }

    const japaneseHcaRoute = route('Japanese', 'japanese-halberdier-hca-trebuchet');
    expect(japaneseHcaRoute.reason).toContain('47 个单位不逐项穷尽');
    expect([japaneseHcaRoute.reason, japaneseHcaRoute.evidence.scope, ...japaneseHcaRoute.required.map(({ role }) => role)].join('\n')).not.toMatch(
      /对除掷矛外远程|对远程 \+2/,
    );
    expect(route('Spanish', 'spanish-hmc-hussar').reason).toContain('丹麦人、撒克逊人、波兰');
    expect(route('Spanish', 'spanish-hmc-hussar').limitation).toContain('射程 +1 与对步兵攻击 +2');
    expect(route('Jurchens', 'jurchens-steppe-siege-field').limitation).toContain('大后期不建议走骑射主轴');
  });
});
