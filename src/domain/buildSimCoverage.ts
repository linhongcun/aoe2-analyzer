import { polishContext, polishRowClass, hasPolishMarker, POLISH_SOURCE_REASON } from './polishEconomy';
import { romanContext, romanRowClass, hasRomanMarker, ROMAN_SOURCE_REASON } from './romanEconomy';
import {
  gurjaraContext,
  gurjaraRowClass,
  hasGurjaraMarker,
  gurjaraOrdersSupported,
  GURJARA_SOURCE_REASON,
  GURJARA_ACTION_REASON,
  type GurjaraRawTech,
} from './gurjaraEconomy';
import { mapucheContext, mapucheRowClass, hasMapucheMarker, MAPUCHE_SOURCE_REASON, type MapucheRawTech } from './mapucheEconomy';
import { chineseContext, chineseRowClass, hasChineseMarker, CHINESE_SOURCE_REASON, type ChineseRawTech } from './chineseEconomy';
import { civMechanism, mechanismContext } from './buildSimMechanisms';
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow } from './buildSim';
import { TC_UNITS, TECH_OPS, RES_START, COST_ATTR, RES_STOCK, TECH_RES, RES_DEPOSIT, RES_HUNT_FOOD } from './buildSimEffects';
import {
  RES_FORAGER_WOOD,
  RES_LUMBER_FOOD,
  hasLumberFoodContext,
  RES_GOLD_PRODUCTIVITY,
  hasMalianGoldContext,
  RES_WILD_FOOD_GOLD,
  hasVarangianGoldContext,
  RES_SHEPHERD_PRODUCTIVITY,
  hasTatarShepherdContext,
  MAYAN_RESOURCE_TASKS,
  hasMayanTreeContext,
  hasUniqueMayanTree,
  SICILIAN_FARM_NOTE,
  SICILIAN_FORT_CLASSES,
  SICILIAN_GROUPS,
  sicilianGroupOk,
  sicilianRowAllowed,
  MALIAN_BUILDING_CLASSES,
  hasMalianBuildingContext,
} from './buildSimCivRules';
const TC = 109;
const HOUSE = 70;
import { isWeiRewardRow, weiRewardFamily, WEI_CONTEXT_REASON } from './weiEconomy';
import { isBengaliRewardRow, bengaliRewardFamily, BENGALI_CONTEXT_REASON } from './bengaliEconomy';
import { armenianContext, armenianResearchSites, armenianRowClass, type ArmenianRawTech } from './armenianEconomy';
import { georgianContext, georgianHasChurch, georgianResearchSites, georgianRowClass, GEORGIAN_CHURCH_REASON, type GeorgianRawTech } from './georgianEconomy';

import { slavicContext, slavicRowClass, SLAVIC_SOURCE_REASON, type SlavicRawTree, type SlavicRawTech } from './slavicEconomy';

import { khmerContext, khmerRowClass, khmerHasMarker, KHMER_SOURCE_REASON, type KhmerRawTech, type KhmerRawTree, type KhmerRawTeam } from './khmerEconomy';

import { jurchenContext, jurchenRowClass, hasJurchenMarker, JURCHEN_SOURCE_REASON, type JurchenRawTech } from './jurchenEconomy';

// ───────── 文明加成覆盖（#42）：每条效果必须是 已处理 / 不影响开局（带原因）/ 影响开局但未实现 之一 ─────────

type Effect = EffectRow['effects'][number];
export type EffectClass = { kind: 'handled' } | { kind: 'irrelevant'; reason: string } | { kind: 'unhandled'; reason: string } | { kind: 'unknown' };

