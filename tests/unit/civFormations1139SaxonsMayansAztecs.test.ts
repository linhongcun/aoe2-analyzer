import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties } from './civFormationsTestUtils';

const SOURCE_URLS = {
  'saxons-retainer-tower': 'https://github.com/linhongcun/aoe2-analyzer/blob/bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8/role/game-strategy.md#L683-L746',
  'mayans-plumed-archer-halberdier':
    'https://github.com/linhongcun/aoe2-analyzer/blob/bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8/role/game-strategy.md#L1192-L1230',
  'aztecs-eagle-skirmisher': 'https://github.com/linhongcun/aoe2-analyzer/blob/bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8/role/game-strategy.md#L1111-L1153',
} as const;
const SOURCE_LINES = {
  'saxons-retainer-tower': [683, 700, 704, 705, 706, 708, 710, 712, 714, 716, 724, 725, 726, 727, 728, 734, 735, 736, 737, 738, 739, 740, 741, 743, 745, 746],
  'mayans-plumed-archer-halberdier': [1192, 1204, 1208, 1209, 1210, 1212, 1214, 1220, 1221, 1222, 1228, 1230],
  'aztecs-eagle-skirmisher': [1111, 1115, 1132, 1134, 1140, 1143, 1144, 1150, 1153],
} as const;

const byCiv = (name: string) => civFormationContent.find(({ civ }) => civ === name)!;
const route = (name: string, id: string) => {
  const formation = byCiv(name).routes.find(({ id: routeId }) => routeId === id)!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = (name: string, id: string) => formationContract.civs.find(({ civ }) => civ === name)!.routes.find(({ id: routeId }) => routeId === id)!;
const removeUnit = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const unitById = { ...core.unitById };
  delete unitById[id];
  return { ...core, unitById };
};
const removeTech = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const techById = { ...core.techById };
  delete techById[id];
  return { ...core, techById };
};
const removeBuilding = (core: Awaited<ReturnType<typeof loadCore>>, id: number) => {
  const buildingById = { ...core.buildingById };
  delete buildingById[id];
  return { ...core, buildingById };
};
const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof route>, adjustmentId: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  const adjustment = entry.adjustments.find(({ id }) => id === adjustmentId)!;
  expect(view.adjustments.find(({ id }) => id === adjustmentId)).toMatchObject({
    unavailable: true,
    text: adjustment.fallback,
  });
};

