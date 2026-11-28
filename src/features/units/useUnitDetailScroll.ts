import { useCallback, useEffect, useRef } from 'react';
import { hasUnitRankTechParam } from '../../domain/unitCivRankFilter';
import { CONVERSION_ANCHOR, MONK_ID } from './conversion';

interface UnitDetailLocation {
  key: string;
  search: string;
  hash: string;
}

interface UnitDetailScrollOptions {
  unitId: number | undefined;
  workspace: boolean;
  hasSavedReverseReaderLocation: boolean;
  entityHistoryEmpty: boolean;
  showCivRank: boolean;
  treesReady: boolean;
}

/**
 * issue 1567：单位详情页滚屏定位 Hook。
 * - 常规滚屏不订阅 location.key，杜绝 setCiv / UnitGarrison / useSimState 引起的滚屏劫持；
 * - 就地科技筛选同步按预期目标 search 精确拦截，不匹配或切路由即时清零，杜绝布尔 ref 泄漏；
 * - 冷开带 rankTech 链接在 trees 首次就绪时单次对齐 #unit-civ-rank，同页 hash 锚点按 key:hash 去重。
 */
export function useUnitDetailScroll(loc: UnitDetailLocation, opts: UnitDetailScrollOptions) {
  const { unitId, workspace, hasSavedReverseReaderLocation, entityHistoryEmpty, showCivRank, treesReady } = opts;
  const { key: locationKey, search, hash } = loc;
  const tab = new URLSearchParams(search).get('tab');
  const hasRankTechParam = hasUnitRankTechParam(search);

  const pendingInPlaceSearchRef = useRef<string | null>(null);
  const prevRouteRef = useRef<{ unitId: number | undefined; workspace: boolean; tab: string | null; hash: string } | null>(null);
  const lastAnchorRef = useRef<string | null>(null);
  const lastNonHistoryKeyRef = useRef<string | null>(null);
  const pendingTreesAlignRef = useRef<{ unitId: number; locationKey: string } | null>(null);

  const markRankQuerySync = useCallback((nextSearch: string) => {
    pendingInPlaceSearchRef.current = nextSearch;
    pendingTreesAlignRef.current = null;
  }, []);

  useEffect(() => {
    const prev = prevRouteRef.current;
    const sameRouteContext = prev !== null && prev.unitId === unitId && prev.workspace === workspace && prev.tab === tab && prev.hash === hash;
    prevRouteRef.current = { unitId, workspace, tab, hash };

    if (prev !== null && prev.unitId !== unitId) {
      lastAnchorRef.current = null;
      lastNonHistoryKeyRef.current = null;
      pendingTreesAlignRef.current = null;
    }

    const expectedSearch = pendingInPlaceSearchRef.current;
    if (expectedSearch !== null) {
      pendingInPlaceSearchRef.current = null;
      if (sameRouteContext && search === expectedSearch) {
        lastNonHistoryKeyRef.current =
          tab === 'history' ? null : `${unitId ?? ''}:${workspace}:${tab ?? ''}:${hash}:${showCivRank && hasRankTechParam ? 'rank' : ''}`;
        return;
      }
    }

    if (hasSavedReverseReaderLocation) {
      pendingTreesAlignRef.current = null;
      return;
    }

    const nonHistoryKey = `${unitId ?? ''}:${workspace}:${tab ?? ''}:${hash}:${showCivRank && hasRankTechParam ? 'rank' : ''}`;
    if (tab !== 'history' && lastNonHistoryKeyRef.current === nonHistoryKey) return;
    lastNonHistoryKeyRef.current = tab === 'history' ? null : nonHistoryKey;

    if (workspace) {
      pendingTreesAlignRef.current = null;
      document.getElementById('unit-sim')?.scrollIntoView({ block: 'start' });
    } else if (tab === 'rel') {
      pendingTreesAlignRef.current = null;
      document.getElementById('unit-related')?.scrollIntoView({ block: 'start' });
    } else if (tab === 'history') {
      pendingTreesAlignRef.current = null;
      if (!entityHistoryEmpty) document.getElementById('unit-history')?.scrollIntoView({ block: 'start' });
    } else if (unitId === MONK_ID && hash === '#' + CONVERSION_ANCHOR) {
      pendingTreesAlignRef.current = null;
      const anchorKey = `${locationKey}:${hash}`;
      if (lastAnchorRef.current !== anchorKey) {
        lastAnchorRef.current = anchorKey;
        document.getElementById(CONVERSION_ANCHOR)?.scrollIntoView({ block: 'start' });
      }
    } else if (showCivRank && hash === '#unit-civ-rank') {
      pendingTreesAlignRef.current = null;
      const anchorKey = `${locationKey}:${hash}`;
      if (lastAnchorRef.current !== anchorKey) {
        lastAnchorRef.current = anchorKey;
        document.getElementById('unit-civ-rank')?.scrollIntoView({ block: 'start' });
      }
    } else if (showCivRank && hasRankTechParam) {
      document.getElementById('unit-civ-rank')?.scrollIntoView({ block: 'start' });
      pendingTreesAlignRef.current = !treesReady && unitId !== undefined ? { unitId, locationKey } : null;
    } else {
      pendingTreesAlignRef.current = null;
      scrollTo(0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, workspace, tab, hash, hasSavedReverseReaderLocation, entityHistoryEmpty, showCivRank, hasRankTechParam]);

  useEffect(() => {
    const pending = pendingTreesAlignRef.current;
    if (!pending) return;
    const eligible =
      pending.unitId === unitId &&
      pending.locationKey === locationKey &&
      showCivRank &&
      hasRankTechParam &&
      !hasSavedReverseReaderLocation &&
      !workspace &&
      tab !== 'rel' &&
      tab !== 'history' &&
      !(unitId === MONK_ID && hash === '#' + CONVERSION_ANCHOR);
    if (!eligible) {
      pendingTreesAlignRef.current = null;
      return;
    }
    if (!treesReady) return;
    pendingTreesAlignRef.current = null;
    document.getElementById('unit-civ-rank')?.scrollIntoView({ block: 'start' });
  }, [treesReady, unitId, locationKey, showCivRank, hasRankTechParam, hasSavedReverseReaderLocation, workspace, tab, hash]);

  useEffect(() => {
    if (pendingInPlaceSearchRef.current !== null) {
      pendingInPlaceSearchRef.current = null;
    }
  }, [search, unitId, workspace, tab, hash]);

  return { markRankQuerySync };
}
