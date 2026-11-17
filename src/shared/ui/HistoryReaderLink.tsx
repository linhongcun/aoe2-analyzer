import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigationType, type Location } from 'react-router-dom';
import { encyclopediaHistoryPath } from '../../domain/historyReader';
import { observedNavigationKey } from '../utils/navigationEntry';

interface Snapshot {
  y: number;
  expanded?: string[];
  focusId?: string;
}

type Provenance = { idx: number; key: string; route: string };
const snapshots = new Map<string, Snapshot>();
const links = new Map<string, Provenance>();

export function historyVisitKey(location: Location) {
  return JSON.stringify([location.key, location.pathname, location.search, location.hash]);
}

export function rememberHistoryVisit(location: Location, snapshot: Snapshot) {
  const key = historyVisitKey(location);
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  if (snapshots.size > 60) snapshots.delete(snapshots.keys().next().value!);
}

export function savedHistoryVisit(location: Location) {
  return snapshots.get(historyVisitKey(location));
}

export function canPopHistoryReturn(state: unknown, route: string) {
  const token = (state as { historyVisit?: string } | null)?.historyVisit;
  const link = token && links.get(token);
  return !!link && link.route === route && window.history.state?.idx === link.idx + 1 && observedNavigationKey(link.idx) === link.key;
}

export function HistoryReaderLink({ to, from, id, expanded, children }: { to: string; from: string; id?: string; expanded?: string[]; children: ReactNode }) {
  const location = useLocation();
  const { key } = location;
  const token = key + '|' + from + '|' + to;
  const capture = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const idx = window.history.state?.idx;
    if (!Number.isInteger(idx)) return;
    if (id) rememberHistoryVisit(location, { y: window.scrollY, expanded: expanded ?? savedHistoryVisit(location)?.expanded, focusId: id });
    links.delete(token);
    links.set(token, { key, idx, route: from });
    if (links.size > 60) links.delete(links.keys().next().value!);
  };
  return (
    <Link id={id} to={to} state={{ historyVisit: token, historyFrom: from }} onClick={capture}>
      {children}
    </Link>
  );
}

export function EncyclopediaHistoryLink({ entityId, enabled = true }: { entityId: string; enabled?: boolean }) {
  const location = useLocation();
  const navigation = useNavigationType();
  const to = encyclopediaHistoryPath(entityId, location.pathname, location.search, location.hash);
  const from = new URLSearchParams(to.split('?')[1]).get('histReturn')!;
  const id = 'encyclopedia-complete-history';
  useEffect(() => {
    if (!enabled || navigation !== 'POP') return;
    const saved = savedHistoryVisit(location);
    if (saved?.focusId !== id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.focus({ preventScroll: true });
      window.scrollTo(0, saved.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, location, navigation]);
  if (!enabled) return null;
  return (
    <div className="entity-history-entry">
      <p>按版本阅读已收录的变化，按需查看依据与原文。</p>
      <HistoryReaderLink to={to} from={from} id={id}>
        查看完整历史
      </HistoryReaderLink>
    </div>
  );
}
