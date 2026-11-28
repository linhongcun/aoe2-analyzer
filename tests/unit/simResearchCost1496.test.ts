import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 脚本，没有类型声明
import { parseImports } from '../../scripts/check-layers.mjs';
import { validateDocument } from '../../scripts/content-schema.mjs';
import { buildSimResearchPrices, formatSimResearchPricesJson, isPureVariableIncrease } from '../../scripts/sim_research_prices_lib';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { civs, loadTrees } from '../../src/data';
import { SIM_RESEARCH_PRICES, type SimResearchPricesData } from '../../src/data/simResearchPrices';
import { addArmyCost, ARMY_RES, researchPrice } from '../../src/domain/armyResearchRules';
import { buildingSimTechs } from '../../src/domain/buildingSim';
import { applicableTrainingTechs } from '../../src/domain/duelTrainingCost';
import { applicableSimCostTechs, mergeSimCostTechs } from '../../src/domain/simEffectiveCost';
import {
  baseStats,
  detectOrderConflicts,
  formatBaseCostText,
  makeSimContext,
  quoteSimTechPrice,
  simTechs,
  summarizeSimResearch,
  totalCost,
  type SimContext,
} from '../../src/domain/simulator';
import type { Cost } from '../../src/domain/types';
import SimPanel from '../../src/shared/ui/sim/SimPanel';

const execFileAsync = promisify(execFile);
const viteNodeBin = resolve('node_modules/.bin', process.platform === 'win32' ? 'vite-node.cmd' : 'vite-node');

const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const costTuple = (c: Cost | null | undefined) => ARMY_RES.map((r) => c?.[r] ?? 0);

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let ctx: SimContext;

beforeAll(async () => {
  const trees = await loadTrees();
  ctx = makeSimContext(CORE.techs, trees);
});

