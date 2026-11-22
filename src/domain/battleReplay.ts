import type { ArmyRow, ContactResult, ContactSummary, FightEnd } from './contactFight';
import {
  computeStageBounds,
  MAX_TIMELINE_HITS,
  resolveReplayBlindZone,
  sampleContactHitTimes,
  type ContactReplayEvent,
  type ContactReplayFrame,
  type ContactReplayRowFrame,
  type ContactReplayTrace,
  type ReplayBlindZone,
  type ReplayPhase,
  type ReplaySide,
  type StageBounds,
} from './contactReplayTrace';
import type { Fighter, GroupOutcome, OneVOneResult } from './duel';
import { oneReplay, type ReplayFrame } from './oneReplay';

export { computeStageBounds, MAX_TIMELINE_HITS, oneReplay, sampleContactHitTimes, type ReplayFrame };

const EPS = 1e-9;

export const COMPACT_AGGREGATE_THRESHOLD = 60;

/** 仅非 1v1 且单侧初始人数超过阈值时启用大规模聚合文案与限宽峰值标注。 */
export function isLargeAggregate(model: Pick<BattleReplayModel, 'kind' | 'maxSideInitial'>): boolean {
  return model.kind !== 'one' && model.maxSideInitial > COMPACT_AGGREGATE_THRESHOLD;
}

/** 统一计算近战阶段底部胶囊文案：当前活跃与全战帧峰值严格同口径（含远程行时标「活跃输出」）。 */
export function formatMeleeCaption(
  model: Pick<BattleReplayModel, 'kind' | 'maxSideInitial' | 'a' | 'b' | 'aPeakActive' | 'bPeakActive'>,
  snap: Pick<BattleReplaySnapshot, 'aActive' | 'bActive'>,
): string {
  if (!isLargeAggregate(model)) return `贴身接敌 ${snap.aActive} vs ${snap.bActive}`;
  const anyRanged = model.a.rows.some((r) => r.ranged) || model.b.rows.some((r) => r.ranged);
  return anyRanged
    ? `活跃输出 ${snap.aActive} vs ${snap.bActive} · 峰值 ${model.aPeakActive} vs ${model.bPeakActive}`
    : `前排限宽 ${snap.aActive} vs ${snap.bActive} · 峰值 ${model.aPeakActive} vs ${model.bPeakActive}`;
}

export type ReplayKind = 'one' | 'group' | 'mixed';

export interface ReplayRowMeta {
  uid: number;
  name: string;
  initial: number;
  maxHpPerUnit: number;
  totalMaxHp: number;
  ranged: boolean;
  rng: number;
  minRange: number;
  radiusX: number;
  canFightAtMultipleDepths: boolean;
  maxMelee: number;
  maxRanged: number;
}

export interface ReplaySideMeta {
  civZh: string;
  rows: ReplayRowMeta[];
  totalInitial: number;
  totalMaxHp: number;
}

export interface ReplayMarker {
  id: string;
  kind: 'start' | 'opening-start' | 'min-range-enter' | 'melee-contact' | 'row-cleared' | 'kite-start' | 'retreat-cap' | 'disengaged' | 'end';
  t: number;
  label: string;
  shortLabel: string;
  side?: ReplaySide;
  rowIndex?: number;
}

export interface BattleReplayModel {
  kind: ReplayKind;
  status: FightEnd;
  winner: 'a' | 'b' | 'draw' | null;
  duration: number;
  a: ReplaySideMeta;
  b: ReplaySideMeta;
  trace: ContactReplayTrace;
  contact: ContactSummary;
  markers: ReplayMarker[];
  bounds: StageBounds;
  maxSideInitial: number;
  aPeakActive: number;
  bPeakActive: number;
}

export interface ReplayPhaseInfo {
  phase: ReplayPhase;
  label: string;
  tone: 'link' | 'warn' | 'bad' | 'good';
  icon: 'footprints' | 'bow-arrow' | 'swords' | 'check' | 'info';
}

