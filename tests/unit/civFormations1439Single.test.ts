import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { groupFight } from '../../src/domain/duel';
import { resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { decodeDuelKite, decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { makeSimContext } from '../../src/domain/simulator';
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
type BudgetCase = readonly [civ: string, routeId: string, label: string, kite: KiteExpect, outcome: 'a' | 'b' | 'draw', alive: number, initial: number];
type ExplicitCase = readonly [civ: string, routeId: string, label: string, na: number, nb: number, winner: 'a' | 'b', alive: number, initial: number];

const BUDGET_CASES: readonly BudgetCase[] = [
  // Mongols
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 站桩对 30 名蒙古重装骑射手（负，敌剩 9/30）', null, 'b', 9, 30],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 站桩对 37 名匈奴重装骑射手（负，敌剩 20/37）', null, 'b', 20, 37],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 站桩对 30 名鞑靼重装骑射手（负，敌剩 17/30）', null, 'b', 17, 30],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 站桩对 42 名不列颠劲弩手（胜，剩 4/25）', null, 'a', 4, 25],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 站桩对 22 名法兰克游侠（负，游侠剩 1/22）', null, 'b', 1, 22],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 25 名精锐蒙古突骑 拉扯对 22 名法兰克游侠（胜，剩 23/25，40.0 格触顶）', [40.0, true], 'a', 23, 25],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 27 名精锐草原枪兵 对 22 名法兰克游侠（胜，剩 3/27）', null, 'a', 3, 27],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 27 名精锐草原枪兵 对 42 名日本冠军剑士（胜，剩 3/27）', null, 'a', 3, 27],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 27 名精锐草原枪兵 对 42 名不列颠劲弩手（胜，剩 6/27）', null, 'a', 6, 27],
  ['Mongols', 'mongols-mangudai-steppe-siege', '预算 3000 · 27 名蒙古精锐草原枪兵 对 27 名鞑靼精锐草原枪兵（平局）', null, 'draw', 0, 27],
  ['Mongols', 'mongols-hca-zero-castle', '预算 3000 · 30 名蒙古重装骑射手 拉扯对 22 名法兰克游侠（胜，剩 17/30，后撤 36.8 格）', [36.8, false], 'a', 17, 30],
  ['Mongols', 'mongols-hca-zero-castle', '预算 3000 · 25 名精锐蒙古突骑 站桩对 30 名蒙古重装骑射手（重骑射胜，剩 9/30）', null, 'b', 9, 30],

  // Huns
  ['Huns', 'huns-paladin-hca', '预算 3000 · 37 名匈奴重装骑射手 站桩对 42 名不列颠劲弩手（胜，剩 21/37）', null, 'a', 21, 37],
  ['Huns', 'huns-paladin-hca', '预算 3000 · 37 名匈奴重装骑射手 站桩对 30 名蒙古重装骑射手（胜，剩 16/37）', null, 'a', 16, 37],
  ['Huns', 'huns-paladin-hca', '预算 3000 · 37 名匈奴重装骑射手 拉扯对 22 名法兰克游侠（胜，剩 22/37，40.0 格触顶）', [40.0, true], 'a', 22, 37],
  ['Huns', 'huns-paladin-hca', '预算 3000 · 25 名精锐答刺罕骑兵 站桩对 42 名不列颠劲弩手（胜，剩 13/25）', null, 'a', 13, 25],

  // Tatars with Silk Armor
  ['Tatars', 'tatars-keshik-hca-trebuchet', '预算 3000 · 30 名丝护甲鞑靼重装骑射手 站桩对 37 名匈奴重装骑射手（胜，剩 9/30）', null, 'a', 9, 30],
  ['Tatars', 'tatars-keshik-hca-trebuchet', '预算 3000 · 30 名丝护甲鞑靼重装骑射手 站桩对 30 名蒙古重装骑射手（胜，剩 15/30）', null, 'a', 15, 30],
  ['Tatars', 'tatars-keshik-hca-trebuchet', '预算 3000 · 30 名丝护甲鞑靼重装骑射手 站桩对 25 名精锐蒙古突骑（胜，剩 17/30）', null, 'a', 17, 30],
  ['Tatars', 'tatars-keshik-hca-trebuchet', '预算 3000 · 30 名丝护甲鞑靼重装骑射手 站桩对 30 名契丹重装骑射手（胜，剩 19/30）', null, 'a', 19, 30],
  ['Tatars', 'tatars-keshik-hca-trebuchet', '预算 3000 · 30 名丝护甲鞑靼重装骑射手 站桩对 42 名不列颠劲弩手（胜，剩 22/30）', null, 'a', 22, 30],

  // Tatars zero-castle (no 687) vs castle-added (with 687)
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 零城堡无丝护甲 30 名鞑靼重装骑射手 对 37 名匈奴重装骑射手（负，敌剩 12/37）', null, 'b', 12, 37],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 零城堡无丝护甲 30 名鞑靼重装骑射手 对 30 名蒙古重装骑射手（胜，剩 8/30）', null, 'a', 8, 30],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 零城堡无丝护甲 30 名鞑靼重装骑射手 对 42 名不列颠劲弩手（胜，剩 18/30）', null, 'a', 18, 30],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 零城堡无丝护甲 27 名精锐草原枪兵 对 42 名不列颠劲弩手（胜，剩 10/27）', null, 'a', 10, 27],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 零城堡无丝护甲 27 名精锐草原枪兵 对 22 名法兰克游侠（胜，剩 1/27）', null, 'a', 1, 27],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 补城含丝护甲 27 名精锐草原枪兵 对 42 名不列颠劲弩手（胜，剩 14/27）', null, 'a', 14, 27],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 补城含丝护甲 27 名精锐草原枪兵 对 22 名法兰克游侠（胜，剩 3/27）', null, 'a', 3, 27],
  ['Tatars', 'tatars-steppe-hca-zero-castle', '预算 3000 · 补城含丝护甲 27 名精锐草原枪兵 对 42 名日本冠军剑士（胜，剩 3/27）', null, 'a', 3, 27],

  // Khitans
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '预算 3000 · 城堡 27 名契丹草原枪兵 对 22 名法兰克骑士（胜，剩 4/27）', null, 'a', 4, 27],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '预算 3000 · 27 名契丹精锐草原枪兵 对 22 名法兰克游侠（未计斡鲁朵回血，负，敌剩 2/22）', null, 'b', 2, 22],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '预算 3000 · 27 名契丹精锐草原枪兵 对 42 名日本冠军剑士（未计斡鲁朵回血，负，敌剩 4/42）', null, 'b', 4, 42],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '预算 3000 · 城堡 30 名契丹重装骑射手 对 33 名匈奴城堡骑射手（等资源负，敌剩 9/33）', null, 'b', 9, 33],
  [
    'Khitans',
    'khitans-steppe-mounted-trebuchet',
    '预算 3000 · 帝王 30 名契丹重装骑射手 拉扯对 22 名法兰克游侠（负，敌剩 2/22，40.0 格触顶）',
    [40.0, true],
    'b',
    2,
    22,
  ],
  ['Khitans', 'khitans-liaodao-rocket-cart', '预算 3000 · 37 名精锐辽刀兵（含札甲提示）对 42 名日本冠军剑士（未计流血反伤，负，敌剩 4/42）', null, 'b', 4, 42],
  ['Khitans', 'khitans-liaodao-rocket-cart', '预算 3000 · 37 名精锐辽刀兵（含札甲提示）对 22 名法兰克游侠（未计流血反伤，负，敌剩 2/22）', null, 'b', 2, 22],
];

