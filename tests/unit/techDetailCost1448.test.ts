import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { buildBuildingCivRank } from '../../src/domain/buildingCivRank';
import { payoffAvailable } from '../../src/domain/ecoPayoff';
import { marketFee } from '../../src/domain/market';
import { calculateProduction, decodeProduction } from '../../src/domain/production';
import { buildTechCostChangeView, classifyTechDataConsumption, TECH_COST_PREVIEW_COUNT } from '../../src/domain/techDetailCost';
import { techEffectEntries } from '../../src/domain/techDetailView';
import type { Trees } from '../../src/domain/types';
import { decodeArmyCost } from '../../src/features/production/armyCostCodec';
import TechDetail from '../../src/features/techs/components/TechDetail';

const visible = (html: string) =>
  html
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

describe('#1448 科技详情数据消费分类与结构化费用变化', () => {
  it('全站 199 项科技精确按数据消费规则分类，零硬编码科技 ID', () => {
    const src = readFileSync('src/domain/techDataConsumption.ts', 'utf8') + '\n' + readFileSync('src/domain/techDetailCost.ts', 'utf8');
    for (const id of ['455', '484', '488', '499', '506', '514', '576', '578', '625', '782', '785', '835', '996', '1379', '1380', '1393', '1484', '1496']) {
      expect(src).not.toMatch(new RegExp(`\\b${id}\\b`));
    }

    const buckets = {
      simulated: [] as number[],
      cost: [] as number[],
      consumed: [] as number[],
      unencoded: [] as number[],
    };

    for (const tech of core.techs) {
      const entries = techEffectEntries(tech, core.units, core.buildings);
      const result = classifyTechDataConsumption(tech, entries.length > 0, {
        unitById: core.unitById,
        buildingById: core.buildingById,
      });
      buckets[result.kind].push(tech.id);
      expect(result.sourceNote).not.toContain('这条科技没有编码数值');
    }

    expect(core.techs).toHaveLength(199);
    expect(buckets.simulated).toHaveLength(109);
    expect(buckets.cost.sort((a, b) => a - b)).toEqual([455, 488, 499, 514, 625, 782, 785, 835, 1380, 1496]);
    // origin/main@95c56a03 已含 #1446 导出的 projectilePassThrough（1379 突袭），消费判定自动归入 consumed
    expect(buckets.consumed).toHaveLength(52);
    expect(buckets.consumed).toEqual(expect.arrayContaining([15, 17, 23, 45, 46, 93, 202, 233, 315, 316, 319, 438, 439, 441, 506, 578, 1379, 1393]));
    expect(buckets.unencoded.sort((a, b) => a - b)).toEqual([
      16, 21, 28, 64, 194, 408, 483, 487, 573, 629, 690, 754, 755, 756, 834, 909, 910, 924, 1006, 1007, 1012, 1013, 1014, 1061, 1070, 1080, 1464, 1484,
    ]);
    expect(buckets.simulated.length + buckets.cost.length + buckets.consumed.length + buckets.unencoded.length).toBe(199);
  });

  it('仅 10 项费用编码科技构建费用变化视图，按所属文明过滤不可用实体', () => {
    const builtIds: number[] = [];
    for (const tech of core.techs) {
      const entries = techEffectEntries(tech, core.units, core.buildings);
      const view = buildTechCostChangeView(tech, entries.length > 0, core, trees);
      if (view) builtIds.push(tech.id);
    }
    expect(builtIds.sort((a, b) => a - b)).toEqual([455, 488, 499, 514, 625, 782, 785, 835, 1380, 1496]);

    // 514 科维尼安军队：马扎尔普通/精锐骠骑 35 食 45 金 -> 80 食
    const v514 = buildTechCostChangeView(core.techById[514]!, false, core, trees)!;
    expect(v514.ownerCivEn).toBe('Magyars');
    expect(v514.rows.map((r) => r.id)).toEqual([869, 871]);
    expect(v514.rows.map((r) => r.base)).toEqual([
      { Food: 35, Gold: 45 },
      { Food: 35, Gold: 45 },
    ]);
    expect(v514.rows.map((r) => r.after)).toEqual([
      { Food: 80, Gold: 0 },
      { Food: 80, Gold: 0 },
    ]);
    expect(v514.rows.map((r) => r.deltaText)).toEqual(['+45食 / -45金', '+45食 / -45金']);
    expect(v514.rulePills).toEqual(['黄金改为 0', '食物改为 80']);

    // 与原单马扎尔 7 名普通骠骑阵容账本双链接口径一致
    const ctx = { core, trees };
    const direct7 = evaluateArmyCost(ctx, { civ: 'Magyars', age: '3', rows: [{ unit: 869, qty: '7' }], done: [], targets: [] });
    const with514 = evaluateArmyCost(ctx, { civ: 'Magyars', age: '3', rows: [{ unit: 869, qty: '7' }], done: [], targets: ['t:514'] });
    expect(direct7.total).toEqual({ Food: 245, Wood: 0, Gold: 315, Stone: 0 });
    expect(with514.trainingTotal).toEqual({ Food: 560, Wood: 0, Gold: 0, Stone: 0 });
    expect(with514.researchTotal).toMatchObject({ Food: 200, Gold: 300 });
    expect(with514.total).toEqual({ Food: 760, Wood: 0, Gold: 300, Stone: 0 });

    // 488 波斯步弓手：波斯无劲弩手 492
    const v488 = buildTechCostChangeView(core.techById[488]!, false, core, trees)!;
    expect(v488.rows.map((r) => r.id)).toEqual([4, 24]);
    expect(v488.rows.map((r) => r.id)).not.toContain(492);

    // 625 强征兵役：马来无冠军剑士 567、无罗马军 1793
    const v625 = buildTechCostChangeView(core.techById[625]!, false, core, trees)!;
    expect(v625.rows.map((r) => r.id)).toEqual([74, 75, 77, 473]);
    expect(v625.rows.map((r) => r.id)).not.toContain(1793);
    expect(v625.rows.map((r) => r.id)).not.toContain(567);

    // 782 贵族特权：波兰无游侠 569、无萨瓦尔 1813
    const v782 = buildTechCostChangeView(core.techById[782]!, false, core, trees)!;
    expect(v782.rows.map((r) => r.id)).toEqual([38, 283]);
    expect(v782.rows.map((r) => r.id)).not.toContain(569);
    expect(v782.rows.map((r) => r.id)).not.toContain(1813);

    // 1496 王家敕令骑兵：法兰克骑马弩兵黄金 -40%（65 -> 39）
    const v1496 = buildTechCostChangeView(core.techById[1496]!, false, core, trees)!;
    expect(v1496.rows.map((r) => r.id)).toEqual([2700, 2701]);
    expect(v1496.rows[0]!.after).toEqual({ Wood: 40, Gold: 39 });
    expect(v1496.rows[0]!.deltaText).toBe('-26金');
  });

  it('覆盖五类边界（455 建筑、499 贸易、785 僧侣+修道院科技、835 大集合、1380 混合未解码）', () => {
    // 1. 455 罗斯堡垒：按斯拉夫实际可建造建筑过滤（79/234/82，排除斯拉夫不可建的 235/236），且不跳持续生产
    const v455 = buildTechCostChangeView(core.techById[455]!, false, core, trees)!;
    expect(v455.scopeKind).toBe('building');
    expect(v455.rows.map((r) => r.id)).toEqual([79, 234, 82]);
    expect(v455.rows[0]!.after).toEqual({ Stone: 75, Wood: 85 });
    expect(v455.rows[2]!.after).toEqual({ Stone: 390, Wood: 260 });
    expect(v455.actions.every((a) => a.kind === 'building' && a.to.startsWith('/building/'))).toBe(true);
    expect(v455.actions.some((a) => a.to.includes('/production'))).toBe(false);

    // 2. 499 丝绸之路：意大利贸易车/贸易船半价
    const v499 = buildTechCostChangeView(core.techById[499]!, false, core, trees)!;
    expect(v499.rows.map((r) => r.id)).toEqual([128, 17]);
    expect(v499.rows[0]!.after).toEqual({ Wood: 50, Gold: 25 });
    expect(v499.actions.map((a) => a.kind)).toEqual(['army-cost', 'production']);

    // 3. 785 胡斯革新：僧侣 125 + 11 项修道院科技折叠明细
    const v785 = buildTechCostChangeView(core.techById[785]!, false, core, trees)!;
    expect(v785.rows.map((r) => r.id)).toEqual([125]);
    expect(v785.rows[0]!.after).toEqual({ Food: 100, Gold: 0 });
    expect(v785.techRows).toHaveLength(11);
    expect(v785.techRows.map((r) => r.id).sort((a, b) => a - b)).toEqual([45, 46, 230, 231, 233, 252, 316, 319, 438, 439, 441]);
    expect(v785.techRows.find((r) => r.id === 45)!.after).toEqual({ Food: 1300, Gold: 0 });

    // 4. 835 刹帝利：命中 25 个瞿折罗单位，过滤 2 个无食物消耗单位（4 步弓手 / 24 弩手），保留 23 行并默认收起
    const v835 = buildTechCostChangeView(core.techById[835]!, false, core, trees)!;
    expect(v835.matchedCount).toBe(25);
    expect(v835.unchangedCount).toBe(2);
    expect(v835.rows).toHaveLength(23);
    expect(v835.rows.map((r) => r.id)).not.toContain(4);
    expect(v835.rows.map((r) => r.id)).not.toContain(24);
    expect(v835.previewRows).toHaveLength(TECH_COST_PREVIEW_COUNT);
    expect(v835.extraRows).toHaveLength(20);
    expect(new Set([...v835.previewRows, ...v835.extraRows].map((r) => r.id)).size).toBe(23);

    // 5. 1380 布图马普：展示 2569/2571 -15% 费用变化，同时保留未解码提示并链回单位详情（不产生被拦截的账本死链）
    const v1380 = buildTechCostChangeView(core.techById[1380]!, false, core, trees)!;
    expect(v1380.hasUndecoded).toBe(true);
    expect(v1380.rows.map((r) => r.id)).toEqual([2569, 2571]);
    expect(v1380.rows[0]!.after).toEqual({ Wood: 42.5, Gold: 47 });
    expect(v1380.rulePills).toContain('含未解码效果');
    expect(v1380.actions.every((a) => a.kind === 'unit' && a.to.startsWith('/unit/'))).toBe(true);
    expect(v1380.boundaryNote).toContain('其余效果以游戏说明为准');
  });

  it('全部 10 项费用编码科技生成的入口链接零死链、零解码错误、零账本阻断', () => {
    const ctx = { core, trees };
    for (const id of [455, 488, 499, 514, 625, 782, 785, 835, 1380, 1496]) {
      const tech = core.techById[id]!;
      const view = buildTechCostChangeView(tech, false, core, trees)!;
      const viewWithoutTrees = buildTechCostChangeView(tech, false, core, null)!;
      expect(viewWithoutTrees.actions, `#${id} SSR/trees-null actions parity`).toEqual(view.actions);
      expect(view.actions.length).toBeGreaterThan(0);

      for (const action of view.actions) {
        if (action.kind === 'army-cost') {
          const query = action.to.split('?')[1] ?? '';
          const decoded = decodeArmyCost(query);
          expect(decoded.errors, `#${id} army-cost decode`).toEqual([]);
          expect(decoded.dataChanged).toBe(false);
          const evalRes = evaluateArmyCost(ctx, decoded.config!);
          expect(evalRes.blocked, `#${id} army-cost blocked`).toEqual([]);
          expect(evalRes.partial, `#${id} army-cost partial`).toBe(false);
          expect(evalRes.training.lines[0]?.status, `#${id} army-cost line`).toBe('ok');
        } else if (action.kind === 'production') {
          const query = action.to.split('?')[1] ?? '';
          const decoded = decodeProduction(query);
          expect(decoded.errors, `#${id} production decode`).toEqual([]);
          const calc = calculateProduction(ctx, decoded.config);
          expect(calc.errors, `#${id} production errors`).toEqual([]);
          expect(calc.lines.length, `#${id} production lines`).toBe(1);
        } else if (action.kind === 'building') {
          const bid = Number(/\/building\/(\d+)/.exec(action.to)?.[1]);
          const b = core.buildingById[bid];
          expect(b, `#${id} building ${action.to}`).toBeTruthy();
          expect(b!.civs).toContain(view.ownerCivEn!);
        } else if (action.kind === 'unit') {
          const uid = Number(/\/unit\/(\d+)/.exec(action.to)?.[1]);
          const u = core.unitById[uid];
          expect(u, `#${id} unit ${action.to}`).toBeTruthy();
          expect(u!.civs).toContain(view.ownerCivEn!);
        }
      }
    }
  });

  it('TechDetail SSR 正确呈现三态底部来源说明、费用变化块且不暴露内部属性或资源槽号', () => {
    // 费用编码：514
    const html514 = markup('/tech/514?civ=Magyars');
    const text514 = visible(html514);
    expect(html514).toContain('id="tech-cost-changes"');
    expect(text514).toContain('费用变化');
    expect(text514).toContain('马扎尔骠骑');
    expect(text514).toContain('精锐马扎尔骠骑');
    expect(text514).toContain('+45食');
    expect(text514).toContain('-45金');
    expect(text514).toContain('在阵容账本中试算');
    expect(text514).toContain('打开持续生产');
    expect(text514).toContain('训练费用已按固定数据编码；未在站内消费的效果以游戏说明为准');
    expect(text514).not.toContain('这条科技没有编码数值');

    // 其他已消费编码：202 双刃斧 / 315 征招 / 506 大干道 / 578 土堡 / 484 射箭孔 / 576 蛮王 / 996 强化堡垒 / 1379 突袭 / 1393 箭毒
    const text202 = visible(markup('/tech/202'));
    expect(text202).toContain('本页不逐条模拟属性；经济收益工具已采用固定数据编码，其余效果以游戏说明为准');
    expect(text202).not.toContain('这条科技没有编码数值');

    const text315 = visible(markup('/tech/315'));
    expect(text315).toContain('本页不逐条模拟属性；持续生产工具已采用固定数据编码，其余效果以游戏说明为准');

    const text506 = visible(markup('/tech/506'));
    expect(text506).toContain('本页不逐条模拟属性；持续生产与市场工具已采用固定数据编码，其余效果以游戏说明为准');
    expect(text506).not.toContain('经济收益');

    const text578 = visible(markup('/tech/578'));
    expect(text578).toContain('本页不逐条模拟属性；建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准');
    expect(text578).not.toContain('持续生产');

    const text484 = visible(markup('/tech/484'));
    expect(text484).toContain('本页不逐条模拟属性；建筑驻军与满科技对照已采用固定数据编码，其余效果以游戏说明为准');
    expect(text484).not.toContain('单位 PK');

    const text576 = visible(markup('/tech/576'));
    expect(text576).toContain('本页不逐条模拟属性；建筑驻军与满科技对照已采用固定数据编码，其余效果以游戏说明为准');
    expect(text576).not.toContain('单位 PK');

    const text996 = visible(markup('/tech/996'));
    expect(text996).toContain('本页不逐条模拟属性；建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准');
    expect(text996).not.toContain('单位 PK');

    const text1379 = visible(markup('/tech/1379'));
    expect(text1379).toContain('本页不逐条模拟属性；单位 PK 与模拟器已读取固定数据编码作机制提示，其余效果以游戏说明为准');

    const text1393 = visible(markup('/tech/1393'));
    expect(text1393).toContain('本页不逐条模拟属性；单位 PK 与模拟器、建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准');

    const text102 = visible(markup('/tech/102'));
    expect(text102).toContain('本页不逐条模拟属性；开局模拟工具已采用固定数据编码，其余效果以游戏说明为准');
    expect(text102).not.toContain('经济收益');

    const text13 = visible(markup('/tech/13'));
    expect(text13).toContain('本页不逐条模拟属性；农田食物量、持续生产与开局模拟已采用固定数据编码，其余效果以游戏说明为准');
    expect(text13).not.toContain('经济收益');

    const text65 = visible(markup('/tech/65'));
    expect(text65).toContain('本页不逐条模拟属性；渔船采集与开局模拟已采用固定数据编码，其余效果以游戏说明为准');
    expect(text65).not.toContain('经济收益');

    // 排除项（仅 res:33 与真无编码）：1484 / 21 / 573
    for (const id of [1484, 21, 573]) {
      const html = markup(`/tech/${id}`);
      const text = visible(html);
      expect(html).not.toContain('id="tech-cost-changes"');
      expect(text).toContain('这条科技没有已解码数值规则，以游戏说明为准');
    }

    // 模拟规则保持既有文案：435 血统
    const html435 = markup('/tech/435');
    expect(html435).not.toContain('id="tech-cost-changes"');
    expect(visible(html435)).toContain('结构化效果与科技模拟器同源；未编码效果以游戏说明为准');

    // 10 项费用编码科技正文均不泄漏内部属性号/资源槽号
    for (const id of [455, 488, 499, 514, 625, 782, 785, 835, 1380, 1496]) {
      const html = markup(`/tech/${id}`);
      const costSection = html.match(/<section[^>]*id="tech-cost-changes"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
      expect(costSection.length, `#${id} cost section`).toBeGreaterThan(0);
      const sectionText = visible(costSection);
      expect(sectionText).not.toMatch(/a:\d+|res:\d+|属性\s*\d+|资源\s*33|资源槽/);
    }
  });

  it('来源说明与站内工具真实消费行为一致（578 土堡、484/576/996 建筑科技、506 大干道）', () => {
    const ctx = { core, trees };

    // 578 土堡：持续生产跳过并提示整项未计入，建筑满科技对照在城堡行读取作未计入提示
    const prodBefore578 = calculateProduction(ctx, { civ: 'Berbers', age: 3, techs: [], rows: [{ unit: 1007, building: 82, count: '1' }], walk: 0, farm: 0 });
    const prodAfter578 = calculateProduction(ctx, { civ: 'Berbers', age: 3, techs: [578], rows: [{ unit: 1007, building: 82, count: '1' }], walk: 0, farm: 0 });
    expect(prodAfter578.lines[0]!.seconds).toBe(prodBefore578.lines[0]!.seconds);
    expect(prodAfter578.warnings.some((w) => w.includes('土堡') && w.includes('整项未计入'))).toBe(true);
    const castleRank = buildBuildingCivRank(ctx, core.buildingById[82]!, 3);
    const berberRow = castleRank.rows.find((r) => r.civ === 'Berbers');
    expect(berberRow?.tags.some((t) => t.includes('土堡'))).toBe(true);
    const c578 = classifyTechDataConsumption(core.techById[578]!, false, { unitById: core.unitById, buildingById: core.buildingById });
    expect(c578.domains).toEqual(['building-combat-notice']);

    // 484 射箭孔 / 576 蛮王 / 996 强化堡垒：目标均为建筑，归入建筑驻军或建筑满科技对照，绝不归入单位 PK
    const civ484 = core.techById[484]!.civs[0]!;
    const civ576 = core.techById[576]!.civs[0]!;
    const civ996 = core.techById[996]!.civs[0]!;
    const towerRank = buildBuildingCivRank(ctx, core.buildingById[79]!, 4);
    const tcRank = buildBuildingCivRank(ctx, core.buildingById[109]!, 4);
    expect(towerRank.rows.find((r) => r.civ === civ484)?.tags.some((t) => t.includes('射箭孔'))).toBe(true);
    expect(tcRank.rows.find((r) => r.civ === civ576)?.tags.some((t) => t.includes('蛮王'))).toBe(true);
    expect(towerRank.rows.find((r) => r.civ === civ996)?.tags.some((t) => t.includes('强化堡垒'))).toBe(true);
    expect(classifyTechDataConsumption(core.techById[484]!, false, { unitById: core.unitById, buildingById: core.buildingById }).domains).toEqual([
      'building-garrison',
    ]);
    expect(classifyTechDataConsumption(core.techById[576]!, false, { unitById: core.unitById, buildingById: core.buildingById }).domains).toEqual([
      'building-garrison',
    ]);
    expect(classifyTechDataConsumption(core.techById[996]!, false, { unitById: core.unitById, buildingById: core.buildingById }).domains).toEqual([
      'building-combat-notice',
    ]);

    // 506 大干道：持续生产改变采金速率、市场采用 10% 手续费，但不在经济收益工具可选清单中
    const payoffIds = payoffAvailable(ctx, { civ: 'Hindustanis', age: 4 }).map((t) => t.id);
    expect(payoffIds).not.toContain(506);
    expect(marketFee({ civ: 'Hindustanis', guilds: false, unique: true })).toBe(0.1);
    const prodBefore506 = calculateProduction(ctx, {
      civ: 'Hindustanis',
      age: 3,
      techs: [],
      rows: [{ unit: 38, building: 101, count: '1' }],
      walk: 0,
      farm: 0,
    });
    const prodAfter506 = calculateProduction(ctx, {
      civ: 'Hindustanis',
      age: 3,
      techs: [506],
      rows: [{ unit: 38, building: 101, count: '1' }],
      walk: 0,
      farm: 0,
    });
    const goldBefore = prodBefore506.resources.find((r) => r.key === 'Gold')!.income;
    const goldAfter = prodAfter506.resources.find((r) => r.key === 'Gold')!.income;
    expect(goldAfter).toBeGreaterThan(goldBefore);
    expect(classifyTechDataConsumption(core.techById[506]!, false, { unitById: core.unitById, buildingById: core.buildingById }).domains).toEqual([
      'production',
      'market',
    ]);
  });
});
