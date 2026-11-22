import type { Fighter } from './duelFighter';

export const FIGHT_CAP = 200;
export const FIGHT_TIME = 600;
export const EVENT_CAP = 20_000;
export const ATTACK_CAP = 1_000_000;
const EPS = 1e-9;

export interface ArmyRow {
  uid: number;
  count: number;
  fighter: Fighter;
}
export interface ArmyLoss {
  uid: number;
  initial: number;
  lost: number;
  alive: number;
  hp: number;
}
export interface ArmyResult {
  rows: ArmyLoss[];
  total: Omit<ArmyLoss, 'uid'>;
}

export function contactFighterError(f: Fighter): string | null {
  if (f.canAttack === false || f.contact?.repeatableAttack === false || f.rof <= 0 || !Object.values(f.attack).some((n) => n > 0))
    return '没有可重复的普通攻击。请更换该单位后重算。';
  if (!f.contact) return '缺少有效碰撞数据';
  const { radiusX, radiusY, speed, minRange, firstHitDelay } = f.contact;
  if (radiusX === undefined || radiusY === undefined || !(radiusX > 0 && radiusY > 0) || !Number.isFinite(8 * radiusX) || !Number.isFinite(30 * radiusY))
    return '缺少有效碰撞数据';
  if (
    ![f.hp, f.rof, f.acc, f.rng, speed, minRange, firstHitDelay, ...Object.values(f.attack), ...Object.values(f.armor)].every(Number.isFinite) ||
    f.hp <= EPS ||
    f.acc < 0 ||
    f.acc > 1 ||
    f.rng < 0 ||
    minRange < 0 ||
    minRange > f.rng ||
    firstHitDelay < 0
  )
    return '战斗属性无效';
  return null;
}

export function validateContactInputs(a: readonly ArmyRow[], b: readonly ArmyRow[], maxTime: number, maxEvents: number, maxAttacks: number): string | null {
  if (!Number.isFinite(maxTime) || maxTime < 0 || maxTime > FIGHT_TIME) return '模拟时限无效';
  if (
    !Number.isSafeInteger(maxEvents) ||
    maxEvents < 1 ||
    maxEvents > EVENT_CAP ||
    !Number.isSafeInteger(maxAttacks) ||
    maxAttacks < 1 ||
    maxAttacks > ATTACK_CAP
  )
    return '运算资源上限无效';
  for (const [side, army] of [
    ['A', a],
    ['B', b],
  ] as const) {
    if (!army.length || army.length > 3) return `${side} 方须有 1–3 行`;
    if (new Set(army.map((r) => r.uid)).size !== army.length) return `${side} 方有重复单位`;
    if (army.some((r) => !Number.isSafeInteger(r.uid) || r.uid <= 0 || !Number.isSafeInteger(r.count) || r.count < 1)) return `${side} 方单位或数量无效`;
    if (army.reduce((s, r) => s + r.count, 0) > FIGHT_CAP) return `${side} 方超过每方 ${FIGHT_CAP} 个单位的模拟上限。请调低数量、预算或采集时间后重算。`;
    for (const row of army) {
      const reason = contactFighterError(row.fighter);
      if (reason) return `${side} 方的${row.fighter.name}${reason}`;
    }
    if (!Number.isFinite(army.reduce((sum, row) => sum + row.count * row.fighter.hp, 0))) return `${side} 方总生命超出数值范围`;
  }
  return null;
}

export function summarizeArmy(rows: readonly { uid: number; count: number; alive: number; headHp: number; fighter: Fighter }[]): ArmyResult {
  const values = rows.map((r) => ({
    uid: r.uid,
    initial: r.count,
    lost: r.count - r.alive,
    alive: r.alive,
    hp: r.alive ? r.headHp + (r.alive - 1) * r.fighter.hp : 0,
  }));
  return {
    rows: values,
    total: values.reduce((s, r) => ({ initial: s.initial + r.initial, lost: s.lost + r.lost, alive: s.alive + r.alive, hp: s.hp + r.hp }), {
      initial: 0,
      lost: 0,
      alive: 0,
      hp: 0,
    }),
  };
}

export function meleeAcross(row: { radiusY: number }, target: { alive: number; radiusY: number }): number {
  return Math.max(1, Math.floor((Math.sqrt(target.alive) * target.radiusY) / row.radiusY + EPS));
}

export function applyVolleyAttacks<R extends { alive: number; headHp: number; minRange: number; fighter: Fighter }>(
  shots: readonly (readonly { count: number; distance: number; minDist: number }[])[],
  sourceRows: readonly R[],
  targetRows: readonly R[],
  targetSetback: readonly number[],
  damage: readonly (readonly number[])[],
): void {
  let to = 0;
  attackRows: for (const [from, ranks] of shots.entries()) {
    const attacker = sourceRows[from]!;
    for (const { count, distance, minDist } of ranks) {
      for (let n = 0; n < count; n++) {
        while (targetRows[to] && !targetRows[to]!.alive) to++;
        const row = targetRows[to];
        if (!row) return;
        const targetDistance = distance + targetSetback[to]!;
        const targetMinDistance = minDist + targetSetback[to]!;
        if (targetDistance - attacker.fighter.rng > EPS || targetMinDistance + EPS < attacker.minRange) continue attackRows;
        const hit = damage[from]![to]!;
        if (!hit) continue attackRows;
        row.headHp -= hit;
        if (row.headHp <= EPS) {
          row.alive--;
          row.headHp = row.fighter.hp;
        }
      }
    }
  }
}
