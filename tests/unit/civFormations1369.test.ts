import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import formationContract from '../../data/reference/civ-formations-contract.json';
import dataSources from '../../data/sources/data_sources.json';
import { isPublicSourceUrl } from '../../src/content/schema/policy.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { contactFight } from '../../src/domain/contactFight';
import { costSum, countForBudget, groupFight } from '../../src/domain/duel';
import { decodeDuelKite, decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { decodeMixedDuel, isMixedDuelLink, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { makeSimContext, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

const DOC_SHA = '415863b2a3e94078129554c09378c9a9fba04b57';
const SUPERSEDED_BY_LATER = new Map<string, string>([
  ['Koreans', 'bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8'],
  ['Spanish', '798133a5f20ee5b2b7261895bca3c505495415a6'],
  ['Hindustanis', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Turks', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Muisca', '798133a5f20ee5b2b7261895bca3c505495415a6'],
  ['Tupi', '798133a5f20ee5b2b7261895bca3c505495415a6'],
]);
const ADDED_BY_1386 = new Set<string>([
  'Hindustanis/hindustani-camel-ghulam-field',
  'Turks/turks-sipahi-cav-archer-field',
  'Spanish/spanish-hmc-hussar',
  'Muisca/muisca-arbalester-temple-champi',
  'Muisca/muisca-arbalester-skirmisher',
]);
const REVISED_BY_LATER = new Map<string, string>([
  ['Hindustanis/hindustani-handcannon-hussar', '2026-11-25'],
  ['Turks/turks-hussar-handcannon', '2026-11-25'],
  ['Turks/turks-existing-line-choice', '2026-11-25'],
  ['Spanish/conquistador-hussar', '2026-11-26'],
  ['Spanish/paladin-skirmisher', '2026-11-26'],
  ['Spanish/handcannon-halberdier', '2026-11-26'],
  ['Muisca/muisca-temple-guard-slinger', '2026-11-26'],
  ['Tupi/tupi-champi-slinger', '2026-11-26'],
  ['Tupi/tupi-blackwood-halberdier', '2026-11-26'],
]);
// 按路线忠实保留历史版本链：黑檀木路线历史止于 v0.99.12，后续直接追加 v0.99.44 与 v0.99.56（不伪造 v0.99.34）
const EXPECTED_RECORDED_VERSIONS = new Map<string, readonly string[]>([
  ['Spanish/paladin-skirmisher', ['v0.99.56 · DE 188329']],
  ['Spanish/handcannon-halberdier', ['v0.99.56 · DE 188329']],
  ['Tupi/tupi-champi-slinger', ['v0.99.34 · DE 188329 · 55613e4a', 'v0.99.44 · DE 188329 · f1d5aab', 'v0.99.56 · DE 188329']],
  ['Tupi/tupi-blackwood-halberdier', ['v0.99.12 · DE 188329 · 66620c9', 'v0.99.44 · DE 188329 · f1d5aab', 'v0.99.56 · DE 188329']],
]);
const TARGET_CIVS = [
  'Spanish',
  'Hindustanis',
  'Turks',
  'Koreans',
  'Franks',
  'Vietnamese',
  'Magyars',
  'Bohemians',
  'Incas',
  'Mapuche',
  'Muisca',
  'Tupi',
  'Britons',
] as const;

const UNCHANGED_SUBROUTES = new Map<string, string>([
  ['Koreans/koreans-fire-lancer-garrison', '2026-11-22'],
  ['Franks/franks-throwing-axeman-light-cav', '2026-11-22'],
  ['Vietnamese/vietnamese-elephant-skirmisher', '2026-11-20'],
  ['Vietnamese/vietnamese-defensive-tower', '2026-11-22'],
  ['Incas/incas-champi-candidate', '2026-11-18'],
]);

const SPLIT_COUNTED_NOUN =
  /<span class="num nw">\d+\s*(?:个|名|只|座|条|辆)<\/span>(?:火枪手|村民|劲弩手|精锐萨金特卫兵|弩手|精锐掷矛手|手推炮|轻型骑兵|翼骑兵|波兰翼骑兵|精锐火矛兵|精锐诸葛弩|精锐藤弓兵|帝王掷矛手|精锐象兵|精锐日本武士|精锐印加枪兵长|精锐保加利亚骑兵|精锐掷斧兵|重装骑马弩兵|重装骑射手|法兰克长戟兵|日本冠军剑士|不列颠劲弩手|条顿手推炮|高棉重型弩炮|下马步兵|游侠|骠骑|精锐高丽战车|精锐掷石绳骑兵|精锐苏丹亲兵|穆伊斯卡投石手|图皮投石手|印加投石手|投石手|精锐西班牙征服者)/;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type KiteCase = readonly [
  civ: string,
  routeId: string,
  label: string,
  ka: boolean,
  winner: 'a' | 'b',
  alive: number,
  initial: number,
  retreated1dp: number | null,
  capHit: boolean | null,
];

const SINGLE_CASES: readonly KiteCase[] = [
  [
    'Franks',
    'franks-heavy-mounted-crossbow-light-cav',
    '预算 3000 · 37 个重装骑马弩兵 拉扯对 50 个法兰克长戟兵（剩 34/37，后撤 20.7 格）',
    true,
    'a',
    34,
    37,
    20.7,
    false,
  ],
  [
    'Franks',
    'franks-heavy-mounted-crossbow-light-cav',
    '预算 3000 · 37 个重装骑马弩兵 拉扯对 42 个日本冠军剑士（剩 33/37，后撤 31.0 格）',
    true,
    'a',
    33,
    37,
    31.0,
    false,
  ],
  ['Franks', 'franks-heavy-mounted-crossbow-light-cav', '预算 3000 · 37 个重装骑马弩兵 站桩对西班牙游侠 22 名（游侠剩 10/22）', false, 'b', 10, 22, null, null],
  [
    'Franks',
    'franks-heavy-mounted-crossbow-light-cav',
    '预算 3000 · 37 个重装骑马弩兵 拉扯对西班牙游侠 22 名（游侠剩 9/22，后撤 8.3 格）',
    true,
    'b',
    9,
    22,
    8.3,
    false,
  ],
  [
    'Franks',
    'franks-heavy-mounted-crossbow-light-cav',
    '预算 3000 · 37 个重装骑马弩兵 拉扯对 42 个不列颠劲弩手（劲弩剩 30/42，后撤 0.0 格）',
    true,
    'b',
    30,
    42,
    0.0,
    false,
  ],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名站桩对 50 个法兰克长戟兵（长戟剩 12/50）', false, 'b', 12, 50, null, null],
  [
    'Spanish',
    'conquistador-hussar',
    '预算 3000 · 精锐西班牙征服者 22 名拉扯对 50 个法兰克长戟兵（22/22 满血零损，40.0 格触顶）',
    true,
    'a',
    22,
    22,
    40.0,
    true,
  ],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名站桩对 42 个日本冠军剑士（冠军剩 8/42）', false, 'b', 8, 42, null, null],
  [
    'Spanish',
    'conquistador-hussar',
    '预算 3000 · 精锐西班牙征服者 22 名拉扯对 42 个日本冠军剑士（22/22 零阵亡、剩 1967 血，40.0 格触顶）',
    true,
    'a',
    22,
    22,
    40.0,
    true,
  ],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名站桩对西班牙游侠 22 名（游侠剩 4/22）', false, 'b', 4, 22, null, null],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名拉扯对西班牙游侠 22 名（剩 8/22，后撤 28.5 格）', true, 'a', 8, 22, 28.5, false],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名站桩对条顿游侠 22 名（游侠剩 4/22）', false, 'b', 4, 22, null, null],
  ['Spanish', 'conquistador-hussar', '预算 3000 · 精锐西班牙征服者 22 名拉扯对条顿游侠 22 名（剩 13/22，40.0 格触顶）', true, 'a', 13, 22, 40.0, true],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 拉扯对 50 个法兰克长戟兵（30/30 满血零损，后撤 11.1 格）', true, 'a', 30, 30, 11.1, false],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 拉扯对 42 个日本冠军剑士（剩 28/30，后撤 22.2 格）', true, 'a', 28, 30, 22.2, false],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 站桩对西班牙游侠 22 名（剩 12/30）', false, 'a', 12, 30, null, null],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 拉扯对西班牙游侠 22 名（剩 20/30，40.0 格触顶）', true, 'a', 20, 30, 40.0, true],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 站桩对条顿游侠 22 名（剩 13/30）', false, 'a', 13, 30, null, null],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 拉扯对条顿游侠 22 名（剩 24/30，后撤 38.9 格）', true, 'a', 24, 30, 38.9, false],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 站桩对 50 个法兰克长戟兵（长戟剩 16/50）', false, 'b', 16, 50, null, null],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 拉扯对 50 个法兰克长戟兵（剩 9/18，后撤 38.1 格）', true, 'a', 9, 18, 38.1, false],
  ['Muisca', 'muisca-temple-guard-slinger', '预算 3000 · 40 个穆伊斯卡投石手 站桩对 42 个日本冠军剑士（冠军剩 11/42）', false, 'b', 11, 42, null, null],
  [
    'Muisca',
    'muisca-temple-guard-slinger',
    '预算 3000 · 40 个穆伊斯卡投石手 拉扯对 42 个日本冠军剑士（剩 28/40，后撤 10.4 格）',
    true,
    'a',
    28,
    40,
    10.4,
    false,
  ],
  ['Tupi', 'tupi-champi-slinger', '预算 3000 · 40 个图皮投石手 站桩对 42 个日本冠军剑士（冠军剩 8/42）', false, 'b', 8, 42, null, null],
  ['Tupi', 'tupi-champi-slinger', '预算 3000 · 40 个图皮投石手 拉扯对 42 个日本冠军剑士（剩 23/40，后撤 6.2 格）', true, 'a', 23, 40, 6.2, false],
  ['Incas', 'incas-kamayuk-skirmisher', '预算 3000 · 50 个印加投石手 站桩对 42 个日本冠军剑士（剩 36/50）', false, 'a', 36, 50, null, null],
  [
    'Incas',
    'incas-kamayuk-skirmisher',
    '预算 3000 · 50 个印加投石手 拉扯对 42 个日本冠军剑士（50/50 零阵亡、剩 1722 血，后撤 9.2 格）',
    true,
    'a',
    50,
    50,
    9.2,
    false,
  ],
  ['Vietnamese', 'vietnamese-light-cav-rattan', '预算 3000 · 31 个精锐藤弓兵 站桩对 42 个日本冠军剑士（冠军剩 1/42）', false, 'b', 1, 42, null, null],
  [
    'Vietnamese',
    'vietnamese-light-cav-rattan',
    '预算 3000 · 31 个精锐藤弓兵 拉扯对 42 个日本冠军剑士（剩 21/31，后撤 22.2 格）',
    true,
    'a',
    21,
    31,
    22.2,
    false,
  ],
  ['Turks', 'turks-existing-line-choice', '预算 3000 · 26 个精锐苏丹亲兵 站桩对 42 个日本冠军剑士（冠军剩 8/42）', false, 'b', 8, 42, null, null],
  [
    'Turks',
    'turks-existing-line-choice',
    '预算 3000 · 26 个精锐苏丹亲兵 拉扯对 42 个日本冠军剑士（26/26 满血零损，后撤 36.4 格）',
    true,
    'a',
    26,
    26,
    36.4,
    false,
  ],
  ['Britons', 'britons-archer-progression', '预算 3000 · 42 个劲弩手 站桩对 42 个日本冠军剑士（冠军剩 9/42）', false, 'b', 9, 42, null, null],
  ['Britons', 'britons-archer-progression', '预算 3000 · 42 个劲弩手 拉扯对 42 个日本冠军剑士（42/42 满血零损，后撤 30.2 格）', true, 'a', 42, 42, 30.2, false],
  [
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '预算 3000 · 31 个火枪手 拉扯对 42 个日本冠军剑士（31/31 满血零损，后撤 17.9 格）',
    true,
    'a',
    31,
    31,
    17.9,
    false,
  ],
  ['Turks', 'turks-hussar-handcannon', '预算 3000 · 31 个火枪手 拉扯对 42 个日本冠军剑士（31/31 满血零损，后撤 17.9 格）', true, 'a', 31, 31, 17.9, false],
  [
    'Bohemians',
    'bohemians-handcannon-halberdier',
    '预算 3000 · 31 个火枪手 拉扯对 42 个日本冠军剑士（31/31 满血零损，后撤 19.6 格）',
    true,
    'a',
    31,
    31,
    19.6,
    false,
  ],
  ['Mapuche', 'mapuche-kona-bolas', '预算 3000 · 33 个精锐掷石绳骑兵（含 1380）站桩对 42 个日本冠军剑士（冠军剩 21/42）', false, 'b', 21, 42, null, null],
  [
    'Mapuche',
    'mapuche-kona-bolas',
    '预算 3000 · 33 个精锐掷石绳骑兵（含 1380）拉扯对 42 个日本冠军剑士（剩 16/33，40.0 格触顶）',
    true,
    'a',
    16,
    33,
    40.0,
    true,
  ],
];

