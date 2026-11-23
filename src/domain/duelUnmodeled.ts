/**
 * issue 1296 / 1367：单位 PK 未建模核心战斗机制检测（纯函数，无 React/UI 依赖）。
 * 100% 由固定 DAT / units.json / effects.json 数据驱动，零硬编码单位或科技 ID 白名单。
 */
import { applyCombatAbilityEco, DAT, type DatEco } from './datEffects';
import type { SimTech } from './simulator';
import type { Tech, Unit } from './types';

export type UnmodeledKind =
  | 'charge'
  | 'multi-projectile'
  | 'splash'
  | 'dismount'
  | 'form-switch'
  | 'armor-strip'
  | 'aura'
  | 'on-hit'
  | 'pass-through'
  | 'damaged-bonus'
  | 'low-hp-transform'
  | 'regen';

export interface UnmodeledMechanism {
  kind: UnmodeledKind;
  /** 胶囊展示短语（面向玩家，不暴露内部字段名） */
  pill: string;
  /** 面向玩家的中文偏差说明 */
  detail: string;
  /** 若由已选科技触发，记录科技英文名与 ID，供 VgNotes 按同侧去重 */
  techId?: number;
  techEn?: string;
}

export interface DuelUnmodeledInput {
  side: 'a' | 'b';
  /** 单兵种为 'A' / 'B'；混编为 'A1' / 'A2' / 'B1' 等 */
  badge: string;
  unit: Unit;
  civ: string;
  age: number;
  selectedTechs: readonly Tech[];
}

export interface DuelUnmodeledEntry {
  side: 'a' | 'b';
  badge: string;
  unit: Unit;
  civ: string;
  mechanisms: UnmodeledMechanism[];
  /** 本条触发的科技英文名集合，供同侧 VgNotes 去重 */
  techEns: Set<string>;
}

const EPS = 1e-9;
const COMBAT_ABILITY_ARMOR_STRIP = 4;
const COMBAT_ABILITY_AURA = 32 | 64;
const COMBAT_ABILITY_ON_HIT = 128;

/** 将 combatAbility 归约为非负整数位掩码，杜绝负数补码误匹配与非有限值扩散。 */
export function normalizeCombatAbility(ca?: number): number {
  return typeof ca === 'number' && Number.isFinite(ca) ? Math.max(0, Math.trunc(ca)) : 0;
}

/** 规范化未建模提示位签名（bit 4 / bit 32|64 合并 / bit 128），与运行时提示输出一一对应。 */
function unmodeledCombatAbilitySig(ca: number): number {
  const n = normalizeCombatAbility(ca);
  return (n & COMBAT_ABILITY_ARMOR_STRIP ? 1 : 0) | (n & COMBAT_ABILITY_AURA ? 2 : 0) | (n & COMBAT_ABILITY_ON_HIT ? 4 : 0);
}

/**
 * 独立于 StatSet 的生效 combatAbility 计算纯函数：
 * 直接复用 issue 1366 的 applyCombatAbilityEco（Genie 整数算术 set/add/mul），
 * 按 baseCa → 生效文明加成 → 已选科技顺序叠加后归约为非负整数位掩码。
 */
export function effectiveCombatAbility(baseCa: number | undefined, unitId: number, civ: string, age: number, selectedTechs: readonly Tech[]): number {
  const selectedEn = new Set(selectedTechs.map((t) => t.en));
  const activeCivBonuses = (DAT.civs[civ]?.bonus ?? []).filter(
    (entry) => entry.age <= age && (!entry.req.length || entry.req.every((reqEn) => selectedEn.has(reqEn))),
  );
  let ca = normalizeCombatAbility(baseCa);
  for (const entry of activeCivBonuses) {
    ca = applyCombatAbilityEco(ca, entry.eco, unitId);
  }
  for (const tech of selectedTechs) {
    ca = applyCombatAbilityEco(ca, DAT.techs[tech.en]?.eco, unitId);
  }
  return normalizeCombatAbility(ca);
}

/**
 * 针对单一属性号独立聚合 eco 效果净值，避免 a:102 与 a:107 混加错抵，
 * 过滤 Druzhina 对远程步兵 +0.5/-0.5 抵消，并严格区分 set 0 与正值 set。
 */
