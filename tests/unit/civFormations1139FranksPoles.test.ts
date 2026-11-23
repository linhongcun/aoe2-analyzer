import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties } from './civFormationsTestUtils';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });
const routeText = (entry: ReturnType<typeof route>) =>
  [entry.reason, entry.limitation, entry.attack, entry.defense, ...(entry.adjustments ?? []).flatMap(({ when, text }) => [when, text ?? ''])].join(' ');

describe('#1139 法兰克与波兰路线职责及条件支援', () => {
  it('保留六路线的状态、组成、时代、required 与波兰骑士前置', () => {
    const expected = [
      ['Franks', 'franks-paladin-skirmisher', 4, 'combined', [569, 6]],
      ['Franks', 'franks-heavy-mounted-crossbow-light-cav', 4, 'combined', [2701, 546]],
      ['Franks', 'franks-throwing-axeman-light-cav', 4, 'combined', [531, 546]],
      ['Poles', 'poles-obuch-winged-hussar', 4, 'combined', [1703, 1707]],
      ['Poles', 'poles-arbalest-winged-hussar', 4, 'combined', [492, 1707]],
      ['Poles', 'poles-discount-knights', 3, 'progression', [38, 283]],
    ] as const;

    for (const [civ, id, age, composition, required] of expected) {
      const entry = route(civ, id);
      expect([entry.status, entry.playtest, entry.age, entry.composition, entry.required.map(({ id: unitId }) => unitId)]).toEqual([
        'approved',
        'unreported',
        age,
        composition,
        required,
      ]);
      expect(contractRoute(civ, id).required.map(({ id: unitId }) => unitId)).toEqual(required);
    }

    const knights = route('Poles', 'poles-discount-knights');
    expect(knights.required[1]).toMatchObject({ id: 283, age: 4 });
    expect(knights.prerequisites.map(({ id }) => id)).toEqual([782]);
    expect(contractRoute('Poles', knights.id).prerequisites).toEqual([{ kind: 'tech', id: 782 }]);
  });

  it('按路线隔离法兰克职责与限制，保留generic攻城支援和明确的可选组成', () => {
    const paladin = route('Franks', 'franks-paladin-skirmisher');
    const mountedCrossbow = route('Franks', 'franks-heavy-mounted-crossbow-light-cav');
    const throwingAxeman = route('Franks', 'franks-throwing-axeman-light-cav');

    expect(routeText(paladin)).not.toMatch(/轻骑|掷斧|骑马弩/);
    expect(paladin.limitation).toContain('共同消耗食物');
    expect(paladin.limitation).toContain('骆驼');
    expect(paladin.limitation).toContain('缺护腕、扳指和射手锁甲');
    expect(routeText(mountedCrossbow)).not.toMatch(/游侠|掷斧|掷矛/);
    expect(mountedCrossbow.reason).toContain('40 木材');
    expect(mountedCrossbow.reason).toContain('80 食物');
    expect(mountedCrossbow.reason).toContain('王家敕令');
    expect(mountedCrossbow.reason).toContain('折后为 39 黄金 + 40 木材');
    expect(mountedCrossbow.reason).toContain('持续生产、训练总价与单位 PK 等资源模块已套用');
    expect(mountedCrossbow.reason).toContain('单位详情页、科技模拟器、持续生产、训练总价与单位 PK 等资源模块已套用');
    expect(mountedCrossbow.reason).not.toContain('暂未叠加');
    expect(mountedCrossbow.evidence.scope).toContain('王家敕令骑兵折后价适用范围');
    expect(mountedCrossbow.evidence.recordedVersion).toContain('v0.99.12 · DE 188329 · 66620c9');
    expect(mountedCrossbow.limitation).toContain('受保护的敌方攻城器');
    expect(throwingAxeman.reason).toContain('按情境或兴趣选择');
    expect(throwingAxeman.limitation).toContain('共同消耗食物');
    expect(throwingAxeman.limitation).toContain('骑兵威胁');
    expect(paladin.alternatives).toContain('反复前推城堡也不作默认选择');
    expect(paladin.alternatives).toContain('城堡时代 552.5 石料、帝王时代 487.5 石料');
    expect(paladin.evidence.recordedVersion).toContain('v0.99.12 · DE 188329 · 66620c9');

    for (const entry of [paladin, mountedCrossbow]) {
      expect(entry.supplements).toEqual([]);
      const generic = entry.adjustments.find(({ id }) => id.endsWith('-siege'))!;
      expect(generic.when).toBe('按局势需要攻城支援');
      expect(generic.text).toContain('未指定种类，不设固定比例');
      expect(generic).not.toHaveProperty('requires');
      expect(generic).not.toHaveProperty('entities');
    }

    const halberd = paladin.adjustments[0]!;
    expect(halberd.requires).toEqual([{ kind: 'unit', id: 359 }]);
    expect(halberd.text).toContain('未单独实战验证');
    expect(halberd.fallback).toContain('不把长戟支援当作固定');
    expect(throwingAxeman.adjustments[0]!.fallback).toContain('骑兵威胁下');
    expect(throwingAxeman.adjustments[0]!.fallback).not.toContain('反骑压力');
    const axeChoice = throwingAxeman.supplements.find(({ mode }) => mode === 'choice')!;
    expect(axeChoice.entities.map(({ id, age }) => [id, age])).toEqual([
      [36, 4],
      [331, 4],
    ]);
    expect(contractRoute('Franks', throwingAxeman.id).supplements[0]!.entities).toEqual([
      { kind: 'unit', id: 36, age: 4 },
      { kind: 'unit', id: 331, age: 4 },
    ]);
  });

  it('按路线拆分波兰边界与调整，并仅在帝王时代给骑士路线攻城器选择', () => {
    const obuch = route('Poles', 'poles-obuch-winged-hussar');
    const arbalest = route('Poles', 'poles-arbalest-winged-hussar');
    const knights = route('Poles', 'poles-discount-knights');

    for (const entry of [obuch, arbalest]) {
      expect(entry.limitation).toContain('大庄园');
      expect(entry.limitation).toContain('不能替代足够的农田和补兵经济');
      expect(entry.limitation).toContain('缺骑兵钢甲');
      expect(entry.limitation).toContain('践踏');
      expect(entry.limitation).toContain('仅文本');
      expect(entry.limitation).toContain('不代表群战或混编胜率');
    }
    expect(knights.limitation).toContain('大庄园');
    expect(knights.limitation).toContain('没有游侠');
    expect(knights.limitation).toContain('折扣只作用于骑士系黄金');
    expect(knights.limitation).not.toContain('践踏');
    expect(knights.reason).not.toContain('翼骑');
    expect(obuch.adjustments.every(({ text }) => !/劲弩路线先|骑士海路线|战锤路线由/.test(text ?? ''))).toBe(true);
    expect(arbalest.adjustments.every(({ text }) => !/骑士海路线|战锤路线由/.test(text ?? ''))).toBe(true);

    for (const entry of [obuch, arbalest]) {
      const choice = entry.supplements.find(({ mode }) => mode === 'choice')!;
      expect(choice.entities.map(({ id }) => id)).toEqual([36, 331]);
      expect(contractRoute('Poles', entry.id).supplements[0]!.entities.map(({ id }) => id)).toEqual([36, 331]);
    }
    const siegeChoice = knights.supplements.find(({ mode }) => mode === 'choice')!;
    expect(siegeChoice.condition).toContain('帝王时代');
    expect(siegeChoice.condition).toContain('已有攻城器基础');
    expect(siegeChoice.entities.map(({ id, age }) => [id, age])).toEqual([
      [36, 4],
      [331, 4],
    ]);
    expect(contractRoute('Poles', knights.id).supplements[0]!.entities).toEqual([
      { kind: 'unit', id: 36, age: 4 },
      { kind: 'unit', id: 331, age: 4 },
    ]);
    for (const entry of [obuch, arbalest, knights]) {
      expect(entry.evidence.scope).not.toContain('来源行');
      expect(entry.evidence.sourceLines).toContain(954);
      expect(entry.evidence.sourceLines).toContain(984);
      expect(contractRoute('Poles', entry.id).sourceLines).toEqual(entry.evidence.sourceLines);
    }
    expect(obuch.adjustments[1]!.fallback).toContain('规避受保护的远程火力');
    expect(obuch.adjustments[1]!.fallback).toContain('保留撤退和安全接敌空间');
  });

  it('六条路线的sourceLines与固定版本URL锚点逐条对应', () => {
    const franksSha = '415863b2a3e94078129554c09378c9a9fba04b57';
    const polesSha = '6c3cdc6ded5200eac43e95efb28878066b96c3d9';
    const expected = [
      ['Franks', 'franks-paladin-skirmisher', franksSha, 'L762', [750, 754, 758, 762, 766, 768, 770, 776, 778, 784, 785, 786, 789, 793]],
      ['Franks', 'franks-heavy-mounted-crossbow-light-cav', franksSha, 'L763', [750, 754, 758, 763, 766, 768, 770, 778, 789, 791, 793]],
      ['Franks', 'franks-throwing-axeman-light-cav', franksSha, 'L764', [750, 754, 758, 764, 766, 768, 770, 777, 778, 787, 789, 793]],
      ['Poles', 'poles-obuch-winged-hussar', polesSha, 'L948-L984', [948, 954, 958, 962, 964, 966, 972, 973, 974, 980, 981, 982, 984]],
      ['Poles', 'poles-arbalest-winged-hussar', polesSha, 'L948-L984', [948, 954, 959, 962, 964, 966, 972, 973, 974, 981, 984]],
      ['Poles', 'poles-discount-knights', polesSha, 'L948-L984', [948, 954, 960, 962, 964, 966, 972, 973, 974, 980, 981, 984]],
    ] as const;
    const url = (sha: string, anchor: string) => `https://github.com/linhongcun/aoe2-analyzer/blob/${sha}/role/game-strategy.md#${anchor}`;

    for (const [civ, id, sha, anchor, lines] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
      expect(entry.source?.content).toBe(url(sha, anchor));
      expect(contract.source.content).toBe(url(sha, anchor));
    }
  });

  it('依赖的长戟或劲弩路线不可用时投影保守fallback', async () => {
    const resources = await catalog();
    const paladin = route('Franks', 'franks-paladin-skirmisher');
    const absentHalberdier = { ...resources.core.unitById };
    delete absentHalberdier[359];
    const withoutHalberdier = projectFormation(
      paladin,
      'Franks',
      DATA_PATCH,
      { core: { ...resources.core, unitById: absentHalberdier }, trees: resources.trees },
      byCiv('Franks').routes,
      byCiv('Franks').source,
    );
    expect(withoutHalberdier.status).toBe('current');
    if (withoutHalberdier.status === 'current') {
      const adjustment = withoutHalberdier.adjustments.find(({ id }) => id === paladin.adjustments[0]!.id);
      expect(adjustment).toMatchObject({ unavailable: true, text: paladin.adjustments[0]!.fallback });
    }

    for (const [civ, id, dependencyId] of [
      ['Poles', 'poles-obuch-winged-hussar', 'poles-obuch-winged-hussar-adjustment-second'],
      ['Poles', 'poles-discount-knights', 'poles-discount-knights-adjustment-second'],
    ] as const) {
      const parent = route(civ, id);
      const view = projectFormation(parent, civ, DATA_PATCH, resources, [parent], byCiv(civ).source);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        const dependency = parent.adjustments.find(({ id: adjustmentId }) => adjustmentId === dependencyId)!;
        expect(dependency.requires).toEqual([{ kind: 'route', id: 'poles-arbalest-winged-hussar' }]);
        expect(view.adjustments.find(({ id: adjustmentId }) => adjustmentId === dependencyId)).toMatchObject({
          unavailable: true,
          text: dependency.fallback,
        });
      }
    }
  });

  it('不改动西班牙与格鲁吉亚原四路线的关键结构', () => {
    const expected = [
      ['Spanish', 'conquistador-hussar', [773, 441]],
      ['Spanish', 'paladin-skirmisher', [569, 6]],
      ['Spanish', 'handcannon-halberdier', [5, 359]],
      ['Georgians', 'monaspa-towers', [1805, 235, 923]],
    ] as const;
    for (const [civ, id, required] of expected) {
      const entry = route(civ, id);
      expect([entry.status, entry.playtest, entry.composition, entry.age, entry.required.map(({ id: entityId }) => entityId)]).toEqual([
        'approved',
        'unreported',
        'combined',
        4,
        required,
      ]);
    }
  });
});
