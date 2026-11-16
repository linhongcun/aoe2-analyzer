import type { Trees, Unit } from '../../domain/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { civs, loadCore, loadTrees, type Core } from '../../data';
import { useCoreTrees } from '../../shared/utils/useCoreTrees';

const UNIT_DETAIL_CIV_NAMES = civs.map((civ) => civ.en);

export interface UnitDetailProjection {
  unit: Unit;
  invalidFields: string[];
}

function projectPairs(value: unknown, field: string, invalidFields: Set<string>): [string, number][] {
  if (!Array.isArray(value)) {
    invalidFields.add(field);
    return [];
  }
  const counts = new Map<string, number>();
  const valid = new Map<string, number>();
  for (const item of value as unknown[]) {
    if (!Array.isArray(item) || item.length !== 2) {
      invalidFields.add(field);
      continue;
    }
    const [category, amount] = item;
    if (typeof category !== 'string' || !category || category.trim() !== category || /^类别\d+$/u.test(category)) {
      invalidFields.add(field);
      continue;
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      invalidFields.add(field);
      continue;
    }
    valid.set(category, amount);
  }
  for (const [category, count] of counts) {
    if (count > 1) {
      valid.delete(category);
      invalidFields.add(field);
    }
  }
  return [...valid].map(([category, amount]) => [category, amount] as [string, number]);
}

