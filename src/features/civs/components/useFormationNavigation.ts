import { useEffect, useRef, type MouseEvent } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { usePreviousHistoryEntry, type NavigationEntry } from '../../../shared/utils/navigationEntry';

export const formationAnchor = (id: string) => `formation-${id}`;
export const isFormationHash = (hash: string) => hash === '#formations' || hash.startsWith('#formation-');

function scrollToFormation(target: HTMLElement, center = false) {
  const chapters = target.closest('.civ-read')?.querySelector<HTMLElement>('.civ-chapters');
  const chapterBottom = chapters ? (parseFloat(getComputedStyle(chapters).top) || 0) + chapters.offsetHeight : 0;
  const headerBottom = document.querySelector('header.topbar')?.getBoundingClientRect().bottom ?? 0;
  const box = target.getBoundingClientRect();
  const offset = Math.max(chapterBottom + 16, headerBottom + 16, center ? (window.innerHeight - box.height) / 2 : 0);
  window.scrollBy(0, box.top - offset);
}

interface FormationReading {
  token: string;
  key: string;
  idx: number;
  civ: string;
  route: string;
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
    value.key === (entry?.key ?? 'default') &&
    typeof value.idx === 'number' &&
    value.idx === entry?.idx &&
    typeof value.route === 'string' &&
    typeof value.entity === 'string' &&
    Array.isArray(value.open) &&
    value.open.every((id) => typeof id === 'string')
  )
    return value as FormationReading;
}

export function readFormationReturn(civ: string, previous: NavigationEntry | undefined) {
  const memory = readMemory(window.history.state, civ);
  return memory && previous?.formationReturn === memory.token && previous.idx === memory.idx + 1 ? memory : undefined;
}

let nextToken = 0;

export function useFormationNavigation(civ: string, pending: boolean) {
  const root = useRef<HTMLElement>(null);
  const { key, hash, state } = useLocation();
  const navigate = useNavigate();
  const previous = usePreviousHistoryEntry();
  const completed = useRef<string>();
  const focusAnchor = useNavigationType() === 'PUSH' && state?.focusFormation === true;

  useEffect(() => {
    const find = (id: string) => {
      const node = document.getElementById(id);
      return root.current?.contains(node) ? node : null;
    };
    if (completed.current === key) return;
    const token = readFormationReturn(civ, previous)?.token;
    if (pending && (token || isFormationHash(hash))) return;
    const frame = requestAnimationFrame(() => {
      completed.current = key;
      const entry = window.history.state as HistoryEntry | null;
      const memory = readMemory(entry, civ);
      if (token && memory?.token === token) {
        for (const id of memory.open) {
          const detail = find(id);
          if (detail instanceof HTMLDetailsElement && detail.hasAttribute('data-formation-fold')) detail.open = true;
        }
        const entity = find(memory.entity);
        const title = find(memory.route) ?? find('formations-title');
        const target = entity ?? title;
        target?.focus({ preventScroll: true });
        if (target) scrollToFormation(target, Boolean(entity));
        const usr = { ...entry?.usr };
        delete usr.formationReading;
        window.history.replaceState({ ...entry, usr }, '');
        return;
      }
      if (isFormationHash(hash)) {
        const title = find(hash === '#formations' ? 'formations-title' : hash.slice(1)) ?? find('formations-title');
        if (focusAnchor) title?.focus({ preventScroll: true });
        if (title) scrollToFormation(title);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [civ, focusAnchor, hash, key, pending, previous]);

  function remember(event: MouseEvent<HTMLAnchorElement>, route: string, to: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const open = Array.from(root.current?.querySelectorAll('details[data-formation-fold][open]') ?? [], (detail) => detail.id);
    const entry = window.history.state as HistoryEntry | null;
    if (typeof entry?.idx !== 'number') return;
    event.preventDefault();
    const token = `${key}:${++nextToken}`;
    const memory: FormationReading = { civ, route, entity: event.currentTarget.id, open, token, key, idx: entry.idx };
    window.history.replaceState({ ...entry, usr: { ...entry.usr, formationReading: memory } }, '');
    navigate(to, { state: { formationReturn: token } });
  }

  return { root, remember };
}