/** res 属性：不影响开局（模型层面）的，写明原因 */
export const IRRELEVANT_RES: Record<number, string> = {
  32: '帝王时代人口 +10（哥特），开局只到城堡',
  33: '文明加成标记值，不影响经济（高棉的 50 = 农民无需回仓，已处理）',
  78: '市场交易手续费（萨拉森），开局不交易',
  86: '团队加成，默认不计团队',
  88: '马来非经济属性',
  89: '团队加成（拜占庭僧侣）',
  90: '僧侣转化抗性（条顿）',
  97: '羊不会被敌方转走（凯尔特），单人模拟无关',
  178: '团队加成（条顿）',
  179: '团队加成（条顿）',
  191: '团队加成（阿兹特克圣物）',
  204: '马普切非经济属性',
  209: '开局显示敌方位置（越南）',
  210: '团队加成（缅甸圣物）',
  211: '高地伤害加成（鞑靼）',
  212: '高地伤害加成（鞑靼）',
  218: '封建时代可建城镇中心（库曼），开局不多建城镇中心',
  225: '团队加成（勃艮第）',
  251: '团队加成（孟加拉）',
  266: '帝王时代加成（越南）',
  271: '团队加成（格鲁吉亚）',
  272: '格鲁吉亚修理/建筑属性',
  273: '格鲁吉亚修理/建筑属性',
  283: '亚美尼亚特殊机制开关',
  291: '摧毁建筑抢掠资源（丹麦）',
  295: '图皮非经济属性',
  297: '瓦兰吉非经济属性',
  504: '团队加成（西班牙）',
};
/** res 属性：影响开局但本批未实现（对应文明标为不支持） */
export const UNHANDLED_RES: Record<number, string> = {
  69: '农田食物储量（西西里）：#43 不加新机制，有不确定就先置灰',
  292: '动物尸体不腐烂（女真）：#43 不加新机制，有不确定就先置灰',
  // 下列条目和同一文明的采集 workRate 成对出现：玛雅 ×0.87 配资源 ×1.15，鞑靼羊 ×0.637 配 ×1.57，哥特狩猎 ×0.813 配 ×1.23，乘起来约等于 1。
  // 模型已经算了 workRate 的减速，却没算这一半，到封建的时间会偏慢，所以属于影响开局但未实现
  47: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  79: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  189: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  190: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  216: '家畜食物倍率，和牧羊 workRate 成对出现（鞑靼 ×0.637/×1.57），未建模',
  219: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  296: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  215: '采果工存放的食物 +25%（马普切 1381），未建模',
  85: '科技费用折扣是否作用于升级时代待 .dat 核实（汉）',
  234: '开局/升级时代/经济科技送村民（孟加拉、魏等）未建模',
  237: '波兰庄园农田加成未建模',
  238: '波兰庄园农田加成未建模',
  239: '波兰庄园农田加成未建模',
  241: '波兰采石换金未建模',
  254: '古尔贾拉家畜机制未建模',
  267: '采浆果同时产木头（葡萄牙）未建模',
  276: '采金加成（马里）未建模',
  298: '羊/猎物/渔船额外产金（瓦兰吉）未建模',
  502: '伐木同时产食物（蜀）未建模',
};
/**
 * 匈奴 tech 238「C-Bonus, Start w/ Horse」/ 241「C-Bonus, Disable Horse」（res 234 set 1）：
 * 前置分别含 tech 308 / 307，名称表示开局送马/禁用马。307/308 的具体含义（哪种游戏模式）未核实。
 * 送的是马（非村民），不改变村民数和资源，开局模拟不涉及。
 */
export const RES234_IRRELEVANT_TECH: Record<number, string> = {
  238: '匈奴开局送马（tech 238，前置 308，含义未核实），马的食物未计入，不改变村民数与资源',
  241: '匈奴禁用开局马（tech 241，前置 307，含义未核实），马的食物未计入，不改变村民数与资源',
};
/**
 * 加成逻辑已实现、但出处不足，本版仍按不支持处理（UI 置灰）的文明。
 * v0.7.0：匈奴补齐第二条出处 St4rk（2020），已解除（issue 120 Q1）。
 */
