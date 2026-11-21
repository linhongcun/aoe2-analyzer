import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { DAT } from '../../src/domain/datEffects';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { assertDefinedProperties, optionalEntityAge } from './civFormationsTestUtils';

const VIETNAMESE_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/2273171e5424e99ba556f5b77819acef56aa06f5/role/game-strategy.md#L774-L822';
const MUISCA_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L984';
const VIETNAMESE_SOURCE_LINES = [774, 784, 788, 796, 800, 804, 805, 808, 810, 816, 817, 818, 820, 822];
const MUISCA_SOURCE_LINES = [984, 988, 990, 992, 993, 995, 997, 1003, 1004, 1005, 1011, 1012, 1014];

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;

const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof route>, id: string) => {
  const config = entry.adjustments.find((adjustment) => adjustment.id === id)!;
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  expect(view.adjustments.find((adjustment) => adjustment.id === id)).toMatchObject({
    id,
    when: config.when,
    text: config.fallback,
    unavailable: true,
  });
};

const project = (civ: string, entry: ReturnType<typeof route>, core: Awaited<ReturnType<typeof loadCore>>, trees: Awaited<ReturnType<typeof loadTrees>>) =>
  projectFormation(entry, civ, DATA_PATCH, { core, trees }, byCiv(civ).routes, byCiv(civ).source);

