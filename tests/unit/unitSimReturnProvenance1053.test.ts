import { createElement, useEffect } from 'react';
import { MemoryRouter, resolvePath, useLocation, useNavigate } from 'react-router-dom';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { withUnitTab } from '../../src/domain/unitDetailView';
import {
  advanceUnitSimReturnState,
  createUnitSimReturnState,
  readUnitSimReturnSource,
  type UnitSimLocation,
} from '../../src/features/units/unitSimReturnProvenance';

const civs = ['Franks', 'Goths'];
const sourceA: UnitSimLocation = { pathname: '/unit/40', search: '?civ=Franks&tab=ov&x=%23&order=2', hash: '#reverse-counter-row' };
const simA: UnitSimLocation = { ...sourceA, search: withUnitTab(sourceA.search, 'sim') };

let renderer: ReactTestRenderer | null = null;
let route!: { location: UnitSimLocation; state: unknown };
let routerActions!: {
  open: () => void;
  go: (pathname: string, civ: string) => void;
  canonicalReplace: (pathname: string, civ: string) => void;
  close: () => void;
  navigate: (to: string) => void;
  back: () => void;
};

function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const current = { pathname: location.pathname, search: location.search, hash: location.hash };
    route = { location: current, state: location.state };
    const open = () => {
      const destination = { ...current, search: withUnitTab(current.search, 'sim') };
      const state = createUnitSimReturnState(current, destination, 40, civs, new URLSearchParams(current.search).get('civ') ?? undefined);
      navigate(destination, { state });
    };
    const replace = (pathname: string, civ: string) => {
      const next = resolvePath({ pathname, search: current.search, hash: current.hash }, current.pathname);
      const state = advanceUnitSimReturnState(route.state, current, next, 40, civs, civ);
      navigate(next, { replace: true, state });
    };
    const close = () => {
      const source = readUnitSimReturnSource(route.state, current, 40, civs, new URLSearchParams(current.search).get('civ') ?? undefined);
      navigate(source ?? { pathname: current.pathname, search: withUnitTab(current.search, 'ov') });
    };
    routerActions = { open, go: replace, canonicalReplace: replace, close, navigate, back: () => navigate(-1) };
  }, [location, navigate]);
  return null;
}

function mount(initialEntry: string | UnitSimLocation) {
  act(() => {
    renderer = create(createElement(MemoryRouter, { initialEntries: [initialEntry as never] }, createElement(RouterProbe)));
  });
}

function advance(state: unknown, current: UnitSimLocation, next: UnitSimLocation, civ: string) {
  return advanceUnitSimReturnState(state, current, next, 40, civs, civ);
}

afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = null;
});

