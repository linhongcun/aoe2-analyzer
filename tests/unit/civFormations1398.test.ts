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
import { groupFight } from '../../src/domain/duel';
import { resolveSideBudgetCount } from '../../src/domain/duelBudget';
import { decodeDuelKite, decodeDuelParams, decodeDuelRelics } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { makeSimContext } from '../../src/domain/simulator';
import { unitTrainCount } from '../../src/domain/trainBatch';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

const DOC_SHA_1398 = 'b63cccc015b677017efb4a64de8ebc01cd727ffd';
const TARGET_CIVS = ['Tupi', 'Lithuanians'] as const;

const SPLIT_COUNTED_NOUN =
  /<span class="num nw">\d+\s*(?:个|名|只|座|条|辆)<\/span>(?:精锐黑檀木步弓手|黑檀木步弓手|精锐烈堤司|烈堤司|游侠|法兰克游侠|条顿游侠|精锐条顿骑士|不列颠劲弩手|日本冠军剑士|法兰克长戟兵|图皮投石手|投石手|精锐掷矛手|长戟兵|村民)/;

// 规则①：绝对拦截裸「圣物」「件」
const UNWRAPPED_RELIC_OR_JIAN = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*(?:圣物|件)/g;
// 规则②：默认全拦裸「只」，仅放行经核实锚定副词上下文（如「预算 3000 只够…」）
const UNWRAPPED_ZHI = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*只/g;
// 规则③：默认全拦裸「数字 + 对」，仅放行经核实锚定非量词介词上下文
const BARE_NUM_DUI = /<span class="num nw">[+\-−]?\d+(?:\.\d+)?(?:\s*(?:\/|:|–|—|-|至|\u2192)\s*[+\-−]?\d+(?:\.\d+)?)*<\/span>\s*对/g;

function findUnwrappedUnitSplits(html: string): string[] {
  const hits: string[] = [];
  for (const m of html.matchAll(UNWRAPPED_RELIC_OR_JIAN)) hits.push(m[0]);
  for (const m of html.matchAll(UNWRAPPED_ZHI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    const allowedAdverb = /预算\s*$/.test(before) && /^够/.test(after);
    if (!allowedAdverb) hits.push(m[0]);
  }
  for (const m of html.matchAll(BARE_NUM_DUI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    const allowedPreposition =
      (/预算\s*$/.test(before) && /^\s*<span class="num nw">/.test(after)) || (/圣物数\s*$/.test(before) && /^(?:战果|胜负)/.test(after));
    if (!allowedPreposition) hits.push(m[0]);
  }
  return hits;
}

const renderFormationText = (text: string) => renderToStaticMarkup(createElement(FormationText, { text }));

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type LinkDuelCase = readonly [
  civ: (typeof TARGET_CIVS)[number],
  routeId: string,
  label: string,
  raExpected: number,
  kaExpected: boolean,
  winnerExpected: 'a' | 'b',
  aliveExpected: number,
  initialExpected: number,
  retreated1dp: number | null,
  capHit: boolean | null,
  expectedSpendA?: number,
];

const NEW_LINK_CASES: readonly LinkDuelCase[] = [
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 站桩对 42 个不列颠劲弩手（剩 8/70，一维接敌模型）',
    0,
    false,
    'a',
    8,
    70,
    null,
    null,
    2975,
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 拉扯对 42 个日本冠军剑士（70/70 满血零损，后撤 29.1 格，一维接敌模型）',
    0,
    true,
    'a',
    70,
    70,
    29.1,
    false,
    2975,
  ],
  [
    'Tupi',
    'tupi-blackwood-halberdier',
    '预算 3000 · 70 只精锐黑檀木步弓手 拉扯对法兰克游侠 22 名（游侠剩 13/22，后撤 10.1 格，一维接敌模型）',
    0,
    true,
    'b',
    13,
    22,
    10.1,
    false,
    2975,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对 42 个不列颠劲弩手（劲弩剩 8/42，一维接敌模型）',
    0,
    false,
    'b',
    8,
    42,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 2 · 精锐烈堤司 25 名对 42 个不列颠劲弩手（剩 7/25，一维接敌模型）',
    2,
    false,
    'a',
    7,
    25,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对 50 个法兰克长戟兵（长戟剩 4/50，一维接敌模型）',
    0,
    false,
    'b',
    4,
    50,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 2 · 精锐烈堤司 25 名对 50 个法兰克长戟兵（剩 1/25，一维接敌模型）',
    2,
    false,
    'a',
    1,
    25,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 精锐烈堤司 25 名对 26 名精锐条顿骑士（条顿骑士剩 2/26，一维接敌模型）',
    0,
    false,
    'b',
    2,
    26,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 2 · 精锐烈堤司 25 名对 26 名精锐条顿骑士（剩 1/25，一维接敌模型）',
    2,
    false,
    'a',
    1,
    25,
    null,
    null,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '圣物数 0 · 游侠 22 名对法兰克游侠 22 名（法兰克游侠剩 3/22，一维接敌模型）',
    0,
    false,
    'b',
    3,
    22,
    null,
    null,
  ],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '圣物数 4 · 游侠 22 名对法兰克游侠 22 名（剩 1/22，一维接敌模型）', 4, false, 'a', 1, 22, null, null],
];

