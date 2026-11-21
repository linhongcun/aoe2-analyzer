import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';
import { assertDefinedProperties, optionalEntityAge } from './civFormationsTestUtils';

const CHINESE_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/2273171e5424e99ba556f5b77819acef56aa06f5/role/game-strategy.md#L205-L241';
const BYZANTINE_SOURCE_URL = 'https://github.com/linhongcun/aoe2-analyzer/blob/8d1adeacc7c97374ee6d95d9cabfceb793d080d3/role/game-strategy.md#L283';
const CHINESE_SOURCE_LINES = [205, 209, 213, 214, 215, 216, 218, 220, 226, 227, 228, 229, 235, 236, 237, 239, 241];
const BYZANTINE_SOURCE_LINES = [283, 285, 287, 288, 289, 290, 292, 294, 300, 301, 302, 308, 309, 310, 312];

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => {
  const formation = byCiv(civ).routes.find((entry) => entry.id === id)!;
  assertDefinedProperties(formation, 'adjustments');
  return formation;
};
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;

describe('#1139 中国与拜占庭路线边界', () => {
  it('保留路线元数据，并将中国的职责、限制及城堡驻塔变体分开', () => {
    const chinese = route('Chinese', 'china-fire-lancer-tower');
    const contract = contractRoute('Chinese', chinese.id);
    const castleReuse = chinese.adjustments.find(({ id }) => id.endsWith('-fifth'))!;

    expect([chinese.status, chinese.playtest, chinese.age, chinese.composition]).toEqual(['approved', 'pending', 4, 'combined']);
    expect(chinese.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['building', 235],
      ['unit', 1903],
      ['unit', 546],
      ['unit', 331],
    ]);
    expect(chinese.prerequisites).toEqual([]);
    expect(chinese.limitation).toContain('没有手推炮和攻城技师');
    expect(chinese.limitation).toContain('轻骑接近');
    expect(chinese.limitation).toContain('石料');
    expect(chinese.limitation).toContain('火矛争黄金');
    expect(chinese.limitation).toContain('接触PK对位不等同混编或实战胜负');
    expect(chinese.limitation).not.toMatch(/长城提高箭塔生命|火矛兵驻塔增箭|巨型投石机拆防御/);
    expect(chinese.reason).toContain('原来的诸葛弩路线是实战用过的打法');
    expect(chinese.alternatives).not.toContain('已有城堡和诸葛弩时');
    expect(chinese.alternatives).not.toContain('3 个精锐诸葛弩驻塔');
    expect(castleReuse.text).toContain('无射箭槽时 3 个精锐诸葛弩是 5/5 箭');
    expect(castleReuse.text).toContain('含射箭槽时 3 个是 4/5 箭，4 个才达 5/5 箭');
    expect(castleReuse.text).toContain('沿用现有城堡产能');
    expect(castleReuse.text).toContain('不反复前推城堡');
    expect(castleReuse.requires).toEqual([
      { kind: 'building', id: 82, age: 4 },
      { kind: 'unit', id: 559, age: 4 },
    ]);
    expect(castleReuse.fallback).toContain('不把城堡或诸葛弩加入本路必需组成');
    expect(chinese.adjustments[0]!.requires).toEqual([{ kind: 'unit', id: 359, age: 4 }]);
    expect(chinese.adjustments[1]!.requires).toEqual([{ kind: 'unit', id: 559, age: 4 }]);
    expect(contract.required.map(({ kind, id }) => [kind, id])).toEqual(chinese.required.map(({ kind, id }) => [kind, id]));
    expect(contract.prerequisites).toEqual([]);
    expect(contract.adjustments).toEqual(chinese.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
    expect(chinese.evidence.scope).not.toContain('固定策略记录来源行');
  });

  it('保留拜占庭主路，按真实实体依赖条件化骆驼、后勤学和基础投石车评估', () => {
    const byzantines = route('Byzantines', 'byzantines-cataphract');
    const contract = contractRoute('Byzantines', byzantines.id);
    const camel = byzantines.adjustments[0]!;
    const mangonel = byzantines.adjustments[1]!;
    const logistics = byzantines.adjustments[2]!;

    expect([byzantines.status, byzantines.playtest, byzantines.age, byzantines.composition]).toEqual(['approved', 'unreported', 4, 'combined']);
    expect(byzantines.required.map(({ kind, id }) => [kind, id])).toEqual([
      ['unit', 553],
      ['unit', 359],
      ['unit', 6],
    ]);
    expect(byzantines.prerequisites).toEqual([]);
    expect(byzantines.limitation).toContain('城堡产能');
    expect(byzantines.limitation).toContain('帝王多线科技投入');
    expect(byzantines.limitation).toContain('不是通用反游侠单位');
    expect(byzantines.limitation).toContain('缺血统与鼓风炉');
    expect(byzantines.limitation).toContain('不含射程、走位或践踏');
    expect(byzantines.limitation).not.toMatch(/长矛系费用减免|不耗黄金|正面反骑|反弓/);
    expect(byzantines.evidence.playtest).toContain('不推断已验证或未验证');
    expect(byzantines.evidence.recordedVersion).toContain('v0.77.102 · DE 188329 · 84988dd');
    expect(byzantines.evidence.recordedVersion).toContain('v0.77.100 · DE 188329 · 66c4763');

    expect(camel.requires).toEqual([{ kind: 'unit', id: 330, age: 4 }]);
    expect(camel.fallback).toContain('隐藏骆驼建议');
    expect(mangonel.requires).toEqual([{ kind: 'unit', id: 280, age: 4 }]);
    expect(mangonel.when).toBe('弓手为主、无法安全接近且需范围威胁');
    expect(mangonel.text).toContain('投石车系基础目录参考');
    expect(mangonel.text).toContain('具体等级另行评估');
    expect(mangonel.text).toContain('不作固定配套');
    expect(mangonel.fallback).toContain('不替它指定其他攻城单位或升级形态');
    expect([mangonel.when, mangonel.text, mangonel.fallback, byzantines.supplements[2]!.condition].join(' ')).not.toMatch(/\b(?:280|331)\b/);
    expect(logistics.requires).toEqual([{ kind: 'tech', id: 61, age: 4 }]);
    expect(logistics.fallback).toContain('不暗示科技已研究');
    expect(byzantines.supplements.map(({ mode, entities }) => [mode, entities.map(({ id, age }) => [id, age])])).toEqual([
      ['conditional', [[330, undefined]]],
      [
        'choice',
        [
          [36, undefined],
          [331, undefined],
        ],
      ],
      ['conditional-evaluation', [[280, 4]]],
      ['mechanism-support', [[61, undefined]]],
    ]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map((entity) => [entity.id, optionalEntityAge(entity)])])).toEqual(
      byzantines.supplements.map(({ mode, entities }) => [mode, entities.map(({ id, age }) => [id, age])]),
    );
    expect(contract.adjustments).toEqual(byzantines.adjustments.map(({ id, requires }) => ({ id, requires: requires ?? [] })));
  });

  it('uses literal fixed-source URLs and source lines for both routes', () => {
    const chinese = route('Chinese', 'china-fire-lancer-tower');
    const byzantines = route('Byzantines', 'byzantines-cataphract');
    assertDefinedProperties(chinese, 'source');
    assertDefinedProperties(byzantines, 'source');

    expect(chinese.source.content).toBe(CHINESE_SOURCE_URL);
    expect(contractRoute('Chinese', chinese.id).source.content).toBe(CHINESE_SOURCE_URL);
    expect(chinese.evidence.sourceLines).toEqual(CHINESE_SOURCE_LINES);
    expect(contractRoute('Chinese', chinese.id).sourceLines).toEqual(CHINESE_SOURCE_LINES);
    expect(byzantines.source.content).toBe(BYZANTINE_SOURCE_URL);
    expect(contractRoute('Byzantines', byzantines.id).source.content).toBe(BYZANTINE_SOURCE_URL);
    expect(byzantines.evidence.sourceLines).toEqual(BYZANTINE_SOURCE_LINES);
    expect(contractRoute('Byzantines', byzantines.id).sourceLines).toEqual(BYZANTINE_SOURCE_LINES);
  });

  it('缺少可选实体时只回退对应建议，主路仍可用且其他选择保留', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const chinese = byCiv('Chinese');
    const chineseRoute = route('Chinese', 'china-fire-lancer-tower');
    const byzantines = byCiv('Byzantines');
    const byzantineRoute = route('Byzantines', 'byzantines-cataphract');
    const project = (civ: 'Chinese' | 'Byzantines', entry: typeof chineseRoute, currentCore: typeof core) => {
      const civContent = civ === 'Chinese' ? chinese : byzantines;
      return projectFormation(entry, civ, DATA_PATCH, { core: currentCore, trees }, civContent.routes, civContent.source);
    };

    const withoutHalberdier = { ...core.unitById };
    delete withoutHalberdier[359];
    const noChineseHalberdier = project('Chinese', chineseRoute, { ...core, unitById: withoutHalberdier });
    expect(noChineseHalberdier.status).toBe('current');
    if (noChineseHalberdier.status === 'current') {
      expect(noChineseHalberdier.adjustments.find(({ id }) => id.endsWith('-first'))).toMatchObject({
        unavailable: true,
        text: chineseRoute.adjustments[0]!.fallback,
      });
    }

    const withoutChuKoNu = { ...core.unitById };
    delete withoutChuKoNu[559];
    const noChineseChuKoNu = project('Chinese', chineseRoute, { ...core, unitById: withoutChuKoNu });
    expect(noChineseChuKoNu.status).toBe('current');
    if (noChineseChuKoNu.status === 'current') {
      expect(noChineseChuKoNu.required.map(({ entity }) => entity.id)).toEqual([235, 1903, 546, 331]);
      for (const id of ['-second', '-fifth']) {
        expect(noChineseChuKoNu.adjustments.find(({ id: adjustmentId }) => adjustmentId.endsWith(id))).toMatchObject({
          unavailable: true,
          text: chineseRoute.adjustments.find(({ id: adjustmentId }) => adjustmentId.endsWith(id))!.fallback,
        });
      }
    }

    const withoutCastle = { ...core.buildingById };
    delete withoutCastle[82];
    const noChineseCastle = project('Chinese', chineseRoute, { ...core, buildingById: withoutCastle });
    expect(noChineseCastle.status).toBe('current');
    if (noChineseCastle.status === 'current') {
      expect(noChineseCastle.adjustments.find(({ id }) => id.endsWith('-fifth'))).toMatchObject({
        unavailable: true,
        text: chineseRoute.adjustments[4]!.fallback,
      });
    }

    const withoutCamel = { ...core.unitById };
    delete withoutCamel[330];
    const noCamel = project('Byzantines', byzantineRoute, { ...core, unitById: withoutCamel });
    expect(noCamel.status).toBe('current');
    if (noCamel.status === 'current') {
      expect(noCamel.adjustments.find(({ id }) => id.endsWith('-first'))).toMatchObject({
        unavailable: true,
        text: byzantineRoute.adjustments[0]!.fallback,
      });
    }

    const withoutMangonel = { ...core.unitById };
    delete withoutMangonel[280];
    const noMangonel = project('Byzantines', byzantineRoute, { ...core, unitById: withoutMangonel });
    expect(noMangonel.status).toBe('current');
    if (noMangonel.status === 'current') {
      expect(noMangonel.adjustments.find(({ id }) => id.endsWith('-second'))).toMatchObject({
        unavailable: true,
        text: byzantineRoute.adjustments[1]!.fallback,
      });
      expect(noMangonel.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).not.toContain(280);
      expect(noMangonel.supplements.flatMap(({ entities }) => entities.map(({ entity }) => entity.id))).toContain(331);
    }

    const withoutLogistics = { ...core.techById };
    delete withoutLogistics[61];
    const noLogistics = project('Byzantines', byzantineRoute, { ...core, techById: withoutLogistics });
    expect(noLogistics.status).toBe('current');
    if (noLogistics.status === 'current') {
      expect(noLogistics.adjustments.find(({ id }) => id.endsWith('-third'))).toMatchObject({
        unavailable: true,
        text: byzantineRoute.adjustments[2]!.fallback,
      });
    }

    const withoutTrebuchet = { ...core.unitById };
    delete withoutTrebuchet[331];
    const noTrebuchet = project('Byzantines', byzantineRoute, { ...core, unitById: withoutTrebuchet });
    expect(noTrebuchet.status).toBe('current');
    if (noTrebuchet.status === 'current') {
      const siege = noTrebuchet.supplements.find(({ mode }) => mode === 'choice')!;
      expect(siege.entities.map(({ entity }) => entity.id)).toEqual([36]);
    }
  });

  it('保留 Spanish/Georgians 原四路线元数据和 required', () => {
    const expected = [
      ['Spanish', 'conquistador-hussar', [773, 441]],
      ['Spanish', 'paladin-skirmisher', [569, 6]],
      ['Spanish', 'handcannon-halberdier', [5, 359]],
      ['Georgians', 'monaspa-towers', [1805, 235, 923]],
    ] as const;

    for (const [civ, id, required] of expected) {
      const entry = route(civ, id);
      const contract = contractRoute(civ, id);
      expect([entry.status, entry.playtest, entry.composition, entry.age]).toEqual(['approved', 'unreported', 'combined', 4]);
      expect(entry.required.map(({ id: entityId }) => entityId)).toEqual(required);
      expect(contract.required.map(({ id: entityId }) => entityId)).toEqual(required);
      expect(contract.prerequisites.map(({ kind, id }) => [kind, id])).toEqual(entry.prerequisites.map(({ kind, id: entityId }) => [kind, entityId]));
    }
  });
});
