import type { Fighter } from './duelFighter';

const EPS = 1e-9;

export type ReplaySide = 'a' | 'b';

/** 含 'ranged-exchange'；预留 issue 1295 的 'kiting' 与 'disengaged'（本单不触发） */
export type ReplayPhase = 'approach' | 'opening' | 'ranged-exchange' | 'melee' | 'row-shift' | 'kiting' | 'disengaged' | 'ended';

export interface ContactReplayRowFrame {
  uid: number;
  alive: number;
  hp: number;
  /** 当刻 eligible 过滤 !rank.leaving 后的真实可持续出手人数（非单场峰值 maxMelee） */
  active: number;
  /** 当刻过滤 !rank.leaving 后的有效出手排数（例如印加枪兵长 1 射程多排为 1–3） */
  ranks: number;
  /** 本行相对己方当前最前排的纵深偏移（格） */
  setback: number;
  /** 进入最大射程后全员因 minRange 停火（1v1 或全排 < minRange） */
  silencedByMinRange: boolean;
  /** 多人数远程行部分前排因 minRange 停火、后排纵深继续输出 */
  partialMinRangeSilence: boolean;
  /** 当刻是否已清空 */
  cleared: boolean;
}

export interface ContactReplayFrame {
  t: number;
  /** A/B 阵线绝对世界坐标（格）：由 gap 单向派生；issue 1295 后撤直接向负/正方向展开 */
  aPos: number;
  bPos: number;
  gap: number;
  /** 本时间段 [t, nextT) 内的恒定有符号世界速度（格/秒）：供 60fps 线性插值；issue 1295 后撤即 vxA < 0 / vxB > 0 */
  vxA: number;
  vxB: number;
  /** 本时刻实际出手人次（含 finish() 刷入的致死一击；驱动 1v1 OneTimeline 真实出手点与齐射反馈） */
  aFired: number;
  bFired: number;
  /** 当前先手窗口所属方与已完成先手齐射轮次（openingVolley === 0 表示瞄准前摇期） */
  openingSide: ReplaySide | null;
  openingVolley: number;
  aFrontRow: number;
  bFrontRow: number;
  aRows: ContactReplayRowFrame[];
  bRows: ContactReplayRowFrame[];
  /** issue 1295 预留可选扩展字段（本单保持 undefined，不提前实现拉扯算法） */
  aRetreated?: number;
  bRetreated?: number;
  aRetreatCapHit?: boolean;
  bRetreatCapHit?: boolean;
}

export type ContactReplayEvent =
  | { kind: 'opening-start'; t: number; side: ReplaySide }
  | { kind: 'min-range-enter'; t: number; side: ReplaySide; minRange: number }
  | { kind: 'melee-contact'; t: number }
  | { kind: 'row-cleared'; t: number; side: ReplaySide; rowIndex: number; uid: number; initial: number; stepDist: number; x: number }
  | { kind: 'kite-start'; t: number; side: ReplaySide }
  | { kind: 'retreat-cap'; t: number; side: ReplaySide; x: number }
  | { kind: 'disengaged'; t: number }
  | { kind: 'end'; t: number };

export interface ContactReplayTrace {
  initialGap: number;
  /** 首次贴身（gap <= EPS）时的 aPos；未贴身但有近战交火回退 meleeAt 时的 (aPos + bPos)/2；纯远程对射为 null */
  contactX: number | null;
  frames: ContactReplayFrame[];
  events: ContactReplayEvent[];
  /** issue 1295 预留退距上限与脱离接战时间戳 */
  retreatCap?: number;
  disengagedAt?: number | null;
}

export interface TraceRowInput {
  index: number;
  uid: number;
  count: number;
  alive: number;
  headHp: number;
  radiusX: number;
  minRange: number;
  fighter: Fighter;
}

export interface TraceRankInput {
  count: number;
  leaving: boolean;
  leavingMin?: boolean;
}

