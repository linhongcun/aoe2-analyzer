import { contactFighterError } from './contactValidate';
import type { Fighter } from './duelFighter';

export const RETREAT_CAP = 40;
export const MIN_RANGE_BUFFER = 0.02;
export const CHASE_MARGIN = 0.02;
const EPS = 1e-9;

export interface KiteOptions {
  a?: boolean;
  b?: boolean;
}

export interface SideKiteSummary {
  enabled: boolean;
  triggered: boolean;
  retreated: number;
  retreatCap: number;
  capHit: boolean;
  capHitAt: number | null;
  /** 首次触底时的世界坐标；仅在 recordReplay: true 时填充，否则为 null。 */
  capHitX: number | null;
  activatedAt: number | null;
  clearedFrontNames: string[];
  rangedName: string;
  attackDelaySeconds: number;
  moveWindowSeconds: number;
  hadMeleeFront: boolean;
}

export interface KiteSummary {
  a: SideKiteSummary;
  b: SideKiteSummary;
  disengagedAt: number | null;
}

/** 统一远程拉扯准入事实源：过滤近战与无普攻远程单位（如僧侣 125 / 传教士 775）。 */
export function isKiteEligible(fighter: Fighter): boolean {
  return fighter.ranged && contactFighterError(fighter) === null;
}

export interface KiteAttackClock {
  aimAt: number | null;
  cycleStart: number;
  cycles: number;
}

export interface KiteRowState {
  index: number;
  count: number;
  alive: number;
  speed: number;
  minRange: number;
  delay: number;
  fighter: Fighter;
  canFightAtMultipleDepths: boolean;
  clocks: KiteAttackClock[];
}

export interface KiteFormation {
  rows: readonly KiteRowState[];
  front: KiteRowState;
}

export interface KiteRuntime {
  enabled: boolean;
  retreated: number;
  capHit: boolean;
  capHitAt: number | null;
  capHitX: number | null;
  retreatUntil: number | null;
  escapingMinRange: boolean;
  engaged: boolean;
  activatedAt: number | null;
  hadMeleeFront: boolean;
  firstRangedIdx: number;
  triggered: boolean;
  lastFrontIdx: number;
  kitedRangedNames: string[];
  primaryDelay: number;
  primaryMoveWindow: number;
  hasPrimary: boolean;
}

export interface KiteStep {
  vxA: number;
  vxB: number;
  gapRate: number;
  closingSpeed: number;
  openingSpeed: number;
  retA: boolean;
  retB: boolean;
  escA: boolean;
  escB: boolean;
  escTargetA: number;
  escTargetB: number;
  advStopA: number;
  advStopB: number;
  bothEngaged: boolean;
  aFrontMoving: boolean;
  bFrontMoving: boolean;
}

export const moveWindow = (row: KiteRowState) => Math.max(0, row.fighter.rof - row.delay);

export function createKiteRuntime(enabled: boolean, rows: readonly KiteRowState[]): KiteRuntime {
  const firstRangedIdx = rows.findIndex((r) => r.fighter.ranged);
  const firstRanged = firstRangedIdx >= 0 ? rows[firstRangedIdx]! : null;
  return {
    enabled,
    retreated: 0,
    capHit: false,
    capHitAt: null,
    capHitX: null,
    retreatUntil: null,
    escapingMinRange: false,
    engaged: false,
    activatedAt: null,
    hadMeleeFront: firstRangedIdx > 0,
    firstRangedIdx,
    triggered: false,
    lastFrontIdx: -1,
    kitedRangedNames: [],
    primaryDelay: firstRanged ? firstRanged.delay : 0,
    primaryMoveWindow: firstRanged ? moveWindow(firstRanged) : 0,
    hasPrimary: false,
  };
}

function earliestAliveCooldownEnd(row: KiteRowState): number | null {
  const firstSurvivor = row.canFightAtMultipleDepths ? row.count - row.alive : 0;
  const end = row.canFightAtMultipleDepths ? row.count : 1;
  let minCd = Infinity;
  for (let i = firstSurvivor; i < end; i++) {
    const c = row.clocks[i];
    if (c && c.cycles > 0) minCd = Math.min(minCd, c.cycleStart + c.cycles * row.fighter.rof);
  }
  return Number.isFinite(minCd) ? minCd : null;
}