describe('#1496 科技模拟器同源研究费用计算', () => {
  it('全站 56 文明 × 全目录单位/PK/建筑模拟器科技池 × 时代 1-4 与 researchPrice() 零偏差对账', () => {
    const affectedCivs = new Set<string>();
    const checkableDiffPairs = new Set<string>();
    const unitCheckablePairs = new Set<string>();
    const bldgCheckablePairs = new Set<string>();
    const renderedDiffPairs = new Set<string>();
    const unitRenderedPairs = new Set<string>();
    const bldgRenderedPairs = new Set<string>();
    const freePairs = new Set<string>();
    const decimalPairs = new Set<string>();
    const variableIncreases: string[] = [];
    const passiveUnverified: string[] = [];

    for (const civ of civs) {
      const civEn = civ.en;
      const unitCheckable = new Set<number>();
      const unitRendered = new Set<number>();
      for (const u of CORE.units) {
        if (!u.civs.includes(civEn)) continue;
        const simCost = applicableSimCostTechs(ctx, u, civEn);
        const simCostIds = new Set(simCost.map((x) => x.tech.id));
        const merged = mergeSimCostTechs(simTechs(ctx, u, civEn), simCost);
        for (const item of merged) {
          unitRendered.add(item.t.id);
          if (item.ef || simCostIds.has(item.t.id)) unitCheckable.add(item.t.id);
        }
        // DuelSelection 嵌入科技池
        for (const item of applicableTrainingTechs(ctx, u, civEn, 4)) {
          unitRendered.add(item.tech.id);
          unitCheckable.add(item.tech.id);
        }
      }

      const bldgCheckable = new Set<number>();
      const bldgRendered = new Set<number>();
      for (const b of CORE.buildings) {
        if (!b.civs.includes(civEn)) continue;
        const simCost = applicableSimCostTechs(ctx, b, civEn);
        const simCostIds = new Set(simCost.map((x) => x.tech.id));
        const merged = mergeSimCostTechs(buildingSimTechs(ctx, b, civEn), simCost);
        for (const item of merged) {
          bldgRendered.add(item.t.id);
          if (item.ef || simCostIds.has(item.t.id)) bldgCheckable.add(item.t.id);
        }
      }

      const allTechIds = new Set<number>([...unitRendered, ...bldgRendered]);
      for (const age of [1, 2, 3, 4] as const) {
        const avail = [...allTechIds].map((id) => ({ t: CORE.techById[id]!, ef: null }));
        const expectedTotal: Cost = {};
        const sel = new Set<number>();
        for (const tid of allTechIds) {
          const tech = CORE.techById[tid]!;
          const ref = researchPrice(ARMY_RESEARCH, civEn, age, tid, new Set([tid]), new Set());
          const got = quoteSimTechPrice(tech, civEn, age);
          if (!ref.cost) {
            passiveUnverified.push(`${civEn}:${age}:${tid}`);
            expect(got.state).toBe('unverified');
            expect(got.cost).toBeNull();
            continue;
          }
          if (isPureVariableIncrease(ref.cost, tech.cost)) {
            if (age === 4) variableIncreases.push(`${civEn}:${tid}`);
            expect(got.state).toBe('normal');
            expect(costTuple(got.cost)).toEqual(costTuple(tech.cost));
            sel.add(tid);
            addArmyCost(expectedTotal, tech.cost);
            continue;
          }
          expect(costTuple(got.cost)).toEqual(costTuple(ref.cost));
          expect(got.state === 'free').toBe(ref.free || ref.zero);
          sel.add(tid);
          addArmyCost(expectedTotal, ref.cost);

          if (age === 4) {
            const pairKey = `${civEn}:${tid}`;
            const differs = ARMY_RES.some((r) => (ref.cost![r] ?? 0) !== (tech.cost[r] ?? 0)) || ref.free || ref.zero;
            if (differs) {
              affectedCivs.add(civEn);
              renderedDiffPairs.add(pairKey);
              if (unitRendered.has(tid)) unitRenderedPairs.add(pairKey);
              if (bldgRendered.has(tid)) bldgRenderedPairs.add(pairKey);
              if (unitCheckable.has(tid)) unitCheckablePairs.add(pairKey);
              if (bldgCheckable.has(tid)) bldgCheckablePairs.add(pairKey);
              if (unitCheckable.has(tid) || bldgCheckable.has(tid)) checkableDiffPairs.add(pairKey);
              if (ref.free || ref.zero) freePairs.add(pairKey);
              if (got.hasDecimal) decimalPairs.add(pairKey);
            }
          }
        }
        const summary = summarizeSimResearch(avail, sel, civEn, age);
        expect(costTuple(summary.cost), `${civEn} age ${age}`).toEqual(costTuple(expectedTotal));
      }
    }

    expect(passiveUnverified).toEqual([]);
    expect(variableIncreases).toEqual(['Burgundians:755']);
    expect(affectedCivs.size).toBe(24);
    expect(checkableDiffPairs.size).toBeGreaterThanOrEqual(132);
    expect(unitCheckablePairs.size).toBeGreaterThanOrEqual(110);
    expect(bldgCheckablePairs.size).toBeGreaterThanOrEqual(37);
    expect(renderedDiffPairs.size).toBeGreaterThanOrEqual(151);
    expect(unitRenderedPairs.size).toBeGreaterThanOrEqual(115);
    expect(bldgRenderedPairs.size).toBeGreaterThanOrEqual(55);
    expect(freePairs.size).toBeGreaterThanOrEqual(25);
    expect(decimalPairs.size).toBeGreaterThanOrEqual(47);
  });

  it('核心代表锚点与时代联动精确对齐固定 .dat 与 #/production?mode=army-cost', () => {
    const availOf = (ids: number[]) => ids.map((id) => ({ t: CORE.techById[id]!, ef: null }));

    // 1) 意大利 精锐热那亚弩手 868（8 项）
    const it868Ids = [437, 199, 211, 200, 212, 201, 219, 47];
    const itChem = quoteSimTechPrice(CORE.techById[47]!, 'Italians', 4);
    expect(itChem.state).toBe('discounted');
    expect(costTuple(itChem.cost)).toEqual([225, 0, 150, 0]);
    expect(formatBaseCostText(itChem.baseCost)).toBe('300 食物 / 200 黄金');
    const it868 = totalCost(availOf(it868Ids), new Set(it868Ids), 'Italians', 4);
    expect(costTuple(it868.cost)).toEqual([1625, 250, 900, 0]);
    expect(costTuple(it868.baseCost)).toEqual([1700, 250, 950, 0]);
    expect(it868.time).toBe(415);
    expect(it868.decimalCount).toBe(0);
    expect(it868.state).toBe('discounted');

    // 2) 意大利 城堡 82（8 项，食物→木材→黄金→石料顺位）
    const castleIds = [47, 50, 51, 199, 200, 201, 322, 380];
    const itCastle = summarizeSimResearch(availOf(castleIds), new Set(castleIds), 'Italians', 4);
    expect(costTuple(itCastle.cost)).toEqual([1575, 281.25, 575, 75]);
    expect(costTuple(itCastle.baseCost)).toEqual([1900, 375, 650, 100]);
    expect(itCastle.time).toBe(390);
    expect(itCastle.decimalCount).toBe(2);

    // 3) 中国 城堡 82 与中国 劲弩手 492（帝王/城堡/封建）及村民 83 织布机 22（1-4 时代）
    const cnCastle = summarizeSimResearch(availOf(castleIds), new Set(castleIds), 'Chinese', 4);
    expect(costTuple(cnCastle.cost)).toEqual([1615, 318.75, 552.5, 85]);
    expect(cnCastle.decimalCount).toBe(3);

    const cn492Imp = summarizeSimResearch(availOf(it868Ids), new Set(it868Ids), 'Chinese', 4);
    expect(costTuple(cn492Imp.cost)).toEqual([1445, 212.5, 807.5, 0]);
    expect(cn492Imp.decimalCount).toBe(4);
    const cn492CasIds = [437, 199, 211, 200, 212];
    expect(costTuple(summarizeSimResearch(availOf(cn492CasIds), new Set(cn492CasIds), 'Chinese', 3).cost)).toEqual([765, 225, 270, 0]);
    const cn492FeuIds = [199, 211];
    expect(costTuple(summarizeSimResearch(availOf(cn492FeuIds), new Set(cn492FeuIds), 'Chinese', 2).cost)).toEqual([190, 0, 47.5, 0]);

    const loom = CORE.techById[22]!;
    expect([1, 2, 3, 4].map((age) => quoteSimTechPrice(loom, 'Chinese', age).cost?.Gold)).toEqual([50, 47.5, 45, 42.5]);

    // 4) 马扎尔 翼骑兵 441（8 项混排 + 3 项全免）
    const hussarIds = [435, 39, 67, 81, 68, 82, 75, 80];
    for (const tid of [67, 68, 75]) expect(quoteSimTechPrice(CORE.techById[tid]!, 'Magyars', 4).state).toBe('free');
    const mag8 = summarizeSimResearch(availOf(hussarIds), new Set(hussarIds), 'Magyars', 4);
    expect(costTuple(mag8.cost)).toEqual([1050, 0, 450, 0]);
    expect(mag8.time).toBe(495);
    const mag3 = summarizeSimResearch(availOf(hussarIds), new Set([67, 68, 75]), 'Magyars', 4);
    expect(mag3.state).toBe('free');
    expect(mag3.allFree).toBe(true);
    expect(costTuple(mag3.cost)).toEqual([0, 0, 0, 0]);
    expect(costTuple(mag3.baseCost)).toEqual([645, 0, 345, 0]);
    expect(mag3.time).toBe(225);

    // 5) 西班牙 翼骑兵 441（铁匠铺免金）
    const spa8 = summarizeSimResearch(availOf(hussarIds), new Set(hussarIds), 'Spanish', 4);
    expect(costTuple(spa8.cost)).toEqual([1695, 0, 100, 0]);
    expect(quoteSimTechPrice(CORE.techById[67]!, 'Spanish', 4).state).toBe('normal');
    expect(quoteSimTechPrice(CORE.techById[81]!, 'Spanish', 4).state).toBe('normal');
    const spa68 = quoteSimTechPrice(CORE.techById[68]!, 'Spanish', 4);
    expect(spa68.state).toBe('discounted');
    expect(spa68.cost?.Gold).toBe(0);

    // 6) 勃艮第 翼骑兵 441（7 项）与意大利大帆船 2628（4 项）
    const burIds = [39, 67, 81, 68, 82, 75, 80];
    expect(costTuple(quoteSimTechPrice(CORE.techById[39]!, 'Burgundians', 4).cost)).toEqual([75, 0, 0, 0]);
    expect(costTuple(summarizeSimResearch(availOf(burIds), new Set(burIds), 'Burgundians', 4).cost)).toEqual([1470, 0, 695, 0]);

    const itGalIds = [373, 374, 375, 908];
    const itGal = summarizeSimResearch(availOf(itGalIds), new Set(itGalIds), 'Italians', 4);
    expect(costTuple(itGal.cost)).toEqual([1087.5, 75, 675, 0]);
    expect(itGal.time).toBe(220);
    expect(itGal.decimalCount).toBe(1);
  });

  it('边界与反例锁定：无折扣/空态、勃艮第 755 过滤、波希米亚 785 顺序冲突、条顿 322、小数加总为整数', () => {
    // 无折扣文明 + 空态
    const frAvail = simTechs(ctx, CORE.unitById[569]!, 'Franks');
    const frEmpty = summarizeSimResearch(frAvail, new Set(), 'Franks', 4);
    expect(frEmpty.state).toBe('empty');
    expect(frEmpty.discounted).toBe(false);
    expect(frEmpty.decimalCount).toBe(0);
    const frFull = summarizeSimResearch(frAvail, new Set(frAvail.filter((x) => x.ef).map((x) => x.t.id)), 'Franks', 4);
    expect(frFull.state).toBe('normal');
    expect(frFull.discounted).toBe(false);

    // 勃艮第 755 弗拉芒革命保留目录原价 200F 150G，且 213+249 正常折后
    const flemish = quoteSimTechPrice(CORE.techById[755]!, 'Burgundians', 4);
    expect(flemish.state).toBe('normal');
    expect(costTuple(flemish.cost)).toEqual([200, 0, 150, 0]);
    const burEco = summarizeSimResearch(
      [213, 249].map((id) => ({ t: CORE.techById[id]!, ef: null })),
      new Set([213, 249]),
      'Burgundians',
      4,
    );
    expect(costTuple(burEco.cost)).toEqual([285, 250, 0, 0]);
    expect(burEco.time).toBe(130);

    // 波希米亚 僧侣 125 满科技同勾 785 + 231/252/230
    const bohMonkAvail = simTechs(ctx, CORE.unitById[125]!, 'Bohemians');
    const bohSel = new Set([231, 252, 230, 785]);
    const bohFull = summarizeSimResearch(bohMonkAvail, bohSel, 'Bohemians', 4);
    expect(costTuple(bohFull.cost)).toEqual([500, 0, 965, 0]);
    expect(bohFull.time).toBe(210);
    expect(bohFull.orderConflict).toEqual({
      modifierIds: [785],
      modifierNames: ['胡斯革新'],
      affectedIds: bohMonkAvail.filter((x) => [231, 252, 230].includes(x.t.id)).map((x) => x.t.id),
      affectedNames: bohMonkAvail.filter((x) => [231, 252, 230].includes(x.t.id)).map((x) => x.t.zh),
    });
    expect(detectOrderConflicts(bohMonkAvail, new Set([231, 252, 230]), 'Bohemians')).toBeNull();
    expect(detectOrderConflicts(bohMonkAvail, new Set([785]), 'Bohemians')).toBeNull();

    // 条顿 城堡 82 t:322 近射孔：200 食 / 0 石（非免费）
    const teuton322 = quoteSimTechPrice(CORE.techById[322]!, 'Teutons', 4);
    expect(teuton322.state).toBe('discounted');
    expect(teuton322.free).toBe(false);
    expect(teuton322.cost).toEqual({ Food: 200, Stone: 0 });

    // 多项含小数但加总恰好为整数（中国帝王：212 127.5F/127.5G + 219 212.5F/212.5G = 340F/340G，decimalCount 仍为 2）
    const cnSumInt = summarizeSimResearch(
      [212, 219].map((id) => ({ t: CORE.techById[id]!, ef: null })),
      new Set([212, 219]),
      'Chinese',
      4,
    );
    expect(costTuple(cnSumInt.cost)).toEqual([340, 0, 340, 0]);
    expect(cnSumInt.decimalCount).toBe(2);
  });

  it('防御性 fail-closed：模拟 cost: null 排除合计并在 SimPanel SSR 正确呈现部分小计与全未核实态', () => {
    const mockedPrices: SimResearchPricesData = {
      meta: SIM_RESEARCH_PRICES.meta,
      civs: {
        ...SIM_RESEARCH_PRICES.civs,
        Italians: {
          ...SIM_RESEARCH_PRICES.civs.Italians,
          '47': { kind: 'all', entry: { cost: null, reason: '模拟夹具：影响化学费用的条件未核实' } },
        },
      },
      orderModifiers: SIM_RESEARCH_PRICES.orderModifiers,
    };

    const u = CORE.unitById[868]!;
    const avail = simTechs(ctx, u, 'Italians');
    const sel8 = new Set([437, 199, 211, 200, 212, 201, 219, 47]);

    const partial = summarizeSimResearch(avail, sel8, 'Italians', 4, mockedPrices);
    expect(partial.state).toBe('partial');
    expect(partial.unverifiedCount).toBe(1);
    expect(partial.verifiedCount).toBe(7);
    expect(costTuple(partial.cost)).toEqual([1400, 250, 750, 0]);

    const stats = baseStats(u);
    const renderSim = (sel: Set<number>) =>
      renderToStaticMarkup(
        createElement(
          StaticRouter,
          { location: '/unit/868' },
          createElement(SimPanel, {
            civs: u.civs,
            minAge: 3,
            civ: 'Italians',
            age: 4,
            sel,
            team: new Set<number>(),
            cmp: '',
            avail,
            techById: CORE.techById,
            rows: [['hp', '生命值', 'hp']],
            base: stats,
            cur: stats,
            cmpStats: null,
            civNotes: [],
            teamBonuses: [],
            go: () => {},
            setCmp: () => {},
            researchCostNote: '一次性研究投入，不计入单兵训练价',
            researchPrices: mockedPrices,
          }),
        ),
      );

    const partialHtml = renderSim(sel8);
    expect(partialHtml).toContain('data-price-state="unverified"');
    expect(partialHtml).toContain('data-t="sim-row-unverified"');
    expect(partialHtml).toContain('data-t="sim-summary-partial-badge"');
    expect(partialHtml).toContain('data-state="partial"');
    expect(visible(partialHtml)).toContain('已核实项目小计');
    expect(visible(partialHtml)).toContain('有 1 项已选研究费用未核实，未计入上方小计（不按 0 或目录原价补算）。');

    const onlyUnverifiedHtml = renderSim(new Set([47]));
    expect(onlyUnverifiedHtml).toContain('data-state="unverified-only"');
    expect(onlyUnverifiedHtml).toContain('data-t="sim-summary-unverified-only"');
    expect(visible(onlyUnverifiedHtml)).toContain('当前已选 1 项研究费用均未核实，暂不展示累计金额（不按 0 或目录原价补算）。');
  });

  it('派生索引零漂移、311 KiB army_research.json 传递闭包隔离与 CLI 守卫', async () => {
    // 1) 进程内全量复现与 schema 负例校验
    const built = buildSimResearchPrices(CORE, ARMY_RESEARCH);
    const committed = readFileSync(resolve('data/game/sim_research_prices.json'), 'utf8');
    expect(formatSimResearchPricesJson(built)).toBe(committed);
    expect(committed).not.toContain('"buildingTriggers"');
    expect(committed).not.toContain('"chargeOnlyCombatUnits"');
    expect(committed).not.toContain('"fxTriggeredTechs"');
    expect(validateDocument('data/game/sim_research_prices.json', built).valid).toBe(true);
    const badExtra = structuredClone(built) as unknown as Record<string, unknown>;
    badExtra.unexpected = 1;
    expect(validateDocument('data/game/sim_research_prices.json', badExtra).valid).toBe(false);

    // 2) 静态传递闭包：SimPanel / simulator / simResearchCost / romanArmor710 均不引入 army_research.json；生成器不自引产物
    const transitiveClosure = (entries: string[]) => {
      const seen = new Set<string>();
      const queue = [...entries];
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (!/\.(?:ts|tsx|mjs|js)$/.test(cur)) continue;
        for (const edge of parseImports(resolve(cur))) {
          if (edge.typeOnly || !edge.to) continue;
          if (!seen.has(edge.to)) queue.push(edge.to);
        }
      }
      return seen;
    };
    const uiClosure = transitiveClosure([
      'src/shared/ui/sim/SimPanel.tsx',
      'src/domain/simulator.ts',
      'src/domain/simResearchCost.ts',
      'src/features/bonuses/romanArmor710.ts',
    ]);
    expect(uiClosure.has('data/game/army_research.json')).toBe(false);
    expect(uiClosure.has('src/data/armyResearch.ts')).toBe(false);
    expect(uiClosure.has('data/game/sim_research_prices.json')).toBe(true);
    const genClosure = transitiveClosure(['scripts/sim_research_prices_build.ts', 'scripts/sim_research_prices_lib.ts']);
    expect(genClosure.has('data/game/sim_research_prices.json')).toBe(false);
    expect(genClosure.has('src/data/simResearchPrices.ts')).toBe(false);

    // 3) 轻量符号链接子进程测试 CLI：--civ 保护守卫 + 子集写入 + --check 复现与漂移报错
    const tempDir = mkdtempSync(join(tmpdir(), 'sim-research-prices-1496-'));
    tempDirs.push(tempDir);
    for (const sub of ['scripts', 'data/game', 'node_modules']) {
      mkdirSync(join(tempDir, sub), { recursive: true });
    }
    cpSync(resolve('scripts/sim_research_prices_build.ts'), join(tempDir, 'scripts/sim_research_prices_build.ts'));
    cpSync(resolve('scripts/sim_research_prices_lib.ts'), join(tempDir, 'scripts/sim_research_prices_lib.ts'));
    for (const rel of ['src', 'data/sources', 'data/patch-notes', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
      symlinkSync(resolve(rel), join(tempDir, rel));
    }
    for (const entry of readdirSync(resolve('node_modules'))) {
      if (!entry.startsWith('.vite')) symlinkSync(resolve('node_modules', entry), join(tempDir, 'node_modules', entry));
    }
    for (const name of readdirSync(resolve('data/game'))) {
      if (name !== 'sim_research_prices.json') symlinkSync(resolve('data/game', name), join(tempDir, 'data/game', name));
    }

    const subsetOut = join(tempDir, 'subset.json');
    await expect(execFileAsync(viteNodeBin, ['scripts/sim_research_prices_build.ts', '--civ', 'Spanish'], { cwd: tempDir })).rejects.toThrow(
      /--civ requires an explicit --out/,
    );

    await execFileAsync(viteNodeBin, ['scripts/sim_research_prices_build.ts', '--civ', 'Spanish', '--out', subsetOut], { cwd: tempDir });
    await execFileAsync(viteNodeBin, ['scripts/sim_research_prices_build.ts', '--civ', 'Spanish', '--check', '--out', subsetOut], { cwd: tempDir });

    writeFileSync(subsetOut, '{"tampered":true}\n', 'utf8');
    await expect(
      execFileAsync(viteNodeBin, ['scripts/sim_research_prices_build.ts', '--civ', 'Spanish', '--check', '--out', subsetOut], { cwd: tempDir }),
    ).rejects.toThrow(/drift/);
  }, 30000);
});