describe('#1139 Saxons, Mayans, and Aztecs', () => {
  it('保留路线字段、可点支援、contract 与固定来源字面值', () => {
    for (const [civ, id] of [
      ['Saxons', 'saxons-retainer-tower'],
      ['Mayans', 'mayans-plumed-archer-halberdier'],
      ['Aztecs', 'aztecs-eagle-skirmisher'],
    ] as const) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.source.content).toBe(SOURCE_URLS[id]);
      expect(entry.evidence.sourceLines).toEqual(SOURCE_LINES[id]);
      expect(contract.source.content).toBe(SOURCE_URLS[id]);
      expect(contract.sourceLines).toEqual(SOURCE_LINES[id]);
      expect([entry.status, entry.playtest, entry.composition, entry.age]).toEqual([contract.status, contract.playtest, contract.composition, contract.age]);
      expect(entry.required.map(({ kind, id: entityId }) => [kind, entityId])).toEqual(contract.required.map(({ kind, id: entityId }) => [kind, entityId]));
      expect(entry.prerequisites).toEqual(contract.prerequisites);
      expect(entry.adjustments.map(({ id: adjustmentId, requires = [] }) => ({ id: adjustmentId, requires }))).toEqual(contract.adjustments);
    }

    const saxons = route('Saxons', 'saxons-retainer-tower');
    expect([saxons.status, saxons.playtest, saxons.age, saxons.required.map(({ id }) => id)]).toEqual(['approved', 'pending', 4, [235, 2706, 331]]);
    expect(saxons.attack).toContain('利用前线已有塔作支点');
    expect(saxons.attack).toContain('巨投在塔后拆防御');
    expect(saxons.attack).not.toContain('村民在前线建塔');
    const mayans = route('Mayans', 'mayans-plumed-archer-halberdier');
    expect([mayans.status, mayans.playtest, mayans.age, mayans.required.map(({ id }) => id)]).toEqual(['approved', 'unreported', 4, [763, 359]]);
    expect(mayans.supplements.find(({ entities }) => entities.some(({ id }) => id === 753))).toMatchObject({ mode: 'conditional' });
    expect(mayans.supplements.find(({ entities }) => entities.some(({ id }) => id === 331))).toMatchObject({ mode: 'as-needed' });
    const aztecs = route('Aztecs', 'aztecs-eagle-skirmisher');
    expect([aztecs.status, aztecs.playtest, aztecs.age, aztecs.required.map(({ id }) => id)]).toEqual(['candidate', 'unreported', 3, [753, 6]]);
    expect(aztecs.reason).not.toContain('一、最简组合');
    expect(aztecs.evidence.scope).not.toContain('固定策略记录来源行');
    expect(aztecs.defense).toContain('重骑兵或冠军剑士');
  });

  it('Saxon optional units and completed technologies fail locally without changing the tower route', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const saxons = byCiv('Saxons');
    const tower = route('Saxons', 'saxons-retainer-tower');
    const project = (core = resources.core) => projectFormation(tower, 'Saxons', DATA_PATCH, { core, trees: resources.trees }, saxons.routes, saxons.source);

    const candidates = [441, 2704];
    for (const missing of [[], [441], [2704], candidates]) {
      const view = project(missing.reduce(removeUnit, resources.core));
      expect(view.status).toBe('current');
      if (view.status !== 'current') continue;
      expect(view.required.map(({ entity }) => entity.id)).toEqual([235, 2706, 331]);
      expect(view.supplements.map(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual(
        candidates.filter((id) => !missing.includes(id)).map((id) => [id]),
      );
      const { reason, limitation, attack, defense, alternatives, evidence } = view.route;
      const visibleCopy = JSON.stringify({ reason, limitation, attack, defense, alternatives, evidence, adjustments: view.adjustments });
      for (const id of missing) expect(visibleCopy).not.toContain(resources.core.unitById[id]!.zh);
    }
    expect(resources.core.unitById[441]!.cost).toEqual({ Food: 80 });
    expect(resources.core.unitById[2704]!.cost).toEqual({ Food: 65, Gold: 45 });
    expect(resources.core.unitById[2706]!.cost).toEqual({ Wood: 80, Gold: 35 });

    for (const adjustmentId of ['saxons-retainer-tower-adjustment-second', 'saxons-retainer-tower-adjustment-third']) {
      expectFallback(project(removeUnit(resources.core, 359)), tower, adjustmentId);
    }
    for (const adjustmentId of ['saxons-retainer-tower-adjustment-sixth', 'saxons-retainer-tower-adjustment-tenth']) {
      expectFallback(project(removeUnit(resources.core, 83)), tower, adjustmentId);
    }
    expectFallback(project(removeBuilding(resources.core, 82)), tower, 'saxons-retainer-tower-adjustment-tenth');
    expectFallback(project(removeUnit(resources.core, 567)), tower, 'saxons-retainer-tower-adjustment-seventh');
    expectFallback(project(removeUnit(resources.core, 125)), tower, 'saxons-retainer-tower-adjustment-eighth');
    const noMonk = project(removeUnit(resources.core, 125));
    expectFallback(noMonk, tower, 'saxons-retainer-tower-adjustment-ninth');
    expect(tower.adjustments[8]!.fallback).toContain('不据此声称僧侣可用');
    const noClericalRecruitment = project(removeTech(resources.core, 1491));
    expectFallback(noClericalRecruitment, tower, 'saxons-retainer-tower-adjustment-ninth');
    if (noClericalRecruitment.status === 'current') {
      expect(noClericalRecruitment.adjustments.find(({ id }) => id === 'saxons-retainer-tower-adjustment-eighth')?.unavailable).not.toBe(true);
    }

    expect(tower.adjustments[1]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(tower.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(tower.adjustments[5]!.requires).toEqual([{ kind: 'unit', id: 83, age: 4 }]);
    expect(tower.adjustments[6]!.requires).toEqual([{ kind: 'unit', id: 567, age: 4 }]);
    expect(tower.adjustments[7]!.requires).toEqual([{ kind: 'unit', id: 125, age: 4 }]);
    expect(tower.adjustments[8]!.requires).toEqual([
      { kind: 'unit', id: 125, age: 4 },
      { kind: 'tech', id: 1491, age: 3 },
    ]);
    expect(tower.adjustments[9]!.requires).toEqual([
      { kind: 'building', id: 82, age: 4 },
      { kind: 'unit', id: 83, age: 4 },
    ]);
    expect(tower.adjustments[9]!.when).toBe('现有城堡产能不足且确需扩产');
    expect(tower.alternatives).toContain('长戟兵固定主力：不列为常驻主力');
    expect(tower.alternatives).not.toContain('只按骑兵压力补');
    expect([resources.core.techById[1491]!.en, resources.core.techById[1491]!.zh, resources.core.techById[1491]!.age]).toEqual([
      'Clerical Recruitment',
      '神职人员招募',
      3,
    ]);
    expect(tower.adjustments[8]!.text).toContain(resources.core.techById[1491]!.desc);
    expect(resources.core.techById[1464]!.zh).toBe('盾墙');
    expect(tower.adjustments.some(({ requires = [] }) => requires.some(({ id }) => id === 1464))).toBe(false);
    expect(tower.attack).not.toContain('村民在前线建塔');
    expect(tower.defense).not.toContain('按压力补长戟');
    expect(tower.alternatives).not.toContain('低成本成群步兵时仍可比较');
    expect(tower.alternatives).toContain('确需低成本成群步兵时见下方调整');
    expect(tower.limitation).toContain('原零自选科技条件下，5 个精锐扈从显示 2+4=6 箭');
    expect(tower.limitation).toContain('含射箭槽时为 4/6 箭');
    expect(tower.limitation).toContain('伤害及胜率超出预览范围');
    expect(tower.limitation).toContain('80 木、35 金、零食物，未计控制城镇中心或城堡所带来的步兵折扣');
    expect(tower.limitation).toContain('未完整模拟投枪充能');
    expect(tower.limitation).toContain('不会加倍驻军增箭');
    expect(tower.limitation).toContain('最多 20%；箭塔不计');
    expect(tower.limitation).toContain('盾墙对成群步兵的防护只作定性说明');
    expect(tower.limitation).toContain('不能以单兵机制推断混编胜负');
  });

  it('Mayan Eagle, Elite Skirmisher, and Trebuchet remain independent optional branches', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const mayans = byCiv('Mayans');
    const formation = route('Mayans', 'mayans-plumed-archer-halberdier');
    const project = (core = resources.core) =>
      projectFormation(formation, 'Mayans', DATA_PATCH, { core, trees: resources.trees }, mayans.routes, mayans.source);

    expect(formation.adjustments[0]!.requires).toEqual([{ kind: 'unit', id: 753, age: 4 }]);
    expect(formation.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 6, age: 4 }]);
    const noEagle = project(removeUnit(resources.core, 753));
    expectFallback(noEagle, formation, 'mayans-plumed-archer-halberdier-adjustment-first');
    if (noEagle.status === 'current') {
      expect(noEagle.supplements.flatMap(({ entities }) => entities).some(({ entity }) => entity.id === 753)).toBe(false);
      expect(noEagle.adjustments.find(({ id }) => id === 'mayans-plumed-archer-halberdier-adjustment-third')?.unavailable).not.toBe(true);
    }
    const noSkirmisher = project(removeUnit(resources.core, 6));
    expectFallback(noSkirmisher, formation, 'mayans-plumed-archer-halberdier-adjustment-third');
    if (noSkirmisher.status === 'current') {
      expect(noSkirmisher.adjustments.find(({ id }) => id === 'mayans-plumed-archer-halberdier-adjustment-first')?.unavailable).not.toBe(true);
    }
    const noTrebuchet = project(removeUnit(resources.core, 331));
    expect(noTrebuchet.status).toBe('current');
    if (noTrebuchet.status === 'current') {
      expect(noTrebuchet.supplements.flatMap(({ entities }) => entities).some(({ entity }) => entity.id === 331)).toBe(false);
      expect(noTrebuchet.supplements.flatMap(({ entities }) => entities).some(({ entity }) => entity.id === 753)).toBe(true);
    }

    expect(formation.reason).toContain('鹰勇士不取代整条主路');
    expect(formation.reason).not.toContain('鹰勇士是可选的袭扰');
    expect(formation.limitation).not.toContain('鹰勇士');
    expect(formation.attack).not.toContain('鹰勇士');
    expect(formation.alternatives).toContain('原记录只将其列为特定反弓需求候选');
    expect(formation.alternatives).toContain('不表示已认可为完整阵容或已实战核实');
    expect(formation.evidence.sourceLines).toContain(1204);
  });
});
