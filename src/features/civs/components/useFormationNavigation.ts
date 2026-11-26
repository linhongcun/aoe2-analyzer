import { useEffect, useRef, type MouseEvent } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { FormationView } from '../../../domain/civFormations';
import { resolveFormationRestoreTarget } from '../../../domain/formationScenarios';
import { usePreviousHistoryEntry, type NavigationEntry } from '../../../shared/utils/navigationEntry';

export const formationAnchor = (id: string) => `formation-${id}`;
export const isFormationHash = (hash: string) => hash === '#formations' || hash.startsWith('#formation-');
export const formationIdFromHash = (hash: string) => (hash.startsWith('#formation-') ? hash.slice('#formation-'.length) : null);

const documentToken = crypto.getRandomValues(new Uint32Array(3)).join('-') + ':';
let nextToken = 0;

function scrollToFormation(target: HTMLElement, center = false) {
  const chapters = target.closest('.civ-read')?.querySelector<HTMLElement>('.civ-chapters');
  const chapterBottom = chapters ? (parseFloat(getComputedStyle(chapters).top) || 0) + chapters.offsetHeight : 0;
  const headerBottom = document.querySelector('header.topbar')?.getBoundingClientRect().bottom ?? 0;
  const box = target.getBoundingClientRect();
  const offset = Math.max(chapterBottom + 16, headerBottom + 16, center ? (window.innerHeight - box.height) / 2 : 0);
  window.scrollBy(0, box.top - offset);
}

export interface FormationReading {
  token: string;
  key: string;
  idx: number;
  civ: string;
  route: string;
  routeId: string;
  scenarioId: string | null;
  entity: string;
  open: string[];
}

interface HistoryEntry {
  key?: string;
  idx?: number;
  usr?: Record<string, unknown>;
}

function readMemory(entry: HistoryEntry | null, civ: string): FormationReading | undefined {
  const value = entry?.usr?.formationReading as Partial<FormationReading> | undefined;
  if (
    value?.civ === civ &&
    typeof value.token === 'string' &&
    value.token.startsWith(documentToken) &&
    value.key === (entry?.key ?? 'default') &&
    typeof value.idx === 'number' &&
    value.idx === entry?.idx &&
    typeof value.route === 'string' &&
    typeof value.entity === 'string' &&
    Array.isArray(value.open) &&
    value.open.every((id) => typeof id === 'string')
  ) {
    const routeId = typeof value.routeId === 'string' ? value.routeId : value.route.replace(/^formation-/, '');
    const scenarioId = typeof value.scenarioId === 'string' ? value.scenarioId : null;
    return { ...(value as FormationReading), routeId, scenarioId };
  }
}

export function readFormationReturn(civ: string, previous: NavigationEntry | undefined) {
  const memory = readMemory(window.history.state, civ);
  return memory && previous?.formationReturn === memory.token && previous.idx === memory.idx + 1 ? memory : undefined;
}

interface UseFormationNavigationOptions {
  civ: string;
  views: readonly FormationView[];
  blocked: boolean;
  suppressRestore: boolean;
  activeRouteId: string | null;
  openScenarioId: string | null;
  onRestoreTarget: (target: { routeId: string | null; scenarioId: string | null }) => void;
}

