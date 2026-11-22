import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties, optionalEntityAge } from './civFormationsTestUtils';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });
const narrative = (entry: ReturnType<typeof route>) => [entry.reason, entry.limitation, entry.attack, entry.defense].join(' ');

describe('#1139 马普切与图皮路线边界及条件支援', () => {
  it('保留四路线状态、组成、时代、required 与固定版本', () => {
    const expected = [
      ['Mapuche', 'mapuche-kona-bolas', 3, 'combined', [2566, 2569], 'v0.78.3 · DE 188329 · 构建 40c323a'],
      ['Mapuche', 'mapuche-kona-slinger', 3, 'combined', [2566, 185], 'v0.78.3 · DE 188329 · 构建 40c323a'],
      [
        'Tupi',
        'tupi-champi-slinger',
        4,
        'combined',
        [2554, 185],
        'v0.77.107、构建 da6e280 为前次观察，本次未刷新核对；载具容量复核：v0.99.12 · DE 188329 · 66620c9',
      ],
      [
        'Tupi',
        'tupi-blackwood-halberdier',
        4,
        'combined',
        [2581, 359],
        'v0.77.107、构建 da6e280 为前次观察，本次未刷新核对；载具容量复核：v0.99.12 · DE 188329 · 66620c9',
      ],
    ] as const;

    for (const [civ, id, age, composition, required, version] of expected) {
      const entry = route(civ, id);
      expect([entry.status, entry.playtest, entry.composition, entry.age, entry.required.map(({ id: unitId }) => unitId)]).toEqual([
        'approved',
        'unreported',
        composition,
        age,
        required,
      ]);
      expect(entry.evidence.recordedVersion).toBe(version);
      expect(contractRoute(civ, id).required.map(({ id: unitId }) => unitId)).toEqual(required);
    }
  });

  it('按路线隔离马普切分工，并将投石手、巨投限定为条件支援', () => {
    const konaBolas = route('Mapuche', 'mapuche-kona-bolas');
    const konaSlinger = route('Mapuche', 'mapuche-kona-slinger');
    const slingerSupport = konaBolas.supplements.find(({ mode }) => mode === 'conditional')!;
    const firstSiege = konaBolas.supplements.find(({ mode }) => mode === 'as-needed')!;
    const secondSiege = konaSlinger.supplements.find(({ mode }) => mode === 'as-needed')!;
    const supportAdjustment = konaBolas.adjustments.find(({ id }) => id.endsWith('-second'))!;
    const routeAdjustment = konaSlinger.adjustments.find(({ id }) => id.endsWith('-first'))!;

    expect(konaBolas.condition).toContain('两条金线');
    expect(konaBolas.condition).toContain('承受损失');
    expect(konaBolas.evidence.scope).toContain('个人偏好');
    expect(konaBolas.evidence.scope).toContain('不推导非骑兵经济更差');
    expect(narrative(konaBolas)).not.toContain('投石手');
    expect(konaBolas.reason).toContain('分担食物和木材、共同需要黄金');
    expect(konaBolas.limitation).toContain('长矛兵系、骆驼和僧侣');
    expect(konaBolas.limitation).toContain('不适于攻击步弓手、掷矛手和近程单位');
    expect(konaBolas.limitation).toContain('不保证对所有骑兵占优');
    expect(konaBolas.limitation).toContain('击杀产金适用范围未完全说明');
    expect(konaBolas.limitation).toContain('布图马普折扣仅文本、未编码');
    expect([slingerSupport.entities[0]!.id, slingerSupport.entities[0]!.historicalName]).toEqual([185, '投石手']);
    expect(slingerSupport.condition).toContain('确有实际反步兵缺口');
    expect(slingerSupport.condition).toContain('已有双金主路仍能支撑追加补兵资源');
    expect(slingerSupport.condition).toContain('接敌条件允许');
    expect(supportAdjustment.requires).toEqual([{ kind: 'unit', id: 185 }]);
    expect(supportAdjustment.text).toContain('已有双金主路仍能支撑追加补兵资源');
    expect(supportAdjustment.fallback).toContain('不展示补队建议');
    expect([firstSiege.entities[0]!.id, firstSiege.entities[0]!.age]).toEqual([331, 4]);
    expect([secondSiege.entities[0]!.id, secondSiege.entities[0]!.age]).toEqual([331, 4]);
    expect(konaBolas.required.map(({ id }) => id)).not.toContain(185);
    expect(konaSlinger.condition).toContain('黄金吃紧或确有反步兵缺口');
    expect(konaSlinger.condition).toContain('科那仍耗黄金，科那与投石手两种单位共用食物');
    expect(konaSlinger.reason).toContain('投石手承担反步兵职责');
    expect(konaSlinger.reason).toContain('黄金吃紧或反步兵职责确有需要');
    expect(konaSlinger.limitation).toContain('持续补兵仍需资源');
    expect(konaSlinger.limitation).toContain('击杀产金适用范围未完全说明');
    expect(konaSlinger.limitation).toContain('布图马普折扣仅文本、未编码');
    expect(narrative(konaSlinger)).not.toContain('掷石绳骑兵');
    expect(routeAdjustment.requires).toEqual([{ kind: 'route', id: 'mapuche-kona-bolas' }]);
    expect(routeAdjustment.text).toContain('持续支撑两条金线并承受损失');
    expect(routeAdjustment.text).toContain('安全接敌');
    expect(routeAdjustment.fallback).toContain('不展示转线建议');
  });

  it('分别表达图皮路线职责、过渡重叠、资源边界和运输候选条件', async () => {
    const champi = route('Tupi', 'tupi-champi-slinger');
    const blackwood = route('Tupi', 'tupi-blackwood-halberdier');
    const transport = champi.supplements.find(({ mode }) => mode === 'choice')!;
    const blackwoodTransport = blackwood.supplements.find(({ mode }) => mode === 'choice')!;

    expect(champi.condition).toContain('不要求同时开齐全部兵线');
    expect(champi.condition).toContain('过渡或已有兵力可重叠');
    expect(champi.condition).not.toContain('互斥');
    expect(champi.title).not.toMatch(/巨投|巨型投石机/);
    expect(narrative(champi)).not.toMatch(/黑檀木|长戟/);
    expect(champi.reason).toContain('两者共享食物');
    expect(champi.reason).toContain('完成研究后');
    expect(champi.limitation).toContain('共同缺反骑');
    expect(champi.limitation).toContain('投石手只承担反步兵');
    expect(champi.adjustments[0]!.text).toContain('载具配合仅为战术候选');
    expect(champi.adjustments[0]!.text).not.toContain('重型冲车');
    expect(champi.adjustments[0]!.text).not.toContain('攻城塔');
    expect(champi.alternatives).toContain('职责部分重叠');
    expect(champi.alternatives).toContain('不作默认投入');
    expect(champi.alternatives).not.toContain('考虑');

    expect(blackwood.condition).toContain('不要求同时开齐全部兵线');
    expect(blackwood.condition).toContain('过渡或已有兵力可重叠');
    expect(blackwood.condition).not.toContain('互斥');
    expect(blackwood.title).not.toMatch(/巨投|巨型投石机/);
    expect(narrative(blackwood)).not.toMatch(/蔷琵|投石手/);
    expect(blackwood.reason).toContain('两者共享木材');
    expect(blackwood.reason).toContain('成对训练');
    expect(blackwood.reason).toContain('计价单位未明');
    expect(blackwood.reason).toContain('不折半推算');
    expect(blackwood.limitation).toContain('长戟按骑兵压力反骑');
    expect(blackwood.limitation).toContain('不因此视为反攻城');
    expect(blackwood.attack).toContain('按需调整长戟比例');
    expect(blackwood.attack).toContain('保护黑檀木');
    expect(blackwood.attack).not.toMatch(/巨投|巨型投石机/);
    expect(blackwood.adjustments[2]!.text).toContain('按需调整长戟比例');
    expect(blackwood.adjustments[2]!.text).toContain('保护黑檀木');
    expect(blackwood.adjustments[2]!.text).not.toContain('替换部分主力');
    expect(blackwood.alternatives).toContain('另需黄金');
    expect(blackwood.alternatives).toContain('近战接敌风险');
    expect(blackwood.alternatives).toContain('不作默认投入');
    expect(blackwood.alternatives).not.toContain('考虑');

    for (const candidate of [transport, blackwoodTransport]) {
      expect(candidate.entities.map(({ id }) => id)).toEqual([548, 1105]);
      expect(candidate.condition).toContain('仅为战术候选');
      expect(candidate.condition).toContain('固定数据已核实载具装载容量，但载具兼容规则尚未接入驻军预览、实战效果仍待验证');
      expect(candidate.condition).not.toMatch(/重型冲车|攻城塔|容量\s*\d+/);
      expect(candidate.entities.map(({ id, role }) => [id, role])).toEqual([
        [548, '重型冲车（容量 6）'],
        [1105, '攻城塔（容量 10）'],
      ]);
      expect(candidate.condition).toContain('接近、卸兵、护卫、资源与操作');
      expect(candidate.condition).toContain('不把运输长戟视作反攻城');
      expect(candidate).not.toHaveProperty('requires');
    }

    const core = await loadCore();
    expect([core.unitById[185]!.en, core.unitById[185]!.zh, core.unitById[185]!.type]).toEqual(['Slinger', '投石手', 'RegionalUnit']);
    expect([core.unitById[331]!.en, core.unitById[331]!.zh, core.unitById[331]!.age]).toEqual(['Trebuchet (Packed)', '巨型投石机', 4]);
    expect([core.unitById[6]!.en, core.unitById[6]!.zh]).toEqual(['Elite Skirmisher', '精锐掷矛手']);
    expect([core.unitById[359]!.en, core.unitById[359]!.zh]).toEqual(['Halberdier', '长戟兵']);
    expect([core.unitById[2584]!.en, core.unitById[2584]!.zh]).toEqual(['Elite Ibirapema Warrior', '精锐伊比拉贝玛战士']);
  });

  it('帝王主路的精锐掷矛手支援以时代4投影，目录训练时代不变', async () => {
    const resources = await catalog();
    const tupi = byCiv('Tupi');

    expect(resources.core.unitById[6]!.age).toBe(3);
    for (const id of ['tupi-champi-slinger', 'tupi-blackwood-halberdier']) {
      const entry = route('Tupi', id);
      const support = entry.supplements.flatMap(({ entities }) => entities).find(({ id: unitId }) => unitId === 6)!;
      const contractSupport = contractRoute('Tupi', id)
        .supplements.flatMap(({ entities }) => entities)
        .find(({ id: unitId }) => unitId === 6)!;
      expect([support.id, support.age]).toEqual([6, 4]);
      expect([contractSupport.id, optionalEntityAge(contractSupport)]).toEqual([6, 4]);

      const view = projectFormation(entry, 'Tupi', DATA_PATCH, resources, tupi.routes, tupi.source);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        const projected = view.supplements.flatMap(({ entities }) => entities).find(({ entity }) => entity.id === 6)!;
        expect([projected.entity.id, projected.age]).toEqual([6, 4]);
      }
    }
  });

  it('为条件增援与跨路线建议设置真实依赖和保守fallback', () => {
    const champi = route('Tupi', 'tupi-champi-slinger');
    const blackwood = route('Tupi', 'tupi-blackwood-halberdier');
    const champiCrossRoute = champi.adjustments.find(({ id }) => id.endsWith('-fifth'))!;
    const blackwoodAntiSiege = blackwood.adjustments.find(({ id }) => id.endsWith('-first'))!;
    const blackwoodCrossRoute = blackwood.adjustments.find(({ id }) => id.endsWith('-fifth'))!;

    expect(champi.supplements.filter(({ mode }) => mode === 'conditional').flatMap(({ entities }) => entities.map(({ id }) => id))).toEqual([6, 359, 2584]);
    expect(champi.adjustments.find(({ id }) => id.endsWith('-second'))!.requires).toEqual([{ kind: 'unit', id: 6 }]);
    expect(champi.adjustments.find(({ id }) => id.endsWith('-third'))!.requires).toEqual([{ kind: 'unit', id: 359 }]);
    expect(champi.adjustments.find(({ id }) => id.endsWith('-fourth'))!.requires).toEqual([{ kind: 'unit', id: 2584 }]);
    expect(champiCrossRoute.requires).toEqual([{ kind: 'route', id: 'tupi-blackwood-halberdier' }]);
    expect(champiCrossRoute.text).toContain('共享木材');
    expect(champiCrossRoute.text).toContain('计价单位未核');
    expect(champiCrossRoute.fallback).toContain('不展示转线建议');

    expect(blackwood.supplements.filter(({ mode }) => mode === 'conditional').flatMap(({ entities }) => entities.map(({ id }) => id))).toEqual([2554, 6, 2584]);
    expect(blackwoodAntiSiege.requires).toEqual([{ kind: 'unit', id: 2554 }]);
    expect(blackwoodAntiSiege.fallback).toContain('不以运输长戟代替反攻城');
    expect(blackwood.adjustments.find(({ id }) => id.endsWith('-second'))!.requires).toEqual([{ kind: 'unit', id: 6 }]);
    expect(blackwood.adjustments.find(({ id }) => id.endsWith('-fourth'))!.requires).toEqual([{ kind: 'unit', id: 2584 }]);
    expect(blackwoodCrossRoute.requires).toEqual([{ kind: 'route', id: 'tupi-champi-slinger' }]);
    expect(blackwoodCrossRoute.text).toContain('共享食物');
    expect(blackwoodCrossRoute.text).toContain('蔷琵黄金');
    expect(blackwoodCrossRoute.fallback).toContain('不展示转线建议');
  });

  it('来源行和固定版本URL锚点按四路线独立字面期望核对', () => {
    const expected = [
      ['Mapuche', 'mapuche-kona-bolas', 948, [948, 952, 956, 957, 961, 963, 969, 970, 971, 978, 980]],
      ['Mapuche', 'mapuche-kona-slinger', 959, [952, 956, 959, 963, 970, 977, 980]],
      ['Tupi', 'tupi-champi-slinger', 1024, [1018, 1024, 1027, 1029, 1031, 1033, 1039, 1040, 1041, 1042, 1048, 1049, 1050, 1052, 1054]],
      ['Tupi', 'tupi-blackwood-halberdier', 1025, [1018, 1025, 1027, 1029, 1031, 1033, 1039, 1040, 1041, 1042, 1048, 1049, 1050, 1052, 1054]],
    ] as const;
    const url = (line: number) => `https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L${line}`;

    for (const [civ, id, line, lines] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.evidence.scope).not.toContain('来源行');
      expect(entry.evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
      expect(entry.source?.content).toBe(url(line));
      expect(contract.source.content).toBe(url(line));
    }
  });

  it('缺少可选单位或目标路线时回退；单个载具不可用不使整卡失效', async () => {
    const resources = await catalog();
    const mapuche = byCiv('Mapuche');
    const konaBolas = route('Mapuche', 'mapuche-kona-bolas');
    const withoutSlinger = { ...resources.core.unitById };
    delete withoutSlinger[185];
    const mapucheView = projectFormation(
      konaBolas,
      'Mapuche',
      DATA_PATCH,
      { core: { ...resources.core, unitById: withoutSlinger }, trees: resources.trees },
      mapuche.routes,
      mapuche.source,
    );
    expect(mapucheView.status).toBe('current');
    if (mapucheView.status === 'current')
      expect(mapucheView.adjustments.find(({ id }) => id.endsWith('-second'))).toMatchObject({
        unavailable: true,
        text: konaBolas.adjustments.find(({ id }) => id.endsWith('-second'))!.fallback,
      });

    const konaSlinger = route('Mapuche', 'mapuche-kona-slinger');
    const missingMapucheTarget = projectFormation(konaSlinger, 'Mapuche', DATA_PATCH, resources, [konaSlinger], mapuche.source);
    expect(missingMapucheTarget.status).toBe('current');
    if (missingMapucheTarget.status === 'current')
      expect(missingMapucheTarget.adjustments[0]).toMatchObject({ unavailable: true, text: konaSlinger.adjustments[0]!.fallback });

    const tupi = byCiv('Tupi');
    const blackwood = route('Tupi', 'tupi-blackwood-halberdier');
    const withoutChampi = { ...resources.core.unitById };
    delete withoutChampi[2554];
    const blackwoodView = projectFormation(
      blackwood,
      'Tupi',
      DATA_PATCH,
      { core: { ...resources.core, unitById: withoutChampi }, trees: resources.trees },
      tupi.routes,
      tupi.source,
    );
    expect(blackwoodView.status).toBe('current');
    if (blackwoodView.status === 'current')
      expect(blackwoodView.adjustments.find(({ id }) => id.endsWith('-first'))).toMatchObject({
        unavailable: true,
        text: blackwood.adjustments[0]!.fallback,
      });

    const champi = route('Tupi', 'tupi-champi-slinger');
    const withoutBlackwoodRoute = projectFormation(champi, 'Tupi', DATA_PATCH, resources, [champi], tupi.source);
    expect(withoutBlackwoodRoute.status).toBe('current');
    if (withoutBlackwoodRoute.status === 'current')
      expect(withoutBlackwoodRoute.adjustments.find(({ id }) => id.endsWith('-fifth'))).toMatchObject({
        unavailable: true,
        text: champi.adjustments.find(({ id }) => id.endsWith('-fifth'))!.fallback,
      });

    const withoutIbirapemaAndTrebuchet = { ...resources.core.unitById };
    delete withoutIbirapemaAndTrebuchet[2584];
    delete withoutIbirapemaAndTrebuchet[331];
    for (const entry of [champi, blackwood]) {
      const view = projectFormation(
        entry,
        'Tupi',
        DATA_PATCH,
        { core: { ...resources.core, unitById: withoutIbirapemaAndTrebuchet }, trees: resources.trees },
        tupi.routes,
        tupi.source,
      );
      const freeText = [entry.title, entry.condition, entry.reason, entry.limitation, entry.attack, entry.defense, entry.alternatives].join(' ');
      expect(freeText).not.toMatch(/巨投|巨型投石机/);
      expect(freeText).not.toMatch(/伊比拉贝玛[^。；]*(仅在|只在|可考虑|才考虑)/);
      expect(entry.alternatives).toContain('不作默认投入');
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        const projectedIds = view.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id));
        expect(projectedIds).not.toContain(2584);
        expect(projectedIds).not.toContain(331);
        expect(view.adjustments.find(({ id }) => id.endsWith('-fourth'))).toMatchObject({
          unavailable: true,
          text: entry.adjustments.find(({ id }) => id.endsWith('-fourth'))!.fallback,
        });
      }
    }

    const withoutRam = { ...resources.core.unitById };
    delete withoutRam[548];
    const transportUnavailable = projectFormation(
      champi,
      'Tupi',
      DATA_PATCH,
      { core: { ...resources.core, unitById: withoutRam }, trees: resources.trees },
      tupi.routes,
      tupi.source,
    );
    expect(transportUnavailable.status).toBe('current');
    if (transportUnavailable.status === 'current') {
      const choice = transportUnavailable.supplements.find(({ mode }) => mode === 'choice')!;
      const projectedIds = choice.entities.map(({ entity }) => entity.id);
      expect(projectedIds).toContain(1105);
      expect(projectedIds).not.toContain(548);
    }
  });
});
