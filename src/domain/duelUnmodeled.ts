/**
 * issue 1296 / 1367：单位 PK 未建模核心战斗机制检测（纯函数，无 React/UI 依赖）。
 * 100% 由固定 DAT / units.json / effects.json 数据驱动，零硬编码单位或科技 ID 白名单。
 */
import { applyCombatAbilityEco, DAT, type DatEco } from './datEffects';
import {
  getProjectileGuidanceScope,
  hasPositiveDamageReflection,
  hasPositiveEcoAttr,
  hasPositiveExtraProjectiles,
  hasPositiveRegen,
  hasPositiveSplash,
  hasProjectileGuidance,
  hasProjectilePassThrough,
  hasProjectilePoison,
  isSingleShotChargeProjectileEco,
  keepsScopedUnmodeledTech,
  projectileGuidanceDuelDetail,
  projectileGuidanceLabel,
  resolveTechChargeGrant,
  type TechChargeGrant,
} from './duelUnmodeledEco';
import type { SimTech } from './simulator';
import type { Tech, Unit } from './types';

export {
  hasPositiveDamageReflection,
  hasPositiveEcoAttr,
  isSingleShotChargeProjectileEco,
  keepsScopedUnmodeledTech,
  resolveTechChargeGrant,
  type TechChargeGrant,
};

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
  | 'regen'
  | 'death-heal'
  | 'damage-reflection'
  | 'projectile-guidance';

export interface UnmodeledMechanism {
  kind: UnmodeledKind;
  /** 胶囊展示短语（面向玩家，不暴露内部字段名） */
  pill: string;
  /** 面向玩家的中文偏差说明 */
  detail: string;
  /** 若由已选科技触发，记录科技英文名与 ID */
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
}

const EPS = 1e-9;
const COMBAT_ABILITY_ARMOR_STRIP = 4;
const COMBAT_ABILITY_AURA = 32 | 64;
const COMBAT_ABILITY_ON_HIT = 128;
/** issue 1522：.dat charge_target 位掩码（步/骑/弓/骑射/僧/民/攻城 = 0xBF；船只 = 0x40；护甲类 16 = 船只）。 */
const CHARGE_TARGET_LAND_UNIT_MASK = 0xbf;
const CHARGE_TARGET_SHIP_BIT = 0x40;
const SHIP_ARMOR_CLASS = 16;

const mech = (kind: UnmodeledKind, pill: string, detail: string): UnmodeledMechanism => ({ kind, pill, detail });

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

function changesUnmodeledCombatAbility(eco: readonly DatEco[] | undefined, unitId: number, baseCombatAbility: number): boolean {
  if (!eco?.length) return false;
  const before = normalizeCombatAbility(baseCombatAbility);
  const after = normalizeCombatAbility(applyCombatAbilityEco(before, eco, unitId));
  return unmodeledCombatAbilitySig(after) !== unmodeledCombatAbilitySig(before);
}

/**
 * 返回当前文明/单位可用科技列表中，具备净正溅射（a:22）、额外弹矢（a:102/107）、生命回复（a:109）、
 * 近战伤害反弹（a:118）、科技赋予充能攻击（a:62，限固有 chargeType === 0）、
 * 投射物剧毒（DAT.projectilePoison）、投射物直线穿透（DAT.projectilePassThrough）
 * 或改变未建模 combatAbility 位（bit 4/32|64/128）的科技 ID 集合，
 * 供单兵种 SimPanel 开放勾选（与混编模式及 issue 943 费用科技一致；不进入 f/c 自动预设）。
 */
export function applicableUnmodeledTechIds(avail: readonly SimTech[], unitId: number, baseCombatAbility = 0, baseChargeType = 0): Set<number> {
  const ids = new Set<number>();
  for (const { t } of avail) {
    const eco = DAT.techs[t.en]?.eco;
    if (
      hasPositiveSplash(eco, unitId) ||
      hasPositiveExtraProjectiles(eco, unitId) ||
      hasPositiveRegen(eco, unitId) ||
      hasPositiveDamageReflection(eco, unitId) ||
      resolveTechChargeGrant(eco, unitId, baseChargeType) !== null ||
      hasProjectilePoison(t.en, unitId) ||
      hasProjectilePassThrough(t.en, unitId) ||
      hasProjectileGuidance(t.en, unitId) ||
      changesUnmodeledCombatAbility(eco, unitId, baseCombatAbility)
    ) {
      ids.add(t.id);
    }
  }
  return ids;
}

function allowsRangedChargeTarget(unit: Pick<Unit, 'chargeTarget' | 'cls'>, opponents?: readonly Unit[]): boolean {
  const target = unit.chargeTarget;
  if (typeof target !== 'number' || !Number.isInteger(target) || target <= 0) return true;
  if ((target & CHARGE_TARGET_LAND_UNIT_MASK) !== 0) return true;
  if ((target & CHARGE_TARGET_SHIP_BIT) === 0) return false;
  if (opponents && opponents.length > 0) return opponents.some((o) => o.cls.includes(SHIP_ARMOR_CLASS));
  return unit.cls.includes(SHIP_ARMOR_CLASS);
}

