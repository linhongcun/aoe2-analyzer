import { readQueryRelics, sameSearchIgnoringRelics } from '../../domain/relicParams';
import { unitWorkspaceOpen, withUnitTab } from '../../domain/unitDetailView';
import type { SimRoute } from '../../domain/simulator';

export interface UnitSimLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface UnitSimReturnProvenance {
  version: 1;
  targetId: number;
  source: UnitSimLocation;
  expected: UnitSimLocation;
  sourceCiv: string | null;
  expectedCiv: string | null;
}

const stateKey = 'unitSimReturnProvenance';

function strictUnitRoute(pathname: string): SimRoute | null {
  const match = /^\/unit\/(\d+)(?:\/([^/?#]*))?(?:\/(\d))?(?:\/([\d,]*))?(?:\/([\d,]*))?\/?$/.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const ids = (match[4] ?? '').split(',').filter(Boolean).map(Number);
  const team = (match[5] ?? '').split(',').filter(Boolean).map(Number);
  if ([...ids, ...team].some((value) => !Number.isSafeInteger(value))) return null;
  return {
    id,
    civ: match[2] || undefined,
    age: match[3] ? Number(match[3]) : undefined,
    ids,
    team,
  };
}

function isLocation(value: unknown): value is UnitSimLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as UnitSimLocation;
  return (
    typeof candidate.pathname === 'string' &&
    candidate.pathname.startsWith('/') &&
    typeof candidate.search === 'string' &&
    (candidate.search === '' || (candidate.search.startsWith('?') && !candidate.search.includes('#'))) &&
    typeof candidate.hash === 'string' &&
    (candidate.hash === '' || candidate.hash.startsWith('#'))
  );
}

export function sameUnitSimLocation(a: UnitSimLocation, b: UnitSimLocation): boolean {
  return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

function parameters(search: string): URLSearchParams | null {
  if (search !== '' && !search.startsWith('?')) return null;
  return new URLSearchParams(search ? search.slice(1) : '');
}

function explicitCiv(route: SimRoute, search: string): string | null | false {
  if (route.civ) return route.civ;
  const params = parameters(search);
  if (!params) return false;
  const civs = params.getAll('civ');
  if (civs.length > 1) return false;
  return civs[0] || null;
}

function overviewCiv(location: UnitSimLocation, targetId: number, availableCivs: readonly string[], suppliedCiv?: string): string | null | false {
  if (!isLocation(location)) return false;
  const route = strictUnitRoute(location.pathname);
  const params = parameters(location.search);
  if (!route || route.id !== targetId || !params) return false;
  const tabs = params.getAll('tab');
  if (tabs.length > 1 || (tabs.length === 1 && tabs[0] !== 'ov') || unitWorkspaceOpen(route, location.search)) return false;
  const civ = explicitCiv(route, location.search);
  if (civ === false || (civ && !availableCivs.includes(civ))) return false;
  if (suppliedCiv && (!availableCivs.includes(suppliedCiv) || (civ && suppliedCiv !== civ))) return false;
  return suppliedCiv ?? civ;
}

function isSimulatorLocation(
  location: UnitSimLocation,
  targetId: number,
  availableCivs: readonly string[],
  civ: string | undefined,
  requireExplicitCiv: boolean,
): boolean {
  if (!isLocation(location) || (civ && !availableCivs.includes(civ))) return false;
  const route = strictUnitRoute(location.pathname);
  const params = parameters(location.search);
  if (!route || route.id !== targetId || !params || params.getAll('tab').length !== 1 || params.get('tab') !== 'sim') return false;
  const urlCiv = explicitCiv(route, location.search);
  if (urlCiv === false || (urlCiv && (!availableCivs.includes(urlCiv) || (civ && urlCiv !== civ)))) return false;
  return !requireExplicitCiv || (!!civ && urlCiv === civ);
}

function readProvenance(state: unknown): UnitSimReturnProvenance | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[stateKey];
  if (!value || typeof value !== 'object') return null;
  const candidate = value as UnitSimReturnProvenance;
  if (
    candidate.version !== 1 ||
    !Number.isSafeInteger(candidate.targetId) ||
    candidate.targetId <= 0 ||
    !isLocation(candidate.source) ||
    !isLocation(candidate.expected) ||
    !(candidate.sourceCiv === null || typeof candidate.sourceCiv === 'string') ||
    !(candidate.expectedCiv === null || typeof candidate.expectedCiv === 'string')
  )
    return null;
  return candidate;
}

export function createUnitSimReturnState(
  source: UnitSimLocation,
  expected: UnitSimLocation,
  targetId: number,
  availableCivs: readonly string[],
  sourceCiv?: string,
): unknown {
  const resolvedCiv = overviewCiv(source, targetId, availableCivs, sourceCiv);
  if (resolvedCiv === false || !isLocation(expected)) return undefined;
  if (!sameUnitSimLocation(expected, { pathname: source.pathname, search: withUnitTab(source.search, 'sim'), hash: source.hash })) return undefined;
  const expectedRoute = strictUnitRoute(expected.pathname);
  if (!expectedRoute || expectedRoute.id !== targetId) return undefined;
  const expectedUrlCiv = explicitCiv(expectedRoute, expected.search);
  if (
    expectedUrlCiv === false ||
    (expectedUrlCiv && !availableCivs.includes(expectedUrlCiv)) ||
    (resolvedCiv && expectedUrlCiv && resolvedCiv !== expectedUrlCiv) ||
    !isSimulatorLocation(expected, targetId, availableCivs, resolvedCiv ?? undefined, false)
  )
    return undefined;
  const expectedCiv = resolvedCiv ?? expectedUrlCiv;
  const provenance: UnitSimReturnProvenance = {
    version: 1,
    targetId,
    source: { ...source },
    expected: { ...expected },
    sourceCiv: resolvedCiv,
    expectedCiv: expectedCiv || null,
  };
  return { [stateKey]: provenance };
}

export function advanceUnitSimReturnState(
  state: unknown,
  current: UnitSimLocation,
  next: UnitSimLocation,
  targetId: number,
  availableCivs: readonly string[],
  currentCiv: string,
  maxRelics = 0,
): unknown {
  const provenance = readProvenance(state);
  if (!provenance || provenance.targetId !== targetId || !sameUnitSimLocation(provenance.expected, current)) return undefined;
  const sourceCiv = overviewCiv(provenance.source, targetId, availableCivs, provenance.sourceCiv ?? undefined);
  const samePath = next.pathname === current.pathname;
  const searchAllowed =
    next.search === current.search || (sameSearchIgnoringRelics(current.search, next.search) && !readQueryRelics(next.search, maxRelics).dirty);
  if (
    sourceCiv === false ||
    sourceCiv !== provenance.sourceCiv ||
    !searchAllowed ||
    next.hash !== current.hash ||
    !isSimulatorLocation(current, targetId, availableCivs, currentCiv, false) ||
    (provenance.expectedCiv !== null && provenance.expectedCiv !== currentCiv) ||
    (provenance.sourceCiv !== null && provenance.sourceCiv !== currentCiv) ||
    !isSimulatorLocation(next, targetId, availableCivs, currentCiv, !samePath)
  )
    return undefined;
  return {
    [stateKey]: {
      ...provenance,
      expected: { ...next },
      expectedCiv: samePath ? provenance.expectedCiv : (provenance.expectedCiv ?? currentCiv),
    },
  };
}

export function readUnitSimReturnSource(
  state: unknown,
  current: UnitSimLocation,
  targetId: number,
  availableCivs: readonly string[],
  currentCiv?: string,
): UnitSimLocation | null {
  const provenance = readProvenance(state);
  if (!provenance || provenance.targetId !== targetId || !sameUnitSimLocation(provenance.expected, current)) return null;
  const sourceCiv = overviewCiv(provenance.source, targetId, availableCivs, provenance.sourceCiv ?? undefined);
  const route = strictUnitRoute(current.pathname);
  const urlCiv = route ? explicitCiv(route, current.search) : false;
  if (
    sourceCiv === false ||
    sourceCiv !== provenance.sourceCiv ||
    !isLocation(current) ||
    !route ||
    !isSimulatorLocation(current, targetId, availableCivs, provenance.expectedCiv ?? currentCiv, false) ||
    (currentCiv && !availableCivs.includes(currentCiv)) ||
    (provenance.expectedCiv !== null && currentCiv && provenance.expectedCiv !== currentCiv) ||
    (provenance.expectedCiv === null && urlCiv !== null) ||
    urlCiv === false ||
    (provenance.sourceCiv !== null && provenance.expectedCiv !== provenance.sourceCiv)
  )
    return null;
  return { ...provenance.source };
}
