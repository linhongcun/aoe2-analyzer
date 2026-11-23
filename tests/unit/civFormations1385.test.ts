import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { isPublicSourceUrl } from '../../src/content/schema/policy.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { countForBudget, groupFight } from '../../src/domain/duel';
import { decodeDuelKite, decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { makeSimContext, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

const DOC_SHA = 'bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8';
const TARGET_CIVS = ['Koreans', 'Jurchens', 'Saxons', 'Aztecs', 'Mayans', 'Wu'] as const;

const SPLIT_COUNTED_NOUN =
  /<span class="num nw">\d+\s*(?:个|名|只|座|条|辆)<\/span>(?:精锐草原枪兵|精锐铁浮屠|掷弹兵|重型火箭推车|重装骑马弩兵|精锐瓦兰吉卫队|撒克逊劲弩手|高丽劲弩手|玛雅劲弩手|吴劲弩手|劲弩手|精锐火焰弓箭手|剑士|重装黑光铠骑兵|精锐高丽战车|冠军剑士|精锐豹勇士|精锐鹰勇士|精锐羽箭手|精锐掷矛手|精锐火矛兵|精锐扈从部队|翼骑兵|法兰克游侠|法兰克长戟兵|日本冠军剑士|不列颠劲弩手|条顿手推炮)/;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type DuelCase = readonly [
  civ: string,
  routeId: string,
  label: string,
  ka: boolean,
  winner: 'a' | 'b',
  alive: number,
  initial: number,
  retreated1dp: number | null,
  capHit: boolean | null,
  expectedUnmodeledA?: readonly string[],
];

const DUEL_CASES: readonly DuelCase[] = [
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 站桩对 50 个法兰克长戟兵（长戟剩 16/50）', false, 'b', 16, 50, null, null],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 拉扯对 50 个法兰克长戟兵（剩 9/18，后撤 38.1 格）', true, 'a', 9, 18, 38.1, false],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 正面对 42 个不列颠劲弩手（剩 15/18）', false, 'a', 15, 18, null, null],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 18 辆精锐高丽战车 拉扯对 42 个日本冠军剑士（剩 9/18，40.0 格触顶）', true, 'a', 9, 18, 40.0, true],
  ['Koreans', 'koreans-war-wagon-halberdier', '预算 3000 · 52 只高丽劲弩手 正面对 42 个不列颠劲弩手（剩 24/52）', false, 'a', 24, 52, null, null],
  [
    'Koreans',
    'koreans-war-wagon-halberdier',
    '预算 3000 · 52 只高丽劲弩手 拉扯对 42 个日本冠军剑士（52/52 满血零损，后撤 18.2 格）',
    true,
    'a',
    52,
    52,
    18.2,
    false,
  ],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 27 名精锐草原枪兵 对法兰克游侠 22 名（剩 4/27）', false, 'a', 4, 27, null, null],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 27 名精锐草原枪兵 对 42 个日本冠军剑士（剩 4/27）', false, 'a', 4, 27, null, null],
  ['Jurchens', 'jurchens-steppe-siege-field', '预算 3000 · 27 名精锐草原枪兵 对 42 个不列颠劲弩手（剩 12/27）', false, 'a', 12, 27, null, null],
  [
    'Jurchens',
    'jurchens-steppe-siege-field',
    '预算 3000 · 28 个掷弹兵 拉扯对 42 个日本冠军剑士（28/28 满血零损，后撤 20.0 格）',
    true,
    'a',
    28,
    28,
    20.0,
    false,
    ['固有溅射伤害'],
  ],
  [
    'Jurchens',
    'jurchens-steppe-siege-field',
    '预算 3000 · 28 个掷弹兵 拉扯对 50 个法兰克长戟兵（28/28 零阵亡、剩 1108/1120 血，后撤 20.0 格）',
    true,
    'a',
    28,
    28,
    20.0,
    false,
    ['固有溅射伤害'],
  ],
  ['Saxons', 'saxons-mounted-crossbow-field', '预算 3000 · 28 个重装骑马弩兵 站桩对 42 个日本冠军剑士（剩 10/28）', false, 'a', 10, 28, null, null],
  [
    'Saxons',
    'saxons-mounted-crossbow-field',
    '预算 3000 · 28 个重装骑马弩兵 拉扯对 42 个日本冠军剑士（剩 26/28，后撤 22.4 格）',
    true,
    'a',
    26,
    28,
    22.4,
    false,
  ],
  [
    'Saxons',
    'saxons-mounted-crossbow-field',
    '预算 3000 · 28 个重装骑马弩兵 拉扯对 50 个法兰克长戟兵（剩 27/28，后撤 17.2 格）',
    true,
    'a',
    27,
    28,
    17.2,
    false,
  ],
  ['Saxons', 'saxons-mounted-crossbow-field', '预算 3000 · 28 个重装骑马弩兵 正面对 42 个不列颠劲弩手（劲弩剩 18/42）', false, 'b', 18, 42, null, null],
  [
    'Saxons',
    'saxons-mounted-crossbow-field',
    '预算 3000 · 42 只撒克逊劲弩手 拉扯对 42 个日本冠军剑士（剩 39/42，后撤 20.9 格）',
    true,
    'a',
    39,
    42,
    20.9,
    false,
  ],
  ['Aztecs', 'aztecs-garland-infantry', '预算 3000 · 42 名冠军剑士 对法兰克游侠 22 名（游侠剩 1/22）', false, 'b', 1, 22, null, null],
  ['Aztecs', 'aztecs-garland-infantry', '预算 3000 · 33 名精锐豹勇士 对 42 个日本冠军剑士（剩 4/33）', false, 'a', 4, 33, null, null],
  ['Aztecs', 'aztecs-garland-infantry', '预算 3000 · 42 名精锐鹰勇士 对 42 个不列颠劲弩手（剩 20/42）', false, 'a', 20, 42, null, null],
  ['Mayans', 'mayans-arbalester-eagle-field', '预算 3000 · 61 只玛雅劲弩手 正面对 42 个不列颠劲弩手（剩 38/61）', false, 'a', 38, 61, null, null],
  [
    'Mayans',
    'mayans-arbalester-eagle-field',
    '预算 3000 · 61 只玛雅劲弩手 拉扯对 42 个日本冠军剑士（61/61 满血零损，后撤 15.6 格）',
    true,
    'a',
    61,
    61,
    15.6,
    false,
  ],
  ['Mayans', 'mayans-arbalester-eagle-field', '预算 3000 · 42 名精锐鹰勇士 对 42 个不列颠劲弩手（100 血，剩 25/42）', false, 'a', 25, 42, null, null],
  ['Mayans', 'mayans-plumed-archer-halberdier', '预算 3000 · 38 只精锐羽箭手 正面对 42 个不列颠劲弩手（剩 25/38）', false, 'a', 25, 38, null, null],
  ['Wu', 'wu-ranged-by-opponent', '预算 3000 · 42 只吴劲弩手 拉扯对 42 个日本冠军剑士（剩 31/42，后撤 23.9 格）', true, 'a', 31, 42, 23.9, false],
  [
    'Wu',
    'wu-ranged-by-opponent',
    '预算 3000 · 33 名精锐火焰弓箭手 拉扯对 42 个日本冠军剑士（冠军剩 16/42，后撤 31.7 格）',
    true,
    'b',
    16,
    42,
    31.7,
    false,
    ['充能多箭齐射', '固有溅射伤害'],
  ],
  [
    'Wu',
    'wu-ranged-by-opponent',
    '预算 3000 · 33 名精锐火焰弓箭手 正面对 42 个不列颠劲弩手（劲弩剩 38/42）',
    false,
    'b',
    38,
    42,
    null,
    null,
    ['充能多箭齐射', '固有溅射伤害'],
  ],
  [
    'Wu',
    'wu-jian-heiguang-frontline',
    '预算 3000 · 31 名剑士 正面对 42 个不列颠劲弩手（剩 21/31）',
    false,
    'a',
    21,
    31,
    null,
    null,
    ['受伤后变形态', '生命回复'],
  ],
  ['Wu', 'wu-jian-heiguang-frontline', '预算 3000 · 23 名重装黑光铠骑兵 正面对 42 个不列颠劲弩手（剩 2/23）', false, 'a', 2, 23, null, null],
];

