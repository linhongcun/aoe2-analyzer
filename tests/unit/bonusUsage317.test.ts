// issue 317：经济/费用类文明加成（src = 'eco'）的「是否计入」标签必须与各工具的实际计算一致。
// 判定不靠标签自身：开局模拟用「去掉该加成的 civEco 行后重跑」看结果是否变化，真实成本 / 训练费用直接调用工具函数。
// 开局模拟全量重跑约 60 次 × 8 个开局方案，太慢（CI 上 60 s 以上），结果存成快照 fixtures/bonusUsage317-sim.json：
// 快照带输入指纹（整个 eco.json 数据对象、开局方案、升级数据、buildSim.ts 及拆分的文明规则/覆盖/效果/数值求值/训练周期/费用策略/机制/附注模块、roundHalfPrice.ts / buildOrder.ts 源码），任一变化本测试即失败，提示重新生成：
//   UPDATE_BONUS317=1 npx vitest run tests/unit/bonusUsage317.test.ts
// 平时只抽两条（条顿第 1 条、阿兹特克第 1 条）在记录的开局方案上现场重跑，确认快照与真实计算一致。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import eco from '../../data/game/eco.json';
import units from '../../data/game/units.json';
import { civs, loadCore, type Core } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
import { bonusLevel, bonusTechs, bonusUsage, showEcoSourceTag, usageLevel } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { bonusDiscountCounted } from '../../src/domain/costPolicy';
import { simSupport } from '../../src/domain/simSupport';
import { defaultGatherEcoTechIds, gatherModel } from '../../src/domain/realCost';
import { armenianContext, ARMENIAN_RESEARCH_IDS } from '../../src/domain/armenianEconomy';
import { discountedCost } from '../../src/domain/costDiscount';
import { calculateConstruction, DEFAULT_CONSTRUCTION } from '../../src/domain/construction';
import { loadTrees } from '../../src/data';
import { BonusBodyContent } from '../../src/shared/ui/BonusBody';
// @ts-expect-error 纯 JS 脚本，没有类型声明
import { parseImports } from '../../scripts/check-layers.mjs';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const ALL = civs.flatMap((c) => civBonuses(c)).filter((b) => !b.team);
/** 112 条非团队经济/费用类加成 + 37 条 src = text（没有关联 .dat 条目）的加成：后者被工具计入时同样要按工具标注（Steve 2026-10-21） */
const ECO = ALL.filter((b) => b.src === 'eco' || b.src === 'text');
const bon = (id: string) => ECO.find((b) => b.id === id)!;
const line = (b: CivBonusEnt, tool: string) => bonusUsage(b).filter((l) => l.tool === tool);
const runBo = (bo: (typeof buildOrders)[number], civ: string, e: EcoData) =>
  JSON.stringify(simulateBuild(bo, civ, e, ups, { walkTiles: 4 }).steps.map((s) => [s.doneAt, s.stock]));
const techsOf = (b: CivBonusEnt) => bonusTechs(b).techs;
/** 去掉该加成后第一个结果变化的开局方案 id；都不变为 null */
const firstChanged = (b: CivBonusEnt, bos = buildOrders): string | null => {
  const e = without(b.civ, techsOf(b));
  return bos.find((bo) => runBo(bo, b.civ, e) !== runBo(bo, b.civ, E))?.id ?? null;
};
/** 需要开局模拟对照的加成：支持的文明、有 .dat 正 tech 号 */
const SIM_CHECKED = ECO.filter((b) => simSupport(b.civ) && techsOf(b).length > 0);
const SNAP_URL = new URL('../../data/fixtures/unit/fixtures/bonusUsage317-sim.json', import.meta.url);
const sha = (...xs: string[]) => createHash('sha256').update(xs.join('\n')).digest('hex');
const inputsHash = () =>
  sha(
    JSON.stringify(E),
    JSON.stringify(buildOrders),
    JSON.stringify(ups),
    ...[
      'buildSim.ts',
      'buildSimCivRules.ts',
      'buildSimCoverage.ts',
      'unhandledRes.ts',
      'numericEffects.ts',
      'trainingCycle.ts',
      'buildSimEffects.ts',
      'buildSimMechanisms.ts',
      'specialIncome.ts',
      'buildSimNotes.ts',
      'roundHalfPrice.ts',
      'costPolicy.ts',
      'buildOrder.ts',
      'weiEconomy.ts',
      'bengaliEconomy.ts',
      'armenianEconomy.ts',
      'georgianEconomy.ts',
      'slavicEconomy.ts',
      'khmerEconomy.ts',
      'jurchenEconomy.ts',
      'chineseEconomy.ts',
      'mapucheEconomy.ts',
      'gurjaraEconomy.ts',
      'polishEconomy.ts',
      'romanEconomy.ts',
      'khmerSource.ts',
      'khmerPrerequisiteSource.ts',
    ].map((f) => readFileSync(fileURLToPath(new URL(`../../src/domain/${f}`, import.meta.url)), 'utf8')),
    readFileSync(fileURLToPath(new URL('../../data/game/construction.json', import.meta.url)), 'utf8'),
    readFileSync(fileURLToPath(new URL('../../src/data/construction.ts', import.meta.url)), 'utf8'),
    readFileSync(fileURLToPath(new URL('../../src/content/schema/compiled/wei-spawn.mjs', import.meta.url)), 'utf8'),
  );