export const SOURCE_PENDING_CIVS: Record<string, string> = {};
/** 仅测试构建用：VITE_FORCE_SIM_CIVS=Huns 时跳过出处门槛（e2e 验 flag 打开后的界面）；正式构建不设 */
const FORCED_CIVS = new Set(
  String((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FORCE_SIM_CIVS ?? '')
    .split(',')
    .filter(Boolean),
);
/** 已在 START_VILS 建模送村民的文明 tech（汉 302、玛雅 554） */
const RES234_HANDLED = new Set([302, 554]);
/** 整条待核实的文明 tech → 原因 */
const PENDING_TECH: Record<number, string> = {};
const FARM_UNITS = new Set([50, 1187]);
/** 各时代的城镇中心单位：黑暗 109、封建 71、城堡 141、帝王 142；升时代即换成下一个，村民训练与升时代研究都按当前这一个计工作速度 */

const HANDLED_RES = (res: number, op?: string) => ((RES_START[res] || RES_STOCK[res] || RES_DEPOSIT[res] || res === 4) && op === 'add') || false;
const HANDLED_ATTR = new Set(['workRate', 'carry', 'trainTime', ...Object.keys(COST_ATTR)]);

/** 开局涉及的对象：村民、城镇中心（含升级后形态）、房子、时代升级、经济科技 + 所有开局里出现的单位/建筑/科技 */
export function simScope(eco: EcoData, bos: BuildOrder[], civ?: string) {
  const context = mechanismContext(eco, civ);
  const { armenians, georgians } = context;
  if (armenians?.infrastructure || georgians?.infrastructure || context.mapuche?.infrastructure || context.poles?.infrastructure)
    bos = bos.map((order) => civMechanism(civ).prepare!(order, civ!, eco));
  const units = new Set<number>([83]);
  const buildings = new Set<number>([...TC_UNITS, HOUSE, ...FARM_UNITS]);
  if (georgians?.start) buildings.add(1808);
  const techs = new Set<number>([101, 102, 103, ...Object.keys(eco.ecoTechs).map(Number)]);
  for (const b of bos)
    for (const st of b.steps)
      for (const a of st.actions) {
        if (a.type === 'build') buildings.add(a.building);
        if (a.type === 'train' || a.type === 'upgrade') units.add(a.unit);
        if (a.type === 'research') techs.add(a.tech);
      }
  /** 开局单位 → .dat 类别（类别折扣判定用） */
  const unitClass = new Map([...units].map((u) => [u, eco.units[u]?.class ?? -1] as const));
  // TC时代形态和替代农田不一定有单独计价记录；实际build入口及已有记录必须有class，缺失时不能少算马里折扣。
  const pricedBuildings = new Set([...buildings].filter((id) => eco.buildings[id]));
  pricedBuildings.add(HOUSE);
  for (const bo of bos) for (const step of bo.steps) for (const action of step.actions) if (action.type === 'build') pricedBuildings.add(action.building);
  const buildingClass = new Map([...pricedBuildings].map((id) => [id, eco.buildings[id]?.class ?? -1] as const));
  return {
    units,
    buildings,
    techs,
    unitClass,
    buildingClass,
    sicilianRows: context.sicilianRows,
    sicilianBuildings: context.sicilianBuildings,
    civ,
    ...context,
  };
}

/** tech 是否可以应用：整条 tech 里没有未实现/未分类的效果 */
export function techAtomicOk(row: EffectRow, scope: ReturnType<typeof simScope>): boolean {
  return row.effects.every((e) => {
    const k = classifyCivEffect(e, row as { source?: string; tech?: number }, scope).kind;
    return k !== 'unhandled' && k !== 'unknown';
  });
}

/** Resource semantics are registered independently of the generic effect classifier. */
const RESOURCE_HANDLERS: readonly {
  res: number;
  op: string;
  accepts?: (row: EffectRow, effect: Effect) => boolean | undefined;
}[] = [
  { res: 269, op: 'set' },
  { res: RES_HUNT_FOOD, op: 'mul' },
  { res: RES_FORAGER_WOOD, op: 'add', accepts: (row) => row.tech === 453 },
  { res: RES_LUMBER_FOOD, op: 'set', accepts: hasLumberFoodContext },
  { res: RES_GOLD_PRODUCTIVITY, op: 'add', accepts: hasMalianGoldContext },
  { res: RES_WILD_FOOD_GOLD, op: 'set', accepts: (row, e) => Number.isFinite(e.v) && e.v! >= 0 && hasVarangianGoldContext(row) },
  { res: RES_SHEPHERD_PRODUCTIVITY, op: 'mul', accepts: hasTatarShepherdContext },
];
/** 判定一条文明效果 */
export function classifyCivEffect(
  e: Effect,
  row: {
    source?: string;
    age?: number;
    tech?: number;
    requires?: number[];
    effects?: EffectRow['effects'];
    armenianTech?: ArmenianRawTech;
    georgianTech?: GeorgianRawTech;
    slavicTree?: SlavicRawTree;
    slavicTech?: SlavicRawTech;
    khmerTech?: KhmerRawTech;
    jurchenTech?: JurchenRawTech;
    chineseTech?: ChineseRawTech;
    mapucheTech?: MapucheRawTech;
    gurjaraTech?: GurjaraRawTech;
    khmerTree?: KhmerRawTree;
    khmerTeam?: KhmerRawTeam;
  },
  scope: ReturnType<typeof simScope>,
): EffectClass {
  const polish = polishRowClass(row as EffectRow, scope.civ, scope.poles);
  if (polish) return polish;
  const roman = romanRowClass(row as EffectRow, scope.civ, scope.romans);
  if (roman) return roman;
  const gurjara = gurjaraRowClass(row as EffectRow, scope.civ, scope.gurjaras);
  if (gurjara) return gurjara;
  const mapuche = mapucheRowClass(row as EffectRow, scope.civ, scope.mapuche);
  if (mapuche) return mapuche;
  const chinese = chineseRowClass(row as EffectRow, scope.civ, scope.chinese);
  if (chinese) return chinese;
  const jurchen = jurchenRowClass(row as EffectRow, scope.civ, scope.jurchens);
  if (jurchen) return jurchen;
  const khmer = khmerRowClass(row as EffectRow, scope.civ, scope.khmer);
  if (khmer) return khmer;
  const slavic = slavicRowClass(row as EffectRow, scope.civ, scope.slavs);
  if (slavic) return slavic;
  const armenian = armenianRowClass(row as EffectRow, scope.civ, scope.armenians, scope.buildings);
  if (armenian) return armenian;
  const georgian = georgianRowClass(row as EffectRow, scope.civ, scope.georgians, scope.buildings);
  if (georgian) return georgian;
  if (isWeiRewardRow(row))
    return scope.civ === 'Wei' && scope.weiRewards?.some((reward) => reward.row === row)
      ? { kind: 'handled' }
      : { kind: 'unhandled', reason: WEI_CONTEXT_REASON };
  if (isBengaliRewardRow(row))
    return scope.civ === 'Bengalis' && scope.bengaliRewards?.some((reward) => reward.row === row)
      ? { kind: 'handled' }
      : { kind: 'unhandled', reason: BENGALI_CONTEXT_REASON };
  if (scope.sicilianRows && !sicilianRowAllowed(scope, row as EffectRow)) return { kind: 'unhandled', reason: '西西里加成缺少完整已核上下文，未计入' };
  if (row.tech === 704 && !hasTatarShepherdContext(row)) return { kind: 'unhandled', reason: '鞑靼牧羊产量与工作率缺少完整已核配对，未计入' };
  if (row.source === 'team') return { kind: 'irrelevant', reason: '团队加成，默认不计团队' };
  if (row.tech === 595 && !hasMalianBuildingContext(row, scope)) return { kind: 'unhandled', reason: '马里建筑木费折扣缺少已核效果或当前建筑类别，未计入' };
  if (row.tech !== undefined && PENDING_TECH[row.tech]) return { kind: 'unhandled', reason: PENDING_TECH[row.tech]! };
  if (e.kind === 'freeTech') return { kind: 'handled' };
  if (e.kind === 'techCost' || e.kind === 'techTime') {
    if (e.tech === undefined || !scope.techs.has(e.tech)) return { kind: 'irrelevant', reason: '开局不涉及的科技' };
    if (TECH_OPS.has(e.op ?? '') && (e.kind === 'techTime' || TECH_RES[String(e.res)])) return { kind: 'handled' };
    return { kind: 'unknown' };
  }
  if (e.kind === 'res') {
    if (e.res === undefined) return { kind: 'unknown' };
    if (e.res === 69 && scope.sicilianRows && sicilianGroupOk(scope, 772)) return { kind: 'irrelevant', reason: SICILIAN_FARM_NOTE };
    if (MAYAN_RESOURCE_TASKS[e.res] && hasMayanTreeContext(row)) return { kind: 'handled' };
    if (RESOURCE_HANDLERS.some((rule) => e.res === rule.res && e.op === rule.op && (!rule.accepts || rule.accepts(row as EffectRow, e))))
      return { kind: 'handled' };
    if (HANDLED_RES(e.res, e.op)) return { kind: 'handled' };
    if (e.res === 234 && row.tech !== undefined && RES234_HANDLED.has(row.tech)) return { kind: 'handled' };
    if (e.res === 234 && row.tech !== undefined && RES234_IRRELEVANT_TECH[row.tech]) return { kind: 'irrelevant', reason: RES234_IRRELEVANT_TECH[row.tech]! };
    if (UNHANDLED_RES[e.res]) return { kind: 'unhandled', reason: UNHANDLED_RES[e.res]! };
    if (IRRELEVANT_RES[e.res]) return { kind: 'irrelevant', reason: IRRELEVANT_RES[e.res]! };
    return { kind: 'unknown' };
  }
  if (e.kind === 'attr' && e.target) {
    const t = e.target;
    const id = t.startsWith('unit:') ? Number(t.slice(5)) : NaN;
    const vil = t.startsWith('task:') || t === 'villager' || t === 'class:4' || id === 83;
    // 类别目标（#42 哥特步兵 class:6）：开局里有该类别的单位时，费用倍率已按类别实现；其余属性不影响开局时间
    if (t.startsWith('class:') && !vil) {
      const cls = Number(t.slice(6));
      if (scope.sicilianRows && row.tech === 770 && SICILIAN_FORT_CLASSES.has(cls) && sicilianGroupOk(scope, 770)) return { kind: 'handled' };
      if (row.tech === 595 && e.attr === 'woodCost' && e.op === 'mul') return { kind: 'handled' };
      if (MALIAN_BUILDING_CLASSES.has(cls) && e.attr === 'woodCost' && [...scope.buildingClass.values()].includes(cls))
        return { kind: 'unhandled', reason: '尚未核实的建筑类别木费效果，未计入' };
      if (![...scope.units].some((u) => scope.unitClass.get(u) === cls)) return { kind: 'irrelevant', reason: '开局不涉及的单位/建筑/类别' };
      if (
        cls === scope.unitClass.get(13) &&
        scope.units.has(13) &&
        ['workRate', 'carry', 'speed'].includes(e.attr ?? '') &&
        (e.op === 'mul' || (e.attr === 'carry' && e.op === 'add'))
      )
        return { kind: 'handled' };
      if (e.attr && (e.attr in COST_ATTR || e.attr === 'trainTime') && e.op === 'mul') return { kind: 'handled' };
      if (e.attr === 'trainTime' || e.attr === 'workRate' || e.attr === 'carry' || (e.attr ?? '') in COST_ATTR) return { kind: 'unknown' };
      return { kind: 'irrelevant', reason: '开局单位类别的非经济属性（攻防、生命等）不影响开局时间' };
    }
    if (!vil && !scope.units.has(id) && !scope.buildings.has(id)) return { kind: 'irrelevant', reason: '开局不涉及的单位/建筑/类别' };
    if (e.attr === 'speed') return (vil || id === 13) && e.op === 'mul' ? { kind: 'handled' } : { kind: 'irrelevant', reason: '非村民移速不影响开局时间' };
    if (FARM_UNITS.has(id) && e.attr === 'workRate')
      return { kind: 'unhandled', reason: '农田单位 workRate 与 task:farm 是否重复待 .dat 核实（罗马、斯拉夫）' };
    // issue 317：农田费用倍率由 applyEffects 计入 costMul（条顿农田 -40% 会改变开局结果），归为已实现；只影响分类，不改数值
    if (FARM_UNITS.has(id) && e.attr && e.attr in COST_ATTR && e.op === 'mul') return { kind: 'handled' };
    if (FARM_UNITS.has(id) || (TC_UNITS.has(id) && id !== TC && e.attr !== 'workRate'))
      return { kind: 'irrelevant', reason: '农田/升级后城镇中心的非速度属性不影响开局' };
    if (e.attr && HANDLED_ATTR.has(e.attr) && (e.op === 'mul' || (e.op === 'add' && (e.attr === 'carry' || (e.attr in COST_ATTR && e.attr !== 'cost')))))
      return { kind: 'handled' };
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

const describeEffect = (civ: string, row: { tech?: number }, e: Effect) =>
  `${civ} tech ${row.tech ?? '?'}: ${e.kind} ${e.kind === 'res' ? 'res ' + e.res : (e.target ?? e.tech ?? '')} ${e.attr ?? ''} ${e.op ?? ''} ${e.v ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();

/** 某文明未处理的效果：影响开局但未实现 + 未分类（Kent #42 草稿接口） */
export function unhandledEffects(eco: EcoData, civ: string, bos: BuildOrder[] = []): { effect: string; kind: 'unhandled' | 'unknown'; reason: string }[] {
  const scope = simScope(eco, bos, civ);
  const out: { effect: string; kind: 'unhandled' | 'unknown'; reason: string }[] = [];
  for (const r of eco.civEco[civ] ?? [])
    for (const e of r.effects) {
      const c = classifyCivEffect(e, r as { source?: string; tech?: number }, scope);
      if (c.kind === 'unhandled') out.push({ effect: describeEffect(civ, r as { tech?: number }, e), kind: 'unhandled', reason: c.reason });
      else if (c.kind === 'unknown') out.push({ effect: describeEffect(civ, r as { tech?: number }, e), kind: 'unknown', reason: '未分类的效果类型' });
    }
  return out;
}

/** 文明是否被开局模拟完整支持：没有「影响开局但未实现」也没有未分类效果；UI（#39）据此置灰 */
export function simSupport(
  eco: EcoData,
  civ: string,
  bos: BuildOrder[] = [],
  opts: { ignoreSourceGate?: boolean } = {},
): { supported: boolean; reasons: string[] } {
  const u = unhandledEffects(eco, civ, bos);
  const reasons = [...new Set(u.map((x) => x.reason))];
  if (civ === 'Poles') reasons.push(...polishContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some(hasPolishMarker)) reasons.push(POLISH_SOURCE_REASON);
  if (civ === 'Romans') reasons.push(...romanContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some(hasRomanMarker)) reasons.push(ROMAN_SOURCE_REASON);
  if (civ === 'Gurjaras') {
    reasons.push(...gurjaraContext(eco).reasons);
    if (!gurjaraOrdersSupported(bos)) reasons.push(GURJARA_ACTION_REASON);
  } else if ((eco.civEco[civ] ?? []).some(hasGurjaraMarker)) reasons.push(GURJARA_SOURCE_REASON);
  if (civ === 'Mapuche') reasons.push(...mapucheContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some(hasMapucheMarker)) reasons.push(MAPUCHE_SOURCE_REASON);
  if (civ === 'Chinese') reasons.push(...chineseContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some(hasChineseMarker)) reasons.push(CHINESE_SOURCE_REASON);
  if (civ === 'Jurchens') reasons.push(...jurchenContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some(hasJurchenMarker)) reasons.push(JURCHEN_SOURCE_REASON);
  if (civ === 'Khmer') reasons.push(...khmerContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some((row) => khmerHasMarker(row) || [638, 654, 657, 672].includes(row.tech ?? -1))) reasons.push(KHMER_SOURCE_REASON);
  if (civ === 'Slavs') reasons.push(...slavicContext(eco).reasons);
  else if ((eco.civEco[civ] ?? []).some((row) => 'slavicTree' in row || 'slavicTech' in row)) reasons.push(SLAVIC_SOURCE_REASON);
  if (civ === 'Mayans' && !hasUniqueMayanTree(eco)) reasons.push('玛雅资源产量与工作率缺少完整已核配对，未计入');
  if (civ === 'Sicilians' && SICILIAN_GROUPS.some((group) => !sicilianGroupOk(simScope(eco, bos, civ), group)))
    reasons.push('西西里加成缺少完整已核上下文，未计入');
  if (civ === 'Wei' && !weiRewardFamily(eco.civEco.Wei)) reasons.push(WEI_CONTEXT_REASON);
  if (civ === 'Bengalis' && !bengaliRewardFamily(eco.civEco.Bengalis)) reasons.push(BENGALI_CONTEXT_REASON);
  if (civ === 'Armenians') {
    const context = armenianContext(eco);
    reasons.push(...context.reasons);
    if (bos.some((order) => order.steps.some((step) => step.actions.some((action) => action.type === 'build' && [104, 1806, 1118].includes(action.building)))))
      reasons.push('强化教堂与圣物经济不在当前开局模型内，未计入');
    if (
      context.infrastructure &&
      bos.some((order) =>
        order.steps.some((step) => step.actions.some((action) => action.type === 'research' && !armenianResearchSites(context, action.tech)?.length)),
      )
    )
      reasons.push('该研究在亚美尼亚当前已核科技与地点范围外，未计入');
  }
  if (civ === 'Georgians') {
    const context = georgianContext(eco);
    reasons.push(...context.reasons);
    if (georgianHasChurch(simScope(eco, bos, civ).buildings)) reasons.push(GEORGIAN_CHURCH_REASON);
    // simScope.techs contains all standard ecoTechs; availability concerns only requested actions.
    if (
      context.infrastructure &&
      bos.some((order) =>
        order.steps.some((step) => step.actions.some((action) => action.type === 'research' && !georgianResearchSites(context, action.tech)?.length)),
      )
    )
      reasons.push('该研究在格鲁吉亚当前已核科技与地点范围外，未计入');
  }
  if (!opts.ignoreSourceGate && !FORCED_CIVS.has(civ) && SOURCE_PENDING_CIVS[civ]) reasons.push(SOURCE_PENDING_CIVS[civ]!);
  return { supported: reasons.length === 0, reasons };
}

/** 所有文明里未分类的效果（bo:check 遇到即失败） */
export function unknownCivEffects(eco: EcoData, bos: BuildOrder[] = []): string[] {
  return Object.keys(eco.civEco).flatMap((c) =>
    unhandledEffects(eco, c, bos)
      .filter((x) => x.kind === 'unknown')
      .map((x) => x.effect),
  );
}