describe('#1139 越南与穆伊斯卡条件支援边界', () => {
  it('保留越南主路，将弓手对位设为择一并逐项标注接触模型', () => {
    const vietnamese = route('Vietnamese', 'vietnamese-defensive-tower');
    const contract = contractRoute('Vietnamese', vietnamese.id);

    expect([vietnamese.status, vietnamese.playtest, vietnamese.age, vietnamese.composition]).toEqual(['approved', 'unreported', 4, 'combined']);
    expect(vietnamese.required.map(({ id }) => id)).toEqual([235, 1903, 546]);
    expect(vietnamese.prerequisites).toEqual([]);
    expect(vietnamese.condition).toContain('不作为主力');
    expect(vietnamese.condition).toContain('仅守家或资源点');
    const archerChoice = vietnamese.supplements.find(({ mode }) => mode === 'choice')!;
    expect(archerChoice.condition).toContain('弓手压力');
    expect(archerChoice.condition).toContain('择一');
    expect(archerChoice.condition).toContain('不同时作为固定主力');
    expect(archerChoice.entities.map(({ id, age }) => [id, age])).toEqual([
      [1131, 4],
      [1155, 4],
    ]);

    const archerAdjustments = vietnamese.adjustments.slice(0, 2);
    expect(archerAdjustments.map(({ requires }) => requires)).toEqual([[{ kind: 'unit', id: 1131, age: 4 }], [{ kind: 'unit', id: 1155, age: 4 }]]);
    expect(archerAdjustments[0]!.text).toContain('剩余43.5/48');
    expect(archerAdjustments[1]!.text).toContain('剩余36.6/42');
    for (const adjustment of archerAdjustments) {
      expect(adjustment.text).toContain('站内接触模型');
      expect(adjustment.text).toContain('用户未实战确认');
      expect(adjustment.text).toContain('不代表胜率');
      expect(adjustment.fallback).toContain('另一分支按自身资料独立核验');
      expect(adjustment.fallback).toContain('不据此宣称可用');
    }

    expect(vietnamese.reason).toContain('仅凑合可用');
    expect(vietnamese.reason).toContain('未经用户实战确认');
    expect(vietnamese.limitation).toContain('没有建筑学');
    expect(vietnamese.limitation).toContain('没有鼓风炉');
    expect(vietnamese.limitation).toContain('火矛驻塔输出（机制推断，待实战验证）');
    expect(vietnamese.limitation).toContain('含射箭槽时同驻 5 人，精锐藤弓兵 5/5 箭、精锐火矛兵 4/5 箭');
    expect(vietnamese.limitation).toContain('影响塔外近战和轻骑清炮');
    expect(vietnamese.limitation).toContain('无文明专属加成');
    expect(vietnamese.limitation).toContain('塔仅守家或守资源点，不作主力');
    expect(vietnamese.limitation).not.toMatch(/胜劲弩手|胜法兰克游侠|己方手推炮反制/);

    expect(vietnamese.adjustments[2]!.text).toContain('剩余168/420');
    expect(vietnamese.adjustments[2]!.text).toContain('站内接触模型');
    expect(vietnamese.adjustments[2]!.text).toContain('用户未实战确认');
    expect(vietnamese.adjustments[2]!.text).toContain('火矛仅作辅助');
    expect(vietnamese.adjustments[2]!.text).not.toContain('长戟');
    expect(vietnamese.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 1134, age: 4 }]);
    expect(vietnamese.adjustments[3]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(vietnamese.adjustments[4]!.requires).toEqual([{ kind: 'unit', id: 36, age: 4 }]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map((entity) => [entity.kind, entity.id, optionalEntityAge(entity)])])).toEqual(
      vietnamese.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id, age }) => [kind, id, age])]),
    );
    expect(contract.adjustments).toEqual(vietnamese.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
  });

  it('单边缺失越南弓手选项时保留另一选择，其他可选支援分别降级', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const vietnamese = route('Vietnamese', 'vietnamese-defensive-tower');
    const view = (unitId: number) => {
      const unitById = { ...core.unitById };
      delete unitById[unitId];
      return project('Vietnamese', vietnamese, { ...core, unitById }, trees);
    };

    const withoutRattan = view(1131);
    expect(withoutRattan.status).toBe('current');
    if (withoutRattan.status === 'current') {
      expect(withoutRattan.required.map(({ entity }) => entity.id)).toEqual([235, 1903, 546]);
      expect(withoutRattan.supplements.find(({ mode }) => mode === 'choice')?.entities.map(({ entity }) => entity.id)).toEqual([1155]);
      expectFallback(withoutRattan, vietnamese, vietnamese.adjustments[0]!.id);
      expect(withoutRattan.adjustments.find(({ id }) => id === vietnamese.adjustments[1]!.id)?.text).toBe(vietnamese.adjustments[1]!.text);
    }

    const withoutSkirmisher = view(1155);
    expect(withoutSkirmisher.status).toBe('current');
    if (withoutSkirmisher.status === 'current') {
      expect(withoutSkirmisher.supplements.find(({ mode }) => mode === 'choice')?.entities.map(({ entity }) => entity.id)).toEqual([1131]);
      expectFallback(withoutSkirmisher, vietnamese, vietnamese.adjustments[1]!.id);
      expect(withoutSkirmisher.adjustments.find(({ id }) => id === vietnamese.adjustments[0]!.id)?.text).toBe(vietnamese.adjustments[0]!.text);
    }

    for (const [unitId, adjustment] of [
      [1134, vietnamese.adjustments[2]!],
      [359, vietnamese.adjustments[3]!],
      [36, vietnamese.adjustments[4]!],
    ] as const) {
      const missing = view(unitId);
      expectFallback(missing, vietnamese, adjustment.id);
      expect(missing.status).toBe('current');
      if (missing.status === 'current') {
        expect(missing.required.map(({ entity }) => entity.id)).toEqual([235, 1903, 546]);
        if (unitId === 359) {
          const visibleAdjustments = missing.adjustments
            .filter(({ unavailable }) => !unavailable)
            .map(({ text }) => text ?? '')
            .join(' ');
          expect(visibleAdjustments).not.toContain('长戟');
        }
      }
    }

    const unitById = { ...core.unitById };
    delete unitById[1131];
    delete unitById[1155];
    const withoutBothArchers = project('Vietnamese', vietnamese, { ...core, unitById }, trees);
    expect(withoutBothArchers.status).toBe('current');
    if (withoutBothArchers.status === 'current') {
      expect(withoutBothArchers.required.map(({ entity }) => entity.id)).toEqual([235, 1903, 546]);
      expect(withoutBothArchers.supplements.some(({ mode }) => mode === 'choice')).toBe(false);
      for (const adjustment of vietnamese.adjustments.slice(0, 2)) {
        const fallback = withoutBothArchers.adjustments.find(({ id }) => id === adjustment.id);
        expect(fallback).toMatchObject({ unavailable: true, text: adjustment.fallback });
        expect(fallback?.text).toContain('另一分支按自身资料独立核验');
        expect(fallback?.text).toContain('不据此宣称可用');
        expect(fallback?.text).not.toMatch(/另一(?:分支|项)(?:仍|已|继续)?可(?:用|训练)/);
      }
    }
  });

  it('保留穆伊斯卡神庙护卫＋Slinger主路，分开食物、机制与兵种边界', () => {
    const muisca = route('Muisca', 'muisca-temple-guard-slinger');
    const contract = contractRoute('Muisca', muisca.id);

    expect([muisca.status, muisca.playtest, muisca.age, muisca.composition]).toEqual(['approved', 'unreported', 3, 'combined']);
    expect(muisca.required.map(({ id }) => id)).toEqual([2586, 185]);
    expect(muisca.prerequisites).toEqual([]);
    expect(muisca.required[0]!.role).toContain('近战/反骑');
    expect(muisca.required[0]!.role).toContain('城堡时代普通形态');
    expect(muisca.required[1]!.role).toContain('远程反步兵/民兵');
    expect(muisca.required[1]!.role).toContain('非投石车');
    expect(muisca.reason).toContain('Slinger（投石手）');
    expect(muisca.reason).not.toContain('投石手是 投石手');
    expect(muisca.limitation).toContain('两种单位共用食物');
    expect(muisca.limitation).toContain('未量化为群战结果');
    expect(muisca.limitation).toContain('不适于攻击民兵系');
    expect(muisca.limitation).toContain('没有长戟兵补队');
    expect(muisca.limitation).toContain('缺鼓风炉（75）和射手锁甲（219）');
    expect(muisca.alternatives).toContain('不用它替换默认投石手／神庙护卫组合');

    const optional = muisca.supplements.flatMap(({ entities }) => entities);
    expect(muisca.supplements.map(({ mode, entities }) => [mode, entities.map(({ id, age }) => [id, age])])).toEqual([
      ['upgrade', [[2587, 4]]],
      ['conditional-evaluation', [[6, 3]]],
      ['conditional-evaluation', [[331, 4]]],
    ]);
    expect(muisca.supplements[0]!.condition).toContain('帝王实战效果待验证');
    expect([...muisca.required, ...muisca.prerequisites, ...optional].some(({ id }) => id === 2562)).toBe(false);
    expect([...muisca.required, ...muisca.prerequisites].some(({ id }) => id === 6 || id === 331)).toBe(false);
    expect(muisca.adjustments[2]!.text).toContain('确有反弓缺口');
    expect(muisca.adjustments[2]!.text).toContain('不要因有弓手就默认同时添加格查战士和多条远程线');
    expect(muisca.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 6, age: 3 }]);
    expect(muisca.adjustments[2]!.fallback).toContain('隐藏');
    expect(muisca.adjustments[3]!.when).toContain('按需');
    expect(muisca.adjustments[3]!.requires).toEqual([{ kind: 'unit', id: 331, age: 4 }]);
    expect(muisca.adjustments[3]!.fallback).toContain('隐藏');
    expect([muisca.title, muisca.reason, muisca.attack, muisca.defense, muisca.alternatives].join(' ')).not.toMatch(/巨型投石机|精锐掷矛手|格查战士推荐/);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map((entity) => [entity.kind, entity.id, optionalEntityAge(entity)])])).toEqual(
      muisca.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id, age }) => [kind, id, age])]),
    );
    expect(contract.adjustments).toEqual(muisca.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
  });

  it('缺少穆伊斯卡掷矛手或巨投时仅隐藏各自建议，主路与另一支援仍可用', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const muisca = route('Muisca', 'muisca-temple-guard-slinger');
    const projectWithout = (unitId: number) => {
      const unitById = { ...core.unitById };
      delete unitById[unitId];
      return project('Muisca', muisca, { ...core, unitById }, trees);
    };

    const withoutSkirmisher = projectWithout(6);
    expectFallback(withoutSkirmisher, muisca, muisca.adjustments[2]!.id);
    expect(withoutSkirmisher.status).toBe('current');
    if (withoutSkirmisher.status === 'current') {
      expect(withoutSkirmisher.required.map(({ entity }) => entity.id)).toEqual([2586, 185]);
      expect(withoutSkirmisher.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([2587, 331]);
      expect(withoutSkirmisher.adjustments.find(({ id }) => id === muisca.adjustments[3]!.id)?.text).toBe(muisca.adjustments[3]!.text);
    }

    const withoutTrebuchet = projectWithout(331);
    expectFallback(withoutTrebuchet, muisca, muisca.adjustments[3]!.id);
    expect(withoutTrebuchet.status).toBe('current');
    if (withoutTrebuchet.status === 'current') {
      expect(withoutTrebuchet.required.map(({ entity }) => entity.id)).toEqual([2586, 185]);
      expect(withoutTrebuchet.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual([2587, 6]);
      expect(withoutTrebuchet.adjustments.find(({ id }) => id === muisca.adjustments[2]!.id)?.text).toBe(muisca.adjustments[2]!.text);
    }
  });

  it('固定 source URL 与手工核对的来源行字面一致', () => {
    const vietnamese = route('Vietnamese', 'vietnamese-defensive-tower');
    const muisca = route('Muisca', 'muisca-temple-guard-slinger');

    expect(vietnamese.source.content).toBe(VIETNAMESE_SOURCE_URL);
    expect(contractRoute('Vietnamese', vietnamese.id).source.content).toBe(VIETNAMESE_SOURCE_URL);
    expect(vietnamese.evidence.sourceLines).toEqual(VIETNAMESE_SOURCE_LINES);
    expect(contractRoute('Vietnamese', vietnamese.id).sourceLines).toEqual(VIETNAMESE_SOURCE_LINES);
    expect(muisca.source.content).toBe(MUISCA_SOURCE_URL);
    expect(contractRoute('Muisca', muisca.id).source.content).toBe(MUISCA_SOURCE_URL);
    expect(muisca.evidence.sourceLines).toEqual(MUISCA_SOURCE_LINES);
    expect(contractRoute('Muisca', muisca.id).sourceLines).toEqual(MUISCA_SOURCE_LINES);
  });
});

