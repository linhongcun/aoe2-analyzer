import { describe, expect, it } from 'vitest';
import contract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { DAT } from '../../src/domain/datEffects';
import { techAvailable, unitAvailable } from '../../src/domain/unitAvailability';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { assertDefinedProperties } from './civFormationsTestUtils';

const urls = {
  'hindustani-handcannon-hussar': 'https://github.com/linhongcun/aoe2-analyzer/blob/6c3cdc6ded5200eac43e95efb28878066b96c3d9/role/game-strategy.md#L243-L289',
  'turks-hussar-handcannon': 'https://github.com/linhongcun/aoe2-analyzer/blob/6c3cdc6ded5200eac43e95efb28878066b96c3d9/role/game-strategy.md#L329-L368',
  'turks-existing-line-choice': 'https://github.com/linhongcun/aoe2-analyzer/blob/6c3cdc6ded5200eac43e95efb28878066b96c3d9/role/game-strategy.md#L361-L366',
  'malay-battle-elephant-progression': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L355',
  'malay-two-handed-swordsman-sustain': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L356',
} as const;
const lines = {
  'hindustani-handcannon-hussar': [243, 247, 251, 252, 253, 259, 275, 276, 277, 284, 285, 287, 289],
  'turks-hussar-handcannon': [329, 333, 337, 338, 339, 341, 343, 351, 352, 353, 354, 355, 363, 364, 366, 368],
  'turks-existing-line-choice': [361, 362, 366],
  'malay-battle-elephant-progression': [355, 356, 357],
  'malay-two-handed-swordsman-sustain': [355, 356, 357],
} as const;
const civ = (name: string) => civFormationContent.find((entry) => entry.civ === name)!;
const route = (name: string, id: string) => {
  const formation = civ(name).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = (name: string, id: string) => contract.civs.find((entry) => entry.civ === name)!.routes.find((entry) => entry.id === id)!;
const makeCatalog = async () => ({ core: await loadCore(), trees: await loadTrees() });
const project = (entry: ReturnType<typeof route>, name: string, core: Awaited<ReturnType<typeof loadCore>>, trees: Awaited<ReturnType<typeof loadTrees>>) =>
  projectFormation(entry, name, DATA_PATCH, { core, trees }, civ(name).routes, civ(name).source);

const expectFallback = (view: ReturnType<typeof projectFormation>, id: string, text: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  expect(view.adjustments.find((adjustment) => adjustment.id === id)).toMatchObject({ unavailable: true, text });
};

describe('#1174 印度火铳', () => {
  const name = 'Hindustanis';
  const id = 'hindustani-handcannon-hussar';
  const entry = route(name, id);

  it('以固定资料核对研究后射程、研究投入及原阵容', async () => {
    const { core, trees } = await makeCatalog();
    const view = project(entry, name, core, trees);
    expect(view.status).toBe('current');
    if (view.status !== 'current') return;

    expect(civ(name).routes.map((row) => row.id)).toEqual([id, 'hindustani-camel-ghulam-field']);
    expect(view.required.map(({ entity }) => entity.id)).toEqual([5, 441, 36]);
    expect(view.prerequisites).toEqual([]);
    expect(view.supplements[0]?.entities.map(({ entity }) => entity.id)).toEqual([207]);
    const handCannon = view.required[0];
    expect(handCannon?.kind).toBe('unit');
    if (handCannon?.kind !== 'unit') return;
    const tech = handCannon.research?.tech;
    const range = DAT.techs.Shatagni?.rules.find(({ t }) => t.includes(5))?.fx.find(({ s }) => s === 'rng')?.v;
    expect([handCannon.entity.rng, range]).toEqual([7, 2]);
    expect(handCannon.research?.effect).toContain(`基础射程 ${handCannon.entity.rng}，完成印度火铳研究后 ${handCannon.entity.rng + range!}（+${range}）`);
    expect(tech).toMatchObject({ id: 507, age: 4, b: 82, bz: '城堡', type: 'UniqueTech', cost: { Food: 500, Gold: 650 }, rt: 40 });
    expect(contractRoute(name, id).required[0]).toEqual({ kind: 'unit', id: 5, research: 507 });
  });

  it('科技缺失、文明不符或时代不符时照常推荐原单位', async () => {
    const { core, trees } = await makeCatalog();
    const techs = { ...core.techById };
    delete techs[507];
    const tech = core.techById[507]!;
    for (const techById of [techs, { ...techs, 507: { ...tech, civs: ['Turks'] } }, { ...techs, 507: { ...tech, age: 5 } }]) {
      const view = project(entry, name, { ...core, techById }, trees);
      expect(view.status).toBe('current');
      if (view.status !== 'current') continue;
      expect(view.required.map(({ entity }) => entity.id)).toEqual([5, 441, 36]);
      expect(view.required[0]).not.toHaveProperty('research');
    }
  });

  it('契约拒绝把科技换到另一实体或另一 ID', () => {
    const altered = structuredClone(civFormationContent);
    const subject = altered.find(({ civ }) => civ === name)!.routes[0]!.required;
    subject[0]!.research!.tech = 47;
    expect(formationProblems(altered, contract)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/required$/) }));
    subject[1]!.research = subject[0]!.research;
    delete subject[0]!.research;
    expect(formationProblems(altered, contract)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/required$/) }));
  });
});