type Snap = { inputs: string; firstChanged: Record<string, string | null> };
const UPDATE = !!process.env.UPDATE_BONUS317;
const readSnap = (): Snap => JSON.parse(readFileSync(SNAP_URL, 'utf8')) as Snap;
const without = (civ: string, techs: number[]): EcoData => ({
  ...E,
  civEco: { ...E.civEco, [civ]: E.civEco[civ]!.filter((r) => !techs.includes((r as { tech?: number }).tech ?? NaN)) },
});

/** 模型已实现、但现有开局方案（城堡时代及以前、不造对应单位/建筑、不研究对应科技）都不会触发的加成 */
const UNTRIGGERED: Record<string, string> = {
  'Khmer-1':
    '免回仓与独立农田供给已计入；默认近距离2格时，完整654与整行移除均被同一0.4/秒供给上限限制，原对照只观察步骤完成时间/库存，未触发差异；khmer197.test.ts另以7格与低工作率库存窗口核对免回仓和供给瓶颈',
  'Berbers-1': '马厩单位城堡/帝王时代折扣：现有开局方案不在城堡时代训练马厩单位',
  'Bulgarians-2': '城镇中心石料 -50%：现有开局方案不建新城镇中心',
  'Incas-1': '建筑石料 -15%：现有开局方案不建花石料的建筑',
  'Muisca-4': '篷车、行会免费：现有开局方案不研究这两项科技',
  'Shu-1': '弓兵科技折扣已实际付费；现有3个相关方案均在末步研究199，原结果只记录步骤开始库存和完成时间，付费后无新检查点；shu197.test.ts另以检查点严格核对扣款',
  'Mayans-2':
    '现有8套开局不在城堡或帝王时代训练弓手；53/56的正tech折扣没有触发，树中的封建折扣不被正tech移除对照覆盖；mayans197.test.ts另以三个时代的真实训练支付严格核对',
  'Armenians-3': '当前8套开局不建强化教堂，不触发两段圣物生成；移除949/957保留独立骡车来源和研究加成',
  'Armenians-4': '海军战斗加成不改变当前8套的渔船经济；当前方案不训练或交战对应军事舰船',
  'Georgians-0':
    '起始免费骡车已计入完成实体和一种时代前置；当前8套原营地仍逐次付费，原库存/时钟投影未被起始车改变；georgians197.test.ts另以at0实体、起始研究地点和时代前置严格核对',
};

let core: Core;
beforeAll(async () => {
  core = await loadCore();
});

