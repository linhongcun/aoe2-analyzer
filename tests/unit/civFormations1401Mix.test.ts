import { describe, expect, it } from 'vitest';
import dataSources from '../../data/sources/data_sources.json';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { contactFight } from '../../src/domain/contactFight';
import { decodeMixedDuel, isMixedDuelLink, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type MixCase = readonly [civ: string, routeId: string, label: string, winner: 'a' | 'b', aAlive: readonly number[], bAlive: readonly number[]];

const MIX_CASES: readonly MixCase[] = [
  // Muisca (7)
  [
    'Muisca',
    'muisca-temple-guard-slinger',
    '混编 · 精锐神庙护卫 20 名与 30 名投石手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩神庙护卫 8、投石手 30）',
    'a',
    [8, 30],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '混编 · 精锐神庙护卫 20 名与 32 名劲弩手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩神庙护卫 14、劲弩 32）',
    'a',
    [14, 32],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '混编 · 精锐神庙护卫 20 名与 32 名劲弩手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩神庙护卫 10、劲弩 32）',
    'a',
    [10, 32],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '混编 · 精锐蔷琵战士 30 名与 32 名劲弩手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩蔷琵 21、劲弩 32）',
    'a',
    [21, 32],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-temple-champi',
    '混编 · 精锐蔷琵战士 30 名与 32 名劲弩手 对日本 32 名冠军剑士 与 29 名长戟兵（胜，剩蔷琵 18、劲弩 32）',
    'a',
    [18, 32],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '混编 · 32 名劲弩手 与 35 名精锐掷矛手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩劲弩 4、掷矛 35）',
    'a',
    [4, 35],
    [0, 0],
  ],
  [
    'Muisca',
    'muisca-arbalester-skirmisher',
    '混编 · 32 名劲弩手 与 35 名精锐掷矛手 对不列颠 34 名长戟兵 与 35 名劲弩手（负，敌剩长戟 3、劲弩 35）',
    'b',
    [0, 0],
    [3, 35],
  ],

  // Spanish (6)
  [
    'Spanish',
    'conquistador-hussar',
    '混编 · 28 名翼骑兵 与精锐西班牙征服者 17 名对不列颠 34 名长戟兵 与 35 名劲弩手（负，敌剩长戟 0、劲弩 29）',
    'b',
    [0, 0],
    [0, 29],
  ],
  [
    'Spanish',
    'handcannon-halberdier',
    '混编 · 34 名长戟兵 与 25 名火枪手 对日本 32 名冠军剑士 与 29 名长戟兵（胜，剩长戟 21、火枪 25）',
    'a',
    [21, 25],
    [0, 0],
  ],
  ['Spanish', 'handcannon-halberdier', '混编 · 34 名长戟兵 与 25 名火枪手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩长戟 18、火枪 25）', 'a', [18, 25], [0, 0]],
  [
    'Spanish',
    'spanish-hmc-hussar',
    '混编 · 28 名翼骑兵 与 22 名重装骑马弩兵 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩翼骑 0、骑马弩 15）',
    'a',
    [0, 15],
    [0, 0],
  ],
  [
    'Spanish',
    'spanish-hmc-hussar',
    '混编 · 28 名翼骑兵 与 22 名重装骑马弩兵 对法兰克游侠 18 名与 25 名长戟兵（胜，剩翼骑 5、骑马弩 22）',
    'a',
    [5, 22],
    [0, 0],
  ],
  [
    'Spanish',
    'spanish-hmc-hussar',
    '混编 · 28 名翼骑兵 与 22 名重装骑马弩兵 对日本 32 名冠军剑士 与 29 名长戟兵（胜，剩翼骑 5、骑马弩 22）',
    'a',
    [5, 22],
    [0, 0],
  ],

  // Japanese (5)
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '混编 · 25 名长戟兵 与 15 名重装骑射手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩长戟 12、骑射 15）',
    'a',
    [12, 15],
    [0, 0],
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '混编 · 25 名长戟兵 与 15 名重装骑射手 对法兰克游侠 14 名与 18 名精锐掷矛手（胜，剩长戟 1、骑射 15）',
    'a',
    [1, 15],
    [0, 0],
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '混编 · 25 名长戟兵 与 15 名重装骑射手 对不列颠 25 名长戟兵 与 22 名劲弩手（胜，剩长戟 0、骑射 12）',
    'a',
    [0, 12],
    [0, 0],
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '混编 · 25 名长戟兵 与 15 名重装骑射手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩长戟 0、骑射 11）',
    'a',
    [0, 11],
    [0, 0],
  ],
  [
    'Japanese',
    'japanese-halberdier-hca-trebuchet',
    '混编 · 25 名长戟兵 与 15 名重装骑射手 对马扎尔游侠 15 名与 25 名劲弩手（负，敌剩游侠 10、劲弩 25）',
    'b',
    [0, 0],
    [10, 25],
  ],

  // Bulgarians (2)
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '混编 · 12 名重装骑士 与 14 名重装骑射手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩重骑 4、骑射 14）',
    'a',
    [4, 14],
    [0, 0],
  ],
  [
    'Bulgarians',
    'bulgarians-stirrups-cav-hca-siege',
    '混编 · 20 名翼骑兵 与 14 名重装骑射手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩翼骑 5、骑射 14）',
    'a',
    [5, 14],
    [0, 0],
  ],

  // Tupi (6)
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '混编 · 20 名长戟兵 与 56 只精锐黑檀木步弓手 对不列颠 25 名长戟兵 与 30 名劲弩手（胜，剩长戟 0、黑檀木 43）',
    'a',
    [0, 43],
    [0, 0],
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '混编 · 20 名长戟兵 与 56 只精锐黑檀木步弓手 对日本 25 名长戟兵 与 30 名劲弩手（胜，剩长戟 0、黑檀木 33）',
    'a',
    [0, 33],
    [0, 0],
  ],
  ['Tupi', 'tupi-blackwood-halberdier', '混编 · 20 名长戟兵 与 56 只精锐黑檀木步弓手 对法兰克游侠 26 名（胜，剩长戟 3、黑檀木 56）', 'a', [3, 56], [0]],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '混编 · 精锐伊比拉贝玛战士 16 名与 50 只精锐黑檀木步弓手 对不列颠 25 名长戟兵 与 30 名劲弩手（胜，剩伊比拉贝玛 5、黑檀木 50）',
    'a',
    [5, 50],
    [0, 0],
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '混编 · 20 名长戟兵 与 56 只精锐黑檀木步弓手 对马扎尔游侠 16 名与 25 名劲弩手（负，敌剩游侠 12、劲弩 25）',
    'b',
    [0, 0],
    [12, 25],
  ],
  ['Tupi', 'tupi-champi-slinger', '混编 · 精锐蔷琵战士 25 名与 30 名投石手 对法兰克游侠 26 名（负，游侠剩 3/26）', 'b', [0, 0], [3]],
];

describe('#1401 第一档批 2 五国真混编（m=mix）领域回归', () => {
  it('全部 26 条新增真混编链接解码与 DE 188329 碰撞引擎实算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    const currentDataVer = mixedDataVersion(dataSources);

    expect(MIX_CASES).toHaveLength(26);

    for (const [civ, routeId, label, winnerExpected, aAliveExpected, bAliveExpected] of MIX_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.a.civ], label).toEqual([[], currentDataVer, civ]);

      const sideA = resolveMixedSide(ctx, core, dec.input.a, 'a');
      const sideB = resolveMixedSide(ctx, core, dec.input.b, 'b');
      expect([sideA.errors, sideB.errors], label).toEqual([[], []]);

      const fight = contactFight(sideA.army!, sideB.army!);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      expect(
        fight.a.rows.map(({ alive }) => alive),
        `${label} aAlive`,
      ).toEqual([...aAliveExpected]);
      expect(
        fight.b.rows.map(({ alive }) => alive),
        `${label} bAlive`,
      ).toEqual([...bAliveExpected]);
    }
  });
});