export interface TraceOpeningState {
  side: ReplaySide;
  volleys: number;
}

export interface TraceKiteFrame {
  aRetreated?: number;
  bRetreated?: number;
  aRetreatCapHit?: boolean;
  bRetreatCapHit?: boolean;
}

export interface TraceKiteFinal extends TraceKiteFrame {
  retreatCap?: number;
  disengagedAt?: number | null;
}

export interface TraceRecorder {
  getAPos(): number;
  getBPos(): number;
  addFired(aCount: number, bCount: number): void;
  noteTouch(gap: number): void;
  noteOpeningStart(t: number, side: ReplaySide): void;
  noteMeleeContact(t: number): void;
  noteRowCleared(event: Omit<Extract<ContactReplayEvent, { kind: 'row-cleared' }>, 'kind'>): void;
  noteKiteStart(t: number, side: ReplaySide): void;
  noteRetreatCap(t: number, side: ReplaySide): number;
  noteDisengaged(t: number): void;
  onRowShift(aStep: number, bStep: number, newGap: number): void;
  onAdvance(vxA: number, vxB: number, gapRate: number, prevGap: number, elapsed: number, newGap: number): void;
  recordSettled(
    t: number,
    gap: number,
    vxA: number,
    vxB: number,
    aRows: readonly TraceRowInput[],
    aSetback: readonly number[],
    inA: readonly (readonly TraceRankInput[])[],
    bRows: readonly TraceRowInput[],
    bSetback: readonly number[],
    inB: readonly (readonly TraceRankInput[])[],
    opening: TraceOpeningState | null,
    kiteFrame?: TraceKiteFrame,
  ): void;
  finalize(t: number, gap: number, aRows: readonly TraceRowInput[], bRows: readonly TraceRowInput[], kiteFinal?: TraceKiteFinal): ContactReplayTrace;
}

function activeFrontIndex(rows: readonly TraceRowInput[]): number {
  const idx = rows.findIndex((row) => row.alive > 0);
  return idx >= 0 ? idx : Math.max(0, rows.length - 1);
}

function rowHp(row: TraceRowInput): number {
  return row.alive > 0 ? row.headHp + (row.alive - 1) * row.fighter.hp : 0;
}

function buildRowFrames(
  rows: readonly TraceRowInput[],
  setback: readonly number[],
  eligible: readonly (readonly TraceRankInput[])[] | null,
  gap: number,
  onMinRangeBlocked?: (minRange: number) => void,
): ContactReplayRowFrame[] {
  return rows.map((row) => {
    const sb = setback[row.index] ?? 0;
    const ranks = eligible ? eligible[row.index]! : [];
    const sustained = ranks.filter((rank) => !rank.leaving);
    const active = sustained.reduce((sum, rank) => sum + rank.count, 0);
    const rankCount = sustained.length;
    const inMaxRng = eligible !== null && row.alive > 0 && row.fighter.ranged && row.minRange > 0 && gap + sb <= row.fighter.rng + EPS;
    const hasMinRangeBlocked = inMaxRng && (gap + sb < row.minRange - EPS || ranks.some((rank) => rank.leavingMin ?? rank.leaving));
    const silencedByMinRange = hasMinRangeBlocked && active === 0;
    const partialMinRangeSilence = hasMinRangeBlocked && active > 0 && active < row.alive;
    if (hasMinRangeBlocked && active < row.alive && onMinRangeBlocked) onMinRangeBlocked(row.minRange);
    return {
      uid: row.uid,
      alive: row.alive,
      hp: rowHp(row),
      active,
      ranks: rankCount,
      setback: sb,
      silencedByMinRange,
      partialMinRangeSilence,
      cleared: row.alive === 0,
    };
  });
}

function finalSetbacks(rows: readonly TraceRowInput[]): number[] {
  let depth = 0;
  return rows.map((row) => {
    const offset = depth;
    if (row.alive > 0) depth += 2 * row.radiusX;
    return offset;
  });
}