describe('#1398 图皮成对黑檀木与立陶宛 0/2/4 圣物同步收口回归', () => {
  it('全部 11 条新增预算 3000 复现链接与正文引用的其余圣物档位对照均与 DE 188329 领域引擎严格一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    expect(NEW_LINK_CASES).toHaveLength(11);

    for (const [
      civ,
      routeId,
      label,
      raExpected,
      kaExpected,
      winnerExpected,
      aliveExpected,
      initialExpected,
      retreated1dp,
      capHit,
      expectedSpendA,
    ] of NEW_LINK_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing link: ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      const relics = decodeDuelRelics(params);

      expect([decoded.mode, decoded.bud, kite.a, kite.b, relics.a, relics.b], label).toEqual(['r', 3000, kaExpected, false, raExpected, 0]);
      if (raExpected === 0) expect(params.has('ra'), label).toBe(false);
      else expect(params.get('ra'), label).toBe(String(raExpected));

      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.a);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, relics.b);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      const budgetA = resolveSideBudgetCount('r', sideA.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideA.u));
      const budgetB = resolveSideBudgetCount('r', sideB.training.price.cost, 0, { bud: decoded.bud, vils: 10, mins: 10 }, unitTrainCount(sideB.u));
      expect([budgetA.error, budgetB.error], label).toEqual([null, null]);
      if (expectedSpendA !== undefined) {
        expect(budgetA.batches! * budgetA.unitCost, label).toBe(expectedSpendA);
        expect([budgetA.batches, budgetA.count], label).toEqual([35, 70]);
      }

      const fight = groupFight(sideA.F, budgetA.count!, sideB.F, budgetB.count!, kaExpected ? { kite: { a: true, b: false } } : undefined);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe(winnerExpected);
      const alive = fight.winner === 'a' ? fight.aAlive : fight.bAlive;
      const initial = fight.winner === 'a' ? budgetA.count! : budgetB.count!;
      expect([alive, initial], label).toEqual([aliveExpected, initialExpected]);
      if (label.includes('满血零损')) {
        expect(Math.round(fight.hpLeft), `${label} full HP`).toBe(budgetA.count! * sideA.F.hp);
        expect(Math.round(fight.hpLeft), `${label} total 1750 HP`).toBe(1750);
      }
      if (retreated1dp !== null) {
        const kaSum = fight.contact.kite?.a;
        expect(kaSum, label).toBeDefined();
        expect(Number(kaSum!.retreated.toFixed(1)), label).toBe(retreated1dp);
        expect(kaSum!.capHit, label).toBe(capHit);
      }
    }

    // 复算正文引用的立陶宛其余 0/1/2/3/4 圣物对位（区分 1 件/2 件最低翻胜门槛与 4 件平局/余量）
    const runMatch = (aSpec: string, bSpec: string, ra: number) => {
      const sA = resolve(ctx, core.unitById, parseSide(aSpec, { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, ra);
      const sB = resolve(ctx, core.unitById, parseSide(bSpec, { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1, 0);
      if (isUnavail(sA) || isUnavail(sB)) throw new Error('unexpected unavailable');
      const bA = resolveSideBudgetCount('r', sA.training.price.cost, 0, { bud: 3000, vils: 10, mins: 10 }, unitTrainCount(sA.u));
      const bB = resolveSideBudgetCount('r', sB.training.price.cost, 0, { bud: 3000, vils: 10, mins: 10 }, unitTrainCount(sB.u));
      return { aAtk: sA.S.atk, na: bA.count!, nb: bB.count!, res: groupFight(sA.F, bA.count!, sB.F, bB.count!) };
    };

    expect(runMatch('1236.Lithuanians.4.f.', '569.Franks.4.f.', 0)).toMatchObject({ aAtk: 18, na: 25, nb: 22, res: { status: 'win', winner: 'a', aAlive: 2 } });
    expect(runMatch('1236.Lithuanians.4.f.', '569.Teutons.4.f.', 0)).toMatchObject({
      aAtk: 18,
      na: 25,
      nb: 22,
      res: { status: 'win', winner: 'a', aAlive: 3 },
    });
    expect(runMatch('1236.Lithuanians.4.f.', '567.Japanese.4.f.', 0)).toMatchObject({
      aAtk: 18,
      na: 25,
      nb: 42,
      res: { status: 'win', winner: 'a', aAlive: 1 },
    });
    expect(runMatch('1236.Lithuanians.4.f.', '492.Britons.4.f.', 1)).toMatchObject({
      aAtk: 19,
      na: 25,
      nb: 42,
      res: { status: 'win', winner: 'b', bAlive: 8 },
    });
    expect(runMatch('1236.Lithuanians.4.f.', '359.Franks.4.f.', 1)).toMatchObject({
      aAtk: 19,
      na: 25,
      nb: 50,
      res: { status: 'win', winner: 'b', bAlive: 4 },
    });
    expect(runMatch('1236.Lithuanians.4.f.', '554.Teutons.4.f.', 1)).toMatchObject({
      aAtk: 19,
      na: 25,
      nb: 26,
      res: { status: 'win', winner: 'a', aAlive: 1 },
    });
    expect(runMatch('1236.Lithuanians.4.f.', '554.Teutons.4.f.', 4)).toMatchObject({
      aAtk: 22,
      na: 25,
      nb: 26,
      res: { status: 'win', winner: 'a', aAlive: 3 },
    });
    expect(runMatch('569.Lithuanians.4.f.', '492.Britons.4.f.', 0)).toMatchObject({ aAtk: 16, na: 22, nb: 42, res: { status: 'win', winner: 'a', aAlive: 5 } });
    expect(runMatch('569.Lithuanians.4.f.', '569.Teutons.4.f.', 0)).toMatchObject({ aAtk: 16, na: 22, nb: 22, res: { status: 'win', winner: 'b', bAlive: 4 } });
    expect(runMatch('569.Lithuanians.4.f.', '569.Franks.4.f.', 2)).toMatchObject({ aAtk: 18, na: 22, nb: 22, res: { status: 'win', winner: 'b', bAlive: 1 } });
    expect(runMatch('569.Lithuanians.4.f.', '569.Franks.4.f.', 3).res.status).toBe('draw');
    expect(runMatch('569.Lithuanians.4.f.', '569.Teutons.4.f.', 4).res.status).toBe('draw');
  });

  it('全库过期计价表述清零、仅两国重签 DOC_SHA_1398、其余 31 国不引用本次提交与契约/去重不变量全部通过', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    expect(civFormationContent).toHaveLength(33);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(59);

    const serialized = JSON.stringify(civFormationContent);
    expect(serialized).not.toMatch(/一只还是一对|计价单位未明|计价单位未核|不折半|每对价格单位/);

    const targetSet = new Set<string>(TARGET_CIVS);
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        expect(civ.source.content, civ.civ).toContain(`/blob/${DOC_SHA_1398}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          expect(r.source?.content, `${civ.civ}/${r.id}`).toContain(`/blob/${DOC_SHA_1398}/role/game-strategy.md#L`);
          const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
          expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
          for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1398);
        for (const r of civ.routes) {
          expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1398);
        }
      }
    }

    // 确认 #1385 与 #1386 既有固定指针未受波及
    expect(byCiv('Aztecs').source.content).toContain('/blob/bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8/role/game-strategy.md#L');
    expect(byCiv('Mayans').source.content).toContain('/blob/bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8/role/game-strategy.md#L');
    expect(byCiv('Mapuche').source.content).toContain('/blob/415863b2a3e94078129554c09378c9a9fba04b57/role/game-strategy.md#L');
    expect(byCiv('Malians').source.content).toContain('/blob/6c3cdc6ded5200eac43e95efb28878066b96c3d9/role/game-strategy.md#L');

    // 去重计数不变量
    const core = await loadCore();
    const trees = await loadTrees();
    const sharedCounts: Record<string, number> = {};
    for (const civ of civFormationContent) {
      const views: FormationView[] = publishedFormations(civ).map((r) => projectFormation(r, civ.civ, DATA_PATCH, { core, trees }, civ.routes, civ.source));
      expect(
        views.every((v) => v.status === 'current'),
        civ.civ,
      ).toBe(true);
      const deduped = dedupeFormationClauses(views);
      if (deduped.shared.length > 0) sharedCounts[civ.civ] = deduped.shared.length;
    }
    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });

  it('FormationText 守卫双边自测通过，且三条目标路线按 Route ID 逐条满足正向单 span 包裹与零拆分', () => {
    // 1. 守卫自测：必拒反例（含双命中「其中 35 只留守，另有 35 只出击。」与「35 对上述步弓手」）
    const mustReject = [
      '0/2/4 圣物',
      '0 / 2 / 4 圣物',
      '0 圣物',
      '不默认开局有4件',
      '2 件',
      '35 对',
      '预算 3000 可训练 35 对上述步弓手',
      '预算 3000 计 35 对（70 只）',
      '预算 3000 产出 70 只',
    ];
    for (const bad of mustReject) {
      expect(findUnwrappedUnitSplits(renderFormationText(bad)).length, `expected reject: ${bad}`).toBeGreaterThan(0);
    }
    expect(findUnwrappedUnitSplits(renderFormationText('其中 35 只留守，另有 35 只出击。'))).toHaveLength(2);

    // 2. 守卫自测：必放行正例（既有交战介词、圣物影响介词与「预算 3000 只够…」副词）
    const mustAllow = [
      '40 个图皮投石手 对 42 个日本冠军剑士 站桩落败（冠军剩 8/42）',
      '预算 3000 对 42 个日本冠军剑士 中，40 个图皮投石手（卡西克射速）站桩落败',
      '圣物数 2 对战果的影响',
      '预算 3000 只够训练一批',
    ];
    for (const ok of mustAllow) {
      expect(findUnwrappedUnitSplits(renderFormationText(ok)), `expected allow: ${ok}`).toEqual([]);
    }

    // 3. 按三个具体 Route ID 扫描全部文本与链接标签，零裸量词/圣物拆分、零计数词拆分
    const collectRouteTexts = (r: ReturnType<typeof route>) =>
      [
        r.title,
        r.condition,
        r.reason,
        r.limitation,
        r.attack,
        r.defense,
        r.alternatives,
        r.evidence.scope,
        r.evidence.recordedVersion,
        ...(r.required ?? []).map(({ role }) => role),
        ...(r.supplements ?? []).flatMap(({ condition, entities }) => [condition, ...entities.map(({ role }) => role)]),
        ...(r.adjustments ?? []).flatMap(({ text, fallback, decision }) => [text, fallback, decision?.condition, decision?.also, decision?.exception]),
        ...(r.evidence.links ?? []).map(({ label }) => label),
      ].filter((v): v is string => Boolean(v));

    const routePositiveTokens: readonly [civ: (typeof TARGET_CIVS)[number], routeId: string, tokens: readonly string[]][] = [
      [
        'Tupi',
        'tupi-blackwood-halberdier',
        [
          '2 名',
          '40 木材',
          '45 黄金',
          '20 木材',
          '22.5 黄金',
          '70 只精锐黑檀木步弓手',
          '42 个不列颠劲弩手',
          '8/70',
          '42 个日本冠军剑士',
          '70/70',
          '29.1 格',
          '22 名',
          '13/22',
          '10.1 格',
        ],
      ],
      ['Tupi', 'tupi-champi-slinger', ['40 木材', '45 黄金', '2 名', '20 木材', '22.5 黄金', '40 个图皮投石手', '42 个日本冠军剑士', '6.2 格']],
      [
        'Lithuanians',
        'lithuanians-leitis-skirmisher',
        [
          '0/2/4',
          '25 名',
          '18 攻',
          '20 攻',
          '22 攻',
          '16 攻',
          '22 名',
          '2/25',
          '3/25',
          '1/25',
          '42 个不列颠劲弩手',
          '8/42',
          '50 个法兰克长戟兵',
          '4/50',
          '26 名精锐条顿骑士',
          '2/26',
          '7/25',
          '5/22',
          '3/22',
          '4/22',
          '1/22',
          '42 个日本冠军剑士',
        ],
      ],
    ];

    for (const [civ, routeId, expectedTokens] of routePositiveTokens) {
      const r = route(civ, routeId);
      const texts = collectRouteTexts(r);
      const rendered = texts.map((t) => ({ text: t, html: renderFormationText(t) }));

      for (const { text, html } of rendered) {
        expect(findUnwrappedUnitSplits(html), `${civ}/${routeId} unwrapped unit in: ${text}`).toEqual([]);
        expect(html, `${civ}/${routeId} split counted noun in: ${text}`).not.toMatch(SPLIT_COUNTED_NOUN);
      }

      const allHtml = rendered.map(({ html }) => html).join('\n');
      for (const token of expectedTokens) {
        expect(allHtml, `${civ}/${routeId} missing wrapped .num.nw token: ${token}`).toContain(`<span class="num nw">${token}</span>`);
      }
    }
  });
});
