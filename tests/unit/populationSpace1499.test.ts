import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildArmyCostUsage, formatArmyCostUsageJson } from '../../scripts/army_cost_usage_lib';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost } from '../../src/domain/armyCost';
import { armySupplyResearch } from '../../src/domain/armySupply';
import { DAT, ecoText } from '../../src/domain/datEffects';
import { applicableTrainingTechs } from '../../src/domain/duelTrainingCost';
import { applicableUnmodeledTechIds, detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { productionTechs } from '../../src/domain/production';
import { makeSimContext, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { buildTechPopulationChangeView, classifyTechDataConsumption, TECH_POP_COLLAPSE_THRESHOLD } from '../../src/domain/techDetailCost';
import { techEffectEntries } from '../../src/domain/techDetailView';
import type { Trees } from '../../src/domain/types';
import { buildUnitCivRank } from '../../src/domain/unitCivRank';
import { unitCost } from '../../src/domain/unitCost';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { isUnclassifiedTransferEcoEffect, mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';
import TechDetail from '../../src/features/techs/components/TechDetail';

const visible = (html: string) =>
  html
    .replace(/<\/?span\b[^>]*>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const markup = (location: string) =>
  renderToStaticMarkup(
    createElement(StaticRouter, { location }, createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) }))),
  );

let core: Core;
let trees: Trees;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
});

