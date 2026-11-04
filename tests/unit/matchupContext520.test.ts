import { createElement as h, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import Matchup from '../../src/features/matchup/components/Matchup';
import Duel from '../../src/features/duel/components/Duel';
import { BuildContext } from '../../src/features/builds/BuildContext';

import { loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
import { matchup, filterCounterUnits } from '../../src/domain/ratings';
import { rushDrill, counterExtra } from '../../src/features/matchup/availability';
import RushDefense from '../../src/features/matchup/components/RushDefense';
const liveData = vi.hoisted(() => ({
  snapshot: { data: null, error: false } as { data: { core: Core; trees: Trees } | null; error: boolean },
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/features/matchup/useMatchupData', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useMatchupData: () =>
      useSyncExternalStore(
        (notify) => {
          liveData.listeners.add(notify);
          return () => liveData.listeners.delete(notify);
        },
        () => liveData.snapshot,
      ),
  };
});
vi.mock('../../src/domain/ratings', async (original) => {
  const actual = await original<typeof import('../../src/domain/ratings')>();
  return { ...actual, matchup: vi.fn(actual.matchup), filterCounterUnits: vi.fn(actual.filterCounterUnits) };
});
vi.mock('../../src/features/matchup/availability', async (original) => {
  const actual = await original<typeof import('../../src/features/matchup/availability')>();
  return { ...actual, rushDrill: vi.fn(actual.rushDrill), counterExtra: vi.fn(actual.counterExtra) };
});
vi.mock('../../src/data/hooks', () => ({ useCore: () => null, useTrees: () => null }));
// This context-only Duel fixture intentionally keeps both numerical resources pending.
vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({
    core: { data: null, pending: true, error: false, retry: () => {} },
    trees: { data: null, pending: true, error: false, retry: () => {} },
    retry: () => {},
  }),
}));

let view: ReactTestRenderer;
let navigate: NavigateFunction;
let currentSearch = '';
function Probe() {
  const nav = useNavigate();
  const { search } = useLocation();
  useEffect(() => {
    navigate = nav;
    currentSearch = search;
  }, [nav, search]);
  return null;
}
async function mount(component: ReturnType<typeof h>, entry: string) {
  await act(async () => {
    view = create(h(MemoryRouter, { initialEntries: [entry], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe), component));
  });
}
const context = () => view.root.findByProps({ 'aria-label': '对阵相关入口' });
const links = () =>
  context()
    .findAllByType('a')
    .map((a) => a.props.href as string);
afterEach(() => {
  act(() => view?.unmount());
  liveData.snapshot = { data: null, error: false };
  vi.clearAllMocks();
});

it('#520 query wins over sticky, picker writes both keys and a bare return remembers the shared pair', async () => {
  await mount(h(Matchup), '/matchup?me=Mongols&opp=Chinese&rush=scouts');
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Mongols' }).type).toBe('button');
  expect(view.root.findByProps({ id: 'me', 'data-value': 'Chinese' }).type).toBe('button');
  expect(links()).toContain('/builds?civ=Chinese&from=matchup&me=Mongols');
  // CivPicker 的 onChange 是真实页面写 URL 的入口。
  const picker = view.root.findAll((node) => typeof node.type === 'function' && node.props.id === 'ma')[0]!;
  await act(async () => picker.props.onChange('Franks'));
  expect(new URLSearchParams(currentSearch).get('me')).toBe('Franks');
  expect(new URLSearchParams(currentSearch).get('opp')).toBe('Chinese');
  expect(new URLSearchParams(currentSearch).get('rush')).toBe('scouts');
  await act(async () => navigate('/matchup'));
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Franks' }).type).toBe('button');
  await act(async () => navigate('/matchup?me=unknown&opp=Japanese'));
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Franks' }).type).toBe('button');
  expect(view.root.findAllByType('p').some((p) => p.children.includes('链接中的文明无效，已用上次选择'))).toBe(true);
});

it('#520 duel keeps a bare return after automatic repair of a bad pack, then responds to new valid packs', async () => {
  await mount(h(Duel), '/duel?a=bad.Mongols.2..&b=74.Chinese.2..');
  expect(currentSearch).toContain('a=569.Franks'); // 既有 PK 自动修复仍工作。
  expect(links()).toEqual(['/matchup', '/civ/Chinese', '/builds?civ=Chinese&from=duel']);
  await act(async () => navigate('/duel?a=4.Mongols.2..&b=74.Chinese.2..'));
  expect(links()).toEqual([
    '/matchup?me=Mongols&opp=Chinese',
    '/civ/Mongols',
    '/civ/Chinese',
    '/builds?civ=Mongols&from=duel',
    '/builds?civ=Chinese&from=duel',
  ]);
  await act(async () => navigate('/duel'));
  expect(links()).toEqual(['/matchup']);
});

