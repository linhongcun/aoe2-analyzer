import { useEffect, useState } from 'react';

/** 共享窄屏表判定 Hook（<= 720px，兼容 SSR 与 mock window）。 */
export function useNarrowTable(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 720px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 720px)');
    const sync = () => setNarrow(mql.matches);
    sync();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
    return undefined;
  }, []);
  return narrow;
}