export function createTraceRecorder(initialGap: number): TraceRecorder {
  let aPos = 0;
  let bPos = initialGap;
  let pendingFiredA = 0;
  let pendingFiredB = 0;
  let touchX: number | null = null;
  let meleeMidX: number | null = null;
  let openingStarted = false;
  let meleeNoted = false;
  const minRangeNoted = { a: false, b: false };
  const kiteStartNoted = { a: false, b: false };
  const retreatCapNoted = { a: false, b: false };
  let disengagedNoted = false;
  const frames: ContactReplayFrame[] = [];
  const events: ContactReplayEvent[] = [];

  const recordFrame = (frame: ContactReplayFrame) => {
    const prev = frames.at(-1);
    if (prev && Math.abs(prev.t - frame.t) <= EPS) {
      frames[frames.length - 1] = {
        ...frame,
        aFired: prev.aFired + frame.aFired,
        bFired: prev.bFired + frame.bFired,
      };
      return;
    }
    frames.push(frame);
  };

  const noteTouch = (gap: number) => {
    if (touchX === null && gap <= EPS) touchX = aPos;
  };

  return {
    getAPos: () => aPos,
    getBPos: () => bPos,
    addFired(aCount, bCount) {
      pendingFiredA += aCount;
      pendingFiredB += bCount;
    },
    noteTouch,
    noteOpeningStart(t, side) {
      if (openingStarted) return;
      openingStarted = true;
      events.push({ kind: 'opening-start', t, side });
    },
    noteMeleeContact(t) {
      if (meleeNoted) return;
      meleeNoted = true;
      meleeMidX = (aPos + bPos) / 2;
      events.push({ kind: 'melee-contact', t });
    },
    noteRowCleared(event) {
      events.push({ kind: 'row-cleared', ...event });
    },
    noteKiteStart(t, side) {
      if (kiteStartNoted[side]) return;
      kiteStartNoted[side] = true;
      events.push({ kind: 'kite-start', t, side });
    },
    noteRetreatCap(t, side) {
      const x = side === 'a' ? aPos : bPos;
      if (!retreatCapNoted[side]) {
        retreatCapNoted[side] = true;
        events.push({ kind: 'retreat-cap', t, side, x });
      }
      return x;
    },
    noteDisengaged(t) {
      if (disengagedNoted) return;
      disengagedNoted = true;
      events.push({ kind: 'disengaged', t });
    },
    onRowShift(aStep, bStep, newGap) {
      if (aStep === 0 && bStep === 0) return;
      if (aStep > 0 && bStep === 0) aPos = bPos - newGap;
      else if (aStep === 0 && bStep > 0) bPos = aPos + newGap;
      else {
        aPos -= aStep;
        bPos = aPos + newGap;
      }
    },
    onAdvance(vxA, vxB, gapRate, prevGap, elapsed, newGap) {
      const aMoves = Math.abs(vxA) > EPS;
      const bMoves = Math.abs(vxB) > EPS;
      if (!aMoves && !bMoves) return;
      if (aMoves && !bMoves) aPos = bPos - newGap;
      else if (!aMoves && bMoves) bPos = aPos + newGap;
      else {
        const dtMove = gapRate < 0 ? Math.min(elapsed, prevGap / -gapRate) : elapsed;
        aPos += vxA * dtMove;
        bPos = aPos + newGap;
      }
    },
    recordSettled(t, gap, vxA, vxB, aRows, aSetback, inA, bRows, bSetback, inB, opening, kiteFrame) {
      noteTouch(gap);
      const aFired = pendingFiredA;
      const bFired = pendingFiredB;
      pendingFiredA = 0;
      pendingFiredB = 0;
      const aRowFrames = buildRowFrames(aRows, aSetback, inA, gap, (minRange) => {
        if (!minRangeNoted.a) {
          minRangeNoted.a = true;
          events.push({ kind: 'min-range-enter', t, side: 'a', minRange });
        }
      });
      const bRowFrames = buildRowFrames(bRows, bSetback, inB, gap, (minRange) => {
        if (!minRangeNoted.b) {
          minRangeNoted.b = true;
          events.push({ kind: 'min-range-enter', t, side: 'b', minRange });
        }
      });
      recordFrame({
        t,
        aPos,
        bPos,
        gap,
        vxA,
        vxB,
        aFired,
        bFired,
        openingSide: opening?.side ?? null,
        openingVolley: opening?.volleys ?? 0,
        aFrontRow: activeFrontIndex(aRows),
        bFrontRow: activeFrontIndex(bRows),
        aRows: aRowFrames,
        bRows: bRowFrames,
        ...(kiteFrame ?? {}),
      });
    },
    finalize(t, gap, aRows, bRows, kiteFinal) {
      noteTouch(gap);
      const aFired = pendingFiredA;
      const bFired = pendingFiredB;
      pendingFiredA = 0;
      pendingFiredB = 0;
      const frameKite: TraceKiteFrame = kiteFinal
        ? {
            ...(kiteFinal.aRetreated !== undefined ? { aRetreated: kiteFinal.aRetreated } : {}),
            ...(kiteFinal.bRetreated !== undefined ? { bRetreated: kiteFinal.bRetreated } : {}),
            ...(kiteFinal.aRetreatCapHit !== undefined ? { aRetreatCapHit: kiteFinal.aRetreatCapHit } : {}),
            ...(kiteFinal.bRetreatCapHit !== undefined ? { bRetreatCapHit: kiteFinal.bRetreatCapHit } : {}),
          }
        : {};
      recordFrame({
        t,
        aPos,
        bPos,
        gap,
        vxA: 0,
        vxB: 0,
        aFired,
        bFired,
        openingSide: null,
        openingVolley: 0,
        aFrontRow: activeFrontIndex(aRows),
        bFrontRow: activeFrontIndex(bRows),
        aRows: buildRowFrames(aRows, finalSetbacks(aRows), null, gap),
        bRows: buildRowFrames(bRows, finalSetbacks(bRows), null, gap),
        ...frameKite,
      });
      events.push({ kind: 'end', t });
      return {
        initialGap,
        contactX: touchX ?? meleeMidX,
        frames,
        events,
        ...(kiteFinal?.retreatCap !== undefined ? { retreatCap: kiteFinal.retreatCap } : {}),
        ...(kiteFinal?.disengagedAt !== undefined ? { disengagedAt: kiteFinal.disengagedAt } : {}),
      };
    },
  };
}