export function hasPositiveEcoAttr(eco: readonly DatEco[] | undefined, unitId: number, attr: number, minSet: number): boolean {
  if (!eco?.length) return false;
  let addSum = 0;
  let mulProd = 1;
  let maxSet: number | null = null;
  let matched = false;
  for (const item of eco) {
    if (item.a !== attr || !item.t?.includes(unitId)) continue;
    matched = true;
    if (item.op === 'add') addSum += item.v;
    else if (item.op === 'mul') mulProd *= item.v;
    else if (item.op === 'set') maxSet = maxSet === null ? item.v : Math.max(maxSet, item.v);
  }
  if (!matched) return false;
  const setOk = maxSet !== null && (minSet > EPS ? maxSet >= minSet - EPS : maxSet > EPS);
  return addSum > EPS || mulProd > 1 + EPS || setOk;
}

const hasPositiveSplash = (eco: readonly DatEco[] | undefined, unitId: number) => hasPositiveEcoAttr(eco, unitId, 22, EPS);
const hasPositiveExtraProjectiles = (eco: readonly DatEco[] | undefined, unitId: number) =>
  hasPositiveEcoAttr(eco, unitId, 102, 1) || hasPositiveEcoAttr(eco, unitId, 107, 1);
const hasPositiveRegen = (eco: readonly DatEco[] | undefined, unitId: number) => hasPositiveEcoAttr(eco, unitId, 109, EPS);

function changesUnmodeledCombatAbility(eco: readonly DatEco[] | undefined, unitId: number, baseCombatAbility: number): boolean {
  if (!eco?.length) return false;
  const before = normalizeCombatAbility(baseCombatAbility);
  const after = normalizeCombatAbility(applyCombatAbilityEco(before, eco, unitId));
  return unmodeledCombatAbilitySig(after) !== unmodeledCombatAbilitySig(before);
}

/**
 * 返回当前文明/单位可用科技列表中，具备净正溅射（a:22）、额外弹矢（a:102/107）、生命回复（a:109）
 * 或改变未建模 combatAbility 位（bit 4/32|64/128）的科技 ID 集合，
 * 供单兵种 SimPanel 开放勾选（与混编模式及 issue 943 费用科技一致；不进入 f/c 自动预设）。
 */
export function applicableUnmodeledTechIds(avail: readonly SimTech[], unitId: number, baseCombatAbility = 0): Set<number> {
  const ids = new Set<number>();
  for (const { t } of avail) {
    const eco = DAT.techs[t.en]?.eco;
    if (
      hasPositiveSplash(eco, unitId) ||
      hasPositiveExtraProjectiles(eco, unitId) ||
      hasPositiveRegen(eco, unitId) ||
      changesUnmodeledCombatAbility(eco, unitId, baseCombatAbility)
    ) {
      ids.add(t.id);
    }
  }
  return ids;
}

function detectChargeMechanism(unit: Unit): UnmodeledMechanism | null {
  const ct = unit.chargeType ?? 0;
  if (!Number.isFinite(ct) || ct <= 0) return null;
  if (ct === 4) {
    return {
      kind: 'charge',
      pill: '充能投射物闪避',
      detail: '当前未计入充能投射物闪避护盾；抗远程生存能力通常高于此处估算。',
    };
  }
  if (ct === 5) {
    return {
      kind: 'charge',
      pill: '充能近战格挡',
      detail: '当前未计入充能近战格挡护盾；抗近战生存能力通常高于此处估算。',
    };
  }
  if (ct === 2) {
    return {
      kind: 'charge',
      pill: '生命值充能',
      detail: '当前未计入生命值充能机制；实战生存能力可能高于此处估算。',
    };
  }
  if (ct === 1 || ct === 3) {
    if (unit.chargeEvent === 1) {
      return {
        kind: 'charge',
        pill: '蓄力增伤攻击',
        detail: '当前仅按基础主攻击逐击结算，未计入蓄力攻击的周期额外增伤；实战爆发输出通常高于此处估算。',
      };
    }
    return {
      kind: 'charge',
      pill: '充能特殊机制',
      detail: '当前未计入该单位的充能特殊机制（非普通攻击增伤）；实战接敌或技能表现可能偏离此处估算。',
    };
  }
  if (ct === 6 || ct === 7) {
    if (unit.chargeMultiProjectiles === true) {
      return {
        kind: 'charge',
        pill: '充能多箭齐射',
        detail: '当前仅按基础单次主攻击逐击结算，未计入充能多弹丸齐射；实战爆发输出通常高于此处估算。',
      };
    }
    return {
      kind: 'charge',
      pill: '充能远程攻击',
      detail: '当前仅按基础主攻击逐击结算，未计入充能远程攻击；实战输出或压制能力可能高于此处估算。',
    };
  }
  return {
    kind: 'charge',
    pill: '充能特殊机制',
    detail: '当前未计入该单位的充能特殊机制；实战表现可能偏离此处估算。',
  };
}

