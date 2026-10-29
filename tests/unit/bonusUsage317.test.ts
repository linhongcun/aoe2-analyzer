// issue 317：经济/费用类文明加成（src = 'eco'）的「是否计入」标签必须与各工具的实际计算一致。
// 判定不靠标签自身：开局模拟用「去掉该加成的 civEco 行后重跑」看结果是否变化，真实成本 / 训练费用直接调用工具函数。
// 开局模拟全量重跑约 60 次 × 8 个开局方案，太慢（CI 上 60 s 以上），结果存成快照 fixtures/bonusUsage317-sim.json：
// 快照带输入指纹（整个 eco.json 数据对象、开局方案、升级数据、buildSim.ts 及拆分的文明规则/覆盖/效果/机制/附注模块、roundHalfPrice.ts / buildOrder.ts 源码），任一变化本测试即失败，提示重新生成：
//   UPDATE_BONUS317=1 npx vitest run tests/unit/bonusUsage317.test.ts
// 平时只抽两条（条顿第 1 条、阿兹特克第 1 条）在记录的开局方案上现场重跑，确认快照与真实计算一致。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs, loadCore, type Core } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses, type CivBonusEnt } from '../../src/domain/civBonus';
import { bonusTechs, bonusUsage, showEcoSourceTag, usageLevel } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { gatherModel } from '../../src/domain/realCost';
import { discountedCost } from '../../src/domain/costDiscount';
import { DAT } from '../../src/domain/datEffects';
import { calculateConstruction, DEFAULT_CONSTRUCTION } from '../../src/domain/construction';
import { loadTrees } from '../../src/data';

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
const SNAP_URL = new URL('./fixtures/bonusUsage317-sim.json', import.meta.url);
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
      'buildSimEffects.ts',
      'buildSimMechanisms.ts',
      'buildSimNotes.ts',
      'roundHalfPrice.ts',
      'buildOrder.ts',
      'weiEconomy.ts',
      'bengaliEconomy.ts',
      'armenianEconomy.ts',
      'georgianEconomy.ts',
      'slavicEconomy.ts',
      'khmerEconomy.ts',
      'jurchenEconomy.ts',
      'khmerSource.ts',
      'khmerPrerequisiteSource.ts',
    ].map((f) => readFileSync(fileURLToPath(new URL(`../../src/domain/${f}`, import.meta.url)), 'utf8')),
    ...['construction.json', 'construction.ts'].map((f) => readFileSync(fileURLToPath(new URL(`../../src/data/${f}`, import.meta.url)), 'utf8')),
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
  'Khmer-1': '免回仓与独立农田供给已计入；默认近距离2格时，完整654与整行移除均被同一0.4/秒供给上限限制，原对照只观察步骤完成时间/库存，未触发差异；khmer197.test.ts另以7格与低工作率库存窗口核对免回仓和供给瓶颈',
  'Berbers-1': '马厩单位城堡/帝王时代折扣：现有开局方案不在城堡时代训练马厩单位',
  'Bulgarians-2': '城镇中心石料 -50%：现有开局方案不建新城镇中心',
  'Incas-1': '建筑石料 -15%：现有开局方案不建花石料的建筑',
  'Muisca-4': '篷车、行会免费：现有开局方案不研究这两项科技',
  'Shu-1': '弓兵科技折扣已实际付费；现有3个相关方案均在末步研究199，原结果只记录步骤开始库存和完成时间，付费后无新检查点；shu197.test.ts另以检查点严格核对扣款',
  'Mayans-2':
    '现有8套开局不在城堡或帝王时代训练弓手；53/56的正tech折扣没有触发，树中的封建折扣不被正tech移除对照覆盖；mayans197.test.ts另以三个时代的真实训练支付严格核对',
  'Armenians-3': '当前8套开局不建强化教堂，不触发两段圣物生成；移除949/957保留独立骡车来源和研究加成',
  'Armenians-4': '海军战斗加成不改变当前8套的渔船经济；当前方案不训练或交战对应军事舰船',
  'Georgians-0': '起始免费骡车已计入完成实体和一种时代前置；当前8套原营地仍逐次付费，原库存/时钟投影未被起始车改变；georgians197.test.ts另以at0实体、起始研究地点和时代前置严格核对',
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
      ['sim', false],
      ['gather', true],
      ['construction', true],
      ['repair', false],
    ]);
    expect(usageLevel(bonusUsage(b))).toBe('part');
    // 开局模拟：罗马整页按通用文明计算（tech 887 含未核实的农田单位效果）
    expect(simSupport('Romans')).toBe(false);
    expect(line(b, 'sim')[0]!.note).toContain('按通用文明计算');
    // 真实成本：村民采集 ×1.05 已计入
    const g = gatherModel(4, 'Romans');
    expect(g.applied.map((a) => [a.label, a.techs])).toContainEqual(['村民采集速度 +5%', [887]]);
    expect(g.rate.wood).toBeGreaterThan(gatherModel(4, '').rate.wood);
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
  it('覆盖面：112 条 src = eco、37 条 src = text（非团队）', () => {
    expect(ECO.filter((b) => b.src === 'eco')).toHaveLength(112);
    expect(ECO.filter((b) => b.src === 'text')).toHaveLength(37);
  });
  it('src = text 中实际被工具计入的五条：亚美尼亚经济研究、凯尔特伐木、高棉免建筑前置、朝鲜采石、突厥采金', () => {
    const counted = ECO.filter((b) => b.src === 'text' && bonusUsage(b).some((l) => l.on === true)).map((b) => b.id);
    expect(counted).toEqual(['Armenians-1', 'Celts-0', 'Khmer-0', 'Koreans-0', 'Turks-0']);
    expect(line(bon('Armenians-1'), 'sim')[0]).toMatchObject({ on: true, note: '伐木、采矿科技增强仅在对应研究完成后计入' });
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
      const entries = (DAT.costDiscounts[b.civ] ?? []).filter((d) => d.idx === b.idx);
      const hit = entries.some((d) =>
        d.groups.some((g) => g.units.some((id) => core.unitById[id] && discountedCost(core.unitById[id]!, b.civ, 4).applied.some((a) => a.idx === b.idx))),
      );
      expect([b.id, line(b, 'cost').some((l) => l.on)]).toEqual([b.id, hit]);
    }
  });
  it('来源标签（eco「.dat 经济/费用效果（文本展示）」、text「无 .dat 数据」）：有工具计入的不显示，没有工具计入的仍显示（Steve 设计审查）', () => {
    expect(showEcoSourceTag(bon('Romans-0'))).toBe(false);
    expect(showEcoSourceTag(bon('Romans-2'))).toBe(false);
    expect(showEcoSourceTag(bon('Chinese-0'))).toBe(true);
    let hidden = 0;
    for (const b of ECO.filter((x) => x.src === 'eco')) {
      const counted = bonusUsage(b).some((l) => l.on === true);
      expect([b.id, showEcoSourceTag(b)]).toEqual([b.id, !counted]);
      if (counted) hidden++;
    }
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(112);
    // src = text 同样规则：五条被工具计入，不显示；其余 32 条没有工具计入，仍显示
    const text = ECO.filter((x) => x.src === 'text');
    for (const b of text) expect([b.id, showEcoSourceTag(b)]).toEqual([b.id, !['Armenians-1', 'Celts-0', 'Khmer-0', 'Koreans-0', 'Turks-0'].includes(b.id)]);
    expect(text.filter((b) => showEcoSourceTag(b))).toHaveLength(32);
  });
  it('没有任何工具计入的加成保持「仅文本」', () => {
    for (const b of ECO) if (!bonusUsage(b).some((l) => l.on)) expect([b.id, usageLevel(bonusUsage(b))]).toEqual([b.id, 'none']);
  });
});
