/**
 * 单位 PK 战斗引擎（纯函数）。
 * 来源：https://ageofempires.fandom.com/wiki/Armor_class_(Age_of_Empires_II) ，https://ugc.aoe2.rocks/general/damage_calculation/
 * 伤害公式（AoE2）：每次命中伤害 = max(1, Σ_c max(min(0, 攻击_c), 攻击_c − 护甲_c))，
 *   c 遍历攻击方的全部攻击类别（近战/穿刺主攻击 + 各类克制加成），且仅当防守方拥有该护甲类别时计入。
 *   所有匹配类别贡献非负时，本场可等价简化为 max(1, Σ_c max(0, 攻击_c − 护甲_c))。
 * 近似：首次攻击在 t=0 发生（无出手前摇数据）；远程按命中率取期望；忽略射程、走位、地形、冲锋攻击与特殊能力。
 */
import type { Cost } from './types';
import { hitCount } from './damageCore';
import { damagePerHit, expectedHit, fighterCanAttack, type Fighter } from './duelFighter';
import { contactFight, contactFighterError, FIGHT_TIME, type ContactSummary, type FightEnd, type Timeline } from './contactFight';
import type { KiteOptions } from './contactKite';
import type { ContactReplayTrace } from './contactReplayTrace';

export {
  damageByClass,
  damagePerHit,
  expectedHit,
  fighterCanAttack,
  fighterFrom,
  fighterUsesAssumeHit,
  unitHasNormalAttack,
  unitIsNonAttackingCaster,
  type Fighter,
} from './duelFighter';

export interface OneWay {
  /** 攻击方是否具备普通攻击能力 */
  canAttack: boolean;
  dmg: number;
  expDmg: number;
  hits: number;
  /** 击杀耗时（秒）：首击在 t=0，此后每 rof 一次；无普通攻击或 rof≤0 时为 null */
  time: number | null;
  /** 每秒伤害；无普通攻击或 rof≤0（爆炸单位等）时为 null，禁止 Infinity */
  dps: number | null;
  /** dps 无法计算时的原因文案（仅自爆等有普通攻击但无攻击间隔时设置） */
  dpsReason?: string;
}
export const DPS_UNAVAILABLE_REASON = '爆炸单位，无攻击间隔';
export const NO_NORMAL_ATTACK_REASON = '无普通攻击';

export function oneWay(a: Fighter, d: Fighter): OneWay {
  if (!fighterCanAttack(a)) {
    return { canAttack: false, dmg: 0, expDmg: 0, hits: Number.POSITIVE_INFINITY, time: null, dps: null };
  }
  const dmg = damagePerHit(a, d),
    expDmg = expectedHit(a, d);
  const hits = hitCount(d.hp, expDmg);
  if (!(a.rof > 0)) {
    // 自爆等无攻击间隔：可算单次伤害，但 DPS/持续击杀时间无意义
    return {
      canAttack: true,
      dmg,
      expDmg,
      hits: Number.isFinite(hits) ? hits : 0,
      // 单发自爆击杀也不显示 0s：击杀用时统一为 null（UI 显示「—」）
      time: null,
      dps: null,
      dpsReason: DPS_UNAVAILABLE_REASON,
    };
  }
  return { canAttack: true, dmg, expDmg, hits, time: (hits - 1) * a.rof, dps: expDmg / a.rof };
}

export type DuelOutcome = 'win' | 'draw' | 'both-no-attack' | 'no-kill';

export interface DuelResult {
  ab: OneWay;
  ba: OneWay;
  /** 'a' | 'b' | 'draw'（同时击杀或无法分出胜负；细分子状态见 outcome） */
  winner: 'a' | 'b' | 'draw';
  /** 1v1 结算状态：win / draw（同时击杀）/ both-no-attack / no-kill（双方均无法完成击杀） */
  outcome: DuelOutcome;
  /** 胜者剩余生命 */
  remaining: number;
  /** 战斗时长 */
  duration: number;
}
/** 1v1：双方同时开始攻击 */
export function duel(a: Fighter, b: Fighter): DuelResult {
  const ab = oneWay(a, b),
    ba = oneWay(b, a);
  if (!ab.canAttack && !ba.canAttack) return { ab, ba, winner: 'draw', outcome: 'both-no-attack', remaining: 0, duration: 0 };
  // 判定胜负时，单发即可击杀的自爆单位视为 0 时刻击杀（显示仍为「—」）
  const tOf = (o: OneWay) => (o.canAttack ? (o.time ?? (o.dpsReason && o.hits === 1 ? 0 : Number.POSITIVE_INFINITY)) : Number.POSITIVE_INFINITY);
  const tA = tOf(ab),
    tB = tOf(ba);
  if (!Number.isFinite(tA) && !Number.isFinite(tB)) return { ab, ba, winner: 'draw', outcome: 'no-kill', remaining: 0, duration: 0 };
  if (Math.abs(tA - tB) < 1e-9) return { ab, ba, winner: 'draw', outcome: 'draw', remaining: 0, duration: tA };
  const aWins = tA < tB;
  const [w, l, T] = aWins ? [a, ba, tA] : [b, ab, tB];
  const foeRof = aWins ? b.rof : a.rof;
  const hitsTaken = !l.canAttack ? 0 : foeRof > 0 ? Math.floor(T / foeRof - 1e-9) + 1 : l.hits > 0 ? 1 : 0;
  const remaining = Math.max(0, w.hp - Math.min(hitsTaken, l.hits) * l.expDmg);
  return { ab, ba, winner: aWins ? 'a' : 'b', outcome: 'win', remaining: Math.round(remaining * 10) / 10, duration: T };
}