function frontAimInfo(row: KiteRowState, time: number): { hasActiveAim: boolean; remDue: number; remCooldown: number } {
  const firstSurvivor = row.canFightAtMultipleDepths ? row.count - row.alive : 0;
  const end = row.canFightAtMultipleDepths ? row.count : 1;
  let hasActiveAim = false;
  let minDue = Infinity;
  let maxRemCd = 0;
  for (let i = firstSurvivor; i < end; i++) {
    const c = row.clocks[i];
    if (!c) continue;
    const cd = c.cycleStart + c.cycles * row.fighter.rof;
    if (c.cycles > 0) maxRemCd = Math.max(maxRemCd, Math.max(0, cd - time));
    if (c.aimAt !== null) {
      hasActiveAim = true;
      minDue = Math.min(minDue, Math.max(c.aimAt, cd));
    }
  }
  return { hasActiveAim, remDue: hasActiveAim ? Math.max(0, minDue - time) : Infinity, remCooldown: maxRemCd };
}

/** 同步前排切换与混编后排接续残余冷却；返回本刻新触发拉扯的时刻事件标志。 */
export function syncKiteFront(form: KiteFormation, ks: KiteRuntime, time: number): boolean {
  const front = form.front;
  const frontChanged = ks.lastFrontIdx !== front.index;
  let startedNow = false;
  if (ks.enabled && front.fighter.ranged) {
    if (!ks.triggered) {
      ks.triggered = true;
      startedNow = true;
      if (ks.hadMeleeFront) ks.activatedAt = time;
    }
    if (!ks.hasPrimary) {
      ks.hasPrimary = true;
      ks.primaryDelay = front.delay;
      ks.primaryMoveWindow = moveWindow(front);
    }
    if (!ks.kitedRangedNames.includes(front.fighter.name)) ks.kitedRangedNames.push(front.fighter.name);
    if (frontChanged && ks.lastFrontIdx !== -1) {
      const minCdEnd = earliestAliveCooldownEnd(front);
      ks.engaged = minCdEnd !== null;
      ks.escapingMinRange = false;
      if (!ks.capHit && front.speed > EPS) {
        const remMove = minCdEnd !== null ? minCdEnd - front.delay - time : 0;
        ks.retreatUntil = remMove > EPS && moveWindow(front) > EPS ? time + remMove : null;
      } else {
        ks.retreatUntil = null;
      }
    }
  } else {
    ks.engaged = false;
    ks.retreatUntil = null;
    ks.escapingMinRange = false;
  }
  ks.lastFrontIdx = front.index;
  return startedNow;
}