it('#520 opponent builds shows the original pair, civ page and full list retaining civ', async () => {
  await mount(h(BuildContext, { params: new URLSearchParams('civ=Chinese&from=matchup&me=Mongols&bo=archers-19') }), '/builds');
  expect(links()).toEqual(['/matchup?me=Mongols&opp=Chinese', '/civ/Chinese', '/builds?civ=Chinese']);
});

let loaded: { core: Core; trees: Trees };
beforeAll(async () => {
  loaded = { core: await loadCore(), trees: await loadTrees() };
});
const calculations = [matchup, filterCounterUnits, rushDrill, counterExtra];
const noAnalysis = () => {
  for (const fn of calculations) expect(fn).not.toHaveBeenCalled();
  expect(view.root.findAllByType(RushDefense)).toHaveLength(0);
  expect(view.root.findAllByProps({ id: 'mres' })).toHaveLength(0);
  expect(view.root.findAllByProps({ 'aria-label': '对阵相关入口' })).toHaveLength(0);
};
const publish = async (data: typeof loaded | null, error = false) => {
  await act(async () => {
    liveData.snapshot = { data, error };
    for (const notify of liveData.listeners) notify();
  });
};
const change = async (id: string, value: string) => {
  const picker = view.root.findAll((node) => typeof node.type === 'function' && node.props.id === id)[0]!;
  await act(async () => picker.props.onChange(value));
};

it.each([
  ['me=Mongols', 'Mongols', ''],
  ['opp=Japanese', '', 'Japanese'],
  ['', '', ''],
  ['me=Unknown', '', ''],
])('#672 loaded partial %s never computes or mounts pair consumers', async (query, me, opp) => {
  liveData.snapshot = { data: loaded, error: false };
  await mount(h(Matchup), '/matchup?me=Mongols&opp=Chinese&rush=scouts');
  for (const fn of calculations) expect(fn).toHaveBeenCalled();
  vi.clearAllMocks();
  await act(async () => navigate('/matchup?pair=explicit&rush=scouts' + (query ? '&' + query : '')));
  noAnalysis();
  expect(view.root.findByProps({ id: 'ma', 'data-value': me }).type).toBe('button');
  expect(view.root.findByProps({ id: 'me', 'data-value': opp }).type).toBe('button');
  await publish(null);
  await publish(loaded);
  await publish(null, true);
  noAnalysis();
  await act(async () => navigate('/matchup'));
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Mongols' }).type).toBe('button');
  expect(view.root.findByProps({ id: 'me', 'data-value': 'Chinese' }).type).toBe('button');
});

it('#672 explicit complete, clear, refill keeps rush and restores actual analysis', async () => {
  await mount(h(Matchup), '/matchup?pair=explicit&me=Mongols&rush=scouts');
  await publish(loaded);
  noAnalysis();
  await change('me', 'Chinese');
  for (const fn of calculations) expect(fn).toHaveBeenCalled();
  expect(view.root.findAllByType(RushDefense)).toHaveLength(1);
  expect(view.root.findAllByProps({ id: 'mres' })).toHaveLength(1);
  expect(links()).toContain('/builds?civ=Chinese&from=matchup&me=Mongols');
  vi.clearAllMocks();
  await change('ma', '');
  noAnalysis();
  expect(new URLSearchParams(currentSearch).get('me')).toBeNull();
  expect(new URLSearchParams(currentSearch).get('opp')).toBe('Chinese');
  expect(new URLSearchParams(currentSearch).get('pair')).toBe('explicit');
  expect(new URLSearchParams(currentSearch).get('rush')).toBe('scouts');
  await change('ma', 'Franks');
  for (const fn of calculations) expect(fn).toHaveBeenCalled();
  vi.clearAllMocks();
  await act(async () => navigate(-1));
  noAnalysis();
  await act(async () => navigate(1));
  expect(view.root.findAllByProps({ id: 'mres' })).toHaveLength(1);
});
