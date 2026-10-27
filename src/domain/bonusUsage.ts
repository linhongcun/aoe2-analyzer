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
 * 科技树汇总效果（.dat tech 号 < 0，issue 332）：按 aoe2techtree@3bb43b1 文明加成英文原文把每条对应到 eco.json 的 tree 行效果，
 * 结论 = 去掉这些效果后全部开局方案重跑是否变化（见 TREE_SIM / tests/unit/v0300-332.test.ts）；核对不了的写「无法核实」再写具体原因。
 */
import ecoRaw from '../data/raw/eco';
import { CONSTRUCTION_DATA as construction } from '../data/construction';
import unitsRaw from '../data/raw/units';
import { buildOrders } from '../data/buildOrders';
import { classifyCivEffect, simScope, simSupport as currentSimSupport, techAtomicOk, type EcoData } from './buildSim';
import type { CivBonusEnt } from './civBonus';
import { DAT } from './datEffects';
import { gatherBonusIdx, gatherModel, touchesGather } from './realCost';
import relicRaw from '../data/relic_income.json';
import { simSupport } from './simSupport';
import { WEI_SPAWN_NOTE } from './weiEconomy';

const eco = ecoRaw as unknown as EcoData;
/** PK 与真实成本只给单位算折后价（建筑费用折扣不在这两个工具里） */
const UNIT_IDS = new Set((unitsRaw as unknown as { id: number }[]).map((u) => u.id));
type Cmd = { C: number; A: number; B: number };
const relicMods = Object.values((relicRaw as unknown as { modifiers: Record<string, { civ: string; scope: string }> }).modifiers);

