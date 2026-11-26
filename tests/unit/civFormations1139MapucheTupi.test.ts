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
      [
        'Mapuche',
        'mapuche-kona-bolas',
        3,
        'combined',
        'unreported',
        [2566, 2569],
        'v0.78.3 · DE 188329 · 构建 40c323a；拉扯与展示复核：v0.99.34 · DE 188329 · 55613e4a',
      ],
      [
        'Mapuche',
        'mapuche-kona-slinger',
        3,
        'combined',
        'unreported',
        [2566, 185],
        'v0.78.3 · DE 188329 · 构建 40c323a；展示与机制复核：v0.99.34 · DE 188329 · 55613e4a',
      ],
      [
        'Tupi',
        'tupi-champi-slinger',
        4,
        'combined',
        'unreported',
        [2554, 185],
        'v0.77.107、构建 da6e280 为前次观察，本次未刷新核对；载具容量复核：v0.99.12 · DE 188329 · 66620c9；拉扯复核：v0.99.34 · DE 188329 · 55613e4a；转线口径同步：v0.99.44 · DE 188329 · f1d5aab；第一档批 2 全工具复核：v0.99.56 · DE 188329',
      ],
      [
        'Tupi',
        'tupi-blackwood-halberdier',
        4,
        'combined',
        'reported',
        [2581, 359],
        'v0.77.107、构建 da6e280 为前次观察，本次未刷新核对；载具容量复核：v0.99.12 · DE 188329 · 66620c9；成对训练与群战复核：v0.99.44 · DE 188329 · f1d5aab；第一档批 2 全工具复核：v0.99.56 · DE 188329；策略与实战反馈同步：v0.99.58 · DE 188329',
      ],
    ] as const;

    for (const [civ, id, age, composition, playtest, required, version] of expected) {
      const entry = route(civ, id);
      expect([entry.status, entry.playtest, entry.composition, entry.age, entry.required.map(({ id: unitId }) => unitId)]).toEqual([
        'approved',
        playtest,
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
    expect(konaBolas.limitation).toContain('布图马普（1380）支持手动勾选套用 -15% 折后价，但团队资源标记 res:33 仍未解码、全站自动预设跳过');
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
    expect(konaSlinger.limitation).toContain('布图马普（1380）支持手动勾选套用 -15% 折后价，但团队资源标记 res:33 仍未解码、全站自动预设跳过');
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
    expect(blackwood.reason).toContain('40 木材＋45 黄金产 2 名');
    expect(blackwood.reason).toContain('70 只精锐黑檀木步弓手');
    expect(blackwood.reason).not.toMatch(/计价单位未明|不折半推算/);
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
    expect(champiCrossRoute.text).toContain('40 木材＋45 黄金产 2 名');
    expect(champiCrossRoute.text).not.toContain('计价单位未核');
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
    const MAPUCHE_SHA = '415863b2a3e94078129554c09378c9a9fba04b57';
    const TUPI_SHA = '798133a5f20ee5b2b7261895bca3c505495415a6';
    const expected = [
      ['Mapuche', 'mapuche-kona-bolas', MAPUCHE_SHA, 'L1185-L1221', [1185, 1187, 1191, 1195, 1196, 1198, 1202, 1204, 1210, 1211, 1212, 1219, 1221]],
      ['Mapuche', 'mapuche-kona-slinger', MAPUCHE_SHA, 'L1200', [1187, 1191, 1200, 1204, 1211, 1218, 1221]],
      [
        'Tupi',
        'tupi-champi-slinger',
        TUPI_SHA,
        'L1419-L1470',
        [1419, 1421, 1428, 1430, 1439, 1440, 1442, 1445, 1447, 1449, 1455, 1456, 1457, 1458, 1464, 1465, 1466, 1468, 1470],
      ],
      [
        'Tupi',
        'tupi-blackwood-halberdier',
        TUPI_SHA,
        'L1419-L1470',
        [1419, 1421, 1427, 1430, 1432, 1433, 1434, 1435, 1438, 1439, 1440, 1441, 1443, 1445, 1447, 1449, 1455, 1456, 1457, 1458, 1464, 1465, 1466, 1468, 1470],
      ],
    ] as const;
    const url = (sha: string, anchor: string) => `https://github.com/linhongcun/aoe2-analyzer/blob/${sha}/role/game-strategy.md#${anchor}`;

    for (const [civ, id, sha, anchor, lines] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.evidence.scope).not.toContain('来源行');
      expect(entry.evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
      expect(entry.source?.content).toBe(url(sha, anchor));
      expect(contract.source.content).toBe(url(sha, anchor));
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
