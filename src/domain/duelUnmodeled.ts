/**
 * issue 1296：单位 PK 未建模核心战斗机制检测（纯函数，无 React/UI 依赖）。
 * 100% 由固定 DAT / units.json / effects.json 数据驱动，零硬编码单位或科技 ID 白名单。
 */
import { DAT, type DatEco } from './datEffects';
import type { SimTech } from './simulator';
import type { Tech, Unit } from './types';

export type UnmodeledKind = 'charge' | 'multi-projectile' | 'splash' | 'dismount' | 'form-switch';

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

/**
 * 针对单一属性号独立聚合 eco 效果净值，避免 a:102 与 a:107 混加错抵，
 * 并正确过滤类似 Druzhina 对 8 个远程步兵 +0.5 / -0.5 互相抵消的条目。
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
  return addSum > EPS || mulProd > 1 + EPS || (maxSet !== null && maxSet >= minSet - EPS);
}

const hasPositiveSplash = (eco: readonly DatEco[] | undefined, unitId: number) => hasPositiveEcoAttr(eco, unitId, 22, EPS);
const hasPositiveExtraProjectiles = (eco: readonly DatEco[] | undefined, unitId: number) =>
  hasPositiveEcoAttr(eco, unitId, 102, 1) || hasPositiveEcoAttr(eco, unitId, 107, 1);

/**
 * 返回当前文明/单位可用科技列表中，具备净正溅射（a:22）或额外弹矢（a:102/107）效果的科技 ID 集合，
 * 供单兵种 SimPanel 开放勾选（与混编模式及 issue 943 费用科技一致；不进入 f/c 自动预设）。
 */
export function applicableUnmodeledTechIds(avail: readonly SimTech[], unitId: number): Set<number> {
  const ids = new Set<number>();
  for (const { t } of avail) {
    const eco = DAT.techs[t.en]?.eco;
    if (hasPositiveSplash(eco, unitId) || hasPositiveExtraProjectiles(eco, unitId)) ids.add(t.id);
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