export function computeKiteStep(left: KiteFormation, right: KiteFormation, kA: KiteRuntime, kB: KiteRuntime, gap: number, time: number): KiteStep {
  const isActive = (front: KiteRowState, ks: KiteRuntime) =>
    ks.enabled && front.fighter.ranged && !ks.capHit && front.speed > EPS && (moveWindow(front) > EPS || front.minRange > 0);
  const canVolleyKite = (front: KiteRowState, ks: KiteRuntime) =>
    ks.enabled && front.fighter.ranged && !ks.capHit && front.speed > EPS && moveWindow(front) > EPS;
  const activeA = isActive(left.front, kA);
  const activeB = isActive(right.front, kB);
  const bothEngaged = canVolleyKite(left.front, kA) && canVolleyKite(right.front, kB) && kA.engaged && kB.engaged;

  const updateMinEsc = (front: KiteRowState, other: KiteRowState, ks: KiteRuntime, active: boolean, otherNotChasing: boolean) => {
    // Round 4 P2-2: 合成防御，用 Math.max(other.rof, other.delay) 计算对手追击内收有效射程
    const otherWait = Math.max(other.fighter.rof, other.delay);
    const otherEffectiveRng = other.fighter.rng - (other.speed > front.speed + EPS ? front.speed * otherWait + CHASE_MARGIN : 0);
    const otherSpd = otherNotChasing
      ? 0
      : !other.fighter.ranged || gap >= other.fighter.rng - EPS || otherEffectiveRng < front.minRange + MIN_RANGE_BUFFER + EPS
        ? Math.max(0, other.speed)
        : 0;
    if (!active || front.minRange <= 0 || ks.capHit || !(front.speed > otherSpd + EPS)) {
      ks.escapingMinRange = false;
      return { esc: false, target: 0 };
    }
    const target = Math.min(front.fighter.rng, front.minRange + otherSpd * front.delay + MIN_RANGE_BUFFER);
    if (gap < front.minRange - EPS || (gap <= front.minRange + EPS && otherSpd > EPS)) ks.escapingMinRange = true;
    else if (gap >= target - EPS) ks.escapingMinRange = false;
    return { esc: ks.escapingMinRange, target };
  };

  const { esc: escA, target: escTargetA } = updateMinEsc(left.front, right.front, kA, activeA, bothEngaged);
  const { esc: escB, target: escTargetB } = updateMinEsc(right.front, left.front, kB, activeB, bothEngaged);

  if (kA.retreatUntil !== null && kA.retreatUntil - time <= EPS) kA.retreatUntil = null;
  if (kB.retreatUntil !== null && kB.retreatUntil - time <= EPS) kB.retreatUntil = null;
  let retA = (activeA && kA.retreatUntil !== null) || escA;
  let retB = (activeB && kB.retreatUntil !== null) || escB;

  if (retA && gap <= EPS && !right.front.fighter.ranged && left.front.speed <= right.front.speed + EPS) {
    retA = false;
    kA.retreatUntil = null;
  }
  if (retB && gap <= EPS && !left.front.fighter.ranged && right.front.speed <= left.front.speed + EPS) {
    retB = false;
    kB.retreatUntil = null;
  }

  if (!bothEngaged && !escA && retA && gap > left.front.fighter.rng + EPS) {
    kA.retreatUntil = null;
    retA = false;
  }
  if (!bothEngaged && !escB && retB && gap > right.front.fighter.rng + EPS) {
    kB.retreatUntil = null;
    retB = false;
  }

  const remRetA = retA ? (kA.retreatUntil !== null ? Math.max(0, kA.retreatUntil - time) : Infinity) : 0;
  const remRetB = retB ? (kB.retreatUntil !== null ? Math.max(0, kB.retreatUntil - time) : Infinity) : 0;

  const rawAdv = (front: KiteRowState, ks: KiteRuntime, oRet: boolean, oSpd: number, oRem: number) => {
    if (bothEngaged && ks.engaged) return { speed: 0, stopAt: front.fighter.rng };
    if (!front.fighter.ranged) return { speed: gap > EPS || (oRet && oSpd > EPS) ? Math.max(0, front.speed) : 0, stopAt: 0 };
    let stopAt = front.fighter.rng;
    if (oRet && oSpd > EPS) {
      const info = frontAimInfo(front, time);
      if (info.hasActiveAim && gap <= front.fighter.rng + EPS && gap >= front.minRange - EPS) {
        if (gap + oSpd * Math.min(info.remDue, oRem) <= front.fighter.rng + EPS) return { speed: 0, stopAt: front.fighter.rng };
      }
      const waitNeed = Math.max(front.delay, info.remCooldown);
      const targetStop = Math.max(front.minRange, front.fighter.rng - oSpd * Math.min(waitNeed, oRem) - CHASE_MARGIN);
      if (front.speed > oSpd + EPS) stopAt = targetStop;
      else if (gap >= front.fighter.rng - EPS) return { speed: Math.max(0, front.speed), stopAt: front.fighter.rng };
    }
    return { speed: gap - stopAt > EPS ? Math.max(0, front.speed) : 0, stopAt };
  };

  const advA = retA ? { speed: 0, stopAt: left.front.fighter.rng } : rawAdv(left.front, kA, retB, right.front.speed, remRetB);
  const advB = retB ? { speed: 0, stopAt: right.front.fighter.rng } : rawAdv(right.front, kB, retA, left.front.speed, remRetA);
  let vxA = retA ? -left.front.speed : advA.speed;
  let vxB = retB ? right.front.speed : -advB.speed;

  if (retA && !bothEngaged && gap >= left.front.fighter.rng - EPS) {
    vxA = -Math.min(left.front.speed, Math.max(0, -vxB));
    if (Math.abs(vxA) <= EPS) {
      vxA = 0;
      retA = false;
      kA.retreatUntil = null;
    }
  }
  if (retB && !bothEngaged && gap >= right.front.fighter.rng - EPS) {
    vxB = Math.min(right.front.speed, Math.max(0, vxA));
    if (Math.abs(vxB) <= EPS) {
      vxB = 0;
      retB = false;
      kB.retreatUntil = null;
    }
  }

  let gapRate = vxB - vxA;
  if (gap <= EPS && gapRate < 0) {
    if (retA && vxB < vxA) vxB = vxA;
    else if (retB && vxA > vxB) vxA = vxB;
    else {
      vxA = 0;
      vxB = 0;
    }
    gapRate = 0;
  }

  return {
    vxA,
    vxB,
    gapRate,
    closingSpeed: Math.max(0, -gapRate),
    openingSpeed: Math.max(0, gapRate),
    retA,
    retB,
    escA,
    escB,
    escTargetA,
    escTargetB,
    advStopA: advA.stopAt,
    advStopB: advB.stopAt,
    bothEngaged,
    aFrontMoving: left.front.fighter.ranged && Math.abs(vxA) > EPS,
    bFrontMoving: right.front.fighter.ranged && Math.abs(vxB) > EPS,
  };
}

