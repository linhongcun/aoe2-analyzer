import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { civByEn, loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { techAvailable } from '../../src/domain/unitAvailability';
import { assertDefinedProperties } from './civFormationsTestUtils';

const MALIAN_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/6c3cdc6ded5200eac43e95efb28878066b96c3d9/role/game-strategy.md#L408-L452';
const LITHUANIAN_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/b63cccc015b677017efb4a64de8ebc01cd727ffd/role/game-strategy.md#L908-L953';
const MALIAN_SOURCE_LINES = [408, 412, 416, 417, 418, 419, 421, 423, 436, 437, 438, 439, 445, 446, 447, 448, 450, 452];
const LITHUANIAN_SOURCE_LINES = [908, 912, 916, 917, 918, 919, 921, 923, 925, 931, 932, 933, 934, 940, 941, 942, 944, 946, 947, 948, 949, 951, 953];

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments', 'source');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;

const expectFallback = (view: ReturnType<typeof projectFormation>, entry: ReturnType<typeof route>, suffix: string) => {
  expect(view.status).toBe('current');
  if (view.status !== 'current') return;
  const adjustment = entry.adjustments.find(({ id }) => id.endsWith(suffix))!;
  const projected = view.adjustments.find(({ id }) => id === adjustment.id);
  expect(projected).toMatchObject({ unavailable: true, text: adjustment.fallback });
  expect(projected?.decision).toBeUndefined();
};

describe('#1139 马里与立陶宛前线中心条件边界', () => {
  it('保留马里主路与unreported边界，前线中心、蛮王、骆驼和炮建议依赖投影', () => {
    const malian = route('Malians', 'malians-light-cavalry-gbeto');
    const contract = contractRoute('Malians', malian.id);

    expect([malian.status, malian.playtest, malian.age, malian.composition]).toEqual(['approved', 'unreported', 4, 'combined']);
    expect(malian.required.map(({ id }) => id)).toEqual([546, 1015]);
    expect(malian.prerequisites).toEqual([]);
    expect(malian.evidence.playtest).toContain('不推断已验证或未验证');
    expect(malian.evidence.scope).toContain('hongcun常用经验');
    expect(malian.evidence.scope).toContain('不据此将整套混编标成已实战');
    expect(malian.reason).toContain('轻骑兵与精锐飞刀女兵');
    expect(malian.reason).toContain('远程进行近战攻击的步兵');
    expect(malian.reason).toContain('受步兵护甲');
    expect(malian.reason).toContain('与轻骑共享近战攻击科技而非射手线');
    expect([malian.reason, malian.attack, malian.defense].join(' ')).not.toMatch(/城镇中心|蛮王|空中心开火/);
    expect(malian.limitation).toContain('轻骑仍怕长戟');
    expect(malian.limitation).toContain('接触PK胜弓手不保证追得上');
    expect(malian.limitation).toContain('飞刀避免被包围贴身');
    expect(malian.limitation).toContain('目录价不是折后价');
    expect(malian.limitation).toContain('箭数与施工时间只是理论预览');
    expect(malian.limitation).toContain('未和本版本客户端核对');
    expect(malian.limitation).not.toMatch(/村民驻军继续增箭|飞刀可躲进去|落成前线中心/);
    expect(malian.alternatives).toContain('投石车常驻：不默认作为固定配套');
    expect(malian.alternatives).not.toMatch(/无法接近或需范围伤害时再考虑|骆驼保留作反骑补队/);

    const position = malian.supplements.find(({ mode }) => mode === 'position-variant')!;
    const king = malian.supplements.find(({ mode }) => mode === 'mechanism-support')!;
    expect(position.condition).toContain('hongcun常用阵地玩法');
    expect(position.condition).toContain('不代表全混编已实战');
    expect(position.entities.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 109],
      ['unit', 83],
    ]);
    expect(king.entities.map(({ kind, id }) => [kind, id])).toEqual([['tech', 576]]);
    const deathSwords = malian.supplements.filter(({ mode }) => mode === 'mechanism-support')[1]!;
    expect(deathSwords.entities.map(({ kind, id }) => [kind, id])).toEqual([['tech', 577]]);
    expect(deathSwords.condition).toContain('完成死士研究后');
    expect(deathSwords.condition).toContain('研究前不生效');
    expect([...malian.required, ...malian.prerequisites].some(({ id }) => id === 109 || id === 83 || id === 576 || id === 577)).toBe(false);
    expect(malian.adjustments[0]!.requires).toEqual([{ kind: 'unit', id: 330, age: 4 }]);
    expect(malian.adjustments[0]!.fallback).toContain('隐藏');
    expect(malian.adjustments[3]!.requires).toEqual([{ kind: 'unit', id: 36, age: 4 }]);
    expect(malian.adjustments[3]!.fallback).toContain('隐藏');
    expect(malian.adjustments[4]!.requires).toEqual([
      { kind: 'building', id: 109, age: 4 },
      { kind: 'unit', id: 83, age: 4 },
    ]);
    expect(malian.adjustments[5]!.requires).toEqual([
      { kind: 'building', id: 109, age: 4 },
      { kind: 'tech', id: 576, age: 4 },
    ]);
    expect(malian.adjustments[5]!.when).toContain('已完成蛮王研究');
    expect(malian.adjustments[5]!.text).toContain('空城镇中心也能射 8 箭（满驻上限 18）');
    expect(malian.adjustments[5]!.decision?.also).toContain('驻扎仍可再加箭');
    expect(malian.adjustments[5]!.decision?.exception).toContain('蛮王不作为主路前置');
    expect(malian.adjustments[5]!.text).not.toContain('均可用');
    expect(malian.adjustments[6]!.when).toContain('无法安全接近或确需范围伤害');
    expect(malian.adjustments[6]!.requires).toEqual([{ kind: 'unit', id: 280, age: 4 }]);
    expect(malian.adjustments[6]!.fallback).toContain('基础投石车目录资料');
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id }) => [kind, id])])).toEqual(
      malian.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id }) => [kind, id])]),
    );
    expect(contract.adjustments).toEqual(malian.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
  });

  it('保留立陶宛主路与未记录版本，TC村民、山城堡及所有替代补队分开依赖', () => {
    const lithuanian = route('Lithuanians', 'lithuanians-leitis-skirmisher');
    const contract = contractRoute('Lithuanians', lithuanian.id);

    expect([lithuanian.status, lithuanian.playtest, lithuanian.age, lithuanian.composition]).toEqual(['approved', 'unreported', 4, 'combined']);
    expect(lithuanian.required.map(({ id }) => id)).toEqual([1236, 6]);
    expect(lithuanian.prerequisites).toEqual([]);
    expect(lithuanian.evidence.recordedVersion).toBe('原记录未记录站点版本/构建；圣物数 0/2/4 预算 3000 群战复核：v0.99.44 · DE 188329 · f1d5aab');
    expect(lithuanian.evidence.scope).toContain('驻军预览不代表混编实战或胜率证明');
    expect(lithuanian.reason).toContain('烈堤司以近战处理重甲');
    expect(lithuanian.supplements.find(({ mode }) => mode === 'choice')?.condition).toContain('烈堤司近战保护攻城器');
    expect(lithuanian.supplements.find(({ mode }) => mode === 'choice')?.entities.find(({ id }) => id === 36)?.role).toContain(
      '有护卫时按需用手推炮寻找反制机会',
    );
    expect(lithuanian.reason).toContain('掷矛反弓并远射长戟');
    expect([lithuanian.reason, lithuanian.attack, lithuanian.defense].join(' ')).not.toMatch(/前线城镇中心作支点|村民落中心|依托中心|中心与驻扎的掷矛控制/);
    expect(lithuanian.limitation).toContain('不默认开局已有四件圣物');
    expect(lithuanian.limitation).toContain('未证明混编实战胜率');
    expect(lithuanian.limitation).toContain('城镇中心不是主路线前置');
    expect(lithuanian.alternatives).not.toMatch(/继续游侠合理|缺金、骚扰时可替换部分贵骑兵|已有掷矛和施工村民可以驻防/);

    const position = lithuanian.supplements.find(({ mode }) => mode === 'position-variant')!;
    const mountainFortress = lithuanian.supplements.find(({ mode }) => mode === 'mechanism-support')!;
    expect(position.entities.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 109],
      ['unit', 83],
    ]);
    expect(mountainFortress.entities.map(({ kind, id }) => [kind, id])).toEqual([['tech', 691]]);
    expect([...lithuanian.required, ...lithuanian.prerequisites].some(({ id }) => id === 109 || id === 83 || id === 691)).toBe(false);

    expect(lithuanian.adjustments[1]!.requires).toEqual([{ kind: 'unit', id: 5, age: 4 }]);
    expect(lithuanian.adjustments[2]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(lithuanian.adjustments[3]!.requires).toEqual([{ kind: 'unit', id: 36, age: 4 }]);
    expect(lithuanian.adjustments[4]!.text).toContain('不必追求满箭');
    expect(lithuanian.adjustments[4]!.text).toContain('村民继续采集、施工和维修');
    expect(lithuanian.adjustments[4]!.requires).toEqual([
      { kind: 'building', id: 109, age: 4 },
      { kind: 'unit', id: 83, age: 4 },
    ]);
    expect(lithuanian.adjustments[5]!.when).toContain('完成山城堡研究后');
    expect(lithuanian.adjustments[5]!.text).toContain(`城镇中心射程 6${`\u2192`}9，盖过基础射程的弩手和投石车`);
    expect(lithuanian.adjustments[5]!.decision?.exception).toContain('盖不住投石机，也够不到 12 射程的普通手推炮。空驻军不开火');
    expect(lithuanian.adjustments[5]!.text).not.toContain('均具备时');
    expect(lithuanian.adjustments[5]!.requires).toEqual([
      { kind: 'building', id: 109, age: 4 },
      { kind: 'unit', id: 83, age: 4 },
      { kind: 'tech', id: 691, age: 4 },
    ]);
    expect(lithuanian.adjustments[6]!.requires).toEqual([{ kind: 'unit', id: 569, age: 4 }]);
    expect(lithuanian.adjustments[6]!.when).toBe('已有成熟骑士线、城堡产能不足或需要抗箭');
    expect(lithuanian.adjustments[6]!.text).toContain('已有成熟骑士线、城堡产能不足或需要抗箭时，继续游侠合理');
    expect(lithuanian.adjustments[7]!.requires).toEqual([{ kind: 'unit', id: 1707, age: 4 }]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id }) => [kind, id])])).toEqual(
      lithuanian.supplements.map(({ mode, entities }) => [mode, entities.map(({ kind, id }) => [kind, id])]),
    );
    expect(contract.adjustments).toEqual(lithuanian.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
  });

  it('uses fixed literal source URLs and line arrays for both routes', () => {
    const malian = route('Malians', 'malians-light-cavalry-gbeto');
    const lithuanian = route('Lithuanians', 'lithuanians-leitis-skirmisher');

    expect(malian.source.content).toBe(MALIAN_SOURCE_URL);
    expect(contractRoute('Malians', malian.id).source.content).toBe(MALIAN_SOURCE_URL);
    expect(malian.evidence.sourceLines).toEqual(MALIAN_SOURCE_LINES);
    expect(contractRoute('Malians', malian.id).sourceLines).toEqual(MALIAN_SOURCE_LINES);
    expect(lithuanian.source.content).toBe(LITHUANIAN_SOURCE_URL);
    expect(contractRoute('Lithuanians', lithuanian.id).source.content).toBe(LITHUANIAN_SOURCE_URL);
    expect(lithuanian.evidence.sourceLines).toEqual(LITHUANIAN_SOURCE_LINES);
    expect(contractRoute('Lithuanians', lithuanian.id).sourceLines).toEqual(LITHUANIAN_SOURCE_LINES);
  });

  it('#1267 立陶宛将圣物攻击加成、科技缺口和波兰翼骑兵取舍分开', async () => {
    const civ = 'Lithuanians';
    const core = await loadCore();
    const trees = await loadTrees();
    const lithuanian = route(civ, 'lithuanians-leitis-skirmisher');
    expect(core.unitById[1707]?.zh).toBe('波兰翼骑兵');
    expect([75, 77].map((id) => techAvailable({ core, trees }, civ, id, 4))).toEqual([false, false]);
    expect(civByEn(civ)?.bon).toContain('每驻守一件圣物，骑士系和烈堤司的攻击力 +1 (最高 +4)');
    expect(lithuanian.limitation).toContain('缺鼓风炉和步兵钢甲，分别少了末级近战攻击和步兵护甲');
    expect(lithuanian.limitation).toContain('波兰翼骑兵和长戟兵没有这项加攻');
    expect(lithuanian.adjustments[7]?.when).toContain('有波兰翼骑兵投入');
  });

  it('missing optional catalog entries only hide their advice and leave each primary route current', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const malian = route('Malians', 'malians-light-cavalry-gbeto');
    const lithuanian = route('Lithuanians', 'lithuanians-leitis-skirmisher');
    const project = (civ: string, entry: ReturnType<typeof route>, currentCore: typeof core = core) =>
      projectFormation(entry, civ, DATA_PATCH, { core: currentCore, trees }, byCiv(civ).routes, byCiv(civ).source);

    const noMalianCastleById = { ...core.buildingById };
    delete noMalianCastleById[109];
    const noMalianCastle = project('Malians', malian, { ...core, buildingById: noMalianCastleById });
    expectFallback(noMalianCastle, malian, '-fifth');
    expectFallback(noMalianCastle, malian, '-sixth');

    const noMalianBuildersById = { ...core.unitById };
    delete noMalianBuildersById[83];
    const noMalianBuilders = project('Malians', malian, { ...core, unitById: noMalianBuildersById });
    expectFallback(noMalianBuilders, malian, '-fifth');

    const noKingTechById = { ...core.techById };
    delete noKingTechById[576];
    const noKingTech = project('Malians', malian, { ...core, techById: noKingTechById });
    expectFallback(noKingTech, malian, '-sixth');
    if (noKingTech.status === 'current') {
      expect(noKingTech.adjustments.find(({ id }) => id.endsWith('-fifth'))?.unavailable).not.toBe(true);
      expect(noKingTech.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(576);
    }

    const noDeathSwordsById = { ...core.techById };
    delete noDeathSwordsById[577];
    const noDeathSwords = project('Malians', malian, { ...core, techById: noDeathSwordsById });
    expect(noDeathSwords.status).toBe('current');
    if (noDeathSwords.status === 'current') {
      expect(noDeathSwords.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(577);
    }

    const noCamelById = { ...core.unitById };
    delete noCamelById[330];
    expectFallback(project('Malians', malian, { ...core, unitById: noCamelById }), malian, '-first');
    const noCannonById = { ...core.unitById };
    delete noCannonById[36];
    const noMalianCannon = project('Malians', malian, { ...core, unitById: noCannonById });
    expectFallback(noMalianCannon, malian, '-fourth');
    if (noMalianCannon.status === 'current') {
      expect(noMalianCannon.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toContain(331);
    }

    const noBasicSiegeById = { ...core.unitById };
    delete noBasicSiegeById[280];
    const noBasicSiege = project('Malians', malian, { ...core, unitById: noBasicSiegeById });
    expectFallback(noBasicSiege, malian, '-seventh');
    if (noBasicSiege.status === 'current') {
      expect(noBasicSiege.adjustments.find(({ id }) => id.endsWith('-seventh'))?.text).not.toContain('评估投石车系基础兵种');
    }

    const noLithuanianCastleById = { ...core.buildingById };
    delete noLithuanianCastleById[109];
    const noLithuanianCastle = project('Lithuanians', lithuanian, { ...core, buildingById: noLithuanianCastleById });
    expectFallback(noLithuanianCastle, lithuanian, '-fifth');
    expectFallback(noLithuanianCastle, lithuanian, '-sixth');

    const noLithuanianBuildersById = { ...core.unitById };
    delete noLithuanianBuildersById[83];
    const noLithuanianBuilders = project('Lithuanians', lithuanian, { ...core, unitById: noLithuanianBuildersById });
    expectFallback(noLithuanianBuilders, lithuanian, '-fifth');
    expectFallback(noLithuanianBuilders, lithuanian, '-sixth');

    const noMountainFortressById = { ...core.techById };
    delete noMountainFortressById[691];
    const noMountainFortress = project('Lithuanians', lithuanian, { ...core, techById: noMountainFortressById });
    expectFallback(noMountainFortress, lithuanian, '-sixth');
    if (noMountainFortress.status === 'current') {
      expect(noMountainFortress.adjustments.find(({ id }) => id.endsWith('-fifth'))?.unavailable).not.toBe(true);
      expect(noMountainFortress.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(691);
    }

    for (const [id, suffix] of [
      [5, '-second'],
      [359, '-third'],
      [36, '-fourth'],
      [569, '-seventh'],
      [1707, '-eighth'],
    ] as const) {
      const unitById = { ...core.unitById };
      delete unitById[id];
      expectFallback(project('Lithuanians', lithuanian, { ...core, unitById }), lithuanian, suffix);
    }
  });
});
