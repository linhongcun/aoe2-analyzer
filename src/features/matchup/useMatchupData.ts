import { useCoreTrees } from '../../shared/utils/useCoreTrees';
import { useMemo } from 'react';

export function useMatchupData() {
  const resources = useCoreTrees();
  const data = useMemo(
    () => (resources.core.data && resources.trees.data ? { core: resources.core.data, trees: resources.trees.data } : null),
    [resources.core.data, resources.trees.data],
  );
  return {
    data,
    error: resources.core.error || resources.trees.error,
    retry: resources.retry,
  };
}