export interface BattleReplaySnapshot {
  t: number;
  aPos: number;
  bPos: number;
  gap: number;
  vxA: number;
  vxB: number;
  openingSide: ReplaySide | null;
  openingVolley: number;
  aFrontRow: number;
  bFrontRow: number;
  aRows: ContactReplayRowFrame[];
  bRows: ContactReplayRowFrame[];
  aAlive: number;
  bAlive: number;
  aHp: number;
  bHp: number;
  aActive: number;
  bActive: number;
  phase: ReplayPhase;
  phaseLabel: string;
  phaseTone: 'link' | 'warn' | 'bad' | 'good';
  phaseIcon: 'footprints' | 'bow-arrow' | 'swords' | 'check' | 'info';
  clearedEvents: Extract<ContactReplayEvent, { kind: 'row-cleared' }>[];
  blindZone: ReplayBlindZone | null;
  silencedMinRange: number | null;
  activeMarkerIndex: number;
  aRetreated?: number;
  bRetreated?: number;
  aRetreatCapHit?: boolean;
  bRetreatCapHit?: boolean;
}

function fmtMarkerSec(t: number): string {
  return !Number.isFinite(t) || Math.abs(t) <= EPS ? '0s' : `${Number(t.toFixed(2))}s`;
}

function buildRowMeta(row: ArmyRow, contactRow: { maxMelee: number; maxRanged: number } | undefined): ReplayRowMeta {
  const rx = row.fighter.contact?.radiusX ?? 0.25;
  const minRange = row.fighter.contact?.minRange ?? 0;
  return {
    uid: row.uid,
    name: row.fighter.name,
    initial: row.count,
    maxHpPerUnit: row.fighter.hp,
    totalMaxHp: row.count * row.fighter.hp,
    ranged: row.fighter.ranged,
    rng: row.fighter.rng,
    minRange,
    radiusX: rx,
    canFightAtMultipleDepths: (!row.fighter.ranged && row.fighter.rng + EPS >= 2 * rx) || (row.fighter.ranged && minRange > 0),
    maxMelee: contactRow?.maxMelee ?? 0,
    maxRanged: contactRow?.maxRanged ?? 0,
  };
}

function buildSideMeta(civZh: string, rows: readonly ArmyRow[], contactRows: readonly { maxMelee: number; maxRanged: number }[]): ReplaySideMeta {
  const metaRows = rows.map((row, idx) => buildRowMeta(row, contactRows[idx]));
  return { civZh, rows: metaRows, totalInitial: metaRows.reduce((s, r) => s + r.initial, 0), totalMaxHp: metaRows.reduce((s, r) => s + r.totalMaxHp, 0) };
}

function fallbackTrace(
  a: ReplaySideMeta,
  b: ReplaySideMeta,
  duration: number,
  aEndAlive: number,
  bEndAlive: number,
  aEndHp: number,
  bEndHp: number,
): ContactReplayTrace {
  const initialGap = 1 + Math.max(...[...a.rows, ...b.rows].map((r) => r.rng), 0);
  const makeRows = (side: ReplaySideMeta, alive: number, hp: number): ContactReplayRowFrame[] =>
    side.rows.map((r, i) => ({
      uid: r.uid,
      alive: i === 0 ? alive : 0,
      hp: i === 0 ? hp : 0,
      active: 0,
      ranks: 0,
      setback: 0,
      silencedByMinRange: false,
      partialMinRangeSilence: false,
      cleared: (i === 0 ? alive : 0) === 0,
    }));
  const base = {
    aPos: 0,
    bPos: initialGap,
    gap: initialGap,
    vxA: 0,
    vxB: 0,
    aFired: 0,
    bFired: 0,
    openingSide: null,
    openingVolley: 0,
    aFrontRow: 0,
    bFrontRow: 0,
  };
  const startFrame: ContactReplayFrame = { t: 0, ...base, aRows: makeRows(a, a.totalInitial, a.totalMaxHp), bRows: makeRows(b, b.totalInitial, b.totalMaxHp) };
  const endFrame: ContactReplayFrame = { t: duration, ...base, aRows: makeRows(a, aEndAlive, aEndHp), bRows: makeRows(b, bEndAlive, bEndHp) };
  return { initialGap, contactX: null, frames: duration > EPS ? [startFrame, endFrame] : [endFrame], events: [{ kind: 'end', t: duration }] };
}

