import { describe, expect, it } from 'vitest';
import contract from '../../data/reference/civ-formations-contract.json';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';

const persians = civFormationContent.find(({ civ }) => civ === 'Persians')!;
const route = persians.routes[0]!;
const loadCatalog = async () => ({ core: await loadCore(), trees: await loadTrees() });
const project = (catalog: Awaited<ReturnType<typeof loadCatalog>>) =>
  projectFormation(route, persians.civ, DATA_PATCH, catalog, persians.routes, persians.source);

describe('#1176 波斯已讨论路线', () => {
  it('单一路线绑定已核对的三种单位、城堡科技和普通战象', async () => {
    const catalog = await loadCatalog();
    const view = project(catalog);
    expect(persians.routes).toHaveLength(1);
    expect([route.age, route.status, route.playtest]).toEqual([4, 'approved', 'unreported']);
    expect(view.status).toBe('current');
    if (view.status !== 'current') return;
    expect(view.required.map(({ entity, age }) => [entity.id, age])).toEqual([
      [1813, 4],
      [24, 3],
      [36, 4],
    ]);
    expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual([488]);
    expect(view.supplements[0]?.entities[0]).toMatchObject({ kind: 'unit', age: 3, entity: { id: 239, b: 82, cost: { Food: 170, Gold: 85 } } });
    const bow = view.required[1];
    expect(bow?.kind).toBe('unit');
    if (bow?.kind !== 'unit') return;
    expect(bow.research?.tech).toMatchObject({ id: 488, zh: '波斯步弓手', age: 3, b: 82, cost: { Food: 400, Gold: 300 }, rt: 40 });
    expect(bow.research?.trainingPrice).toEqual({ before: { Wood: 25, Gold: 45 }, after: { Wood: 50, Gold: 0 } });
  });

  it('研究缺失时不发布免金阵容，缺战象时保留主路', async () => {
    const { core, trees } = await loadCatalog();
    const techById = { ...core.techById };
    delete techById[488];
    expect(project({ core: { ...core, techById }, trees }).status).toBe('unavailable');
    const unitById = { ...core.unitById };
    delete unitById[239];
    const withoutElephant = project({ core: { ...core, unitById }, trees });
    expect(withoutElephant.status).toBe('current');
    if (withoutElephant.status === 'current') expect(withoutElephant.supplements).toEqual([]);
  });

  it('费用效果无法计入时暂停推荐，并校验发布配置', async () => {
    const { core, trees } = await loadCatalog();
    const techById = { ...core.techById, 488: { ...core.techById[488]!, en: 'Missing effect' } };
    expect(project({ core: { ...core, techById }, trees }).status).toBe('unavailable');
    const broken = structuredClone(civFormationContent);
    const updated = broken.find(({ civ }) => civ === 'Persians')!.routes[0]!;
    delete updated.required[1]!.research!.trainingPrice;
    expect(formationProblems(broken, contract)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/required$/) }));
  });
});