export interface StageBounds {
  minX: number;
  maxX: number;
  span: number;
  originX: number;
}

export function computeStageBounds(trace: ContactReplayTrace): StageBounds {
  const xs: number[] = [0, trace.initialGap];
  for (const frame of trace.frames) {
    if (Number.isFinite(frame.aPos)) xs.push(frame.aPos);
    if (Number.isFinite(frame.bPos)) xs.push(frame.bPos);
  }
  for (const ev of trace.events) {
    if ((ev.kind === 'row-cleared' || ev.kind === 'retreat-cap') && Number.isFinite(ev.x)) xs.push(ev.x);
  }
  if (trace.contactX !== null && Number.isFinite(trace.contactX)) xs.push(trace.contactX);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return { minX, maxX, span: Math.max(1, maxX - minX), originX: trace.contactX ?? 0 };
}

export const MAX_TIMELINE_HITS = 60;

/** 从 contactFight 轨迹抽取某侧出手时刻，超上限时等距抽样并保留首尾出手点。 */
export function sampleContactHitTimes(trace: ContactReplayTrace | undefined, side: ReplaySide, maxHits = MAX_TIMELINE_HITS): number[] {
  if (!trace || maxHits < 1) return [];
  const raw: number[] = [];
  for (const frame of trace.frames) {
    if ((side === 'a' ? frame.aFired : frame.bFired) > 0) raw.push(frame.t);
  }
  if (raw.length <= maxHits) return raw;
  if (maxHits === 1) return [raw[0]!];
  const sampled: number[] = [];
  const last = raw.length - 1;
  for (let i = 0; i < maxHits; i++) {
    const idx = Math.round((i * last) / (maxHits - 1));
    sampled.push(raw[idx]!);
  }
  return sampled;
}

