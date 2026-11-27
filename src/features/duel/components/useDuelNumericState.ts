/**
 * issue 1483：单兵种单位 PK 五项数值输入的草稿状态、URL 同步与深链调整提示 hook。
 */
import { useMemo, useState } from 'react';
import type { Location, SetURLSearchParams } from 'react-router-dom';
import {
  adjustedDuelNumericParams,
  decodeDuelParams,
  parseDuelNumericInput,
  type DuelNumericAdjustment,
  type DuelNumericKey,
  type DuelParams,
} from '../../../domain/duelParams';
import { DEFAULT_MIN, DEFAULT_VILS } from '../../../domain/realCost';
import {
  activeDuelNumericErrors,
  hasDuelNumericDrafts,
  syncDuelDraftBundle,
  type DuelNumericDraftBundle,
  type DuelNumericDrafts,
} from '../logic/duelNumericDraft';

export function useDuelNumericState({
  sp,
  setSp,
  location,
  navigationType,
  decodedParams,
  canonSearch,
  linkStateAdjusted,
}: {
  sp: URLSearchParams;
  setSp: SetURLSearchParams;
  location: Location;
  navigationType: string;
  decodedParams: DuelParams;
  canonSearch: string;
  linkStateAdjusted: readonly DuelNumericAdjustment[];
}) {
  const { mode } = decodedParams;
  const adjustedInUrl = useMemo(() => adjustedDuelNumericParams(sp, decodedParams), [sp, decodedParams]);
  const [observed, setObserved] = useState({ key: location.key, search: location.search });
  const [draftBundle, setDraftBundle] = useState<DuelNumericDraftBundle | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<{ key: string; search: string } | null>(null);

  const locationChanged = observed.key !== location.key || observed.search !== location.search;
  const syncedDraftBundle = syncDuelDraftBundle(draftBundle, locationChanged, navigationType, location.search, canonSearch, mode);
  if (locationChanged || syncedDraftBundle !== draftBundle) {
    if (locationChanged) {
      setObserved({ key: location.key, search: location.search });
      if (dismissedNotice !== null) setDismissedNotice(null);
    }
    if (syncedDraftBundle !== draftBundle) setDraftBundle(syncedDraftBundle);
  }

  const activeDrafts: DuelNumericDrafts = syncedDraftBundle?.values ?? {};
  const numericErrors = activeDuelNumericErrors(mode, activeDrafts);
  const hasNumericErrors = numericErrors.length > 0;
  const noticeDismissed = !locationChanged && dismissedNotice !== null && dismissedNotice.key === location.key && dismissedNotice.search === location.search;
  const visibleParamsAdjusted = useMemo(
    () => (noticeDismissed || hasNumericErrors ? [] : adjustedInUrl.length > 0 ? adjustedInUrl : linkStateAdjusted),
    [noticeDismissed, hasNumericErrors, adjustedInUrl, linkStateAdjusted],
  );

  const applySearch = (next: URLSearchParams, nextDrafts: DuelNumericDrafts | null) => {
    const nextMode = decodeDuelParams(next).mode;
    const nextSearch = next.toString() ? `?${next.toString()}` : '';
    const preserved = nextDrafts && nextMode === mode && hasDuelNumericDrafts(nextDrafts) ? nextDrafts : null;
    setDraftBundle(preserved ? { mode: nextMode, search: nextSearch, fromSearch: location.search, values: preserved } : null);
    setSp(next, { replace: true });
  };

  const set = (k: Record<string, string>, drop: string[] = [], clearDrafts = false) => {
    const n = new URLSearchParams(sp);
    Object.entries(k).forEach(([a, b]) => n.set(a, b));
    drop.forEach((d) => n.delete(d));
    applySearch(n, clearDrafts ? null : activeDrafts);
  };

  const onNumericChange = (key: DuelNumericKey, raw: string) => {
    setDismissedNotice({ key: location.key, search: location.search });
    const parsed = parseDuelNumericInput(key, raw);
    if (parsed === null) {
      setDraftBundle({ mode, search: canonSearch, fromSearch: location.search, values: { ...activeDrafts, [key]: raw } });
      return;
    }
    const rest: DuelNumericDrafts = { ...activeDrafts };
    delete rest[key];
    const next = new URLSearchParams(sp);
    if (mode === 't' && key === 'vil' && parsed === DEFAULT_VILS) next.delete('vil');
    else if (mode === 't' && key === 'min' && parsed === DEFAULT_MIN) next.delete('min');
    else next.set(key, String(parsed));
    const nextSearch = next.toString() ? `?${next.toString()}` : '';
    setDraftBundle(hasDuelNumericDrafts(rest) ? { mode, search: nextSearch, fromSearch: location.search, values: rest } : null);
    if (nextSearch !== location.search || location.state !== null) {
      setSp(next, { replace: true });
    }
  };

  const fieldVal = (key: DuelNumericKey, cur: number) => activeDrafts[key] ?? String(cur);

  return { activeDrafts, numericErrors, hasNumericErrors, visibleParamsAdjusted, applySearch, set, onNumericChange, fieldVal };
}
