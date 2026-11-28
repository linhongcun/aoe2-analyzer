/**
 * issue 1482：单位 PK 未建模机制的纯 eco/充能/作用域谓词（下层无环纯函数模块，仅依赖 datEffects / unitCost / types）。
 * 100% 由固定 DAT 导出数据驱动，零硬编码单位或科技 ID 白名单。
 */
import { DAT, type DatEco } from './datEffects';
import type { Tech } from './types';
import { isUnitCostAttribute } from './unitCost';

const EPS = 1e-9;

export interface TechChargeGrant {
  chargeType: number;
  chargeEvent: number;
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
    if (typeof item.v !== 'number' || !Number.isFinite(item.v)) continue;
    matched = true;
    if (item.op === 'add') addSum += item.v;
    else if (item.op === 'mul') mulProd *= item.v;
    else if (item.op === 'set') maxSet = maxSet === null ? item.v : Math.max(maxSet, item.v);
  }
  if (!matched) return false;
  const setOk = maxSet !== null && (minSet > EPS ? maxSet >= minSet - EPS : maxSet > EPS);
  return addSum > EPS || mulProd > 1 + EPS || setOk;
}

export const hasPositiveSplash = (eco: readonly DatEco[] | undefined, unitId: number) => hasPositiveEcoAttr(eco, unitId, 22, EPS);
export const hasPositiveExtraProjectiles = (eco: readonly DatEco[] | undefined, unitId: number) =>
  hasPositiveEcoAttr(eco, unitId, 102, 1) || hasPositiveEcoAttr(eco, unitId, 107, 1);
export const hasPositiveRegen = (eco: readonly DatEco[] | undefined, unitId: number) => hasPositiveEcoAttr(eco, unitId, 109, EPS);
export const hasProjectilePoison = (techEn: string, unitId: number): boolean => DAT.projectilePoison?.[techEn]?.units.includes(unitId) ?? false;
export const hasProjectilePassThrough = (techEn: string, unitId: number): boolean => DAT.projectilePassThrough?.[techEn]?.units.includes(unitId) ?? false;

/**
 * 按命令顺序计算单一属性号的有限数值 set/add/mul 生效结果，
 * 支持后续 set 0 / mul 0 / 负 add 覆盖前序正值，并防御 NaN / Infinity。
 */
function hasSequentialPositiveAttr(eco: readonly DatEco[] | undefined, unitId: number, attr: number): boolean {
  if (!eco?.length) return false;
  let matched = false;
  let val = 0;
  for (const item of eco) {
    if (item.a !== attr || !item.t?.includes(unitId)) continue;
    if (typeof item.v !== 'number' || !Number.isFinite(item.v)) continue;
    if (item.op === 'set') {
      matched = true;
      val = item.v;
    } else if (item.op === 'add') {
      matched = true;
      val += item.v;
    } else if (item.op === 'mul') {
      matched = true;
      val *= item.v;
    }
  }
  return matched && Number.isFinite(val) && val > EPS;
}

/**
 * issue 1482：检测近战伤害反弹（a:118），按命令顺序计算有限数值 set/add/mul 生效结果，
 * 支持后续 set 0 / mul 0 / 负 add 抵消，并防御 NaN / Infinity。
 */
export function hasPositiveDamageReflection(eco: readonly DatEco[] | undefined, unitId: number): boolean {
  return hasSequentialPositiveAttr(eco, unitId, 118);
}

export function hasAnyPositiveDamageReflection(eco: readonly DatEco[] | undefined): boolean {
  if (!eco?.length) return false;
  const unitIds = new Set<number>();
  for (const item of eco) {
    if (item.a === 118 && item.t?.length) {
      for (const id of item.t) unitIds.add(id);
    }
  }
  for (const id of unitIds) {
    if (hasPositiveDamageReflection(eco, id)) return true;
  }
  return false;
}

/**
 * issue 1482：解析科技赋予的充能攻击（a:62 chargeType 与伴生 a:61 chargeEvent）。
 * 严格要求单位固有 baseChargeType <= 0，避免固有充能单位（如 1948 楼船、2705/2706 扈从部队）
 * 在纯 a:61 调整（199/200/201/377）或 a:62 改型（997）下重复产出科技充能胶囊。
 */
