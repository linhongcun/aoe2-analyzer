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
import { unitCost } from '../../src/domain/unitCost';
import { FormationText } from '../../src/features/civs/components/CivFormations';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';

const DOC_SHA_1406 = '54f7f61d762a5ec6bf665431c28f549df43681f9';
const TARGET_CIVS = ['Chinese', 'Hindustanis', 'Persians', 'Turks', 'Malians', 'Malay'] as const;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

type TargetCiv = (typeof TARGET_CIVS)[number];

const GARRISON_CASES: readonly (readonly [TargetCiv, string, string, number, readonly number[], number, number])[] = [
  ['Chinese', 'china-chu-ko-nu', '满科技驻军 · 城堡 14 名精锐诸葛弩 21/21 箭', 82, [47, 199, 200, 201, 437], 21, 21],
  ['Hindustanis', 'hindustani-handcannon-hussar', '满科技驻军 · 城堡 20 名火枪手 18/21 箭', 82, [47, 199, 200, 201, 437], 18, 21],
  ['Persians', 'persian-savar-crossbow-bombard', '满科技驻军 · 堡垒城堡 20 名弩手 15/21 箭', 82, [7, 47, 199, 200, 437], 15, 21],
  ['Persians', 'persian-savar-crossbow-bombard', '满科技驻军 · 堡垒城堡 20 名火枪手 15/21 箭', 82, [7, 47, 199, 200, 437], 15, 21],
  ['Turks', 'turks-hussar-handcannon', '满科技驻军 · 含射箭槽大型箭塔 5 名火枪手 4/5 箭', 235, [199, 200, 201, 437, 608], 4, 5],
  ['Turks', 'turks-existing-line-choice', '满科技驻军 · 城堡 19 名精锐苏丹亲兵 21/21 箭', 82, [199, 200, 201, 437], 21, 21],
  ['Turks', 'turks-existing-line-choice', '满科技驻军 · 含射箭槽大型箭塔 5 名精锐苏丹亲兵 5/5 箭', 235, [199, 200, 201, 437, 608], 5, 5],
  ['Malians', 'malians-light-cavalry-gbeto', '满科技驻军 · 蛮王城镇中心 10 名村民 18/18 箭', 109, [47, 199, 200, 437, 576], 18, 18],
  ['Malians', 'malians-light-cavalry-gbeto', '满科技驻军 · 蛮王城镇中心 15 名精锐飞刀女兵 8/18 箭', 109, [47, 199, 200, 437, 576], 8, 18],
  ['Malay', 'malay-battle-elephant-progression', '满科技驻军 · 巨港 10 条渔船 14/14 箭', 1189, [47, 199, 200, 201], 14, 14],
];