describe('issue 317 罗马', () => {
  it('第 1 条（村民收集、建造和修理 +5%）：按工具写明已计入 / 未计入，不再是「仅文本」', () => {
    const b = bon('Romans-0');
    expect(b.encoded).toBe(false);
    expect(bonusUsage(b).map((l) => [l.tool, l.on])).toEqual([
      ['sim', true],
      ['gather', true],
      ['construction', true],
      ['repair', false],
    ]);
    expect(usageLevel(bonusUsage(b))).toBe('part');
    // #197 最后一批：完整887与独立农田供给核验后，采集与施工均计入。
    expect(simSupport('Romans')).toBe(true);
    expect(line(b, 'sim')[0]!.note).toContain('村民采集与建造加成已计入');
    // 真实成本：村民采集 ×1.05 已计入（#1486：罗马缺双人锯 221，与同可用科技基准对照）
    const g = gatherModel(4, 'Romans');
    expect(g.applied.map((a) => [a.label, a.techs])).toContainEqual(['村民采集速度 +5%', [887]]);
    expect(g.rate.wood).toBeGreaterThan(gatherModel(4, '', { techIds: defaultGatherEcoTechIds(4, 'Romans') }).rate.wood);
    expect(g.rate.farm).toBeGreaterThan(gatherModel(4, '').rate.farm);
  });
  it('第 1 条：施工工具计入建造 +5%（与旧口径对照）', async () => {
    const ctx = { core, trees: await loadTrees() };
    const cfg = { ...DEFAULT_CONSTRUCTION, techs: [] };
    const r = calculateConstruction(ctx, { ...cfg, civ: 'Romans' });
    const base = calculateConstruction(ctx, { ...cfg, civ: 'Britons' });
    expect(r.errors).toEqual([]);
    expect(r.applied).toContain('罗马村民工作速率');
    expect(r.builderRate! / base.builderRate!).toBeCloseTo(1.05, 6);
  });
  it('第 3 条（蝎式弩黄金 -50%）：训练费用已计入，其他工具不涉及', () => {
    const b = bon('Romans-2');
    expect(bonusUsage(b).map((l) => [l.tool, l.on])).toEqual([['cost', true]]);
    expect(usageLevel(bonusUsage(b))).toBe('all');
    for (const id of [279, 542]) {
      const u = core.unitById[id]!;
      const d = discountedCost(u, 'Romans', 4);
      expect(d.applied.map((a) => a.idx)).toEqual([2]);
      expect(d.cost.Gold).toBe(u.cost.Gold! / 2);
    }
  });
});

