import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';

const britons = civFormationContent.find(({ civ }) => civ === 'Britons')!;
const route = britons.routes[0]!;

describe('#1173 不列颠步弓进阶', () => {
  it('核对固定目录的时代、支援实体、原策略来源和证据状态', async () => {
    const catalog = { core: await loadCore(), trees: await loadTrees() };
    expect(britons.routes).toHaveLength(1);
    expect(route).toMatchObject({ age: 2, status: 'approved', playtest: 'unreported', composition: 'progression', presentation: 'age-progression' });
    expect(britons.source.content).toContain('9dd3d907001c32417967a83154fb2de3d7523be0/role/game-strategy.md#L1313-L1352');
    expect(route.evidence).toMatchObject({ scope: '混编胜率未测。', playtest: '未说明实战使用。' });
    const view = projectFormation(route, britons.civ, DATA_PATCH, catalog, britons.routes, britons.source);
    expect(view.status).toBe('current');
    if (view.status !== 'current') return;
    expect(view.required.map(({ entity, age }) => [entity.id, age])).toEqual([
      [4, 2],
      [24, 3],
    ]);
    expect(view.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, entity, age }) => [kind, entity.id, age])])).toEqual([
      ['progression', [['unit', 492, 4]]],
      [
        'support',
        [
          ['unit', 93, 2],
          ['unit', 358, 3],
          ['unit', 359, 4],
        ],
      ],
      [
        'support',
        [
          ['unit', 331, 4],
          ['tech', 461, 4],
        ],
      ],
      ['replace', [['unit', 8, 3]]],
      [
        'support',
        [
          ['building', 79, 2],
          ['tech', 3, 3],
        ],
      ],
      ['conditional-evaluation', [['unit', 280, 3]]],
    ]);
  });

  it('可选劲弩、守线与攻城缺项不使主线不可用，也不单独展示从属科技', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const unitById = { ...core.unitById };
    const buildingById = { ...core.buildingById };
    delete unitById[492];
    delete unitById[331];
    delete buildingById[79];
    const project = (unitCatalog = unitById) =>
      projectFormation(route, britons.civ, DATA_PATCH, { core: { ...core, unitById: unitCatalog, buildingById }, trees }, britons.routes, britons.source);
    const view = project();
    expect(view.status).toBe('current');
    if (view.status !== 'current') return;
    expect(view.required.map(({ entity }) => entity.id)).toEqual([4, 24]);
    expect(view.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([93, 358, 359, 8, 280]);
    delete unitById[4];
    expect(project().status).toBe('unavailable');
    expect(projectFormation(route, britons.civ, { ...DATA_PATCH, build: DATA_PATCH.build + 1 }).status).toBe('historical');
  });
});
