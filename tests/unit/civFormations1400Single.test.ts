import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { groupFight } from '../../src/domain/duel';
import { resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { decodeDuelKite, decodeDuelParams, decodeDuelRelics } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { makeSimContext } from '../../src/domain/simulator';
import { unitTrainCount } from '../../src/domain/trainBatch';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type SingleCase = readonly [
  civ: string,
  routeId: string,
  label: string,
  ka: boolean,
  kb: boolean,
  ra: number,
  rb: number,
  winner: 'a' | 'b' | 'draw',
  alive: number,
  initial: number,
  fullHp: boolean,
];

const SINGLE_CASES: readonly SingleCase[] = [
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对 42 个不列颠劲弩手（站桩胜，剩 31/38）', false, false, 0, 0, 'a', 31, 38, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对拉扯不列颠劲弩手 42 名（胜，剩 26/38）', false, true, 0, 0, 'a', 26, 38, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对拉扯马扎尔重装骑射手 30 名（胜，剩 15/38）', false, true, 0, 0, 'a', 15, 38, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对法兰克游侠 22 名（负，游侠剩 6/22）', false, false, 0, 0, 'b', 6, 22, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对条顿游侠 22 名（负，游侠剩 7/22）', false, false, 0, 0, 'b', 7, 22, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 精锐近卫军 38 名对 42 个日本冠军剑士（负，冠军剩 10/42）', false, false, 0, 0, 'b', 10, 42, false],
  [
    'Goths',
    'goths-huskarl-halberdier',
    '预算 3000 · 精锐近卫军 38 名对拉扯西班牙火枪手 31 名（负，火枪 31/31 满血零损）',
    false,
    true,
    0,
    0,
    'b',
    31,
    31,
    true,
  ],
  [
    'Goths',
    'goths-huskarl-halberdier',
    '预算 3000 · 精锐近卫军 38 名对拉扯波希米亚火枪手 31 名（负，火枪 31/31 满血零损）',
    false,
    true,
    0,
    0,
    'b',
    31,
    31,
    true,
  ],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 61 名冠军剑士 对精锐近卫军 38 名（胜，剩 12/61）', false, false, 0, 0, 'a', 12, 61, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 61 名冠军剑士 对 42 名条顿冠军剑士（胜，剩 1/61）', false, false, 0, 0, 'a', 1, 61, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 61 名冠军剑士 对 42 个日本冠军剑士（负，敌剩 2/42）', false, false, 0, 0, 'b', 2, 42, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 71 名长戟兵 对法兰克游侠 22 名（胜，剩 6/71）', false, false, 0, 0, 'a', 6, 71, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 71 名长戟兵 对条顿游侠 22 名（胜，剩 6/71）', false, false, 0, 0, 'a', 6, 71, false],
  ['Goths', 'goths-huskarl-halberdier', '预算 3000 · 71 名长戟兵 对圣物数 4 精锐烈堤司 25 名（胜，剩 2/71）', false, false, 0, 4, 'a', 2, 71, false],
  [
    'Teutons',
    'teutons-paladin-skirmisher',
    '预算 3000 · 条顿游侠 22 名对圣物数 0 精锐烈堤司 25 名（负，烈堤司剩 3/25）',
    false,
    false,
    0,
    0,
    'b',
    3,
    25,
    false,
  ],
  [
    'Teutons',
    'teutons-elite-knight-skirmisher',
    '预算 3000 · 26 名精锐条顿骑士 对圣物数 1 精锐烈堤司 25 名（负，烈堤司剩 1/25）',
    false,
    false,
    0,
    1,
    'b',
    1,
    25,
    false,
  ],
  [
    'Teutons',
    'teutons-elite-knight-skirmisher',
    '预算 3000 · 26 名精锐条顿骑士 对圣物数 2 精锐烈堤司 25 名（负，烈堤司剩 1/25）',
    false,
    false,
    0,
    2,
    'b',
    1,
    25,
    false,
  ],
  [
    'Teutons',
    'teutons-halberdier-handcannon',
    '预算 3000 · 50 名长戟兵 对圣物数 4 精锐烈堤司 25 名（负，烈堤司剩 1/25）',
    false,
    false,
    0,
    4,
    'b',
    1,
    25,
    false,
  ],
  ['Teutons', 'teutons-paladin-skirmisher', '预算 3000 · 50 名精锐掷矛手 对 30 名马扎尔重装骑射手（负，骑射剩 6/30）', false, false, 0, 0, 'b', 6, 30, false],
  [
    'Teutons',
    'teutons-paladin-skirmisher',
    '预算 3000 · 50 名精锐掷矛手 对拉扯不列颠劲弩手 42 名（负，劲弩 42/42 满血零损）',
    false,
    true,
    0,
    0,
    'b',
    42,
    42,
    true,
  ],
  [
    'Teutons',
    'teutons-elite-knight-skirmisher',
    '预算 3000 · 26 名精锐条顿骑士 对拉扯不列颠劲弩手 42 名（负，劲弩 42/42 满血零损）',
    false,
    true,
    0,
    0,
    'b',
    42,
    42,
    true,
  ],
  ['Teutons', 'teutons-paladin-skirmisher', '预算 3000 · 28 名重装骑马弩兵 对马扎尔翼骑 44 名（胜，剩 15/28）', false, false, 0, 0, 'a', 15, 28, false],
  ['Teutons', 'teutons-paladin-skirmisher', '预算 3000 · 28 名重装骑马弩兵 拉扯对 42 个日本冠军剑士（负，冠军剩 4/42）', true, false, 0, 0, 'b', 4, 42, false],
  ['Teutons', 'teutons-paladin-skirmisher', '预算 3000 · 28 名重装骑马弩兵 对 42 个不列颠劲弩手（负，劲弩剩 34/42）', false, false, 0, 0, 'b', 34, 42, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 34 名重装骆驼兵 对法兰克游侠 22 名（胜，剩 1/34）', false, false, 0, 0, 'a', 1, 34, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 20 名精锐甲胄骑兵 对 50 个法兰克长戟兵（胜，剩 6/20，未计践踏）', false, false, 0, 0, 'a', 6, 20, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 20 名精锐甲胄骑兵 对 42 个日本冠军剑士（胜，剩 4/20，未计践踏）', false, false, 0, 0, 'a', 4, 20, false],
  [
    'Byzantines',
    'byzantines-cataphract',
    '预算 3000 · 20 名精锐甲胄骑兵 对哥特精锐近卫军 38 名（胜，剩 9/20，未计践踏）',
    false,
    false,
    0,
    0,
    'a',
    9,
    20,
    false,
  ],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 20 名精锐甲胄骑兵 对法兰克游侠 22 名（负，游侠剩 6/22）', false, false, 0, 0, 'b', 6, 22, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 20 名精锐甲胄骑兵 对条顿游侠 22 名（负，游侠剩 8/22）', false, false, 0, 0, 'b', 8, 22, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 66 名精锐掷矛手 对 50 名越南帝王掷矛手（胜，剩 18/66）', false, false, 0, 0, 'a', 18, 66, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 66 名精锐掷矛手 对 50 名立陶宛精锐掷矛手（胜，剩 41/66）', false, false, 0, 0, 'a', 41, 66, false],
  ['Byzantines', 'byzantines-cataphract', '预算 3000 · 66 名精锐掷矛手 对拉扯不列颠劲弩手 42 名（负，劲弩剩 37/42）', false, true, 0, 0, 'b', 37, 42, false],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '预算 3000 · 31 名火枪手 拉扯对 42 个日本冠军剑士（31/31 满血零损）',
    true,
    false,
    0,
    0,
    'a',
    31,
    31,
    true,
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '预算 3000 · 42 名劲弩手 拉扯对 50 个法兰克长戟兵（42/42 满血零损）',
    true,
    false,
    0,
    0,
    'a',
    42,
    42,
    true,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对法兰克游侠 22 名（胜，剩 2/25，一维接敌模型）',
    false,
    false,
    0,
    0,
    'a',
    2,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对条顿游侠 22 名（胜，剩 3/25，一维接敌模型）',
    false,
    false,
    0,
    0,
    'a',
    3,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对 42 个日本冠军剑士（胜，剩 1/25，一维接敌模型）',
    false,
    false,
    0,
    0,
    'a',
    1,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 4 · 精锐烈堤司 25 名对 42 个不列颠劲弩手（胜，剩 7/25，一维接敌模型）',
    false,
    false,
    4,
    0,
    'a',
    7,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 4 · 精锐烈堤司 25 名对 50 个法兰克长戟兵（胜，剩 1/25，一维接敌模型）',
    false,
    false,
    4,
    0,
    'a',
    1,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 1 · 精锐烈堤司 25 名对 26 名精锐条顿骑士（胜，剩 1/25，一维接敌模型）',
    false,
    false,
    1,
    0,
    'a',
    1,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 4 · 精锐烈堤司 25 名对 26 名精锐条顿骑士（胜，剩 3/25，一维接敌模型）',
    false,
    false,
    4,
    0,
    'a',
    3,
    25,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 游侠 22 名对 42 个不列颠劲弩手（胜，剩 5/22，一维接敌模型）',
    false,
    false,
    0,
    0,
    'a',
    5,
    22,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 2 · 游侠 22 名对法兰克游侠 22 名（负，法兰克游侠剩 1/22，一维接敌模型）',
    false,
    false,
    2,
    0,
    'b',
    1,
    22,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 3 · 游侠 22 名对法兰克游侠 22 名（双方同归于尽，一维接敌模型）',
    false,
    false,
    3,
    0,
    'draw',
    0,
    22,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 游侠 22 名对条顿游侠 22 名（负，条顿游侠剩 4/22，一维接敌模型）',
    false,
    false,
    0,
    0,
    'b',
    4,
    22,
    false,
  ],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '圣物数 4 · 游侠 22 名对条顿游侠 22 名（双方战平，一维接敌模型）', false, false, 4, 0, 'draw', 0, 22, false],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '预算 3000 · 50 名精锐掷矛手 对拉扯不列颠劲弩手 42 名（胜，剩 36/50）',
    false,
    true,
    0,
    0,
    'a',
    36,
    50,
    false,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '预算 3000 · 30 名重装骑射手 拉扯对 50 个法兰克长戟兵（30/30 满血零损）',
    true,
    false,
    0,
    0,
    'a',
    30,
    30,
    true,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '预算 3000 · 30 名重装骑射手 拉扯对 42 个日本冠军剑士（胜，剩 23/30）',
    true,
    false,
    0,
    0,
    'a',
    23,
    30,
    false,
  ],
  ['Poles', 'poles-obuch-winged-hussar', '预算 3000 · 50 名长枪兵 对法兰克游侠 22 名（负，游侠剩 2/22）', false, false, 0, 0, 'b', 2, 22, false],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 28 名重装骑马弩兵 对 42 名劲弩手（负，劲弩剩 23/42）', false, false, 0, 0, 'b', 23, 42, false],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 42 名劲弩手 对 26 名印度斯坦帝王骆驼兵（胜，剩 25/42）', false, false, 0, 0, 'a', 25, 42, false],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '预算 3000 · 28 名重装骑马弩兵 拉扯对 26 名印度斯坦帝王骆驼兵（负，帝王骆驼剩 10/26）',
    true,
    false,
    0,
    0,
    'b',
    10,
    26,
    false,
  ],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对 50 个法兰克长戟兵（胜，剩 20/28）', true, false, 0, 0, 'a', 20, 28, false],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对 42 个日本冠军剑士（胜，剩 20/28）', true, false, 0, 0, 'a', 20, 28, false],
  ['Poles', 'poles-discount-knights', '城堡时代预算 3000 · 33 名骑士 对 22 名法兰克骑士（胜，剩 3/33）', false, false, 0, 0, 'a', 3, 33, false],
];

