import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { isPublicSourceUrl } from '../../src/content/schema/policy.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { ARMY_RES, evaluateArmyCost } from '../../src/domain/armyCost';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { calculateGeneralGarrison, type GarrisonEntry } from '../../src/domain/garrisonGeneral';
import { calculateProduction, decodeProduction } from '../../src/domain/production';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';

const DOC_SHA_1400 = '372fbdd43c4902b9d03ef1dc69dcf203cb2f8e6e';
const TARGET_CIVS = ['Byzantines', 'Goths', 'Teutons', 'Lithuanians', 'Poles'] as const;
type TargetCiv = (typeof TARGET_CIVS)[number];

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const GARRISON_CASES: readonly (readonly [TargetCiv, string, string, number, readonly number[], number, number])[] = [
  ['Teutons', 'teutons-elite-knight-skirmisher', '满科技驻军 · 开垛口城堡 20 名精锐条顿骑士 12/21 箭', 82, [11, 47, 199, 200], 12, 21],
  ['Teutons', 'teutons-halberdier-handcannon', '满科技驻军 · 开垛口城堡 20 名火枪手 19/21 箭', 82, [11, 47, 199, 200], 19, 21],
  ['Teutons', 'teutons-halberdier-handcannon', '满科技驻军 · 大型箭塔无射箭槽 10 名火枪手 9/9 箭', 235, [11, 47, 199, 200], 9, 9],
  ['Teutons', 'teutons-halberdier-handcannon', '满科技驻军 · 大型箭塔含射箭槽 10 名火枪手 8/9 箭', 235, [11, 47, 199, 200, 608], 8, 9],
  ['Teutons', 'teutons-halberdier-handcannon', '满科技驻军 · 大型箭塔无射箭槽 10 名村民 8/9 箭', 235, [11, 47, 199, 200], 8, 9],
  ['Teutons', 'teutons-halberdier-handcannon', '满科技驻军 · 大型箭塔含射箭槽 10 名村民 6/9 箭', 235, [11, 47, 199, 200, 608], 6, 9],
  ['Teutons', 'teutons-paladin-skirmisher', '满科技驻军 · 城镇中心不含炮塔 15 名村民 15/15 箭', 109, [11, 47, 199, 200], 15, 15],
  ['Teutons', 'teutons-paladin-skirmisher', '满科技驻军 · 城镇中心含炮塔 15 名村民 14/15 箭', 109, [11, 47, 64, 199, 200], 14, 15],
  ['Teutons', 'teutons-paladin-skirmisher', '满科技驻军 · 城镇中心含炮塔 16 名村民 15/15 箭', 109, [11, 47, 64, 199, 200], 15, 15],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '满科技驻军 · 山城堡城镇中心不含炮塔 10 名村民 10/10 箭', 109, [47, 199, 200, 201, 437], 10, 10],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '满科技驻军 · 山城堡城镇中心含炮塔 10 名村民 9/10 箭', 109, [47, 64, 199, 200, 201, 437], 9, 10],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '满科技驻军 · 山城堡城镇中心含炮塔 11 名村民 10/10 箭', 109, [47, 64, 199, 200, 201, 437], 10, 10],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '满科技驻军 · 山城堡城镇中心含炮塔 15 名精锐掷矛手 7/10 箭', 109, [47, 64, 199, 200, 201, 437], 7, 10],
];

