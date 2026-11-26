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

const DOC_SHA_1386 = '6c3cdc6ded5200eac43e95efb28878066b96c3d9';
const SUPERSEDED_BY_LATER = new Map<string, string>([
  ['Hindustanis', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Persians', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Turks', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Malians', '54f7f61d762a5ec6bf665431c28f549df43681f9'],
  ['Goths', '372fbdd43c4902b9d03ef1dc69dcf203cb2f8e6e'],
  ['Poles', '372fbdd43c4902b9d03ef1dc69dcf203cb2f8e6e'],
  ['Spanish', 'df2e8a9b1f966f5917703ed984f9e02515c95f91'],
  ['Japanese', 'df2e8a9b1f966f5917703ed984f9e02515c95f91'],
]);
const BATCH_1_SHA = 'bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8';

const TARGET_CIVS = ['Hindustanis', 'Persians', 'Turks', 'Malians', 'Sicilians', 'Goths', 'Poles', 'Spanish', 'Georgians', 'Japanese', 'Wei', 'Shu'] as const;

const INHERITED_SOURCE_CIVS = new Set(['Spanish', 'Georgians', 'Wei', 'Shu', 'Persians']);

const SPLIT_COUNTED_NOUN =
  /<span class="num nw">\d+\s*(?:个|名|只|座|条|辆)<\/span>(?:火枪手|村民|劲弩手|精锐萨金特卫兵|萨金特卫兵|弩手|免金弩手|精锐掷矛手|手推炮|轻型骑兵|翼骑兵|波兰翼骑兵|帝王骆驼兵|精锐古拉姆|攻城战象|重装骑射手|西帕希重装骑射手|重装骑士|死士重装骑士|重装骆驼兵|死士重装骆驼兵|锁子甲重装骑士|重装骑马弩兵|冠军剑士|精锐莫纳斯帕|重装黑光铠骑兵|精锐白毦兵|法兰克长戟兵|日本冠军剑士|不列颠劲弩手|法兰克游侠|条顿游侠|城镇中心)/;

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
];

