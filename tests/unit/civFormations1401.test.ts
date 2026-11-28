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
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { FormationText } from '../../src/features/civs/components/CivFormations';

const DOC_SHA_1401 = '798133a5f20ee5b2b7261895bca3c505495415a6';
const TARGET_CIVS = ['Muisca', 'Spanish', 'Japanese', 'Bulgarians', 'Tupi', 'Jurchens'] as const;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const renderFormationText = (text: string) => renderToStaticMarkup(createElement(FormationText, { text }));

const BOUNDARY_SPLIT_RE =
  /<span class="num nw">[^<]*\d+\s*(?:个|名|只|座|条|辆)<\/span>\s*(?:[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从|厩|场|营|厂))|<span class="num nw">\d+\s*座[\u4e00-\u9fff]*(?:骑兵|火枪手|劲弩手|弩手|长戟兵|诸葛弩|飞刀女兵|冠军剑士|双手剑士|象兵|手推炮|骑射手)<\/span>|<span class="num nw">[+\-−]?\d+(?:\.\d+)?<\/span>\s*(?:远甲|移速|增箭|项|农|厩|厂|营|场)|<span class="num nw">[^<]*\d+\s*人<\/span>\s*口/g;
const UNWRAPPED_RELIC_OR_JIAN = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*(?:圣物|件)/g;
const UNWRAPPED_ZHI = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*只/g;
const BARE_NUM_DUI = /<span class="num nw">[+\-−]?\d+(?:\.\d+)?(?:\s*(?:\/|:|–|—|-|至|\u2192)\s*[+\-−]?\d+(?:\.\d+)?)*<\/span>\s*对/g;