describe('#1369 13 文明拉扯重估、JSON B 项清零与指针回归', () => {
  it('全部 38 条新增单兵种站桩/拉扯链接、法兰克混编对照与马普切默认预设对照与引擎实算严格一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    for (const [civ, routeId, label, ka, winner, aliveExp, initialExp, retExp, capExp] of SINGLE_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.bud, kite.a, kite.b], label).toEqual(['r', 3000, ka, false]);

      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      const na = countForBudget(sideA.training.price.cost, decoded.bud);
      const nb = countForBudget(sideB.training.price.cost, decoded.bud);
      expect([na !== null, nb !== null], label).toEqual([true, true]);
      if (na === null || nb === null) continue;
      const res = groupFight(sideA.F, na, sideB.F, nb, ka ? { kite: { a: true, b: false } } : undefined);
      expect(res.status, label).toBe('win');
      if (res.status !== 'win') continue;
      expect(res.winner, label).toBe(winner);
      expect([winner === 'a' ? res.aAlive : res.bAlive, winner === 'a' ? na : nb], label).toEqual([aliveExp, initialExp]);
      if (ka && retExp !== null && capExp !== null) {
        const kaSum = res.contact.kite?.a;
        expect(kaSum, label).toBeDefined();
        expect(Number(kaSum!.retreated.toFixed(1)), label).toBe(retExp);
        expect(kaSum!.capHit, label).toBe(capExp);
      }
    }

    // 法兰克混编站桩 + 拉扯（2220 对 3000）
    const hmcLinks = route('Franks', 'franks-heavy-mounted-crossbow-light-cav').evidence.links ?? [];
    const currentDataVer = mixedDataVersion(dataSources);
    for (const [label, kiteExpected, winnerExpected, aRowsExpected] of [
      ['混编站桩 · 8 个轻型骑兵 与 20 个重装骑马弩兵 对 50 个法兰克长戟兵（长戟剩 2/50）', false, 'b', [0, 0]],
      ['混编拉扯 · 8 个轻型骑兵 与 20 个重装骑马弩兵 对 50 个法兰克长戟兵（剩 5/20，26.9 秒接管、后撤 28.4 格）', true, 'a', [0, 5]],
    ] as const) {
      const link = hmcLinks.find((item) => item.label === label);
      expect(link, label).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.a.kite ?? false], label).toEqual([[], currentDataVer, kiteExpected]);
      const sideA = resolveMixedSide(ctx, core, dec.input.a, 'a');
      const sideB = resolveMixedSide(ctx, core, dec.input.b, 'b');
      expect([sideA.errors, sideB.errors], label).toEqual([[], []]);
      const totalA = sideA.rows.reduce((s, row, idx) => s + Number(dec.input.a.rows[idx]!.qty) * costSum(row.resolved!.training.price.cost), 0);
      const totalB = sideB.rows.reduce((s, row, idx) => s + Number(dec.input.b.rows[idx]!.qty) * costSum(row.resolved!.training.price.cost), 0);
      expect([totalA, totalB], label).toEqual([2220, 3000]);
      const fight = contactFight(sideA.army!, sideB.army!, kiteExpected ? { kite: { a: true, b: false } } : undefined);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      expect(
        fight.a.rows.map(({ alive }) => alive),
        label,
      ).toEqual([...aRowsExpected]);
      if (kiteExpected) {
        expect(Number(fight.contact.kite!.a.activatedAt!.toFixed(1))).toBe(26.9);
        expect(Number(fight.contact.kite!.a.retreated.toFixed(1))).toBe(28.4);
      }
    }

    // 马普切默认 f 跳过 partial 科技 1380 对照（28 名拉扯仍负）+ 充能未建模卡；不列颠战狼号准确度 100% + 溅射未建模卡
    const mapucheDefault = resolve(ctx, core.unitById, parseSide('2571.Mapuche.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    const jpChamp = resolve(ctx, core.unitById, parseSide('567.Japanese.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    expect([isUnavail(mapucheDefault), isUnavail(jpChamp)]).toEqual([false, false]);
    if (!isUnavail(mapucheDefault) && !isUnavail(jpChamp)) {
      expect(mapucheDefault.sel.has(1380)).toBe(false);
      const na = countForBudget(mapucheDefault.training.price.cost, 3000);
      const nb = countForBudget(jpChamp.training.price.cost, 3000);
      expect(na).toBe(28);
      expect(nb).not.toBeNull();
      const res = groupFight(mapucheDefault.F, na!, jpChamp.F, nb!, { kite: { a: true, b: false } });
      expect(res.status).toBe('win');
      if (res.status === 'win') expect([res.winner, res.bAlive]).toEqual(['b', 4]);
      const pills = detectUnitUnmodeled({
        unit: mapucheDefault.u,
        civ: 'Mapuche',
        age: 4,
        selectedTechs: [...mapucheDefault.sel].map((id) => core.techById[id]!).filter(Boolean),
      }).map(({ pill }) => pill);
      expect(pills).toContain('充能远程攻击');
    }

    const treb = core.unitById[331]!;
    const trebTechs = presetUpTo(simTechs(ctx, treb, 'Britons'), 4, 'Britons');
    trebTechs.delete(461);
    expect(simulate(ctx, treb, 'Britons', 4, trebTechs, new Set()).acc).toBe(92);
    trebTechs.add(461);
    expect(simulate(ctx, treb, 'Britons', 4, trebTechs, new Set()).acc).toBe(100);
    const warwolfPills = detectUnitUnmodeled({
      unit: treb,
      civ: 'Britons',
      age: 4,
      selectedTechs: [...trebTechs].map((id) => core.techById[id]!).filter(Boolean),
    }).map(({ pill }) => pill);
    expect(warwolfPills).toContain('践踏 / 溅射伤害 · 战狼号');
  });

  it('仅校验 JSON：B 项 7 处过期表述清零且 JSON 非目标未编码项完好保留', () => {
    const serialized = JSON.stringify(civFormationContent);
    expect(serialized).not.toMatch(/暂未叠加|暂显目录|暂显基础价|只列牵引|待\s*#?1297|战狼号对它标为仅文本|布图马普折扣仅文本、未编码/);

    // B 项清零后关键现状
    expect(route('Franks', 'franks-paladin-skirmisher').alternatives).toContain('建筑详情页统一展示为城堡时代 552.5 石料、帝王时代 487.5 石料');
    expect(route('Franks', 'franks-heavy-mounted-crossbow-light-cav').alternatives).toContain('单位详情页、科技模拟器');
    const warwolfRole = route('Britons', 'britons-archer-progression')
      .supplements.flatMap((s) => s.entities)
      .find((e) => e.kind === 'tech' && e.id === 461)!.role;
    expect(warwolfRole).toContain('准确度升至 100%');
    expect(warwolfRole).toContain('溅射未建模提示卡');

    // JSON 中存在的非目标未编码项零误删守卫
    expect(route('Poles', 'poles-obuch-winged-hussar').limitation).toContain('列克提克遗产');
    expect(route('Poles', 'poles-arbalest-winged-hussar').limitation).toContain('列克提克遗产');
    expect(route('Saxons', 'saxons-retainer-tower').limitation).toContain('盾墙');
    expect(route('Malians', 'malians-light-cavalry-gbeto').limitation).toContain('城镇中心');
    for (const id of ['mapuche-kona-bolas', 'mapuche-kona-slinger']) {
      const r = route('Mapuche', id);
      expect(r.limitation).toContain('击杀产金适用范围未完全说明');
      expect(r.limitation).toContain('res:33');
      expect(r.adjustments).toContainEqual(
        expect.objectContaining({
          id: 'mapuche-halberdier-support',
          text: expect.stringContaining('聚落 2556'),
          requires: [{ kind: 'unit', id: 359, age: 4 }],
        }),
      );
      expect(r.adjustments!.find((a) => a.id === 'mapuche-halberdier-support')!.text).toContain('未实战验证');
    }

    // Round 2 P2-1：印度斯坦清理硬编码来源行、印加候选同步 L1118
    expect(route('Hindustanis', 'hindustani-handcannon-hussar').evidence.scope).not.toContain('来源行');
    expect(route('Incas', 'incas-champi-candidate').evidence.scope).toContain('固定来源 L1118');
  });

  it('来源指针、契约一致性、24 条路线粒度、去重计数与 FormationText 零拆分守卫全部通过', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');

    const targetSet = new Set<string>(TARGET_CIVS);
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        const expectedSha = SUPERSEDED_BY_LATER.get(civ.civ) ?? DOC_SHA;
        expect(civ.source.content, civ.civ).toContain(`/blob/${expectedSha}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          const key = `${civ.civ}/${r.id}`;
          if (civ.civ === 'Spanish' || civ.civ === 'Britons') {
            expect(r.source, key).toBeUndefined();
          } else {
            expect(r.source?.content, key).toContain(`/blob/${expectedSha}/role/game-strategy.md#L`);
          }
          if (ADDED_BY_1386.has(key)) continue;
          if (UNCHANGED_SUBROUTES.has(key)) {
            unchangedCount += 1;
            expect(r.revised, key).toBe(UNCHANGED_SUBROUTES.get(key));
            expect(r.evidence.recordedVersion, key).not.toContain('v0.99.34');
          } else {
            updatedCount += 1;
            expect(r.revised, key).toBe(REVISED_BY_LATER.get(key) ?? '2026-11-23');
            const requiredTokens = EXPECTED_RECORDED_VERSIONS.get(key) ?? ['v0.99.34 · DE 188329 · 55613e4a'];
            for (const token of requiredTokens) expect(r.evidence.recordedVersion, key).toContain(token);
            if (key === 'Tupi/tupi-blackwood-halberdier') expect(r.evidence.recordedVersion, key).not.toContain('v0.99.34');
          }
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA);
        for (const r of civ.routes) {
          expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA);
        }
      }
    }
    expect([updatedCount, unchangedCount]).toEqual([19, 5]);

    // 渲染不变量：FormationText 零拆分 + #1285 去重计数 + 公开链接唯一性
    const core = await loadCore();
    const trees = await loadTrees();
    const sharedCounts: Record<string, number> = {};

    for (const civ of civFormationContent) {
      const views: FormationView[] = publishedFormations(civ).map((r) => projectFormation(r, civ.civ, DATA_PATCH, { core, trees }, civ.routes, civ.source));
      const deduped = dedupeFormationClauses(views);
      if (deduped.shared.length > 0) sharedCounts[civ.civ] = deduped.shared.length;

      if (!targetSet.has(civ.civ)) continue;
      for (const r of civ.routes) {
        const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
        expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
        for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);

        if (!UNCHANGED_SUBROUTES.has(`${civ.civ}/${r.id}`)) {
          const texts = [r.reason, r.limitation, r.alternatives, r.evidence.scope, ...(r.adjustments ?? []).map(({ text }) => text)].filter((v): v is string =>
            Boolean(v),
          );
          for (const text of texts) {
            for (const sentence of text.split('。')) {
              if (!sentence || /4 个精锐藤弓兵无/.test(sentence)) continue;
              const html = renderToStaticMarkup(createElement(FormationText, { text: sentence }));
              expect(html, `${civ.civ}/${r.id} split in text: ${sentence}`).not.toMatch(SPLIT_COUNTED_NOUN);
            }
          }
        }
        for (const { label } of r.evidence.links ?? []) {
          const html = renderToStaticMarkup(createElement(FormationText, { text: label }));
          expect(html, `${civ.civ}/${r.id} split in label: ${label}`).not.toMatch(SPLIT_COUNTED_NOUN);
        }
      }
    }

    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });
});
