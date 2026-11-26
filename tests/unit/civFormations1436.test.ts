import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { loadCore, loadTrees } from '../../src/data';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation, type Formation, type FormationCatalog, type FormationView } from '../../src/domain/civFormations';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import {
  classifyScenarioGroup,
  deriveChipLabel,
  deriveTabHint,
  formationEntityDomId,
  resolveFormationRestoreTarget,
} from '../../src/domain/formationScenarios';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import formationContract from '../../data/reference/civ-formations-contract.json';

async function loadCatalog(): Promise<FormationCatalog> {
  const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
  return { core, trees };
}

function getCiv(civ: string) {
  const entry = civFormationContent.find((item) => item.civ === civ);
  if (!entry) throw new Error(`Missing civ ${civ}`);
  return entry;
}

function getRoute(civ: string, id: string): Formation {
  const route = getCiv(civ).routes.find((item) => item.id === id);
  if (!route) throw new Error(`Missing route ${civ}/${id}`);
  return route;
}

function expectCurrent(view: FormationView): Extract<FormationView, { status: 'current' }> {
  expect(view.status).toBe('current');
  if (view.status !== 'current') throw new Error(`Expected current view, got ${view.status}`);
  return view;
}

describe('#1436 推荐阵容分区与契约校验', () => {
  it('全量 33 国 68 路内容与独立发布契约完全通过', () => {
    expect(civFormationContent).toHaveLength(33);
    expect(civFormationContent.reduce((sum, civ) => sum + civ.routes.length, 0)).toBe(68);
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
  });

  it('拦截重复调整/局面 ID、未分区源项、越界与 age-progression 误入', () => {
    const dupAdj = structuredClone(civFormationContent);
    const dupAdjContract = structuredClone(formationContract) as { civs: { civ: string; routes: { adjustments: { id: string; requires: unknown[] }[] }[] }[] };
    const sic = dupAdj.find((c) => c.civ === 'Sicilians')!.routes[0]!;
    sic.adjustments!.push({ ...sic.adjustments![0]! });
    dupAdjContract.civs.find((c) => c.civ === 'Sicilians')!.routes[0]!.adjustments.push({ id: sic.adjustments![0]!.id, requires: [] });
    expect(formationProblems(dupAdj, dupAdjContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('调整 ID 重复') }));

    const dupSup = structuredClone(civFormationContent);
    const sp = dupSup.find((c) => c.civ === 'Spanish')!.routes[3]!;
    sp.scenarios![0]!.supplementIndices = [0];
    expect(formationProblems(dupSup, formationContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('补充下标重复引用') }));

    const britonsBad = structuredClone(civFormationContent);
    const br = britonsBad.find((c) => c.civ === 'Britons')!.routes[0]!;
    br.scenarios![0]!.supplementIndices = [0, 1];
    expect(formationProblems(britonsBad, formationContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('age-progression') }));

    const vnBad = structuredClone(civFormationContent);
    const vn = vnBad.find((c) => c.civ === 'Vietnamese')!.routes[0]!;
    vn.scenarios = vn.scenarios!.filter((s) => s.id !== 'castle-rattan');
    expect(formationProblems(vnBad, formationContract)).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('可分区补充未被任何局面引用：0') }),
    );

    const emptyBad = structuredClone(civFormationContent);
    emptyBad.find((c) => c.civ === 'Spanish')!.routes[0]!.scenarios = [];
    expect(formationProblems(emptyBad, formationContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('空 scenarios') }));

    const omitBad = structuredClone(civFormationContent);
    omitBad.find((c) => c.civ === 'Japanese')!.routes[0]!.scenarios![6]!.omitSupplementConditions = [
      { supplementIndex: 1, coveredBy: { kind: 'adjustment', id: 'japanese-samurai-light-cavalry-adjustment-first' } },
    ];
    expect(formationProblems(omitBad, formationContract)).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('coveredBy 引用的调整不在本局面内') }),
    );

    const noLinksBad = structuredClone(civFormationContent);
    const incasCand = noLinksBad.find((c) => c.civ === 'Incas')!.routes[1]!;
    incasCand.scenarios![0]!.links = [{ index: 0 }];
    expect(formationProblems(noLinksBad, formationContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('evidence.links') }));

    const noGroupBad = structuredClone(civFormationContent);
    delete noGroupBad.find((c) => c.civ === 'Sicilians')!.routes[0]!.scenarios![0]!.group;
    expect(formationProblems(noGroupBad, formationContract)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('group') }));
  });

  it('校验 conditionBranches[].displayRequires 与 evidence.links[].requires 契约一致性，并兼容未迁移路线', () => {
    const missingDisplayReq = structuredClone(civFormationContent);
    delete missingDisplayReq.find((c) => c.civ === 'Wei')!.routes[0]!.conditionBranches![0]!.displayRequires;
    expect(formationProblems(missingDisplayReq, formationContract)).toContainEqual(
      expect.objectContaining({ path: expect.stringMatching(/\/conditionBranches$/) }),
    );

    const missingLinkReq = structuredClone(civFormationContent);
    delete missingLinkReq.find((c) => c.civ === 'Wei')!.routes[0]!.evidence.links![7]!.requires;
    expect(formationProblems(missingLinkReq, formationContract)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/evidence\/links$/) }));

    const unmigratedContent = structuredClone(civFormationContent);
    const unmigratedContract = structuredClone(formationContract) as { civs: { civ: string; routes: { scenarios?: unknown[] }[] }[] };
    delete unmigratedContent.find((c) => c.civ === 'Magyars')!.routes[0]!.scenarios;
    delete unmigratedContract.civs.find((c) => c.civ === 'Magyars')!.routes[0]!.scenarios;
    expect(formationProblems(unmigratedContent, unmigratedContract)).toEqual([]);
  });
});