function findFormationViolations(html: string, allowBulgariansLegacy = false): string[] {
  const hits: string[] = [];
  for (const m of html.matchAll(BOUNDARY_SPLIT_RE)) hits.push(m[0]);
  for (const m of html.matchAll(UNWRAPPED_RELIC_OR_JIAN)) hits.push(m[0]);
  for (const m of html.matchAll(UNWRAPPED_ZHI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    if (!(/预算\s*$/.test(before) && /^够/.test(after))) hits.push(m[0]);
  }
  for (const m of html.matchAll(BARE_NUM_DUI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    const allowedLegacy =
      allowBulgariansLegacy &&
      ((/(?:目录值|射程|每击)\s*$/.test(before) && /^\s*<span class="num nw">[+\-−]?\d+(?:\.\d+)?<\/span>/.test(after)) ||
        (/^<span class="num nw">1<\/span>\s*对$/.test(m[0]) && /<span class="num nw">1<\/span>v$/.test(before)));
    const allowed =
      (/预算\s*$/.test(before) && /^\s*<span class="num nw">/.test(after)) || (/圣物数\s*$/.test(before) && /^(?:战果|胜负)/.test(after)) || allowedLegacy;
    if (!allowed) hits.push(m[0]);
  }
  return hits;
}

describe('#1401 第一档批 2 五国策略与阵容契约、状态顺序、投影降级与 FormationText 守卫', () => {
  it('六国重签固定策略提交 且锚点/sourceLines 合规、其余 27 国零引用、六条新路线状态/保加利亚锁首/图皮重排与降级投影全通过', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    expect(civFormationContent).toHaveLength(37);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(76);

    const EXPECTED_ANCHORS: Record<string, readonly [number, number]> = {
      'muisca-temple-guard-slinger': [1368, 1417],
      'muisca-arbalester-temple-champi': [1368, 1417],
      'muisca-arbalester-skirmisher': [1368, 1417],
      'conquistador-hussar': [1478, 1536],
      'paladin-skirmisher': [1478, 1536],
      'handcannon-halberdier': [1478, 1536],
      'spanish-hmc-hussar': [1478, 1536],
      'japanese-samurai-light-cavalry': [1582, 1637],
      'japanese-halberdier-hca-trebuchet': [1582, 1637],
      'bulgarians-krepost-konnik': [1055, 1112],
      'bulgarians-stirrups-cav-hca-siege': [1055, 1112],
      'bulgarians-bagains-ths-siege': [1055, 1112],
      'tupi-blackwood-halberdier': [1419, 1470],
      'tupi-champi-slinger': [1419, 1470],
      'jurchens-steppe-siege-field': [700, 754],
      'jurchens-fire-lancer-tower': [700, 754],
    };

    const targetSet = new Set<string>(TARGET_CIVS);
    let targetRouteCount = 0;
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        expect(civ.source.content, civ.civ).toContain(`/blob/${DOC_SHA_1401}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          targetRouteCount += 1;
          const range = EXPECTED_ANCHORS[r.id];
          expect(range, `missing expected anchor for ${r.id}`).toBeDefined();
          const [startLine, endLine] = range!;
          const expectedUrl = `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA_1401}/role/game-strategy.md#L${startLine}-L${endLine}`;
          if (civ.civ === 'Spanish') {
            expect(r.source, `${civ.civ}/${r.id} inherits civ.source`).toBeUndefined();
            expect(civ.source.content, civ.civ).toBe(expectedUrl);
          } else {
            expect(r.source?.content, `${civ.civ}/${r.id}`).toBe(expectedUrl);
          }
          const lines = r.evidence.sourceLines ?? [];
          expect(lines.length, `${civ.civ}/${r.id} sourceLines`).toBeGreaterThan(0);
          for (let i = 0; i < lines.length; i++) {
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]} in [${startLine}, ${endLine}]`).toBeGreaterThanOrEqual(startLine);
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]} in [${startLine}, ${endLine}]`).toBeLessThanOrEqual(endLine);
            if (i > 0) expect(lines[i], `${civ.civ}/${r.id} ascending`).toBeGreaterThan(lines[i - 1]!);
          }
          const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
          expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
          for (const href of hrefs) {
            expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);
            if (href.includes('tab=garrison')) expect(href, `${civ.civ}/${r.id} no 233`).not.toMatch(/(?:gtechs=|,)233(?:,|&|$)/);
          }
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1401);
        for (const r of civ.routes) expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1401);
      }
    }
    expect(targetRouteCount).toBe(16);

    // 五国路线顺序与 status/playtest 门禁
    expect(byCiv('Muisca').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['muisca-temple-guard-slinger', 'approved', 'unreported'],
      ['muisca-arbalester-temple-champi', 'approved', 'pending'],
      ['muisca-arbalester-skirmisher', 'approved', 'pending'],
    ]);
    expect(byCiv('Spanish').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['conquistador-hussar', 'approved', 'unreported'],
      ['paladin-skirmisher', 'approved', 'unreported'],
      ['handcannon-halberdier', 'approved', 'unreported'],
      ['spanish-hmc-hussar', 'approved', 'pending'],
    ]);
    expect(byCiv('Japanese').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['japanese-samurai-light-cavalry', 'approved', 'unreported'],
      ['japanese-halberdier-hca-trebuchet', 'approved', 'pending'],
    ]);
    expect(byCiv('Bulgarians').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['bulgarians-krepost-konnik', 'approved', 'reported'],
      ['bulgarians-stirrups-cav-hca-siege', 'approved', 'pending'],
      ['bulgarians-bagains-ths-siege', 'approved', 'pending'],
    ]);
    expect(byCiv('Tupi').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['tupi-blackwood-halberdier', 'approved', 'reported'],
      ['tupi-champi-slinger', 'approved', 'unreported'],
    ]);
    expect(byCiv('Jurchens').routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['jurchens-steppe-siege-field', 'approved', 'pending'],
      ['jurchens-fire-lancer-tower', 'approved', 'pending'],
    ]);
    expect(route('Tupi', 'tupi-blackwood-halberdier').evidence.recordedVersion).not.toContain('v0.99.34');
    expect(route('Tupi', 'tupi-blackwood-halberdier').condition).toContain('默认首选主路');
    expect(route('Tupi', 'tupi-blackwood-halberdier').condition).not.toContain('按敌方情况选择的主路之一');
    expect(route('Tupi', 'tupi-champi-slinger').condition).toContain('无城堡产兵窗口');
    expect(route('Tupi', 'tupi-champi-slinger').condition).toContain('重型弩炮、重掷矛与纯步兵');
    expect(route('Tupi', 'tupi-champi-slinger').condition).not.toContain('按敌方情况选择的主路之一');

    // 组合结构与缺失分支/前置投影降级、as-needed 局部隐藏
    const core = await loadCore();
    const trees = await loadTrees();

    const mui = byCiv('Muisca');
    const muiChoiceRoute = route('Muisca', 'muisca-arbalester-temple-champi');
    expect(muiChoiceRoute.composition).toBe('combined');
    expect(muiChoiceRoute.required.map(({ id }) => id)).toEqual([492]);
    expect(muiChoiceRoute.choices?.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[2587], [2554]]);
    expect(projectFormation(muiChoiceRoute, 'Muisca', DATA_PATCH, { core, trees }, mui.routes, mui.source).status).toBe('current');
    for (const missingUid of [2587, 2554] as const) {
      const unitById = { ...core.unitById };
      delete unitById[missingUid];
      expect(
        projectFormation(muiChoiceRoute, 'Muisca', DATA_PATCH, { core: { ...core, unitById }, trees }, mui.routes, mui.source).status,
        `Muisca route 2 missing ${missingUid}`,
      ).toBe('unavailable');
    }
    {
      const unitById = { ...core.unitById };
      delete unitById[588];
      const view = projectFormation(muiChoiceRoute, 'Muisca', DATA_PATCH, { core: { ...core, unitById }, trees }, mui.routes, mui.source);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        expect(view.supplements.flatMap((s) => s.entities.map((e) => e.entity.id))).not.toContain(588);
      }
    }

    const bul = byCiv('Bulgarians');
    const bulStirrups = route('Bulgarians', 'bulgarians-stirrups-cav-hca-siege');
    expect(bulStirrups.composition).toBe('combined');
    expect(bulStirrups.required.map(({ id }) => id)).toEqual([474]);
    expect(bulStirrups.choices?.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[441], [283]]);
    expect(projectFormation(bulStirrups, 'Bulgarians', DATA_PATCH, { core, trees }, bul.routes, bul.source).status).toBe('current');
    for (const missingUid of [441, 283] as const) {
      const unitById = { ...core.unitById };
      delete unitById[missingUid];
      expect(
        projectFormation(bulStirrups, 'Bulgarians', DATA_PATCH, { core: { ...core, unitById }, trees }, bul.routes, bul.source).status,
        `Bulgarians route 2 missing ${missingUid}`,
      ).toBe('unavailable');
    }
    {
      const unitById = { ...core.unitById };
      delete unitById[548];
      const view = projectFormation(bulStirrups, 'Bulgarians', DATA_PATCH, { core: { ...core, unitById }, trees }, bul.routes, bul.source);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        expect(view.supplements.flatMap((s) => s.entities.map((e) => e.entity.id))).not.toContain(548);
      }
    }

    const bulBagains = route('Bulgarians', 'bulgarians-bagains-ths-siege');
    expect(bulBagains.prerequisites.map(({ id }) => id)).toEqual([686]);
    expect(projectFormation(bulBagains, 'Bulgarians', DATA_PATCH, { core, trees }, bul.routes, bul.source).status).toBe('current');
    {
      const techById = { ...core.techById };
      delete techById[686];
      expect(projectFormation(bulBagains, 'Bulgarians', DATA_PATCH, { core: { ...core, techById }, trees }, bul.routes, bul.source).status).toBe('unavailable');
    }

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

  it('双边 FormationText 守卫自测通过，且六国全部 16 条路线文本与链接标签零拆词', () => {
    const mustReject = [
      '0/2/4 圣物',
      '2 件',
      '35 只',
      '4 座马厩',
      '4 座轻型骑兵',
      '1 座攻城武器厂',
      '（61 名村民）',
      '156 农',
      '6 远甲',
      '1.104 移速',
      '11 项',
      '预算 3000 对法兰克游侠',
      '35 对',
      '目录值 4800 对上述城堡',
      '射程 8 对长戟兵',
      '每击 13 对单位',
      '1v35 对黑檀木',
    ];
    for (const bad of mustReject) {
      expect(findFormationViolations(renderFormationText(bad), true).length, `expected reject: ${bad}`).toBeGreaterThan(0);
    }
    const mustAllow = [
      '持续生产 · 精锐神庙护卫（兵营 3 座）＋投石手（靶场 4 座）· 89 名村民（含征招）',
      '施工工期 · 8 名村民 建城堡 46.2 秒',
      '远甲为 6 的翼骑，负远甲为 7 的土耳其翼骑',
      '满科技驻军 · 营垒 19 名重装骑射手 21/21 箭',
    ];
    for (const ok of mustAllow) {
      expect(findFormationViolations(renderFormationText(ok)), `expected allow: ${ok}`).toEqual([]);
    }
    const bulgariansLegacyAllow = ['目录值 4800 对 2600', '射程 8 对 7', '每击 13 对 13', '接触 1v1 对西班牙、匈奴游侠'];
    for (const legacy of bulgariansLegacyAllow) {
      expect(findFormationViolations(renderFormationText(legacy), false).length, `expected reject outside Bulgarians legacy: ${legacy}`).toBeGreaterThan(0);
      expect(findFormationViolations(renderFormationText(legacy), true), `expected allow in Bulgarians legacy: ${legacy}`).toEqual([]);
    }

    let checkedRoutes = 0;
    for (const civName of TARGET_CIVS) {
      for (const r of byCiv(civName).routes) {
        checkedRoutes += 1;
        const allowBulgariansLegacy = civName === 'Bulgarians' && r.id === 'bulgarians-krepost-konnik';
        const texts = [
          r.title,
          r.condition,
          r.reason,
          r.limitation,
          r.attack,
          r.defense,
          r.alternatives,
          r.evidence.scope,
          r.evidence.recognition,
          r.evidence.playtest,
          r.evidence.recordedVersion,
          r.source?.boundary,
          ...r.required.flatMap(({ role, research }) => [role, research?.effect, research?.caveat]),
          ...(r.choices ?? []).flatMap(({ title, preconditions, entities }) => [title, ...preconditions, ...entities.map(({ role }) => role)]),
          ...(r.prerequisites ?? []).flatMap(({ role, condition }) => [role, condition]),
          ...(r.supplements ?? []).flatMap(({ condition, entities }) => [condition, ...entities.map(({ role }) => role)]),
          ...(r.adjustments ?? []).flatMap(({ when, text, fallback, decision }) => [
            when,
            text,
            fallback,
            decision?.condition,
            decision?.also,
            decision?.exception,
          ]),
          ...(r.evidence.links ?? []).map(({ label }) => label),
        ].filter((v): v is string => Boolean(v));

        for (const text of texts) {
          expect(findFormationViolations(renderFormationText(text), allowBulgariansLegacy), `${civName}/${r.id} violation in: ${text}`).toEqual([]);
        }
      }
    }
    expect(checkedRoutes).toBe(16);
  });
});