export function resolveTechChargeGrant(eco: readonly DatEco[] | undefined, unitId: number, baseChargeType = 0): TechChargeGrant | null {
  if (!eco?.length) return null;
  if (typeof baseChargeType !== 'number' || !Number.isFinite(baseChargeType) || baseChargeType > EPS) return null;
  let hasChargeTypeCmd = false;
  let ct = 0;
  let ce = 0;
  for (const item of eco) {
    if (!item.t?.includes(unitId)) continue;
    if (typeof item.v !== 'number' || !Number.isFinite(item.v)) continue;
    if (item.a === 62) {
      if (item.op === 'set') {
        hasChargeTypeCmd = true;
        ct = item.v;
      } else if (item.op === 'add') {
        hasChargeTypeCmd = true;
        ct += item.v;
      } else if (item.op === 'mul') {
        hasChargeTypeCmd = true;
        ct *= item.v;
      }
    } else if (item.a === 61) {
      if (item.op === 'set') ce = item.v;
      else if (item.op === 'add') ce += item.v;
      else if (item.op === 'mul') ce *= item.v;
    }
  }
  const chargeType = Number.isFinite(ct) ? Math.trunc(ct) : 0;
  if (!hasChargeTypeCmd || chargeType <= 0) return null;
  return {
    chargeType,
    chargeEvent: Number.isFinite(ce) ? Math.trunc(ce) : 0,
  };
}

export function hasAnyPositiveTechCharge(eco: readonly DatEco[] | undefined): boolean {
  if (!eco?.length) return false;
  const unitIds = new Set<number>();
  for (const item of eco) {
    if (item.a === 62 && item.t?.length) {
      for (const id of item.t) unitIds.add(id);
    }
  }
  for (const id of unitIds) {
    if (resolveTechChargeGrant(eco, id, 0) !== null) return true;
  }
  return false;
}

/**
 * issue 1482：单发充能远程抑制冗余「额外弹矢」（零硬编码 ID）。
 * 当单位固有 chargeType === 0，且同一科技由 a:62 赋予 ct ∈ {6, 7} 且仅伴生 a:107 set 1
 * （无正 a:102、无正 a:107 add、无 a:107 mul > 1、无 a:107 set > 1）时返回 true。
 */
export function isSingleShotChargeProjectileEco(eco: readonly DatEco[] | undefined, unitId: number, techCharge: TechChargeGrant | null): boolean {
  if (!eco?.length || !techCharge || (techCharge.chargeType !== 6 && techCharge.chargeType !== 7)) return false;
  if (hasPositiveEcoAttr(eco, unitId, 102, 1)) return false;
  let addSum = 0;
  let mulProd = 1;
  let maxSet: number | null = null;
  let matched = false;
  for (const item of eco) {
    if (item.a !== 107 || !item.t?.includes(unitId)) continue;
    if (typeof item.v !== 'number' || !Number.isFinite(item.v)) continue;
    matched = true;
    if (item.op === 'add') addSum += item.v;
    else if (item.op === 'mul') mulProd *= item.v;
    else if (item.op === 'set') maxSet = maxSet === null ? item.v : Math.max(maxSet, item.v);
  }
  if (!matched) return false;
  return addSum <= EPS && mulProd <= 1 + EPS && maxSet !== null && maxSet >= 1 - EPS && maxSet <= 1 + EPS;
}

/**
 * 统一裁剪按固定数据限定单位作用域的未建模科技（投射物剧毒、投射物直线穿透、近战伤害反弹 a:118、科技赋予充能 a:62）。
 * 非上述四类作用域科技原样保留（返回 true）；命中作用域的科技须通过文明归属校验，
 * 且对目标单位仍具备任一有效规则、未建模或费用效果（如 997 在 1948 楼船上的 a:107 set 11）方可保留。
 */
export function keepsScopedUnmodeledTech(tech: Tech | undefined, civ: string | undefined, unitId: number, baseChargeType = 0): boolean {
  if (!tech) return true;
  const poison = DAT.projectilePoison?.[tech.en];
  const passThrough = DAT.projectilePassThrough?.[tech.en];
  const datTech = DAT.techs[tech.en];
  const eco = datTech?.eco;
  const hasAnyReflection = hasAnyPositiveDamageReflection(eco);
  const hasAnyCharge = hasAnyPositiveTechCharge(eco);
  if (!poison && !passThrough && !hasAnyReflection && !hasAnyCharge) return true;
  if (civ !== undefined && !tech.civs.includes(civ)) return false;
  if (
    poison?.units.includes(unitId) ||
    passThrough?.units.includes(unitId) ||
    hasPositiveDamageReflection(eco, unitId) ||
    resolveTechChargeGrant(eco, unitId, baseChargeType) !== null ||
    hasPositiveExtraProjectiles(eco, unitId) ||
    hasPositiveSplash(eco, unitId) ||
    hasPositiveRegen(eco, unitId) ||
    Boolean(eco?.some((item) => isUnitCostAttribute(item.a) && item.t?.includes(unitId)))
  ) {
    return true;
  }
  return Boolean(datTech?.rules.some((r) => !r.b && r.t.includes(unitId)));
}
