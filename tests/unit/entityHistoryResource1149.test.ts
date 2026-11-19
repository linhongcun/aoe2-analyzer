import { createElement as h, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CivUpdatesData } from '../../src/domain/civUpdates';
import { useEntityHistory, type EntityHistoryResource } from '../../src/shared/ui/useEntityHistory';
import { historyFixture } from '../helpers/civUpdatesFixture';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../src/data/civUpdates', () => ({ loadCivUpdates: load }));
const data = historyFixture();
let view: ReactTestRenderer;
let resource: EntityHistoryResource;
let renders: { id: string; entity?: string }[];
function Probe({ id, immediate = true }: { id: string; immediate?: boolean }) {
  const current = useEntityHistory(id, immediate);
  useEffect(() => {
    resource = current;
    renders.push({ id, entity: current.entity?.id });
  });
  return null;
}
function deferred() {
  let resolve!: (value: CivUpdatesData) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CivUpdatesData>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}
async function mount(id: string) {
  await act(async () => {
    view = create(h(Probe, { id }));
  });
  await flush();
}
async function change(id: string) {
  await act(async () => {
    view.update(h(Probe, { id }));
  });
  await flush();
}
beforeEach(() => {
  load.mockReset();
  renders = [];
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  act(() => view?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

for (const fail of [false, true]) {
  it(`ignores old ${fail ? 'failure' : 'success'} after switching entities`, async () => {
    const a = deferred(),
      b = deferred();
    load.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await mount('tech/463');
    await change('tech/3');
    expect(resource.data).toBeUndefined();
    await act(async () => b.resolve(data));
    expect(resource.empty).toBe(true);
    await act(async () => {
      if (fail) a.reject(new Error('old'));
      else a.resolve(data);
    });
    expect(resource.entity?.id).toBe('tech/3');
    expect(resource.empty).toBe(true);
    expect(resource.error).toBe(false);
    expect(renders.every((row) => !row.entity || row.entity === row.id)).toBe(true);
  });
}
it.each([false, true])('retry creates reload generations and ignores an older response (failure=%s)', async (fail) => {
  const a = deferred(),
    b = deferred(),
    c = deferred();
  load.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise);
  await mount('tech/463');
  await act(async () => a.reject(new Error('failed')));
  expect(resource.error).toBe(true);
  await act(async () => resource.retry());
  expect(resource.error).toBe(false);
  await flush();
  expect(load).toHaveBeenLastCalledWith(true);
  await act(async () => resource.retry());
  await flush();
  await act(async () => c.resolve(data));
  expect(resource.entity?.id).toBe('tech/463');
  const latest = resource.data;
  await act(async () => {
    if (fail) b.reject(new Error('old retry'));
    else b.resolve(historyFixture());
  });
  expect(resource.data).toBe(latest);
  expect(resource.error).toBe(false);
});
it('does not update after unmount and cancels a scheduled start', async () => {
  const a = deferred();
  load.mockReturnValue(a.promise);
  await mount('tech/463');
  act(() => view.unmount());
  const count = renders.length;
  await act(async () => a.resolve(data));
  expect(renders).toHaveLength(count);
  load.mockClear();
  act(() => {
    view = create(h(Probe, { id: 'tech/3' }));
  });
  act(() => view.unmount());
  await flush();
  expect(load).not.toHaveBeenCalled();
});
it('reprojects a cached payload and never renders previous identity before effects', async () => {
  load.mockResolvedValue(data);
  await mount('tech/463');
  expect(resource.nodes).toHaveLength(2);
  await change('tech/3');
  expect(resource.empty).toBe(true);
  expect(resource.nodes).toHaveLength(0);
  expect(renders.filter((row) => row.id === 'tech/3').every((row) => row.entity !== 'tech/463')).toBe(true);
});
it('defers ordinary detail loading until idle and cancels it on unmount', async () => {
  const idle = vi.fn().mockReturnValue(42),
    cancel = vi.fn();
  vi.stubGlobal('requestIdleCallback', idle);
  vi.stubGlobal('cancelIdleCallback', cancel);
  await act(async () => {
    view = create(h(Probe, { id: 'tech/463', immediate: false }));
  });
  expect(idle).not.toHaveBeenCalled();
  await flush();
  expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 });
  expect(load).not.toHaveBeenCalled();
  act(() => view.unmount());
  expect(cancel).toHaveBeenCalledWith(42);
});
