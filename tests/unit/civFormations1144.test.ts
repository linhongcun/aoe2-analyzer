import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';
import { parseUnitPath, simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const civs = ['Wei', 'Shu', 'Wu'];
const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });
type Catalog = Awaited<ReturnType<typeof catalog>>;
const project = (civ: string, resources: Catalog, patch = DATA_PATCH) => {
  const { routes, source } = byCiv(civ);
  return projectFormation(routes[0]!, civ, patch, resources, routes, source);
};

describe('#1144 三国阵容', () => {
  it.each([
    ['Wei', 4, 'combined', [441, 1952], [4, 4], [1062], [], [1954, 359], '1198-L1234'],
    ['Shu', 4, 'progression', [24, 492], [3, 4], [], [], [359, 1942], '1236-L1270'],
    ['Wu', 3, 'choice', [], [], [], [1968, 6], [359, 1942], '1272-L1310'],
  ] as const)(
    '%s 只发布一条条件路线，并按时代解析实体及固定来源',
    async (civ, age, composition, required, ages, prerequisites, choices, supplements, lines) => {
      expect(byCiv(civ).routes).toHaveLength(1);
      const view = project(civ, await catalog());
      expect(view.status).toBe('current');
      if (view.status !== 'current') throw new Error(view.status);
      expect(view.route).toMatchObject({ age, composition, status: 'approved', playtest: 'unreported' });
      expect(view.required.map(({ entity }) => entity.id)).toEqual(required);
      expect(view.required.map(({ age }) => age)).toEqual(ages);
      expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual(prerequisites);
      expect(view.choices.map(({ entities }) => entities[0]?.entity.id)).toEqual(choices);
      expect(view.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual(supplements);
      expect(view.adjustments.every(({ unavailable }) => !unavailable)).toBe(true);
      expect(view.source?.content).toContain(`/a348c548624a41da50735eebf166d23456ff56fa/role/game-strategy.md#L${lines}`);
    },
  );

  it('可选项缺失安全降级，前置或分支缺失不可用，补丁失配是历史而非当前推荐', async () => {
    const { trees, core } = await catalog();
    const unitById = { ...core.unitById };
    delete unitById[1954];
    delete unitById[359];
    const partial = { core: { ...core, unitById }, trees };
    const wei = project('Wei', partial);
    expect(wei.status).toBe('current');
    if (wei.status !== 'current') throw new Error(wei.status);
    expect(wei.supplements).toEqual([]);
    expect(wei.adjustments.filter(({ unavailable }) => unavailable).map(({ id }) => id)).toEqual(['wei-hussar-xianbei-cavalry', 'wei-hussar-xianbei-cao-cao']);
    const techById = { ...core.techById };
    delete techById[1062];
    delete techById[1069];
    const missingTech = { core: { ...core, techById }, trees };
    expect(project('Wei', missingTech).status).toBe('unavailable');
    const shu = project('Shu', missingTech);
    expect(shu.status === 'current' && shu.adjustments.at(-1)).toMatchObject({ unavailable: true, text: '先满足护卫、常用升级与补兵需要。' });
    delete unitById[6];
    expect(project('Wu', partial).status).toBe('unavailable');
    for (const civ of civs) expect(project(civ, partial, { ...DATA_PATCH, build: 1 }).status).toBe('historical');
  });

  it('固定的魏帝王链接只切换明光铠，对照不增加穿甲', () => {
    const output = byCiv('Wei')
      .routes[0]!.evidence.links!.slice(0, 2)
      .map(({ href }) => {
        const { civ, age, ids, team } = parseUnitPath(new URL(href).hash.split('?')[0]!.slice(2));
        const { ma, pa } = simulate(ctx, unit('Hussar'), civ!, age!, new Set(ids), new Set(team));
        expect([civ, age]).toEqual(['Wei', 4]);
        return { ids, armor: [ma, pa] };
      });
    expect(output[1]!.ids).toEqual([1062, ...output[0]!.ids]);
    expect(output.map(({ armor }) => armor)).toEqual([
      [2, 4],
      [6, 4],
    ]);
  });
});
