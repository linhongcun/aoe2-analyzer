import { civByEn } from '../../../data';
import { contactFight, contactFighterError, type ArmyRow, type ContactSummary } from '../../../domain/contactFight';
import { isKiteEligible, type KiteSummary } from '../../../domain/contactKite';
import type { DuelKite } from '../../../domain/duelParams';
import { unitRelicBonus } from '../../../domain/effects';
import type { Mode } from '../../../domain/duelState';
import { encodeMixedDuel, mixedDataVersion, type MixedSideInput } from '../../../domain/mixedDuelParams';
import { MIXED_RULE } from '../../../domain/mixedFight';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { isUnavail, type Resolved, type SideState } from './duelSide';
import type { MixedSideView } from './mixedDuel';

const PRESET_ZH = { f: '满科技', c: '当前时代满科技' } as const;

export const techFieldInvalid = (raw: string | null) => {
  if (raw === null) return false;
  const field = raw.split('.')[3] ?? '';
  if (field === '' || field === 'f' || field === 'c') return false;
  return !/^[1-9]\d*(?:-[1-9]\d*)*$/.test(field);
};

export const rawUid = (raw: string | null) => {
  if (raw === null) return null;
  const uid = Number(raw.split('.')[0]);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
};

const clampMixedQty = (value: number) => String(Math.max(1, Math.min(200, Math.floor(value) || 10)));
const budgetMixedQty = (value: number | null) =>
  value !== null && Number.isFinite(value) && Math.floor(value) >= 1 ? String(Math.min(200, Math.floor(value))) : '';

export function buildEnterMixedParams(
  a: Resolved,
  b: Resolved,
  mode: Mode,
  counts: { na: number; nb: number; cntA: number | null; cntB: number | null },
  kite: DuelKite,
): URLSearchParams {
  const side = (s: Resolved, qty: string, kOn: boolean): MixedSideInput => ({
    civ: s.civ,
    age: String(s.age),
    techs: [...s.sel].map(String),
    team: s.spec.team.map(String),
    rows: [{ uid: String(s.u.id), qty }],
    ...(kOn ? { kite: true } : {}),
    ...(s.relics > 0 ? { relics: String(s.relics) } : {}),
  });
  const eq = mode === 'r' || mode === 't';
  return encodeMixedDuel({
    rule: MIXED_RULE,
    data: mixedDataVersion(DATA_SOURCES),
    a: side(a, eq ? budgetMixedQty(counts.cntA) : clampMixedQty(counts.na), kite.a),
    b: side(b, eq ? budgetMixedQty(counts.cntB) : clampMixedQty(counts.nb), kite.b),
  });
}

export const formatBreakEvenSide = (s: Resolved, kite = false) => {
  const rb = s.relics > 0 ? unitRelicBonus(s.civ, s.u) : null;
  const relicNote = rb && s.age >= rb.minAge ? ` · 驻守 ${s.relics} 件圣物` : '';
  return (
    `${civByEn(s.civ)?.zh ?? s.civ} ${s.u.zh}` +
    (Array.isArray(s.spec.techs) ? (s.spec.techs.length ? ` · 自选科技 ${s.sel.size} 项` : ' · 无科技') : ` · ${PRESET_ZH[s.spec.techs]}`) +
    relicNote +
    (kite ? ' · 边走边射' : '')
  );
};

/** Round 4 P2-1 空安全：仅在 A/B 均非空时计算单兵与 1v1 远程开关资格（不附带 !hasUpgrade）。 */
export function resolveDuelKiteEligibility(mode: Mode, a: SideState | null, b: SideState | null): DuelKite | undefined {
  if (!a || !b) return undefined;
  const oneContactOk = mode !== '1' || (!isUnavail(a) && !isUnavail(b) && contactFighterError(a.F) === null && contactFighterError(b.F) === null);
  return {
    a: oneContactOk && !isUnavail(a) && isKiteEligible(a.F),
    b: oneContactOk && !isUnavail(b) && isKiteEligible(b.F),
  };
}

/** 混编侧是否存在至少一行符合拉扯准入的有效远程单位。 */
export function mixedSideCanKite(view: MixedSideView): boolean {
  return view.rows.some((row) => Boolean(row.resolved && isKiteEligible(row.resolved.F)));
}

/** 混编侧首个有效远程行之前是否存在近战前排。 */
export function mixedSideHasMeleeFront(view: MixedSideView): boolean {
  const firstRanged = view.rows.findIndex((row) => Boolean(row.resolved && isKiteEligible(row.resolved.F)));
  if (firstRanged <= 0) return false;
  return view.rows.slice(0, firstRanged).some((row) => Boolean(row.resolved && !row.resolved.F.ranged));
}

/** 是否任一方启用了拉扯模式。 */
export function hasAnyKiteEnabled(kite: KiteSummary | undefined): boolean {
  return Boolean(kite && (kite.a.enabled || kite.b.enabled));
}

import type { BattleReplayModel } from '../../../domain/battleReplay';

/** issue 1295 §4.1：仅触底或已触发拉扯且推算退距上限落入当前遍历包络内时返回 40 格参照线（严禁撑宽标尺）。 */
export function computeRetreatCapLines(model: BattleReplayModel): { side: 'a' | 'b'; x: number; hit: boolean }[] {
  const kite = model.contact.kite;
  if (!kite) return [];
  const cap = model.trace.retreatCap ?? 40;
  const last = model.trace.frames.at(-1);
  const { minX, maxX } = model.bounds;
  const lines: { side: 'a' | 'b'; x: number; hit: boolean }[] = [];
  for (const side of ['a', 'b'] as const) {
    const ev = model.trace.events.find((e) => e.kind === 'retreat-cap' && e.side === side);
    if (ev && ev.kind === 'retreat-cap' && Number.isFinite(ev.x)) {
      lines.push({ side, x: ev.x, hit: true });
      continue;
    }
    const summary = kite[side];
    const lastRet = side === 'a' ? (last?.aRetreated ?? 0) : (last?.bRetreated ?? 0);
    if (!summary.enabled || (!summary.triggered && !(lastRet > 1e-9)) || !last) continue;
    const projectedX = side === 'a' ? last.aPos - (cap - lastRet) : last.bPos + (cap - lastRet);
    if (Number.isFinite(projectedX) && projectedX >= minX - 1e-6 && projectedX <= maxX + 1e-6) {
      lines.push({ side, x: projectedX, hit: false });
    }
  }
  return lines;
}

/** UI 展示层单次计算相对站桩的先手多出齐射轮次（仅活跃拉扯且存在先手齐射时执行，< 1ms）。 */
export function standingOpeningDelta(aRows: readonly ArmyRow[], bRows: readonly ArmyRow[], contact: ContactSummary): number {
  const kite = contact.kite;
  const opening = contact.firstStrike;
  if (!kite || !opening || opening.volleys <= 0) return 0;
  if (!kite.a.triggered && !kite.b.triggered) return 0;
  const baseline = contactFight(aRows, bRows, { recordReplay: false });
  if (baseline.status === 'error') return 0;
  const baseVolleys = baseline.contact.firstStrike?.side === opening.side ? baseline.contact.firstStrike.volleys : 0;
  return Math.max(0, opening.volleys - baseVolleys);
}