describe('issue 317 全部 src = eco 的加成：标签与工具实际计算一致', () => {
  it('覆盖面：121 条 src = eco、30 条 src = text、74 条 src = dat（非团队；Issue 1497 归正 Italians-3 / Huns-0 为 eco）', () => {
    expect(ALL).toHaveLength(225);
    expect(ALL.filter((b) => b.src === 'dat')).toHaveLength(74);
    expect(ECO.filter((b) => b.src === 'eco')).toHaveLength(121);
    expect(ECO.filter((b) => b.src === 'text')).toHaveLength(30);
    expect(ALL.filter((b) => b.src === 'manual')).toHaveLength(0);
  });
  it('src = text 中实际被工具计入的六条：亚美尼亚经济研究、凯尔特伐木、高棉免建筑前置、朝鲜采石、高丽战船木材、突厥采金', () => {
    const counted = ECO.filter((b) => b.src === 'text' && bonusUsage(b).some((l) => l.on === true)).map((b) => b.id);
    expect(counted).toEqual(['Armenians-1', 'Celts-0', 'Khmer-0', 'Koreans-0', 'Koreans-3', 'Turks-0']);
    expect(line(bon('Koreans-3'), 'cost').map((l) => l.on)).toEqual([true]);
    expect(line(bon('Armenians-1'), 'sim')[0]).toMatchObject({ on: true, note: '伐木、采矿科技增强仅在对应研究完成后计入' });
    expect(line(bon('Armenians-1'), 'gather')).toEqual([
      { tool: 'gather', name: '真实成本', on: true, note: '采集速度已计入（伐木 +14%、采金 +11%、采石 +5%）' },
    ]);
    expect(usageLevel(bonusUsage(bon('Armenians-1')))).toBe('all');
    expect(bonusTechs(bon('Armenians-1'))).toEqual({ techs: [...ARMENIAN_RESEARCH_IDS], treeOnly: false });
    // Issue 1473：反事实移除 Armenians-1 完整原子组 960–966 不得触发 armenianEconomy 组完整性假失败
    const armWithoutResearch = without('Armenians', bonusTechs(bon('Armenians-1')).techs);
    expect(armenianContext(armWithoutResearch).reasons).toEqual([]);
    expect(armenianContext(armWithoutResearch).research).toEqual([]);
    for (const [id, label] of [
      ['Celts-0', '伐木 +15%'],
      ['Koreans-0', '采石 +20%'],
      ['Turks-0', '采金 +25%'],
    ] as const) {
      const g = line(bon(id), 'gather');
      expect([id, g.map((l) => [l.on, l.note])]).toEqual([id, [[true, `采集速度已计入（${label}）`]]]);
    }
    // issue 332：朝鲜采石在科技树汇总行，开局方案不采石 → 开局模拟未计入（真实成本已计入）
    expect(line(bon('Koreans-0'), 'sim').map((l) => l.on)).toEqual([false]);
  });
  it.runIf(UPDATE)(
    '（UPDATE_BONUS317=1）重新生成开局模拟快照',
    () => {
      const snap: Snap = { inputs: inputsHash(), firstChanged: Object.fromEntries(SIM_CHECKED.map((b) => [b.id, firstChanged(b)])) };
      writeFileSync(SNAP_URL, JSON.stringify(snap, null, 2) + '\n');
    },
    300_000,
  );
  it('开局模拟快照与当前输入一致（输入变了请按文件头命令重新生成并审阅 diff）', () => {
    const snap = readSnap();
    expect(snap.inputs).toBe(inputsHash());
    expect(Object.keys(snap.firstChanged).sort()).toEqual(SIM_CHECKED.map((b) => b.id).sort());
  });
  it('快照抽查：条顿第 1 条（农田 -40%）、阿兹特克第 1 条（初始黄金 +50）现场重跑与快照一致', () => {
    const snap = readSnap();
    for (const id of ['Teutons-0', 'Aztecs-0']) {
      const bo = snap.firstChanged[id];
      expect([id, bo]).not.toEqual([id, null]);
      expect([
        id,
        firstChanged(
          bon(id),
          buildOrders.filter((x) => x.id === bo),
        ),
      ]).toEqual([id, bo]);
    }
  });
  it('开局模拟：标「已计入」当且仅当 去掉该加成后结果变化；不支持的文明整页按通用计算', () => {
    const snap = readSnap();
    const bad: string[] = [];
    for (const b of ECO) {
      const sim = line(b, 'sim')[0];
      if (!simSupport(b.civ)) {
        if (sim && sim.on !== false) bad.push(b.id + ' 不支持的文明不能标已计入');
        continue;
      }
      if (!techsOf(b).length) {
        // issue 332：科技树汇总加成已逐条下结论（已计入 / 未计入 / 无法核实）；结论正确性由 v0300-332 用去掉效果重跑对照
        if (sim && sim.on === null && !sim.note.trimStart().startsWith('无法核实')) bad.push(b.id + ' 科技树汇总效果须下结论或写「无法核实」');
        continue;
      }
      const changed = snap.firstChanged[b.id] !== null;
      if (changed && sim?.on !== true) bad.push(`${b.id} 改变了开局结果却没标已计入`);
      if (!changed && sim?.on === true && !UNTRIGGERED[b.id]) bad.push(`${b.id} 标已计入但现有开局方案都不受影响，需在 UNTRIGGERED 写明原因`);
      if (changed && UNTRIGGERED[b.id]) bad.push(`${b.id} 已经会改变开局结果，从 UNTRIGGERED 移除`);
    }
    expect(bad).toEqual([]);
  });
  it('真实成本 · 采集：标「已计入」当且仅当 gatherModel 的 applied 引用了这条加成', () => {
    for (const b of ECO) {
      const text = civs.find((c) => c.en === b.civ)!.bon[b.idx as number];
      const applied = gatherModel(4, b.civ).applied.some((a) => a.source === text);
      expect([b.id, line(b, 'gather').some((l) => l.on)]).toEqual([b.id, applied]);
    }
  });
  it('训练费用：标「已计入」当且仅当 discountedCost 对相关单位实际打折（建筑折扣不在 PK / 真实成本里）', () => {
    for (const b of ECO) {
      const hit =
        typeof b.idx === 'number' &&
        Object.values(core.unitById).some(
          (u) => u && u.civs.includes(b.civ) && discountedCost(u, b.civ, Math.max(4, u.age)).applied.some((a) => a.idx === b.idx),
        );
      expect([b.id, line(b, 'cost').some((l) => l.on)]).toEqual([b.id, hit]);
    }
  });
  it('来源标签（eco「.dat 经济/费用效果（文本展示）」、text「无 .dat 数据」）：有工具计入的不显示，没有工具计入的仍显示（Steve 设计审查）', () => {
    expect(showEcoSourceTag(bon('Romans-0'))).toBe(false);
    expect(showEcoSourceTag(bon('Romans-2'))).toBe(false);
    expect(showEcoSourceTag(bon('Chinese-0'))).toBe(false);
    let hidden = 0;
    for (const b of ECO.filter((x) => x.src === 'eco')) {
      const counted = bonusUsage(b).some((l) => l.on === true);
      expect([b.id, showEcoSourceTag(b)]).toEqual([b.id, !counted]);
      if (counted) hidden++;
    }
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(121);
    // src = text 同样规则：六条被工具计入，不显示；其余 24 条没有工具计入，仍显示
    const text = ECO.filter((x) => x.src === 'text');
    for (const b of text)
      expect([b.id, showEcoSourceTag(b)]).toEqual([b.id, !['Armenians-1', 'Celts-0', 'Khmer-0', 'Koreans-0', 'Koreans-3', 'Turks-0'].includes(b.id)]);
    expect(text.filter((b) => showEcoSourceTag(b))).toHaveLength(24);
  });
  it('没有任何工具计入的加成保持「仅文本」', () => {
    for (const b of ECO) if (!bonusUsage(b).some((l) => l.on)) expect([b.id, usageLevel(bonusUsage(b))]).toEqual([b.id, 'none']);
  });
});