const PRODUCTION_CASES: readonly (readonly [TargetCiv, string, string, number, boolean])[] = [
  ['Goths', 'goths-huskarl-halberdier', '持续生产 · 精锐近卫军（兵营 3 座）＋长戟兵（兵营 3 座）＋手推炮（攻城武器厂 1 座）· 156 名村民', 156, true],
  ['Goths', 'goths-huskarl-halberdier', '持续生产 · 精锐近卫军（兵营 3 座）＋长戟兵（兵营 3 座）· 138 名村民', 138, true],
  ['Teutons', 'teutons-paladin-skirmisher', '持续生产 · 游侠（马厩 3 座）＋精锐掷矛手（靶场 3 座）· 65 名村民', 65, true],
  ['Teutons', 'teutons-halberdier-handcannon', '持续生产 · 长戟兵（兵营 4 座）＋火枪手（靶场 4 座）· 64 名村民', 64, true],
  ['Teutons', 'teutons-elite-knight-skirmisher', '持续生产 · 精锐条顿骑士（城堡 2 座）＋精锐掷矛手（靶场 3 座）· 78 名村民', 78, true],
  ['Byzantines', 'byzantines-cataphract', '持续生产 · 精锐甲胄骑兵（城堡 2 座）＋长戟兵（兵营 3 座）＋精锐掷矛手（靶场 3 座）· 75 名村民', 75, true],
  ['Byzantines', 'byzantines-cataphract', '持续生产 · 纯垃圾双线 长戟兵（兵营 4 座）＋精锐掷矛手（靶场 4 座）· 44 名村民', 44, true],
  ['Byzantines', 'byzantines-cataphract', '持续生产 · 重装骆驼兵（马厩 3 座）＋精锐掷矛手（靶场 3 座）· 51 名村民', 51, true],
  ['Byzantines', 'byzantines-halberdier-handcannon-arbalest', '持续生产 · 零城堡 长戟兵（兵营 4 座）＋火枪手（靶场 4 座）· 41 名村民（无征招）', 41, false],
  ['Byzantines', 'byzantines-halberdier-handcannon-arbalest', '持续生产 · 零城堡 长戟兵（兵营 4 座）＋劲弩手（靶场 4 座）· 40 名村民（无征招）', 40, false],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '持续生产 · 精锐烈堤司（城堡 2 座）＋精锐掷矛手（靶场 3 座）· 63 名村民', 63, true],
  ['Lithuanians', 'lithuanians-leitis-skirmisher', '持续生产 · 立陶宛游侠（马厩 3 座）· 43 名村民，其中采金村民 27 名', 43, true],
  ['Lithuanians', 'lithuanians-winged-hussar-handcannon', '持续生产 · 零城堡 波兰翼骑兵（马厩 3 座）＋火枪手（靶场 3 座）· 36 名村民（无征招）', 36, false],
  ['Lithuanians', 'lithuanians-winged-hussar-handcannon', '持续生产 · 波兰翼骑兵（马厩 3 座）＋火枪手（靶场 3 座）· 48 名村民（含征招）', 48, true],
  ['Poles', 'poles-obuch-winged-hussar', '持续生产 · 精锐奥布奇战锤兵（城堡 2 座）＋波兰翼骑兵（马厩 4 座）· 65 名村民', 65, true],
  ['Poles', 'poles-arbalest-winged-hussar', '持续生产 · 波兰翼骑兵（马厩 4 座）＋劲弩手（靶场 4 座）· 64 名村民', 64, true],
  ['Poles', 'poles-arbalest-winged-hussar', '持续生产 · 波兰翼骑兵（马厩 4 座）＋重装骑马弩兵（靶场 4 座）· 75 名村民', 75, true],
  ['Poles', 'poles-discount-knights', '持续生产 · 贵族特权重装骑士（马厩 5 座）· 45 名村民', 45, true],
];

