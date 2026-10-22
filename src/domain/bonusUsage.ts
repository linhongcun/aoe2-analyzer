/**
 * issue 317：经济/费用类文明加成（src = 'eco'）在各工具里是否真的被计入。
 * 不另立规则，只读各工具自己的判定，保证标签与计算一致：
 * - 开局模拟：simSupport（不支持的文明整页按通用文明计算）+ buildSim 的 techAtomicOk / classifyCivEffect（按 .dat tech 号对应 civEco 行）；
 * - 真实成本 · 采集速度：realCost 的 SOURCED 表（gatherBonusIdx）；
 * - 训练费用（单位 PK「等资源」、单位详情的真实成本）：costDiscount 读的 DAT.costDiscounts（按加成序号，ok = false 时显示「折扣未计入」）；
 *   只看作用于单位的条目，建筑费用折扣不在这两个工具里；
 * - 施工工具：construction.json 里该文明独有的自动规则（按 tech 号；只有改建造者工作速率 / 施工工期的命令才会被施工工具使用）；
 * - 修理：没有任何工具计算修理。
 * 团队加成（issue 331，只给 src = 'eco' 的 22 条）：同样只读各工具自己的判定，并写明计入的是本文明自己的团队加成还是队友给的：
 * - 开局模拟：buildSim 的 team 参数默认 false，页面也不开启，本文明的与队友给的团队加成都不计；
 * - 真实成本：gatherModel 跳过 source = 'team' 的行（只在这条加成有采集相关效果时列出）；
 * - 施工工具：只套用本文明 construction.json 的 team 命令，且只认改建造者工作速率 / 施工工期的命令（与 construction.ts 的 apply 同口径），不计队友；
 * - 圣物收益：relic_income.json 里 scope = 'team' 的修正，本方或任一队友是该文明即计入；
 * - 训练费用：DAT.costDiscounts 没有团队条目，不列。
 * 科技树汇总效果（.dat tech 号 < 0）无法与开局模拟的 civEco 行逐条对应，记为「未逐条核对」，不下结论。
 */
import ecoRaw from '../data/raw/eco';
import constructionRaw from '../data/construction.json';
import unitsRaw from '../data/raw/units';
import { buildOrders } from '../data/buildOrders';
import { classifyCivEffect, simScope, techAtomicOk, type EcoData } from './buildSim';
import type { CivBonusEnt } from './civBonus';
import { DAT } from './datEffects';
import { gatherBonusIdx, gatherModel, touchesGather } from './realCost';
import relicRaw from '../data/relic_income.json';
import { simSupport } from './simSupport';

const eco = ecoRaw as unknown as EcoData;
/** PK 与真实成本只给单位算折后价（建筑费用折扣不在这两个工具里） */
const UNIT_IDS = new Set((unitsRaw as unknown as { id: number }[]).map((u) => u.id));
type Cmd = { C: number; A: number; B: number };
const construction = constructionRaw as unknown as {
  civs: Record<string, { automatic: { id: number; commands: Cmd[] }[]; team: Cmd[]; units: Record<string, { class: number }> }>;
};
const relicMods = Object.values((relicRaw as unknown as { modifiers: Record<string, { civ: string; scope: string }> }).modifiers);

export type UsageTool = 'sim' | 'gather' | 'cost' | 'construction' | 'relic' | 'repair';
export interface BonusUsageLine {
  tool: UsageTool;
  /** 工具名（中文） */
  name: string;
  /** true 已计入 / false 未计入 / null 未逐条核对 */
  on: boolean | null;
  note: string;
}
export const USAGE_TOOL_ZH: Record<UsageTool, string> = {
  sim: '开局模拟',
  gather: '真实成本',
  cost: '训练费用',
  construction: '施工工具',
  relic: '圣物收益',
  repair: '修理',
};

let scopeCache: ReturnType<typeof simScope> | null = null;
const scope = () => (scopeCache ??= simScope(eco, buildOrders));
let commonCache: Set<number> | null = null;
/** 每个文明都有的自动规则（如资源持续时间）不是文明加成 */
const commonRules = () => {
  if (commonCache) return commonCache;
  const all = Object.values(construction.civs).map((c) => new Set(c.automatic.map((r) => r.id)));
  return (commonCache = new Set([...all[0]!].filter((id) => all.every((s) => s.has(id)))));
};