describe('单位模拟器返回来源（#1053）', () => {
  it('在真实 Router 的 push 和多次 replace 中保留原始搜索顺序与 hash', () => {
    mount(sourceA);
    act(() => routerActions.open());
    expect(route.location).toEqual(simA);
    const first = route.state;
    expect(readUnitSimReturnSource(first, route.location, 40, civs, 'Franks')).toEqual(sourceA);

    act(() => routerActions.canonicalReplace('/unit/40/Franks/4//', 'Franks'));
    expect(route.location).toEqual({ ...simA, pathname: '/unit/40/Franks/4/' });
    expect(readUnitSimReturnSource(route.state, route.location, 40, civs, 'Franks')).toEqual(sourceA);

    act(() => routerActions.go('/unit/40/Franks/3/39/', 'Franks'));
    expect(route.location).toEqual({ ...simA, pathname: '/unit/40/Franks/3/39/' });
    act(() => routerActions.close());
    expect(route.location).toEqual(sourceA);
    expect(route.state).toBeNull();
  });

  it('拒绝外站、非法路径、非概览、非法文明及目标漂移来源', () => {
    const invalidSources: UnitSimLocation[] = [
      { ...sourceA, pathname: 'https://example.com/unit/40' },
      { ...sourceA, pathname: '/unit/40suffix' },
      { ...sourceA, pathname: '/unit/41' },
      { ...sourceA, search: '?civ=NoSuchCiv&tab=ov' },
      { ...sourceA, search: '?civ=Franks&tab=sim' },
      { ...sourceA, search: '?civ=Franks&tab=rel' },
    ];
    for (const source of invalidSources) {
      expect(createUnitSimReturnState(source, { ...source, search: withUnitTab(source.search, 'sim') }, 40, civs)).toBeUndefined();
    }
    expect(createUnitSimReturnState(sourceA, { ...simA, hash: '#other' }, 40, civs, 'Franks')).toBeUndefined();

    const state = createUnitSimReturnState(sourceA, simA, 40, civs, 'Franks');
    expect(advance(state, { ...simA, search: '?civ=Franks&tab=sim&stale=1' }, { ...simA, pathname: '/unit/40/Franks/3//' }, 'Franks')).toBeUndefined();
    expect(advance(state, simA, { ...simA, pathname: '/unit/41/Franks/3//' }, 'Franks')).toBeUndefined();
    expect(advance(state, simA, { ...simA, pathname: '/unit/40/Goths/3//' }, 'Franks')).toBeUndefined();
    expect(advance(state, simA, { ...simA, search: simA.search + '&extra=1' }, 'Franks')).toBeUndefined();
    expect(advance(state, simA, { ...simA, hash: '#changed' }, 'Franks')).toBeUndefined();
  });

  it('未显式文明时绑定模拟器的实际文明；切换目标文明后来源不再复活', () => {
    const source: UnitSimLocation = { pathname: '/unit/40', search: '?sort=attack&x=%23', hash: '#unit-sim' };
    const sim: UnitSimLocation = { ...source, search: withUnitTab(source.search, 'sim') };
    const state = createUnitSimReturnState(source, sim, 40, civs);
    const next: UnitSimLocation = { ...sim, pathname: '/unit/40/Franks/3/39/' };
    const bound = advance(state, sim, next, 'Franks');
    expect(readUnitSimReturnSource(bound, next, 40, civs)).toEqual(source);

    const changed: UnitSimLocation = { ...next, pathname: '/unit/40/Goths/3/39/' };
    const discarded = advance(bound, next, changed, 'Franks');
    expect(discarded).toBeUndefined();
    expect(advance(discarded, changed, { ...changed, pathname: '/unit/40/Goths/4/39/' }, 'Goths')).toBeUndefined();
    expect(readUnitSimReturnSource(discarded, changed, 40, civs)).toBeNull();
  });

  it('direct simulator 使用显式概览 fallback，且返回后重新进入不复用旧来源', () => {
    const direct: UnitSimLocation = { pathname: '/unit/40', search: '?civ=Franks&tab=sim', hash: '' };
    mount(direct);
    act(() => routerActions.close());
    expect(route.location).toEqual({ ...direct, search: '?civ=Franks&tab=ov' });
    expect(route.state).toBeNull();

    act(() => renderer!.unmount());
    renderer = null;
    const sourceB: UnitSimLocation = { pathname: '/unit/40', search: '?civ=Franks&tab=ov&record=B', hash: '#b' };
    mount(sourceA);
    act(() => routerActions.open());
    act(() => routerActions.navigate(`${sourceB.pathname}${sourceB.search}${sourceB.hash}`));
    act(() => routerActions.open());
    expect(readUnitSimReturnSource(route.state, route.location, 40, civs, 'Franks')).toEqual(sourceB);
    act(() => routerActions.close());
    expect(route.location).toEqual(sourceB);
    act(() => routerActions.back());
    act(() => routerActions.close());
    expect(route.location).toEqual(sourceB);
    act(() => routerActions.back());
    act(() => routerActions.back());
    act(() => routerActions.back());
    act(() => routerActions.close());
    expect(route.location).toEqual(sourceA);
  });
});
