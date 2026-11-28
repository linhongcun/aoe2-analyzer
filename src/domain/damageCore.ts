/**
 * 伤害与击数的共享核心（D10 / issue 908）。
 *
 * 单位 PK 与攻城工具保留各自的可达性/建筑门禁，但每类伤害、单次总伤害和
 * 击数不再各写一套夹紧与取整。参数显式表达两处差异：
 * - `negativeAttack`：单位 PK 保留负攻击扣减，建筑伤害按 0 起算；
 * - `roundHp`：攻城工具先取整建筑生命值，单位 PK 使用原始生命值。
 */
const COMBAT_ABILITY_IGNORE_ARMOR = 1;
const COMBAT_ABILITY_RESIST_IGNORE_ARMOR = 2;
const ARMOR_IGNORE_CLASSES = ['近战', '穿刺'] as const;

/** 生效 combatAbility 是否带 bit 1（无视护甲）。 */
export function hasIgnoreArmor(ca?: number): boolean {
  return typeof ca === 'number' && Number.isFinite(ca) && ca >= 0 && (Math.trunc(ca) & COMBAT_ABILITY_IGNORE_ARMOR) !== 0;
}

/** 生效 combatAbility 是否带 bit 2（抵抗无视护甲）。 */
export function hasResistIgnoreArmor(ca?: number): boolean {
  return typeof ca === 'number' && Number.isFinite(ca) && ca >= 0 && (Math.trunc(ca) & COMBAT_ABILITY_RESIST_IGNORE_ARMOR) !== 0;
}

export interface IgnoreArmorEvaluation {
  active: boolean;
  resisted: boolean;
  applied: boolean;
  categories: ('近战' | '穿刺')[];
  armors: number[];
}

const INACTIVE_IGNORE_ARMOR: IgnoreArmorEvaluation = {
  active: false,
  resisted: false,
  applied: false,
  categories: [],
  armors: [],
};

/**
 * 唯一「无视护甲（bit 1 / bit 2）」判定函数：供 1v1、群战、混编、伤害拆解与结果说明行共用。
 * 在 categories 非空（攻方存在有限正近战/穿刺攻击）前提下，fighterCanAttack(attacker) 严格等价于 attacker.canAttack !== false。
 */
export function evaluateIgnoreArmor(
  attacker: { attack: Readonly<Record<string, number>>; combatAbility?: number; canAttack?: boolean },
  defender: { armor: Readonly<Record<string, number>>; combatAbility?: number },
): IgnoreArmorEvaluation {
  if (attacker.canAttack === false || !hasIgnoreArmor(attacker.combatAbility)) return INACTIVE_IGNORE_ARMOR;
  const categories: ('近战' | '穿刺')[] = [];
  const armors: number[] = [];
  for (const cat of ARMOR_IGNORE_CLASSES) {
    const atk = attacker.attack[cat];
    const arm = defender.armor[cat];
    if (typeof atk === 'number' && Number.isFinite(atk) && atk > 0 && typeof arm === 'number' && Number.isFinite(arm)) {
      categories.push(cat);
      armors.push(arm);
    }
  }
  if (!categories.length) return INACTIVE_IGNORE_ARMOR;
  const resisted = hasResistIgnoreArmor(defender.combatAbility);
  return { active: true, resisted, applied: !resisted, categories, armors };
}

/** 归约并夹紧额外伤害减免比例（属性 24）：仅有限正值生效，大于 1 夹紧至 1，其余归 0。 */
export function clampBonusDamageResistance(r?: number): number {
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? Math.min(1, r) : 0;
}

/** 格式化额外伤害减免百分比绝对值（去尾零，至多保留 1 位小数，如 25% / 40% / 0%）。 */
export function formatBdrPercent(r: number): string {
  const pct = Number((clampBonusDamageResistance(r) * 100).toFixed(1));
  return `${pct}%`;
}

/** 格式化带符号额外伤害减免（0% / -25% / -40%）。 */
export function formatBdrSigned(r: number): string {
  const clamped = clampBonusDamageResistance(r);
  return clamped > 0 ? `-${formatBdrPercent(clamped)}` : '0%';
}

/** 格式化额外伤害减免乘数余量（75% / 60% / 100%）。 */
export function formatBdrMultiplier(r: number): string {
  const clamped = clampBonusDamageResistance(r);
  const pct = Number(((1 - clamped) * 100).toFixed(1));
  return `${pct}%`;
}

export interface DamageRow {
  category: string;
  attack: number;
  armor: number;
  damage: number;
  /** 仅当本类别因「无视护甲」按 0 计护甲时设为 true；未无视行必须省略此键。 */
  ignored?: boolean;
  /** 仅当本非基础类别实际受额外伤害减免（属性 24）折减且折前非零时记录折前伤害；未折减行必须省略此键。 */
  rawDamage?: number;
  /** 仅当本非基础类别实际受额外伤害减免（属性 24）折减且折前非零时记录生效减免比例（0..1）；未折减行必须省略此键。 */
  bonusDamageReduction?: number;
}

export interface BonusDamageReductionEvaluation {
  /** 是否存在至少一行实际被额外伤害减免折减的非基础类别（含正负抵消场景） */
  active: boolean;
  /** 生效减免比例（0..1）；未激活时为 0 */
  rate: number;
  /** 实际被折减的非基础类别行（按原顺序） */
  reducedRows: (DamageRow & { rawDamage: number; bonusDamageReduction: number })[];
  /** 被折减行的折前合计 */
  rawBonusSum: number;
  /** 被折减行的折后合计 */
  reducedBonusSum: number;
  /** 是否存在被折减的负值额外伤害行 */
  hasNegativeBonus: boolean;
  /** 是否触发结果区/混编说明行（active 且折前合计 > 0，避免零抵消或无克制对阵刷屏） */
  netPositive: boolean;
}