describe('#1139 Hindustanis, Turks, Malay optional dependencies', () => {
  it('#1267 印度斯坦保留条件帝王骆驼，古拉姆只供有城堡产能时评估', async () => {
    const name = 'Hindustanis';
    const { core, trees } = await makeCatalog();
    const entry = route(name, 'hindustani-handcannon-hussar');
    const view = project(entry, name, core, trees);
    if (view.status !== 'current') throw new Error(view.status);
    expect(unitAvailable({ core, trees }, name, 359, 4)).toBe(false);
    expect(techAvailable({ core, trees }, name, 77, 4)).toBe(false);
    expect(view.route.limitation).toContain('兵营缺长戟兵，铁匠铺缺步兵钢甲');
    expect(view.adjustments[0]?.text).toContain('黄金与升级投入可承受时，评估用帝王骆驼兵承担反骑');
    const ghulam = view.supplements.find(({ entities }) => entities.some(({ entity }) => entity.id === 1747));
    expect(ghulam?.condition).toContain('已有城堡产能、能负担升级且能接近弓群');
    expect(ghulam?.entities.map(({ entity, age }) => [entity.id, age])).toEqual([
      [1747, 3],
      [1749, 4],
    ]);
    expect(view.required.map(({ entity }) => entity.id)).toEqual([5, 441, 36]);
  });

  it('#1267 土耳其的掷矛上限和对手的长戟护卫分开', async () => {
    const name = 'Turks';
    const resources = await makeCatalog();
    const entry = route(name, 'turks-hussar-handcannon');
    expect(unitAvailable(resources, name, 7, 2)).toBe(true);
    expect([6, 358, 359].map((id) => unitAvailable(resources, name, id, 4))).toEqual([false, false, false]);
    expect(entry.limitation).toContain('己方靶场可训练封建掷矛手，缺精锐掷矛手升级');
    expect(entry.adjustments.find(({ when }) => when === '长戟＋弓手或掷矛')?.text).toContain('火枪先清长戟');
    expect(entry.adjustments.find(({ when }) => when === '强弓成群')?.text).toContain('敌方护卫和已有投入');
  });

  it('#1267 马来爪刀形态共用半人口与有金条件，免金双手剑士仍需强征兵役', async () => {
    const name = 'Malay';
    const { core, trees } = await makeCatalog();
    const entry = route(name, 'malay-battle-elephant-progression');
    const view = project(entry, name, core, trees);
    if (view.status !== 'current') throw new Error(view.status);
    const karambit = view.supplements.find(({ entities }) => entities.some(({ entity }) => entity.id === 1123));
    expect(karambit?.condition).toContain('人口紧张但仍有黄金和城堡产能');
    expect(karambit?.condition).toContain('半个人口，每名需 25 食物、15 黄金');
    expect(karambit?.entities.map(({ entity, age }) => [entity.id, age])).toEqual([
      [1123, 3],
      [1125, 4],
    ]);
    for (const id of [1123, 1125]) {
      expect(core.unitById[id]?.cost).toEqual({ Food: 25, Gold: 15 });
      expect(core.unitById[id]?.desc).toContain('只占用半个人口');
    }
    expect(view.required.map(({ entity }) => entity.id)).toEqual([1132, 1134]);
    expect(view.route.limitation).toContain('长戟等反骑护卫阻断接近时，先停推');
    const swords = route(name, 'malay-two-handed-swordsman-sustain');
    expect(swords.condition).toContain('黄金不足并完成强征兵役');
    expect(swords.prerequisites.map(({ id }) => id)).toEqual([625]);
  });

  it('保留路线身份、choice 与固定来源字面值', () => {
    for (const [name, id, sourceLines] of [
      ['Hindustanis', 'hindustani-handcannon-hussar', lines['hindustani-handcannon-hussar']],
      ['Turks', 'turks-hussar-handcannon', lines['turks-hussar-handcannon']],
      ['Turks', 'turks-existing-line-choice', lines['turks-existing-line-choice']],
      ['Malay', 'malay-battle-elephant-progression', lines['malay-battle-elephant-progression']],
      ['Malay', 'malay-two-handed-swordsman-sustain', lines['malay-two-handed-swordsman-sustain']],
    ] as const) {
      const entry = route(name, id);
      const row = contractRoute(name, id);
      expect(entry.source.content).toBe(urls[id]);
      expect(entry.evidence.sourceLines).toEqual(sourceLines);
      expect(row.source.content).toBe(urls[id]);
      expect(row.sourceLines).toEqual(sourceLines);
      expect([entry.status, entry.playtest, entry.age, entry.composition]).toEqual([row.status, row.playtest, row.age, row.composition]);
    }
    expect(route('Turks', 'turks-existing-line-choice').composition).toBe('choice');
    expect(route('Turks', 'turks-existing-line-choice').required).toEqual([]);
    expect(route('Malay', 'malay-two-handed-swordsman-sustain').prerequisites).toMatchObject([
      { kind: 'tech', id: 625, condition: '帝王后期/消耗局且黄金不足，研究须完成' },
    ]);
    expect(route('Malay', 'malay-battle-elephant-progression').required.map(({ id }) => id)).toEqual([1132, 1134]);
    expect(route('Hindustanis', 'hindustani-handcannon-hussar').supplements[0]!.entities[0]).toMatchObject({ kind: 'unit', id: 207, age: 4 });
    expect(contractRoute('Hindustanis', 'hindustani-handcannon-hussar').supplements[0]!.entities).toEqual([{ kind: 'unit', id: 207, age: 4 }]);
    expect(route('Malay', 'malay-battle-elephant-progression').supplements[0]!.entities[0]).toMatchObject({ kind: 'unit', id: 24, age: 3 });
    expect(contractRoute('Malay', 'malay-battle-elephant-progression').supplements[0]!.entities).toEqual([{ kind: 'unit', id: 24, age: 3 }]);
  });

  it('Hindustani 207 与 Turks 330 缺失时只降级条件建议，主路仍 current', async () => {
    const { core, trees } = await makeCatalog();
    const no207 = { ...core, unitById: { ...core.unitById } };
    delete no207.unitById[207];
    const hindustani = route('Hindustanis', 'hindustani-handcannon-hussar');
    const hindustaniView = project(hindustani, 'Hindustanis', no207, trees);
    expectFallback(hindustaniView, 'hindustani-handcannon-hussar-adjustment-first', hindustani.adjustments[0]!.fallback!);
    expect(hindustaniView.status === 'current' && hindustaniView.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 207))).toBe(
      false,
    );
    expect(hindustani.reason).toContain('两条生产线的农田需求');
    expect(hindustani.reason).toContain('火炮消耗木金');
    expect(hindustani.reason).toContain('训练资源差额不能代替战力与成型时间比较');
    expect(hindustani.reason).not.toContain('帝王骆驼兵');

    const no330 = { ...core, unitById: { ...core.unitById } };
    delete no330.unitById[330];
    const turks = route('Turks', 'turks-hussar-handcannon');
    const view = project(turks, 'Turks', no330, trees);
    expectFallback(view, 'turks-hussar-handcannon-adjustment-first', turks.adjustments[0]!.fallback!);
    const choice = project(route('Turks', 'turks-existing-line-choice'), 'Turks', core, trees);
    expect(choice.status).toBe('current');
    expect(turks.alternatives).not.toContain('优先考虑重装骆驼');
    expect([turks.reason, turks.limitation, turks.attack, turks.defense, ...turks.required.map(({ role }) => role)].join(' ')).not.toMatch(/14射程|100生命/);
    expect(turks.evidence.recordedVersion).toContain('84988dd');
    expect(turks.limitation).toContain('目前攻城工具仅核验无甲城堡');
    expect(turks.limitation).toContain('城镇中心、瞭望箭塔、石墙、城门及带石匠或建筑学配置仍待核实');
  });

  it('Malay 弩手与攻城技师条件局部隐藏，保留两条劲弩条件组', async () => {
    const { core, trees } = await makeCatalog();
    const elephant = route('Malay', 'malay-battle-elephant-progression');
    const no24 = { ...core, unitById: { ...core.unitById } };
    delete no24.unitById[24];
    const crossbowView = project(elephant, 'Malay', no24, trees);
    expectFallback(crossbowView, 'malay-battle-elephant-progression-adjustment-first', elephant.adjustments[0]!.fallback!);
    expect(crossbowView.status).toBe('current');
    expect(crossbowView.status === 'current' && crossbowView.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 24))).toBe(false);
    expect(elephant.reason).toContain('不固定象兵＋弩手组合');
    expect(elephant.reason).not.toContain('枪兵压力下作条件支援');
    expect(elephant.reason).not.toContain('弩手可');
    expect(crossbowView.status === 'current' && crossbowView.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 492))).toBe(true);

    const no377 = { ...core, techById: { ...core.techById } };
    delete no377.techById[377];
    const siegeView = project(elephant, 'Malay', no377, trees);
    expect(siegeView.status).toBe('current');
    expect(siegeView.status === 'current' && siegeView.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 377))).toBe(false);
    const techSupport = elephant.supplements.find(({ mode }) => mode === 'mechanism-support')!;
    expect(techSupport.condition).toContain('完成攻城技师研究后才生效');
    expect(techSupport.condition).toContain('不是手推炮训练前置');
    expect(techSupport.entities[0]).toMatchObject({ kind: 'tech', id: 377, age: 4 });

    for (const id of [359, 36, 492]) {
      const reduced = { ...core, unitById: { ...core.unitById } };
      delete reduced.unitById[id];
      for (const [name, routeId] of [
        ['Malay', 'malay-battle-elephant-progression'],
        ['Malay', 'malay-two-handed-swordsman-sustain'],
      ] as const) {
        const view = project(route(name, routeId), name, reduced, trees);
        expect(view.status).toBe('current');
        expect(view.status === 'current' && view.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === id))).toBe(false);
      }
    }
    expect(route('Malay', 'malay-battle-elephant-progression').supplements.some(({ entities }) => entities.some(({ id }) => id === 492))).toBe(true);
    expect(route('Malay', 'malay-two-handed-swordsman-sustain').supplements.some(({ entities }) => entities.some(({ id }) => id === 492))).toBe(true);
  });
});
