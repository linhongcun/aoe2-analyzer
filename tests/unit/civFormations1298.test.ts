import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isPublicSourceUrl } from '../../src/content/schema/policy.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import dataSources from '../../data/sources/data_sources.json';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { contactFight } from '../../src/domain/contactFight';
import { costSum, countForBudget, groupFight } from '../../src/domain/duel';
import { decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { decodeMixedDuel, isMixedDuelLink, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const UPDATED_ROUTES = [
  ['Magyars', 'magyars-huszar-hca'],
  ['Chinese', 'china-fire-lancer-tower'],
  ['Jurchens', 'jurchens-fire-lancer-tower'],
  ['Vietnamese', 'vietnamese-light-cav-rattan'],
  ['Vietnamese', 'vietnamese-defensive-tower'],
  ['Japanese', 'japanese-samurai-light-cavalry'],
  ['Malians', 'malians-light-cavalry-gbeto'],
  ['Poles', 'poles-obuch-winged-hussar'],
  ['Poles', 'poles-arbalest-winged-hussar'],
  ['Incas', 'incas-kamayuk-skirmisher'],
  ['Bulgarians', 'bulgarians-krepost-konnik'],
  ['Franks', 'franks-paladin-skirmisher'],
  ['Franks', 'franks-heavy-mounted-crossbow-light-cav'],
  ['Franks', 'franks-throwing-axeman-light-cav'],
  ['Hindustanis', 'hindustani-handcannon-hussar'],
  ['Turks', 'turks-hussar-handcannon'],
  ['Bohemians', 'bohemians-handcannon-halberdier'],
  ['Malay', 'malay-battle-elephant-progression'],
] as const;

type GroupCase = readonly [civ: string, routeId: string, label: string, winner: 'a' | 'b', alive: number, initial: number];

const GROUP_CASES: readonly GroupCase[] = [
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 精锐马扎尔骠骑 37 名对西班牙游侠 22 名（游侠剩 5/22）', 'b', 5, 22],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 对 50 个法兰克长戟兵（剩 24/30）', 'a', 24, 30],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 对 42 个日本冠军剑士（剩 15/30）', 'a', 15, 30],
  ['Magyars', 'magyars-huszar-hca', '预算 3000 · 30 个重装骑射手 对 42 个不列颠劲弩手（剩 21/30）', 'a', 21, 30],
  ['Chinese', 'china-fire-lancer-tower', '预算 3000 · 33 个精锐火矛兵 对法兰克游侠 22 名（剩 8/33）', 'a', 8, 33],
  ['Chinese', 'china-fire-lancer-tower', '预算 3000 · 40 个精锐诸葛弩 对 42 个日本冠军剑士（剩 24/40）', 'a', 24, 40],
  ['Chinese', 'china-fire-lancer-tower', '预算 3000 · 37 个轻型骑兵 对 42 个不列颠劲弩手（劲弩剩 26/42）', 'b', 26, 42],
  ['Chinese', 'china-fire-lancer-tower', '预算 3000 · 37 个轻型骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Jurchens', 'jurchens-fire-lancer-tower', '预算 3000 · 33 个精锐火矛兵 对法兰克游侠 22 名（剩 12/33）', 'a', 12, 33],
  ['Jurchens', 'jurchens-fire-lancer-tower', '预算 3000 · 37 个翼骑兵 对 42 个不列颠劲弩手（劲弩剩 12/42）', 'b', 12, 42],
  ['Jurchens', 'jurchens-fire-lancer-tower', '预算 3000 · 37 个翼骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Vietnamese', 'vietnamese-light-cav-rattan', '预算 3000 · 37 个轻型骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Vietnamese', 'vietnamese-light-cav-rattan', '预算 3000 · 37 个轻型骑兵 对 42 个不列颠劲弩手（劲弩剩 31/42）', 'b', 31, 42],
  ['Vietnamese', 'vietnamese-light-cav-rattan', '预算 3000 · 31 个精锐藤弓兵 对 42 个不列颠劲弩手（剩 27/31）', 'a', 27, 31],
  ['Vietnamese', 'vietnamese-defensive-tower', '预算 3000 · 37 个轻型骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Vietnamese', 'vietnamese-defensive-tower', '预算 3000 · 50 个帝王掷矛手 对 42 个不列颠劲弩手（剩 46/50）', 'a', 46, 50],
  ['Vietnamese', 'vietnamese-defensive-tower', '预算 3000 · 17 个精锐象兵 对法兰克游侠 22 名（剩 3/17）', 'a', 3, 17],
  ['Japanese', 'japanese-samurai-light-cavalry', '预算 3000 · 40 个精锐日本武士 对西班牙游侠 22 名（剩 1/40）', 'a', 1, 40],
  ['Japanese', 'japanese-samurai-light-cavalry', '预算 3000 · 37 个轻型骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Japanese', 'japanese-samurai-light-cavalry', '预算 3000 · 37 个轻型骑兵 对 42 个不列颠劲弩手（劲弩剩 34/42）', 'b', 34, 42],
  ['Malians', 'malians-light-cavalry-gbeto', '预算 3000 · 37 个轻型骑兵 对 42 个不列颠劲弩手（劲弩剩 21/42）', 'b', 21, 42],
  ['Malians', 'malians-light-cavalry-gbeto', '预算 3000 · 37 个轻型骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Poles', 'poles-obuch-winged-hussar', '预算 3000 · 37 个波兰翼骑兵 对 42 个不列颠劲弩手（劲弩剩 25/42）', 'b', 25, 42],
  ['Poles', 'poles-obuch-winged-hussar', '预算 3000 · 37 个波兰翼骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 37 个波兰翼骑兵 对 42 个不列颠劲弩手（劲弩剩 25/42）', 'b', 25, 42],
  ['Poles', 'poles-arbalest-winged-hussar', '预算 3000 · 37 个波兰翼骑兵 对 6 个条顿手推炮（剩 35/37）', 'a', 35, 37],
  ['Incas', 'incas-kamayuk-skirmisher', '预算 3000 · 精锐印加枪兵长 38 名对西班牙游侠 22 名（剩 26/38）', 'a', 26, 38],
  ['Incas', 'incas-kamayuk-skirmisher', '预算 3000 · 精锐印加枪兵长 38 名对法兰克游侠 22 名（剩 24/38）', 'a', 24, 38],
  ['Incas', 'incas-kamayuk-skirmisher', '预算 3000 · 精锐印加枪兵长 38 名对 42 个日本冠军剑士（剩 10/38）', 'a', 10, 38],
  ['Incas', 'incas-kamayuk-skirmisher', '预算 3000 · 精锐印加枪兵长 38 名对 50 个法兰克长戟兵（剩 32/38）', 'a', 32, 38],
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对西班牙游侠 22 名（骑马阶段游侠剩 2/22）', 'b', 2, 22],
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对 42 个日本冠军剑士（骑马阶段冠军剩 3/42）', 'b', 3, 42],
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对 50 个法兰克长戟兵（骑马阶段长戟剩 9/50）', 'b', 9, 50],
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对 42 个不列颠劲弩手（骑马阶段剩 1/23）', 'a', 1, 23],
  ['Bulgarians', 'bulgarians-krepost-konnik', '预算 3000 · 23 个精锐保加利亚骑兵 对 6 个条顿手推炮（剩 21/23）', 'a', 21, 23],
  ['Franks', 'franks-paladin-skirmisher', '预算 3000 · 法兰克游侠 22 名对 42 个不列颠劲弩手（剩 10/22）', 'a', 10, 22],
  ['Franks', 'franks-paladin-skirmisher', '预算 3000 · 50 个精锐掷矛手 对 42 个不列颠劲弩手（劲弩剩 19/42）', 'b', 19, 42],
  ['Franks', 'franks-heavy-mounted-crossbow-light-cav', '预算 3000 · 37 个重装骑马弩兵 对 42 个不列颠劲弩手（劲弩剩 30/42）', 'b', 30, 42],
  ['Franks', 'franks-heavy-mounted-crossbow-light-cav', '预算 3000 · 37 个重装骑马弩兵 对 50 个法兰克长戟兵（长戟剩 2/50）', 'b', 2, 50],
  ['Franks', 'franks-heavy-mounted-crossbow-light-cav', '预算 3000 · 37 个重装骑马弩兵 对 42 个日本冠军剑士（冠军剩 5/42）', 'b', 5, 42],
  ['Franks', 'franks-throwing-axeman-light-cav', '预算 3000 · 37 个精锐掷斧兵 对 42 个日本冠军剑士（剩 25/37）', 'a', 25, 37],
  ['Franks', 'franks-throwing-axeman-light-cav', '预算 3000 · 37 个精锐掷斧兵 对 50 个法兰克长戟兵（剩 35/37）', 'a', 35, 37],
  ['Hindustanis', 'hindustani-handcannon-hussar', '预算 3000 · 31 个火枪手 对 42 个日本冠军剑士（剩 19/31）', 'a', 19, 31],
  ['Hindustanis', 'hindustani-handcannon-hussar', '预算 3000 · 31 个火枪手 对 42 个不列颠劲弩手（劲弩剩 32/42）', 'b', 32, 42],
  ['Turks', 'turks-hussar-handcannon', '预算 3000 · 31 个火枪手 对 42 个日本冠军剑士（剩 16/31）', 'a', 16, 31],
  ['Turks', 'turks-hussar-handcannon', '预算 3000 · 31 个火枪手 对 42 个不列颠劲弩手（劲弩剩 34/42）', 'b', 34, 42],
  ['Bohemians', 'bohemians-handcannon-halberdier', '预算 3000 · 31 个火枪手 对 42 个日本冠军剑士（剩 10/31）', 'a', 10, 31],
  ['Bohemians', 'bohemians-handcannon-halberdier', '预算 3000 · 31 个火枪手 对 42 个不列颠劲弩手（劲弩剩 36/42）', 'b', 36, 42],
  ['Malay', 'malay-battle-elephant-progression', '预算 3000 · 27 只精锐象兵 对西班牙游侠 22 名（剩 5/27）', 'a', 5, 27],
  ['Malay', 'malay-battle-elephant-progression', '预算 3000 · 27 只精锐象兵 对 50 个法兰克长戟兵（长戟剩 4/50）', 'b', 4, 50],
];

const SPLIT_COUNTED_NOUN =
  /<span class="num nw">\d+\s*(?:个|名|只|座|条|辆)<\/span>(?:火枪手|村民|劲弩手|精锐萨金特卫兵|弩手|精锐掷矛手|手推炮|轻型骑兵|翼骑兵|波兰翼骑兵|精锐火矛兵|精锐诸葛弩|精锐藤弓兵|帝王掷矛手|精锐象兵|精锐日本武士|精锐印加枪兵长|精锐保加利亚骑兵|精锐掷斧兵|重装骑马弩兵|重装骑射手|法兰克长戟兵|日本冠军剑士|不列颠劲弩手|条顿手推炮|高棉重型弩炮|下马步兵|游侠|骠骑)/;

describe('#1298 碰撞接敌 14 文明同步与链接领域回归', () => {
  it('全部 52 条新增 #/duel 群战与混编链接与当前领域引擎实算严格一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    expect(GROUP_CASES).toHaveLength(50);

    for (const [civ, routeId, label, winner, aliveExpected, initialExpected] of GROUP_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      expect([decoded.mode, decoded.bud], label).toEqual(['r', 3000]);
      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;
      const na = countForBudget(sideA.training.price.cost, decoded.bud)!;
      const nb = countForBudget(sideB.training.price.cost, decoded.bud)!;
      const result = groupFight(sideA.F, na, sideB.F, nb);
      expect(result.status, label).toBe('win');
      if (result.status !== 'win') continue;
      expect(result.winner, label).toBe(winner);
      const alive = winner === 'a' ? result.aAlive : result.bAlive;
      const initial = winner === 'a' ? na : nb;
      expect([alive, initial], label).toEqual([aliveExpected, initialExpected]);
    }

    const mixedCases = [
      [
        'Magyars',
        'magyars-huszar-hca',
        '混编 · 骠骑 15 名与 15 个重装骑射手 对 30 个法兰克长戟兵（剩 9/15、15/15）',
        [9, 15],
        'Franks',
        [2700, 1800],
        'magyars-huszar-hca-adjustment-second',
      ],
      [
        'Incas',
        'incas-kamayuk-skirmisher',
        '混编 · 枪兵长 20 名与 20 个精锐掷矛手 对不列颠长戟与劲弩（剩 9/20、20/20）',
        [9, 20],
        'Britons',
        [2620, 2600],
        'incas-kamayuk-skirmisher-adjustment-first',
      ],
    ] as const;

    const mixedTotalCost = (side: ReturnType<typeof resolveMixedSide>, rows: readonly { qty: string }[]) =>
      side.rows.reduce((sum, row, idx) => sum + Number(rows[idx]?.qty ?? 0) * (row.resolved ? costSum(row.resolved.training.price.cost) : 0), 0);

    const currentDataVer = mixedDataVersion(dataSources);
    for (const [civ, routeId, label, expectedAliveA, expectedCivB, expectedCosts, adjId] of mixedCases) {
      const r = route(civ, routeId);
      const link = r.evidence.links?.find((item) => item.label === label);
      expect(link, `${civ} missing mixed link`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      expect(isMixedDuelLink(params), label).toBe(true);
      const dec = decodeMixedDuel(params);
      expect([dec.errors, dec.input.data, dec.input.b.civ], label).toEqual([[], currentDataVer, expectedCivB]);
      const sideA = resolveMixedSide(ctx, core, dec.input.a, 'a');
      const sideB = resolveMixedSide(ctx, core, dec.input.b, 'b');
      expect([sideA.errors, sideB.errors], label).toEqual([[], []]);
      expect([mixedTotalCost(sideA, dec.input.a.rows), mixedTotalCost(sideB, dec.input.b.rows)], `${label} cost`).toEqual([...expectedCosts]);
      expect(r.evidence.scope, `${civ} scope distinguishes fixed-count mix`).toContain('固定兵数混编');
      expect(r.evidence.scope, `${civ} scope marks non-equal resource`).toContain('非等资源预算');
      expect(r.evidence.scope, `${civ} scope keeps budget 3000`).toContain('预算 3000');
      const adjText = r.adjustments?.find((a) => a.id === adjId)?.text ?? '';
      expect(adjText, `${civ} adjustment distinguishes fixed-count mix`).toContain('固定兵数混编');
      expect(adjText, `${civ} adjustment marks non-3000 equal resource`).toContain('非 3000 等资源');
      expect(adjText, `${civ} adjustment keeps budget 3000`).toContain('预算 3000');
      const fight = contactFight(sideA.army!, sideB.army!);
      expect(fight.status, label).toBe('win');
      if (fight.status !== 'win') continue;
      expect(fight.winner, label).toBe('a');
      expect(
        fight.a.rows.map(({ alive }) => alive),
        label,
      ).toEqual([...expectedAliveA]);
    }
  });

  it('波兰 4 条显式科技链接触发列克提克遗产践踏提示，日本武士对应充能特殊机制', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);

    for (const routeId of ['poles-obuch-winged-hussar', 'poles-arbalest-winged-hussar'] as const) {
      const duelLinks = (route('Poles', routeId).evidence.links ?? []).filter(({ href }) => href.includes('#/duel?'));
      expect(duelLinks).toHaveLength(2);
      for (const link of duelLinks) {
        const params = new URLSearchParams(new URL(link.href).hash.split('?')[1] ?? '');
        const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
        expect(isUnavail(sideA)).toBe(false);
        if (isUnavail(sideA)) continue;
        expect(sideA.sel.has(783), link.label).toBe(true);
        const pills = detectUnitUnmodeled({
          unit: sideA.u,
          civ: 'Poles',
          age: 4,
          selectedTechs: [...sideA.sel].map((id) => core.techById[id]!).filter(Boolean),
        }).map(({ pill }) => pill);
        expect(pills, link.label).toContain('践踏 / 溅射伤害 · 列克提克遗产');
      }
    }

    const jpSide = resolve(ctx, core.unitById, parseSide('560.Japanese.4.f.', { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
    expect(isUnavail(jpSide)).toBe(false);
    if (!isUnavail(jpSide)) {
      const pills = detectUnitUnmodeled({
        unit: jpSide.u,
        civ: 'Japanese',
        age: 4,
        selectedTechs: [...jpSide.sel].map((id) => core.techById[id]!).filter(Boolean),
      }).map(({ pill }) => pill);
      expect(pills).toEqual(['充能特殊机制']);
    }
  });

  it('保加利亚下马形态链接指向 #/unit/1255 且全站零 #/unit/1253，去重计数与公开链接唯一性保持不变', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    expect(core.unitById[1253]).toBeUndefined();
    expect([core.unitById[1255]?.form?.id, core.unitById[1227]?.form?.id]).toEqual([1253, 1253]);

    const bulLinks = route('Bulgarians', 'bulgarians-krepost-konnik').evidence.links ?? [];
    expect(bulLinks).toContainEqual({
      label: '营垒精锐保加利亚骑兵（含下马形态资料）',
      href: 'https://linhongcun.github.io/aoe2-analyzer/#/unit/1255?civ=Bulgarians',
    });

    const sharedCounts: Record<string, number> = {};
    for (const civ of civFormationContent) {
      for (const r of civ.routes) {
        const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
        expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
        for (const href of hrefs) {
          expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} public url: ${href}`).toBe(true);
          expect(href, `${civ.civ}/${r.id} forbidden /unit/1253`).not.toContain('/unit/1253');
        }
      }
      const views: FormationView[] = publishedFormations(civ).map((r) => projectFormation(r, civ.civ, DATA_PATCH, { core, trees }, civ.routes, civ.source));
      const deduped = dedupeFormationClauses(views);
      if (deduped.shared.length > 0) sharedCounts[civ.civ] = deduped.shared.length;
    }

    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });

  it('全部 18 条修订路线的正文与链接标签经 FormationText 渲染后无计数词拆分', () => {
    for (const [civ, routeId] of UPDATED_ROUTES) {
      const r = route(civ, routeId);
      expect(r.evidence.recordedVersion, `${civ}/${routeId}`).toContain('碰撞接敌复核：v0.99.15 · DE 188329 · d070ec71');

      const texts = [r.reason, r.limitation, r.alternatives, r.evidence.playtest, r.evidence.scope, ...(r.adjustments ?? []).map(({ text }) => text)].filter(
        (value): value is string => Boolean(value),
      );

      for (const text of texts) {
        for (const sentence of text.split('。')) {
          if (!sentence || /(?:3 个精锐诸葛弩是|4 个精锐藤弓兵无)/.test(sentence)) continue;
          const html = renderToStaticMarkup(createElement(FormationText, { text: sentence }));
          expect(html, `${civ}/${routeId} split noun in text`).not.toMatch(SPLIT_COUNTED_NOUN);
        }
      }

      for (const { label } of r.evidence.links ?? []) {
        const html = renderToStaticMarkup(createElement(FormationText, { text: label }));
        expect(html, `${civ}/${routeId} split noun in label: ${label}`).not.toMatch(SPLIT_COUNTED_NOUN);
      }
    }
  });
});