function detectChargeMechanism(
  unit: Pick<Unit, 'chargeType' | 'chargeEvent' | 'chargeMultiProjectiles' | 'chargeTarget' | 'cls'>,
  opponents?: readonly Unit[],
): UnmodeledMechanism | null {
  const ct = unit.chargeType ?? 0;
  if (!Number.isFinite(ct) || ct <= 0) return null;
  if (ct === 4) return mech('charge', '充能投射物闪避', '当前未计入充能投射物闪避护盾；抗远程生存能力通常高于此处估算。');
  if (ct === 5) return mech('charge', '充能近战格挡', '当前未计入充能近战格挡护盾；抗近战生存能力通常高于此处估算。');
  if (ct === 2) return mech('charge', '生命值充能', '当前未计入生命值充能机制；实战生存能力可能高于此处估算。');
  if (ct === 1 || ct === 3) {
    if (unit.chargeEvent === 1) {
      return mech('charge', '蓄力增伤攻击', '当前仅按基础主攻击逐击结算，未计入蓄力攻击的周期额外增伤；实战爆发输出通常高于此处估算。');
    }
    return mech('charge', '充能特殊机制', '当前未计入该单位的充能特殊机制（非普通攻击增伤）；实战接敌或技能表现可能偏离此处估算。');
  }
  if (ct === 6 || ct === 7) {
    if (!allowsRangedChargeTarget(unit, opponents)) return null;
    if (unit.chargeMultiProjectiles === true) {
      return mech('charge', '充能多箭齐射', '当前仅按基础单次主攻击逐击结算，未计入充能多弹丸齐射；实战爆发输出通常高于此处估算。');
    }
    return mech('charge', '充能远程攻击', '当前仅按基础主攻击逐击结算，未计入充能远程攻击；实战输出或压制能力可能高于此处估算。');
  }
  return mech('charge', '充能特殊机制', '当前未计入该单位的充能特殊机制；实战表现可能偏离此处估算。');
}

function detectOnHitMechanism(effect: Unit['onHitEffect']): UnmodeledMechanism {
  if (effect === 'dot') return mech('on-hit', '命中后持续伤害', '当前未计入命中后的持续伤害；实际输出通常高于此处估算。');
  if (effect === 'slow') return mech('on-hit', '命中减速', '当前未计入命中后使目标减速；目标更难脱离或追击，实战表现通常高于此处估算。');
  if (effect === 'attack-speed') {
    return mech('on-hit', '越战越快', '当前按固定攻击间隔结算，未计入持续作战后攻击速度的提升；长时间缠斗时实际输出通常高于此处估算。');
  }
  return mech('on-hit', '命中特效', '当前未计入该单位命中时附带的特殊效果；实战表现可能偏离此处估算。');
}

function formatTechChargeMechanism(base: UnmodeledMechanism, tech: Tech): UnmodeledMechanism {
  const insert = `（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）`;
  const semiIdx = base.detail.indexOf('；');
  const detail = semiIdx >= 0 ? `${base.detail.slice(0, semiIdx)}${insert}${base.detail.slice(semiIdx)}` : `${base.detail}${insert}`;
  return {
    kind: 'charge',
    pill: `${base.pill} · ${tech.zh}`,
    detail,
    techId: tech.id,
    techEn: tech.en,
  };
}

/**
 * 检测单个参战单位在给定文明、时代与已选科技下命中的未建模机制。
 * 与 simulate() 同口径：直接遵循传入的 selectedTechs，不做二次隐式时代截断或自动补选。
 */
