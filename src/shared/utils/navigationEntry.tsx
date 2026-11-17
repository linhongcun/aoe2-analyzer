import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export interface NavigationEntry {
  key: string;
  idx: number;
  formationReturn?: string;
}

const NavigationEntryContext = createContext<NavigationEntry | undefined>(undefined);
const observed = new Map<number, string>();

export function observedNavigationKey(index: number) {
  return observed.get(index);
}

/** 跟随 HashRouter 的同文档条目。刷新后没有上一条应用内记录。 */
export function NavigationEntryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const type = useNavigationType();
  const [entries, setEntries] = useState<{ current?: NavigationEntry; previous?: NavigationEntry }>({});
  if (entries.current?.key !== location.key) {
    const current = { key: location.key, idx: window.history.state?.idx, formationReturn: location.state?.formationReturn };
    if (Number.isInteger(current.idx)) {
      if (type === 'PUSH') for (const index of observed.keys()) if (index > current.idx) observed.delete(index);
      observed.set(current.idx, current.key);
    }
    setEntries({ current, previous: type === 'POP' ? entries.current : undefined });
  }
  return <NavigationEntryContext.Provider value={entries.previous}>{children}</NavigationEntryContext.Provider>;
}

export function usePreviousHistoryEntry() {
  return useContext(NavigationEntryContext);
}
