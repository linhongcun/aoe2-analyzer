import type { Cost, StatSet, Unit } from './types';
import { damageRows, totalDamage } from './damageCore';

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

export function fighterFrom(u: Unit, S: StatSet): Fighter {
  const pierce = u.atks.some(([n]) => n === '穿刺') || (!u.atks.some(([n]) => n === '近战') && u.rng > 1);
  const attack: Record<string, number> = { [pierce ? '穿刺' : '近战']: S.atk };
  Object.entries(S.bonus).forEach(([k, v]) => (attack[k] = v));
  const armor: Record<string, number> = { 近战: S.ma, 穿刺: S.pa };
  Object.entries(S.armc).forEach(([k, v]) => (armor[k] = v));
  return {
    name: u.zh,
    hp: S.hp,
    attack,
    armor,
    rof: S.rof,
    acc: Math.min(100, Math.max(0, S.acc)) / 100,
    ranged: u.rng > 1,
    rng: S.rng,
    cost: u.cost,
    contact: {
      radiusX: u.collisionRadiusX,
      radiusY: u.collisionRadiusY,
      speed: S.spd,
      minRange: S.minr,
      firstHitDelay: u.attackDelaySeconds ?? 0,
      repeatableAttack: u.atks.some(([, n]) => n > 0),
    },
  };
}

/** 本场匹配的攻击类别；计算和展示共用，保留零伤害及负攻击的扣减。 */
export function damageByClass(a: Pick<Fighter, 'attack'>, d: Pick<Fighter, 'armor'>) {
  // Fandom「Armor class」第 2 步：Damage1_i = max(min(0, Atk_i), Atk_i − Arm_i)（负攻击如对村民 −3 会扣减）
  return damageRows(a.attack, d.armor, { allowInvalid: true }).rows;
}
/** 单次命中伤害（不含命中率） */
export function damagePerHit(a: Pick<Fighter, 'attack'>, d: Pick<Fighter, 'armor'>): number {
  return totalDamage(damageByClass(a, d));
}
/** 期望每次攻击伤害（远程乘命中率；近战命中率视为 100%） */
export const expectedHit = (a: Fighter, d: Fighter) => damagePerHit(a, d) * (a.ranged ? a.acc : 1);