export function projectUnitForDetail(source: Unit): UnitDetailProjection {
  const invalidFields = new Set<string>();
  const atks = projectPairs((source as unknown as Record<string, unknown>).atks, 'atks', invalidFields);
  const armc = projectPairs((source as unknown as Record<string, unknown>).armc, 'armc', invalidFields);
  const arms = projectPairs((source as unknown as Record<string, unknown>).arms, 'arms', invalidFields);
  const rawCivs = (source as unknown as Record<string, unknown>).civs;
  const civs = Array.isArray(rawCivs) ? rawCivs.filter((civ): civ is string => typeof civ === 'string' && !!civ.trim()) : [];
  if (!Array.isArray(rawCivs) || civs.length !== rawCivs.length) invalidFields.add('civs');
  return { unit: { ...source, atks, armc, arms, civs }, invalidFields: [...invalidFields] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function unitIdentitySafe(value: unknown): value is Unit {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.en === 'string' &&
    typeof value.zh === 'string' &&
    (typeof value.type === 'string' || value.type === null) &&
    Number.isFinite(value.age) &&
    Number.isSafeInteger(value.b) &&
    (typeof value.pic === 'number' || typeof value.pic === 'string') &&
    (value.from_ === null || Number.isSafeInteger(value.from_)) &&
    typeof value.bz === 'string' &&
    typeof value.ben === 'string' &&
    (value.dlc === null || Number.isFinite(value.dlc))
  );
}

const hasSafeId = (value: unknown): value is { id: number } => isRecord(value) && Number.isSafeInteger(value.id);

function indexMatches(rows: readonly { id: number }[], index: Record<string, unknown>): boolean {
  return (
    rows.length === Object.keys(index).length &&
    rows.every(({ id }) => {
      const entry = index[id];
      return isRecord(entry) && entry.id === id;
    })
  );
}

export function coreSafeForUnitDetail(value: unknown): value is Core {
  if (
    !isRecord(value) ||
    !Array.isArray(value.units) ||
    !Array.isArray(value.techs) ||
    !Array.isArray(value.buildings) ||
    !isRecord(value.unitById) ||
    !isRecord(value.techById) ||
    !isRecord(value.buildingById) ||
    !isRecord(value.linker) ||
    !isRecord(value.fam)
  ) {
    return false;
  }

  const units = (value.units as unknown[]).filter(unitIdentitySafe);
  const techs = (value.techs as unknown[]).filter(hasSafeId);
  const buildings = (value.buildings as unknown[]).filter(hasSafeId);
  const unitById = value.unitById as Record<string, unknown>;
  const techById = value.techById as Record<string, unknown>;
  const buildingById = value.buildingById as Record<string, unknown>;
  const linker = value.linker as Record<string, unknown>;
  const families = value.fam as Record<string, unknown>;
  if (units.length !== value.units.length || !indexMatches(units, unitById)) return false;
  if (techs.length !== value.techs.length || !indexMatches(techs, techById)) return false;
  if (buildings.length !== value.buildings.length || !indexMatches(buildings, buildingById)) return false;
  if (!isRecord(linker.map) || !Object.values(linker.map).every((entry) => typeof entry === 'string')) return false;
  if (!(linker.re === null || linker.re instanceof RegExp)) return false;
  if (!isRecord(families.eliteOf) || !isRecord(families.baseOf)) return false;
  if (!Object.values(families.eliteOf).every(unitIdentitySafe) || !Object.values(families.baseOf).every(unitIdentitySafe)) return false;
  return true;
}

export function treesSafeForUnitDetail(value: unknown, civNames: readonly string[]): value is Trees {
  if (!isRecord(value) || !isRecord(value.t) || !isRecord(value.b)) return false;
  const treeMap = value.t;
  if (civNames.some((civ) => !Array.isArray(treeMap[civ]))) return false;
  for (const blocks of Object.values(treeMap)) {
    if (
      !Array.isArray(blocks) ||
      blocks.length === 0 ||
      !blocks.some((block) => Array.isArray(block) && Array.isArray(block[3]) && block[3].length > 0) ||
      !blocks.every(
        (block: unknown) =>
          Array.isArray(block) &&
          block.length >= 4 &&
          Number.isFinite(block[0]) &&
          Number.isFinite(block[1]) &&
          Number.isFinite(block[2]) &&
          Array.isArray(block[3]) &&
          block[3].every(
            (cell: unknown) =>
              Array.isArray(cell) &&
              cell.length >= 6 &&
              Number.isSafeInteger(cell[0]) &&
              cell[0] >= 0 &&
              cell[0] <= 7 &&
              Number.isFinite(cell[1]) &&
              (cell[2] === 'u' || cell[2] === 't' || cell[2] === 'b') &&
              Number.isSafeInteger(cell[3]) &&
              (cell[4] === 0 || cell[4] === 1) &&
              (cell[5] === null || Number.isSafeInteger(cell[5])),
          ),
      )
    )
      return false;
  }
  return (
    Object.keys(value.b).length > 0 &&
    Object.values(value.b).every(
      (building: unknown) =>
        Array.isArray(building) &&
        building.length >= 4 &&
        typeof building[0] === 'string' &&
        typeof building[1] === 'string' &&
        (typeof building[2] === 'string' || typeof building[2] === 'number') &&
        Number.isFinite(building[3]),
    )
  );
}

export interface LocalRetryGeneration {
  current: number;
}

export interface LocalRetryCallbacks<T> {
  begin: (attempt: number) => void;
  resolved: (value: T, attempt: number) => void;
  rejected: (attempt: number) => void;
}

export async function rereadUnitResource<T>(
  read: () => Promise<T>,
  generation: LocalRetryGeneration,
  callbacks: LocalRetryCallbacks<T>,
  fallback?: { data: T | null; error: boolean; retry: () => void },
): Promise<'shared-retry' | 'resolved' | 'rejected' | 'stale'> {
  if (fallback?.error && !fallback.data) {
    generation.current++;
    fallback.retry();
    return 'shared-retry';
  }
  const attempt = ++generation.current;
  callbacks.begin(attempt);
  try {
    const value = await read();
    if (generation.current !== attempt) return 'stale';
    callbacks.resolved(value, attempt);
    return 'resolved';
  } catch {
    if (generation.current !== attempt) return 'stale';
    callbacks.rejected(attempt);
    return 'rejected';
  }
}

interface LocalResource<T> {
  data: T | null;
  pending: boolean;
  error: boolean;
}

export function useUnitDetailResources() {
  const shared = useCoreTrees();
  const [localCore, setLocalCore] = useState<LocalResource<Core>>({ data: null, pending: false, error: false });
  const [localTrees, setLocalTrees] = useState<LocalResource<Trees>>({ data: null, pending: false, error: false });
  const coreGeneration = useRef<LocalRetryGeneration>({ current: 0 });
  const treesGeneration = useRef<LocalRetryGeneration>({ current: 0 });
  const civNames = UNIT_DETAIL_CIV_NAMES;
  const rawCore = localCore.data ?? shared.core.data;
  const core = coreSafeForUnitDetail(rawCore) ? rawCore : null;
  const rawTrees = localTrees.data ?? shared.trees.data;
  const trees = treesSafeForUnitDetail(rawTrees, civNames) ? rawTrees : null;
  const corePending = shared.core.pending || localCore.pending;
  const treesPending = shared.trees.pending || localTrees.pending;
  const coreError = shared.core.error || localCore.error || (!!rawCore && !core);
  const treesError = shared.trees.error || localTrees.error || (!!rawTrees && !trees);

  useEffect(
    () => () => {
      coreGeneration.current.current++;
      treesGeneration.current.current++;
    },
    [],
  );

  const retryCore = useCallback(() => {
    void rereadUnitResource(
      loadCore,
      coreGeneration.current,
      {
        begin: () => setLocalCore((current) => ({ ...current, pending: true, error: false })),
        resolved: (data) => setLocalCore({ data, pending: false, error: !coreSafeForUnitDetail(data) }),
        rejected: () => setLocalCore((current) => ({ ...current, pending: false, error: true })),
      },
      { data: shared.core.data, error: shared.core.error, retry: shared.core.retry },
    );
  }, [shared.core.data, shared.core.error, shared.core.retry]);

  const retryTrees = useCallback(() => {
    void rereadUnitResource(
      loadTrees,
      treesGeneration.current,
      {
        begin: () => setLocalTrees((current) => ({ ...current, pending: true, error: false })),
        resolved: (data) => setLocalTrees({ data, pending: false, error: !treesSafeForUnitDetail(data, civNames) }),
        rejected: () => setLocalTrees((current) => ({ ...current, pending: false, error: true })),
      },
      { data: shared.trees.data, error: shared.trees.error, retry: shared.trees.retry },
    );
  }, [civNames, shared.trees.data, shared.trees.error, shared.trees.retry]);

  return { core, rawCore, corePending, coreError, retryCore, trees, rawTrees, treesPending, treesError, retryTrees };
}