export function extractReplayMarkers(trace: ContactReplayTrace, duration: number, kind: ReplayKind, a: ReplaySideMeta, b: ReplaySideMeta): ReplayMarker[] {
  const markers: ReplayMarker[] = [{ id: 'start', kind: 'start', t: 0, label: '初始阵型 0s', shortLabel: '初始阵型' }];
  const safeDur = Math.max(0, duration);
  let openingEndSide: ReplaySide | undefined;
  let hasDisengaged = false;
  const pushUnique = (marker: ReplayMarker) => {
    const safeT = Math.max(0, Math.min(safeDur, marker.t));
    if (safeT <= EPS && marker.kind !== 'start' && marker.kind !== 'end') return;
    if (safeT >= safeDur - EPS && marker.kind !== 'end') {
      if (marker.kind === 'opening-start') openingEndSide = marker.side;
      if (marker.kind === 'disengaged') hasDisengaged = true;
      return;
    }
    if (markers.some((m) => m.kind === marker.kind && m.side === marker.side && m.rowIndex === marker.rowIndex)) return;
    markers.push({ ...marker, t: safeT });
  };
  for (const ev of trace.events) {
    if (ev.kind === 'opening-start') {
      pushUnique({ id: `opening-${ev.side}`, kind: 'opening-start', t: ev.t, label: `先手齐射 ${fmtMarkerSec(ev.t)}`, shortLabel: '先手齐射', side: ev.side });
    } else if (ev.kind === 'min-range-enter') {
      pushUnique({ id: `minr-${ev.side}`, kind: 'min-range-enter', t: ev.t, label: `突入盲区 ${fmtMarkerSec(ev.t)}`, shortLabel: '突入盲区', side: ev.side });
    } else if (ev.kind === 'melee-contact') {
      pushUnique({ id: 'melee', kind: 'melee-contact', t: ev.t, label: `近战接敌 ${fmtMarkerSec(ev.t)}`, shortLabel: '近战接敌' });
    } else if (ev.kind === 'kite-start') {
      pushUnique({
        id: `kite-${ev.side}`,
        kind: 'kite-start',
        t: ev.t,
        label: `${ev.side.toUpperCase()} 转入拉扯 ${fmtMarkerSec(ev.t)}`,
        shortLabel: `${ev.side.toUpperCase()} 拉扯`,
        side: ev.side,
      });
    } else if (ev.kind === 'retreat-cap') {
      pushUnique({
        id: `cap-${ev.side}`,
        kind: 'retreat-cap',
        t: ev.t,
        label: `${ev.side.toUpperCase()} 触及 40 格上限 ${fmtMarkerSec(ev.t)}`,
        shortLabel: `${ev.side.toUpperCase()} 触底`,
        side: ev.side,
      });
    } else if (ev.kind === 'disengaged') {
      pushUnique({ id: 'disengaged', kind: 'disengaged', t: ev.t, label: `脱离接战 ${fmtMarkerSec(ev.t)}`, shortLabel: '脱离接战' });
    } else if (ev.kind === 'row-cleared') {
      const sideMeta = ev.side === 'a' ? a : b;
      if (kind === 'mixed' && sideMeta.rows.length > 1 && ev.rowIndex < sideMeta.rows.length - 1) {
        const tag = `${ev.side.toUpperCase()}${ev.rowIndex + 1}`;
        pushUnique({
          id: `clear-${ev.side}-${ev.rowIndex}`,
          kind: 'row-cleared',
          t: ev.t,
          label: `${tag} 前排清空 ${fmtMarkerSec(ev.t)}`,
          shortLabel: `${tag} 清空`,
          side: ev.side,
          rowIndex: ev.rowIndex,
        });
      }
    }
  }
  markers.sort((x, y) => x.t - y.t);
  if (safeDur > EPS) {
    markers.push(
      hasDisengaged
        ? { id: 'end', kind: 'disengaged', t: safeDur, label: `脱离接战 ${fmtMarkerSec(safeDur)}`, shortLabel: '脱离接战' }
        : openingEndSide !== undefined
          ? { id: 'end', kind: 'end', t: safeDur, label: `先手终局 ${fmtMarkerSec(safeDur)}`, shortLabel: '先手终局', side: openingEndSide }
          : { id: 'end', kind: 'end', t: safeDur, label: `终局 ${fmtMarkerSec(safeDur)}`, shortLabel: '终局' },
    );
  }
  return markers;
}

