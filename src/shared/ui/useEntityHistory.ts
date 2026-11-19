import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CivUpdatesData } from '../../domain/civUpdates';
import { projectReaderEvents, readerNodes } from '../../domain/historyReader';

export function defaultHistoryVersions(nodes: { id: string }[]) {
  return nodes.slice(0, nodes.length <= 2 ? 2 : 1).map((node) => node.id);
}

export function useEntityHistory(entityId: string | undefined, immediate = false) {
  const [result, setResult] = useState<{ id: string; attempt: number; data?: CivUpdatesData; error?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const emptyFocus = useRef<{ trigger: Element; heading: HTMLElement }>();
  useEffect(() => {
    if (!entityId) return;
    let active = true;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      import('../../data/civUpdates')
        .then(({ loadCivUpdates }) => loadCivUpdates(attempt > 0))
        .then(
          (data) => {
            if (!active) return;
            const entity = data.entities.find((row) => row.id === entityId);
            const empty = !entity || !projectReaderEvents(data, entity).length;
            const focused = typeof document === 'undefined' ? null : document.activeElement;
            const ownsFocus =
              focused?.closest('#tech-history, #unit-history, #building-history, [data-testid="civ-patches"]') ||
              (focused?.tagName === 'BUTTON' && focused.textContent?.trim() === '更新历史');
            const heading = ownsFocus ? focused?.closest('.pane')?.querySelector('h1') : null;
            emptyFocus.current =
              empty && focused && heading && typeof HTMLElement !== 'undefined' && heading instanceof HTMLElement ? { trigger: focused, heading } : undefined;
            setResult({ id: entityId, attempt, data });
          },
          () => {
            if (active) setResult({ id: entityId, attempt, error: true });
          },
        );
    };
    const frame = requestAnimationFrame(() => {
      if (immediate || attempt > 0) load();
      else if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(load, { timeout: 1000 });
      else timer = setTimeout(load, 0);
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      if (idle !== undefined) cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [entityId, attempt, immediate]);
  const current = result?.id === entityId && result?.attempt === attempt ? result : undefined;
  useLayoutEffect(() => {
    if (!current?.data) return;
    const pending = emptyFocus.current;
    emptyFocus.current = undefined;
    if (!pending || pending.trigger.isConnected) return;
    if (document.activeElement !== document.body && document.activeElement !== pending.trigger) return;
    pending.heading.tabIndex = -1;
    pending.heading.focus({ preventScroll: true });
    pending.heading.scrollIntoView({ block: 'start' });
  }, [current]);
  const data = current?.data;
  const entity = data?.entities.find((row) => row.id === entityId);
  const nodes = useMemo(() => (data && entity ? readerNodes(data, projectReaderEvents(data, entity), false) : []), [data, entity]);
  return {
    data,
    entity,
    nodes,
    empty: !!data && !nodes.length,
    error: !!current?.error,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
export type EntityHistoryResource = ReturnType<typeof useEntityHistory>;