describe('#1385 批 1 · 6 国策略与阵容重构回归', () => {
  it('全部 28 条预算 3000 链接及两处 DE 188329 勘误数值与领域引擎实算严格一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    // 关键单兵面板核对（含两处勘误：阿兹特克冠军 22 攻；玛雅精锐鹰勇士 752 满科技 100 血、帝王非精锐 753 含霍尔坎 95 血、城堡期 753 仅 55 血）
    const fullSim = (civ: string, uid: number, age: 3 | 4 = 4) => {
      const u = core.unitById[uid]!;
      return simulate(ctx, u, civ, age, presetUpTo(simTechs(ctx, u, civ), age, civ), new Set());
    };
    expect(fullSim('Aztecs', 567)).toMatchObject({ hp: 70, atk: 22, ma: 4, pa: 6 });
    expect(fullSim('Aztecs', 6)).toMatchObject({ ma: 2, pa: 6 });
    expect(fullSim('Aztecs', 492)).toMatchObject({ ma: 2, pa: 2, rof: 2 });
    expect(fullSim('Mayans', 752)).toMatchObject({ hp: 100 });
    expect(fullSim('Mayans', 753, 4)).toMatchObject({ hp: 95 });
    expect(fullSim('Mayans', 753, 3)).toMatchObject({ hp: 55 });
    // 验证城堡期 753 无法研霍尔坎，预算 3000 负于帝王不列颠劲弩；帝王未升精锐 753（含霍尔坎）95 血胜剩 9/42
    const britArbSide = resolve(ctx, core.unitById, parseSide('492.Britons.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    const mayanImpNonElite = resolve(ctx, core.unitById, parseSide('753.Mayans.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    const mayanCastleEagle = resolve(ctx, core.unitById, parseSide('753.Mayans.3.f.', { uid: 1, civ: '', age: 3, techs: 'f', team: [] }), 1);
    expect([isUnavail(britArbSide), isUnavail(mayanImpNonElite), isUnavail(mayanCastleEagle)]).toEqual([false, false, false]);
    if (!isUnavail(britArbSide) && !isUnavail(mayanImpNonElite) && !isUnavail(mayanCastleEagle)) {
      const nb = countForBudget(britArbSide.training.price.cost, 3000)!;
      const nImp = countForBudget(mayanImpNonElite.training.price.cost, 3000)!;
      const nCas = countForBudget(mayanCastleEagle.training.price.cost, 3000)!;
      const impRes = groupFight(mayanImpNonElite.F, nImp, britArbSide.F, nb);
      expect(impRes.status).toBe('win');
      if (impRes.status === 'win') expect([impRes.winner, impRes.aAlive, nImp]).toEqual(['a', 9, 42]);
      const casRes = groupFight(mayanCastleEagle.F, nCas, britArbSide.F, nb);
      expect(casRes.status).toBe('win');
      if (casRes.status === 'win') expect(casRes.winner).toBe('b');
    }
    const saxonsHmc = fullSim('Saxons', 2701);
    expect(saxonsHmc).toMatchObject({ hp: 75, atk: 12, ma: 5, pa: 4, rng: 8 });
    expect(saxonsHmc.rof).toBeCloseTo(2.25, 4);
    expect(fullSim('Jurchens', 1372)).toMatchObject({ hp: 100, atk: 15, ma: 3, pa: 6, rng: 1, rof: 1.6 });

    for (const [civ, routeId, label, ka, winner, aliveExp, initialExp, retExp, capExp, unmExp] of DUEL_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.bud, kite.a, kite.b], label).toEqual(['r', 3000, ka, false]);

      const cfgA = parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] });
      const cfgB = parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] });
      const sideA = resolve(ctx, core.unitById, cfgA, 1);
      const sideB = resolve(ctx, core.unitById, cfgB, 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      const na = countForBudget(sideA.training.price.cost, decoded.bud)!;
      const nb = countForBudget(sideB.training.price.cost, decoded.bud)!;
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

      if (label.includes('1108/1120')) {
        expect(Math.round(res.hpLeft)).toBe(1108);
      }

      if (unmExp) {
        const pills = detectUnitUnmodeled({
          unit: sideA.u,
          civ: cfgA.civ,
          age: cfgA.age,
          selectedTechs: [...sideA.sel].map((id) => core.techById[id]!).filter(Boolean),
        }).map(({ pill }) => pill);
        for (const expectedPill of unmExp) expect(pills, label).toContain(expectedPill);
      }
    }
  });

  it('6 国路线顺序、状态口径、独立来源指针重签（其余 27 国不变）与魏蜀吴校验脚本适配', () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');

    const expectedOrder: Record<string, [string, string, string][]> = {
      Koreans: [
        ['koreans-war-wagon-halberdier', 'approved', 'pending'],
        ['koreans-fire-lancer-garrison', 'approved', 'pending'],
      ],
      Jurchens: [
        ['jurchens-steppe-siege-field', 'approved', 'pending'],
        ['jurchens-fire-lancer-tower', 'approved', 'pending'],
      ],
      Saxons: [
        ['saxons-mounted-crossbow-field', 'approved', 'pending'],
        ['saxons-retainer-tower', 'approved', 'pending'],
      ],
      Aztecs: [
        ['aztecs-garland-infantry', 'approved', 'pending'],
        ['aztecs-eagle-skirmisher', 'candidate', 'unreported'],
      ],
      Mayans: [
        ['mayans-arbalester-eagle-field', 'approved', 'pending'],
        ['mayans-plumed-archer-halberdier', 'approved', 'unreported'],
      ],
      Wu: [
        ['wu-ranged-by-opponent', 'approved', 'pending'],
        ['wu-jian-heiguang-frontline', 'approved', 'pending'],
      ],
    };

    const targetSet = new Set<string>(TARGET_CIVS);
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        expect(civ.source.content, civ.civ).toContain(`/blob/${DOC_SHA}/role/game-strategy.md#L`);
        expect(
          civ.routes.map(({ id, status, playtest }) => [id, status, playtest]),
          civ.civ,
        ).toEqual(expectedOrder[civ.civ]);
        for (const r of civ.routes) {
          expect(r.source?.content, `${civ.civ}/${r.id}`).toContain(`/blob/${DOC_SHA}/role/game-strategy.md#L`);
          expect(r.playtest, `${civ.civ}/${r.id}`).not.toBe('reported');
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA);
        for (const r of civ.routes) {
          expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA);
        }
      }
    }

    // 魏/蜀仍保留旧提交，吴独立重签 DOC_SHA；校验脚本负例拦截非 40 位哈希、起止不匹配、乱序/重复/倒置/空数组与前导零
    expect(byCiv('Wei').source.content).toContain('/blob/a348c548624a41da50735eebf166d23456ff56fa/role/game-strategy.md#L1198-L1234');
    expect(byCiv('Shu').source.content).toContain('/blob/a348c548624a41da50735eebf166d23456ff56fa/role/game-strategy.md#L1236-L1270');

    // 验证阿兹特克城堡-帝王前期过渡含弩手（24, age 3）与劲弩手（492, age 4），女真霹雳炸弹（997）区分阵亡与炮弹爆炸
    const azTransition = route('Aztecs', 'aztecs-garland-infantry').supplements.find(({ entities }) => entities.some(({ id }) => id === 492));
    expect(azTransition?.entities.map(({ id, age }) => [id, age])).toEqual([
      [24, 3],
      [492, 4],
    ]);
    const jurchenBomb = route('Jurchens', 'jurchens-steppe-siege-field')
      .supplements.flatMap(({ entities }) => entities)
      .find((e) => e.kind === 'tech' && e.id === 997);
    expect(jurchenBomb?.role).toContain('炮弹会产生额外爆炸');

    const expectSourceContentRejected = (mutate: (content: typeof civFormationContent, contract: typeof formationContract) => void, note: string) => {
      const c = structuredClone(civFormationContent);
      const k = structuredClone(formationContract);
      mutate(c, k);
      expect(formationProblems(c, k), note).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/source\/content$/) }));
    };

    expectSourceContentRejected((c, k) => {
      const url = 'https://github.com/linhongcun/aoe2-analyzer/blob/main/role/game-strategy.md#L1569-L1618';
      c.find((x) => x.civ === 'Wu')!.routes[0]!.source!.content = url;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.source.content = url;
    }, 'non-40-hex commit');

    expectSourceContentRejected((c, k) => {
      const url = `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA}/role/game-strategy.md#L1569-L1600`;
      c.find((x) => x.civ === 'Wu')!.routes[0]!.source!.content = url;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.source.content = url;
    }, 'line range mismatch');

    expectSourceContentRejected((c, k) => {
      const bad = [1569, 1610, 1580, 1618];
      c.find((x) => x.civ === 'Wu')!.routes[0]!.evidence.sourceLines = bad;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.sourceLines = bad;
    }, 'mid-array out-of-order');

    expectSourceContentRejected((c, k) => {
      const bad = [1569, 1569, 1618];
      c.find((x) => x.civ === 'Wu')!.routes[0]!.evidence.sourceLines = bad;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.sourceLines = bad;
    }, 'duplicate line');

    expectSourceContentRejected((c, k) => {
      const bad = [1618, 1569];
      c.find((x) => x.civ === 'Wu')!.routes[0]!.evidence.sourceLines = bad;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.sourceLines = bad;
    }, 'reversed lines');

    expectSourceContentRejected((c, k) => {
      c.find((x) => x.civ === 'Wu')!.routes[0]!.evidence.sourceLines = [];
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.sourceLines = [];
    }, 'empty sourceLines');

    expectSourceContentRejected((c, k) => {
      const url = `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA}/role/game-strategy.md#L01569-L01618`;
      c.find((x) => x.civ === 'Wu')!.routes[0]!.source!.content = url;
      k.civs.find((x) => x.civ === 'Wu')!.routes[0]!.source.content = url;
    }, 'leading zeros in Wu URL');

    expectSourceContentRejected((c, k) => {
      const url = `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA}/role/game-strategy.md#L0546-L0596`;
      c.find((x) => x.civ === 'Koreans')!.routes[0]!.source!.content = url;
      k.civs.find((x) => x.civ === 'Koreans')!.routes[0]!.source.content = url;
    }, 'leading zeros in non-3K range URL');
  });

  it('6 国新增与修订文案、链接标签零计数词拆分，全站去重计数与公开链接唯一性保持稳定', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const sharedCounts: Record<string, number> = {};
    const targetSet = new Set<string>(TARGET_CIVS);
    const updatedRoutes = new Set([
      'koreans-war-wagon-halberdier',
      'jurchens-steppe-siege-field',
      'saxons-mounted-crossbow-field',
      'aztecs-garland-infantry',
      'mayans-arbalester-eagle-field',
      'wu-jian-heiguang-frontline',
      'wu-ranged-by-opponent',
    ]);
    const splits: string[] = [];

    for (const civ of civFormationContent) {
      const views: FormationView[] = publishedFormations(civ).map((r) => projectFormation(r, civ.civ, DATA_PATCH, { core, trees }, civ.routes, civ.source));
      const deduped = dedupeFormationClauses(views);
      if (deduped.shared.length > 0) sharedCounts[civ.civ] = deduped.shared.length;

      if (!targetSet.has(civ.civ)) continue;
      for (const r of civ.routes) {
        const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
        expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
        for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);

        if (updatedRoutes.has(r.id)) {
          const texts = [
            r.title,
            r.condition,
            r.reason,
            r.limitation,
            r.attack,
            r.defense,
            r.alternatives,
            r.evidence.scope,
            ...(r.required ?? []).map(({ role }) => role),
            ...(r.choices ?? []).flatMap(({ entities }) => entities.map(({ role }) => role)),
            ...(r.supplements ?? []).flatMap(({ entities }) => entities.map(({ role }) => role)),
            ...(r.adjustments ?? []).map(({ text }) => text),
          ].filter((v): v is string => Boolean(v));

          for (const text of texts) {
            for (const sentence of text.split('。')) {
              if (!sentence) continue;
              const html = renderToStaticMarkup(createElement(FormationText, { text: sentence }));
              if (SPLIT_COUNTED_NOUN.test(html)) splits.push(`${civ.civ}/${r.id} text: ${sentence}`);
            }
          }
          for (const { label } of r.evidence.links ?? []) {
            const html = renderToStaticMarkup(createElement(FormationText, { text: label }));
            if (SPLIT_COUNTED_NOUN.test(html)) splits.push(`${civ.civ}/${r.id} link: ${label}`);
          }
        }
      }
    }

    expect(splits).toEqual([]);
    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });
});
