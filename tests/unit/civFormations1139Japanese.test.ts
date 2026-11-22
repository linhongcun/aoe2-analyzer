import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties } from './civFormationsTestUtils';

const SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/2273171e5424e99ba556f5b77819acef56aa06f5/role/game-strategy.md#L1359-L1403';
const SOURCE_LINES = [
  1359, 1361, 1367, 1368, 1369, 1370, 1372, 1374, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1392, 1393, 1394, 1395, 1396, 1397, 1399, 1401, 1403,
];
const rightArrow = String.fromCodePoint(0x2192);
const japaneseCiv = () => civFormationContent.find(({ civ }) => civ === 'Japanese')!;
const japaneseRoute = () => {
  const formation = japaneseCiv().routes.find(({ id }) => id === 'japanese-samurai-light-cavalry')!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = () => formationContract.civs.find(({ civ }) => civ === 'Japanese')!.routes.find(({ id }) => id === 'japanese-samurai-light-cavalry')!;
const adjustment = (suffix: string) => japaneseRoute().adjustments.find(({ id }) => id.endsWith(`-${suffix}`))!;
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
const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof japaneseRoute>, adjustmentId: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  const expected = entry.adjustments.find(({ id }) => id === adjustmentId)!;
  expect(view.adjustments.find(({ id }) => id === adjustmentId)).toMatchObject({
    unavailable: true,
    text: expected.fallback,
  });
};

