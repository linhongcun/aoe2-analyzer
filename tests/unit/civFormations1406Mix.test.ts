import { describe, expect, it } from 'vitest';
import dataSources from '../../data/sources/data_sources.json';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { militaryTechAge } from '../../src/domain/availabilityAge';
import { contactFight } from '../../src/domain/contactFight';
import { costSum } from '../../src/domain/duel';
import { decodeMixedDuel, isMixedDuelLink, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

const route = (civ: string, id: string) => civFormationContent.find((e) => e.civ === civ)!.routes.find((r) => r.id === id)!;

interface MixCase {
  civ: string;
  id: string;
  label: string;
  cA: number;
  cB: number;
  bKite: boolean;
  w: 'a' | 'b';
  rows: readonly [number, number];
}

const m = (civ: string, id: string, label: string, cA: number, cB: number, bKite: boolean, w: 'a' | 'b', rows: readonly [number, number]): MixCase => ({
  civ,
  id,
  label,
  cA,
  cB,
  bKite,
  w,
  rows,
});

const MIX_CASES: readonly MixCase[] = [
  m(
    'Chinese',
    'china-chu-ko-nu',
    '混编 · 23 名轻型骑兵 与 24 名精锐诸葛弩 对不列颠 30 名长戟兵 与 26 名劲弩手（胜，剩轻骑 5、诸葛弩 24）',
    3640,
    3620,
    false,
    'a',
    [5, 24],
  ),
  m(
    'Chinese',
    'china-chu-ko-nu',
    '混编 · 30 名长戟兵 与 24 名精锐诸葛弩 对不列颠 30 名长戟兵 与 26 名劲弩手（胜，长戟全灭、剩诸葛弩 19）',
    3600,
    3620,
    false,
    'a',
    [0, 19],
  ),
  m(
    'Chinese',
    'china-fire-lancer-tower',
    '混编 · 20 名精锐火矛兵 与 23 名轻型骑兵 对不列颠 30 名长戟兵 与 26 名劲弩手（负，敌剩长戟 18、劲弩 26）',
    3640,
    3620,
    false,
    'b',
    [18, 26],
  ),
  m(
    'Chinese',
    'china-arbalest-zero-castle',
    '混编 · 23 名轻型骑兵 与 26 名劲弩手 对不列颠 30 名长戟兵 与 26 名劲弩手（胜，剩轻骑 6、劲弩 26）',
    3660,
    3620,
    false,
    'a',
    [6, 26],
  ),
  m(
    'Chinese',
    'china-arbalest-zero-castle',
    '混编 · 23 名轻型骑兵 与 26 名劲弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩轻骑 4、劲弩 26）',
    3660,
    3940,
    false,
    'a',
    [4, 26],
  ),
  m(
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '混编 · 25 名翼骑兵 与 21 名火枪手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩翼骑 3、火枪 21）',
    3995,
    3940,
    false,
    'a',
    [3, 21],
  ),
  m(
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '混编 · 25 名翼骑兵 与 21 名火枪手 对日本 28 名冠军剑士 与 28 名劲弩手（胜，翼骑全灭、剩火枪 7）',
    3995,
    3920,
    false,
    'a',
    [0, 7],
  ),
  m(
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '混编 · 25 名翼骑兵 与 21 名火枪手 对马扎尔游侠 15 名与 28 名劲弩手（负，敌剩游侠 6、劲弩 28）',
    3995,
    3985,
    false,
    'b',
    [6, 28],
  ),
  m(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '混编 · 18 名帝王骆驼兵 与 20 名火枪手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩帝王骆驼 1、火枪 20）',
    3970,
    3940,
    false,
    'a',
    [1, 20],
  ),
  m(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '混编 · 18 名帝王骆驼兵 与 20 名火枪手 对日本 28 名冠军剑士 与 28 名劲弩手（负，敌冠军全灭、剩劲弩 16）',
    3970,
    3920,
    false,
    'b',
    [0, 16],
  ),
  m(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '混编 · 25 名翼骑兵 与 20 名重装骑射手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩翼骑 5、重装骑射手 20）',
    4000,
    3940,
    false,
    'a',
    [5, 20],
  ),
  m(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '混编 · 25 名翼骑兵 与 20 名重装骑射手 对日本 28 名冠军剑士 与 28 名劲弩手（负，敌剩冠军 1、劲弩 28）',
    4000,
    3920,
    false,
    'b',
    [1, 28],
  ),
  m(
    'Persians',
    'persian-savar-crossbow-bombard',
    '混编 · 萨瓦尔 16 名与 36 名免金弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩萨瓦尔 11、免金弩 36）',
    3960,
    3940,
    false,
    'a',
    [11, 36],
  ),
  m(
    'Persians',
    'persian-savar-crossbow-bombard',
    '混编 · 萨瓦尔 16 名与 36 名免金弩手 对马扎尔游侠 15 名与 28 名劲弩手（负，敌剩游侠 3、劲弩 28）',
    3960,
    3985,
    false,
    'b',
    [3, 28],
  ),
  m(
    'Persians',
    'persian-savar-crossbow-bombard',
    '混编 · 萨瓦尔 16 名与 19 名火枪手 对马扎尔游侠 15 名与 28 名劲弩手（胜，剩萨瓦尔 1、火枪 19）',
    3965,
    3985,
    false,
    'a',
    [1, 19],
  ),
  m(
    'Persians',
    'persian-savar-crossbow-bombard',
    '混编 · 25 名翼骑兵 与 40 名免金弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩翼骑 10、免金弩 40）',
    4000,
    3940,
    false,
    'a',
    [10, 40],
  ),
  m(
    'Turks',
    'turks-hussar-handcannon',
    '混编 · 24 名翼骑兵 与 21 名火枪手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩翼骑 5、火枪 21）',
    3915,
    3940,
    false,
    'a',
    [5, 21],
  ),
  m(
    'Turks',
    'turks-hussar-handcannon',
    '混编 · 17 名重装骆驼兵 与 21 名火枪手 对不列颠 33 名长戟兵 与 28 名劲弩手（负，敌长戟全灭、剩劲弩 3）',
    3950,
    3940,
    false,
    'b',
    [0, 3],
  ),
  m(
    'Turks',
    'turks-sipahi-cav-archer-field',
    '混编 · 24 名翼骑兵 与 20 名重装骑射手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩翼骑 10、重装骑射手 20）',
    3920,
    3940,
    false,
    'a',
    [10, 20],
  ),
  m(
    'Turks',
    'turks-existing-line-choice',
    '混编 · 24 名翼骑兵 与 17 名精锐苏丹亲兵 对不列颠 33 名长戟兵 与 28 名劲弩手（负，敌长戟全灭、剩劲弩 18）',
    3875,
    3940,
    false,
    'b',
    [0, 18],
  ),
  m(
    'Malians',
    'malians-light-cavalry-gbeto',
    '混编 · 23 名轻型骑兵 与 20 名精锐飞刀女兵 对不列颠 30 名长戟兵 与 26 名劲弩手（胜，剩轻骑 4、飞刀 20）',
    3640,
    3620,
    false,
    'a',
    [4, 20],
  ),
  m(
    'Malians',
    'malians-light-cavalry-gbeto',
    '混编 · 23 名轻型骑兵 与 20 名精锐飞刀女兵 对马扎尔游侠 14 名与 25 名劲弩手 站桩（胜，轻骑全灭、剩飞刀 5）',
    3640,
    3640,
    false,
    'a',
    [0, 5],
  ),
  m(
    'Malians',
    'malians-light-cavalry-gbeto',
    '混编 · 23 名轻型骑兵 与 20 名精锐飞刀女兵 对拉扯马扎尔游侠 14 名与 25 名劲弩手（负，敌游侠全灭、剩劲弩 8）',
    3640,
    3640,
    true,
    'b',
    [0, 8],
  ),
  m(
    'Malians',
    'malians-farimba-cav-champ-field',
    '混编 · 13 名死士重装骑士 与 20 名精锐飞刀女兵 对拉扯马扎尔游侠 14 名与 25 名劲弩手（胜，重装骑士全灭、剩飞刀 17）',
    3555,
    3640,
    true,
    'a',
    [0, 17],
  ),
  m(
    'Malians',
    'malians-farimba-cav-champ-field',
    '混编 · 25 名冠军剑士 与 20 名精锐飞刀女兵 对拉扯马扎尔游侠 14 名与 25 名劲弩手（胜，剩冠军 8、飞刀 20）',
    3550,
    3640,
    true,
    'a',
    [8, 20],
  ),
  m(
    'Malians',
    'malians-farimba-cav-champ-field',
    '混编 · 15 名死士重装骆驼兵 与 20 名精锐飞刀女兵 对拉扯马扎尔游侠 14 名与 25 名劲弩手（负，敌游侠全灭、剩劲弩 4）',
    3525,
    3640,
    true,
    'b',
    [0, 4],
  ),
  m(
    'Malay',
    'malay-battle-elephant-progression',
    '混编 · 18 只精锐象兵 与 28 名劲弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩象兵 11、劲弩 28）',
    3949,
    3940,
    false,
    'a',
    [11, 28],
  ),
  m(
    'Malay',
    'malay-battle-elephant-progression',
    '混编 · 18 只精锐象兵 与 28 名劲弩手 对马扎尔游侠 15 名与 28 名劲弩手（胜，象兵全灭、剩劲弩 19）',
    3949,
    3985,
    false,
    'a',
    [0, 19],
  ),
  m(
    'Malay',
    'malay-battle-elephant-progression',
    '混编 · 48 名精锐爪刀勇士 与 28 名劲弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩爪刀 17、劲弩 28，占用人口为 52）',
    3880,
    3940,
    false,
    'a',
    [17, 28],
  ),
  m(
    'Malay',
    'malay-two-handed-swordsman-sustain',
    '混编 · 28 名双手剑士 与 28 名劲弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩双手剑 9、劲弩 28）',
    3920,
    3940,
    false,
    'a',
    [9, 28],
  ),
  m(
    'Malay',
    'malay-two-handed-swordsman-sustain',
    '混编 · 28 名双手剑士 与 28 名劲弩手 对法兰克游侠 15 名与 33 名精锐掷矛手（胜，剩双手剑 10、劲弩 28）',
    3920,
    4005,
    false,
    'a',
    [10, 28],
  ),
];

describe('#1406 第二档六国升级：31 条 m=mix 真混编链接全量实算与帝王满科技预设校验', () => {
  it('全部 31 条新增 m=mix 真混编链接严格采用帝王满科技预设并 100% 复现胜负与逐行余兵', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    const currentDataVer = mixedDataVersion(dataSources);
    expect(MIX_CASES).toHaveLength(31);

    for (const c of MIX_CASES) {
      expect(c.label, `${c.civ}/${c.id} ambiguous slash residual`).not.toMatch(/（(?:敌)?剩\s*\d+\/\d+/);
      const link = route(c.civ, c.id).evidence.links?.find((item) => item.label === c.label);
      expect(link, `${c.civ}/${c.id} missing ${c.label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), c.label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.a.team, dec.input.b.team], c.label).toEqual([[], currentDataVer, [], []]);
      expect([Boolean(dec.input.a.kite), Boolean(dec.input.b.kite)], c.label).toEqual([false, c.bKite]);

      for (const sideKey of ['a', 'b'] as const) {
        const sideInput = dec.input[sideKey];
        const options = resolveMixedSide(ctx, core, { ...sideInput, age: '4', techs: [] }, sideKey).techs;
        const expectedPreset = options
          .filter((t) => (t.numeric || (t.cost && !t.partial)) && militaryTechAge(sideInput.civ, t.t.id, t.t.age) <= 4)
          .map((t) => String(t.t.id))
          .sort();
        expect([...sideInput.techs].sort(), `${c.label} ${sideKey}.techs preset`).toEqual(expectedPreset);
      }

      const sideA = resolveMixedSide(ctx, core, dec.input.a, 'a');
      const sideB = resolveMixedSide(ctx, core, dec.input.b, 'b');
      expect([sideA.errors, sideB.errors], c.label).toEqual([[], []]);
      const costA = sideA.rows.reduce((sum, r, i) => sum + Number(dec.input.a.rows[i]!.qty) * costSum(r.resolved!.training.price.cost), 0);
      const costB = sideB.rows.reduce((sum, r, i) => sum + Number(dec.input.b.rows[i]!.qty) * costSum(r.resolved!.training.price.cost), 0);
      expect([costA, costB], c.label).toEqual([c.cA, c.cB]);

      const fight = contactFight(sideA.army!, sideB.army!, { kite: { a: false, b: c.bKite } });
      expect(fight.status, c.label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, c.label).toBe(c.w);
      expect(
        (c.w === 'a' ? fight.a.rows : fight.b.rows).map(({ alive }) => alive),
        c.label,
      ).toEqual([...c.rows]);
    }
  });
});