const ARMY_COST_CASES: readonly (readonly [TargetCiv, string, string, { Food: number; Wood: number; Gold: number; Stone: number }, number, boolean])[] = [
  ['Goths', 'goths-huskarl-halberdier', '研究账本 · 精锐近卫军＋长戟兵（不含抗招降，合计 5090）', { Food: 3155, Wood: 0, Gold: 1935, Stone: 0 }, 5090, false],
  [
    'Goths',
    'goths-huskarl-halberdier',
    '研究账本 · 精锐近卫军＋长戟兵＋手推炮（不含抗招降，合计 5590）',
    { Food: 3455, Wood: 0, Gold: 2135, Stone: 0 },
    5590,
    false,
  ],
  [
    'Teutons',
    'teutons-paladin-skirmisher',
    '研究账本 · 游侠＋精锐掷矛手（不含抗招降，合计 7675）',
    { Food: 4245, Wood: 530, Gold: 2900, Stone: 0 },
    7675,
    true,
  ],
  ['Teutons', 'teutons-halberdier-handcannon', '研究账本 · 长戟兵＋火枪手（不含抗招降，合计 4590）', { Food: 2680, Wood: 0, Gold: 1910, Stone: 0 }, 4590, true],
  [
    'Teutons',
    'teutons-elite-knight-skirmisher',
    '研究账本 · 精锐条顿骑士＋精锐掷矛手（不含抗招降，合计 6175）',
    { Food: 3470, Wood: 530, Gold: 2175, Stone: 0 },
    6175,
    true,
  ],
  [
    'Byzantines',
    'byzantines-cataphract',
    '研究账本 · 精锐甲胄骑兵＋长戟兵＋精锐掷矛手（不含抗招降，合计 11075）',
    { Food: 6205, Wood: 780, Gold: 4090, Stone: 0 },
    11075,
    true,
  ],
  [
    'Byzantines',
    'byzantines-cataphract',
    '研究账本 · 重装骆驼兵＋精锐掷矛手（不含抗招降，合计 6160）',
    { Food: 3295, Wood: 780, Gold: 2085, Stone: 0 },
    6160,
    true,
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '研究账本 · 长戟兵＋火枪手（不含抗招降，合计 4090）',
    { Food: 2405, Wood: 0, Gold: 1685, Stone: 0 },
    4090,
    true,
  ],
  [
    'Byzantines',
    'byzantines-halberdier-handcannon-arbalest',
    '研究账本 · 长戟兵＋劲弩手（不含抗招降，合计 7140）',
    { Food: 3930, Wood: 550, Gold: 2660, Stone: 0 },
    7140,
    true,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '研究账本 · 精锐烈堤司＋精锐掷矛手（不含抗招降，合计 7925）',
    { Food: 4370, Wood: 780, Gold: 2775, Stone: 0 },
    7925,
    true,
  ],
  [
    'Lithuanians',
    'lithuanians-leitis-skirmisher',
    '研究账本 · 立陶宛游侠＋精锐掷矛手（不含抗招降，合计 9075）',
    { Food: 5220, Wood: 780, Gold: 3075, Stone: 0 },
    9075,
    true,
  ],
  [
    'Lithuanians',
    'lithuanians-winged-hussar-handcannon',
    '研究账本 · 波兰翼骑兵＋火枪手（不含抗招降，合计 4990）',
    { Food: 2970, Wood: 0, Gold: 2020, Stone: 0 },
    4990,
    true,
  ],
  [
    'Poles',
    'poles-obuch-winged-hussar',
    '研究账本 · 精锐奥布奇战锤兵＋波兰翼骑兵（不含抗招降，合计 6840）',
    { Food: 3970, Wood: 0, Gold: 2870, Stone: 0 },
    6840,
    false,
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '研究账本 · 劲弩手＋波兰翼骑兵（不含抗招降，合计 8340）',
    { Food: 4470, Wood: 550, Gold: 3320, Stone: 0 },
    8340,
    false,
  ],
  [
    'Poles',
    'poles-arbalest-winged-hussar',
    '研究账本 · 重装骑马弩兵＋波兰翼骑兵（不含抗招降，合计 8915）',
    { Food: 4845, Wood: 550, Gold: 3520, Stone: 0 },
    8915,
    false,
  ],
  ['Poles', 'poles-discount-knights', '研究账本 · 贵族特权重装骑士单线（不含抗招降，合计 3265）', { Food: 2070, Wood: 0, Gold: 1195, Stone: 0 }, 3265, false],
];

const renderFormationText = (text: string) => renderToStaticMarkup(createElement(FormationText, { text }));

const BOUNDARY_SPLIT_RE =
  /<span class="num nw">[^<]*\d+\s*(?:个|名|只|座|条|辆)<\/span>\s*(?:[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从|厩|场|营|厂))|<span class="num nw">\d+\s*座[\u4e00-\u9fff]*(?:骑兵|火枪手|劲弩手|弩手|长戟兵|诸葛弩|飞刀女兵|冠军剑士|双手剑士|象兵|手推炮|骑射手)<\/span>|<span class="num nw">[+\-−]?\d+(?:\.\d+)?<\/span>\s*(?:远甲|移速|增箭|项|农|厩|厂|营|场)|<span class="num nw">[^<]*\d+\s*人<\/span>\s*口/g;
const UNWRAPPED_RELIC_OR_JIAN = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*(?:圣物|件)/g;
const UNWRAPPED_ZHI = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*只/g;
const BARE_NUM_DUI = /<span class="num nw">[+\-−]?\d+(?:\.\d+)?(?:\s*(?:\/|:|–|—|-|至|\u2192)\s*[+\-−]?\d+(?:\.\d+)?)*<\/span>\s*对/g;

function findFormationViolations(html: string): string[] {
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
    const allowed = (/预算\s*$/.test(before) && /^\s*<span class="num nw">/.test(after)) || (/圣物数\s*$/.test(before) && /^(?:战果|胜负)/.test(after));
    if (!allowed) hits.push(m[0]);
  }
  return hits;
}