const gatherCache = new Map<string, ReturnType<typeof gatherModel>['applied']>();
/** 真实成本采集模型里引用了这条加成的行（帝王时代，含全部时代的文明加成） */
const gatherLines = (b: CivBonusEnt) => {
  let a = gatherCache.get(b.civ);
  if (!a) gatherCache.set(b.civ, (a = gatherModel(4, b.civ).applied));
  return typeof b.idx === 'number' && gatherBonusIdx(b.civ).includes(b.idx) ? a.filter((l) => l.source === b.zh) : [];
};
/**
 * 与 civEco 行对应的 .dat tech 号：加成自带的 .dat 条目（正 tech 号）+ 真实成本采集模型为这条加成引用的 civEco tech。
 * 没有可对应的 tech（科技树汇总效果，或采集行来自科技树汇总行）时 treeOnly = true。
 */
export function bonusTechs(b: CivBonusEnt): { techs: number[]; treeOnly: boolean } {
  const dat = b.dat.map((d) => d.tech).filter((t) => t > 0);
  const g = gatherLines(b);
  const techs = [...new Set([...dat, ...g.flatMap((l) => l.techs)])];
  return { techs, treeOnly: techs.length === 0 && (b.dat.length > 0 || g.length > 0) };
}

function simLine(b: CivBonusEnt): BonusUsageLine | null {
  const name = USAGE_TOOL_ZH.sim;
  const { techs, treeOnly } = bonusTechs(b);
  const rows = (eco.civEco[b.civ] ?? []).filter((r) => {
    const t = (r as { tech?: number }).tech;
    return r.source !== 'team' && t !== undefined && techs.includes(t);
  });
  const kinds = rows.map((r) => ({ r, ks: r.effects.map((e) => classifyCivEffect(e, r as { source?: string; tech?: number }, scope()).kind) }));
  const relevant = kinds.some(({ ks }) => ks.some((k) => k !== 'irrelevant'));
  if (!simSupport(b.civ)) return relevant || treeOnly ? { tool: 'sim', name, on: false, note: '暂不支持该文明，整页按通用文明计算，本条未计入' } : null;
  if (rows.some((r) => techAtomicOk(r, scope())) && kinds.some(({ r, ks }) => techAtomicOk(r, scope()) && ks.includes('handled')))
    return { tool: 'sim', name, on: true, note: '已计入' };
  if (relevant) return { tool: 'sim', name, on: false, note: '本条效果待核实，未计入' };
  if (treeOnly) return { tool: 'sim', name, on: null, note: '本条属于科技树汇总效果，未逐条核对是否计入' };
  return null;
}

/**
 * 经济/费用类加成（src = 'eco'）的分工具计入情况；
 * 团队加成只给 src = 'eco' 的（issue 331），见 teamUsageLines；
 * src = 'text'（没有关联 .dat 条目）的加成只有被某个工具实际计入时才给出（Steve 2026-10-21：凯尔特伐木、朝鲜采石、突厥采金）；
 * 其余加成返回空数组。
 */
export function bonusUsage(b: CivBonusEnt): BonusUsageLine[] {
  if (b.team) return b.src === 'eco' ? teamUsageLines(b) : [];
  if (typeof b.idx !== 'number') return [];
  const nb = b as CivBonusEnt & { idx: number };
  if (b.src === 'text') {
    const lines = usageLines(nb);
    return lines.some((l) => l.on === true) ? lines : [];
  }
  return b.src === 'eco' ? usageLines(nb) : [];
}

