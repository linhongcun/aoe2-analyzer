import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties, optionalEntityAge } from './civFormationsTestUtils';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const rightArrow = String.fromCodePoint(0x2192);
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;

describe('#1139 保加利亚与马扎尔实战/模型证据边界', () => {
  it('保留保加利亚主路与营垒单位目录映射，马镫仍为可选机制支持', () => {
    const main = route('Bulgarians', 'bulgarians-krepost-konnik');
    const contract = contractRoute('Bulgarians', main.id);
    const progression = main.supplements.find(({ mode }) => mode === 'progression')!;
    const siege = main.supplements.find(({ mode }) => mode === 'choice')!;
    const stirrups = main.supplements.find(({ mode }) => mode === 'mechanism-support')!;

    expect([main.status, main.playtest, main.composition, main.age]).toEqual(['approved', 'reported', 'combined', 3]);
    expect(main.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 1251],
      ['unit', 1254],
    ]);
    expect(main.prerequisites).toEqual([]);
    expect([progression.entities[0]!.id, progression.entities[0]!.age]).toEqual([1255, 4]);
    expect(siege.entities.map(({ id, age }) => [id, age])).toEqual([
      [331, 4],
      [548, 4],
    ]);
    expect(stirrups.entities.map(({ id }) => id)).toEqual([685]);
    expect([...main.required, ...main.prerequisites].some(({ id }) => id === 1255 || id === 685)).toBe(false);
    expect(main.supplements.some(({ entities }) => entities.some(({ id }) => id === 1225 || id === 1227))).toBe(false);
    expect(contract.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 1251],
      ['unit', 1254],
    ]);
    expect(contract.prerequisites).toEqual([]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map((entity) => [entity.id, optionalEntityAge(entity)])])).toEqual([
      ['progression', [[1255, 4]]],
      [
        'choice',
        [
          [331, 4],
          [548, 4],
        ],
      ],
      ['mechanism-support', [[685, undefined]]],
    ]);

    expect(main.evidence.playtest).toContain('报告使用过主组合');
    expect(main.evidence.playtest).toContain('与游侠的直接对拼');
    expect(main.evidence.playtest).toContain('其他敌情只有站内接触 1v1 与碰撞接敌等资源群战模型');
    expect(main.evidence.playtest).toContain('未单独经其实际对局确认');
    expect(main.evidence.scope).not.toContain('来源行');
    expect(main.evidence.scope).toContain(`ID1254${rightArrow}1255`);
    expect(main.evidence.scope).toContain('ID1225');
    expect(main.evidence.scope).toContain('20 个村民驻营垒理论预览 17/21 箭，19 个村民即达 17/21 箭');
    expect(main.evidence.recordedVersion).toBe(
      'v0.77.105 · DE 188329；驻军满科技复核：v0.99.12 · DE 188329 · 66620c9；碰撞接敌复核：v0.99.15 · DE 188329 · d070ec71；第一档批 2 全工具复核：v0.99.56 · DE 188329',
    );
    expect(main.evidence.links).toHaveLength(12);
    expect(main.evidence.links?.[0]).toEqual({
      label: '帝王满科技 · 20 个村民驻营垒 17/21 箭',
      href: 'https://linhongcun.github.io/aoe2-analyzer/#/building/1251?tab=garrison&gv=2&civ=Bulgarians&age=4&gtechs=199,200,201,47&army=83:20:e',
    });
    expect(main.evidence.links?.[1]).toEqual({
      label: '营垒精锐保加利亚骑兵（含下马形态资料）',
      href: 'https://linhongcun.github.io/aoe2-analyzer/#/unit/1255?civ=Bulgarians',
    });
    expect(main.reason).toContain('前线营垒');
    expect(main.reason).not.toMatch(/实战|接触 PK|每击/);
    expect(main.limitation).toContain('驻军箭数是站内理论预览、未与客户端核对');
    expect(main.limitation).toContain('未叠加科技的目录基础值');
    expect(main.limitation).toContain('均只算骑马阶段');
    expect(main.limitation).toContain('不含拉扯、二维包抄或混编');

    expect(contract.adjustments[5]).toEqual({
      id: 'bulgarians-krepost-konnik-adjustment-sixth',
      requires: [
        { kind: 'building', id: 82 },
        { kind: 'tech', id: 685 },
      ],
    });
    expect(contract.adjustments[6]).toEqual({
      id: 'bulgarians-krepost-konnik-adjustment-seventh',
      requires: [
        { kind: 'building', id: 82 },
        { kind: 'unit', id: 331, age: 4 },
      ],
    });
    expect(main.adjustments[5]!.requires).toEqual([
      { kind: 'building', id: 82 },
      { kind: 'tech', id: 685 },
    ]);
    expect(main.adjustments[5]!.text).toContain('马镫需在城堡研究');
    expect(main.adjustments[5]!.text).toContain('不是保加利亚骑兵训练前置');
    expect(main.adjustments[5]!.fallback).toContain('不将马镫列为训练前置');
    expect(main.adjustments[6]!.when).toContain('规划帝王时代巨投');
    expect(main.adjustments[6]!.requires).toEqual([
      { kind: 'building', id: 82 },
      { kind: 'unit', id: 331, age: 4 },
    ]);
    expect(main.adjustments[6]!.fallback).toContain('不展示建城或巨投生产结论');
    expect(main.alternatives).not.toMatch(/第一座城堡仍要修|马镫和巨投都靠它/);
    expect(main.alternatives).toContain('不为量产主力重复建城堡');
  });

  it('将五个保加利亚对位 PK 限定为帝王精锐接触模型并逐项依赖精锐单位', () => {
    const main = route('Bulgarians', 'bulgarians-krepost-konnik');
    const contract = contractRoute('Bulgarians', main.id);
    const comparisons = main.adjustments.slice(0, 5);
    const contractComparisons = contract.adjustments.slice(0, 5);

    expect(comparisons).toHaveLength(5);
    for (const [index, adjustment] of comparisons.entries()) {
      expect(adjustment.requires).toEqual([{ kind: 'unit', id: 1255, age: 4 }]);
      expect(adjustment.fallback).toContain('不展示');
      expect(adjustment.text).toContain('帝王精锐');
      expect(adjustment.text).toContain('接触');
      expect(adjustment.text).toContain('不含下马');
      expect(adjustment.text).toContain('拉扯/走位');
      expect(adjustment.text).toContain('混编');
      expect(adjustment.text).toMatch(/不是胜率|不能当实战胜率/);
      if (index > 0) expect(adjustment.text).toContain('仅站内模型，未单独经hongcun实战确认');
      expect(contractComparisons[index]!.requires).toEqual([{ kind: 'unit', id: 1255, age: 4 }]);
    }

    expect(comparisons.map(({ when }) => when)).toEqual(['骑士、游侠成群', '长戟兵多', '冠军剑士等步兵成群', '弓手成群', '手推炮']);
    expect(comparisons[0]!.text.indexOf('实战体验')).toBeLessThan(comparisons[0]!.text.indexOf('帝王精锐'));
    expect(comparisons[0]!.text).toContain('13 对 13');
    expect(comparisons[0]!.text).toContain('37/180');
    expect(comparisons[0]!.text).toContain('49/192');
    expect(comparisons[0]!.text).toContain('2/22');
    expect(comparisons[1]!.text).toContain('66/140');
    expect(comparisons[1]!.text).toContain('9/50');
    expect(comparisons[2]!.text).toContain('75/140');
    expect(comparisons[2]!.text).toContain('3/42');
    expect(comparisons[3]!.text).toContain('132.8/140');
    expect(comparisons[3]!.text).toContain('1/23');
    expect(comparisons[4]!.text).toContain('70/140');
    expect(comparisons[4]!.text).toContain('35 血');
    expect(comparisons[4]!.text).toContain('21/23');

    const publicText = [main.title, main.condition, main.reason, main.limitation, main.attack, main.defense].join(' ');
    expect(publicText).not.toMatch(/37\/180|66\/140|75\/140|132\.8\/140|70\/140/);
  });

  it('保留马扎尔实战报告，同时把判断、单挑、群战与站内 PK 分开标明', () => {
    const main = route('Magyars', 'magyars-huszar-hca');
    const contract = contractRoute('Magyars', main.id);

    expect([main.status, main.playtest, main.composition, main.age]).toEqual(['approved', 'reported', 'combined', 4]);
    expect(main.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 82],
      ['unit', 871],
      ['unit', 474],
      ['unit', 331],
      ['tech', 514],
      ['tech', 515],
    ]);
    expect(main.prerequisites).toEqual([]);
    expect(contract.required.map(({ kind, id }) => [kind, id])).toEqual(main.required.map(({ kind, id }) => [kind, id]));
    expect(main.evidence.playtest).toContain('主组合标为实战用过');
    expect(main.evidence.playtest).toContain('未提供具体对局或胜率');
    expect(main.evidence.playtest).toContain('来自 hongcun 判断');
    expect(main.evidence.playtest).toContain('碰撞接敌站桩模型量化印证');
    expect(main.evidence.playtest).toContain('未单独经 hongcun 实战确认');
    expect(main.evidence.scope).not.toContain('来源行');
    expect(main.evidence.recordedVersion).toBe(
      'DE 188329 · 2026-11-15 读取；碰撞接敌复核：v0.99.15 · DE 188329 · d070ec71；拉扯复核：v0.99.34 · DE 188329 · 55613e4a',
    );
    expect(main.reason).toContain('城堡生产');
    expect(main.reason).toContain('重装骑射手提供远程输出');
    expect(main.limitation).toContain('帝王时代并完成科维尼安军队、反曲弓等研究后才成型');
    expect(main.limitation).toContain('城堡产能');
    expect(main.limitation).toContain('前后排多线操作');
    expect(main.limitation).toContain('碰撞接敌群战已计入碰撞体积、前排占位、射程先手与最小射程');
    expect(main.limitation).toContain('后撤上限 40 格、不含二维包抄与护卫');
    expect(main.limitation).toContain('未折算节省资源');
    expect(main.limitation).not.toMatch(/110 血|15 攻|12 攻|8 射程|30 秒/);

    const [cavalry, halberdier, infantry, rangedSiege] = main.adjustments;
    expect(cavalry!.text).toContain('单挑接触 PK');
    expect(cavalry!.text).toContain('碰撞接敌群战亦反转落败');
    expect(cavalry!.text).toContain('5/22');
    expect(cavalry!.text).toContain('880 血');
    expect(cavalry!.text).toContain('不能当胜率');
    expect(cavalry!.text).toContain('未单独经 hongcun 实战确认');
    expect(halberdier!.text).toContain('hongcun 判断');
    expect(halberdier!.text).toContain('24/30');
    expect(halberdier!.text).toContain('9/15');
    expect(halberdier!.text).toContain('15/15');
    expect(halberdier!.text).toContain('30/30 满血零损');
    expect(halberdier!.text).toContain('后撤上限 40 格、不含二维包抄与护卫');
    expect(infantry!.text).toContain('接触 1v1');
    expect(infantry!.text).toContain('未单独经 hongcun 实战确认');
    expect(infantry!.text).toContain('28/30');
    expect(infantry!.text).toContain('后撤上限 40 格、不含二维包抄与护卫');
    expect(infantry!.text).toContain('4/70');
    expect(infantry!.text).toContain('15/30');
    expect(rangedSiege!.text).toContain('接触 1v1');
    expect(rangedSiege!.text).toContain('未单独经 hongcun 实战确认');
    expect(rangedSiege!.text).toContain('2/37');
    expect(rangedSiege!.text).toContain('21/30');
    expect(rangedSiege!.text).toContain('35/37');
    expect(main.adjustments).toHaveLength(4);
  });

  it('为两条路线记录独立字面来源行和固定 URL 锚点', () => {
    const expected = [
      [
        'Bulgarians',
        'bulgarians-krepost-konnik',
        'https://github.com/linhongcun/aoe2-analyzer/blob/798133a5f20ee5b2b7261895bca3c505495415a6/role/game-strategy.md#L1055-L1112',
        [1055, 1059, 1063, 1064, 1065, 1069, 1071, 1075, 1078, 1081, 1093, 1094, 1095, 1096, 1097, 1099, 1105, 1106, 1107, 1108, 1110, 1112],
      ],
      [
        'Magyars',
        'magyars-huszar-hca',
        'https://github.com/linhongcun/aoe2-analyzer/blob/415863b2a3e94078129554c09378c9a9fba04b57/role/game-strategy.md#L977-L1033',
        [977, 981, 985, 986, 987, 988, 990, 992, 998, 1000, 1002, 1008, 1012, 1013, 1014, 1015, 1017, 1023, 1024, 1025, 1026, 1027, 1031, 1033],
      ],
    ] as const;

    for (const [civ, id, url, lines] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
      expect(entry.source?.content).toBe(url);
      expect(contract.source.content).toBe(url);
    }
  });

  it('缺少精锐保加利亚骑兵时保留帝王比较 fallback，主路仍可投影', async () => {
    const main = route('Bulgarians', 'bulgarians-krepost-konnik');
    const bulgarians = byCiv('Bulgarians');
    const core = await loadCore();
    const trees = await loadTrees();
    expect(core.unitById[1255]!.age).toBe(4);
    const unitById = { ...core.unitById };
    delete unitById[1255];

    const view = projectFormation(main, 'Bulgarians', DATA_PATCH, { core: { ...core, unitById }, trees }, bulgarians.routes, bulgarians.source);
    expect(view.status).toBe('current');
    if (view.status === 'current') {
      expect(view.required.map(({ entity }) => entity.id)).toEqual([1251, 1254]);
      expect(view.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(1255);
      for (const adjustment of main.adjustments.slice(0, 5)) {
        expect(view.adjustments.find(({ id }) => id === adjustment.id)).toMatchObject({
          unavailable: true,
          text: adjustment.fallback,
        });
      }
      expect(view.adjustments.find(({ id }) => id.endsWith('-sixth'))).toMatchObject({ text: main.adjustments[5]!.text });
      expect(view.adjustments.find(({ id }) => id.endsWith('-seventh'))).toMatchObject({ text: main.adjustments[6]!.text });
    }
  });

  it('缺少马镫、城堡或巨投时仅回退对应建议，营垒主路与重型冲车仍可用', async () => {
    const main = route('Bulgarians', 'bulgarians-krepost-konnik');
    const bulgarians = byCiv('Bulgarians');
    const resources = { core: await loadCore(), trees: await loadTrees() };
    const project = (core: typeof resources.core) =>
      projectFormation(main, 'Bulgarians', DATA_PATCH, { core, trees: resources.trees }, bulgarians.routes, bulgarians.source);

    const techById = { ...resources.core.techById };
    delete techById[685];
    const withoutStirrups = project({ ...resources.core, techById });
    expect(withoutStirrups.status).toBe('current');
    if (withoutStirrups.status === 'current') {
      expect(withoutStirrups.adjustments.find(({ id }) => id.endsWith('-sixth'))).toMatchObject({
        unavailable: true,
        text: main.adjustments[5]!.fallback,
      });
      expect(withoutStirrups.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(685);
    }

    const buildingById = { ...resources.core.buildingById };
    delete buildingById[82];
    const withoutCastle = project({ ...resources.core, buildingById });
    expect(withoutCastle.status).toBe('current');
    if (withoutCastle.status === 'current') {
      expect(withoutCastle.required.map(({ entity }) => entity.id)).toEqual([1251, 1254]);
      expect(withoutCastle.adjustments.find(({ id }) => id.endsWith('-sixth'))).toMatchObject({
        unavailable: true,
        text: main.adjustments[5]!.fallback,
      });
      expect(withoutCastle.adjustments.find(({ id }) => id.endsWith('-seventh'))).toMatchObject({
        unavailable: true,
        text: main.adjustments[6]!.fallback,
      });
    }

    const unitById = { ...resources.core.unitById };
    delete unitById[331];
    const withoutTrebuchet = project({ ...resources.core, unitById });
    expect(withoutTrebuchet.status).toBe('current');
    if (withoutTrebuchet.status === 'current') {
      const supplementIds = withoutTrebuchet.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id));
      expect(supplementIds).not.toContain(331);
      expect(supplementIds).toContain(548);
      expect(withoutTrebuchet.required.map(({ entity }) => entity.id)).toEqual([1251, 1254]);
      expect(withoutTrebuchet.adjustments.find(({ id }) => id.endsWith('-seventh'))).toMatchObject({
        unavailable: true,
        text: main.adjustments[6]!.fallback,
      });
    }

    expect(main.alternatives).not.toMatch(/第一座城堡仍要修|马镫和巨投都靠它/);
  });

  it('保留 Spanish/Georgians 原四路线的状态、组成、时代与 required', () => {
    const expected = [
      ['Spanish', 'conquistador-hussar', [773, 441]],
      ['Spanish', 'paladin-skirmisher', [569, 6]],
      ['Spanish', 'handcannon-halberdier', [5, 359]],
      ['Georgians', 'monaspa-towers', [1805, 235, 923]],
    ] as const;

    for (const [civ, id, required] of expected) {
      const entry = route(civ, id);
      expect([entry.status, entry.playtest, entry.composition, entry.age]).toEqual(['approved', 'unreported', 'combined', 4]);
      expect(entry.required.map(({ id: entityId }) => entityId)).toEqual(required);
      expect(contractRoute(civ, id).required.map(({ id: entityId }) => entityId)).toEqual(required);
    }
  });
});
