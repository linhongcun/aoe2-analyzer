import { useEffect, useState } from 'react';
import { coreCache, loadCore, loadTrees, treesCache, type Core } from './index';
import type { Trees } from '../domain/types';

export function useCore(): Core | null {
  const [c, set] = useState<Core | null>(coreCache);
  useEffect(() => {
    if (!c) void loadCore().then(set);
  }, [c]);
  return c;
}
export function useTrees(): Trees | null {
  const [t, set] = useState<Trees | null>(treesCache);
  useEffect(() => {
    if (!t) void loadTrees().then(set);
  }, [t]);
  return t;
}