function buildModel(
  kind: ReplayKind,
  status: FightEnd,
  winner: 'a' | 'b' | 'draw' | null,
  duration: number,
  a: ReplaySideMeta,
  b: ReplaySideMeta,
  trace: ContactReplayTrace,
  contact: ContactSummary,
): BattleReplayModel {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  let aPeakActive = 0;
  let bPeakActive = 0;
  for (const frame of trace.frames) {
    const aSum = frame.aRows.reduce((s, r) => s + r.active, 0);
    const bSum = frame.bRows.reduce((s, r) => s + r.active, 0);
    if (aSum > aPeakActive) aPeakActive = aSum;
    if (bSum > bPeakActive) bPeakActive = bSum;
  }
  return {
    kind,
    status,
    winner,
    duration: safeDuration,
    a,
    b,
    trace,
    contact,
    markers: extractReplayMarkers(trace, safeDuration, kind, a, b),
    bounds: computeStageBounds(trace),
    maxSideInitial: Math.max(a.totalInitial, b.totalInitial),
    aPeakActive,
    bPeakActive,
  };
}

export function buildOneVOneReplay(
  result: Extract<OneVOneResult, { mode: 'contact' }>,
  a: { uid: number; fighter: Fighter; civZh: string },
  b: { uid: number; fighter: Fighter; civZh: string },
): BattleReplayModel {
  const aMeta = buildSideMeta(a.civZh, [{ uid: a.uid, count: 1, fighter: a.fighter }], result.contact.a);
  const bMeta = buildSideMeta(b.civZh, [{ uid: b.uid, count: 1, fighter: b.fighter }], result.contact.b);
  const trace = result.replay ?? fallbackTrace(aMeta, bMeta, result.duration, result.aHp > 0 ? 1 : 0, result.bHp > 0 ? 1 : 0, result.aHp, result.bHp);
  return buildModel('one', result.status, result.winner, result.duration, aMeta, bMeta, trace, result.contact);
}

export function buildGroupReplay(
  result: GroupOutcome,
  a: { uid: number; fighter: Fighter; count: number; civZh: string },
  b: { uid: number; fighter: Fighter; count: number; civZh: string },
): BattleReplayModel {
  const aMeta = buildSideMeta(a.civZh, [{ uid: a.uid, count: a.count, fighter: a.fighter }], result.contact.a);
  const bMeta = buildSideMeta(b.civZh, [{ uid: b.uid, count: b.count, fighter: b.fighter }], result.contact.b);
  const aEndHp = result.winner === 'a' ? result.hpLeft : 0;
  const bEndHp = result.winner === 'b' ? result.hpLeft : 0;
  const trace = result.replay ?? fallbackTrace(aMeta, bMeta, result.duration, result.aAlive, result.bAlive, aEndHp, bEndHp);
  return buildModel('group', result.status, result.winner, result.duration, aMeta, bMeta, trace, result.contact);
}

export function buildMixedReplay(
  result: Exclude<ContactResult, { status: 'error' }>,
  a: { civZh: string; rows: readonly ArmyRow[] },
  b: { civZh: string; rows: readonly ArmyRow[] },
): BattleReplayModel {
  const aMeta = buildSideMeta(a.civZh, a.rows, result.contact.a);
  const bMeta = buildSideMeta(b.civZh, b.rows, result.contact.b);
  const winner = result.status === 'win' ? result.winner : result.status === 'draw' ? 'draw' : null;
  const trace = result.replay ?? fallbackTrace(aMeta, bMeta, result.duration, result.a.total.alive, result.b.total.alive, result.a.total.hp, result.b.total.hp);
  return buildModel('mixed', result.status, winner, result.duration, aMeta, bMeta, trace, result.contact);
}

