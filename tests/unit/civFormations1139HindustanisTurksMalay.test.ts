import { describe, expect, it } from 'vitest';
import contract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { DAT } from '../../src/domain/datEffects';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { assertDefinedProperties } from './civFormationsTestUtils';

const urls = {
  'hindustani-handcannon-hussar': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L238',
  'turks-hussar-handcannon': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L248',
  'turks-existing-line-choice': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L273',
  'malay-battle-elephant-progression': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L355',
  'malay-two-handed-swordsman-sustain': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L356',
} as const;
const lines = {
  'hindustani-handcannon-hussar': [238, 240, 242],
  'turks-hussar-handcannon': [248, 250, 252, 253, 254, 256, 258, 264, 265, 266, 267, 275, 277],
  'turks-existing-line-choice': [273, 274, 277],
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

    expect(civ(name).routes.map((row) => row.id)).toEqual([id]);
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
    expect(turks.limitation).toContain('石质建筑数据仍待核实');
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