describe('Issue 1499 人口空间属性（C=110）全链路数据、科技详情、阵容账本与跨工具零回归', () => {
  it('零硬编码科技 ID 与 ecoText 玩家可读语义输出', () => {
    const files = [
      'src/domain/techDataConsumption.ts',
      'src/domain/techDetailCost.ts',
      'src/domain/techDetailPopulation.ts',
      'src/features/techs/components/TechPopulationChanges.tsx',
      'src/features/techs/components/TechDetail.tsx',
      'src/domain/armyCost.ts',
      'src/features/duel/logic/mixedTrainingTransfer.ts',
    ];
    for (const file of files) {
      const codeOnly = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeOnly, `${file} must not hardcode 834/924`).not.toMatch(/\b(?:834|924)\b/);
    }

    const nameOf = (id: number) => core.unitById[id]?.zh;
    const mahLines = DAT.techs.Mahayana!.eco.map((e) => ecoText(e, nameOf));
    expect(mahLines).toEqual(['村民 每名占 0.9 人口', '僧侣 每名占 0.9 人口', '携圣物僧侣 每名占 0.9 人口']);
    const aznLines = DAT.techs['Aznauri Cavalry']!.eco.map((e) => ecoText(e, nameOf));
    expect(aznLines).toEqual(['侦察骑兵 每名占 0.8 人口', '骑兵 每名占 0.8 人口', '征服者 每名占 0.8 人口', '骑射手 每名占 0.8 人口']);
    for (const line of [...mahLines, ...aznLines]) {
      expect(line).not.toMatch(/=\s*-0\.|类别\s*(?:18|43)/);
    }
  });

  it('AC2：全站 199 项科技仅 834/924 构建人口空间变化视图、准确过滤与分组、SSR 零漂移且零内部字段泄漏', () => {
    const builtIds: number[] = [];
    for (const tech of core.techs) {
      const entries = techEffectEntries(tech, core.units, core.buildings);
      const view = buildTechPopulationChangeView(tech, entries.length > 0, core, trees);
      if (view) builtIds.push(tech.id);
    }
    expect(builtIds.sort((a, b) => a - b)).toEqual([834, 924]);

    // 1) 834 大乘佛教：孟加拉精确 2 项（排除西班牙 775 传教士），平铺布局，建筑名清理换行
    const v834 = buildTechPopulationChangeView(core.techById[834]!, false, core, trees)!;
    const v834Ssr = buildTechPopulationChangeView(core.techById[834]!, false, core, null)!;
    expect(v834Ssr).toEqual(v834);
    expect(v834.ownerCivEn).toBe('Bengalis');
    expect(v834.ownerCivZh).toBe('孟加拉');
    expect(v834.totalUnits).toBe(2);
    expect(v834.groups).toHaveLength(1);
    expect(v834.groups[0]!.layout).toBe('flat');
    expect(v834.groups[0]!.popText).toBe('0.9 人口');
    expect(v834.groups[0]!.deltaText).toBe('-10%');
    expect(v834.groups[0]!.units.map((u) => [u.id, u.buildingZh, u.href])).toEqual([
      [83, '城镇中心', '/unit/83?civ=Bengalis'],
      [125, '修道院', '/unit/125?civ=Bengalis'],
    ]);
    expect(v834.groups[0]!.units.map((u) => u.id)).not.toContain(775);

    // 2) 924 阿兹瑙里骑兵：格鲁吉亚精确 9 项按马厩/靶场/城堡分组直出（排除游侠/骆驼/征服者等 81 项）
    const v924 = buildTechPopulationChangeView(core.techById[924]!, false, core, trees)!;
    const v924Ssr = buildTechPopulationChangeView(core.techById[924]!, false, core, null)!;
    expect(v924Ssr).toEqual(v924);
    expect(v924.ownerCivEn).toBe('Georgians');
    expect(v924.ownerCivZh).toBe('格鲁吉亚');
    expect(v924.totalUnits).toBe(9);
    expect(v924.groups).toHaveLength(1);
    expect(v924.groups[0]!.layout).toBe('grouped');
    expect(v924.groups[0]!.popText).toBe('0.8 人口');
    expect(v924.groups[0]!.deltaText).toBe('-20%');
    expect(v924.groups[0]!.units.map((u) => u.id)).toEqual([448, 546, 441, 38, 283, 39, 474, 1803, 1805]);
    expect(v924.groups[0]!.subgroups.map((g) => [g.buildingZh, g.units.map((u) => u.id)])).toEqual([
      ['马厩', [448, 546, 441, 38, 283]],
      ['靶场', [39, 474]],
      ['城堡', [1803, 1805]],
    ]);
    expect(v924.groups[0]!.extraSubgroups).toEqual([]);
    for (const u of v924.groups[0]!.units) {
      expect(u.href).toBe(`/unit/${u.id}?civ=Georgians`);
      expect(u.buildingZh).not.toMatch(/\s/);
    }
    for (const excluded of [569, 329, 771, 773]) {
      expect(v924.groups[0]!.units.map((u) => u.id)).not.toContain(excluded);
    }

    // 3) 消费分类与 CTA 入口零错误、零账本阻断、无持续生产按钮
    const prodCtx = { core, trees };
    for (const [id, view, expectedRepUnit] of [
      [834, v834, 83],
      [924, v924, 448],
    ] as const) {
      const c = classifyTechDataConsumption(core.techById[id]!, false, { unitById: core.unitById, buildingById: core.buildingById });
      expect(c).toMatchObject({
        kind: 'consumed',
        domains: ['army-cost'],
        sourceNote: '本页不逐条模拟属性；阵容账本工具已采用固定数据编码，其余效果以游戏说明为准',
      });
      expect(view.action).toBeTruthy();
      expect(view.action!.kind).toBe('army-cost');
      expect(view.action!.label).toBe('在阵容账本中试算');
      const decoded = decodeArmyCost(view.action!.to.split('?')[1] ?? '');
      expect(decoded.errors).toEqual([]);
      expect(decoded.dataChanged).toBe(false);
      expect(decoded.config!.rows).toEqual([{ unit: expectedRepUnit, qty: '1' }]);
      expect(decoded.config!.targets).toEqual([`t:${id}`]);
      const evalRes = evaluateArmyCost(prodCtx, decoded.config!);
      expect(evalRes.blocked).toEqual([]);
      expect(evalRes.partial).toBe(false);
      expect(evalRes.training.lines[0]?.status).toBe('ok');
    }

    // 4) SSR 页面呈现：区块、页内跳转、底部来源、边界说明、禁现持续生产与内部字段
    for (const [id, popStr, pctStr, countStr] of [
      [834, '0.9 人口', '-10%', '2 个受影响单位'],
      [924, '0.8 人口', '-20%', '9 个受影响单位'],
    ] as const) {
      const html = markup(`/tech/${id}`);
      const text = visible(html);
      expect(html).toContain('id="tech-population-changes"');
      expect(html).toContain('>人口空间变化</button>');
      expect(text).toContain(popStr);
      expect(text).toContain(pctStr);
      expect(text).toContain(countStr);
      expect(text).toContain('在阵容账本中试算');
      expect(text).not.toContain('打开持续生产');
      expect(text).toContain('多人编队的小数人口累计与取整未做游戏内实测，本站不模拟人口上限或房屋供给');
      expect(text).toContain('本页不逐条模拟属性；阵容账本工具已采用固定数据编码，其余效果以游戏说明为准');
      expect(text).not.toContain('没有已解码数值规则');
      expect(text).not.toMatch(/C=110|a:110|Type=0|D=-0\.[89]|resource_storages/i);
    }

    // 5) 未来补丁单组超 TECH_POP_COLLAPSE_THRESHOLD(12) 折叠兜底
    const largeUnits = core.units.filter((u) => u.civs.includes('Georgians')).slice(0, TECH_POP_COLLAPSE_THRESHOLD + 2);
    const fakeDat = {
      ...DAT,
      techs: {
        ...DAT.techs,
        'Aznauri Cavalry': {
          id: 924,
          combat: true,
          rules: [],
          eco: [{ a: 110, op: 'set', v: -0.8, t: largeUnits.map((u) => u.id), cls: 12, unit: null }],
        },
      },
    };
    const bigView = buildTechPopulationChangeView(core.techById[924]!, false, core, trees, { dat: fakeDat })!;
    expect(bigView.totalUnits).toBe(TECH_POP_COLLAPSE_THRESHOLD + 2);
    expect(bigView.groups[0]!.previewSubgroups).toHaveLength(1);
    expect(bigView.groups[0]!.extraSubgroups.length).toBeGreaterThan(0);
  });

  it('AC3：阵容费用正例（孟加拉、格鲁吉亚、骑射手线、纯研究预算）、反例拦截与 armySupplyResearch 隔离', () => {
    const prodCtx = { core, trees };

    // 正例 1：孟加拉 83 村民 ×10 + 125 僧侣 ×5 + t:834
    const benCfg = {
      ...emptyArmyCost('Bengalis', '4'),
      rows: [
        { unit: 83, qty: '10' },
        { unit: 125, qty: '5' },
      ],
      targets: ['t:834'],
    };
    const benRes = evaluateArmyCost(prodCtx, benCfg);
    expect(benRes.blocked).toEqual([]);
    expect(benRes.partial).toBe(false);
    expect(benRes.ledger.find((e) => e.id === 834)).toMatchObject({
      status: 'planned',
      beneficiaries: [0, 1],
      cost: { Wood: 800, Gold: 650 },
    });
    expect(benRes.researchTotal).toEqual({ Food: 0, Wood: 800, Gold: 650, Stone: 0 });
    expect(benRes.trainingTotal).toEqual({ Food: 500, Wood: 0, Gold: 500, Stone: 0 });
    expect(benRes.total).toEqual({ Food: 500, Wood: 800, Gold: 1150, Stone: 0 });

    // 正例 2：格鲁吉亚 1805 精锐莫纳斯帕 ×15 + 441 翼骑兵 ×20 + t:924
    const geoCfg = {
      ...emptyArmyCost('Georgians', '4'),
      rows: [
        { unit: 1805, qty: '15' },
        { unit: 441, qty: '20' },
      ],
      targets: ['t:924'],
    };
    const geoRes = evaluateArmyCost(prodCtx, geoCfg);
    expect(geoRes.blocked).toEqual([]);
    expect(geoRes.partial).toBe(false);
    expect(geoRes.ledger.find((e) => e.id === 924)).toMatchObject({
      status: 'planned',
      beneficiaries: [0, 1],
      cost: { Food: 550, Gold: 250 },
    });
    expect(geoRes.researchTotal).toEqual({ Food: 2200, Wood: 0, Gold: 1600, Stone: 0 });
    expect(geoRes.trainingTotal).toEqual({ Food: 2500, Wood: 0, Gold: 675, Stone: 0 });
    expect(geoRes.total).toEqual({ Food: 4700, Wood: 0, Gold: 2275, Stone: 0 });

    // 正例 3：骑射手线（39/474）与无兵种行纯研究预算
    for (const uid of [39, 474]) {
      const caRes = evaluateArmyCost(prodCtx, {
        ...emptyArmyCost('Georgians', '4'),
        rows: [{ unit: uid, qty: '10' }],
        targets: ['t:924'],
      });
      expect(caRes.partial, `Georgians unit ${uid}`).toBe(false);
      expect(caRes.ledger.find((e) => e.id === 924)).toMatchObject({
        status: 'planned',
        beneficiaries: [0],
        cost: { Food: 550, Gold: 250 },
      });
    }
    const benPure = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Bengalis', '4'), targets: ['t:834'] });
    expect(benPure.partial).toBe(false);
    expect(benPure.researchTotal).toEqual({ Food: 0, Wood: 800, Gold: 650, Stone: 0 });
    const geoPure = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Georgians', '4'), targets: ['t:924'] });
    expect(geoPure.partial).toBe(false);
    expect(geoPure.researchTotal).toEqual({ Food: 550, Wood: 0, Gold: 250, Stone: 0 });

    // 反例 1：无关兵种拦截且不污染正常行训练费
    for (const [civ, unit, tid] of [
      ['Bengalis', 492, 834],
      ['Georgians', 359, 924],
    ] as const) {
      const negCfg = { ...emptyArmyCost(civ, '4'), rows: [{ unit, qty: '10' }], targets: [`t:${tid}`] };
      expect(armyResearchChoices(prodCtx, negCfg, false, ARMY_RESEARCH)).not.toContain(tid);
      const negRes = evaluateArmyCost(prodCtx, negCfg);
      expect(negRes.partial, `${civ} neg`).toBe(true);
      expect(negRes.training.lines[0]?.status, `${civ} training ok`).toBe('ok');
      expect(negRes.ledger.find((e) => e.id === tid)).toMatchObject({
        status: 'invalid',
        cost: null,
        reason: '不属于当前阵容的战斗、训练费用、人口空间或形态研究；未计入',
      });
    }

    // 反例 2：城堡时代（age=3）拦截 + 他国（Franks）不可用
    const castle834 = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Bengalis', '3'), rows: [{ unit: 83, qty: '10' }], targets: ['t:834'] });
    expect(castle834.partial).toBe(true);
    expect(castle834.ledger.find((e) => e.id === 834)?.status).toBe('invalid');
    const castle834Done = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Bengalis', '3'), rows: [{ unit: 83, qty: '10' }], done: ['t:834'] });
    expect(castle834Done.ledger.find((e) => e.id === 834)).toMatchObject({ status: 'invalid', reason: '尚未满足所需前置条件' });

    const castle924 = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Georgians', '3'), rows: [{ unit: 38, qty: '10' }], targets: ['t:924'] });
    expect(castle924.partial).toBe(true);
    expect(castle924.ledger.find((e) => e.id === 924)?.status).toBe('invalid');
    const castle924Done = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Georgians', '3'), rows: [{ unit: 38, qty: '10' }], done: ['t:924'] });
    expect(castle924Done.ledger.find((e) => e.id === 924)).toMatchObject({ status: 'invalid', reason: '尚未满足所需前置条件' });

    const franks924 = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Franks', '4'), rows: [{ unit: 38, qty: '10' }], targets: ['t:924'] });
    expect(franks924.partial).toBe(true);
    expect(franks924.ledger.find((e) => e.id === 924)?.status).toBe('invalid');
    const franks924Done = evaluateArmyCost(prodCtx, { ...emptyArmyCost('Franks', '4'), rows: [{ unit: 38, qty: '10' }], done: ['t:924'] });
    expect(franks924Done.ledger.find((e) => e.id === 924)).toMatchObject({ status: 'invalid', reason: '研究 t:924 在本文明不可用' });

    // armySupplyResearch：834/924 标为 supported: false
    expect(armySupplyResearch(prodCtx, benCfg).planned.find((x) => x.entry.id === 834)?.supported).toBe(false);
    expect(armySupplyResearch(prodCtx, geoCfg).planned.find((x) => x.entry.id === 924)?.supported).toBe(false);
  });

  it('AC4：跨工具零回归（模拟器、单位 PK、满科技对照、持续生产、训练费用、混编转总价与 army_cost_usage）', () => {
    const simCtx = makeSimContext(core.techs, trees);
    const prodCtx = { core, trees };

    // 1) 模拟器、单位 PK 未建模提示、满科技对照、持续生产、训练费用均不受 834/924 影响
    for (const [civ, uid, tid] of [
      ['Bengalis', 125, 834],
      ['Georgians', 1805, 924],
      ['Georgians', 441, 924],
    ] as const) {
      const u = core.unitById[uid]!;
      const avail = simTechs(simCtx, u, civ);
      expect(avail.some((x) => x.t.id === tid && x.ef !== null)).toBe(false);
      expect(applicableUnmodeledTechIds(avail, uid, u.combatAbility ?? 0, u.chargeType ?? 0).has(tid)).toBe(false);
      const preset = presetUpTo(avail, 4, civ);
      expect(preset.has(tid)).toBe(false);
      expect(simulate(simCtx, u, civ, 4, new Set([...preset, tid]), new Set())).toEqual(simulate(simCtx, u, civ, 4, preset, new Set()));
      const unmodeledOff = detectUnitUnmodeled({ unit: u, civ, age: 4, selectedTechs: [...preset].map((id) => core.techById[id]!) });
      const unmodeledOn = detectUnitUnmodeled({
        unit: u,
        civ,
        age: 4,
        selectedTechs: [...preset, tid].map((id) => core.techById[id]!),
      });
      expect(unmodeledOn).toEqual(unmodeledOff);
      expect(productionTechs(prodCtx, { civ, age: 4 }).some((t) => t.id === tid)).toBe(false);
      expect(applicableTrainingTechs(simCtx, u, civ, 4).some((t) => t.tech.id === tid)).toBe(false);
      const priceBase = unitCost(u, civ, 4, []);
      const priceWith = unitCost(u, civ, 4, [
        { id: tid, en: core.techById[tid]!.en, zh: core.techById[tid]!.zh, effects: DAT.techs[core.techById[tid]!.en]!.eco },
      ]);
      expect(priceWith.cost).toEqual(priceBase.cost);
      expect(priceWith.undecoded).toEqual([]);
    }

    const rank441 = buildUnitCivRank(simCtx, core.unitById[441]!, 4);
    const geoRow = rank441.rows.find((r) => r.civ === 'Georgians')!;
    expect(geoRow.selTechIds).not.toContain(924);
    expect(geoRow.activeUnmodeledTechIds).not.toContain(924);
    expect(geoRow.unmodeledPills.join(' ')).not.toContain('人口');

    // 2) 混编 PK mixedTrainingTransfer：属性 110 归入 nonPricingAttributes，不报错拦截且干净归入 omitted
    for (const ecoItem of [...DAT.techs.Mahayana!.eco, ...DAT.techs['Aznauri Cavalry']!.eco]) {
      expect(isUnclassifiedTransferEcoEffect(ecoItem, new Set([83, 125, 441, 1805]), core.unitById)).toBe(false);
    }
    const benBase = { civ: 'Bengalis', age: '4', techs: [] as string[], team: [] as string[], rows: [{ uid: '83', qty: '5' }] };
    const benView = resolveMixedSide(simCtx, core, benBase, 'a');
    expect(benView.errors).toEqual([]);
    const benTransfer = mixedTrainingTransfer(prodCtx, { ...benBase, techs: ['834'] }, 'a', benView);
    expect('to' in benTransfer).toBe(true);
    if ('to' in benTransfer) {
      expect(benTransfer.notice.omitted).toContain('大乘佛教（不改变本方训练单价或解锁）');
      expect(benTransfer.notice.pricing).toEqual([]);
    }

    const geoBase = { civ: 'Georgians', age: '4', techs: [] as string[], team: [] as string[], rows: [{ uid: '1805', qty: '15' }] };
    const geoView = resolveMixedSide(simCtx, core, geoBase, 'a');
    expect(geoView.errors).toEqual([]);
    const geoTransfer = mixedTrainingTransfer(prodCtx, { ...geoBase, techs: ['924'] }, 'a', geoView);
    expect('to' in geoTransfer).toBe(true);
    if ('to' in geoTransfer) {
      expect(geoTransfer.notice.omitted).toContain('阿兹瑙里骑兵（不改变本方训练单价或解锁）');
      expect(geoTransfer.notice.pricing).toEqual([]);
    }

    // 3) army_cost_usage.json 孟加拉与格鲁吉亚零漂移
    const committedUsage = JSON.parse(readFileSync('data/game/army_cost_usage.json', 'utf8')) as ReturnType<typeof buildArmyCostUsage>;
    const subsetUsage = buildArmyCostUsage(prodCtx, ARMY_RESEARCH, { civList: ['Bengalis', 'Georgians'] });
    expect(subsetUsage.bonuses).toEqual({});
    expect(Object.keys(committedUsage.bonuses).filter((k) => k.startsWith('Bengalis-') || k.startsWith('Georgians-'))).toEqual([]);
    expect(formatArmyCostUsageJson(committedUsage).length).toBeGreaterThan(0);
  });
});
