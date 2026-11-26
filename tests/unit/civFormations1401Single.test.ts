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
  winner: 'a' | 'b',
  alive: number,
  initial: number,
  fullHp: boolean,
  opts?: {
    expectBatchesA?: number;
    expectCountA?: number;
    expectSpendA?: number;
    expectNoTechA?: number;
    expectHasTechA?: number;
  },
];

const SINGLE_CASES: readonly SingleCase[] = [
  // Muisca (12)
  ['Muisca', 'muisca-temple-guard-slinger', '预算 3000 · 精锐神庙护卫 26 名对法兰克游侠 22 名（胜，剩 4/26）', false, false, 'a', 4, 26, false],
  ['Muisca', 'muisca-temple-guard-slinger', '预算 3000 · 50 名长枪兵 对法兰克游侠 22 名（负，游侠剩 4/22）', false, false, 'b', 4, 22, false],
  ['Muisca', 'muisca-temple-guard-slinger', '预算 3000 · 精锐格查战士 27 名对穆伊斯卡精锐掷矛手 50 名（负，掷矛剩 7/50）', false, false, 'b', 7, 50, false],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '预算 3000 · 42 名劲弩手（含草药学）拉扯对法兰克游侠 22 名（胜，剩 10/42）',
    true,
    false,
    'a',
    10,
    42,
    false,
    { expectHasTechA: 1365 },
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '预算 3000 · 42 名劲弩手（含草药学）拉扯对 42 个日本冠军剑士（42/42 满血零损）',
    true,
    false,
    'a',
    42,
    42,
    true,
    { expectHasTechA: 1365 },
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '预算 3000 · 42 名劲弩手（含草药学）拉扯对 50 个法兰克长戟兵（42/42 满血零损）',
    true,
    false,
    'a',
    42,
    42,
    true,
    { expectHasTechA: 1365 },
  ],
  ['Muisca', 'muisca-arbalester-temple-champi', '预算 3000 · 42 名劲弩手 站桩对 42 个不列颠劲弩手（负，敌剩 28/42）', false, false, 'b', 28, 42, false],
  ['Muisca', 'muisca-arbalester-temple-champi', '预算 3000 · 精锐蔷琵战士 40 名对拉扯不列颠劲弩手 42 名（胜，剩 9/40）', false, true, 'a', 9, 40, false],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '预算 3000 · 42 名劲弩手（无草药学）拉扯对法兰克游侠 22 名（胜，剩 7/42）',
    true,
    false,
    'a',
    7,
    42,
    false,
    { expectNoTechA: 1365 },
  ],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '预算 3000 · 42 名劲弩手（无草药学）站桩对 42 个日本冠军剑士（胜，剩 15/42）',
    false,
    false,
    'a',
    15,
    42,
    false,
    { expectNoTechA: 1365 },
  ],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '预算 3000 · 42 名劲弩手（无草药学）拉扯对 42 个日本冠军剑士（胜，剩 40/42）',
    true,
    false,
    'a',
    40,
    42,
    false,
    { expectNoTechA: 1365 },
  ],
  ['Muisca', 'muisca-arbalester-skirmisher', '预算 3000 · 50 名精锐掷矛手 对拉扯不列颠劲弩手 42 名（负，劲弩 42/42 满血零损）', false, true, 'b', 42, 42, true],

  // Spanish (10)
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名拉扯对法兰克游侠 22 名（胜，剩 7/22）', true, false, 'a', 7, 22, false],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名拉扯对印度斯坦帝王骆驼兵 26 名（负，帝王骆驼剩 7/26）', true, false, 'b', 7, 26, false],
  ['Spanish', 'handcannon-halberdier', '预算 3000 · 31 名火枪手 拉扯对印度斯坦帝王骆驼兵 26 名（胜，剩 15/31）', true, false, 'a', 15, 31, false],
  ['Spanish', 'handcannon-halberdier', '预算 3000 · 31 名火枪手 拉扯对 42 个日本冠军剑士（31/31 满血零损）', true, false, 'a', 31, 31, true],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 站桩对精锐西班牙征服者 22 名（胜，剩 8/28）', false, false, 'a', 8, 28, false],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对精锐西班牙征服者 22 名（胜，剩 15/28）', true, false, 'a', 15, 28, false],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对 50 个法兰克长戟兵（胜，剩 23/28）', true, false, 'a', 23, 28, false],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对 42 个日本冠军剑士（胜，剩 20/28）', true, false, 'a', 20, 28, false],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对法兰克游侠 22 名（负，游侠剩 5/22）', true, false, 'b', 5, 22, false],
  ['Spanish', 'spanish-hmc-hussar', '预算 3000 · 28 名重装骑马弩兵 拉扯对印度斯坦帝王骆驼兵 26 名（负，帝王骆驼剩 10/26）', true, false, 'b', 10, 26, false],

  // Japanese (12)
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 42 个不列颠劲弩手（胜，剩 20/30）', false, false, 'a', 20, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 对拉扯不列颠劲弩手 42 名（胜，剩 11/30）', false, true, 'a', 11, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 30 名蒙古重装骑射手（胜，剩 17/30）', false, false, 'a', 17, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 37 名匈奴重装骑射手（胜，剩 11/30）', false, false, 'a', 11, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 30 名鞑靼重装骑射手（胜，剩 11/30）', false, false, 'a', 11, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 30 名马扎尔重装骑射手（胜，剩 8/30）', false, false, 'a', 8, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对 30 名土耳其重装骑射手（胜，剩 7/30）', false, false, 'a', 7, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 站桩对西班牙火枪手 31 名（胜，剩 23/30）', false, false, 'a', 23, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 拉扯对 50 个法兰克长戟兵（30/30 满血零损）', true, false, 'a', 30, 30, true],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 拉扯对 42 个日本冠军剑士（胜，剩 24/30）', true, false, 'a', 24, 30, false],
  ['Japanese', 'japanese-halberdier-hca-trebuchet', '预算 3000 · 30 名重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 12/30）', true, false, 'a', 12, 30, false],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '预算 3000 · 30 名重装骑射手 站桩对西班牙精锐掷矛手 50 名（负，掷矛剩 35/50）',
    false,
    false,
    'b',
    35,
    50,
    false,
  ],

  // Bulgarians (15)
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对条顿游侠 22 名（骑马阶段游侠剩 4/22）', false, false, 'b', 4, 22, false],
  [
    'Bulgarians',
    'bulgarians-krepost-konnik',
    '预算 3000 · 23 个精锐保加利亚骑兵 对拉扯不列颠劲弩手 42 名（骑马阶段劲弩剩 18/42）',
    false,
    true,
    'b',
    18,
    42,
    false,
  ],
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '预算 3000 · 22 名马镫重装骑士 对 23 个精锐保加利亚骑兵（骑马阶段胜，剩 1/22）',
    false,
    false,
    'a',
    1,
    22,
    false,
  ],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 22 名马镫重装骑士 对法兰克游侠 22 名（负，游侠剩 2/22）', false, false, 'b', 2, 22, false],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名重装骑射手 拉扯对法兰克游侠 22 名（胜，剩 7/30）', true, false, 'a', 7, 30, false],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名重装骑射手 拉扯对 50 个法兰克长戟兵（30/30 满血零损）', true, false, 'a', 30, 30, true],
  ['Bulgarians', 'bulgarians-stirrups-cav-hca-siege', '预算 3000 · 30 名重装骑射手 拉扯对 42 个日本冠军剑士（胜，剩 23/30）', true, false, 'a', 23, 30, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对 42 个日本冠军剑士（胜，剩 1/42）', false, false, 'a', 1, 42, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对 42 名西班牙冠军剑士（胜，剩 5/42）', false, false, 'a', 5, 42, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对 40 个精锐日本武士（胜，剩 1/42）', false, false, 'a', 1, 42, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对哥特精锐近卫军 38 名（胜，剩 16/42）', false, false, 'a', 16, 42, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对 50 个法兰克长戟兵（胜，剩 39/42）', false, false, 'a', 39, 42, false],
  ['Bulgarians', 'bulgarians-bagains-ths-siege', '预算 3000 · 42 名协议双手剑士 对法兰克游侠 22 名（负，游侠剩 1/22）', false, false, 'b', 1, 22, false],
  [
    'Bulgarians',
    'bulgarians-bagains-ths-siege',
    '预算 3000 · 42 名协议双手剑士 对拉扯不列颠劲弩手 42 名（负，劲弩 42/42 满血零损）',
    false,
    true,
    'b',
    42,
    42,
    true,
  ],
  [
    'Bulgarians',
    'bulgarians-bagains-ths-siege',
    '预算 3000 · 42 名协议双手剑士 对圣物数 0 精锐烈堤司 25 名（负，烈堤司剩 7/25）',
    false,
    false,
    'b',
    7,
    25,
    false,
  ],

  // Tupi (8, all pair-trained: 35 batches = 70 units, actual spend = 2975)
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对 42 名日本劲弩手（胜，剩 33/70）',
    false,
    false,
    'a',
    33,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对 42 名图皮劲弩手（胜，剩 38/70）',
    false,
    false,
    'a',
    38,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对 37 个波兰翼骑兵（胜，剩 51/70）',
    false,
    false,
    'a',
    51,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对西班牙翼骑兵 37 名（胜，剩 38/70）',
    false,
    false,
    'a',
    38,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对马扎尔翼骑兵 44 名（胜，剩 28/70）',
    false,
    false,
    'a',
    28,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对保加利亚翼骑兵 37 名（胜，剩 23/70）',
    false,
    false,
    'a',
    23,
    70,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对土耳其翼骑兵 37 名（负，翼骑剩 9/37）',
    false,
    false,
    'b',
    9,
    37,
    false,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 拉扯对 50 个法兰克长戟兵（70/70 满血零损）',
    true,
    false,
    'a',
    70,
    70,
    true,
    { expectBatchesA: 35, expectCountA: 70, expectSpendA: 2975 },
  ],
];

