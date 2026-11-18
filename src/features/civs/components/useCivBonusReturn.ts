import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { usePreviousHistoryEntry } from '../../../shared/utils/navigationEntry';

export interface BonusSnapshot {
  sourceKey: string;
  sourcePath: string;
  sourceSearch: string;
  sourceHash: string;
  sourceIdx: number;
  civ: string;
  bonusId: string;
  scrollY: number;
  expectedUrl: string;
  destinationKey: string;
  destinationIdx: number;
}

export interface HistoryState {
  key?: string;
  idx?: number;
}

interface RouteIdentity {
  civ: string;
  key: string;
  pathname: string;
  search: string;
  hash: string;
}

const snapshots: BonusSnapshot[] = [];
const consumedSnapshots = new WeakSet<BonusSnapshot>();
let arrivalOwner: { route: RouteIdentity; snapshot: BonusSnapshot } | null = null;
let hookMount = 0;

function sameRoute(left: RouteIdentity, right: RouteIdentity) {
  return left.civ === right.civ && left.key === right.key && left.pathname === right.pathname && left.search === right.search && left.hash === right.hash;
}

function removeConsumedAt(route: RouteIdentity) {
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index]!;
    if (
      consumedSnapshots.has(snapshot) &&
      snapshot.sourceKey === route.key &&
      snapshot.sourcePath === route.pathname &&
      snapshot.sourceSearch === route.search &&
      snapshot.sourceHash === route.hash &&
      snapshot.civ === route.civ
    )
      snapshots.splice(index, 1);
  }
}

export function isUnmodifiedPrimaryClick(event: Pick<MouseEvent<HTMLElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function committedDestination(expectedUrl: string, sourceKey: string, sourceIdx: number, currentUrl: string, history: HistoryState | null) {
  if (
    currentUrl !== expectedUrl ||
    typeof history?.idx !== 'number' ||
    history.idx !== sourceIdx + 1 ||
    typeof history.key !== 'string' ||
    history.key === sourceKey
  )
    return undefined;
  return { key: history.key, idx: history.idx };
}

export function matchesBonusReturn(
  snapshot: BonusSnapshot,
  current: { civ: string; key: string; pathname: string; search: string; hash: string },
  previous: { key: string; idx: number | undefined } | undefined,
  history: HistoryState | null,
) {
  return (
    snapshot.civ === current.civ &&
    snapshot.sourceKey === current.key &&
    snapshot.sourcePath === current.pathname &&
    snapshot.sourceSearch === current.search &&
    snapshot.sourceHash === current.hash &&
    snapshot.destinationKey === previous?.key &&
    snapshot.destinationIdx === previous?.idx &&
    history?.idx === snapshot.sourceIdx
  );
}

export function useCivBonusReturn(civ: string) {
  const location = useLocation();
  const navigation = useNavigationType();
  const previous = usePreviousHistoryEntry();
  const current: RouteIdentity = { civ, key: location.key, pathname: location.pathname, search: location.search, hash: location.hash };
  const currentRoute = useRef<RouteIdentity>(current);
  const matching =
    navigation === 'POP'
      ? snapshots.find((snapshot) => matchesBonusReturn(snapshot, current, previous, window.history.state as HistoryState | null))
      : undefined;
  const frozenOwner = arrivalOwner && sameRoute(arrivalOwner.route, current) ? arrivalOwner.snapshot : undefined;
  const activeSnapshot = matching ?? frozenOwner;
  const ownsRestore = !!activeSnapshot;

  useLayoutEffect(() => {
    const route: RouteIdentity = { civ, key: location.key, pathname: location.pathname, search: location.search, hash: location.hash };
    const priorRoute = currentRoute.current;
    if (!sameRoute(priorRoute, route)) removeConsumedAt(priorRoute);
    currentRoute.current = route;
    if (arrivalOwner && !sameRoute(arrivalOwner.route, route)) {
      removeConsumedAt(arrivalOwner.route);
      arrivalOwner = null;
    }
    if (!matching) return;
    arrivalOwner = { route, snapshot: matching };
    if (consumedSnapshots.has(matching)) return;
    const frame = requestAnimationFrame(() => {
      const arrived = currentRoute.current;
      const history = window.history.state as HistoryState | null;
      if (
        arrived.civ !== matching.civ ||
        arrived.key !== matching.sourceKey ||
        arrived.pathname !== matching.sourcePath ||
        arrived.search !== matching.sourceSearch ||
        arrived.hash !== matching.sourceHash ||
        history?.idx !== matching.sourceIdx
      )
        return;
      window.scrollTo(0, matching.scrollY);
      const trigger = Array.from(document.querySelectorAll<HTMLElement>('[data-bonus-action]')).find(
        (element) => element.dataset.bonusAction === matching.bonusId,
      );
      const fallback = document.getElementById('civ-bonus-title') ?? document.querySelector<HTMLElement>('#bonuses h2');
      (trigger ?? fallback)?.focus({ preventScroll: true });
      consumedSnapshots.add(matching);
    });
    return () => cancelAnimationFrame(frame);
  }, [civ, location.hash, location.key, location.pathname, location.search, matching]);

  useEffect(() => {
    const mount = ++hookMount;
    return () => {
      queueMicrotask(() => {
        if (hookMount !== mount) return;
        const route = currentRoute.current;
        removeConsumedAt(route);
        if (arrivalOwner && sameRoute(arrivalOwner.route, route)) arrivalOwner = null;
      });
    };
  }, []);

  const captureLink = useCallback((event: MouseEvent<HTMLElement>, bonusId: string, scrollY: number) => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (!(target instanceof HTMLAnchorElement) || target.hasAttribute('download') || (target.target && target.target !== '_self')) return;
    const expected = new URL(target.href, window.location.href);
    if (expected.origin !== window.location.origin || !expected.hash.startsWith('#/') || expected.href === window.location.href) return;
    const history = window.history.state as HistoryState | null;
    if (typeof history?.idx !== 'number') return;
    const source = currentRoute.current;
    const sourceIdx = history.idx;
    const expectedUrl = expected.href;
    return () => {
      const history = window.history.state as HistoryState | null;
      const destination = committedDestination(expectedUrl, source.key, sourceIdx, window.location.href, history);
      if (!destination) return;
      const snapshot: BonusSnapshot = {
        sourceKey: source.key,
        sourcePath: source.pathname,
        sourceSearch: source.search,
        sourceHash: source.hash,
        sourceIdx,
        civ: source.civ,
        bonusId,
        scrollY,
        expectedUrl,
        destinationKey: destination.key,
        destinationIdx: destination.idx,
      };
      const existing = snapshots.findIndex((item) => item.sourceKey === snapshot.sourceKey);
      if (existing >= 0) snapshots.splice(existing, 1);
      snapshots.push(snapshot);
      if (snapshots.length > 8) snapshots.shift();
    };
  }, []);

  return { ownsRestore, captureLink };
}
