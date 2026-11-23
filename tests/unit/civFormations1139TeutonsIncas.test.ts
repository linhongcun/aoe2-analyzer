import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties } from './civFormationsTestUtils';

const TEUTON_SOURCE_URLS = {
  'teutons-paladin-skirmisher': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L542',
  'teutons-halberdier-handcannon': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L543',
  'teutons-elite-knight-skirmisher': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L544',
} as const;
const TEUTON_SOURCE_LINES = {
  'teutons-paladin-skirmisher': [538, 540, 542, 544, 545, 547, 549, 551, 557, 558, 559, 560, 566, 567, 568, 569, 571, 573],
  'teutons-halberdier-handcannon': [538, 540, 543, 545, 547, 549, 551, 557, 558, 559, 560, 566, 567, 568, 569, 571, 573],
  'teutons-elite-knight-skirmisher': [538, 540, 542, 544, 545, 547, 549, 551, 557, 558, 559, 560, 566, 567, 568, 569, 571, 573],
} as const;
const INCAS_SOURCE_URLS = {
  'incas-kamayuk-skirmisher': 'https://github.com/linhongcun/aoe2-analyzer/blob/415863b2a3e94078129554c09378c9a9fba04b57/role/game-strategy.md#L1114-L1149',
  'incas-champi-candidate': 'https://github.com/linhongcun/aoe2-analyzer/blob/415863b2a3e94078129554c09378c9a9fba04b57/role/game-strategy.md#L1118',
} as const;
const INCAS_SOURCE_LINES = {
  'incas-kamayuk-skirmisher': [1114, 1116, 1126, 1127, 1130, 1132, 1138, 1139, 1140, 1141, 1147, 1149],
  'incas-champi-candidate': [1118, 1128, 1130, 1132, 1140, 1141, 1149],
} as const;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });

const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof route>, id: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  const source = entry.adjustments.find((adjustment) => adjustment.id === id)!;
  expect(view.adjustments.find((adjustment) => adjustment.id === id)).toMatchObject({
    unavailable: true,
    text: source.fallback,
  });
};

