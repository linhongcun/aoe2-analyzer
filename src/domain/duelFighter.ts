import type { Cost, StatSet, Unit } from './types';
import { damageRows, evaluateIgnoreArmor, totalDamage } from './damageCore';

export type AccuracyMode = 'catalog' | 'assume-hit';

export interface Fighter {
  name: string;
  hp: number;
  /** 攻击类别 → 数值（含主攻击 近战/穿刺） */
  attack: Record<string, number>;
  /** 护甲类别 → 数值（含 近战/穿刺） */
  armor: Record<string, number>;
  /** 攻击间隔（秒） */
  rof: number;
  /** 命中率 0..1 */
  acc: number;
  /** 是否具备普通攻击能力；缺省按 attack 是否非空推导，以兼容手构测试对象。 */
  canAttack?: boolean;
  /** 远程命中口径：'assume-hit' 表示目录准确度 0% 的特殊远程攻击按每次主弹命中主目标估算。 */
  accuracyMode?: AccuracyMode;
  /** 生效 combatAbility（属性 63）位掩码；缺省按 0 计以兼容手构测试对象。 */
  combatAbility?: number;
  /** 额外伤害减免比例（属性 24，0..1）；缺省按 0 计以兼容手构测试对象。 */
  bonusDamageResistance?: number;
  ranged: boolean;
  rng: number;
  cost: Cost;
  /** 群战输入。单挑仍使用原始的同时起手模型。 */
  contact?: {
    radiusX?: number;
    radiusY?: number;
    speed: number;
    minRange: number;
    firstHitDelay: number;
    repeatableAttack: boolean;
  };
}

/** 目录单位是否具备普通攻击能力（与群战 repeatableAttack 同源）。 */
export function unitHasNormalAttack(u: Pick<Unit, 'atks'>): boolean {
  return u.atks.some(([, n]) => n > 0);
}

/** 无普通攻击的僧侣类施法单位（僧侣 125、传教士 775），用于补充招降与治疗未计入提示。 */
export function unitIsNonAttackingCaster(u: Pick<Unit, 'atks' | 'armc'>): boolean {
  return !unitHasNormalAttack(u) && u.armc.some(([n]) => n === '僧侣');
}

/** 参战对象是否具备普通攻击能力。 */
export function fighterCanAttack(f: Pick<Fighter, 'canAttack' | 'attack' | 'contact'>): boolean {
  if (f.canAttack !== undefined) return f.canAttack;
  if (f.contact?.repeatableAttack === false && !Object.values(f.attack).some((n) => n > 0)) return false;
  return Object.keys(f.attack).length > 0;
}

/** 参战对象是否采用「目录准确度 0% → 按每击命中估算」口径。 */
export function fighterUsesAssumeHit(f: Pick<Fighter, 'canAttack' | 'attack' | 'contact' | 'ranged' | 'accuracyMode'>): boolean {
  return fighterCanAttack(f) && f.ranged && f.accuracyMode === 'assume-hit';
}

/** 主攻击类别：先非零（近战优先于穿刺），次显式零值（近战优先于穿刺），兜底按射程判定。 */
export function mainAttackType(u: Pick<Unit, 'atks' | 'rng'>): '近战' | '穿刺' {
  const hasNonZero = (name: '近战' | '穿刺') => u.atks.some(([n, v]) => n === name && v !== 0);
  if (hasNonZero('近战')) return '近战';
  if (hasNonZero('穿刺')) return '穿刺';
  const hasAny = (name: '近战' | '穿刺') => u.atks.some(([n]) => n === name);
  if (hasAny('近战')) return '近战';
  if (hasAny('穿刺')) return '穿刺';
  return u.rng > 1 ? '穿刺' : '近战';
}

export function fighterFrom(u: Unit, S: StatSet): Fighter {
  const canAttack = unitHasNormalAttack(u);
  const attack: Record<string, number> = {};
  if (canAttack) {
    const main = mainAttackType(u);
    attack[main] = S.atk;
    const secondaryName = main === '近战' ? '穿刺' : '近战';
    const secondary = u.atks.find(([n]) => n === secondaryName);
    if (secondary) attack[secondaryName] = secondary[1];
    Object.entries(S.bonus).forEach(([k, v]) => (attack[k] = v));
  }
  const armor: Record<string, number> = { 近战: S.ma, 穿刺: S.pa };
  Object.entries(S.armc).forEach(([k, v]) => (armor[k] = v));
  const clampedAcc = Math.min(100, Math.max(0, S.acc));
  const accuracyMode: AccuracyMode = canAttack && u.rng > 1 && u.acc === 0 && clampedAcc === 0 ? 'assume-hit' : 'catalog';
  return {
    name: u.zh,
    hp: S.hp,
    attack,
    armor,
    rof: S.rof,
    acc: clampedAcc / 100,
    canAttack,
    accuracyMode,
    combatAbility: S.ca,
    bonusDamageResistance: S.bdr,
    ranged: u.rng > 1,
    rng: S.rng,
    cost: u.cost,
    contact: {
      radiusX: u.collisionRadiusX,
      radiusY: u.collisionRadiusY,
      speed: S.spd,
      minRange: S.minr,
      firstHitDelay: u.attackDelaySeconds ?? 0,
      repeatableAttack: canAttack,
    },
  };
}

/** 本场匹配的攻击类别；计算和展示共用，保留零伤害、负攻击扣减及额外伤害减免（属性 24）。 */
export function damageByClass(
  a: Pick<Fighter, 'attack' | 'canAttack' | 'contact' | 'combatAbility'>,
  d: Pick<Fighter, 'armor' | 'combatAbility' | 'bonusDamageResistance'>,
) {
  if (!fighterCanAttack(a)) return [];
  const ignoreArmor = evaluateIgnoreArmor(a, d);
  // Fandom「Armor class」第 2–3 步：先同类相减，再对全部非基础类别统一乘 (1 - bdr)
  return damageRows(a.attack, d.armor, {
    allowInvalid: true,
    ...(ignoreArmor.applied ? { ignoredCategories: new Set(ignoreArmor.categories) } : {}),
    ...(d.bonusDamageResistance !== undefined ? { bonusDamageResistance: d.bonusDamageResistance } : {}),
  }).rows;
}
/** 单次命中伤害（不含命中率）；无普通攻击返回 0。 */
export function damagePerHit(
  a: Pick<Fighter, 'attack' | 'canAttack' | 'contact' | 'combatAbility'>,
  d: Pick<Fighter, 'armor' | 'combatAbility' | 'bonusDamageResistance'>,
): number {
  if (!fighterCanAttack(a)) return 0;
  return totalDamage(damageByClass(a, d));
}
/** 期望每次攻击伤害（无普通攻击为 0；近战与目录 0% 特殊远程按每击命中估算；常规远程乘命中率）。 */
export function expectedHit(a: Fighter, d: Fighter): number {
  if (!fighterCanAttack(a)) return 0;
  const dmg = damagePerHit(a, d);
  if (!a.ranged || a.accuracyMode === 'assume-hit') return dmg;
  return dmg * a.acc;
}