describe('#1139 Japanese formation support', () => {
  it('保留主路、固定来源、支援分支和契约依赖', () => {
    const entry = japaneseRoute();
    const contract = contractRoute();
    expect(entry.source.content).toBe(SOURCE_URL);
    expect(entry.evidence.sourceLines).toEqual(SOURCE_LINES);
    expect(contract.source.content).toBe(SOURCE_URL);
    expect(contract.sourceLines).toEqual(SOURCE_LINES);
    expect([entry.status, entry.playtest, entry.composition, entry.age]).toEqual(['approved', 'unreported', 'combined', 4]);
    expect(entry.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['unit', 560],
      ['unit', 546],
      ['unit', 331],
    ]);
    expect(entry.prerequisites).toEqual([]);
    expect(entry.choices ?? []).toEqual([]);
    expect(entry.required.map(({ kind, id }) => ({ kind, id }))).toEqual(contract.required);
    expect(entry.prerequisites).toEqual(contract.prerequisites);
    expect(
      entry.supplements.map(({ mode, entities }) => ({
        mode,
        entities: entities.map(({ kind, id }) => ({ kind, id })),
      })),
    ).toEqual(contract.supplements);
    expect(entry.adjustments.map(({ id, requires = [] }) => ({ id, requires }))).toEqual(contract.adjustments);

    const position = entry.supplements.find(({ mode }) => mode === 'position-variant')!;
    expect(position.entities.map(({ kind, id }) => [kind, id])).toEqual([['building', 235]]);
    const arrowSlitsSupport = entry.supplements.find(({ mode, entities }) => mode === 'mechanism-support' && entities.some(({ id }) => id === 484))!;
    expect(arrowSlitsSupport.entities.map(({ kind, id }) => [kind, id])).toEqual([['tech', 484]]);
    expect(arrowSlitsSupport.condition).toContain('射箭孔科技资料');
    expect(arrowSlitsSupport.condition).toContain('见下方调整');
    expect(arrowSlitsSupport.condition).not.toContain('额外箭矢效果');
    const conditional = entry.supplements.filter(({ mode }) => mode === 'conditional');
    expect(conditional).toHaveLength(2);
    expect(conditional.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[6], [474]]);
    expect(conditional.map(({ condition }) => condition)).toEqual([
      '射手压力下按需部署，不默认与重装骑射手同时铺开',
      '需要机动远程支援时单独评估，不默认与精锐掷矛手同时铺开',
    ]);
    expect(entry.supplements.some(({ mode, entities }) => mode === 'mechanism-support' && entities.some(({ id }) => id === 59))).toBe(true);

    expect(adjustment('first').requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(adjustment('second').requires).toEqual([{ kind: 'unit', id: 6, age: 4 }]);
    expect(adjustment('sixth').requires).toEqual([{ kind: 'unit', id: 5, age: 4 }]);
    expect(adjustment('seventh').requires).toEqual([{ kind: 'building', id: 235, age: 4 }]);
    expect(adjustment('eighth').requires).toEqual([{ kind: 'unit', id: 474, age: 4 }]);
    expect(adjustment('ninth').requires).toEqual([
      { kind: 'building', id: 235, age: 4 },
      { kind: 'tech', id: 484, age: 3 },
    ]);
    expect(adjustment('tenth').requires).toEqual([
      { kind: 'unit', id: 331, age: 4 },
      { kind: 'tech', id: 59, age: 4 },
    ]);
    expect(adjustment('eleventh').requires).toEqual([{ kind: 'unit', id: 283, age: 4 }]);
    expect(adjustment('twelfth').requires).toEqual([{ kind: 'unit', id: 567, age: 4 }]);
    expect(adjustment('twelfth').when).toContain('无城堡');
    expect(adjustment('twelfth').text).toContain('省金例外');
    expect(adjustment('thirteenth').requires).toEqual([
      { kind: 'unit', id: 492, age: 4 },
      { kind: 'unit', id: 359, age: 4 },
      { kind: 'unit', id: 331, age: 4 },
    ]);
    expect(adjustment('fourteenth').requires).toEqual([
      { kind: 'building', id: 235, age: 4 },
      { kind: 'unit', id: 83, age: 4 },
    ]);
    expect(adjustment('fourteenth').text).toContain('射箭孔研究不是基础建塔前置');
    expect(entry.adjustments.some(({ requires = [] }) => requires.some(({ id }) => id === 6) && requires.some(({ id }) => id === 474))).toBe(false);
    expect(adjustment('ninth').text).toContain('完成射箭孔研究后');
    expect(adjustment('tenth').text).toContain('完成弹射器研究后');
    expect(adjustment('thirteenth').text).toContain('不替代武士＋轻骑＋巨投主路');
    expect(entry.alternatives).toContain('无城堡省金例外见下方调整');
    expect(entry.alternatives).toContain('顺风已有骑士线的例外见下方调整');
    expect(entry.alternatives).toContain('条件远程备选见下方调整');
    expect(entry.alternatives).not.toContain('无城堡时可将冠军剑士');
    expect(entry.alternatives).not.toContain('可比较劲弩手＋长戟兵＋巨投');
  });

  it('把证据限制在来源模型和目录范围内', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const entry = japaneseRoute();
    const scope = entry.evidence.scope;

    expect(scope).not.toContain('固定策略记录来源行');
    expect(scope).toContain('西班牙游侠胜，剩 92/180 生命');
    expect(scope).toContain('一维接敌、射程先手和近战占位');
    expect(scope).toContain('未模拟二维包抄、走位、弹道穿透与溅射');
    expect(scope).toContain('v0.97.30 · 9938101');
    expect(scope).toContain('暂无实测胜率');
    expect(scope).not.toMatch(/1:(?:3\.92|2\.22|12\.19|19\.13)/);
    expect(adjustment('first').text).toContain('按敌方重骑规模评估补长戟');
    expect(adjustment('first').text).toContain('步兵攻速 +33%，免金、由兵营训练');
    expect(adjustment('fourth').text).toContain('接敌路径、退路和护卫');
    expect(scope).toContain(`1${rightArrow}3`);
    expect(scope).toContain('含射箭槽时驻 5 个村民与驻 5 个劲弩手，同为 6/7 箭（无射箭槽时 5 个劲弩手 7/7 箭、5 个村民仍 6/7 箭）');
    expect(entry.evidence.links?.slice(-2)).toEqual([
      {
        label: '含射箭槽 · 5 个村民 6/7 箭',
        href: 'https://linhongcun.github.io/aoe2-analyzer/#/building/235?tab=garrison&gv=2&civ=Japanese&age=4&gtechs=199,200,201,47,437,484,608&army=83:5:e',
      },
      {
        label: '含射箭槽 · 5 个劲弩手 6/7 箭',
        href: 'https://linhongcun.github.io/aoe2-analyzer/#/building/235?tab=garrison&gv=2&civ=Japanese&age=4&gtechs=199,200,201,47,437,484,608&army=492:5:e',
      },
    ]);
    expect(scope).toContain('不是招募配方或每箭伤害');
    expect(scope).toContain('固定记录列出的条件机制');
    expect(scope).toContain('不表示玩家当前已完成研究');
    expect(scope).toContain('不证明相关可选项当前可用');
    expect(scope).not.toMatch(/\b(?:59|235|484)\b/);
    expect(entry.limitation).toContain('缺轮作使后期食物线偏弱');
    expect(entry.limitation).toContain('目录基础近战/穿刺护甲为 1/1');
    expect(entry.limitation).not.toContain('等资源 PK');
    expect(entry.defense).toContain('目录基础近战/穿刺护甲为 1/1');
    expect(entry.defense).toContain('轻骑拦截可接近的突入攻城器');
    expect(entry.defense).not.toContain('精锐掷矛手');
    expect(entry.defense).not.toContain('射箭孔');
    expect(entry.alternatives).not.toContain('只在对方步兵海时换');
    expect(entry.alternatives).not.toContain('可作"劲弩');
    expect(entry.adjustments[9]!.fallback).toContain('目录资料');

    expect([resources.core.unitById[560]!.ma, resources.core.unitById[560]!.pa]).toEqual([1, 1]);
    expect([resources.core.buildingById[235]!.en, resources.core.buildingById[235]!.zh]).toEqual(['Keep', '大型箭塔']);
    expect([resources.core.techById[484]!.en, resources.core.techById[484]!.zh, resources.core.techById[484]!.age]).toEqual(['Yasama', '射箭孔', 3]);
    expect(adjustment('ninth').text).toContain(resources.core.techById[484]!.desc);
    expect([resources.core.techById[59]!.en, resources.core.techById[59]!.zh, resources.core.techById[59]!.age]).toEqual(['Kataparuto', '弹射器', 4]);
    expect(adjustment('tenth').text).toContain(resources.core.techById[59]!.desc);
    const championGold = resources.core.unitById[567]!.cost.Gold;
    const samuraiGold = resources.core.unitById[560]!.cost.Gold;
    expect([championGold, samuraiGold]).toEqual([20, 30]);
    expect(adjustment('twelfth').text).toContain(String(championGold) + 'G');
    expect(adjustment('twelfth').text).toContain(String(samuraiGold) + 'G');
    expect(adjustment('twelfth').text).toContain(String(championGold) + 'G，对精锐日本武士的 ' + String(samuraiGold) + 'G 更低');
  });

  it('逐个缺失可选目录时只局部降级，6 与 474 仍独立可用', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const civ = japaneseCiv();
    const entry = japaneseRoute();
    const project = (core = resources.core) => projectFormation(entry, 'Japanese', DATA_PATCH, { core, trees: resources.trees }, civ.routes, civ.source);
    const missing = [
      {
        core: removeUnit(resources.core, 359),
        ids: ['japanese-samurai-light-cavalry-adjustment-first', 'japanese-samurai-light-cavalry-adjustment-thirteenth'],
      },
      { core: removeUnit(resources.core, 6), ids: ['japanese-samurai-light-cavalry-adjustment-second'] },
      { core: removeUnit(resources.core, 474), ids: ['japanese-samurai-light-cavalry-adjustment-eighth'] },
      { core: removeUnit(resources.core, 5), ids: ['japanese-samurai-light-cavalry-adjustment-sixth'] },
      {
        core: removeBuilding(resources.core, 235),
        ids: [
          'japanese-samurai-light-cavalry-adjustment-seventh',
          'japanese-samurai-light-cavalry-adjustment-ninth',
          'japanese-samurai-light-cavalry-adjustment-fourteenth',
        ],
      },
      { core: removeTech(resources.core, 484), ids: ['japanese-samurai-light-cavalry-adjustment-ninth'] },
      { core: removeTech(resources.core, 59), ids: ['japanese-samurai-light-cavalry-adjustment-tenth'] },
      { core: removeUnit(resources.core, 83), ids: ['japanese-samurai-light-cavalry-adjustment-fourteenth'] },
      { core: removeUnit(resources.core, 283), ids: ['japanese-samurai-light-cavalry-adjustment-eleventh'] },
      { core: removeUnit(resources.core, 567), ids: ['japanese-samurai-light-cavalry-adjustment-twelfth'] },
      { core: removeUnit(resources.core, 492), ids: ['japanese-samurai-light-cavalry-adjustment-thirteenth'] },
    ];
    for (const { core, ids } of missing) {
      const view = project(core);
      for (const id of ids) expectFallback(view, entry, id);
    }

    const noSkirmisher = project(removeUnit(resources.core, 6));
    if (noSkirmisher.status === 'current') {
      expect(noSkirmisher.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 6))).toBe(false);
      expect(noSkirmisher.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 474))).toBe(true);
      expect(noSkirmisher.adjustments.find(({ id }) => id.endsWith('-eighth'))?.unavailable).not.toBe(true);
    }
    const noHeavyCavalryArcher = project(removeUnit(resources.core, 474));
    if (noHeavyCavalryArcher.status === 'current') {
      expect(noHeavyCavalryArcher.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 6))).toBe(true);
      expect(noHeavyCavalryArcher.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 474))).toBe(false);
      expect(noHeavyCavalryArcher.adjustments.find(({ id }) => id.endsWith('-second'))?.unavailable).not.toBe(true);
    }

    const noArrowSlits = project(removeTech(resources.core, 484));
    if (noArrowSlits.status === 'current') {
      expect(noArrowSlits.supplements.some(({ mode, entities }) => mode === 'position-variant' && entities.some(({ entity }) => entity.id === 235))).toBe(true);
      expect(noArrowSlits.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 484))).toBe(false);
      expect(noArrowSlits.adjustments.find(({ id }) => id.endsWith('-fourteenth'))?.unavailable).not.toBe(true);
    }
    const noTrebuchetResearch = project(removeTech(resources.core, 59));
    if (noTrebuchetResearch.status === 'current') {
      expect(noTrebuchetResearch.required.some(({ entity }) => entity.id === 331)).toBe(true);
      expect(noTrebuchetResearch.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 59))).toBe(false);
    }
  });
});
