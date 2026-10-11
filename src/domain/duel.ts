/**
 * 单位 PK 战斗引擎（纯函数）。
 * 来源：https://ageofempires.fandom.com/wiki/Armor_class_(Age_of_Empires_II) ，https://ugc.aoe2.rocks/general/damage_calculation/
 * 伤害公式（AoE2）：每次命中伤害 = max(1, Σ_c max(0, 攻击_c − 护甲_c))，
 *   c 遍历攻击方的全部攻击类别（近战/穿刺主攻击 + 各类克制加成），且仅当防守方拥有该护甲类别时计入。
 * 近似：首次攻击在 t=0 发生（无出手前摇数据）；远程按命中率取期望；忽略射程、走位、地形、冲锋攻击与特殊能力。
 */
import type { Cost, StatSet, Unit } from './types';

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
}

export function fighterFrom(u: Unit, S: StatSet): Fighter {
  const pierce = u.atks.some(([n]) => n === '穿刺') || (!u.atks.some(([n]) => n === '近战') && u.rng > 1);
  const attack: Record<string, number> = { [pierce ? '穿刺' : '近战']: S.atk };
  Object.entries(S.bonus).forEach(([k, v]) => (attack[k] = v));
  const armor: Record<string, number> = { 近战: S.ma, 穿刺: S.pa };
  u.armc.forEach(([k, v]) => (armor[k] = v));
  return { name: u.zh, hp: S.hp, attack, armor, rof: S.rof, acc: Math.min(100, Math.max(0, S.acc)) / 100, ranged: u.rng > 1, rng: S.rng, cost: u.cost };
}

/** 单次命中伤害（不含命中率） */
export function damagePerHit(a: Pick<Fighter, 'attack'>, d: Pick<Fighter, 'armor'>): number {
  let sum = 0;
  // Fandom「Armor class」第 2 步：Damage1_i = max(min(0, Atk_i), Atk_i − Arm_i)（负攻击如对村民 −3 会扣减）
  for (const [c, v] of Object.entries(a.attack)) if (c in d.armor) sum += Math.max(Math.min(0, v), v - d.armor[c]!);
  return Math.max(1, sum);
}
/** 期望每次攻击伤害（远程乘命中率；近战命中率视为 100%） */
export const expectedHit = (a: Fighter, d: Fighter) => damagePerHit(a, d) * (a.ranged ? a.acc : 1);

export interface OneWay {
  dmg: number;
  expDmg: number;
  hits: number;
  /** 击杀耗时（秒）：首击在 t=0，此后每 rof 一次；rof≤0 时为 null */
  time: number | null;
  /** 每秒伤害；rof≤0（爆炸单位等）时为 null，禁止 Infinity */
  dps: number | null;
  /** dps 无法计算时的原因文案 */
  dpsReason?: string;
}
export const DPS_UNAVAILABLE_REASON = '爆炸单位，无攻击间隔';
export function oneWay(a: Fighter, d: Fighter): OneWay {
  const dmg = damagePerHit(a, d),
    expDmg = expectedHit(a, d);
  const hits = expDmg > 0 ? Math.ceil(d.hp / expDmg - 1e-9) : Infinity;
  if (!(a.rof > 0)) {
    // 自爆等无攻击间隔：可算单次伤害，但 DPS/持续击杀时间无意义
    return {
      dmg,
      expDmg,
      hits: Number.isFinite(hits) ? hits : 0,
      time: hits <= 1 ? 0 : null,
      dps: null,
      dpsReason: DPS_UNAVAILABLE_REASON,
    };
  }
  return { dmg, expDmg, hits, time: (hits - 1) * a.rof, dps: expDmg / a.rof };
}

