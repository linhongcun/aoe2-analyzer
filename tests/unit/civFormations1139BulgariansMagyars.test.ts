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
    expect(main.evidence.playtest).toContain('其他敌情只有站内接触 PK');
    expect(main.evidence.playtest).toContain('未单独经其实际对局确认');
    expect(main.evidence.scope).not.toContain('来源行');
    expect(main.evidence.scope).toContain(`ID1254${rightArrow}1255`);
    expect(main.evidence.scope).toContain('ID1225');
    expect(main.evidence.recordedVersion).toBe('v0.77.105 · DE 188329');
    expect(main.reason).toContain('前线营垒');
    expect(main.reason).not.toMatch(/实战|接触 PK|每击/);
    expect(main.limitation).toContain('驻军箭数是站内理论预览、未与客户端核对');
    expect(main.limitation).toContain('未叠加科技的目录基础值');
    expect(main.limitation).toContain('只算骑马阶段 1v1');
    expect(main.limitation).toContain('不含下马、射程/走位或混编');

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
      expect(adjustment.text).toContain('射程/走位');
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
    expect(comparisons[1]!.text).toContain('66/140');
    expect(comparisons[1]!.text).toContain('没有做同资源比较');
    expect(comparisons[2]!.text).toContain('75/140');
    expect(comparisons[3]!.text).toContain('132.8/140');
    expect(comparisons[4]!.text).toContain('70/140');
    expect(comparisons[4]!.text).toContain('35 血');

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
    expect(main.evidence.playtest).toContain('是 hongcun 判断');
    expect(main.evidence.playtest).toContain('站内工具不能验证');
    expect(main.evidence.playtest).toContain('未单独经 hongcun 实战确认');
    expect(main.evidence.scope).not.toContain('来源行');
    expect(main.evidence.recordedVersion).toBe('DE 188329 · 2026-11-15 读取；未记录站点版本/构建');
    expect(main.reason).toContain('城堡生产');
    expect(main.reason).toContain('重装骑射手提供远程输出');
    expect(main.limitation).toContain('帝王时代并完成科维尼安军队、反曲弓等研究后才成型');
    expect(main.limitation).toContain('城堡产能');
    expect(main.limitation).toContain('前后排多线操作');
    expect(main.limitation).toContain('群战是集火模型');
    expect(main.limitation).toContain('人数偏多的一方结果偏好');
    expect(main.limitation).toContain('未折算节省资源');
    expect(main.limitation).not.toMatch(/110 血|15 攻|12 攻|8 射程|30 秒/);

    const [cavalry, halberdier, infantry, rangedSiege] = main.adjustments;
    expect(cavalry!.text).toContain('单挑接触 PK');
    expect(cavalry!.text).toContain('等资源群战模型');
    expect(cavalry!.text).toContain('不计包围空间和走位');
    expect(cavalry!.text).toContain('人数偏多的一方结果偏好');
    expect(cavalry!.text).toContain('不能当胜率');
    expect(cavalry!.text).toContain('仅站内模型，未单独经hongcun实战确认');
    expect(halberdier!.text).toContain('hongcun 判断');
    expect(halberdier!.text).toContain('站内 PK 不能验证');
    expect(infantry!.text).toContain('接触 PK');
    expect(infantry!.text).toContain('仅站内模型，未单独经hongcun实战确认');
    expect(infantry!.text).toContain('不含射程拉扯、接近护卫或群战');
    expect(infantry!.text).toContain('4/70');
    expect(rangedSiege!.text).toContain('接触 PK');
    expect(rangedSiege!.text).toContain('仅站内模型，未单独经hongcun实战确认');
    expect(rangedSiege!.text).toContain('不模拟射程拉扯、接近或护卫');
    expect(rangedSiege!.text).toContain('不能把“骠骑冲”当作已验证策略');
    expect(main.adjustments).toHaveLength(4);
  });

  it('为两条路线记录独立字面来源行和固定 URL 锚点', () => {
    const expected = [
      ['Bulgarians', 'bulgarians-krepost-konnik', 718, [718, 722, 723, 724, 726, 728, 730, 734, 737, 745, 746, 747, 748, 749, 751, 757, 758, 759, 760, 764]],
      [
        'Magyars',
        'magyars-huszar-hca',
        770,
        [770, 774, 775, 776, 777, 779, 781, 783, 789, 791, 793, 801, 802, 803, 804, 806, 812, 813, 814, 815, 816, 820, 822],
      ],
    ] as const;
    const url = (line: number) => `https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L${line}`;

    for (const [civ, id, line, lines] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect(entry.evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
      expect(entry.source?.content).toBe(url(line));
      expect(contract.source.content).toBe(url(line));
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