const PRODUCTION_CASES: readonly (readonly [TargetCiv, string, string, number])[] = [
  ['Chinese', 'china-chu-ko-nu', '持续生产 · 轻型骑兵（马厩 4 座）＋精锐诸葛弩（城堡 2 座）· 62 名村民', 62],
  ['Chinese', 'china-arbalest-zero-castle', '持续生产 · 轻型骑兵（马厩 4 座）＋劲弩手（靶场 4 座）· 46 名村民（无征招）', 46],
  ['Chinese', 'china-arbalest-zero-castle', '持续生产 · 长戟兵（兵营 4 座）＋劲弩手（靶场 4 座）· 46 名村民（无征招）', 46],
  ['Hindustanis', 'hindustani-handcannon-hussar', '持续生产 · 翼骑兵（马厩 4 座）＋火枪手（靶场 4 座）· 62 名村民', 62],
  ['Hindustanis', 'hindustani-handcannon-hussar', '持续生产 · 加手推炮（攻城武器厂 1 座）· 79 名村民', 79],
  ['Persians', 'persian-savar-crossbow-bombard', '持续生产 · 萨瓦尔（马厩 4 座）＋免金弩手（靶场 4 座）· 73 名村民', 73],
  ['Persians', 'persian-savar-crossbow-bombard', '持续生产 · 加手推炮（攻城武器厂 1 座）· 90 名村民', 90],
  ['Persians', 'persian-savar-crossbow-bombard', '持续生产 · 萨瓦尔（马厩 4 座）＋火枪手（靶场 4 座）· 85 名村民', 85],
  ['Turks', 'turks-hussar-handcannon', '持续生产 · 翼骑兵（马厩 4 座）＋火枪手（靶场 3 座）· 57 名村民', 57],
  ['Turks', 'turks-sipahi-cav-archer-field', '持续生产 · 翼骑兵（马厩 4 座）＋重装骑射手（靶场 3 座）· 56 名村民', 56],
  ['Malians', 'malians-light-cavalry-gbeto', '持续生产 · 轻型骑兵（马厩 4 座）＋精锐飞刀女兵（城堡 2 座）· 59 名村民（基础采金模型）', 59],
  ['Malians', 'malians-light-cavalry-gbeto', '持续生产 · 加手推炮（攻城武器厂 1 座）· 77 名村民（基础采金模型）', 77],
  ['Malians', 'malians-farimba-cav-champ-field', '持续生产 · 重装骑士（马厩 4 座）＋精锐飞刀女兵（城堡 2 座）· 83 名村民（基础采金模型）', 83],
  ['Malians', 'malians-farimba-cav-champ-field', '持续生产 · 冠军剑士（兵营 6 座）· 56 名村民（基础采金模型）', 56],
  ['Malay', 'malay-battle-elephant-progression', '持续生产 · 精锐象兵（马厩 4 座）＋劲弩手（靶场 3 座）· 76 名村民', 76],
  ['Malay', 'malay-two-handed-swordsman-sustain', '持续生产 · 双手剑士（兵营 4 座）＋劲弩手（靶场 3 座）· 60 名村民，少 23 名采金村民', 60],
  ['Malay', 'malay-two-handed-swordsman-sustain', '持续生产 · 纯免金双手剑士（兵营 4 座）· 36 名村民、0 黄金', 36],
];

const ARMY_COST_CASES: readonly (readonly [TargetCiv, string, string, { Food: number; Wood: number; Gold: number; Stone: number }, number])[] = [
  [
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '研究账本 · 翼骑兵＋火枪手＋手推炮（不含信仰，合计 7740）',
    { Food: 4245, Wood: 600, Gold: 2895, Stone: 0 },
    7740,
  ],
  [
    'Persians',
    'persian-savar-crossbow-bombard',
    '研究账本 · 萨瓦尔＋免金弩手＋手推炮（不含信仰，合计 9040）',
    { Food: 5270, Wood: 550, Gold: 3220, Stone: 0 },
    9040,
  ],
  [
    'Persians',
    'persian-savar-crossbow-bombard',
    '研究账本 · 萨瓦尔＋火枪手＋手推炮（不含信仰，合计 6590）',
    { Food: 4095, Wood: 0, Gold: 2495, Stone: 0 },
    6590,
  ],
  ['Turks', 'turks-hussar-handcannon', '研究账本 · 翼骑兵＋火枪手（不含抗招降，合计 3390）', { Food: 2195, Wood: 0, Gold: 1195, Stone: 0 }, 3390],
  [
    'Turks',
    'turks-sipahi-cav-archer-field',
    '研究账本 · 翼骑兵＋西帕希重装骑射手（不含抗招降，合计 7715）',
    { Food: 4545, Wood: 550, Gold: 2620, Stone: 0 },
    7715,
  ],
  ['Turks', 'turks-existing-line-choice', '研究账本 · 翼骑兵＋精锐苏丹亲兵（不含抗招降，合计 4990）', { Food: 3045, Wood: 0, Gold: 1945, Stone: 0 }, 4990],
];

const renderFormationText = (text: string) => renderToStaticMarkup(createElement(FormationText, { text }));