export interface DuelResult {
  ab: OneWay;
  ba: OneWay;
  /** 'a' | 'b' | 'draw'（同时击杀） */
  winner: 'a' | 'b' | 'draw';
  /** 胜者剩余生命 */
  remaining: number;
  /** 战斗时长 */
  duration: number;
}
/** 1v1：双方同时开始攻击 */
export function duel(a: Fighter, b: Fighter): DuelResult {
  const ab = oneWay(a, b),
    ba = oneWay(b, a);
  const tA = ab.time ?? Number.POSITIVE_INFINITY,
    tB = ba.time ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(tA) && !Number.isFinite(tB)) return { ab, ba, winner: 'draw', remaining: 0, duration: 0 };
  if (Math.abs(tA - tB) < 1e-9) return { ab, ba, winner: 'draw', remaining: 0, duration: Number.isFinite(tA) ? tA : 0 };
  const aWins = tA < tB;
  const [w, l, T] = aWins ? [a, ba, tA] : [b, ab, tB];
  const foeRof = aWins ? b.rof : a.rof;
  const hitsTaken = foeRof > 0 ? Math.floor(T / foeRof - 1e-9) + 1 : l.hits > 0 ? 1 : 0;
  const remaining = Math.max(0, w.hp - Math.min(hitsTaken, l.hits) * l.expDmg);
  return { ab, ba, winner: aWins ? 'a' : 'b', remaining: Math.round(remaining * 10) / 10, duration: T };
}

export interface GroupResult {
  winner: 'a' | 'b' | 'draw';
  aAlive: number;
  bAlive: number;
  /** 胜方剩余总生命 */
  hpLeft: number;
  duration: number;
  /** 采样：[t, A 存活数, B 存活数] */
  timeline: [number, number, number][];
}
/**
 * N vs M：离散事件模拟。集火（所有单位攻击对方队列中第一个存活单位），
 * 首击 t=0；同一时刻的伤害同时结算（因此可能产生过量伤害 overkill，与实战相近）。
 * 远程按命中率取期望伤害。忽略近战单位的包围/空间限制。
 */
export function groupFight(a: Fighter, na: number, b: Fighter, nb: number, maxT = 600): GroupResult {
  const A = Array.from({ length: na }, () => a.hp),
    B = Array.from({ length: nb }, () => b.hp);
  const dA = expectedHit(a, b),
    dB = expectedHit(b, a);
  let t = 0,
    nextA = 0,
    nextB = 0;
  const alive = (X: number[]) => X.filter((h) => h > 1e-9).length;
  const timeline: [number, number, number][] = [[0, na, nb]];
  while (alive(A) && alive(B) && t <= maxT) {
    t = Math.min(nextA, nextB);
    const aAtk = Math.abs(t - nextA) < 1e-9,
      bAtk = Math.abs(t - nextB) < 1e-9;
    const nA = alive(A),
      nB = alive(B);
    // 同时结算：先算出双方本轮伤害，再施加
    const hitB = aAtk ? nA : 0,
      hitA = bAtk ? nB : 0;
    const apply = (X: number[], n: number, d: number) => {
      // 集火：每一击都打向当前（伤害施加前）第一个存活目标；伤害施加时若目标已死则转移到下一个（overkill 只在同一单位最后一击内产生）
      for (let i = 0; i < n; i++) {
        const j = X.findIndex((h) => h > 1e-9);
        if (j < 0) break;
        X[j]! -= d;
      }
    };
    if (hitB) apply(B, hitB, dA);
    if (hitA) apply(A, hitA, dB);
    if (aAtk) nextA += a.rof > 0 ? a.rof : maxT + 1;
    if (bAtk) nextB += b.rof > 0 ? b.rof : maxT + 1;
    timeline.push([Math.round(t * 100) / 100, alive(A), alive(B)]);
  }
  const aAlive = alive(A),
    bAlive = alive(B);
  const winner = aAlive && !bAlive ? 'a' : bAlive && !aAlive ? 'b' : 'draw';
  const hpLeft = (winner === 'a' ? A : winner === 'b' ? B : []).filter((h) => h > 0).reduce((s, h) => s + h, 0);
  return { winner, aAlive, bAlive, hpLeft: Math.round(hpLeft), duration: t, timeline };
}

export const costSum = (c: Cost) => Object.values(c).reduce((s, v) => s + (v ?? 0), 0);
/** 等资源：预算内可生产的数量（资源总和；未计文明折扣） */
export const countForBudget = (c: Cost, budget: number) => Math.max(1, Math.floor(budget / Math.max(1, costSum(c))));
