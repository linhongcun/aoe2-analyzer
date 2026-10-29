import { useEffect, useState } from 'react';
import { coreCache, loadCore, loadTrees, treesCache } from '../../data';
import type { ProductionContext } from '../../domain/production';

export function useProductionContext() {
  const [context, setContext] = useState<ProductionContext | null>(() => (coreCache && treesCache ? { core: coreCache, trees: treesCache } : null));
  const [error, setError] = useState(false);
  useEffect(() => {
    if (context) return;
    let active = true;
    void Promise.all([loadCore(), loadTrees()]).then(
      ([core, trees]) => {
        if (active) setContext({ core, trees });
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [context]);
  return { context, error };
}
