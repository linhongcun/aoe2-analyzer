import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties } from './civFormationsTestUtils';

const SOURCE_URLS = {
  'koreans-war-wagon-halberdier': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L415',
  'koreans-fire-lancer-garrison': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L386',
  'jurchens-fire-lancer-tower': 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L452',
} as const;
const SOURCE_LINES = {
  'koreans-war-wagon-halberdier': [171, 415, 419],
  'koreans-fire-lancer-garrison': [386, 390, 391, 392, 393, 395, 397, 399, 405, 406, 407, 408, 414, 415, 416, 417, 419],
  'jurchens-fire-lancer-tower': [452, 454, 456, 457, 458, 459, 461, 463, 464, 465, 471, 472, 473, 474, 480, 481, 482, 483, 485],
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

const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof route>, adjustmentId: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  const adjustment = entry.adjustments.find(({ id }) => id === adjustmentId)!;
  expect(view.adjustments.find(({ id }) => id === adjustmentId)).toMatchObject({
    unavailable: true,
    text: adjustment.fallback,
  });
};

describe('#1139 Koreans and Jurchens optional support', () => {
  it('保留路线身份与固定来源字面值，并同步依赖 contract', () => {
    for (const [civ, id] of [
      ['Koreans', 'koreans-war-wagon-halberdier'],
      ['Koreans', 'koreans-fire-lancer-garrison'],
      ['Jurchens', 'jurchens-fire-lancer-tower'],
    ] as const) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.source.content).toBe(SOURCE_URLS[id]);
      expect(entry.evidence.sourceLines).toEqual(SOURCE_LINES[id]);
      expect(contract.source.content).toBe(SOURCE_URLS[id]);
      expect(contract.sourceLines).toEqual(SOURCE_LINES[id]);
      expect([entry.status, entry.playtest, entry.age, entry.composition]).toEqual([contract.status, contract.playtest, contract.age, contract.composition]);
      expect(entry.required.map(({ kind, id: entityId }) => [kind, entityId])).toEqual(contract.required.map(({ kind, id: entityId }) => [kind, entityId]));
      expect(entry.prerequisites).toEqual(contract.prerequisites);
      expect(entry.adjustments.map(({ id: adjustmentId, requires = [] }) => ({ id: adjustmentId, requires }))).toEqual(contract.adjustments);
    }

    const warWagon = route('Koreans', 'koreans-war-wagon-halberdier');
    const koreanTower = route('Koreans', 'koreans-fire-lancer-garrison');
    const jurchenTower = route('Jurchens', 'jurchens-fire-lancer-tower');
    expect([warWagon.status, warWagon.playtest, warWagon.age, warWagon.composition]).toEqual(['approved', 'unreported', 4, 'combined']);
    expect(warWagon.required.map(({ id }) => id)).toEqual([829, 359]);
    expect(koreanTower.required.map(({ id }) => id)).toEqual([235, 1903]);
    expect(jurchenTower.required.map(({ id }) => id)).toEqual([235, 1903, 441]);
    expect(koreanTower.prerequisites).toEqual([]);
    expect(jurchenTower.prerequisites).toEqual([]);
  });

  it('Korean tower option dependencies fail locally and cross-route changes use conservative fallback', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const koreans = byCiv('Koreans');
    const tower = route('Koreans', 'koreans-fire-lancer-garrison');
    const warWagon = route('Koreans', 'koreans-war-wagon-halberdier');
    const project = (entry: ReturnType<typeof route>, siblings = koreans.routes, core = resources.core) =>
      projectFormation(entry, 'Koreans', DATA_PATCH, { core, trees: resources.trees }, siblings, koreans.source);
    const dependencies = [
      [359, 'koreans-fire-lancer-garrison-adjustment-second'],
      [829, 'koreans-fire-lancer-garrison-adjustment-third'],
      [36, 'koreans-fire-lancer-garrison-adjustment-fourth'],
      [83, 'koreans-fire-lancer-garrison-adjustment-fifth'],
      [492, 'koreans-fire-lancer-garrison-adjustment-seventh'],
      [1904, 'koreans-fire-lancer-garrison-adjustment-eighth'],
    ] as const;

    for (const [unitId, adjustmentId] of dependencies) {
      const view = project(tower, koreans.routes, removeUnit(resources.core, unitId));
      expectFallback(view, tower, adjustmentId);
      expect(view.status).toBe('current');
      if (unitId === 829) {
        expectFallback(view, tower, 'koreans-fire-lancer-garrison-adjustment-sixth');
      }
    }

    const towerAdjustment = (suffix: string) => tower.adjustments.find(({ id }) => id.endsWith(`-${suffix}`))!;
    expect(towerAdjustment('second').requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(towerAdjustment('third').requires).toEqual([{ kind: 'unit', id: 829, age: 4 }]);
    expect(towerAdjustment('fourth').requires).toEqual([{ kind: 'unit', id: 36, age: 4 }]);
    expect(towerAdjustment('fifth').requires).toEqual([{ kind: 'unit', id: 83, age: 4 }]);
    expect(towerAdjustment('sixth').requires).toEqual([{ kind: 'route', id: warWagon.id }]);
    expect(towerAdjustment('seventh').requires).toEqual([{ kind: 'unit', id: 492, age: 4 }]);
    expect(towerAdjustment('eighth').requires).toEqual([{ kind: 'unit', id: 1904, age: 4 }]);
    expect([resources.core.unitById[1904]!.en, resources.core.unitById[1904]!.zh, resources.core.unitById[1904]!.age]).toEqual(['Rocket Cart', '火箭推车', 3]);
    expect([resources.core.unitById[1907]!.en, resources.core.unitById[1907]!.zh, resources.core.unitById[1907]!.age]).toEqual([
      'Heavy Rocket Cart',
      '重型火箭推车',
      4,
    ]);
    expect(towerAdjustment('eighth').text).not.toMatch(/重型火箭|升级到/);
    expect(towerAdjustment('eighth').text).toContain('不指定升级等级');
    expect(warWagon.supplements.flatMap(({ entities }) => entities).map(({ id }) => id)).toContain(36);
    expect(tower.supplements.find(({ mode }) => mode === 'choice')?.condition).toContain('攻城器不作固定主力');
    expect(tower.supplements.find(({ mode }) => mode === 'choice')?.condition).toContain('当前可用项');
    expect(tower.reason).not.toContain('可用炮');
    expect(tower.reason).toContain('用户进游戏观察到火矛驻塔确实会放箭');
    expect(tower.reason).toContain('只确认“会放箭”，没有逐箭计数');
    expect(tower.reason).not.toContain('范围威胁下的可选比较见下方调整');
    expect(tower.attack).not.toContain('村民在塔区相互支援的位置建新塔');
    expect(tower.defense).not.toMatch(/长戟|手推炮/);
    expect(tower.defense).toContain('已有机动力量且可安全接近时处理，否则退守');
    expect(tower.alternatives).not.toContain('已有弩手仍可利用');
    expect(tower.alternatives).toContain('战车与火矛同时从零大量扩产会分散黄金、升级和城堡产能');
    expect(tower.alternatives).not.toContain('范围伤害仅作为具体敌情下的选项');
    expect(warWagon.reason).not.toContain('少量手推炮');
    expect(tower.limitation).toContain('鼓风炉缺口对火矛驻塔输出的影响仅为机制推断');
    expect(tower.limitation).toContain('不含每箭伤害，未与客户端逐项核对');
    expect(tower.limitation).toContain('源记录条件上限比较');
    expect(tower.playtest).toBe('pending');
    expect(tower.evidence.playtest).toContain('没有逐箭计数');

    for (const status of ['draft', 'unverified'] as const) {
      const unavailableRoute = { ...warWagon, status };
      const siblings = koreans.routes.map((entry) => (entry.id === warWagon.id ? unavailableRoute : entry));
      expectFallback(project(tower, siblings), tower, 'koreans-fire-lancer-garrison-adjustment-sixth');
    }
    const historicalRoute = { ...warWagon, patch: { ...warWagon.patch!, build: warWagon.patch!.build - 1 } };
    expectFallback(
      project(
        tower,
        koreans.routes.map((entry) => (entry.id === warWagon.id ? historicalRoute : entry)),
      ),
      tower,
      'koreans-fire-lancer-garrison-adjustment-sixth',
    );
    for (const requiredId of [829, 359]) {
      expectFallback(project(tower, koreans.routes, removeUnit(resources.core, requiredId)), tower, 'koreans-fire-lancer-garrison-adjustment-sixth');
    }
  });

  it('Jurchen optional support, contact-model evidence, and researched-tech mechanism stay bounded', async () => {
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const jurchens = byCiv('Jurchens');
    const tower = route('Jurchens', 'jurchens-fire-lancer-tower');
    const project = (core = resources.core) =>
      projectFormation(tower, 'Jurchens', DATA_PATCH, { core, trees: resources.trees }, jurchens.routes, jurchens.source);

    for (const [unitId, adjustmentId] of [
      [359, 'jurchens-fire-lancer-tower-adjustment-first'],
      [1910, 'jurchens-fire-lancer-tower-adjustment-third'],
      [1911, 'jurchens-fire-lancer-tower-adjustment-fifth'],
    ] as const) {
      const view = project(removeUnit(resources.core, unitId));
      expectFallback(view, tower, adjustmentId);
      expect(view.status).toBe('current');
      if (unitId === 1910 && view.status === 'current') {
        expect(view.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 1910))).toBe(false);
      }
    }

    const withoutBastions = project(removeTech(resources.core, 996));
    expectFallback(withoutBastions, tower, 'jurchens-fire-lancer-tower-adjustment-sixth');
    expect(withoutBastions.status).toBe('current');
    expect(withoutBastions.status === 'current' && withoutBastions.supplements.some(({ entities }) => entities.some(({ entity }) => entity.id === 996))).toBe(
      false,
    );

    expect(tower.required.map(({ id }) => id)).toEqual([235, 1903, 441]);
    expect(tower.adjustments[0]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(tower.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 1910, age: 4 }]);
    expect(tower.adjustments[4]!.requires).toEqual([{ kind: 'unit', id: 1911, age: 4 }]);
    expect(tower.adjustments[5]!.requires).toEqual([{ kind: 'tech', id: 996, age: 3 }]);
    for (const adjustment of tower.adjustments.slice(0, 4)) {
      expect(adjustment.text).toContain('当次接触模型');
      expect(adjustment.text).toContain('不是混编实战胜率');
    }
    expect(tower.alternatives).not.toContain('对方步兵成群时再补');
    expect(tower.alternatives).not.toContain('已有掷弹兵时可以利用');
    expect(tower.alternatives).not.toContain('由依赖调整表达');
    expect(tower.adjustments[4]!.text).toContain('不新开靶场量产驻军线');
    expect(tower.limitation).toContain('驻塔时不受护甲缺口影响仅为机制推断');
    expect(tower.limitation).toContain('火矛出塔仍是 4/4');
    expect(tower.limitation).toContain('是否适用于火矛未由客户端核对');
    expect(tower.limitation).toContain('翼骑属于骑乘单位，不存在同一疑问');
    expect(tower.evidence.scope).toContain('4 个火矛与 5 个掷弹兵分别达到 5 箭上限');
    expect(tower.evidence.scope).toContain('理论驻军箭数比较，不是胜率或自动招募配方');

    const bastionsSupport = tower.supplements.find(({ mode }) => mode === 'mechanism-support')!;
    expect(bastionsSupport.condition).toContain('不是路线前置');
    expect(bastionsSupport.entities[0]).toMatchObject({ kind: 'tech', id: 996 });
    expect(tower.adjustments[5]!.text).toContain('完成强化堡垒研究后');
    expect(tower.adjustments[5]!.text).toContain('每分钟恢复 500 生命值');
    expect(tower.adjustments[5]!.text).toContain('站内数值未计入');
    expect(tower.adjustments[5]!.text).toContain('实战是否够用未验证');
    expect(tower.limitation).not.toContain('每分钟恢复 500');
    expect(tower.limitation).not.toContain('强化堡垒恢复');
  });
});