export type OneVOneResult =
  | {
      mode: 'contact';
      ab: OneWay;
      ba: OneWay;
      status: FightEnd;
      winner: 'a' | 'b' | 'draw' | null;
      duration: number;
      remaining: number;
      aHp: number;
      bHp: number;
      contact: ContactSummary;
      replay?: ContactReplayTrace;
    }
  | (DuelResult & {
      mode: 'static-fallback';
      fallbackReason: string;
    });

export interface GroupFightOptions {
  maxTime?: number;
  recordReplay?: boolean;
  kite?: KiteOptions;
}

function cleanContactReason(raw: string): string {
  return raw
    .replace(/。?请更换该单位后重算。?$/u, '')
    .replace(/。?请调低数量、预算或采集时间后重算。?$/u, '')
    .replace(/。+$/u, '');
}

/** #/duel 1v1 同源入口：可碰撞单位统一走 contactFight(1 vs 1)，缺碰撞或无普攻单位透传 duel() 优雅降级。 */
export function oneVOneFight(a: Fighter, b: Fighter, options: GroupFightOptions = {}): OneVOneResult {
  const errA = contactFighterError(a);
  const errB = contactFighterError(b);
  if (errA !== null || errB !== null) {
    const parts: string[] = [];
    if (errA !== null) parts.push(`A 方的${a.name}${cleanContactReason(errA)}`);
    if (errB !== null) parts.push(`B 方的${b.name}${cleanContactReason(errB)}`);
    return {
      ...duel(a, b),
      mode: 'static-fallback',
      fallbackReason: `${parts.join('，')}，无法按一维接敌模型生成逐秒轨迹；下方保留原有 1v1 静态伤害与击杀对照结果。`,
    };
  }
  const result = contactFight([{ uid: 1, count: 1, fighter: a }], [{ uid: 2, count: 1, fighter: b }], {
    maxTime: options.maxTime ?? FIGHT_TIME,
    recordReplay: options.recordReplay ?? true,
    ...(options.kite ? { kite: options.kite } : {}),
  });
  if (result.status === 'error') {
    const cause = cleanContactReason(result.reason);
    return {
      ...duel(a, b),
      mode: 'static-fallback',
      fallbackReason: `${cause}，无法按一维接敌模型生成逐秒轨迹；下方保留原有 1v1 静态伤害与击杀对照结果。`,
    };
  }
  const ab = oneWay(a, b);
  const ba = oneWay(b, a);
  const winner = result.status === 'win' ? result.winner : result.status === 'draw' ? 'draw' : null;
  const aHp = result.a.total.hp;
  const bHp = result.b.total.hp;
  const remaining = winner === 'a' ? aHp : winner === 'b' ? bHp : 0;
  return {
    mode: 'contact',
    ab,
    ba,
    status: result.status,
    winner,
    duration: result.duration,
    remaining,
    aHp,
    bHp,
    contact: result.contact,
    ...(result.replay ? { replay: result.replay } : {}),
  };
}

export type GroupResult =
  | {
      status: FightEnd;
      winner: 'a' | 'b' | 'draw' | null;
      aAlive: number;
      bAlive: number;
      hpLeft: number;
      duration: number;
      timeline: Timeline;
      contact: ContactSummary;
      replay?: ContactReplayTrace;
    }
  | { status: 'error'; reason: string; winner: null };

export type GroupOutcome = Exclude<GroupResult, { status: 'error' }>;

/** 群战和混编共用接敌、前排容量与同刻伤害结算。 */
export function groupFight(a: Fighter, na: number, b: Fighter, nb: number, maxTimeOrOptions: number | GroupFightOptions = FIGHT_TIME): GroupResult {
  const opts: GroupFightOptions = typeof maxTimeOrOptions === 'number' ? { maxTime: maxTimeOrOptions } : maxTimeOrOptions;
  const result = contactFight([{ uid: 1, count: na, fighter: a }], [{ uid: 1, count: nb, fighter: b }], {
    maxTime: opts.maxTime ?? FIGHT_TIME,
    recordReplay: opts.recordReplay ?? false,
    ...(opts.kite ? { kite: opts.kite } : {}),
  });
  if (result.status === 'error') return { ...result, winner: null };
  const winner = result.status === 'win' ? result.winner : result.status === 'draw' ? 'draw' : null;
  return {
    status: result.status,
    winner,
    aAlive: result.a.total.alive,
    bAlive: result.b.total.alive,
    hpLeft: winner === 'a' || winner === 'b' ? result[winner].total.hp : 0,
    duration: result.duration,
    timeline: result.timeline,
    contact: result.contact,
    ...(result.replay ? { replay: result.replay } : {}),
  };
}

export const costSum = (c: Cost) => Object.values(c).reduce((s, v) => s + (v ?? 0), 0);
/** 等资源：预算内可生产的数量（食物、木材、黄金、石料 1:1 相加后下取整，至少 1）。调用方传入 unitCost 的显示价。 */
export const countForBudget = (c: Cost, budget: number) => Math.max(1, Math.floor(budget / Math.max(1, costSum(c))));