export function scheduleKiteEvents(
  step: KiteStep,
  left: KiteFormation,
  right: KiteFormation,
  kA: KiteRuntime,
  kB: KiteRuntime,
  gap: number,
  time: number,
  schedule: (delay: number) => void,
): void {
  const { vxA, vxB, closingSpeed, openingSpeed, retA, retB, escA, escB, escTargetA, escTargetB, advStopA, advStopB, bothEngaged } = step;
  if (kA.retreatUntil !== null && kA.retreatUntil - time > EPS) schedule(kA.retreatUntil - time);
  if (kB.retreatUntil !== null && kB.retreatUntil - time > EPS) schedule(kB.retreatUntil - time);
  if (retA && vxA < -EPS) {
    if (RETREAT_CAP - kA.retreated > EPS) schedule((RETREAT_CAP - kA.retreated) / -vxA);
    if (!bothEngaged && openingSpeed > EPS && left.front.fighter.rng - gap > EPS) schedule((left.front.fighter.rng - gap) / openingSpeed);
    if (escA && openingSpeed > EPS && escTargetA - gap > EPS) schedule((escTargetA - gap) / openingSpeed);
  }
  if (retB && vxB > EPS) {
    if (RETREAT_CAP - kB.retreated > EPS) schedule((RETREAT_CAP - kB.retreated) / vxB);
    if (!bothEngaged && openingSpeed > EPS && right.front.fighter.rng - gap > EPS) schedule((right.front.fighter.rng - gap) / openingSpeed);
    if (escB && openingSpeed > EPS && escTargetB - gap > EPS) schedule((escTargetB - gap) / openingSpeed);
  }
  if (closingSpeed > EPS) {
    if (!retA && vxA > EPS && gap - advStopA > EPS) schedule((gap - advStopA) / closingSpeed);
    if (!retB && vxB < -EPS && gap - advStopB > EPS) schedule((gap - advStopB) / closingSpeed);
    if (gap > EPS) schedule(gap / closingSpeed);
  }
}

export function recordKiteVolley(row: KiteRowState, front: KiteRowState, ks: KiteRuntime, time: number, bothEngaged = false, gap = Infinity): void {
  if (!ks.enabled || !row.fighter.ranged) return;
  if (row === front) {
    ks.engaged = true;
    if (!ks.capHit && row.speed > EPS) {
      const mw = moveWindow(row);
      if (mw > EPS) ks.retreatUntil = time + mw;
    }
    return;
  }
  if (bothEngaged && gap > front.fighter.rng + EPS && !ks.capHit && front.fighter.ranged && front.speed > EPS) {
    const mw = moveWindow(front);
    if (mw > EPS) ks.retreatUntil = time + mw;
  }
}

/** 更新累计后撤距离；返回是否在本步首次触及 40 格上限。 */
export function advanceKiteRetreat(ks: KiteRuntime, retreatSpeed: number, elapsed: number, nextTime: number, capPos: number | null): boolean {
  if (!(retreatSpeed > EPS)) return false;
  ks.retreated = Math.min(RETREAT_CAP, ks.retreated + retreatSpeed * elapsed);
  if (ks.retreated >= RETREAT_CAP - EPS && !ks.capHit) {
    ks.retreated = RETREAT_CAP;
    ks.capHit = true;
    ks.capHitAt = nextTime;
    ks.capHitX = capPos;
    ks.retreatUntil = null;
    ks.escapingMinRange = false;
    return true;
  }
  return false;
}

export function buildSideKiteSummary(ks: KiteRuntime, rows: readonly KiteRowState[]): SideKiteSummary {
  const clearedFrontNames: string[] = [];
  if (ks.hadMeleeFront && ks.firstRangedIdx > 0) {
    for (let i = 0; i < ks.firstRangedIdx; i++) {
      const r = rows[i]!;
      if (!r.fighter.ranged && r.alive === 0 && !clearedFrontNames.includes(r.fighter.name)) {
        clearedFrontNames.push(r.fighter.name);
      }
    }
  }
  const fallbackRanged = ks.firstRangedIdx >= 0 ? rows[ks.firstRangedIdx]!.fighter.name : '';
  return {
    enabled: ks.enabled,
    triggered: ks.triggered,
    retreated: ks.retreated,
    retreatCap: RETREAT_CAP,
    capHit: ks.capHit,
    capHitAt: ks.capHitAt,
    capHitX: ks.capHitX,
    activatedAt: ks.activatedAt,
    clearedFrontNames,
    rangedName: ks.kitedRangedNames.length ? ks.kitedRangedNames.join('、') : fallbackRanged,
    attackDelaySeconds: ks.primaryDelay,
    moveWindowSeconds: ks.primaryMoveWindow,
    hadMeleeFront: ks.hadMeleeFront,
  };
}