export interface ReplayBlindZone {
  side: ReplaySide;
  rowIndex: number;
  minRange: number;
  silenced: boolean;
}

interface BlindZoneRowMeta {
  ranged: boolean;
  minRange: number;
}

/** 统一挑选当前时刻对应的最小射程盲区目标，确保顶栏停火提示与画布盲区带严格同源。 */
export function resolveReplayBlindZone(
  aRows: readonly ContactReplayRowFrame[],
  bRows: readonly ContactReplayRowFrame[],
  aMeta: readonly BlindZoneRowMeta[],
  bMeta: readonly BlindZoneRowMeta[],
  events: readonly ContactReplayEvent[],
  t: number,
): ReplayBlindZone | null {
  const sides = [
    ['a', aRows, aMeta],
    ['b', bRows, bMeta],
  ] as const;
  const latestEnterAt = (side: ReplaySide) => {
    let best = Number.NEGATIVE_INFINITY;
    for (const ev of events) {
      if (ev.kind === 'min-range-enter' && ev.side === side && ev.t <= t + EPS && ev.t > best) best = ev.t;
    }
    return best;
  };
  const pickFrom = (pred: (row: ContactReplayRowFrame) => boolean, silenced: boolean): ReplayBlindZone | null => {
    const list: ReplayBlindZone[] = [];
    for (const [side, rows, metas] of sides) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const m = metas[i];
        if (r && m && r.alive > 0 && m.ranged && m.minRange > 0 && pred(r)) {
          list.push({ side, rowIndex: i, minRange: m.minRange, silenced });
          break;
        }
      }
    }
    if (!list.length) return null;
    if (list.length === 1) return list[0]!;
    return latestEnterAt(list[1]!.side) > latestEnterAt(list[0]!.side) + EPS ? list[1]! : list[0]!;
  };
  const full = pickFrom((r) => r.silencedByMinRange, true);
  if (full) return full;
  const partial = pickFrom((r) => r.partialMinRangeSilence, true);
  if (partial) return partial;
  const liveFor = (side: ReplaySide): ReplayBlindZone | null => {
    const rows = side === 'a' ? aRows : bRows;
    const metas = side === 'a' ? aMeta : bMeta;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const m = metas[i];
      if (r && m && r.alive > 0 && m.ranged && m.minRange > 0) return { side, rowIndex: i, minRange: m.minRange, silenced: false };
    }
    return null;
  };
  let recentEv: Extract<ContactReplayEvent, { kind: 'min-range-enter' }> | null = null;
  let nextEv: Extract<ContactReplayEvent, { kind: 'min-range-enter' }> | null = null;
  for (const ev of events) {
    if (ev.kind !== 'min-range-enter') continue;
    if (ev.t <= t + EPS) {
      if (!recentEv || ev.t >= recentEv.t) recentEv = ev;
    } else if (!nextEv || ev.t < nextEv.t) {
      nextEv = ev;
    }
  }
  if (recentEv) {
    const hit = liveFor(recentEv.side);
    if (hit) return hit;
  }
  if (nextEv) {
    const hit = liveFor(nextEv.side);
    if (hit) return hit;
  }
  const aLive = liveFor('a');
  const bLive = liveFor('b');
  if (aLive && bLive) return aLive.minRange >= bLive.minRange ? aLive : bLive;
  return aLive ?? bLive;
}
