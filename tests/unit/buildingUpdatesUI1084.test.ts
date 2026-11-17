import { createElement as h, useEffect } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BuildingUpdates } from '../../src/shared/ui/BuildingUpdates';
import { loadCivUpdates } from '../../src/data/civUpdates';
import { filterBuildingEvents } from '../../src/domain/buildingUpdates';
import { historyFixture } from '../helpers/civUpdatesFixture';

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
const text = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : text(c))).join('');
async function mount(url: string, entityId?: string) {
  await act(async () => {
    view = create(h(MemoryRouter, { initialEntries: [url] }, h(Probe), h(BuildingUpdates, { entityId })));
  });
}
async function click(label: string) {
  const button = view.root.findAllByType('button').find((n) => text(n) === label)!;
  expect(button).toBeDefined();
  await act(async () => button.props.onClick());
}
async function dataReady() {
  const data = historyFixture();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  await loadCivUpdates(true);
  vi.stubGlobal('document', { getElementById: () => ({ scrollIntoView: vi.fn() }) });
  return data;
}
afterEach(() => {
  act(() => view?.unmount());
  vi.unstubAllGlobals();
});

it('keeps object, filters and location across loading, repeated failure, real retry and back/forward', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetch = vi
    .fn()
    .mockImplementationOnce(async () => {
      await held;
      return { ok: false };
    })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => historyFixture() });
  vi.stubGlobal('fetch', fetch);
  const first = loadCivUpdates(true).catch(() => undefined);
  await mount('/patches?obj=building:109&histVersion=de-34055&histQuery=城镇');
  expect(text(view.root)).toContain('正在读取建筑');
  await act(async () => {
    release();
    await first;
  });
  expect(text(view.root)).toContain('建筑更新历史读取失败');
  await click('重试建筑历史');
  expect(text(view.root)).toContain('建筑更新历史读取失败');
  await click('重试建筑历史');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(text(view.root)).toContain('270 秒');
  const before = location.search;
  await click('清除历史筛选');
  expect(location.search).toContain('obj=building%3A109');
  expect(new URLSearchParams(location.search).get('histQuery')).toBe('城镇');
  await act(async () => navigate(-1));
  expect(location.search).toBe(before);
});

it('uses the identical event projection in building detail and overview without changing current-value context', async () => {
  const data = await dataReady();
  const query = 'histVersion=de-61321&histCondition=prerequisite';
  await mount('/patches?obj=building:79&' + query);
  const ids = () => view.root.findAll((n) => n.type === 'article' && !!n.props['data-event-id']).map((n) => n.props['data-event-id']);
  const expected = filterBuildingEvents(data, 'building/79', new URLSearchParams(query)).map((r) => r.event.id);
  expect(ids()).toEqual(expected);
  expect(text(view.root)).toContain('850');
  act(() => view.unmount());
  await mount('/building/79?tab=history&' + query, 'building/79');
  expect(ids()).toEqual(expected);
  expect(text(view.root)).toContain('当前目录值与历史主张分开');
});

it('recovers only invalid keys, and distinguishes no mapped history from empty filtered results', async () => {
  await dataReady();
  await mount('/patches?obj=building:109&histQuery=城镇&histOrder=bad&histVersion=de-34055');
  expect(text(view.root)).toContain('历史地址有重复');
  await click('仅清除错误参数');
  expect(new URLSearchParams(location.search).get('histVersion')).toBe('de-34055');
  expect(new URLSearchParams(location.search).get('histQuery')).toBe('城镇');
  expect(text(view.root)).toContain('270 秒');
  await act(async () => navigate('/patches?obj=building:109&histVersion=de-47820'));
  expect(text(view.root)).toContain('没有符合筛选的记录');
  await act(async () => navigate('/patches?obj=building:104'));
  expect(text(view.root)).toContain('尚未收录此建筑的已映射事件');
  expect(text(view.root)).toContain('已定位、未检查');
});

it('reloading a failed source snapshot retains all old evidence instead of presenting a false empty state', async () => {
  const data = historyFixture();
  const row = data.buildings!.rows.find((r) => r.entityId === 'building/109')!;
  row.searchState = row.sourceState = 'read-failed';
  row.reason = '测试夹具：来源重读失败，保留旧快照';
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
  vi.stubGlobal('fetch', fetch);
  await loadCivUpdates(true);
  await mount('/patches?obj=building:109&histVersion=de-34055');
  expect(text(view.root)).toContain('270 秒');
  expect(text(view.root)).toContain('以下保留既有快照');
  await click('重新读取应用快照');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(text(view.root)).toContain('270 秒');
  expect(text(view.root)).toContain('来源读取失败（保留旧快照）');
});