export function detectUnitUnmodeled(input: {
  unit: Unit;
  civ: string;
  age: number;
  selectedTechs: readonly Tech[];
  opponents?: readonly Unit[];
}): UnmodeledMechanism[] {
  const { unit, civ, age, selectedTechs, opponents } = input;
  const out: UnmodeledMechanism[] = [];
  const ranged = unit.rng > 1;
  const selectedEn = new Set(selectedTechs.map((t) => t.en));
  const activeCivBonuses = (DAT.civs[civ]?.bonus ?? []).filter(
    (entry) => entry.age <= age && (!entry.req.length || entry.req.every((reqEn) => selectedEn.has(reqEn))),
  );

  // 1. 充能机制（按固定源 chargeType / chargeEvent / chargeTarget / chargeMultiProjectiles 分型；固有 chargeType === 0 时补充已选科技赋予的 a:62 充能）
  const charge = detectChargeMechanism(unit, opponents);
  if (charge) out.push(charge);
  const baseChargeType = unit.chargeType ?? 0;
  const techChargeById = new Map<number, TechChargeGrant>();
  for (const tech of selectedTechs) {
    const grant = resolveTechChargeGrant(DAT.techs[tech.en]?.eco, unit.id, baseChargeType);
    if (!grant) continue;
    techChargeById.set(tech.id, grant);
    const granted = detectChargeMechanism(
      { chargeType: grant.chargeType, chargeEvent: grant.chargeEvent, chargeMultiProjectiles: false, chargeTarget: unit.chargeTarget, cls: unit.cls },
      opponents,
    );
    if (granted) out.push(formatTechChargeMechanism(granted, tech));
  }

  // 2. 多弹丸 / 额外弹矢（固有 + 文明加成合并为 1 枚胶囊；已选科技按项列出，单发充能远程抑制冗余额外弹矢）
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
    const techEco = DAT.techs[tech.en]?.eco;
    if (!hasPositiveExtraProjectiles(techEco, unit.id)) continue;
    if (isSingleShotChargeProjectileEco(techEco, unit.id, techChargeById.get(tech.id) ?? null)) continue;
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
  for (const tech of selectedTechs) {
    if (!hasProjectilePoison(tech.en, unit.id)) continue;
    out.push({
      kind: 'on-hit',
      pill: `命中后持续伤害 · ${tech.zh}`,
      detail: `当前未计入命中后的中毒持续伤害（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）；实际输出通常高于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
    });
  }

  // 9. 直线穿透（主投射物 hit_mode === 1；及已选科技赋予的投射物直线穿透）
  if (unit.projectilePassThrough === true) {
    out.push({
      kind: 'pass-through',
      pill: '直线穿透',
      detail: '当前只按主目标逐击结算，未计入投射物穿过主目标、命中同一直线上其他单位的伤害；对密集阵型的实际输出通常高于此处估算。',
    });
  }
  for (const tech of selectedTechs) {
    if (!hasProjectilePassThrough(tech.en, unit.id)) continue;
    out.push({
      kind: 'pass-through',
      pill: `直线穿透 · ${tech.zh}`,
      detail: `当前只按主目标逐击结算，未计入投射物穿过主目标、命中同一直线上其他单位的伤害（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）；对密集阵型的实际输出通常高于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
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

  // 12. 生命回复（单位固有 regenRate、文明加成 a:109、已选科技 a:109 各自保留来源说明，互不合并）
  if (typeof unit.regenRate === 'number' && Number.isFinite(unit.regenRate) && unit.regenRate > EPS) {
    out.push({
      kind: 'regen',
      pill: '生命回复',
      detail: '当前未计入战斗中的生命回复（单位固有）；持久战中实际生存能力通常高于此处估算。',
    });
  }
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

  // 13. 阵亡回血光环（BloodUnitID 指向 CombatAbility & 32 实体，如格查战士 2562/2564）
  if (unit.deathHealAura === true) {
    out.push({
      kind: 'death-heal',
      pill: '同伴阵亡回血',
      detail: '当前未计入附近格查战士被击败时的生命回复；成群作战、持续减员时实际生存能力通常高于此处估算。',
    });
  }

  // 14. 近战伤害反弹（已选科技 a:118 > 0，如契丹札甲；额外伤害减免 a:24 已由 Issue 1500 正式接入伤害核心，不再报未建模）
  for (const tech of selectedTechs) {
    if (!hasPositiveDamageReflection(DAT.techs[tech.en]?.eco, unit.id)) continue;
    out.push({
      kind: 'damage-reflection',
      pill: `近战伤害反弹 · ${tech.zh}`,
      detail: `当前未计入受到近战攻击时的伤害反弹（已选科技「${tech.zh}」；未勾选该科技时本项不会触发）；近战对拼时实际换血能力通常高于此处估算。`,
      techId: tech.id,
      techEn: tech.en,
    });
  }

  // 15. 投射物追踪与弹速提升（已选科技 DAT.projectileGuidance，不改动面板与 PK 数值）
  for (const tech of selectedTechs) {
    const scope = getProjectileGuidanceScope(tech.en);
    if (!scope || !tech.civs.includes(civ) || !scope.units.includes(unit.id)) continue;
    const label = projectileGuidanceLabel(scope);
    const detail = projectileGuidanceDuelDetail(scope, tech.zh);
    if (label && detail) out.push({ kind: 'projectile-guidance', pill: `${label} · ${tech.zh}`, detail, techId: tech.id, techEn: tech.en });
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
    const opponents = entries.filter((e) => e.side !== entry.side).map((e) => e.unit);
    const mechanisms = detectUnitUnmodeled({ ...entry, opponents });
    if (!mechanisms.length) continue;
    out.push({ side: entry.side, badge: entry.badge, unit: entry.unit, civ: entry.civ, mechanisms });
  }
  return out;
}
