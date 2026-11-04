import { useCallback, useEffect, useRef, useState } from 'react';
import { coreCache, loadCore, loadTrees, treesCache } from '../../data';

interface ResourceState<T> {
  data: T | null;
  pending: boolean;
  error: boolean;
  generation: number;
}
function useResource<T>(cached: T | null, load: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>(() => ({ data: cached, pending: !cached, error: false, generation: 0 }));
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (state.data) return;
    let live = true;
    const ticket = ++generation.current;
    setState((current) => (current.data ? current : { data: null, pending: true, error: false, generation: ticket }));
    void Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (live && generation.current === ticket)
            setState((current) =>
              live && generation.current === ticket && current.generation === ticket && !current.data
                ? { data, pending: false, error: false, generation: ticket }
                : current,
            );
        },
        () => {
          if (live && generation.current === ticket)
            setState((current) =>
              live && generation.current === ticket && current.generation === ticket && !current.data
                ? { data: null, pending: false, error: true, generation: ticket }
                : current,
            );
        },
      );
    return () => {
      live = false;
    };
  }, [load, attempt, state.data]);
  const retry = useCallback(() => {
    if (!mounted.current || state.data || state.pending || generation.current !== state.generation) return;
    generation.current++;
    setState((current) => (current.data ? current : { ...current, pending: true, error: false }));
    setAttempt((current) => current + 1);
  }, [state.data, state.pending, state.generation]);
  return { data: state.data, pending: state.pending, error: state.error, retry };
}

/** Three opted-in consumers preserve successful resources while retrying failures. */
export function useCoreTrees() {
  const core = useResource(coreCache, loadCore);
  const trees = useResource(treesCache, loadTrees);
  const retry = useCallback(() => {
    core.retry();
    trees.retry();
  }, [core.retry, trees.retry]);
  return { core, trees, retry };
}
export type CoreTreesResources = ReturnType<typeof useCoreTrees>;
