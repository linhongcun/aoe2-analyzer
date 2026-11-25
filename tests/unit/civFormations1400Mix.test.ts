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

type MixCase = readonly [
  civ: string,
  routeId: string,
  label: string,
  winner: 'a' | 'b',
  aAlive: readonly number[],
  bAlive: readonly number[],
  relicA?: string,
  relicB?: string,
];

const MIX_CASES: readonly MixCase[] = [
  [
    'Goths',
    'goths-huskarl-halberdier',
    '混编 · 精锐近卫军 30 名与 40 名长戟兵 对马扎尔游侠 15 名与 28 名劲弩手（负，敌剩游侠 6、劲弩 28）',
    'b',
    [0, 0],
    [6, 28],
  ],
  [
    'Goths',
    'goths-huskarl-halberdier',
    '混编 · 精锐近卫军 25 名与 22 名火枪手 对日本 35 名冠军剑士 与 26 名长戟兵（胜，剩近卫 13、火枪 22）',
    'a',
    [13, 22],
    [0, 0],
  ],
  [
    'Goths',
    'goths-huskarl-halberdier',
    '混编 · 40 名冠军剑士 与 22 名火枪手 对条顿 22 名精锐条顿骑士 与 25 名长戟兵（胜，剩冠军 26、火枪 22）',
    'a',
    [26, 22],
    [0, 0],
  ],
  [
    'Teutons',
    'teutons-paladin-skirmisher',
    '混编 · 条顿游侠 18 名与 26 名精锐掷矛手 对不列颠 25 名长戟兵 与 35 名劲弩手（胜，剩游侠 2、掷矛 26）',
    'a',
    [2, 26],
    [0, 0],
  ],
  [
    'Teutons',
    'teutons-paladin-skirmisher',
    '混编 · 条顿游侠 18 名与 26 名精锐掷矛手 对马扎尔游侠 15 名与 20 名重装骑射手（负，敌剩游侠 9、骑射 20）',
    'b',
    [0, 0],
    [9, 20],
  ],
  [
    'Teutons',
    'teutons-halberdier-handcannon',
    '混编 · 34 名长戟兵 与 21 名火枪手 对日本 32 名冠军剑士 与 29 名长戟兵（胜，剩长戟 20、火枪 21）',
    'a',
    [20, 21],
    [0, 0],
  ],
  [
    'Teutons',
    'teutons-elite-knight-skirmisher',
    '混编 · 18 名精锐条顿骑士 与 20 名火枪手 对立陶宛圣物数 4 精锐烈堤司 19 名与 28 名精锐掷矛手（胜，剩条顿骑士 7、火枪 20）',
    'a',
    [7, 20],
    [0, 0],
    undefined,
    '4',
  ],
  [
    'Byzantines',
    'byzantines-cataphract',
    '混编 · 33 名长戟兵 与 33 名精锐掷矛手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩长戟 7、掷矛 33）',
    'a',
    [7, 33],
    [0, 0],
  ],
  [
    'Byzantines',
    'byzantines-cataphract',
    '混编 · 33 名长戟兵 与 33 名精锐掷矛手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩长戟 0、掷矛 28）',
    'a',
    [0, 28],
    [0, 0],
  ],
  [
    'Byzantines',
    'byzantines-cataphract',
    '混编 · 22 名重装骆驼兵 与 33 名精锐掷矛手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩骆驼 1、掷矛 33）',
    'a',
    [1, 33],
    [0, 0],
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '混编 · 33 名长戟兵 与 22 名火枪手 对日本 32 名冠军剑士 与 29 名长戟兵（胜，剩长戟 16、火枪 22）',
    'a',
    [16, 22],
    [0, 0],
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '混编 · 33 名长戟兵 与 22 名火枪手 对法兰克游侠 18 名与 25 名长戟兵（胜，剩长戟 14、火枪 22）',
    'a',
    [14, 22],
    [0, 0],
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '混编 · 33 名长戟兵 与 30 名劲弩手 对不列颠 30 名长戟兵 与 28 名劲弩手（胜，剩长戟 0、劲弩 29）',
    'a',
    [0, 29],
    [0, 0],
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 0 精锐烈堤司 12 名与 26 名精锐掷矛手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩烈堤司 1、掷矛 26）',
    'a',
    [1, 26],
    [0, 0],
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 2 精锐烈堤司 12 名与 26 名精锐掷矛手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩烈堤司 1、掷矛 26）',
    'a',
    [1, 26],
    [0, 0],
    '2',
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 4 精锐烈堤司 12 名与 26 名精锐掷矛手 对法兰克游侠 14 名与 20 名长戟兵（胜，剩烈堤司 2、掷矛 26）',
    'a',
    [2, 26],
    [0, 0],
    '4',
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 0 精锐烈堤司 12 名与 26 名精锐掷矛手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩烈堤司 0、掷矛 23）',
    'a',
    [0, 23],
    [0, 0],
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 2 精锐烈堤司 12 名与 26 名精锐掷矛手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩烈堤司 0、掷矛 24）',
    'a',
    [0, 24],
    [0, 0],
    '2',
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '混编 · 圣物数 4 精锐烈堤司 12 名与 26 名精锐掷矛手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩烈堤司 0、掷矛 24）',
    'a',
    [0, 24],
    [0, 0],
    '4',
  ],
  [
    'Lithuanians',
    'lithuanians-winged-hussar-handcannon',
    '混编 · 19 名波兰翼骑兵 与 15 名火枪手 对日本 21 名冠军剑士 与 25 名长戟兵（胜，剩翼骑 3、火枪 15）',
    'a',
    [3, 15],
    [0, 0],
  ],
  [
    'Lithuanians',
    'lithuanians-winged-hussar-handcannon',
    '混编 · 19 名波兰翼骑兵 与 15 名火枪手 对不列颠 20 名长戟兵 与 26 名劲弩手（胜，剩翼骑 1、火枪 15）',
    'a',
    [1, 15],
    [0, 0],
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '混编 · 20 名波兰翼骑兵 与 28 名劲弩手 对不列颠 30 名长戟兵 与 25 名劲弩手（胜，剩翼骑 4、劲弩 28）',
    'a',
    [4, 28],
    [0, 0],
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '混编 · 20 名波兰翼骑兵 与 28 名劲弩手 对日本 30 名长戟兵 与 25 名劲弩手（胜，剩翼骑 0、劲弩 28）',
    'a',
    [0, 28],
    [0, 0],
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '混编 · 20 名波兰翼骑兵 与 18 名重装骑马弩兵 对不列颠 30 名长戟兵 与 25 名劲弩手（负，敌剩长戟 0、劲弩 23）',
    'b',
    [0, 0],
    [0, 23],
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '混编 · 20 名波兰翼骑兵 与 18 名重装骑马弩兵 对日本 30 名长戟兵 与 25 名劲弩手（负，敌剩长戟 6、劲弩 25）',
    'b',
    [0, 0],
    [6, 25],
  ],
  [
    'Poles',
    'poles-discount-knights',
    '混编 · 20 名重装骑士 与 26 名劲弩手 对条顿 24 名长戟兵 与条顿游侠 16 名（胜，剩重骑 10、劲弩 26）',
    'a',
    [10, 26],
    [0, 0],
  ],
];

describe('#1400 第一档批 1 五国真混编（m=mix）领域回归', () => {
  it('全部 26 条新增真混编链接解码、圣物参数与 DE 188329 碰撞引擎实算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    const currentDataVer = mixedDataVersion(dataSources);

    expect(MIX_CASES).toHaveLength(26);

    for (const [civ, routeId, label, winnerExpected, aAliveExpected, bAliveExpected, relicA, relicB] of MIX_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.a.civ], label).toEqual([[], currentDataVer, civ]);
      if (relicA !== undefined) expect(dec.input.a.relics, `${label} relicA`).toBe(relicA);
      if (relicB !== undefined) expect(dec.input.b.relics, `${label} relicB`).toBe(relicB);

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