export function deriveReplayPhase(
  model: BattleReplayModel,
  snap: Pick<BattleReplaySnapshot, 't' | 'gap' | 'vxA' | 'vxB' | 'openingSide' | 'openingVolley' | 'aFrontRow' | 'bFrontRow' | 'aRows' | 'bRows'>,
): ReplayPhaseInfo {
  const frames = model.trace.frames;
  // TRD v4 §4.1 8 级顺序：'disengaged' → 'ended' → 'kiting' → 'row-shift' → 'opening' → 'melee' → 'ranged-exchange' → 'approach'
  if (model.status === 'disengaged' && (!frames.length || snap.t >= model.duration - EPS)) {
    return { phase: 'disengaged', label: '双方脱离接战', tone: 'link', icon: 'info' };
  }
  if (!frames.length || snap.t >= model.duration - EPS) {
    if (model.status === 'timeout' || model.status === 'limit') {
      return { phase: 'ended', label: '模拟已停止', tone: 'link', icon: 'info' };
    }
    return { phase: 'ended', label: '战斗结束', tone: 'good', icon: 'check' };
  }
  if (model.trace.disengagedAt != null && snap.t >= model.trace.disengagedAt - EPS) {
    return { phase: 'disengaged', label: '双方脱离接战', tone: 'link', icon: 'info' };
  }
  if (snap.vxA < -EPS || snap.vxB > EPS) {
    return { phase: 'kiting', label: '远程拉扯后撤', tone: 'warn', icon: 'footprints' };
  }
  const hasClearedRow = snap.aRows.some((r) => r.cleared) || snap.bRows.some((r) => r.cleared);
  if (hasClearedRow && snap.gap > EPS && (snap.vxA > EPS || snap.vxB < -EPS)) {
    return { phase: 'row-shift', label: '前排清空 · 推进换行', tone: 'warn', icon: 'footprints' };
  }
  if (snap.openingSide !== null && snap.openingVolley >= 1) {
    return { phase: 'opening', label: `远程先手齐射 · 第 ${snap.openingVolley} 轮`, tone: 'warn', icon: 'bow-arrow' };
  }
  const metaA = model.a.rows[snap.aFrontRow];
  const metaB = model.b.rows[snap.bFrontRow];
  const rowA = snap.aRows[snap.aFrontRow];
  const rowB = snap.bRows[snap.bFrontRow];
  const aMeleeActive = Boolean(metaA && !metaA.ranged && rowA && rowA.active > 0);
  const bMeleeActive = Boolean(metaB && !metaB.ranged && rowB && rowB.active > 0);
  if (aMeleeActive || bMeleeActive) {
    const multiDepth =
      (aMeleeActive && metaA!.canFightAtMultipleDepths && rowA!.ranks > 1) || (bMeleeActive && metaB!.canFightAtMultipleDepths && rowB!.ranks > 1);
    const label = multiDepth ? '近战接敌 · 1 射程多排输出' : isLargeAggregate(model) ? `近战换血 · ${model.maxSideInitial} 规模聚合` : '近战接敌 · 换血中';
    return { phase: 'melee', label, tone: 'bad', icon: 'swords' };
  }
  const anyRangedActive =
    snap.aRows.some((r, i) => Boolean(model.a.rows[i]?.ranged) && r.active > 0) || snap.bRows.some((r, i) => Boolean(model.b.rows[i]?.ranged) && r.active > 0);
  if (snap.openingSide === null && ((Math.abs(snap.vxA) <= EPS && Math.abs(snap.vxB) <= EPS) || anyRangedActive)) {
    return { phase: 'ranged-exchange', label: '远程对射 · 换血中', tone: 'bad', icon: 'bow-arrow' };
  }
  const silenced = snap.aRows.some((r) => r.silencedByMinRange) || snap.bRows.some((r) => r.silencedByMinRange);
  if (silenced) {
    return { phase: 'approach', label: '前进接敌 · 突破最小射程', tone: 'link', icon: 'footprints' };
  }
  if (snap.openingSide !== null && snap.openingVolley === 0) {
    return { phase: 'approach', label: '前进接敌 · 远程瞄准中', tone: 'link', icon: 'footprints' };
  }
  return { phase: 'approach', label: '前进接敌', tone: 'link', icon: 'footprints' };
}