function usageLines(b: CivBonusEnt & { idx: number }): BonusUsageLine[] {
  const idx = b.idx;
  const out: BonusUsageLine[] = [];
  const sim = simLine(b);
  if (sim) out.push(sim);
  const g = gatherLines(b);
  if (g.length) out.push({ tool: 'gather', name: USAGE_TOOL_ZH.gather, on: true, note: `采集速度已计入（${g.map((l) => l.label).join('、')}）` });
  for (const d of (DAT.costDiscounts?.[b.civ] ?? []).filter((x) => x.idx === idx && x.groups.some((g) => g.units.some((id) => UNIT_IDS.has(id)))))
    out.push(
      d.ok
        ? { tool: 'cost', name: USAGE_TOOL_ZH.cost, on: true, note: '单位 PK「等资源」与单位详情的真实成本按折后价计算' }
        : { tool: 'cost', name: USAGE_TOOL_ZH.cost, on: false, note: '.dat 数值与说明对不上，显示「折扣未计入」，按原价' },
    );
  const techs = new Set(bonusTechs(b).techs);
  const cc = construction.civs[b.civ];
  const rules = (cc?.automatic ?? []).filter((r) => techs.has(r.id) && !commonRules().has(r.id));
  // 与 construction.ts 的 matches 同口径：命令指向普通村民 118，或 A = -1 且类别与 118 相同
  const builder = (c: Cmd) => c.A === 118 || (c.A === -1 && c.B === cc?.units[118]?.class);
  if (rules.some((r) => r.commands.some((c) => c.C === 13 && builder(c))))
    out.push({ tool: 'construction', name: USAGE_TOOL_ZH.construction, on: true, note: '建造者工作速率已计入' });
  else if (rules.some((r) => r.commands.some((c) => c.C === 101)))
    out.push({ tool: 'construction', name: USAGE_TOOL_ZH.construction, on: true, note: '施工工期已计入' });
  if (/repair/i.test(b.en)) out.push({ tool: 'repair', name: USAGE_TOOL_ZH.repair, on: false, note: '没有工具计算修理，未计入' });
  return out;
}

/** issue 331：团队加成（src = 'eco'）的分工具计入情况，每行写明本文明自己的 / 队友给的 */
function teamUsageLines(b: CivBonusEnt): BonusUsageLine[] {
  const out: BonusUsageLine[] = [];
  out.push({
    tool: 'sim',
    name: USAGE_TOOL_ZH.sim,
    on: false,
    note: simSupport(b.civ)
      ? '开局模拟不计团队加成，本文明自己的和队友给的都未计入'
      : '暂不支持该文明，整页按通用文明计算；开局模拟也不计团队加成，本文明自己的和队友给的都未计入',
  });
  const rows = (eco.civEco[b.civ] ?? []).filter((r) => r.source === 'team');
  if (rows.some((r) => touchesGather(r.effects as Parameters<typeof touchesGather>[0])))
    out.push({ tool: 'gather', name: USAGE_TOOL_ZH.gather, on: false, note: '采集模型跳过团队加成，本文明自己的和队友给的都未计入' });
  const cc = construction.civs[b.civ];
  if (cc && cc.team.length > 0) {
    // 与 construction.ts 的 apply 同口径：team 命令只有改施工工期（C = 101）或改普通村民 118 工作速率（C = 13）时才被使用
    const builder = (c: Cmd) => c.A === 118 || (c.A === -1 && c.B === cc.units[118]?.class);
    const used = cc.team.some((c) => c.C === 101 || (c.C === 13 && builder(c)));
    out.push({
      tool: 'construction',
      name: USAGE_TOOL_ZH.construction,
      on: used,
      note: used
        ? '本文明自己的团队加成已计入；不计队友给的团队加成'
        : '施工工具会套用本文明自己的团队加成，但这条改的是建筑的工作速率，不影响建造者速率和施工工期，未计入；也不计队友给的团队加成',
    });
  }
  if (relicMods.some((m) => m.scope === 'team' && m.civ === b.civ))
    out.push({ tool: 'relic', name: USAGE_TOOL_ZH.relic, on: true, note: '已计入：本方是该文明或任一队友是该文明时都生效（同一加成不叠加）' });
  if (/repair/i.test(b.en)) out.push({ tool: 'repair', name: USAGE_TOOL_ZH.repair, on: false, note: '没有工具计算修理，本文明自己的和队友给的都未计入' });
  return out;
}

/** 标签：'all' 有计入且无未计入；'part' 有计入也有未计入/未核对；'none' 没有任何工具计入 */
export function usageLevel(lines: BonusUsageLine[]): 'all' | 'part' | 'none' {
  const on = lines.some((l) => l.on === true);
  if (!on) return 'none';
  return lines.every((l) => l.on === true) ? 'all' : 'part';
}

/** Steve 设计审查（PR 330）：有工具计入的加成不再显示来源标签（src = 'eco' 的绿色「.dat 经济/费用效果（文本展示）」、src = 'text' 的橙色「无 .dat 数据」）；没有工具计入的保持原样 */
export const showEcoSourceTag = (b: CivBonusEnt) => !((b.src === 'eco' || b.src === 'text') && !b.encoded && usageLevel(bonusUsage(b)) !== 'none');
