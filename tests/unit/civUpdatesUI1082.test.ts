import { createElement as h, useEffect, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import CivDetail from '../../src/features/civs/components/CivDetail';
import { CivUpdatesReader } from '../../src/shared/ui/CivUpdates';
import { conflictHistoryFixture, historyFixture } from '../helpers/civUpdatesFixture';

vi.mock('../../src/data/hooks', () => ({ useCore: () => null }));

let view: ReactTestRenderer;
let location: ReturnType<typeof useLocation>;
let navigate: NavigateFunction;
function Probe() {
  const current = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    location = current;
    navigate = nav;
  }, [current, nav]);
  return null;
}
function text(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
}
async function mount(entry: string, child: ReactNode = h(CivDetail, { techTree: () => null })) {
  await act(async () => {
    view = create(h(MemoryRouter, { initialEntries: [entry] }, h(Probe), h(Routes, null, h(Route, { path: '/civ/:en', element: child }))));
  });
}
async function clickButton(label: string) {
  const button = view.root.findAllByType('button').find((node) => text(node) === label)!;
  expect(button).toBeDefined();
  await act(async () => button.props.onClick());
}
afterEach(() => {
  act(() => view?.unmount());
  vi.unstubAllGlobals();
});

it('F1 keeps the history tab and full return URL through real detail effects, retry, filters, back/forward and remount', async () => {
  const frames: FrameRequestCallback[] = [];
  const scrollIntoView = vi.fn();
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('scrollY', 0);
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', vi.fn());
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('document', {
    documentElement: { scrollHeight: 10000 },
    getElementById: (id: string) => ({ getBoundingClientRect: () => ({ top: 999 }), scrollIntoView: () => scrollIntoView(id) }),
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => historyFixture() });
  vi.stubGlobal('fetch', fetch);
  const returnPath = '/patches?histQuery=Cumans&histCoverage=partial&histSourceState=processed&histListOrder=name&keep=overview';
  const query = new URLSearchParams({ tab: 'history', histReturn: returnPath, keep: 'detail' });
  const expectContext = () => {
    const current = new URLSearchParams(location.search);
    expect(current.get('tab')).toBe('history');
    expect(current.get('histReturn')).toBe(returnPath);
    expect(current.get('keep')).toBe('detail');
    expect(view.root.findAllByType('details').find((node) => node.props.id === 'patches')!.props.open).toBe(true);
  };
  await mount(`/civ/Cumans?${query}`);
  expectContext();
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(scrollIntoView).toHaveBeenCalledWith('patches');
  await clickButton('重试文明历史');
  expect(fetch).toHaveBeenCalledTimes(2);
  expectContext();
  await clickButton('重试文明历史');
  expect(fetch).toHaveBeenCalledTimes(3);
  expectContext();
  await act(async () =>
    view.root
      .findAllByType('label')
      .find((node) => text(node).startsWith('来源类别'))!
      .findByType('select')
      .props.onChange({ target: { value: 'community' } }),
  );
  expectContext();
  expect(new URLSearchParams(location.search).get('histSource')).toBe('community');
  await clickButton('清除历史筛选');
  expectContext();
  expect(new URLSearchParams(location.search).has('histSource')).toBe(false);
  await act(async () => navigate(-1));
  expectContext();
  expect(new URLSearchParams(location.search).get('histSource')).toBe('community');
  await act(async () => navigate(1));
  expectContext();
  expect(new URLSearchParams(location.search).has('histSource')).toBe(false);
  const refreshed = location.pathname + location.search + location.hash;
  act(() => view.unmount());
  await mount(refreshed);
  expectContext();
  const back = view.root.findAllByType('a').find((node) => text(node) === '返回文明历史总览')!;
  expect(back.props.href).toBe(returnPath);
  // Keeping tab=history must still allow the existing chapter anchors to work.
  frames.length = 0;
  await act(async () => navigate({ pathname: location.pathname, search: location.search, hash: '#identity' }));
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(scrollIntoView).toHaveBeenLastCalledWith('identity');
  expectContext();
});

it.each([1, 2])('F2 shows %i pending Japanese entries outside collapsed details, computed from source entries', async (count) => {
  const data = historyFixture();
  if (count === 2) {
    const sections = new Set(data.civilizations.find((civ) => civ.civId === 'Japanese')!.sectionIds);
    data.sourceEntries.find((entry) => entry.sectionId !== null && sections.has(entry.sectionId) && entry.processing === 'mapped')!.processing = 'pending';
  }
  await mount('/civ/Japanese?tab=history', h(CivUpdatesReader, { data, civId: 'Japanese' }));
  const processing = view.root.findByProps({ 'data-testid': 'civ-update-processing' });
  expect(processing.props.open).toBeUndefined();
  const warning = view.root.findAllByType('p').find((node) => text(node).startsWith('来源章节仍有导入待核条目'))!;
  expect(text(warning)).toContain(`待核 ${count} 条`);
  for (let parent = warning.parent; parent; parent = parent.parent) expect(parent.type).not.toBe('details');
  expect(warning.findByProps({ className: 'num nw' }).children.join('')).toBe(`${count} 条`);
});

it('F3 uses the formal conflict phrase in the filter, badge and explanation while retaining both synthetic claims', async () => {
  await mount('/civ/Cumans?tab=history&histVerification=conflict', h(CivUpdatesReader, { data: conflictHistoryFixture(), civId: 'Cumans' }));
  const event = view.root.findByProps({ 'data-testid': 'civ-update-event' });
  expect(text(view.root.findAllByType('option').find((node) => node.props.value === 'conflict')!)).toBe('来源冲突，尚未确认');
  expect(text(event.findByProps({ className: 'civ-update-warning' }))).toContain('来源冲突，尚未确认');
  expect(event.findAllByProps({ className: 'civ-update-pill' }).map(text)).toContain('来源冲突，尚未确认');
  expect(text(event)).not.toMatch(/存在冲突|尚未裁决/);
  expect(event.findAllByProps({ className: 'civ-update-claim' })).toHaveLength(2);
  expect(event.findAllByProps({ className: 'civ-update-values' }).map(text)).toEqual(['未知  0', '未知  1']);
  expect(text(event)).toContain('测试原文A');
  expect(text(event)).toContain('测试原文B');
});