function staticClosure(rootFiles: readonly string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...rootFiles];
  while (queue.length) {
    const rel = queue.shift()!;
    if (visited.has(rel)) continue;
    visited.add(rel);
    if (!/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u.test(rel)) continue;
    for (const edge of parseImports(resolve(rel))) {
      if (edge.to && !edge.dynamic && !edge.typeOnly && !visited.has(edge.to)) queue.push(edge.to);
    }
  }
  return visited;
}

describe('Issue 1497 零拥有规则归正、全站 225 条非团队对账与 BonusBody 双端展示', () => {
  const byId = (id: string) => ALL.find((b) => b.id === id)!;

  it('Italians-3 与 Huns-0 归正为 src=eco 并保留原始 rules；Burgundians-3 保持 src=dat', () => {
    const it3 = byId('Italians-3');
    expect(it3.src).toBe('eco');
    expect(it3.encoded).toBe(false);
    expect(bonusLevel(it3)).toBe('all');
    expect(showEcoSourceTag(it3)).toBe(false);
    expect(bonusUsage(it3).map((l) => [l.tool, l.on])).toEqual([['cost', true]]);
    expect(it3.dat.find((e) => e.tech === 500)?.rulesUnowned).toBe(true);
    expect(it3.dat.find((e) => e.tech === 500)?.rules[0]?.t).toEqual([1901, 1903, 1904, 1907, 1911]);

    const hu0 = byId('Huns-0');
    expect(hu0.src).toBe('eco');
    expect(hu0.encoded).toBe(false);
    expect(bonusLevel(hu0)).toBe('all');
    expect(showEcoSourceTag(hu0)).toBe(false);
    expect(bonusUsage(hu0).map((l) => [l.tool, l.on])).toEqual([['sim', true]]);
    expect(hu0.dat.find((e) => e.tech === 289)?.rulesUnowned).toBe(true);
    expect(hu0.dat.find((e) => e.tech === 289)?.rules[0]?.t).toEqual([70]);

    const bu3 = byId('Burgundians-3');
    expect(bu3.src).toBe('dat');
    expect(bu3.encoded).toBe(true);
    expect(bu3.dat.some((e) => e.rulesUnowned)).toBe(false);
  });

  it('8 条混合 src=dat 补齐真实工具明细；Spanish-3 与其余 59 条纯战斗 src=dat 零误报', () => {
    const ber0 = byId('Berbers-0');
    expect(ber0.src).toBe('dat');
    expect(bonusLevel(ber0)).toBe('all');
    expect(bonusUsage(ber0).map((l) => [l.tool, l.on])).toEqual([
      ['sim', true],
      ['gather', true],
    ]);
    expect(line(ber0, 'gather')[0]!.note).toBe('采集速度已计入（村民移速 +10%）');

    for (const id of ['Persians-1', 'Japanese-3', 'Berbers-2', 'Bohemians-3', 'Khitans-2', 'Aztecs-2']) {
      const b = byId(id);
      expect(b.src, id).toBe('dat');
      expect(b.encoded, id).toBe(true);
      expect(bonusLevel(b), id).toBe('all');
      expect(
        bonusUsage(b).map((l) => [l.tool, l.on]),
        id,
      ).toEqual([['sim', true]]);
    }

    const spa0 = byId('Spanish-0');
    expect(spa0.src).toBe('dat');
    expect(spa0.encoded).toBe(true);
    expect(bonusLevel(spa0)).toBe('all');
    expect(bonusUsage(spa0).map((l) => [l.tool, l.on])).toEqual([
      ['sim', false],
      ['construction', true],
    ]);
    expect(line(spa0, 'sim')[0]!.note).toBe('未计入：开局模拟暂未套用建筑工施工提速，新造建筑工期仍按通用速度计算');
    expect(line(spa0, 'construction')[0]!.note).toBe('建造者工作速率已计入');

    // Spanish-2 不得误标 construction；Spanish-3 与其余 58 条纯战斗 dat 返回空
    expect(line(byId('Spanish-2'), 'construction')).toEqual([]);
    expect(bonusUsage(byId('Spanish-3'))).toEqual([]);
    const pureDatEmpty = ALL.filter((b) => b.src === 'dat' && bonusUsage(b).length === 0);
    expect(pureDatEmpty).toHaveLength(59);
    expect(pureDatEmpty.map((b) => b.id)).toContain('Spanish-3');
  });

  it('全站 225 条非团队加成对账：训练费用、真实成本、开局模拟（含 src=dat 反事实）与施工工具零漏报', async () => {
    for (const b of ALL) {
      const idx = b.idx as number;
      expect([b.id, line(b, 'cost').some((l) => l.on === true)]).toEqual([b.id, bonusDiscountCounted(b.civ, idx)]);
      const text = civs.find((c) => c.en === b.civ)!.bon[idx];
      const gatherApplied = gatherModel(4, b.civ).applied.some((a) => a.source === text);
      expect([b.id, line(b, 'gather').some((l) => l.on === true)]).toEqual([b.id, gatherApplied]);
    }
    // 全部含正 tech 且命中 eco.civEco 的 src=dat 条目做开局模拟反事实核对
    const datWithEcoTechs = ALL.filter((b) => {
      if (b.src !== 'dat' || !simSupport(b.civ)) return false;
      const ts = techsOf(b);
      if (!ts.length) return false;
      return (E.civEco[b.civ] ?? []).some((r) => r.source !== 'team' && ts.includes((r as { tech?: number }).tech ?? NaN));
    });
    expect(datWithEcoTechs.length).toBeGreaterThanOrEqual(6);
    for (const b of datWithEcoTechs) {
      const changed = firstChanged(b) !== null;
      const simOn = line(b, 'sim')[0]?.on === true;
      if (changed) expect(simOn, `${b.id} 改变开局结果却未标 sim:true`).toBe(true);
    }
    // 西班牙施工工具真实计算验证（cc.tree 建造者速率 +30%）
    const ctx = { core, trees: await loadTrees() };
    const cfg = { ...DEFAULT_CONSTRUCTION, techs: [] };
    const spa = calculateConstruction(ctx, { ...cfg, civ: 'Spanish' });
    const base = calculateConstruction(ctx, { ...cfg, civ: 'Britons' });
    expect(spa.errors).toEqual([]);
    expect(spa.applied).toContain('文明固定科技树效果');
    expect(spa.builderRate! / base.builderRate!).toBeCloseTo(1.3, 6);
  }, 60_000);

  it('分包隔离守卫：effects.ts 静态闭包及 civBonus.ts / CivDetail.tsx 直接导入均不引入 core.ts、units.json 或 buildings.json', () => {
    const effectsClosure = staticClosure(['src/domain/effects.ts']);
    expect(effectsClosure.has('src/data/core.ts')).toBe(false);
    expect(effectsClosure.has('data/game/units.json')).toBe(false);
    expect(effectsClosure.has('data/game/buildings.json')).toBe(false);
    for (const file of ['src/domain/civBonus.ts', 'src/features/civs/components/CivDetail.tsx']) {
      const directStatic = parseImports(resolve(file))
        .filter((e: { to: string | null; dynamic: boolean; typeOnly: boolean }) => e.to && !e.dynamic && !e.typeOnly)
        .map((e: { to: string }) => e.to);
      expect(directStatic, file).not.toContain('src/data/core.ts');
      expect(directStatic, file).not.toContain('data/game/units.json');
      expect(directStatic, file).not.toContain('data/game/buildings.json');
    }
  });

  it('BonusBody 双端 SSR：零拥有提示、Huns-0 排布与词条说明、.busage 底部附注三态分流', () => {
    const render = (id: string, variant: 'default' | 'evidence' = 'default') =>
      renderToStaticMarkup(
        createElement(StaticRouter, { location: `/civ/${id.split('-')[0]}` }, createElement(BonusBodyContent, { b: byId(id), core, variant })),
      );

    const it3Def = render('Italians-3', 'default');
    expect(it3Def).not.toContain('见上方作用对象');
    expect(it3Def).not.toContain('数值来自游戏数据');
    expect(it3Def).toContain('属性命令 <span class="num nw">1 条</span>（仅指向本文明不可用对象，未计入战斗属性）');
    expect(it3Def).toContain('单位模拟器属性面板不计算经济/费用类效果，结构化数值见下方「游戏数据原始效果」。');
    const it3Ev = render('Italians-3', 'evidence');
    expect(it3Ev).toContain('data-t="bonus-raw-unowned-note"');
    expect(it3Ev).toContain('以下属性命令仅指向本文明不可用对象，未计入战斗属性；原始记录保留供核查。');
    expect(it3Ev).toContain('展开原始记录（<span class="num nw">1 条</span>）');

    const hu0Def = render('Huns-0', 'default');
    expect(hu0Def).toContain('<h4>作用对象</h4>');
    expect(hu0Def).not.toContain('匈奴 拥有的');
    expect(hu0Def).toContain('根据说明文字推断，仅列出说明中提及的词条（含本文明不可建造或训练的对象），非结构化作用名单。');
    expect(hu0Def.indexOf('根据说明文字推断')).toBeLessThan(hu0Def.indexOf('<details class="datfx">'));
    expect(hu0Def).not.toContain('见上方作用对象');
    expect(hu0Def).toContain('属性命令 <span class="num nw">2 条</span>（仅指向本文明不可用对象，未计入战斗属性）');
    const hu0Ev = render('Huns-0', 'evidence');
    expect(hu0Ev).toContain('data-t="bonus-raw-unowned-note"');
    expect(hu0Ev).toContain('含本文明不可建造或训练的对象');

    // Khitans-0 同样命中含本文明不可建造对象（农田）
    expect(render('Khitans-0', 'default')).toContain('含本文明不可建造或训练的对象');

    // .busage 底部附注三态分流
    expect(render('Aztecs-2', 'default')).toContain(
      '已编码的单位/建筑属性计入模拟器；经济/费用类效果不进模拟器属性面板，结构化数值见下方「游戏数据原始效果」。',
    );
    expect(render('Berbers-0', 'default')).toContain('已编码的单位/建筑属性计入模拟器；以上列出其他工具的计入情况，各工具沿用各自的计算口径。');
    expect(render('Berbers-0', 'evidence')).toContain('已编码的单位/建筑属性计入模拟器；以上列出其他工具的计入情况，各工具沿用各自的计算口径。');
    expect(render('Spanish-0', 'default')).toContain('已编码的单位/建筑属性计入模拟器；以上列出其他工具的计入情况，各工具沿用各自的计算口径。');
    expect(render('Sicilians-4', 'default')).toContain('普通开局已有首座城镇中心，施工加成从起点计入');
    expect(render('Mayans-1', 'default')).toContain('开局按连续采集估算，资源储量和耗尽未模拟');
  });
});
