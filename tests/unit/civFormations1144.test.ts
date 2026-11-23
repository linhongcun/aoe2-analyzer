import { describe, expect, it } from 'vitest';
import { civByEn, loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation } from '../../src/domain/civFormations';
import { parseUnitPath, simulate } from '../../src/domain/simulator';
import { techAvailable } from '../../src/domain/unitAvailability';
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
    ['Wei', 1, 4, 'combined', 'unreported', [441, 1952], [4, 4], [1062], [], [1954, 359, 1946, 1061], '6c3cdc6ded5200eac43e95efb28878066b96c3d9', '1511-L1553'],
    [
      'Shu',
      1,
      4,
      'progression',
      'unreported',
      [24, 492],
      [3, 4],
      [],
      [],
      [359, 1942, 1961, 474, 1966],
      '6c3cdc6ded5200eac43e95efb28878066b96c3d9',
      '1555-L1598',
    ],
    ['Wu', 2, 4, 'choice', 'pending', [], [], [], [492, 6], [1970, 359, 1942], 'bc3c0bc5e50f7e3e7f92ab159d8b8e965f0023b8', '1569-L1618'],
  ] as const)(
    '%s 发布主路线，并按时代解析实体及固定来源',
    async (civ, routeCount, age, composition, playtest, required, ages, prerequisites, choices, supplements, sha, lines) => {
      expect(byCiv(civ).routes).toHaveLength(routeCount);
      const view = project(civ, await catalog());
      expect(view.status).toBe('current');
      if (view.status !== 'current') throw new Error(view.status);
      expect(view.route).toMatchObject({ age, composition, status: 'approved', playtest });
      expect(view.required.map(({ entity }) => entity.id)).toEqual(required);
      expect(view.required.map(({ age }) => age)).toEqual(ages);
      expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual(prerequisites);
      expect(view.choices.map(({ entities }) => entities[0]?.entity.id)).toEqual(choices);
      expect(view.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual(supplements);
      expect(view.adjustments.every(({ unavailable }) => !unavailable)).toBe(true);
      expect(view.source?.content).toContain(`/${sha}/role/game-strategy.md#L${lines}`);
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
    expect(wei.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([1946, 1061]);
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

  it('#1175 卧虎按牵引抛石机的帝王阶段挂在原推进分支', async () => {
    const resources = await catalog();
    const siege = (candidate: Catalog) => {
      const view = project('Wu', candidate);
      if (view.status !== 'current') throw new Error(view.status);
      return view.supplements.find(({ entities }) => entities.some(({ entity }) => entity.id === 1942));
    };
    const support = siege(resources);
    expect(support?.condition).toBe('有明确推进目标且能安排护卫时');
    expect(support?.entities).toHaveLength(1);
    const row = support?.entities[0];
    if (row?.kind !== 'unit') throw new Error('缺少牵引抛石机');
    expect(row).toMatchObject({
      age: 4,
      entity: { id: 1942 },
      research: {
        tech: { id: 1081, zh: '卧虎', age: 4, b: 82, bz: '城堡', cost: { Wood: 600, Gold: 300 }, rt: 40, civs: ['Wu'] },
        optional: true,
        effect: '牵引抛石机和楼船的巨型投石机武器可发射额外炮弹。',
        caveat: '固定数据记录为牵引抛石机与楼船弹丸数 +2；战斗模拟尚未计入多弹丸伤害，实战拆防效率待验证。',
      },
    });
    const route = byCiv('Wu').routes[0]!;
    expect(route.age).toBe(4);
    expect(route.alternatives).toContain('赤壁战术强化火焰伤害，但未证实能替代牵引抛石机拆城堡');

    const techById = { ...resources.core.techById };
    delete techById[1081];
    const missingTech = siege({ ...resources, core: { ...resources.core, techById } });
    expect(missingTech?.entities).toHaveLength(1);
    expect(missingTech?.entities[0]).toMatchObject({ entity: { id: 1942 } });
    expect(missingTech?.entities[0]).not.toHaveProperty('research');

    const unitById = { ...resources.core.unitById };
    delete unitById[1942];
    expect(siege({ ...resources, core: { ...resources.core, unitById } })).toBeUndefined();
  });

  it('#1267 蜀的白毦面板区分普通、精锐与可用近战科技', async () => {
    const resources = await catalog();
    const view = project('Shu', resources);
    if (view.status !== 'current') throw new Error(view.status);

    const available = [67, 68, 75].filter((id) => techAvailable(resources, 'Shu', id, 4));
    expect(available).toEqual([67]);
    expect(techAvailable(resources, 'Shu', 435, 4)).toBe(false);
    const normal = resources.core.unitById[1959]!;
    const elite = resources.core.unitById[1961]!;
    expect([normal.atk, elite.atk, simulate(ctx, elite, 'Shu', 4, new Set(available), new Set()).atk]).toEqual([7, 8, 9]);
    expect(view.route.limitation).toContain('马厩缺血统，另限制轻型骑兵与黑光铠骑兵的生命上限');
    expect(view.route.alternatives).toContain('普通白毦兵基础 7 攻，精锐基础 8 攻，蜀帝王满科技为 9 攻（锻造 +1）');
    expect(view.route.alternatives).toContain('按减速、反骑和盘蛇阵就近扛线的职责评估');
  });

  it('#1177 条件分支按对象的实际可用性分别投影，保留魏的主轴', async () => {
    const resources = await catalog();
    const { core } = resources;
    expect(civByEn('Wei')?.bon).toContain('牵引抛石机和楼船费用 -25%');
    expect([core.unitById[1944]?.cost.Gold, core.unitById[1952]?.cost.Gold]).toEqual([65, 35]);
    const verify = (missing: number[], ages?: { unit: number; age: number }) => {
      const unitById = { ...core.unitById };
      for (const id of missing) delete unitById[id];
      if (ages) unitById[ages.unit] = { ...unitById[ages.unit]!, age: ages.age };
      const view = project('Wei', { ...resources, core: { ...core, unitById } });
      if (view.status !== 'current') throw new Error(view.status);
      expect(view.required.map(({ entity }) => entity.id)).toEqual([441, 1952]);
      expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual([1062]);
      expect(view.supplements[0]?.condition).toBe('军队成形且资源允许时');
      return view.conditionBranches;
    };
    const blackLight = 'wei-retain-black-light-cavalry';
    const siege = 'wei-siege-when-pushing-buildings';
    const branches = verify([]);
    expect(branches?.map(({ id, requires, evidence }) => [id, requires, evidence])).toEqual([
      [blackLight, [{ kind: 'unit', id: 1944, age: 3 }], '未做混编或实战验证。'],
      [siege, [{ kind: 'unit', id: 1942, age: 4 }], '未做混编或实战验证。'],
    ]);
    expect(branches?.[1]?.context.text).toBe('魏的牵引抛石机费用 −25%。');
    expect(verify([1946])?.map(({ id }) => id)).toEqual([blackLight, siege]);
    expect(verify([1944])?.map(({ id }) => id)).toEqual([siege]);
    expect(verify([], { unit: 1944, age: 4 })?.map(({ id }) => id)).toEqual([siege]);
    expect(verify([1942])?.map(({ id }) => id)).toEqual([blackLight]);
    expect(verify([1942, 1944])).toBeUndefined();
    expect(project('Wei', resources, { ...DATA_PATCH, build: DATA_PATCH.build + 1 })).not.toHaveProperty('conditionBranches');
  });

  it('固定的魏帝王链接只切换明光铠，对照不增加穿甲', () => {
    const output = byCiv('Wei')
      .routes[0]!.evidence.links!.slice(0, 2)
      .map(({ href }) => {
        const config = parseUnitPath(new URL(href).hash.split('?')[0]!.slice(2));
        if (!config?.civ || !config.age) throw new Error(`未找到固定模拟配置：${href}`);
        const { civ, age, ids, team } = config;
        const { ma, pa } = simulate(ctx, unit('Hussar'), civ, age, new Set(ids), new Set(team));
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