describe('#1400 第一档批 1 五国策略与阵容升级：驻军/生产/研究账本、双平行路线、契约重签与 FormationText 守卫', () => {
  it('全部 13 条满科技驻军、18 条持续生产（含零城堡无征招）与 16 条研究账本链接及按文明抗招降口径复算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    expect(core.techById[315]?.b).toBe(82);

    expect(GARRISON_CASES).toHaveLength(13);
    for (const [civ, routeId, label, bid, expectedTechs, totalProj, maxProj] of GARRISON_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe(`#/building/${bid}`);
      const params = new URLSearchParams(query);
      expect([params.get('tab'), params.get('gv'), params.get('civ'), params.get('age')], label).toEqual(['garrison', '2', civ, '4']);
      const techs = (params.get('gtechs') ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);
      expect(techs, label).not.toContain(233);
      expect(techs, label).toEqual([...expectedTechs].sort((a, b) => a - b));
      const rows = (params.get('army') ?? '')
        .split(',')
        .filter(Boolean)
        .map((part) => {
          const [u, c, mode] = part.split(':');
          const entry: GarrisonEntry = mode === 'd' ? 'deposit' : mode === 'c' ? 'created' : 'enter';
          return { unitId: Number(u), count: c!, entry };
        });
      const res = calculateGeneralGarrison({ core, trees }, core.buildingById[bid]!, { civ, age: 4, techs, rows });
      expect(res.errors, label).toEqual([]);
      expect([res.totalProjectiles, res.maxProjectiles], label).toEqual([totalProj, maxProj]);
    }

    expect(PRODUCTION_CASES).toHaveLength(18);
    for (const [civ, routeId, label, expectedVils, expect315] of PRODUCTION_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeProduction(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.config.civ, label).toBe(civ);
      expect(decoded.config.techs.includes(315), `${label} Conscription 315`).toBe(expect315);
      const res = calculateProduction({ core, trees }, decoded.config);
      expect(res.errors, label).toEqual([]);
      expect(res.total, label).toBe(expectedVils);
    }

    expect(ARMY_COST_CASES).toHaveLength(16);
    for (const [civ, routeId, label, expectedCost, expectedSum, hasHeresy] of ARMY_COST_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeArmyCost(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.dataChanged, label).toBe(false);
      expect(decoded.config, label).not.toBeNull();
      expect(decoded.config!.civ, label).toBe(civ);
      for (const excluded of ['t:45', 't:46', 't:439', 't:101', 't:102', 't:103']) {
        expect(decoded.config!.targets, `${label} must exclude ${excluded}`).not.toContain(excluded);
      }
      const evaluated = evaluateArmyCost({ core, trees }, decoded.config!);
      expect(evaluated.blocked, label).toEqual([]);
      expect(evaluated.partial, label).toBe(false);
      const actualCost = {
        Food: evaluated.researchTotal.Food ?? 0,
        Wood: evaluated.researchTotal.Wood ?? 0,
        Gold: evaluated.researchTotal.Gold ?? 0,
        Stone: evaluated.researchTotal.Stone ?? 0,
      };
      expect(actualCost, label).toEqual(expectedCost);
      const actualSum = ARMY_RES.reduce((sum, res) => sum + (evaluated.researchTotal[res] ?? 0), 0);
      expect(actualSum, label).toBe(expectedSum);

      // 按文明复算抗招降差额：条顿/拜占庭/立陶宛 +46/439/45=+2600；哥特/波兰 +46/45=+1600 且强加 439 触发 partial=true
      const legalAnti = hasHeresy ? ['t:46', 't:439', 't:45'] : ['t:46', 't:45'];
      const withAnti = evaluateArmyCost({ core, trees }, { ...decoded.config!, targets: [...decoded.config!.targets, ...legalAnti] });
      expect([withAnti.blocked, withAnti.partial], `${label} with anti-conversion`).toEqual([[], false]);
      const antiSum = ARMY_RES.reduce((sum, res) => sum + (withAnti.researchTotal[res] ?? 0), 0);
      expect(antiSum - actualSum, `${label} anti-conversion delta`).toBe(hasHeresy ? 2600 : 1600);
      if (!hasHeresy) {
        const forcedHeresy = evaluateArmyCost({ core, trees }, { ...decoded.config!, targets: [...decoded.config!.targets, 't:46', 't:439', 't:45'] });
        expect(forcedHeresy.partial, `${label} forced t:439 must mark partial`).toBe(true);
      }
    }
  });

  it('仅五国重签 DOC_SHA_1400 且 sourceLines 落入锚点范围、其余 28 国不引用本次提交、双平行路线投影降级与契约/去重不变量全部通过', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    expect(civFormationContent).toHaveLength(37);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(76);

    const EXPECTED_ANCHORS: Record<string, readonly [number, number]> = {
      'byzantines-cataphract': [400, 440],
      'byzantines-halberdier-handcannon-arbalest': [417, 438],
      'goths-huskarl-halberdier': [580, 615],
      'teutons-paladin-skirmisher': [819, 867],
      'teutons-halberdier-handcannon': [819, 867],
      'teutons-elite-knight-skirmisher': [819, 867],
      'lithuanians-leitis-skirmisher': [964, 1011],
      'lithuanians-winged-hussar-handcannon': [981, 1011],
      'poles-obuch-winged-hussar': [1013, 1051],
      'poles-arbalest-winged-hussar': [1013, 1051],
      'poles-discount-knights': [1013, 1051],
    };

    const targetSet = new Set<string>(TARGET_CIVS);
    let targetRouteCount = 0;
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        expect(civ.source.content, civ.civ).toContain(`/blob/${DOC_SHA_1400}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          targetRouteCount += 1;
          const range = EXPECTED_ANCHORS[r.id];
          expect(range, `missing expected anchor for ${r.id}`).toBeDefined();
          const [startLine, endLine] = range!;
          expect(r.source?.content, `${civ.civ}/${r.id}`).toBe(
            `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA_1400}/role/game-strategy.md#L${startLine}-L${endLine}`,
          );
          const lines = r.evidence.sourceLines ?? [];
          expect(lines.length, `${civ.civ}/${r.id} sourceLines`).toBeGreaterThan(0);
          for (let i = 0; i < lines.length; i++) {
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]} in [${startLine}, ${endLine}]`).toBeGreaterThanOrEqual(startLine);
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]} in [${startLine}, ${endLine}]`).toBeLessThanOrEqual(endLine);
            if (i > 0) expect(lines[i], `${civ.civ}/${r.id} ascending`).toBeGreaterThan(lines[i - 1]!);
          }
          expect(r.playtest, `${civ.civ}/${r.id}`).not.toBe('reported');
          const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
          expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
          for (const href of hrefs) {
            expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);
            if (href.includes('tab=garrison')) expect(href, `${civ.civ}/${r.id} no 233`).not.toMatch(/(?:gtechs=|,)233(?:,|&|$)/);
          }
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1400);
        for (const r of civ.routes) expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1400);
      }
    }
    expect(targetRouteCount).toBe(11);

    // 复核口径收口：条顿 TC 含炮塔 15 名村民 14/15 箭已写进文案、精锐条顿骑士零损结论限定到不列颠劲弩手、波兰不写「半价血统」
    const teutPaladin = route('Teutons', 'teutons-paladin-skirmisher');
    expect(teutPaladin.evidence.scope).toContain('含炮塔 15 名村民 射 14/15 箭');
    expect(teutPaladin.adjustments?.find((a) => a.id === 'teutons-paladin-skirmisher-adjustment-remote-kite')?.text).toContain('含炮塔 15 名村民 射 14/15 箭');
    const teutTkRemote = route('Teutons', 'teutons-elite-knight-skirmisher').adjustments?.find(
      (a) => a.id === 'teutons-elite-knight-skirmisher-adjustment-remote-kite',
    )?.text;
    expect(teutTkRemote).toContain('不列颠劲弩手');
    expect(teutTkRemote).not.toMatch(/任何远程拉扯|拉扯弓手/);
    expect(JSON.stringify(byCiv('Poles'))).not.toContain('半价血统');
    expect(JSON.stringify(byCiv('Byzantines'))).not.toMatch(/全拜占庭最省|最省研费|26\.25|18\.75/);
    const byzCataphractLimit = route('Byzantines', 'byzantines-cataphract').limitation;
    expect(byzCataphractLimit).toContain('早期贴脸复核不含射程、走位或践踏');
    expect(byzCataphractLimit).toContain('现行一维接敌模型计入射程、开启拉扯时模拟一维后撤（本批混编复核未开启拉扯）');
    expect(byzCataphractLimit).not.toContain('既有接触模型');
    expect(route('Goths', 'goths-huskarl-halberdier').adjustments?.find((a) => a.id === 'goths-huskarl-halberdier-adjustment-narrow-mix')?.text).toContain(
      '仅作待实战验证的应对选项',
    );

    // 拜占庭与立陶宛双平行路线顺序、状态、结构与缺失分支投影降级
    const byz = byCiv('Byzantines');
    expect(byz.routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['byzantines-cataphract', 'approved', 'unreported'],
      ['byzantines-halberdier-handcannon-arbalest', 'approved', 'pending'],
    ]);
    const byzZero = route('Byzantines', 'byzantines-halberdier-handcannon-arbalest');
    expect(byzZero.composition).toBe('combined');
    expect(byzZero.required.map(({ id }) => id)).toEqual([359]);
    expect(byzZero.choices?.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[5], [492]]);

    const lith = byCiv('Lithuanians');
    expect(lith.routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['lithuanians-leitis-skirmisher', 'approved', 'unreported'],
      ['lithuanians-winged-hussar-handcannon', 'approved', 'pending'],
    ]);
    const lithLowGold = route('Lithuanians', 'lithuanians-winged-hussar-handcannon');
    expect(lithLowGold.required.map(({ id }) => id)).toEqual([1707, 5]);
    expect(lithLowGold.adjustments?.every((a) => !a.decision)).toBe(true);
    expect(
      byCiv('Teutons')
        .routes.flatMap((r) => r.adjustments ?? [])
        .every((a) => !a.decision),
    ).toBe(true);

    const core = await loadCore();
    const trees = await loadTrees();

    // 拜占庭平行路线双分支齐全为 current；缺 5 或缺 492 均投影为 unavailable
    expect(projectFormation(byzZero, 'Byzantines', DATA_PATCH, { core, trees }, byz.routes, byz.source).status).toBe('current');
    for (const missingUid of [5, 492] as const) {
      const unitById = { ...core.unitById };
      delete unitById[missingUid];
      expect(
        projectFormation(byzZero, 'Byzantines', DATA_PATCH, { core: { ...core, unitById }, trees }, byz.routes, byz.source).status,
        `Byzantines route 2 missing ${missingUid}`,
      ).toBe('unavailable');
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

  it('合并双边 FormationText 守卫自测通过，且五国全部 11 条路线所有文本与链接标签零拆词', () => {
    const mustReject = [
      '0/2/4 圣物',
      '2 件',
      '35 只',
      '4 座马厩',
      '1 座攻城武器厂',
      '（65 名村民）',
      '156 农',
      '10 远甲',
      '1.21 移速',
      '22 项',
      '预算 3000 对法兰克游侠',
    ];
    for (const bad of mustReject) {
      expect(findFormationViolations(renderFormationText(bad)).length, `expected reject: ${bad}`).toBeGreaterThan(0);
    }
    const mustAllow = [
      '圣物数 0/2/4 群战复核',
      '持续生产 · 精锐近卫军（兵营 3 座）＋长戟兵（兵营 3 座）＋手推炮（攻城武器厂 1 座）· 156 名村民',
      '塔盾精锐掷矛手远甲为 10 且移速为 1.06 双全游第一',
      '满科技驻军 · 城镇中心含炮塔 16 名村民 15/15 箭',
    ];
    for (const ok of mustAllow) {
      expect(findFormationViolations(renderFormationText(ok)), `expected allow: ${ok}`).toEqual([]);
    }

    let checkedRoutes = 0;
    for (const civName of TARGET_CIVS) {
      for (const r of byCiv(civName).routes) {
        checkedRoutes += 1;
        const texts = [
          r.title,
          r.condition,
          r.reason,
          r.limitation,
          r.attack,
          r.defense,
          r.alternatives,
          r.evidence.scope,
          r.evidence.playtest,
          r.evidence.recordedVersion,
          r.source?.boundary,
          ...r.required.flatMap(({ role, research }) => [role, research?.effect, research?.caveat]),
          ...(r.choices ?? []).flatMap(({ title, preconditions, entities }) => [title, ...preconditions, ...entities.map(({ role }) => role)]),
          ...(r.prerequisites ?? []).map(({ condition }) => condition),
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
          expect(findFormationViolations(renderFormationText(text)), `${civName}/${r.id} violation in: ${text}`).toEqual([]);
        }
      }
    }
    expect(checkedRoutes).toBe(11);
  });
});