function detectOnHitMechanism(effect: Unit['onHitEffect']): UnmodeledMechanism {
  if (effect === 'dot') {
    return {
      kind: 'on-hit',
      pill: '命中后持续伤害',
      detail: '当前未计入命中后的持续伤害；实际输出通常高于此处估算。',
    };
  }
  if (effect === 'slow') {
    return {
      kind: 'on-hit',
      pill: '命中减速',
      detail: '当前未计入命中后使目标减速；目标更难脱离或追击，实战表现通常高于此处估算。',
    };
  }
  if (effect === 'attack-speed') {
    return {
      kind: 'on-hit',
      pill: '越战越快',
      detail: '当前按固定攻击间隔结算，未计入持续作战后攻击速度的提升；长时间缠斗时实际输出通常高于此处估算。',
    };
  }
  return {
    kind: 'on-hit',
    pill: '命中特效',
    detail: '当前未计入该单位命中时附带的特殊效果；实战表现可能偏离此处估算。',
  };
}

/**
 * 检测单个参战单位在给定文明、时代与已选科技下命中的未建模机制。
 * 与 simulate() 同口径：直接遵循传入的 selectedTechs，不做二次隐式时代截断或自动补选。
 */
export function detectUnitUnmodeled(input: { unit: Unit; civ: string; age: number; selectedTechs: readonly Tech[] }): UnmodeledMechanism[] {
  const { unit, civ, age, selectedTechs } = input;
  const out: UnmodeledMechanism[] = [];
  const ranged = unit.rng > 1;
  const selectedEn = new Set(selectedTechs.map((t) => t.en));
  const activeCivBonuses = (DAT.civs[civ]?.bonus ?? []).filter(
    (entry) => entry.age <= age && (!entry.req.length || entry.req.every((reqEn) => selectedEn.has(reqEn))),
  );

  // 1. 充能机制（严格按固定源 chargeType / chargeEvent / chargeMultiProjectiles 分型）
  const charge = detectChargeMechanism(unit);
  if (charge) out.push(charge);

  // 2. 多弹丸 / 额外弹矢（固有 + 文明加成合并为 1 枚胶囊；已选科技按项列出）
  const intrinsicMulti = (unit.totalProjectiles ?? 0) > 1;
  const civMulti = activeCivBonuses.some((entry) => hasPositiveExtraProjectiles(entry.eco, unit.id));
  if (intrinsicMulti || civMulti) {
    const sourceNote = intrinsicMulti && civMulti ? '（含固有与文明加成额外弹矢）' : civMulti ? '（含文明加成额外弹矢）' : '';
    out.push({
      kind: 'multi-projectile',
      pill: '多弹丸 / 副弹丸',
      detail: ranged
        ? `当前仅按主箭单次攻击结算，未计入额外副弹丸伤害${sourceNote}；对高远程护甲目标的实际输出明显高于此处估算。`
        : `当前仅按常规近战主攻击结算，未计入额外远程弹矢伤害${sourceNote}；实战输出通常高于此处估算。`,
    });
  }
  for (const tech of selectedTechs) {
    if (!hasPositiveExtraProjectiles(DAT.techs[tech.en]?.eco, unit.id)) continue;
    out.push({
      kind: 'multi-projectile',
      pill: `额外弹矢 · ${tech.zh}`,
      detail: ranged
        ? `当前仅按主箭单次攻击结算，未计入额外副弹丸伤害（已选科技「${tech.zh}」）；对高远程护甲目标的实际输出明显高于此处估算。`
        : `当前仅按常规近战主攻击结算，未计入额外远程弹矢伤害（已选科技「${tech.zh}」）；实战输出通常高于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
    });
  }

  // 3. 践踏 / 溅射伤害（严格仅 blast > 0 或文明/已选科技净正 a:22；绝不因 blast=0 且 blastDamage=-5 触发）
  const intrinsicSplash = unit.blast > 0;
  const civSplash = activeCivBonuses.some((entry) => hasPositiveSplash(entry.eco, unit.id));
  if (intrinsicSplash || civSplash) {
    out.push({
      kind: 'splash',
      pill: '固有溅射伤害',
      detail: '当前按单体逐击结算，未计入范围践踏/溅射伤害；群战表现可能明显强于此处估算。',
    });
  }
  for (const tech of selectedTechs) {
    if (!hasPositiveSplash(DAT.techs[tech.en]?.eco, unit.id)) continue;
    out.push({
      kind: 'splash',
      pill: `践踏 / 溅射伤害 · ${tech.zh}`,
      detail: `当前按单体逐击结算，未计入范围践踏/溅射伤害（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）；群战表现可能明显强于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
    });
  }

  // 4. 下马二阶段（form.kind === 'dismount'，覆盖城堡版 1225/1227 与营垒版 1254/1255）
  if (unit.form?.kind === 'dismount') {
    out.push({
      kind: 'dismount',
      pill: '阵亡下马步兵阶段',
      detail: '骑乘单位阵亡后的下马步兵二阶段未计入本场结算；实际总承伤与续战输出高于此处估算。',
    });
  }

  // 5. 未切换形态（form.kind === 'barrage' | 'weapon'）
  if (unit.form?.kind === 'barrage' || unit.form?.kind === 'weapon') {
    out.push({
      kind: 'form-switch',
      pill: '可切换形态',
      detail: '仅按当前所选形态结算，未计入战斗中切换形态的效果。',
    });
  }

  // 6–8. combatAbility 位驱动未建模机制（复用 issue 1366 完整位掩码与 a:63 算术叠加；排除 bit 1/2/8/16）
  const effectiveCa = effectiveCombatAbility(unit.combatAbility, unit.id, civ, age, selectedTechs);
  if ((effectiveCa & COMBAT_ABILITY_ARMOR_STRIP) !== 0) {
    out.push({
      kind: 'armor-strip',
      pill: '撕裂护甲',
      detail: '当前未计入每次攻击对目标护甲的削减；目标护甲越打越薄，实际输出通常高于此处估算。',
    });
  }
  if ((effectiveCa & COMBAT_ABILITY_AURA) !== 0) {
    out.push({
      kind: 'aura',
      pill: '光环 / 编队增益',
      detail: '当前未计入附近友军之间的光环或编队增益；成群作战时实际表现通常强于此处估算。',
    });
  }
  if ((effectiveCa & COMBAT_ABILITY_ON_HIT) !== 0) {
    out.push(detectOnHitMechanism(unit.onHitEffect));
  }

  // 9. 直线穿透（主投射物 hit_mode === 1）
  if (unit.projectilePassThrough === true) {
    out.push({
      kind: 'pass-through',
      pill: '直线穿透',
      detail: '当前只按主目标逐击结算，未计入投射物穿过主目标、命中同一直线上其他单位的伤害；对密集阵型的实际输出通常高于此处估算。',
    });
  }

  // 10. 对受伤目标递增伤害（action_type === 160）
  if (unit.damagedTargetBonus === true) {
    out.push({
      kind: 'damaged-bonus',
      pill: '对伤员递增伤害',
      detail: '当前未计入对已受伤目标的递增伤害；越打越痛，实际输出通常高于此处估算。',
    });
  }

  // 11. 低血量破盾变形态（action_type === 158）
  if (unit.lowHpTransform === true) {
    out.push({
      kind: 'low-hp-transform',
      pill: '受伤后变形态',
      detail: '当前未计入受到一定伤害后的形态变化（移动和攻击变强、护甲变弱）；实战表现可能偏离此处估算。',
    });
  }

  // 12. 生命回复（effects.json a:109；同文明跨时代加成展平合并出 1 枚，已选科技逐项出胶囊）
  const civEco = activeCivBonuses.flatMap((entry) => entry.eco);
  if (hasPositiveRegen(civEco, unit.id)) {
    out.push({
      kind: 'regen',
      pill: '生命回复',
      detail: '当前未计入战斗中的生命回复（文明加成）；持久战中实际生存能力通常高于此处估算。',
    });
  }
  for (const tech of selectedTechs) {
    if (!hasPositiveRegen(DAT.techs[tech.en]?.eco, unit.id)) continue;
    out.push({
      kind: 'regen',
      pill: `生命回复 · ${tech.zh}`,
      detail: `当前未计入战斗中的生命回复（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）；持久战中实际生存能力通常高于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
    });
  }

  return out;
}

/**
 * 汇总整场对战双方所有命中的未建模机制，按 (side, unit.id) 去重，常规无机制单位不产出条目。
 */
export function collectDuelUnmodeled(entries: readonly DuelUnmodeledInput[]): DuelUnmodeledEntry[] {
  const seen = new Set<string>();
  const out: DuelUnmodeledEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.side}:${entry.unit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mechanisms = detectUnitUnmodeled(entry);
    if (!mechanisms.length) continue;
    const techEns = new Set<string>();
    for (const item of mechanisms) if (item.techEn) techEns.add(item.techEn);
    out.push({
      side: entry.side,
      badge: entry.badge,
      unit: entry.unit,
      civ: entry.civ,
      mechanisms,
      techEns,
    });
  }
  return out;
}
