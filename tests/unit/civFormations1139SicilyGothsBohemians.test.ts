import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { loadCore } from '../../src/data';
import formationContract from '../../data/reference/civ-formations-contract.json';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const contractRoute = (civ: string, id: string) => formationContract.civs.find((entry) => entry.civ === civ)!.routes.find((entry) => entry.id === id)!;
const reviewedVersion = '资料及驻军机制核对：v0.77.100 · DE 188329（2026-10-28） · ea09def；原用户对局版本未单独记录';
const reviewedGarrisonVersion = `${reviewedVersion}；驻军满科技复核：v0.99.12 · DE 188329 · 66620c9`;

describe('#1139 西西里、哥特与波西米亚内容回归', () => {
  it('将资料核对版本与原用户对局版本分别记录，并同步来源范围', () => {
    const expectedSourceLines = [
      { civ: 'Sicilians', id: 'sicilians-serjeant-light-cavalry', lines: [13, 361, 363, 365, 366, 367, 368, 372], version: reviewedGarrisonVersion, links: 4 },
      { civ: 'Goths', id: 'goths-huskarl-halberdier', lines: [13, 376, 378, 380], version: reviewedVersion, links: 0 },
      {
        civ: 'Bohemians',
        id: 'bohemians-handcannon-halberdier',
        lines: [13, 826, 830, 835, 838, 840],
        version: `${reviewedGarrisonVersion}；碰撞接敌复核：v0.99.15 · DE 188329 · d070ec71`,
        links: 4,
      },
    ];

    for (const { civ, id, lines, version, links } of expectedSourceLines) {
      const evidence = route(civ, id).evidence;
      const contract = contractRoute(civ, id);

      expect(evidence.recordedVersion).toBe(version);
      expect(evidence.links?.length ?? 0).toBe(links);
      expect(evidence.scope).not.toContain('来源行');
      expect(evidence.sourceLines).toEqual(lines);
      expect(contract.sourceLines).toEqual(lines);
    }
  });

  it('保留西西里基础配置，并将城楼、长戟与投石车投入分别设为条件支援', async () => {
    const sicilian = route('Sicilians', 'sicilians-serjeant-light-cavalry');
    const contract = contractRoute('Sicilians', 'sicilians-serjeant-light-cavalry');
    const core = await loadCore();
    const mangonel = core.unitById[280]!;
    const position = sicilian.supplements.find(({ mode }) => mode === 'position-variant')!;
    const halberdier = sicilian.supplements.find(({ mode }) => mode === 'as-needed')!;
    const mangonelEvaluation = sicilian.supplements.find(({ mode }) => mode === 'conditional-evaluation')!;

    expect([sicilian.status, sicilian.playtest, sicilian.composition, sicilian.age]).toEqual(['approved', 'unreported', 'combined', 4]);
    expect(sicilian.condition).toBe('已认可的萨金特卫兵＋轻骑基础配置；按位置与资源扩展，已有骑士线的延续只是条件调整。');
    expect(sicilian.required.map(({ id }) => id)).toEqual([1659, 546, 331]);
    expect(position.condition).toContain('石头充足');
    expect(position.condition).toContain('已有稳定战线');
    expect(halberdier.condition).toContain('敌方骑兵压力超出主力能力');
    expect(halberdier.entities.map(({ id, historicalName }) => [id, historicalName])).toEqual([[359, '长戟兵']]);
    expect(mangonelEvaluation.condition).toContain('敌方攻城器保护严密、轻骑难以接近');
    expect(mangonelEvaluation.condition).toContain('先看路线与交战位置，再评估新增投石车投入');
    expect(mangonelEvaluation.condition).toContain('不把第二条反攻城路线列为标配');
    expect(mangonelEvaluation.entities.map(({ id, historicalName }) => [id, historicalName])).toEqual([[280, '轻型投石车']]);
    expect(mangonelEvaluation.entities.map(({ id }) => id)).not.toContain(331);
    expect(mangonelEvaluation.entities[0]!.role).toBe('投石车系基础目录引用；新增投入仅作条件评估，非反攻城标配');
    expect([mangonel.id, mangonel.en, mangonel.zh, mangonel.type, mangonel.age]).toEqual([280, 'Mangonel', '轻型投石车', 'Unit', 3]);
    expect(contract.required.map(({ id }) => id)).toEqual([1659, 546, 331]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map(({ id }) => id)])).toEqual([
      ['continuation-adjustment', [283]],
      ['position-variant', [1665, 1661]],
      ['as-needed', [359]],
      ['conditional-evaluation', [280]],
    ]);
  });

  it('将哥特攻城器设为择一按需，且不把路线变体写回主理由', () => {
    const goth = route('Goths', 'goths-huskarl-halberdier');
    const contract = contractRoute('Goths', 'goths-huskarl-halberdier');
    const choice = goth.supplements.find(({ mode }) => mode === 'choice')!;
    const conditional = goth.supplements.filter(({ mode }) => mode === 'conditional');
    const production = goth.supplements.find(({ mode }) => mode === 'production-alternative')!;

    expect([goth.title, goth.status, goth.playtest, goth.composition, goth.age]).toEqual([
      '精锐近卫军＋长戟兵＋少量手推炮',
      'approved',
      'unreported',
      'combined',
      4,
    ]);
    expect(goth.required.map(({ id }) => id)).toEqual([761, 359]);
    expect(choice.condition).toContain('当前可用');
    expect(choice.condition).toContain('不要求另开产线');
    expect(choice.entities.find(({ id }) => id === 331)?.role).toContain('已有巨型投石机可先沿用');
    expect(choice.entities.find(({ id }) => id === 331)?.role).toContain('不要求另产手推炮');
    expect(choice.entities.map(({ id }) => id)).toEqual([36, 331]);
    expect(conditional).toHaveLength(2);
    expect(conditional.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[567], [5]]);
    expect(conditional[0]!.condition).toContain('强近战步兵压力');
    expect(conditional[0]!.condition).toContain('替换部分近卫军');
    expect(conditional[1]!.condition).toContain('条顿武士等强反步兵单位');
    expect(conditional[1]!.condition).toContain('不为凑远程核心默认加入');
    expect(production.entities.map(({ id }) => id)).toEqual([555]);
    expect(production.condition).toContain('游戏目录产地映射');
    expect(production.condition).toContain('非固定策略讨论新增路线');
    expect(production.entities[0]!.role).toContain('不代表固定讨论中的新增阵容');
    expect(goth.reason).toContain('步兵折扣');
    expect(goth.reason).toContain('无政府解锁兵营近卫军');
    expect(goth.reason).toContain('井喷与团队兵营加成');
    expect(goth.reason).not.toContain('冠军剑士');
    expect(goth.reason).not.toContain('火枪手');
    expect(goth.reason).not.toContain('手推炮');
    expect(goth.limitation).toContain('独立投入');
    expect(goth.limitation).toContain('农田、黄金和前线兵营产能');
    expect(goth.limitation).toContain('不能代替近战能力');
    expect(goth.limitation).toContain('不能抵消投石车打击');
    expect(contract.required.map(({ id }) => id)).toEqual([761, 359]);
    expect(contract.supplements.map(({ mode, entities }) => [mode, entities.map(({ id }) => id)])).toEqual([
      ['choice', [36, 331]],
      ['conditional', [567]],
      ['conditional', [5]],
      ['production-alternative', [555]],
    ]);
  });

  it('只更新波西米亚证据元数据，并保留西班牙与格鲁吉亚旧四路', () => {
    const bohemian = route('Bohemians', 'bohemians-handcannon-halberdier');
    const bohemianContract = contractRoute('Bohemians', 'bohemians-handcannon-halberdier');

    expect([bohemian.status, bohemian.playtest, bohemian.composition, bohemian.age, bohemian.required.map(({ id }) => id)]).toEqual([
      'approved',
      'unreported',
      'combined',
      4,
      [5, 359, 36],
    ]);
    expect(bohemian.condition).toBe('火枪手、长戟兵与手推炮组成认可主路。');
    expect(bohemian.reason).toContain('延续城堡时代火枪基础可降低转型负担，不必一升帝王就同时开齐昂贵升级。');
    expect(bohemian.supplements.find(({ mode }) => mode === 'upgrade')!.condition).toBe('经济与炮量允许升级。');
    expect(bohemian.adjustments!.find(({ id }) => id === 'bohemians-handcannon-halberdier-adjustment-monk-variant')!.fallback).toContain(
      '隐藏僧侣变招；不把僧侣训练或研究列为主路前置',
    );
    expect(bohemian.supplements.map(({ mode, entities }) => [mode, entities.map(({ id }) => id)])).toEqual([
      ['upgrade', [1709]],
      ['position-variant', [235, 1704]],
    ]);
    expect(bohemianContract.sourceLines).toEqual([13, 826, 830, 835, 838, 840]);

    expect(
      byCiv('Spanish').routes.map(({ id, status, playtest, composition, age, required }) => [
        id,
        status,
        playtest,
        composition,
        age,
        required.map(({ id: unitId }) => unitId),
      ]),
    ).toEqual([
      ['conquistador-hussar', 'approved', 'unreported', 'combined', 4, [773, 441]],
      ['paladin-skirmisher', 'approved', 'unreported', 'combined', 4, [569, 6]],
      ['handcannon-halberdier', 'approved', 'unreported', 'combined', 4, [5, 359]],
    ]);
    expect(
      byCiv('Georgians').routes.map(({ id, status, playtest, composition, age, required }) => [
        id,
        status,
        playtest,
        composition,
        age,
        required.map(({ id: unitId }) => unitId),
      ]),
    ).toEqual([['monaspa-towers', 'approved', 'unreported', 'combined', 4, [1805, 235, 923]]]);
  });
});
