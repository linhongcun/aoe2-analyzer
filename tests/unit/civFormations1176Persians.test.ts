import { describe, expect, it } from 'vitest';
import contract from '../../data/reference/civ-formations-contract.json';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';
import { unitCost } from '../../src/domain/unitCost';

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
    const before = unitCost(bow.entity, persians.civ, bow.age);
    const after = unitCost(bow.entity, persians.civ, bow.age, [catalog.core.techById[488]!]);
    expect(after.appliedTechs.map(({ id }) => id)).toEqual([488]);
    expect(after.undecoded).toEqual([]);
    const prices = { before: before.cost, after: after.cost };
    expect(prices).toEqual({ before: { Wood: 25, Gold: 45 }, after: { Wood: 50, Gold: 0 } });
    expect(bow.research?.trainingPrice).toEqual(prices);
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

  it('价格快照限于核对版本，并校验发布配置', async () => {
    const catalog = await loadCatalog();
    expect(projectFormation(route, persians.civ, { ...DATA_PATCH, build: DATA_PATCH.build + 1 }, catalog).status).toBe('historical');
    const broken = structuredClone(civFormationContent);
    const updated = broken.find(({ civ }) => civ === 'Persians')!.routes[0]!;
    delete updated.required[1]!.research!.trainingPrice;
    expect(formationProblems(broken, contract)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/\/required$/) }));
  });
});