export function useFormationNavigation({
  civ,
  views,
  blocked,
  suppressRestore,
  activeRouteId,
  openScenarioId,
  onRestoreTarget,
}: UseFormationNavigationOptions) {
  const root = useRef<HTMLElement>(null);
  const { key, pathname, search, hash, state } = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const previous = usePreviousHistoryEntry();
  const completed = useRef<string>();
  const lastHandledHash = useRef<string>('');
  const lastVisit = useRef<string>('');
  const focusAnchor = navigationType !== 'POP' && (state as { focusFormation?: unknown } | null)?.focusFormation === true;
  const suppressTabSwitchScroll = navigationType === 'REPLACE' && (state as { formationTabSwitch?: unknown } | null)?.formationTabSwitch === true;

  useEffect(() => {
    const visitKey = `${key}:${hash}`;
    if (lastVisit.current !== visitKey) {
      lastVisit.current = visitKey;
      completed.current = undefined;
      lastHandledHash.current = '';
    }
    if (suppressRestore) return;
    const token = readFormationReturn(civ, previous)?.token;
    const find = (id: string) => {
      const node = document.getElementById(id);
      return root.current?.contains(node) ? node : null;
    };

    if (token) {
      if (blocked) return;
      const entry = window.history.state as HistoryEntry | null;
      const memory = readMemory(entry, civ);
      if (!memory || memory.token !== token) return;
      const target = resolveFormationRestoreTarget(memory, views);
      const routeReady = target.fallbackToSection || activeRouteId === target.routeId;
      const scenarioReady = target.fallbackToSection || openScenarioId === target.scenarioId;
      if (!routeReady || !scenarioReady) {
        onRestoreTarget({ routeId: target.routeId, scenarioId: target.scenarioId });
        return;
      }
      const frame = requestAnimationFrame(() => {
        completed.current = key;
        lastHandledHash.current = `${key}:${hash}`;
        const latest = window.history.state as HistoryEntry | null;
        const latestMem = readMemory(latest, civ);
        if (!latestMem || latestMem.token !== token) return;
        for (const id of latestMem.open) {
          const detail = find(id);
          if (detail instanceof HTMLDetailsElement && detail.hasAttribute('data-formation-fold')) detail.open = true;
        }
        const entity = find(latestMem.entity);
        const routeTitle = target.routeId ? find(formationAnchor(target.routeId)) : null;
        const focusEl = entity ?? routeTitle ?? find('formations-title');
        focusEl?.focus({ preventScroll: true });
        if (focusEl) scrollToFormation(focusEl, Boolean(entity));
        const usr = { ...latest?.usr };
        delete usr.formationReading;
        window.history.replaceState({ ...latest, usr }, '');
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!isFormationHash(hash)) return;
    if (suppressTabSwitchScroll) {
      completed.current = key;
      lastHandledHash.current = `${key}:${hash}`;
      return;
    }
    if (blocked) return;
    const hashKey = `${key}:${hash}`;
    if (completed.current === key && lastHandledHash.current === hashKey) return;

    const wantedId = formationIdFromHash(hash);
    if (wantedId) {
      const target = resolveFormationRestoreTarget({ route: hash.slice(1), routeId: wantedId, scenarioId: null }, views);
      if (!target.fallbackToSection && target.routeId && activeRouteId !== target.routeId) {
        onRestoreTarget({ routeId: target.routeId, scenarioId: null });
        return;
      }
    }

    const frame = requestAnimationFrame(() => {
      completed.current = key;
      lastHandledHash.current = hashKey;
      const title = find(hash === '#formations' ? 'formations-title' : hash.slice(1)) ?? find('formations-title');
      if (focusAnchor) title?.focus({ preventScroll: true });
      if (title) scrollToFormation(title);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeRouteId, blocked, civ, focusAnchor, hash, key, onRestoreTarget, openScenarioId, previous, suppressRestore, suppressTabSwitchScroll, views]);

  function switchRouteHash(nextRouteId: string) {
    if (!hash.startsWith('#formation-')) return;
    const nextHash = `#${formationAnchor(nextRouteId)}`;
    if (hash === nextHash) return;
    navigate({ pathname, search, hash: nextHash }, { replace: true, state: { formationTabSwitch: true } });
  }

  function remember(event: MouseEvent<HTMLAnchorElement>, routeId: string, scenarioId: string | null, to: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const open = Array.from(root.current?.querySelectorAll('details[data-formation-fold][open]') ?? [], (detail) => detail.id);
    const entry = window.history.state as HistoryEntry | null;
    if (typeof entry?.idx !== 'number') return;
    event.preventDefault();
    const token = `${documentToken}${key}:${++nextToken}`;
    const memory: FormationReading = {
      civ,
      route: formationAnchor(routeId),
      routeId,
      scenarioId,
      entity: event.currentTarget.id,
      open,
      token,
      key,
      idx: entry.idx,
    };
    window.history.replaceState({ ...entry, usr: { ...entry.usr, formationReading: memory } }, '');
    navigate(to, { state: { formationReturn: token } });
  }

  return { root, remember, switchRouteHash };
}