describe('#1139 条顿与印加路线边界', () => {
  it('条顿按条件改选主路线而非硬互斥；印加候选保留名称更正时间边界', () => {
    const teutons = byCiv('Teutons');
    for (const entry of teutons.routes) {
      assertDefinedProperties(entry, 'adjustments');
      for (const adjustment of entry.adjustments) {
        if (adjustment.text?.includes('按条件改选')) {
          expect(adjustment.text).toContain('不表示默认同时铺开三套');
          expect(adjustment.text).not.toContain('不同时训练三套');
        }
      }
    }
    const eliteKnight = route('Teutons', 'teutons-elite-knight-skirmisher');
    expect(eliteKnight.adjustments[1]!.text).not.toContain('已有长戟');
    expect(eliteKnight.adjustments[1]!.text).toContain('按实际反骑压力补长戟兵');
    const candidate = route('Incas', 'incas-champi-candidate');
    expect(candidate.evidence.scope).toContain('固定来源 L1118');
    expect(candidate.evidence.scope).toContain('2026-11-18 08:51 UTC');
    expect(candidate.evidence.scope).toContain('候选实战未核实');
  });

  it('保留路线统计与原四条回归路线', () => {
    expect(civFormationContent).toHaveLength(33);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(59);
    expect(civFormationContent.slice(0, 2).map(({ civ, routes }) => [civ, routes.length])).toEqual([
      ['Spanish', 3],
      ['Georgians', 2],
    ]);
  });

  it('三条条顿主路保留各自阵容职责、按需炮类选择和独立条件', () => {
    const paladin = route('Teutons', 'teutons-paladin-skirmisher');
    const halberdier = route('Teutons', 'teutons-halberdier-handcannon');
    const eliteKnight = route('Teutons', 'teutons-elite-knight-skirmisher');

    for (const [entry, required] of [
      [paladin, [569, 6]],
      [halberdier, [359, 5]],
      [eliteKnight, [554, 6]],
    ] as const) {
      expect([entry.status, entry.playtest, entry.composition, entry.age, entry.required.map(({ id }) => id)]).toEqual([
        'approved',
        'unreported',
        'combined',
        4,
        required,
      ]);
      expect(entry.prerequisites).toEqual([]);
      expect(entry.supplements).toHaveLength(1);
      expect(entry.supplements[0]!.mode).toBe('choice');
      expect(entry.supplements[0]!.entities.map(({ id }) => id)).toEqual([36, 331]);
      expect(entry.required.map(({ id }) => id)).not.toContain(36);
      expect(entry.required.map(({ id }) => id)).not.toContain(331);
      expect(entry.alternatives).not.toMatch(/可按局势少量配炮|长戟适合.*补队/);
    }

    expect(paladin.adjustments.map(({ id }) => id)).toEqual([
      'teutons-paladin-skirmisher-adjustment-first',
      'teutons-paladin-skirmisher-adjustment-second',
      'teutons-paladin-skirmisher-adjustment-third',
      'teutons-paladin-skirmisher-adjustment-fourth',
    ]);
    expect(paladin.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(paladin.adjustments[2]!.text).toContain('替换部分游侠');
    expect(paladin.adjustments[2]!.text).not.toContain('火枪');
    expect(paladin.adjustments[3]!.requires).toEqual([{ kind: 'route', id: eliteKnight.id }]);
    expect(paladin.adjustments[3]!.text).toContain('改选');

    expect(halberdier.reason).toContain('长戟反骑');
    expect(halberdier.reason).toContain('火枪处理步兵');
    expect(halberdier.adjustments[0]!.requires).toEqual([{ kind: 'route', id: paladin.id }]);
    expect(halberdier.adjustments[0]!.text).toContain('改选');
    expect(halberdier.adjustments[1]!.text).toContain('长戟反骑');
    expect(halberdier.adjustments[1]!.text).toContain('火枪处理步兵');
    expect(halberdier.adjustments[1]!.text).not.toContain('+2 护甲');
    expect(halberdier.adjustments[2]!.text).toContain('已有长戟承担反骑');
    expect(halberdier.adjustments[2]!.text).not.toContain('替换游侠');
    expect(halberdier.adjustments[3]!.requires).toEqual([{ kind: 'route', id: eliteKnight.id }]);

    expect(eliteKnight.adjustments.map(({ id }) => id)).not.toContain('teutons-elite-knight-skirmisher-adjustment-third');
    expect(eliteKnight.adjustments[0]!.requires).toEqual([{ kind: 'route', id: paladin.id }]);
    expect(eliteKnight.adjustments[0]!.text).toContain('改选');
    expect(eliteKnight.adjustments[1]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(eliteKnight.adjustments[1]!.text).toContain('实际反骑压力');
    expect([eliteKnight.reason, eliteKnight.limitation, eliteKnight.attack, eliteKnight.defense].join(' ')).not.toMatch(/火枪|游侠/);
  });

  it('跨条顿路线依赖在目标缺失、不可发布或版本不符时局部回退', async () => {
    const resources = await catalog();
    const teutons = byCiv('Teutons');
    const paladin = route('Teutons', 'teutons-paladin-skirmisher');
    const halberdier = route('Teutons', 'teutons-halberdier-handcannon');
    const eliteKnight = route('Teutons', 'teutons-elite-knight-skirmisher');
    const dependencies = [
      [paladin, 'teutons-paladin-skirmisher-adjustment-fourth', eliteKnight],
      [halberdier, 'teutons-halberdier-handcannon-adjustment-first', paladin],
      [halberdier, 'teutons-halberdier-handcannon-adjustment-fourth', eliteKnight],
      [eliteKnight, 'teutons-elite-knight-skirmisher-adjustment-first', paladin],
    ] as const;
    const project = (entry: ReturnType<typeof route>, siblings: typeof teutons.routes, core = resources.core) =>
      projectFormation(entry, 'Teutons', DATA_PATCH, { core, trees: resources.trees }, siblings, teutons.source);

    for (const [parent, adjustmentId, target] of dependencies) {
      const current = project(parent, teutons.routes);
      expect(current.status).toBe('current');
      if (current.status === 'current') {
        expect(current.adjustments.find(({ id }) => id === adjustmentId)?.unavailable).not.toBe(true);
      }

      expectFallback(
        project(
          parent,
          teutons.routes.filter(({ id }) => id !== target.id),
        ),
        parent,
        adjustmentId,
      );
      for (const status of ['draft', 'unverified'] as const) {
        const unavailableTarget = { ...target, status };
        expectFallback(
          project(
            parent,
            teutons.routes.map((entry) => (entry.id === target.id ? unavailableTarget : entry)),
          ),
          parent,
          adjustmentId,
        );
      }
      const historicalTarget = { ...target, patch: { ...target.patch!, build: target.patch!.build - 1 } };
      const historical = project(
        parent,
        teutons.routes.map((entry) => (entry.id === target.id ? historicalTarget : entry)),
      );
      expectFallback(historical, parent, adjustmentId);

      const unitById = { ...resources.core.unitById };
      delete unitById[target.required[0]!.id];
      const missingEntity = project(parent, teutons.routes, { ...resources.core, unitById });
      expectFallback(missingEntity, parent, adjustmentId);
      const otherPrimary = teutons.routes.find(({ id }) => id !== parent.id && id !== target.id)!;
      assertDefinedProperties(otherPrimary, 'adjustments', 'source');
      expect(project(otherPrimary, teutons.routes, { ...resources.core, unitById }).status).toBe('current');
    }
  });

  it('359 缺失只隐藏条顿条件补队，Incas 主路与候选不互相升级', async () => {
    const resources = await catalog();
    const teutons = byCiv('Teutons');
    const noHalberdierById = { ...resources.core.unitById };
    delete noHalberdierById[359];
    const noHalberdierCore = { ...resources.core, unitById: noHalberdierById };
    const paladin = route('Teutons', 'teutons-paladin-skirmisher');
    const eliteKnight = route('Teutons', 'teutons-elite-knight-skirmisher');
    const projectTeuton = (entry: ReturnType<typeof route>) =>
      projectFormation(entry, 'Teutons', DATA_PATCH, { core: noHalberdierCore, trees: resources.trees }, teutons.routes, teutons.source);
    expectFallback(projectTeuton(paladin), paladin, 'teutons-paladin-skirmisher-adjustment-third');
    expectFallback(projectTeuton(eliteKnight), eliteKnight, 'teutons-elite-knight-skirmisher-adjustment-second');
    expect(projectTeuton(paladin).status).toBe('current');
    expect(projectTeuton(eliteKnight).status).toBe('current');

    const incas = byCiv('Incas');
    const main = route('Incas', 'incas-kamayuk-skirmisher');
    const candidate = route('Incas', 'incas-champi-candidate');
    const projectIncas = (entry: ReturnType<typeof route>, core = resources.core, siblings = incas.routes) =>
      projectFormation(entry, 'Incas', DATA_PATCH, { core, trees: resources.trees }, siblings, incas.source);
    const initial = projectIncas(main);
    expectFallback(initial, main, 'incas-kamayuk-skirmisher-adjustment-third');
    expect(initial.status).toBe('current');

    for (const missing of ['unit', 'tech'] as const) {
      const core = { ...resources.core };
      if (missing === 'unit') {
        core.unitById = { ...core.unitById };
        delete core.unitById[2554];
      } else {
        core.techById = { ...core.techById };
        delete core.techById[517];
      }
      expect(projectIncas(candidate, core).status).toBe('unavailable');
      expectFallback(projectIncas(main, core), main, 'incas-kamayuk-skirmisher-adjustment-third');
      expect(projectIncas(main, core).status).toBe('current');
    }
    expectFallback(
      projectIncas(
        main,
        resources.core,
        incas.routes.filter(({ id }) => id !== candidate.id),
      ),
      main,
      'incas-kamayuk-skirmisher-adjustment-third',
    );
  });

  it('印加主路只条件比较投石手，候选仅记录反弩炮接敌边界', () => {
    const main = route('Incas', 'incas-kamayuk-skirmisher');
    const candidate = route('Incas', 'incas-champi-candidate');

    expect([main.status, main.playtest, main.age, main.composition, main.required.map(({ id }) => id)]).toEqual([
      'approved',
      'unreported',
      3,
      'combined',
      [879, 6],
    ]);
    expect(main.prerequisites).toEqual([]);
    expect(main.limitation).toContain('弓兵单位与枪炮手为弱项');
    expect(main.limitation).toContain('射程 1');
    expect(main.limitation).toContain('不保证阵型能穿过护卫完成接敌');
    expect(main.adjustments[2]!.requires).toEqual([{ kind: 'route', id: candidate.id }]);
    expect(main.adjustments[4]!.requires).toEqual([{ kind: 'unit', id: 185, age: 3 }]);
    expect(main.adjustments[4]!.text).toContain('具体功能缺口');
    expect(main.adjustments[4]!.text).toContain('不因普通步兵自动追加');
    expect(main.alternatives).toContain('不因敌方有普通步兵自动加入');
    expect(main.required.map(({ id }) => id)).not.toContain(185);

    expect([candidate.status, candidate.playtest, candidate.age, candidate.composition]).toEqual(['candidate', 'unreported', 4, 'combined']);
    expect(candidate.required.map(({ id }) => id)).toEqual([2554]);
    expect(candidate.prerequisites.map(({ id }) => id)).toEqual([517]);
    expect(candidate.evidence.playtest).toContain('实战未核实');
    expect(candidate.reason).toContain('维护者已更正印加兵系');
    expect(candidate.reason).not.toContain('“');
    expect(candidate.reason).not.toContain('印加现在不是鹰勇士系了');
    expect(candidate.reason).toContain('+1 近甲、+1 穿甲');
    expect(candidate.reason).toContain('页面列对攻城武器 +3');
    expect(candidate.reason).toContain('不构成实战证明');
    expect(candidate.adjustments.map(({ id }) => id)).toEqual(['incas-champi-candidate-adjustment-third']);
    expect(candidate.adjustments[0]!.text).toContain('弩炮威胁');
    expect(candidate.adjustments[0]!.text).toContain('护卫和撤退');
    expect(candidate.attack).toContain('核对装载条件与路线');
    expect(candidate.attack).toContain('护卫和撤退');
    expect(candidate.limitation).toContain('侧翼接敌、护卫与撤退');
    expect([candidate.reason, candidate.limitation, candidate.attack, candidate.defense, candidate.alternatives].join(' ')).not.toMatch(/枪兵长|掷矛手/);
  });

  it('固定来源字面 URL/行号与 contract 依赖保持同步', () => {
    for (const [id, url] of Object.entries(TEUTON_SOURCE_URLS)) {
      const entry = route('Teutons', id);
      const contract = contractRoute('Teutons', id);
      expect(entry.source.content).toBe(url);
      expect(contract.source.content).toBe(url);
      expect(entry.evidence.sourceLines).toEqual(TEUTON_SOURCE_LINES[id as keyof typeof TEUTON_SOURCE_LINES]);
      expect(contract.sourceLines).toEqual(TEUTON_SOURCE_LINES[id as keyof typeof TEUTON_SOURCE_LINES]);
      expect(contract.adjustments).toEqual(entry.adjustments.map(({ id: adjustmentId, requires }) => ({ id: adjustmentId, requires: requires ?? [] })));
    }
    for (const [id, url] of Object.entries(INCAS_SOURCE_URLS)) {
      const entry = route('Incas', id);
      const contract = contractRoute('Incas', id);
      expect(entry.source.content).toBe(url);
      expect(contract.source.content).toBe(url);
      expect(entry.evidence.sourceLines).toEqual(INCAS_SOURCE_LINES[id as keyof typeof INCAS_SOURCE_LINES]);
      expect(contract.sourceLines).toEqual(INCAS_SOURCE_LINES[id as keyof typeof INCAS_SOURCE_LINES]);
      expect(contract.adjustments).toEqual(entry.adjustments.map(({ id: adjustmentId, requires }) => ({ id: adjustmentId, requires: requires ?? [] })));
    }
  });

  it('unit 185 缺失只回退投石手比较，不改变印加主路可用性', async () => {
    const resources = await catalog();
    const incas = byCiv('Incas');
    const main = route('Incas', 'incas-kamayuk-skirmisher');
    const unitById = { ...resources.core.unitById };
    delete unitById[185];
    const view = projectFormation(main, 'Incas', DATA_PATCH, { core: { ...resources.core, unitById }, trees: resources.trees }, incas.routes, incas.source);
    expectFallback(view, main, 'incas-kamayuk-skirmisher-adjustment-fifth');
    expect(view.status).toBe('current');
  });
});