const DUEL_CASES: readonly DuelCase[] = [
  ['Hindustanis', 'hindustani-camel-ghulam-field', '预算 3000 · 26 名帝王骆驼兵 对法兰克游侠 22 名（剩 7/26）', false, 'a', 7, 26, null, null],
  ['Hindustanis', 'hindustani-camel-ghulam-field', '预算 3000 · 26 名帝王骆驼兵 对条顿游侠 22 名（剩 7/26）', false, 'a', 7, 26, null, null],
  ['Hindustanis', 'hindustani-camel-ghulam-field', '预算 3000 · 精锐古拉姆 40 名对 42 个不列颠劲弩手（剩 20/40，未计溅射）', false, 'a', 20, 40, null, null],
  [
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '预算 3000 · 30 个重装骑射手 拉扯对 42 个日本冠军剑士（剩 23/30，后撤 27.8 格）',
    true,
    'a',
    23,
    30,
    27.8,
    false,
  ],
  [
    'Persians',
    'persian-savar-crossbow-bombard',
    '预算 3000 · 60 个弩手 拉扯对 50 个法兰克长戟兵（60/60 满血零损，后撤 9.1 格）',
    true,
    'a',
    60,
    60,
    9.1,
    false,
  ],
  ['Persians', 'persian-savar-crossbow-bombard', '预算 3000 · 60 个弩手 拉扯对 42 个日本冠军剑士（剩 31/60，后撤 18.1 格）', true, 'a', 31, 60, 18.1, false],
  ['Persians', 'persian-savar-crossbow-bombard', '预算 3000 · 60 个弩手 对 42 个不列颠劲弩手（剩 8/60）', false, 'a', 8, 60, null, null],
  ['Turks', 'turks-sipahi-cav-archer-field', '预算 3000 · 30 个西帕希重装骑射手 正面对 42 个不列颠劲弩手（剩 21/30）', false, 'a', 21, 30, null, null],
  [
    'Turks',
    'turks-sipahi-cav-archer-field',
    '预算 3000 · 30 个西帕希重装骑射手 拉扯对 42 个日本冠军剑士（剩 25/30，后撤 27.8 格）',
    true,
    'a',
    25,
    30,
    27.8,
    false,
  ],
  ['Malians', 'malians-farimba-cav-champ-field', '预算 3000 · 22 名死士重装骑士 对法兰克游侠 22 名（游侠剩 2/22）', false, 'b', 2, 22, null, null],
  ['Malians', 'malians-farimba-cav-champ-field', '预算 3000 · 26 名死士重装骆驼兵 对法兰克游侠 22 名（剩 3/26）', false, 'a', 3, 26, null, null],
  ['Malians', 'malians-farimba-cav-champ-field', '预算 3000 · 42 名冠军剑士 对 42 个不列颠劲弩手（剩 16/42）', false, 'a', 16, 42, null, null],
  ['Sicilians', 'sicilians-serjeant-light-cavalry', '预算 3000 · 22 名锁子甲重装骑士 对 50 个法兰克长戟兵（长戟剩 16/50）', false, 'b', 16, 50, null, null],
  ['Sicilians', 'sicilians-serjeant-light-cavalry', '预算 3000 · 22 名锁子甲重装骑士 对法兰克游侠 22 名（游侠剩 4/22）', false, 'b', 4, 22, null, null],
  [
    'Sicilians',
    'sicilians-serjeant-light-cavalry',
    '预算 3000 · 28 名重装骑马弩兵 拉扯对 42 个日本冠军剑士（剩 25/28，后撤 33.1 格）',
    true,
    'a',
    25,
    28,
    33.1,
    false,
  ],
  ['Sicilians', 'sicilians-serjeant-light-cavalry', '预算 3000 · 28 名重装骑马弩兵 对 42 个不列颠劲弩手（劲弩剩 33/42）', false, 'b', 33, 42, null, null],
  ['Georgians', 'georgians-monaspa-field', '预算 3000 · 精锐莫纳斯帕 28 名对法兰克游侠 22 名（游侠剩 2/22，未计光环与回血）', false, 'b', 2, 22, null, null],
  ['Georgians', 'georgians-monaspa-field', '预算 3000 · 精锐莫纳斯帕 28 名对 42 个日本冠军剑士（冠军剩 3/42，未计光环与回血）', false, 'b', 3, 42, null, null],
  [
    'Georgians',
    'georgians-monaspa-field',
    '预算 3000 · 精锐莫纳斯帕 28 名对 42 个不列颠劲弩手（劲弩剩 10/42，未计光环与回血）',
    false,
    'b',
    10,
    42,
    null,
    null,
  ],
  ['Wei', 'wei-hussar-xianbei', '预算 3000 · 23 名重装黑光铠骑兵 对法兰克游侠 22 名（剩 1/23）', false, 'a', 1, 23, null, null],
  ['Wei', 'wei-hussar-xianbei', '预算 3000 · 23 名重装黑光铠骑兵 对 42 个日本冠军剑士（剩 2/23）', false, 'a', 2, 23, null, null],
  ['Shu', 'shu-crossbow-arbalester', '预算 3000 · 40 名精锐白毦兵 对法兰克游侠 22 名（游侠剩 1/22，未计减速）', false, 'b', 1, 22, null, null],
  ['Shu', 'shu-crossbow-arbalester', '预算 3000 · 30 个重装骑射手 拉扯对 42 个日本冠军剑士（剩 21/30，后撤 29.2 格）', true, 'a', 21, 30, 29.2, false],
  ['Shu', 'shu-crossbow-arbalester', '预算 3000 · 30 个重装骑射手 对 42 个不列颠劲弩手（劲弩剩 21/42）', false, 'b', 21, 42, null, null],
];