export type UsageTool = 'sim' | 'gather' | 'cost' | 'construction' | 'relic' | 'repair';
export interface BonusUsageLine {
  tool: UsageTool;
  /** 工具名（中文） */
  name: string;
  /** true 已计入 / false 未计入 / null 未逐条核对 */
  on: boolean | null;
  note: string;
  /** 工具页路由（issue 331，Steve：圣物收益一行链到工具） */
  href?: string;
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

/**
 * issue 332：开局模拟里原先「未逐条核对」的 15 条科技树汇总加成的结论。
 * 键 = CivBonusEnt.id；en = aoe2techtree@3bb43b1 文明加成英文原文（与 b.en 一致，文案变了要重新认定）。
 * on = 去掉 eco.json 该文明 source = 'tree' 行里属于本条的效果后，全部开局方案重跑是否变化；
 * on = null 表示 tree 行里没有可去掉的对应效果，note 必须以「无法核实」开头再写具体原因。
 * note 是界面文字：用玩家能懂的话，科技名与站内中文名一致，不写 eco.json、tree 行、科技树汇总等内部说法（Steve 2026-10-22 定稿）。
 */
const TREE_SIM: Record<string, { en: string; on: boolean | null; note: string }> = {
  'Aztecs-1': { en: 'Villagers carry +3', on: true, note: '已计入' },
  'Bohemians-0': { en: 'Mining Camp technologies free', on: true, note: '已计入' },
  'Burgundians-2': { en: 'Cavalier upgrade available in Castle Age', on: false, note: '未计入：现有开局方案不升级骑士' },
  'Byzantines-2': { en: 'Town Watch, Town Patrol free', on: false, note: '未计入：城镇瞭望 / 城镇巡逻是视野科技，开局方案不研究也不受益' },
  'Franks-1': { en: 'Mill technologies free', on: true, note: '已计入' },
  'Italians-0': { en: 'Advancing to the next Age costs -15%', on: true, note: '已计入' },
  'Italians-2': { en: 'Dock and University technologies cost -25%', on: false, note: '未计入：码头与大学科技费用折扣，现有开局方案不研究这些科技' },
  'Italians-4': { en: 'Fishing Ships cost -15%', on: true, note: '已计入' },
  'Koreans-0': { en: 'Stone miners work +20% faster', on: false, note: '未计入：现有开局方案不采石' },
  'Magyars-2': { en: 'Melee attack upgrades free', on: false, note: '未计入：近战攻击升级是战斗科技，不影响开局时间与库存' },
  'Malay-1': { en: 'Infantry armor upgrades free', on: false, note: '未计入：步兵护甲升级是战斗科技，不影响开局时间与库存' },
  'Teutons-4': { en: 'Murder Holes, Herbal Medicine free', on: false, note: '未计入：近射孔 / 草药不影响开局方案的资源与时间' },
  'Turks-2': { en: 'Chemistry free; Gunpowder technologies costs -50%', on: false, note: '未计入：化学与火药科技费用，现有开局方案不涉及' },
  'Vietnamese-3': { en: 'Conscription free', on: false, note: '未计入：征招是军事单位训练加速，现有开局方案不研究征招' },
  'Vikings-0': { en: 'Wheelbarrow, Hand Cart free', on: true, note: '已计入' },
};

function simLine(b: CivBonusEnt): BonusUsageLine | null {
  const name = USAGE_TOOL_ZH.sim;
  if (b.id === 'Sicilians-1') return { tool: 'sim', name, on: false, note: '未计入：农田升级额外储量、耗尽和续种未模拟，也未估算节省的木材' };
  const { techs, treeOnly } = bonusTechs(b);
  const currentScope = ['Sicilians', 'Wei'].includes(b.civ) ? simScope(eco, buildOrders, b.civ) : scope();
  const rows = (eco.civEco[b.civ] ?? []).filter((r) => {
    const t = (r as { tech?: number }).tech;
    return r.source !== 'team' && t !== undefined && techs.includes(t);
  });
  const kinds = rows.map((r) => ({ r, ks: r.effects.map((e) => classifyCivEffect(e, r as { source?: string; tech?: number }, currentScope).kind) }));
  const relevant = kinds.some(({ ks }) => ks.some((k) => k !== 'irrelevant'));
  if (!simSupport(b.civ)) return relevant || treeOnly ? { tool: 'sim', name, on: false, note: '暂不支持该文明，整页按通用文明计算，本条未计入' } : null;
  if (rows.some((r) => techAtomicOk(r, currentScope)) && kinds.some(({ r, ks }) => techAtomicOk(r, currentScope) && ks.includes('handled')))
    return {
      tool: 'sim',
      name,
      on: true,
      note:
        b.id === 'Wei-0'
          ? WEI_SPAWN_NOTE
          : b.civ === 'Tatars' && b.idx === 0 && techs.includes(704)
            ? '已计入牧羊产量与工作率配对；羊总量和耗尽未模拟'
            : b.id === 'Sicilians-4'
              ? '已计入城镇中心、城堡和防御工事的实际施工工期'
              : '已计入',
    };
  if (relevant) return { tool: 'sim', name, on: false, note: '本条效果待核实，未计入' };
  if (treeOnly) {
    const t = TREE_SIM[b.id];
    if (t) {
      // 文案漂移时仍给出结论，由 v0300-332 的 en 对照把关
      return { tool: 'sim', name, on: t.on, note: t.note };
    }
    return { tool: 'sim', name, on: null, note: '本条属于科技树汇总效果，未逐条核对是否计入' };
  }
  return null;
}

/**
 * 经济/费用类加成（src = 'eco'）的分工具计入情况；
 * 团队加成只给 src = 'eco' 的（issue 331），见 teamUsageLines；
 * src = 'text'（没有关联 .dat 条目）的加成只有被某个工具实际计入时才给出（Steve 2026-10-21：凯尔特伐木、朝鲜采石、突厥采金）；
 * 其余加成返回空数组。
 */
export function bonusUsage(b: CivBonusEnt): BonusUsageLine[] {
  if (b.id === 'Wei-0')
    return [
      ...usageLines(b as CivBonusEnt & { idx: number }),
      {
        tool: 'gather',
        name: USAGE_TOOL_ZH.gather,
        on: false,
        note: '赠送村民未计入真实成本；单个村民的采集速度不变',
      },
    ];
  if (b.id === 'Sicilians-4') return usageLines(b as CivBonusEnt & { idx: number });
  if (b.id === 'Mayans-1') {
    const tree = eco.civEco.Mayans?.find((row) => row.source === 'tree');
    const on = currentSimSupport(eco, b.civ, buildOrders).supported && !!tree && techAtomicOk(tree, scope());
    return [
      {
        tool: 'sim',
        name: USAGE_TOOL_ZH.sim,
        on,
        note: on ? '已计入资源产量与工作率配对；储量和耗尽未模拟' : '暂不支持该文明，整页按通用文明计算，本条未计入',
      },
    ];
  }
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
    out.push({
      tool: 'relic',
      name: USAGE_TOOL_ZH.relic,
      on: true,
      note: '已计入：本方是该文明或任一队友是该文明时都生效（同一加成不叠加）',
      href: '/relic-income',
    });
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