describe('#1400 第一档批 1 五国单兵与拉扯预算 3000 群战回归', () => {
  it('全部 57 条新增单兵、圣物与拉扯链接解码与 DE 188329 领域引擎实算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    expect(SINGLE_CASES).toHaveLength(57);

    for (const [civ, routeId, label, ka, kb, ra, rb, winnerExpected, aliveExpected, initialExpected, fullHpExpected] of SINGLE_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      const relics = decodeDuelRelics(params);

      expect([decoded.mode, decoded.bud, kite.a, kite.b, relics.a, relics.b], label).toEqual(['r', 3000, ka, kb, ra, rb]);

      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.a);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.b);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      const bA = resolveSideBudgetCount('r', sideA.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideA.u));
      const bB = resolveSideBudgetCount('r', sideB.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideB.u));
      expect([bA.error, bB.error], label).toEqual([null, null]);

      const fight = groupFight(sideA.F, bA.count!, sideB.F, bB.count!, ka || kb ? { kite: { a: ka, b: kb } } : undefined);
      if (winnerExpected === 'draw') {
        expect(fight.status, label).toBe('draw');
        expect(bA.count, label).toBe(initialExpected);
        continue;
      }
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      const alive = fight.winner === 'a' ? fight.aAlive : fight.bAlive;
      const initial = fight.winner === 'a' ? bA.count! : bB.count!;
      expect([alive, initial], label).toEqual([aliveExpected, initialExpected]);
      if (fullHpExpected) {
        const winnerHp = fight.winner === 'a' ? sideA.F.hp : sideB.F.hp;
        expect(fight.hpLeft, `${label} full HP`).toBe(initial * winnerHp);
      }
    }
  });
});
