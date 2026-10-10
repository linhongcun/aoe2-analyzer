import { useState } from 'react';
/** 跨路由保留的 UI 状态（如筛选条件），与旧版“隐藏面板”行为一致 */
const store = new Map<string, unknown>();
export function useSticky<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : init));
  return [
    v,
    (n: T) => {
      store.set(key, n);
      setV(n);
    },
  ];
}
export const session = { lastCiv: '' as string, lastSim: null as null | { uid: number; civ: string; cmp: string } };