const EXPLICIT_CASES: readonly ExplicitCase[] = [
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '30v30 · 城堡契丹重装骑射手 对日本城堡骑射手（负，敌剩 10/30）', 30, 30, 'b', 10, 30],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '30v30 · 城堡契丹重装骑射手 对蒙古城堡骑射手（负，敌剩 12/30）', 30, 30, 'b', 12, 30],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '30v30 · 城堡契丹重装骑射手 对鞑靼城堡骑射手（负，敌剩 9/30）', 30, 30, 'b', 9, 30],
  ['Khitans', 'khitans-steppe-mounted-trebuchet', '30v30 · 城堡契丹重装骑射手 对匈奴城堡骑射手（同数量胜，剩 9/30）', 30, 30, 'a', 9, 30],
];

describe('Issue 1439 草原骑射四国单兵站桩、拉扯与显式兵数 PK 领域回归', () => {
  it('全部 36 条预算 3000 与 4 条 30v30 链接解码、零城堡无丝护甲隔离及契丹札甲提示与引擎实算 100% 一致', async () => {
    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
    const ctx = makeSimContext(core.techs, trees);

    expect(BUDGET_CASES).toHaveLength(36);
    for (const [civ, routeId, label, kiteExpected, outcomeExpected, aliveExpected, initialExpected] of BUDGET_CASES) {
      const kaExpected = kiteExpected !== null;
      const params = paramsOf(linkFor(civ, routeId, label).href);
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.bud, kite.a, kite.b], label).toEqual(['r', 3000, kaExpected, false]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      if (label.includes('零城堡无丝护甲')) {
        expect(sideA.sel.has(687), `${label} must exclude Silk Armor 687`).toBe(false);
        if (sideA.u.id === 474) expect([sideA.S.ma, sideA.S.pa], label).toEqual([5, 6]);
        if (sideA.u.id === 1372) expect([sideA.S.ma, sideA.S.pa], label).toEqual([3, 6]);
      }
      if (label.includes('含札甲提示')) {
        expect(sideA.sel.has(1006), `${label} includes Lamellar Armor 1006`).toBe(true);
        const pills = detectUnitUnmodeled({
          unit: sideA.u,
          civ: sideA.spec.civ,
          age: sideA.spec.age,
          selectedTechs: [...sideA.sel].map((id) => core.techById[id]!).filter(Boolean),
        }).map((m) => m.pill);
        expect(pills, label).toEqual(['命中后持续伤害', '近战伤害反弹 · 札甲']);
      }

      const budgetA = resolveSideBudgetCount('r', sideA.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideA.u));
      const budgetB = resolveSideBudgetCount('r', sideB.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideB.u));
      expect([budgetA.error, budgetB.error], label).toEqual([null, null]);
      const fight = groupFight(sideA.F, budgetA.count!, sideB.F, budgetB.count!, kaExpected ? { kite: { a: true, b: false } } : undefined);
      if (outcomeExpected === 'draw') {
        expect(fight.status, label).toBe('draw');
        if (fight.status === 'draw') expect([fight.aAlive, fight.bAlive], label).toEqual([0, 0]);
        continue;
      }
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(outcomeExpected);
      expect([outcomeExpected === 'a' ? fight.aAlive : fight.bAlive, outcomeExpected === 'a' ? budgetA.count! : budgetB.count!], label).toEqual([
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

    expect(EXPLICIT_CASES).toHaveLength(4);
    for (const [civ, routeId, label, naExpected, nbExpected, winnerExpected, aliveExpected, initialExpected] of EXPLICIT_CASES) {
      const params = paramsOf(linkFor(civ, routeId, label).href);
      const decoded = decodeDuelParams(params);
      expect([decoded.mode, decoded.na, decoded.nb], label).toEqual(['n', naExpected, nbExpected]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const fight = groupFight(sideA.F, decoded.na, sideB.F, decoded.nb);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      expect([winnerExpected === 'a' ? fight.aAlive : fight.bAlive, winnerExpected === 'a' ? decoded.na : decoded.nb], label).toEqual([
        aliveExpected,
        initialExpected,
      ]);
    }
  });
});