describe('#1172 越南主路与宝伞依据', () => {
  const vietnamese = byCiv('Vietnamese');
  const [mobile, front, holding] = vietnamese.routes;

  it('分组覆盖两条独立主路与原守点，并拦截重复或缺失的分组入口', () => {
    expect(vietnamese.routeGroups?.map(({ routes }) => routes.map(({ id }) => id))).toEqual([[mobile!.id, front!.id], [holding!.id]]);
    expect([mobile!.required.map(({ id }) => id), front!.required.map(({ id }) => id)]).toEqual([
      [546, 1131],
      [1132, 1155],
    ]);
    for (const mainRoute of [mobile!, front!]) {
      expect([mainRoute.status, mainRoute.playtest]).toEqual(['approved', 'unreported']);
      expect(mainRoute.source?.content).toMatch(/blob\/[a-f0-9]{40}\/role\/game-strategy\.md#L\d+-L\d+$/);
      expect(mainRoute.source?.discussion).toMatch(/issues\/1172$/);
    }
    expect(holding!.alternatives).toContain('已撤回');
    const duplicate = structuredClone(civFormationContent);
    const groups = duplicate.find(({ civ }) => civ === 'Vietnamese')!.routeGroups!;
    groups[1]!.routes[0]!.id = mobile!.id;
    expect(formationProblems(duplicate, formationContract)).toEqual([
      expect.objectContaining({ path: expect.stringMatching(/routeGroups$/), message: expect.stringContaining('唯一入口') }),
    ]);
  });

  it('用固定单位与科技效果核对两种象兵形态和旧 420 面板', async () => {
    const core = await loadCore();
    expect([1132, 1134].map((id) => core.unitById[id]?.hp)).toEqual([250, 300]);
    expect(core.techById[628]).toMatchObject({ zh: '宝伞', age: 3 });
    for (const id of [1132, 1134]) {
      expect(DAT.techs.Chatras?.rules.find(({ t }) => t.includes(id))?.fx).toContainEqual({ s: 'hp', v: 100 });
      expect(DAT.techs.Bloodlines?.rules.find(({ t }) => t.includes(id))?.fx).toContainEqual({ s: 'hp', v: 20 });
    }
    expect(holding!.adjustments?.[2]?.text).toContain('血统、宝伞都已生效时的理论面板（300＋20＋100）');
  });

  it('攻城支援分别按实体和化学降级，机动与正面主力继续可用', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const intended = (item: NonNullable<typeof mobile>, unitsAvailable: number[], chemistry: boolean) => {
      const unitById = { ...core.unitById };
      if (!unitsAvailable.includes(331)) delete unitById[331];
      if (!unitsAvailable.includes(36)) delete unitById[36];
      const techById = { ...core.techById };
      if (!chemistry) delete techById[47];
      const view = projectFormation(item, vietnamese.civ, DATA_PATCH, { core: { ...core, unitById, techById }, trees }, vietnamese.routes, vietnamese.source);
      expect(view.status).toBe('current');
      if (view.status !== 'current') return null;
      return {
        siege: view.supplements.filter(({ mode }) => mode === 'support').flatMap(({ entities }) => entities.map(({ entity }) => entity.id)),
        suggested: view.adjustments.find(({ id }) => id.endsWith('-guarded-siege')),
      };
    };
    for (const item of [mobile!, front!]) {
      expect(intended(item, [331, 36], true)).toMatchObject({ siege: [331, 36], suggested: { text: expect.stringContaining('手推炮') } });
      expect(intended(item, [331, 36], false)).toMatchObject({ siege: [331], suggested: { unavailable: true } });
      expect(intended(item, [36], true)).toMatchObject({ siege: [36] });
      expect(intended(item, [331], true)).toMatchObject({ siege: [331], suggested: { unavailable: true } });
    }
  });

  it('精锐象兵资料缺失时保留普通形态与宝伞说明', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const unitById = { ...core.unitById };
    delete unitById[1134];
    const view = projectFormation(front!, vietnamese.civ, DATA_PATCH, { core: { ...core, unitById }, trees }, vietnamese.routes, vietnamese.source);
    expect(view.status).toBe('current');
    if (view.status !== 'current') return;
    expect(view.required.map(({ entity }) => entity.id)).toEqual([1132, 1155]);
    expect(view.supplements.find(({ mode }) => mode === 'upgrade')?.entities.map(({ entity }) => entity.id)).toEqual([628]);
    expect(view.route.alternatives).not.toContain('精锐象兵');
  });
});
