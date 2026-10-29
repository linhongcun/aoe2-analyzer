import { useEffect, useState } from 'react';
import { coreCache, loadCore, loadTrees, treesCache, type Core } from '../../data';
import type { Trees } from '../../domain/types';

export function useMatchupData() {
  const [data, setData] = useState<{ core: Core; trees: Trees } | null>(() => (coreCache && treesCache ? { core: coreCache, trees: treesCache } : null));
  const [error, setError] = useState(false);
  useEffect(() => {
    if (data) return;
    let active = true;
    void Promise.all([loadCore(), loadTrees()]).then(
      ([core, trees]) => {
        if (active) setData({ core, trees });
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [data]);
  return { data, error };
}