export function replayAt(frames: readonly ReplayFrame[], time: number): ReplayFrame;
export function replayAt(model: BattleReplayModel, time: number): BattleReplaySnapshot;
export function replayAt(modelOrFrames: BattleReplayModel | readonly ReplayFrame[], time: number): ReplayFrame | BattleReplaySnapshot {
  if (Array.isArray(modelOrFrames)) {
    const frames = modelOrFrames as readonly ReplayFrame[];
    if (!frames.length) return { time: 0, a: 0, b: 0 };
    let i = 0;
    while (i + 1 < frames.length && frames[i + 1]!.time <= time + EPS) i++;
    return frames[i]!;
  }
  const model = modelOrFrames as BattleReplayModel;
  const frames = model.trace.frames;
  if (!frames.length) {
    const z = { t: 0, aPos: 0, bPos: 0, gap: 0, vxA: 0, vxB: 0, openingSide: null, openingVolley: 0, aFrontRow: 0, bFrontRow: 0, aRows: [], bRows: [] };
    const phase = deriveReplayPhase(model, z);
    return {
      ...z,
      aAlive: 0,
      bAlive: 0,
      aHp: 0,
      bHp: 0,
      aActive: 0,
      bActive: 0,
      phase: phase.phase,
      phaseLabel: phase.label,
      phaseTone: phase.tone,
      phaseIcon: phase.icon,
      clearedEvents: [],
      blindZone: null,
      silencedMinRange: null,
      activeMarkerIndex: 0,
    };
  }
  const safeT = Number.isFinite(time) ? Math.max(0, Math.min(Math.max(0, model.duration), time)) : 0;
  let lo = 0,
    hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]!.t <= safeT + EPS) lo = mid + 1;
    else hi = mid;
  }
  const f = frames[Math.max(0, lo - 1)]!;
  const next = frames[Math.max(0, lo - 1) + 1];
  const dt = next ? Math.max(0, Math.min(safeT - f.t, next.t - f.t)) : 0;
  const aPos = f.aPos + f.vxA * dt;
  const bPos = f.bPos + f.vxB * dt;
  const gap = Math.max(0, bPos - aPos);
  const sum = (rows: readonly ContactReplayRowFrame[], pick: (r: ContactReplayRowFrame) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const clearedEvents = model.trace.events.filter(
    (ev): ev is Extract<ContactReplayEvent, { kind: 'row-cleared' }> => ev.kind === 'row-cleared' && ev.t <= safeT + EPS,
  );
  const blindZone = resolveReplayBlindZone(f.aRows, f.bRows, model.a.rows, model.b.rows, model.trace.events, safeT);
  const silencedMinRange = blindZone?.silenced ? blindZone.minRange : null;
  let activeMarkerIndex = 0;
  for (let i = 0; i < model.markers.length; i++) if (model.markers[i]!.t <= safeT + EPS) activeMarkerIndex = i;
  const phase = deriveReplayPhase(model, { ...f, t: safeT, gap });
  return {
    t: safeT,
    aPos,
    bPos,
    gap,
    vxA: f.vxA,
    vxB: f.vxB,
    openingSide: f.openingSide,
    openingVolley: f.openingVolley,
    aFrontRow: f.aFrontRow,
    bFrontRow: f.bFrontRow,
    aRows: f.aRows,
    bRows: f.bRows,
    aAlive: sum(f.aRows, (r) => r.alive),
    bAlive: sum(f.bRows, (r) => r.alive),
    aHp: sum(f.aRows, (r) => r.hp),
    bHp: sum(f.bRows, (r) => r.hp),
    aActive: sum(f.aRows, (r) => r.active),
    bActive: sum(f.bRows, (r) => r.active),
    phase: phase.phase,
    phaseLabel: phase.label,
    phaseTone: phase.tone,
    phaseIcon: phase.icon,
    clearedEvents,
    blindZone,
    silencedMinRange,
    activeMarkerIndex,
    ...(f.aRetreated !== undefined ? { aRetreated: f.aRetreated } : {}),
    ...(f.bRetreated !== undefined ? { bRetreated: f.bRetreated } : {}),
    ...(f.aRetreatCapHit !== undefined ? { aRetreatCapHit: f.aRetreatCapHit } : {}),
    ...(f.bRetreatCapHit !== undefined ? { bRetreatCapHit: f.bRetreatCapHit } : {}),
  };
}