const INACTIVE_BDR: BonusDamageReductionEvaluation = {
  active: false,
  rate: 0,
  reducedRows: [],
  rawBonusSum: 0,
  reducedBonusSum: 0,
  hasNegativeBonus: false,
  netPositive: false,
};

/** 唯一「额外伤害减免（属性 24）」展示判定纯函数：供结果说明行、逐击伤害拆解与混编共用。 */
export function evaluateBonusDamageReduction(rows: readonly DamageRow[]): BonusDamageReductionEvaluation {
  const reducedRows = rows.filter(
    (row): row is DamageRow & { rawDamage: number; bonusDamageReduction: number } =>
      row.bonusDamageReduction !== undefined && row.rawDamage !== undefined && row.bonusDamageReduction > 0,
  );
  if (!reducedRows.length) return INACTIVE_BDR;
  const rate = reducedRows[0]!.bonusDamageReduction;
  const rawBonusSum = reducedRows.reduce((sum, row) => sum + row.rawDamage, 0);
  const reducedBonusSum = reducedRows.reduce((sum, row) => sum + row.damage, 0);
  const hasNegativeBonus = reducedRows.some((row) => row.rawDamage < 0);
  return {
    active: true,
    rate,
    reducedRows,
    rawBonusSum,
    reducedBonusSum,
    hasNegativeBonus,
    netPositive: rawBonusSum > 1e-9,
  };
}

export interface DamageRowsOptions {
  /** true：max(min(0, attack), attack - armor)；false：max(0, attack - armor)。 */
  negativeAttack?: boolean;
  /** 缺少护甲类别时跳过（PK）还是列入 problems（攻城）。 */
  missingArmor?: 'skip' | 'error';
  /** PK 保留非有限值参与计算；默认把非有限值列入 problems。 */
  allowInvalid?: boolean;
  /** 本击被「无视护甲」按 0 计的护甲类别（仅近战/穿刺）。 */
  ignoredCategories?: ReadonlySet<string>;
  /** 守方额外伤害减免比例（属性 24，0..1）；仅有限正值生效，大于 1 夹紧至 1；缺省或 <= 0 与原行为一致。 */
  bonusDamageResistance?: number;
}

export interface DamageRowsResult {
  rows: DamageRow[];
  /** 按遍历顺序记录缺失/非有限类别；调用方可取第一条决定错误文案。 */
  problems: string[];
}

export function damageRows(
  attacks: Readonly<Record<string, number>>,
  armors: Readonly<Record<string, number>>,
  { negativeAttack = true, missingArmor = 'skip', allowInvalid = false, ignoredCategories, bonusDamageResistance }: DamageRowsOptions = {},
): DamageRowsResult {
  const rows: DamageRow[] = [];
  const problems: string[] = [];
  const bdr = clampBonusDamageResistance(bonusDamageResistance);
  for (const [category, attack] of Object.entries(attacks)) {
    if (!Number.isFinite(attack) && !allowInvalid) {
      problems.push(category);
      continue;
    }
    const armor = armors[category];
    if (armor === undefined) {
      if (missingArmor === 'error') problems.push(category);
      continue;
    }
    if (!Number.isFinite(armor) && !allowInvalid) {
      if (missingArmor === 'error') problems.push(category);
      continue;
    }
    const ignored = Boolean(ignoredCategories?.has(category));
    const effectiveArmor = ignored ? 0 : armor;
    const rawDamage = negativeAttack ? Math.max(Math.min(0, attack), attack - effectiveArmor) : Math.max(0, attack - effectiveArmor);
    const isBaseClass = category === '近战' || category === '穿刺';
    const bdrApplied = !isBaseClass && bdr > 0 && Number.isFinite(rawDamage) && rawDamage !== 0;
    const scaled = bdrApplied ? rawDamage * (1 - bdr) : rawDamage;
    const damage = Object.is(scaled, -0) ? 0 : scaled;
    rows.push({
      category,
      attack,
      armor,
      damage,
      ...(ignored ? { ignored: true } : {}),
      ...(bdrApplied ? { rawDamage, bonusDamageReduction: bdr } : {}),
    });
  }
  return { rows, problems };
}

/** 单次命中伤害；至少 1。 */
export const totalDamage = (rows: readonly DamageRow[], minimum = 1): number =>
  Math.max(
    minimum,
    rows.reduce((sum, row) => sum + row.damage, 0),
  );

export interface HitCountOptions {
  /** 攻城工具先 Math.round 建筑生命值；PK 用原始值。 */
  roundHp?: boolean;
  /** PK 的浮点容差 1e-9；攻城保持精确 0。 */
  epsilon?: number;
}

/** 击杀所需命中次数；每次伤害为 0/非正时返回 Infinity。 */
export function hitCount(hp: number, perHit: number, { roundHp = false, epsilon = 1e-9 }: HitCountOptions = {}): number {
  if (!(perHit > 0)) return Number.POSITIVE_INFINITY;
  const target = roundHp ? Math.round(hp) : hp;
  return Math.ceil(target / perHit - epsilon);
}