describe('#1436 统一全函数投影与双路径门控', () => {
  it('日本武士路 484 链接在声明式与自动合成双路径均先正对照存在、缺 484 后同步剔除', async () => {
    const catalog = await loadCatalog();
    const jp = getCiv('Japanese');
    const route = jp.routes[0]!;
    const without484: FormationCatalog = {
      ...catalog,
      core: { ...catalog.core, techById: Object.fromEntries(Object.entries(catalog.core.techById).filter(([k]) => Number(k) !== 484)) },
    };

    const fullDeclared = expectCurrent(projectFormation(route, 'Japanese', DATA_PATCH, catalog, jp.routes, jp.source));
    expect(fullDeclared.scenarios).toHaveLength(12);
    const towerFull = fullDeclared.scenarios.find((s) => s.id === 'tower-arrowslits')!;
    expect(towerFull.state).toBe('available');
    expect(towerFull.actionHint).toBe('大型箭塔＋射箭孔');
    expect(towerFull.links.filter((l) => l.href.includes('484'))).toHaveLength(2);
    expect(fullDeclared.evidenceLinks.filter((l) => l.href.includes('484'))).toHaveLength(2);

    const degDeclared = expectCurrent(projectFormation(route, 'Japanese', DATA_PATCH, without484, jp.routes, jp.source));
    const towerDeg = degDeclared.scenarios.find((s) => s.id === 'tower-arrowslits')!;
    expect(towerDeg.state).toBe('partial');
    expect(towerDeg.actionHint).toBeUndefined();
    expect(towerDeg.links.filter((l) => l.href.includes('484'))).toHaveLength(0);
    expect(degDeclared.evidenceLinks.filter((l) => l.href.includes('484'))).toHaveLength(0);

    const strippedRoute: Formation = { ...route, scenarios: undefined };
    const fullAuto = expectCurrent(projectFormation(strippedRoute, 'Japanese', DATA_PATCH, catalog, jp.routes, jp.source));
    expect(fullAuto.scenarios.every((s) => s.links.length === 0)).toBe(true);
    expect(fullAuto.evidenceLinks.filter((l) => l.href.includes('484'))).toHaveLength(2);

    const degAuto = expectCurrent(projectFormation(strippedRoute, 'Japanese', DATA_PATCH, without484, jp.routes, jp.source));
    expect(degAuto.evidenceLinks.filter((l) => l.href.includes('484'))).toHaveLength(0);
  });

  it('日本骑射路 SUP[0] 在自动合成路径只移除弹射器 59 保留射箭孔 484 时零弹射器泄漏', async () => {
    const catalog = await loadCatalog();
    const jp = getCiv('Japanese');
    const strippedRoute: Formation = { ...jp.routes[1]!, scenarios: undefined };
    const without59: FormationCatalog = {
      ...catalog,
      core: { ...catalog.core, techById: Object.fromEntries(Object.entries(catalog.core.techById).filter(([k]) => Number(k) !== 59)) },
    };

    const view = expectCurrent(projectFormation(strippedRoute, 'Japanese', DATA_PATCH, without59, jp.routes, jp.source));
    const sup0 = view.scenarios.find((s) => s.id === 'sup-0')!;
    expect(sup0.state).toBe('partial');
    expect(sup0.chipLabel).toBe('按需补充：射箭孔');
    expect(sup0.title).toBe('按需补充：射箭孔');
    expect(sup0.when).toBe('按需补充：射箭孔');
    expect(JSON.stringify(sup0)).not.toContain('弹射器');
    expect(sup0.entities.map((e) => e.entity.id)).toEqual([484]);
  });

  it('魏国 1946 在声明式与自动合成双路径均正对照存在、缺 1946 同步降级且无 partialFallback 彻底隐藏', async () => {
    const catalog = await loadCatalog();
    const wei = getCiv('Wei');
    const route = wei.routes[0]!;
    const without1946: FormationCatalog = {
      ...catalog,
      core: { ...catalog.core, unitById: Object.fromEntries(Object.entries(catalog.core.unitById).filter(([k]) => Number(k) !== 1946)) },
    };

    const fullDec = expectCurrent(projectFormation(route, 'Wei', DATA_PATCH, catalog, wei.routes, wei.source));
    expect(fullDec.scenarios).toHaveLength(8);
    const fullHg = fullDec.scenarios.find((s) => s.id === 'heiguang-frontline')!;
    expect(fullHg.state).toBe('available');
    expect(fullHg.actionHint).toBe('重装黑光铠');
    expect(fullHg.links.filter((l) => l.href.includes('1946'))).toHaveLength(3);
    expect(fullDec.evidenceLinks.filter((l) => l.href.includes('1946'))).toHaveLength(3);

    const degDec = expectCurrent(projectFormation(route, 'Wei', DATA_PATCH, without1946, wei.routes, wei.source));
    expect(degDec.conditionBranches?.map((b) => b.id)).toEqual(['wei-retain-black-light-cavalry', 'wei-siege-when-pushing-buildings']);
    const degHg = degDec.scenarios.find((s) => s.id === 'heiguang-frontline')!;
    expect(degHg.state).toBe('partial');
    expect(degHg.actionHint).toBeUndefined();
    expect(degHg.chipLabel).toBe('已有黑光铠或金流充裕');
    expect(degHg.title).toBe('已有黑光铠或金流充裕');
    expect(degHg.when).toBe('已有黑光铠或金流充裕');
    expect(degHg.links).toHaveLength(0);
    expect(degDec.evidenceLinks.filter((l) => l.href.includes('1946'))).toHaveLength(0);
    expect(degHg.branches[0]?.state).toBe('partial');
    expect(degHg.branches[0]?.partialFallback).toContain('城堡时代留下的黑光铠骑兵');
    expect(JSON.stringify(degHg.branches)).not.toContain('137 血');

    const noFbRoute: Formation = {
      ...route,
      conditionBranches: route.conditionBranches!.map((b) => (b.id === 'wei-retain-black-light-cavalry' ? { ...b, partialFallback: undefined } : b)),
    };
    const hiddenDec = expectCurrent(projectFormation(noFbRoute, 'Wei', DATA_PATCH, without1946, [noFbRoute], wei.source));
    expect(hiddenDec.scenarios.find((s) => s.id === 'heiguang-frontline')).toBeUndefined();

    const autoRoute: Formation = { ...route, scenarios: undefined };
    const fullAuto = expectCurrent(projectFormation(autoRoute, 'Wei', DATA_PATCH, catalog, [autoRoute], wei.source));
    expect(fullAuto.evidenceLinks.filter((l) => l.href.includes('1946'))).toHaveLength(3);
    expect(fullAuto.scenarios.every((s) => s.links.length === 0)).toBe(true);

    const degAuto = expectCurrent(projectFormation(autoRoute, 'Wei', DATA_PATCH, without1946, [autoRoute], wei.source));
    expect(degAuto.evidenceLinks.filter((l) => l.href.includes('1946'))).toHaveLength(0);
    const autoBr = degAuto.scenarios.find((s) => s.id === 'branch-wei-retain-black-light-cavalry')!;
    expect(autoBr.state).toBe('partial');
    expect(autoBr.chipLabel).toBe('已有城堡黑光铠骑兵');
    expect(autoBr.title).toBe('已有城堡黑光铠骑兵');
    expect(autoBr.when).toBe('已有城堡黑光铠骑兵');
    expect(autoBr.chipLabel).not.toContain('重装黑光铠');

    const autoNoFb: Formation = { ...noFbRoute, scenarios: undefined };
    const hiddenAuto = expectCurrent(projectFormation(autoNoFb, 'Wei', DATA_PATCH, without1946, [autoNoFb], wei.source));
    expect(hiddenAuto.scenarios.find((s) => s.id === 'branch-wei-retain-black-light-cavalry')).toBeUndefined();
  });

  it('吴国缺少可选科技卧虎 1081 时牵引抛石机场景降级为 partial 并抑制门控文案与链接', async () => {
    const catalog = await loadCatalog();
    const wu = getCiv('Wu');
    const without1081: FormationCatalog = {
      ...catalog,
      core: { ...catalog.core, techById: Object.fromEntries(Object.entries(catalog.core.techById).filter(([k]) => Number(k) !== 1081)) },
    };

    const full = expectCurrent(projectFormation(wu.routes[0]!, 'Wu', DATA_PATCH, catalog, wu.routes, wu.source));
    const fullTreb = full.scenarios.find((s) => s.id === 'push-traction-treb')!;
    expect(fullTreb.state).toBe('available');
    expect(fullTreb.actionHint).toBe('牵引抛石机');
    expect(fullTreb.links).toHaveLength(2);

    const deg = expectCurrent(projectFormation(wu.routes[0]!, 'Wu', DATA_PATCH, without1081, wu.routes, wu.source));
    const degTreb = deg.scenarios.find((s) => s.id === 'push-traction-treb')!;
    expect(degTreb.state).toBe('partial');
    expect(degTreb.actionHint).toBeUndefined();
    expect(degTreb.links).toHaveLength(1);
    expect(deg.evidenceLinks.some((l) => l.label.includes('卧虎'))).toBe(false);
  });

  it('S=2, B=2 混合局面下 omitSupplementConditions 精确绑定 coveredBy，且多槽共享链接按任一通过保留', async () => {
    const catalog = await loadCatalog();
    const wei = getCiv('Wei');
    const base = structuredClone(wei.routes[0]!);
    base.scenarios = [
      {
        id: 'mixed-s2-b2',
        chipLabel: '混合测试局面',
        group: 'condition',
        supplementIndices: [0, 3],
        conditionBranchIds: ['wei-retain-black-light-cavalry', 'wei-siege-when-pushing-buildings'],
        omitSupplementConditions: [{ supplementIndex: 0, coveredBy: { kind: 'conditionBranch', id: 'wei-retain-black-light-cavalry' } }],
        links: [{ index: 0, whenAvailable: { kind: 'conditionBranch', id: 'wei-retain-black-light-cavalry' } }],
      },
      {
        id: 'shared-link-holder',
        chipLabel: '共享链接二号槽',
        group: 'condition',
        supplementIndices: [1, 2],
        adjustmentIds: base.adjustments!.map((a) => a.id),
        links: [{ index: 0, whenAvailable: { kind: 'entity', entityKind: 'unit', id: 441, age: 4 } }],
      },
    ];

    const full = expectCurrent(projectFormation(base, 'Wei', DATA_PATCH, catalog, [base], wei.source));
    const mixedFull = full.scenarios.find((s) => s.id === 'mixed-s2-b2')!;
    expect(mixedFull.supplementNotes.map((n) => n.sourceIndex)).toEqual([3]);
    expect(full.evidenceLinks.some((l) => l.href === base.evidence.links![0]!.href)).toBe(true);

    const without1946: FormationCatalog = {
      ...catalog,
      core: { ...catalog.core, unitById: Object.fromEntries(Object.entries(catalog.core.unitById).filter(([k]) => Number(k) !== 1946)) },
    };
    const partial = expectCurrent(projectFormation(base, 'Wei', DATA_PATCH, without1946, [base], wei.source));
    const mixedPartial = partial.scenarios.find((s) => s.id === 'mixed-s2-b2')!;
    expect(mixedPartial.supplementNotes.map((n) => n.sourceIndex)).toEqual([0, 3]);
    expect(mixedPartial.supplementNotes[0]?.condition).toBe(base.supplements[0]!.condition);
    // 槽 1 门控失败但槽 2 通过 → 底部保留链接 0
    expect(partial.evidenceLinks.some((l) => l.href === base.evidence.links![0]!.href)).toBe(true);

    // 两槽皆失败 → 底部剔除链接 0
    base.scenarios[1]!.links = [{ index: 0, whenAvailable: { kind: 'entity', entityKind: 'unit', id: 1946, age: 4 } }];
    const bothFailed = expectCurrent(projectFormation(base, 'Wei', DATA_PATCH, without1946, [base], wei.source));
    expect(bothFailed.evidenceLinks.some((l) => l.href === base.evidence.links![0]!.href)).toBe(false);
  });

  it('印加反弩炮候选零泄漏、马来 119 字保留、仅 gate 失败不误降级、多调整全失效兜底去重有序', async () => {
    const catalog = await loadCatalog();
    const incas = getCiv('Incas');
    const incasView = expectCurrent(projectFormation(incas.routes[0]!, 'Incas', DATA_PATCH, catalog, incas.routes, incas.source));
    const scorp = incasView.scenarios.find((s) => s.id === 'vs-scorpions')!;
    expect(scorp.state).toBe('unavailable');
    expect(scorp.chipLabel).toBe('敌方弩炮压制');
    expect(JSON.stringify(scorp)).not.toContain('精锐蔷琵战士');
    expect(scorp.fallbacks).toHaveLength(1);

    const malay = getCiv('Malay');
    const strippedMalay: Formation = { ...malay.routes[0]!, scenarios: undefined };
    const malayView = expectCurrent(projectFormation(strippedMalay, 'Malay', DATA_PATCH, catalog, [strippedMalay], malay.source));
    const karambit = malayView.scenarios.find((s) => s.id === 'sup-5')!;
    expect(karambit.supplementNotes[0]?.condition).toContain('25 食物、15 黄金');
    expect(karambit.supplementNotes[0]?.condition?.length).toBeGreaterThanOrEqual(100);

    const custom = structuredClone(getRoute('Magyars', 'magyars-huszar-hca'));
    custom.scenarios![0]!.actionHintGate = { kind: 'entity', entityKind: 'unit', id: 999999, age: 4 };
    const gateFailOnly = expectCurrent(projectFormation(custom, 'Magyars', DATA_PATCH, catalog, [custom], getCiv('Magyars').source));
    expect(gateFailOnly.scenarios[0]!.state).toBe('available');
    expect(gateFailOnly.scenarios[0]!.actionHint).toBeUndefined();

    const multiFail = structuredClone(getRoute('Spanish', 'conquistador-hussar'));
    multiFail.adjustments = [
      { id: 'a-one', when: 'A', text: 't1', requires: [{ kind: 'unit', id: 999991 }], fallback: '兜底一' },
      { id: 'a-two', when: 'B', text: 't2', requires: [{ kind: 'unit', id: 999992 }], fallback: '兜底一' },
      { id: 'a-three', when: 'C', text: 't3', requires: [{ kind: 'unit', id: 999993 }] },
    ];
    multiFail.supplements = [];
    multiFail.scenarios = [{ id: 'all-fail', chipLabel: '全失效', adjustmentIds: ['a-one', 'a-two', 'a-three'] }];
    const multiView = expectCurrent(projectFormation(multiFail, 'Spanish', DATA_PATCH, catalog, [multiFail], getCiv('Spanish').source));
    expect(multiView.scenarios[0]!.state).toBe('unavailable');
    expect(multiView.scenarios[0]!.fallbacks).toEqual(['兜底一', '这项补充资料暂不可用']);
  });

  it('过滤前稳定实体 ID、classifyScenarioGroup 优先级、resolveFormationRestoreTarget 与 formationDedup 守恒', async () => {
    const catalog = await loadCatalog();
    const dupRoute = structuredClone(getRoute('Spanish', 'conquistador-hussar'));
    dupRoute.supplements = [
      { mode: 'as-needed', entities: [{ kind: 'unit', id: 6, historicalName: '精锐掷矛手', role: '前', age: 2 }] },
      { mode: 'as-needed', entities: [{ kind: 'unit', id: 6, historicalName: '精锐掷矛手', role: '后', age: 4 }] },
    ];
    dupRoute.adjustments = [];
    dupRoute.scenarios = [{ id: 'dup-ent', chipLabel: '重复实体', supplementIndices: [0, 1] }];
    const view = expectCurrent(projectFormation(dupRoute, 'Spanish', DATA_PATCH, catalog, [dupRoute], getCiv('Spanish').source));
    const sc = view.scenarios[0]!;
    expect(sc.entities).toHaveLength(1);
    expect(sc.entities[0]!.rawOccurrence).toBe(1);
    expect(formationEntityDomId('formation-conquistador-hussar', sc.entities[0]!, 'dup-ent')).toBe(
      'formation-conquistador-hussar-scenario-dup-ent-unit-6-repeat-1',
    );

    expect(classifyScenarioGroup({ when: '黄金紧张时', chipLabel: '敌方骑兵', summary: '骑兵冲阵' })).toBe('condition');
    expect(classifyScenarioGroup({ when: '', chipLabel: '敌方骑兵成群', summary: '资源充足' })).toBe('opponent');
    expect(classifyScenarioGroup({ when: '', chipLabel: '', summary: '反攻城补队' })).toBe('opponent');
    expect(deriveTabHint('第一句适用说明，较短。第二句忽略')).toBe('第一句适用说明，较短');
    expect(deriveChipLabel('')).toBe('按需补充方案');

    const sp = getCiv('Spanish');
    const spViews = sp.routes.map((r) => projectFormation(r, 'Spanish', DATA_PATCH, catalog, sp.routes, sp.source));
    expect(resolveFormationRestoreTarget({ route: 'formation-paladin-skirmisher', routeId: 'paladin-skirmisher', scenarioId: 'low-gold' }, spViews)).toEqual({
      routeId: 'paladin-skirmisher',
      scenarioId: 'low-gold',
      fallbackToSection: false,
    });
    expect(resolveFormationRestoreTarget({ route: 'formation-paladin-skirmisher', routeId: 'paladin-skirmisher', scenarioId: 'missing-sc' }, spViews)).toEqual({
      routeId: 'paladin-skirmisher',
      scenarioId: null,
      fallbackToSection: false,
    });
    expect(resolveFormationRestoreTarget({ route: 'formation-deleted', routeId: 'deleted', scenarioId: 'x' }, spViews)).toEqual({
      routeId: null,
      scenarioId: null,
      fallbackToSection: true,
    });

    const dedupCounts: Record<string, number> = {};
    for (const civName of ['Teutons', 'Franks', 'Poles', 'Mapuche']) {
      const civ = getCiv(civName);
      const views = civ.routes.map((r) => projectFormation(r, civName, DATA_PATCH, catalog, civ.routes, civ.source));
      dedupCounts[civName] = dedupeFormationClauses(views).shared.length;
    }
    expect(dedupCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });
});