describe('#1401 第一档批 2 五国单兵、拉扯与图皮成对预算 3000 群战回归', () => {
  it('全部 57 条新增单兵与拉扯链接解码、图皮 35 对/70 只计价与穆伊斯卡草药学切换均与 DE 188329 领域引擎 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    expect(SINGLE_CASES).toHaveLength(57);

    for (const [civ, routeId, label, ka, kb, winnerExpected, aliveExpected, initialExpected, fullHpExpected, opts] of SINGLE_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      const relics = decodeDuelRelics(params);

      expect([decoded.mode, decoded.bud, kite.a, kite.b, relics.a, relics.b], label).toEqual(['r', 3000, ka, kb, 0, 0]);

      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.a);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.b);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      if (opts?.expectNoTechA !== undefined) expect(sideA.sel.has(opts.expectNoTechA), `${label} must exclude tech ${opts.expectNoTechA}`).toBe(false);
      if (opts?.expectHasTechA !== undefined) expect(sideA.sel.has(opts.expectHasTechA), `${label} must include tech ${opts.expectHasTechA}`).toBe(true);

      const bA = resolveSideBudgetCount('r', sideA.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideA.u));
      const bB = resolveSideBudgetCount('r', sideB.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideB.u));
      expect([bA.error, bB.error], label).toEqual([null, null]);

      if (opts?.expectBatchesA !== undefined) {
        expect([bA.batches, bA.count, bA.batches! * bA.unitCost], `${label} pair budget`).toEqual([opts.expectBatchesA, opts.expectCountA, opts.expectSpendA]);
      }

      const fight = groupFight(sideA.F, bA.count!, sideB.F, bB.count!, ka || kb ? { kite: { a: ka, b: kb } } : undefined);
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
