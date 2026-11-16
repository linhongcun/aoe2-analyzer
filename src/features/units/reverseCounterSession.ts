import { useCallback, useState } from 'react';

export interface ReverseCounterLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface ReverseCounterSession {
  version: 1;
  location: ReverseCounterLocation;
  filters: { civ: string; age: number | null };
  collapsed: string[];
  expandedRows: string[];
  openPk: { category: string; id: number } | null;
  anchor: string | null;
  fallbackAnchor: string | null;
  offset: number;
  focus: string | null;
}

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === 'string' && item.length <= 160);
const sameLocation = (a: ReverseCounterLocation, b: ReverseCounterLocation) => a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;

export function reverseCounterSessionKey(targetId: number | null, civ: string, location: ReverseCounterLocation): string | null {
  if (targetId === null || !Number.isSafeInteger(targetId) || targetId <= 0) return null;
  const locationScope = encodeURIComponent(JSON.stringify([civ.trim() ? civ : 'none', location.pathname, location.search, location.hash]));
  return `unit-reverse-counters:v2:${targetId}:${locationScope}`;
}

export function decodeReverseCounterSession(raw: string | null, location: ReverseCounterLocation): ReverseCounterSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !record.location || typeof record.location !== 'object' || Array.isArray(record.location)) return null;
    const savedLocation = record.location as Record<string, unknown>;
    if (
      typeof savedLocation.pathname !== 'string' ||
      typeof savedLocation.search !== 'string' ||
      typeof savedLocation.hash !== 'string' ||
      !sameLocation({ pathname: savedLocation.pathname, search: savedLocation.search, hash: savedLocation.hash }, location)
    )
      return null;
    if (!record.filters || typeof record.filters !== 'object' || Array.isArray(record.filters)) return null;
    const filters = record.filters as Record<string, unknown>;
    if (typeof filters.civ !== 'string' || filters.civ.length > 80) return null;
    if (filters.age !== null && ![1, 2, 3, 4].includes(filters.age as number)) return null;
    if (!isStringList(record.collapsed) || !isStringList(record.expandedRows)) return null;
    if (typeof record.offset !== 'number' || !Number.isFinite(record.offset) || Math.abs(record.offset) > 10_000) return null;
    const safeOptional = (item: unknown): string | null => (typeof item === 'string' && item.length <= 160 ? item : null);
    const savedPk = record.openPk && typeof record.openPk === 'object' && !Array.isArray(record.openPk) ? (record.openPk as Record<string, unknown>) : null;
    const openPk =
      savedPk &&
      typeof savedPk.category === 'string' &&
      savedPk.category.length > 0 &&
      savedPk.category.length <= 160 &&
      Number.isSafeInteger(savedPk.id) &&
      (savedPk.id as number) > 0
        ? { category: savedPk.category, id: savedPk.id as number }
        : null;
    return {
      version: 1,
      location: { pathname: savedLocation.pathname, search: savedLocation.search, hash: savedLocation.hash },
      filters: { civ: filters.civ, age: filters.age as number | null },
      collapsed: [...new Set(record.collapsed)],
      expandedRows: [...new Set(record.expandedRows)],
      openPk,
      anchor: safeOptional(record.anchor),
      fallbackAnchor: safeOptional(record.fallbackAnchor),
      offset: record.offset,
      focus: safeOptional(record.focus),
    };
  } catch {
    return null;
  }
}

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readReverseCounterSession(
  key: string | null,
  location: ReverseCounterLocation,
  storage: SessionStorageLike | null = sessionStorageOrNull(),
): ReverseCounterSession | null {
  if (!key) return null;
  try {
    return storage ? decodeReverseCounterSession(storage.getItem(key), location) : null;
  } catch {
    return null;
  }
}

export function writeReverseCounterSession(
  key: string | null,
  value: ReverseCounterSession,
  storage: SessionStorageLike | null = sessionStorageOrNull(),
): boolean {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function useReverseCounterSession(targetId: number | null, civ: string, location: ReverseCounterLocation) {
  const key = reverseCounterSessionKey(targetId, civ, location);
  const handledKey = JSON.stringify([key, location.pathname, location.search, location.hash]);
  const [snapshot, setSnapshot] = useState(() => ({
    identity: handledKey,
    lifecycle: 1,
    record: readReverseCounterSession(key, location),
  }));
  let captured = snapshot;
  if (snapshot.identity !== handledKey) {
    captured = {
      identity: handledKey,
      lifecycle: snapshot.lifecycle + 1,
      record: readReverseCounterSession(key, location),
    };
    setSnapshot(captured);
  }
  const [restoredSnapshot, setRestoredSnapshot] = useState<typeof snapshot | null>(null);
  const restoreHandled = restoredSnapshot === captured;
  const restorePending = !!captured.record && !restoreHandled;
  const markRestored = useCallback(() => setRestoredSnapshot(captured), [captured]);
  return {
    key,
    identity: captured,
    record: captured.record,
    restorePending,
    restoreHandled,
    markRestored,
  };
}
