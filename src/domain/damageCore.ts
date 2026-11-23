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
  return typeof ca === 'number' && Number.isFinite(ca) && (Math.trunc(ca) & COMBAT_ABILITY_IGNORE_ARMOR) !== 0;
}

/** 生效 combatAbility 是否带 bit 2（抵抗无视护甲）。 */
export function hasResistIgnoreArmor(ca?: number): boolean {
  return typeof ca === 'number' && Number.isFinite(ca) && (Math.trunc(ca) & COMBAT_ABILITY_RESIST_IGNORE_ARMOR) !== 0;
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

export interface DamageRow {
  category: string;
  attack: number;
  armor: number;
  damage: number;
  /** 仅当本类别因「无视护甲」按 0 计护甲时设为 true；未无视行必须省略此键。 */
  ignored?: boolean;
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
}

export interface DamageRowsResult {
  rows: DamageRow[];
  /** 按遍历顺序记录缺失/非有限类别；调用方可取第一条决定错误文案。 */
  problems: string[];
}

export function damageRows(
  attacks: Readonly<Record<string, number>>,
  armors: Readonly<Record<string, number>>,
  { negativeAttack = true, missingArmor = 'skip', allowInvalid = false, ignoredCategories }: DamageRowsOptions = {},
): DamageRowsResult {
  const rows: DamageRow[] = [];
  const problems: string[] = [];
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
    rows.push({
      category,
      attack,
      armor,
      damage: negativeAttack ? Math.max(Math.min(0, attack), attack - effectiveArmor) : Math.max(0, attack - effectiveArmor),
      ...(ignored ? { ignored: true } : {}),
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