const BOUNDARY_SPLIT_RE =
  /<span class="num nw">[^<]*\d+\s*(?:个|名|只|座|条|辆)<\/span>\s*(?:[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从|厩|场|营|厂))|<span class="num nw">\d+\s*座[\u4e00-\u9fff]*(?:骑兵|火枪手|劲弩手|弩手|长戟兵|诸葛弩|飞刀女兵|冠军剑士|双手剑士|象兵|手推炮|骑射手)<\/span>|<span class="num nw">[+\-−]?\d+(?:\.\d+)?<\/span>\s*(?:远甲|移速|增箭|项|农|厩|厂|营|场)|<span class="num nw">[^<]*\d+\s*人<\/span>\s*口/g;

const findBoundaryViolations = (html: string) => [...html.matchAll(BOUNDARY_SPLIT_RE)].map((m) => m[0]);

describe('#1406 第二档六国策略与阵容升级：驻军/生产/研究账本、契约重签与 FormationText 守卫', () => {
  it('全 6 国 10 条满科技驻军、17 条持续生产（含中国零城堡无征招）与 6 条研究账本链接解码复算 100% 一致', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    expect(core.techById[315]?.b).toBe(82);

    expect(GARRISON_CASES).toHaveLength(10);
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
      expect(techs, label).toEqual([...expectedTechs].sort((a, b) => a - b));
      if (bid === 1189) {
        expect(techs).not.toContain(233);
        expect(techs).not.toContain(437);
      }
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

    expect(PRODUCTION_CASES).toHaveLength(17);
    for (const [civ, routeId, label, expectedVils] of PRODUCTION_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeProduction(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.config.civ, label).toBe(civ);
      if (routeId === 'china-arbalest-zero-castle') {
        expect(decoded.config.techs, `${label} must not include Castle tech Conscription (315)`).not.toContain(315);
      }
      if (routeId === 'china-chu-ko-nu') {
        expect(decoded.config.techs, `${label} includes Conscription (315)`).toContain(315);
      }
      const res = calculateProduction({ core, trees }, decoded.config);
      expect(res.errors, label).toEqual([]);
      expect(res.total, label).toBe(expectedVils);
    }

    expect(ARMY_COST_CASES).toHaveLength(6);
    for (const [civ, routeId, label, expectedCost, expectedSum] of ARMY_COST_CASES) {
      const link = route(civ, routeId).evidence.links?.find((item) => item.label === label);
      expect(link, `${civ}/${routeId} missing ${label}`).toBeDefined();
      const [hashPath, query = ''] = new URL(link!.href).hash.split('?');
      expect(hashPath, label).toBe('#/production');
      const decoded = decodeArmyCost(`?${query}`);
      expect(decoded.errors, label).toEqual([]);
      expect(decoded.dataChanged, label).toBe(false);
      expect(decoded.config, label).not.toBeNull();
      expect(decoded.config!.civ, label).toBe(civ);
      expect(decoded.config!.targets, label).not.toContain('t:45');
      expect(decoded.config!.targets, label).not.toContain('t:102');
      expect(decoded.config!.targets, label).not.toContain('t:103');
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
    }
  });

  it('印度斯坦误标清零、马来升级与边界完整、马里采金口径与土耳其锚点对齐、仅六国重签 DOC_SHA_1406 且去重计数锁死', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    expect(civFormationContent).toHaveLength(33);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(68);

    // Scope Hindustanis errata zero-residual check to Hindustanis content & contract (other civs may genuinely have full-tech CA)
    const hindustanisContent = byCiv('Hindustanis');
    const hindustanisContract = formationContract.civs.find((entry) => entry.civ === 'Hindustanis')!;
    expect(JSON.stringify(hindustanisContent)).not.toMatch(/全科技(?:重装)?骑射/);
    expect(JSON.stringify(hindustanisContract)).not.toMatch(/全科技(?:重装)?骑射/);

    // Malay: upgraded supplements & adjustments while preserving two routes and playtest: 'unreported'
    const malay = byCiv('Malay');
    expect(malay.routes.map(({ id, playtest }) => [id, playtest])).toEqual([
      ['malay-battle-elephant-progression', 'unreported'],
      ['malay-two-handed-swordsman-sustain', 'unreported'],
    ]);
    expect(JSON.stringify(malay)).not.toContain('本轮未做新模拟');
    expect(JSON.stringify(malay)).not.toMatch(/building\/1189[^"]*(?:233|437)/);
    const malayEle = route('Malay', 'malay-battle-elephant-progression');
    expect(malayEle.evidence.scope).toContain('城堡时代象兵总价 127.5［75 食物＋52.5 黄金］');
    expect(malayEle.evidence.scope).toContain('帝王时代普通与精锐象兵均为 110.5［65 食物＋45.5 黄金］');
    expect(JSON.stringify(malay)).not.toContain('52 人口');
    expect(malayEle.adjustments?.map(({ id }) => id)).toEqual([
      'malay-battle-elephant-progression-adjustment-first',
      'malay-battle-elephant-progression-adjustment-arbalester',
      'malay-battle-elephant-progression-adjustment-karambit',
    ]);
    const malaySwords = route('Malay', 'malay-two-handed-swordsman-sustain');
    expect(malaySwords.adjustments?.map(({ id }) => id)).toEqual([
      'malay-two-handed-swordsman-adjustment-arbalester',
      'malay-two-handed-swordsman-adjustment-zero-gold',
    ]);
    expect(malaySwords.adjustments?.[0]?.text).toContain('少用 23 名采金村民');
    expect(malaySwords.adjustments?.[0]?.text).toContain('敌剩冠军 3、劲弩 28');

    // Malians: base gold-gathering model boundary (#1410) explicitly noted on both routes
    for (const r of byCiv('Malians').routes) {
      expect(r.evidence.scope, r.id).toContain('基础采金模型');
      expect(r.evidence.scope, r.id).toContain('#1410');
    }

    // Turks existing-line-choice anchor covers sourceLines 374-396
    expect(route('Turks', 'turks-existing-line-choice').source?.content).toBe(
      `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA_1406}/role/game-strategy.md#L374-L396`,
    );

    const china = byCiv('Chinese');
    expect(china.routes.map(({ id, status, playtest }) => [id, status, playtest])).toEqual([
      ['china-chu-ko-nu', 'approved', 'reported'],
      ['china-fire-lancer-tower', 'approved', 'pending'],
      ['china-arbalest-zero-castle', 'approved', 'pending'],
    ]);
    const zeroCastle = route('Chinese', 'china-arbalest-zero-castle');
    expect(zeroCastle.composition).toBe('combined');
    expect(zeroCastle.choiceLabel).toBeUndefined();
    expect(zeroCastle.required.map(({ id }) => id)).toEqual([492]);
    expect(zeroCastle.choices?.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[546], [359]]);
    expect(zeroCastle.supplements.map(({ mode, entities }) => [mode, entities.map(({ id }) => id)])).toEqual([
      ['as-needed', [548]],
      ['conditional', [331]],
    ]);

    const targetSet = new Set<string>(TARGET_CIVS);
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        expect(civ.source.content, civ.civ).toContain(`/blob/${DOC_SHA_1406}/role/game-strategy.md#L`);
        for (const r of civ.routes) {
          if (civ.civ === 'Persians') expect(r.source, `${civ.civ}/${r.id}`).toBeUndefined();
          else expect(r.source?.content, `${civ.civ}/${r.id}`).toContain(`/blob/${DOC_SHA_1406}/role/game-strategy.md#L`);
          const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
          expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate href`).toBe(hrefs.length);
          for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1406);
        for (const r of civ.routes) expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1406);
      }
    }

    const core = await loadCore();
    const trees = await loadTrees();

    // Malay Battle Elephant / Elite Battle Elephant age-driven discount verification (-25% Castle, -35% Imperial)
    expect(unitCost(core.unitById[1132]!, 'Malay', 3, []).cost).toEqual({ Food: 75, Gold: 52.5 });
    expect(unitCost(core.unitById[1132]!, 'Malay', 4, []).cost).toEqual({ Food: 65, Gold: 45.5 });
    expect(unitCost(core.unitById[1134]!, 'Malay', 4, []).cost).toEqual({ Food: 65, Gold: 45.5 });
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

  it('FormationText 守卫双边自测通过，且六国全部 13 条路线所有文本字段与链接标签除 1 处基线既有匹配外零拆词', () => {
    const mustReject = [
      '4 座马厩',
      '4 座靶场',
      '1 座攻城武器厂',
      '马厩 4 座轻型骑兵',
      '（62 名村民）',
      '（合计 46 名村民）',
      '10 名村民满',
      '62 农',
      '4 厩',
      '1 厂',
      '7 远甲',
      '1.16 移速',
      '0 增箭',
      '9 项',
      '占 52 人口',
      '仅 52 人口即可胜不列颠枪弓',
    ];
    for (const bad of mustReject) {
      expect(findBoundaryViolations(renderFormationText(bad)).length, `expected reject: ${bad}`).toBeGreaterThan(0);
    }
    const mustAllow = [
      '持续生产 · 轻型骑兵（马厩 4 座）＋精锐诸葛弩（城堡 2 座）· 62 名村民',
      '持续生产 · 加手推炮（攻城武器厂 1 座）· 79 名村民',
      '满科技驻军 · 巨港 10 条渔船 14/14 箭',
      '满科技驻军 · 蛮王城镇中心 10 名村民 18/18 箭',
      '持续生产 · 双手剑士（兵营 4 座）＋劲弩手（靶场 3 座）· 60 名村民，少 23 名采金村民',
      '翼骑兵远甲为 7，重装骑射手移速为 1.16，增箭为 0，共 9 个全游唯一第一',
      '混编 · 48 名精锐爪刀勇士 与 28 名劲弩手 对不列颠 33 名长戟兵 与 28 名劲弩手（胜，剩爪刀 17、劲弩 28，占用人口为 52）',
      '48 名精锐爪刀勇士 配 28 名劲弩手 占用人口仅 52 即可胜不列颠枪弓',
    ];
    for (const ok of mustAllow) {
      expect(findBoundaryViolations(renderFormationText(ok)), `expected allow: ${ok}`).toEqual([]);
    }

    const KNOWN_BASELINE_VIOLATION = '<span class="num nw">3 个</span>精锐诸葛弩';
    let baselineHits = 0;

    for (const civName of TARGET_CIVS) {
      for (const r of byCiv(civName).routes) {
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
          r.source?.boundary,
          ...r.required.flatMap(({ role, research }) => [role, research?.effect, research?.caveat]),
          ...(r.choices ?? []).flatMap(({ title, preconditions, entities }) => [title, ...preconditions, ...entities.map(({ role }) => role)]),
          ...(r.prerequisites ?? []).map(({ condition }) => condition),
          ...(r.supplements ?? []).flatMap(({ condition, entities }) => [condition, ...entities.map(({ role }) => role)]),
          ...(r.adjustments ?? []).flatMap(({ when, text, fallback }) => [when, text, fallback]),
          ...(r.evidence.links ?? []).map(({ label }) => label),
        ].filter((v): v is string => Boolean(v));

        for (const text of texts) {
          const violations = findBoundaryViolations(renderFormationText(text));
          const isKnownChineseBaseline = civName === 'Chinese' && r.id === 'china-fire-lancer-tower' && text.includes('无射箭槽时 3 个精锐诸葛弩是 5/5 箭');
          const unexpected = isKnownChineseBaseline
            ? violations.filter((v) => {
                if (v === KNOWN_BASELINE_VIOLATION) {
                  baselineHits += 1;
                  return false;
                }
                return true;
              })
            : violations;
          expect(unexpected, `${civName}/${r.id} violation in: ${text}`).toEqual([]);
        }
      }
    }
    expect(baselineHits).toBe(1);
  });
});
