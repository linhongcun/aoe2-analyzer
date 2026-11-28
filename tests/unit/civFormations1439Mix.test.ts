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
  zeroCastle: boolean,
];

const MIX_CASES: readonly MixCase[] = [
  // Mongols (5)
  [
    'Mongols',
    'mongols-mangudai-steppe-siege',
    '混编 · 25 名翼骑兵 与 17 名精锐蒙古突骑 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩翼骑 0、突骑 17）',
    'a',
    [0, 17],
    [0, 0],
    false,
  ],
  [
    'Mongols',
    'mongols-mangudai-steppe-siege',
    '混编 · 25 名翼骑兵 与 17 名精锐蒙古突骑 对马扎尔 15 名游侠 与 28 名劲弩手（负，敌剩游侠 4、劲弩 28）',
    'b',
    [0, 0],
    [4, 28],
    false,
  ],
  [
    'Mongols',
    'mongols-mangudai-steppe-siege',
    '混编 · 18 名精锐草原枪兵 与 17 名精锐蒙古突骑 对马扎尔 15 名游侠 与 28 名劲弩手（负，敌剩游侠 4、劲弩 28）',
    'b',
    [0, 0],
    [4, 28],
    false,
  ],
  [
    'Mongols',
    'mongols-mangudai-steppe-siege',
    '混编 · 17 名重装骆驼兵 与 17 名精锐蒙古突骑 对马扎尔 15 名游侠 与 28 名劲弩手（负，敌剩游侠 6、劲弩 28）',
    'b',
    [0, 0],
    [6, 28],
    false,
  ],
  [
    'Mongols',
    'mongols-hca-zero-castle',
    '混编 · 零城堡 18 名精锐草原枪兵 与 20 名重装骑射手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩草原枪 2、骑射 20）',
    'a',
    [2, 20],
    [0, 0],
    true,
  ],

  // Huns (4)
  [
    'Huns',
    'huns-paladin-hca',
    '混编 · 15 名游侠 与 25 名折价重装骑射手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩游侠 8、骑射 25）',
    'a',
    [8, 25],
    [0, 0],
    false,
  ],
  [
    'Huns',
    'huns-paladin-hca',
    '混编 · 15 名游侠 与 25 名折价重装骑射手 对马扎尔 15 名游侠 与 28 名劲弩手（胜，剩游侠 0、骑射 22）',
    'a',
    [0, 22],
    [0, 0],
    false,
  ],
  [
    'Huns',
    'huns-hussar-hca',
    '混编 · 省金 25 名翼骑兵 与 25 名折价重装骑射手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩翼骑 6、骑射 25）',
    'a',
    [6, 25],
    [0, 0],
    true,
  ],
  [
    'Huns',
    'huns-hussar-hca',
    '混编 · 省金 25 名翼骑兵 与 25 名折价重装骑射手 对马扎尔 15 名游侠 与 28 名劲弩手（负，敌剩游侠 3、劲弩 28）',
    'b',
    [0, 0],
    [3, 28],
    true,
  ],

  // Tatars (4)
  [
    'Tatars',
    'tatars-keshik-hca-trebuchet',
    '混编 · 20 名精锐怯薛骑兵 与 20 名丝护甲重装骑射手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩怯薛 10、骑射 20）',
    'a',
    [10, 20],
    [0, 0],
    false,
  ],
  [
    'Tatars',
    'tatars-keshik-hca-trebuchet',
    '混编 · 20 名精锐怯薛骑兵 与 20 名丝护甲重装骑射手 对马扎尔 15 名游侠 与 28 名劲弩手（胜，剩怯薛 0、骑射 15）',
    'a',
    [0, 15],
    [0, 0],
    false,
  ],
  [
    'Tatars',
    'tatars-steppe-hca-zero-castle',
    '混编 · 零城堡无丝护甲 18 名精锐草原枪兵 与 20 名重装骑射手 对不列颠 34 名长戟兵 与 35 名劲弩手（胜，剩草原枪 1、骑射 20）',
    'a',
    [1, 20],
    [0, 0],
    true,
  ],
  [
    'Tatars',
    'tatars-steppe-hca-zero-castle',
    '混编 · 零城堡无丝护甲 18 名精锐草原枪兵 与 20 名重装骑射手 对马扎尔 15 名游侠 与 28 名劲弩手（负，敌剩游侠 4、劲弩 28）',
    'b',
    [0, 0],
    [4, 28],
    true,
  ],
];

describe('Issue 1439 草原骑射四国真混编（m=mix）领域回归', () => {
  it('全部 13 条新增真混编链接解码、零城堡不含城堡科技与 DE 188329 碰撞引擎实算 100% 一致', async () => {
    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
    const ctx = makeSimContext(core.techs, trees);
    const currentDataVer = mixedDataVersion(dataSources);

    expect(MIX_CASES).toHaveLength(13);
    for (const [civ, routeId, label, winnerExpected, aAliveExpected, bAliveExpected, zeroCastle] of MIX_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.a.civ], label).toEqual([[], currentDataVer, civ]);

      if (zeroCastle) {
        for (const tid of dec.input.a.techs) {
          expect(core.techById[Number(tid)]?.b, `${label} zero castle excludes castle tech ${tid}`).not.toBe(82);
        }
        expect(dec.input.a.techs, `${label} excludes Silk Armor 687`).not.toContain('687');
      }

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