describe('#1386 批 2 · 8 国缺项补齐与全篇残留收口回归', () => {
  it('全部 24 条新增预算 3000 群战与拉扯链接与 DE 188329 领域引擎实算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    expect(DUEL_CASES).toHaveLength(24);

    for (const [civ, routeId, label, ka, winner, aliveExpected, initialExpected, retreated1dp, capHit] of DUEL_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing link: ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      expect([decoded.mode, decoded.bud, decodeDuelKite(params).a], label).toEqual(['r', 3000, ka]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const na = countForBudget(sideA.training.price.cost, decoded.bud)!;
      const nb = countForBudget(sideB.training.price.cost, decoded.bud)!;
      const result = groupFight(sideA.F, na, sideB.F, nb, ka ? { kite: { a: true, b: false } } : undefined);
      expect(result.status, label).toBe('win');
      if (result.status !== 'win') continue;
      expect(result.winner, label).toBe(winner);
      const alive = winner === 'a' ? result.aAlive : result.bAlive;
      const initial = winner === 'a' ? na : nb;
      expect([alive, initial], label).toEqual([aliveExpected, initialExpected]);
      if (retreated1dp !== null) {
        const kaSum = result.contact.kite?.a;
        expect(kaSum, label).toBeDefined();
        expect(Number(kaSum!.retreated.toFixed(1)), label).toBe(retreated1dp);
        expect(kaSum!.capHit, label).toBe(capHit);
      }
    }
  });

  it('8 国核心单位满科技面板、未建模提示与城堡科技前置全部与 DE 188329 数据一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    const imperial = (civ: string, uid: number) => {
      const u = core.unitById[uid]!;
      const selected = presetUpTo(simTechs(ctx, u, civ), 4, civ);
      const stats = simulate(ctx, u, civ, 4, selected, new Set());
      const pills = detectUnitUnmodeled({
        unit: u,
        civ,
        age: 4,
        selectedTechs: [...selected].map((id) => core.techById[id]!).filter(Boolean),
      }).map(({ pill }) => pill);
      return { stats, pills };
    };

    expect(imperial('Hindustanis', 207).stats).toMatchObject({ hp: 160, atk: 12, ma: 3, pa: 4 });
    expect(imperial('Hindustanis', 1749)).toMatchObject({ stats: { hp: 70, atk: 15, ma: 2, pa: 8 }, pills: ['固有溅射伤害'] });
    expect(imperial('Hindustanis', 1746)).toMatchObject({ stats: { hp: 240, atk: 8, ma: 1, pa: 154 }, pills: ['固有溅射伤害'] });
    expect(imperial('Hindustanis', 474).stats).toMatchObject({ hp: 80, atk: 11, ma: 4, pa: 4, rng: 7 });
    expect(imperial('Malians', 283).stats).toMatchObject({ hp: 140, atk: 19, ma: 5, pa: 6 });
    expect(imperial('Malians', 330).stats).toMatchObject({ hp: 140, atk: 14, ma: 3, pa: 4 });
    expect(imperial('Malians', 567).stats).toMatchObject({ hp: 70, atk: 16, ma: 4, pa: 8 });
    expect(imperial('Georgians', 1805)).toMatchObject({ stats: { hp: 100, atk: 18, ma: 8, pa: 6 }, pills: ['光环 / 编队增益', '生命回复'] });
    expect(imperial('Georgians', 588)).toMatchObject({ stats: { rng: 9 }, pills: ['固有溅射伤害'] });
    expect(imperial('Turks', 474).stats).toMatchObject({ hp: 100, atk: 11, ma: 5, pa: 6, rng: 7 });
    expect(Math.round(imperial('Wei', 1946).stats.hp)).toBe(137);
    expect(imperial('Wei', 1946).stats).toMatchObject({ atk: 16, ma: 10, pa: 5 });
    expect(imperial('Shu', 1961)).toMatchObject({ stats: { hp: 100, atk: 9, ma: 3, pa: 7 }, pills: ['命中减速'] });
    expect(imperial('Shu', 474).stats).toMatchObject({ hp: 60, atk: 11, ma: 4, pa: 4, rng: 7 });
    expect(imperial('Shu', 1966)).toMatchObject({ stats: { hp: 425, atk: 16, ma: 6, pa: 7 }, pills: ['光环 / 编队增益'] });
    expect(imperial('Sicilians', 283).stats).toMatchObject({ hp: 140, atk: 16, ma: 6, pa: 8 });
    expect(imperial('Sicilians', 2701).stats).toMatchObject({ hp: 75, atk: 12, ma: 4, pa: 2, rng: 8, rof: 2.5 });
    expect(imperial('Persians', 1813).stats).toMatchObject({ hp: 165, atk: 18, ma: 6, pa: 8 });
    expect(imperial('Persians', 36)).toMatchObject({ stats: { rng: 12 }, pills: ['固有溅射伤害'] });

    // 全部城堡研究前置科技（b === 82）核验
    for (const [id, age, cost] of [
      [506, 3, { Food: 250, Wood: 200 }],
      [577, 4, { Food: 650, Gold: 400 }],
      [491, 3, { Food: 350, Gold: 150 }],
      [1061, 3, { Food: 250, Wood: 300 }],
      [756, 3, { Food: 400, Gold: 300 }],
      [757, 4, { Food: 700, Gold: 600 }],
      [7, 4, { Wood: 600, Gold: 300 }],
      [924, 4, { Food: 550, Gold: 250 }],
    ] as const) {
      expect(core.techById[id], `tech ${id}`).toMatchObject({ age, b: 82, bz: '城堡', cost });
    }
  });

  it('12 国独立重签 DOC_SHA_1386、21 国零漂移、33 文明 59 路线契约与残留收口守卫全部通过', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(civFormationContent).toHaveLength(33);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(68);

    // 全库 JSON 与契约零 aoe2insights 外链残留
    expect(JSON.stringify(civFormationContent)).not.toContain('aoe2insights');
    expect(JSON.stringify(formationContract)).not.toContain('aoe2insights');

    const targetSet = new Set<string>(TARGET_CIVS);
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        const expectedSha = SUPERSEDED_BY_LATER.get(civ.civ) ?? DOC_SHA_1386;
        expect(civ.source.content, civ.civ).toContain(`/blob/${expectedSha}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          if (INHERITED_SOURCE_CIVS.has(civ.civ)) {
            expect(r.source, `${civ.civ}/${r.id}`).toBeUndefined();
          } else {
            expect(r.source?.content, `${civ.civ}/${r.id}`).toContain(`/blob/${expectedSha}/role/game-strategy.md#L`);
          }
          expect(r.playtest, `${civ.civ}/${r.id}`).not.toBe('reported');
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1386);
        for (const r of civ.routes) {
          expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1386);
        }
      }
    }

    // #1385 批 1 六国保持原提交不变
    for (const batch1Civ of ['Jurchens', 'Saxons', 'Wu', 'Koreans', 'Aztecs', 'Mayans']) {
      expect(byCiv(batch1Civ).source.content, batch1Civ).toContain(`/blob/${BATCH_1_SHA}/role/game-strategy.md#L`);
    }

    // 落位与架构约束守卫
    const turksSipahi = route('Turks', 'turks-sipahi-cav-archer-field');
    expect(turksSipahi.prerequisites.map(({ id }) => id)).toEqual([491]);
    expect(turksSipahi.required.every((e) => !e.research)).toBe(true);

    const maliansField = route('Malians', 'malians-farimba-cav-champ-field');
    expect(maliansField.prerequisites).toEqual([]);
    expect(maliansField.supplements.some(({ mode, entities }) => mode === 'mechanism-support' && entities.some(({ id }) => id === 577))).toBe(true);
    expect(maliansField.adjustments?.every((a) => !a.decision)).toBe(true);

    // 残留收口：波兰双路逗号版分工具口径、格鲁吉亚/日本/西西里城堡队列提醒
    for (const poleRouteId of ['poles-obuch-winged-hussar', 'poles-arbalest-winged-hussar'] as const) {
      const lim = route('Poles', poleRouteId).limitation ?? '';
      expect(lim).toContain(
        '列克提克遗产的践踏伤害在科技模拟器中仍标为“仅文本”、不改单兵基础值，在单位 PK 勾选后会弹出践踏未建模提示卡（#1296），不代表群战或混编胜率',
      );
    }
    expect(route('Japanese', 'japanese-samurai-light-cavalry').limitation).toContain('共用城堡生产队列');
    expect(route('Sicilians', 'sicilians-serjeant-light-cavalry').limitation).toContain('共用城堡生产队列');
    expect(route('Georgians', 'georgians-monaspa-field').limitation).toContain('共用城堡生产队列');
    expect(route('Georgians', 'georgians-monaspa-field').limitation).toContain('强化教堂 9 格 +10% 经济光环仍无数值模拟');

    // FormationText 计数词零拆分 + 全站去重计数稳定 + 公开链接唯一性
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

      if (!targetSet.has(civ.civ)) continue;
      for (const r of civ.routes) {
        const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
        expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
        for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);

        const texts = [
          r.title,
          r.condition,
          r.reason,
          r.limitation,
          r.attack,
          r.defense,
          r.alternatives,
          ...(r.required ?? []).map(({ role }) => role),
          ...(r.prerequisites ?? []).flatMap(({ role, condition }) => [role, condition]),
          ...(r.choices ?? []).flatMap(({ title, preconditions, entities }) => [title, ...preconditions, ...entities.map(({ role }) => role)]),
          ...(r.supplements ?? []).flatMap(({ condition, entities }) => [condition, ...entities.map(({ role }) => role)]),
          ...(r.adjustments ?? []).flatMap(({ text, fallback }) => [text, fallback]),
          ...(r.conditionBranches ?? []).flatMap(({ title, context, decision }) => [title, context.text, decision.text]),
          ...(r.evidence.links ?? []).map(({ label }) => label),
        ].filter((v): v is string => Boolean(v));

        for (const txt of texts) {
          const html = renderToStaticMarkup(createElement(FormationText, { text: txt }));
          expect(html, `${civ.civ}/${r.id} counted noun split: ${txt}`).not.toMatch(SPLIT_COUNTED_NOUN);
        }
      }
    }

    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });
});
