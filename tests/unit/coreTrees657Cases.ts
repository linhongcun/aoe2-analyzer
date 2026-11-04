import { describe, expect, it, vi } from 'vitest';
import type { Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function mount(core: () => Promise<Core>, trees: () => Promise<Trees>, caches: { core?: Core; trees?: Trees } = {}) {
  vi.resetModules();
  vi.doMock('../../src/data', () => ({ coreCache: caches.core ?? null, treesCache: caches.trees ?? null, loadCore: core, loadTrees: trees }));
  const [{ createElement }, { create, act }, { useCoreTrees }] = await Promise.all([
    import('react'),
    import('react-test-renderer'),
    import('../../src/shared/utils/useCoreTrees'),
  ]);
  let result!: ReturnType<typeof useCoreTrees>;
  const App = () => {
    result = useCoreTrees();
    return null;
  };
  let view!: import('react-test-renderer').ReactTestRenderer;
  await act(async () => {
    view = create(createElement(App));
  });
  return {
    get result() {
      return result;
    },
    act,
    async close() {
      await act(async () => view.unmount());
      vi.doUnmock('../../src/data');
      vi.resetModules();
    },
  };
}
// These sentinels test resource ownership only; numerical model cases load real data separately.
const CORE = { resource: 'core' } as unknown as Core;
const TREES = { resource: 'trees' } as unknown as Trees;
describe('#657 独立资料资源、重试与失效回调', () => {
  it('core先就绪不等树；树失败重试保留core、同批旧retry不打断新成功', async () => {
    const first = deferred<Trees>(),
      second = deferred<Trees>();
    let cores = 0,
      trees = 0;
    const view = await mount(
      async () => {
        cores++;
        return CORE;
      },
      () => (++trees === 1 ? first.promise : second.promise),
    );
    try {
      expect(view.result.core.data).toBe(CORE);
      expect(view.result.trees.pending).toBe(true);
      await view.act(async () => first.reject(new Error('tree-failure')));
      expect(view.result.trees).toMatchObject({ data: null, error: true, pending: false });
      const stale = view.result.trees.retry;
      await view.act(async () => {
        stale();
        stale();
      });
      expect(trees).toBe(2);
      expect(cores).toBe(1);
      expect(view.result.core.data).toBe(CORE);
      await view.act(async () => {
        second.resolve(TREES);
        stale();
      });
      expect(view.result.trees).toMatchObject({ data: TREES, error: false, pending: false });
      expect(trees).toBe(2);
    } finally {
      await view.close();
    }
  });
  it('只重试失败的core，已成功树及当前资源身份保留', async () => {
    let cores = 0,
      trees = 0;
    const wait = deferred<Core>();
    const view = await mount(
      () => (++cores === 1 ? Promise.reject(new Error('core-failure')) : wait.promise),
      async () => {
        trees++;
        return TREES;
      },
    );
    try {
      expect(view.result.core.error).toBe(true);
      expect(view.result.trees.data).toBe(TREES);
      await view.act(async () => view.result.retry());
      expect(view.result.core.pending).toBe(true);
      expect(view.result.trees.data).toBe(TREES);
      expect(trees).toBe(1);
      await view.act(async () => wait.resolve(CORE));
      expect(view.result.core.data).toBe(CORE);
      expect(cores).toBe(2);
    } finally {
      await view.close();
    }
  });
  it.each([false, true])('卸载后迟到%s结果被捕获且不复活，旧retry不再发请求', async (fail) => {
    const wait = deferred<Core>();
    let calls = 0;
    const view = await mount(
      () => {
        calls++;
        return wait.promise;
      },
      async () => TREES,
    );
    const stale = view.result.retry;
    await view.close();
    await view.act(async () => {
      if (fail) wait.reject(new Error('late'));
      else wait.resolve(CORE);
      stale();
    });
    expect(calls).toBe(1);
  });
  it('同步loader抛错也进入caught错误，成功cache不重复请求', async () => {
    const view = await mount(
      () => {
        throw new Error('sync');
      },
      async () => TREES,
    );
    try {
      expect(view.result.core.error).toBe(true);
      expect(view.result.trees.data).toBe(TREES);
    } finally {
      await view.close();
    }
    const core = vi.fn(async () => CORE),
      trees = vi.fn(async () => TREES);
    const cached = await mount(core, trees, { core: CORE, trees: TREES });
    try {
      await cached.act(async () => cached.result.retry());
      expect(core).not.toHaveBeenCalled();
      expect(trees).not.toHaveBeenCalled();
      expect(cached.result.core.data).toBe(CORE);
    } finally {
      await cached.close();
    }
  });
});

it.each(['missing-build', 'null-patch', 'array-build', 'nonfinite-build', 'unknown-build', 'bad-candidate-name', 'bad-form-name', 'empty-form-name'])(
  '#657 实际UI坏资料%s不会渲染假数字或崩溃',
  async (kind) => {
    vi.resetModules();
    const actual = await vi.importActual<typeof import('../../src/shared/utils/dataInfo')>('../../src/shared/utils/dataInfo');
    const sources =
      kind === 'missing-build'
        ? {}
        : kind === 'null-patch'
          ? { patch: null }
          : { patch: { build: kind === 'array-build' ? [188329] : kind === 'nonfinite-build' ? NaN : kind === 'unknown-build' ? 185872 : 188329 } };
    vi.doMock('../../src/shared/utils/dataInfo', () => ({ ...actual, DATA_SOURCES: sources }));
    const [{ createElement: h }, { create, act }, { MemoryRouter }, data, { default: References }, { default: Ages }] = await Promise.all([
      import('react'),
      import('react-test-renderer'),
      import('react-router-dom'),
      import('../../src/data'),
      import('../../src/shared/ui/ChampiReferences'),
      import('../../src/features/matchup/components/ChampiAges'),
    ]);
    const core = structuredClone(await data.loadCore()),
      trees = await data.loadTrees();
    if (kind === 'bad-candidate-name') core.unitById[75]!.zh = {} as unknown as string;
    if (kind === 'bad-form-name') core.unitById[2588]!.zh = {} as unknown as string;
    if (kind === 'empty-form-name') core.unitById[2552]!.en = ' ';
    let view!: import('react-test-renderer').ReactTestRenderer;
    try {
      await act(async () => {
        view = create(
          h(
            MemoryRouter,
            { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
            h('div', null, h(References, { core, trees }), h(Ages, { core, trees, me: 'Franks', opp: 'Muisca' })),
          ),
        );
      });
      if (kind === 'bad-candidate-name') {
        const blocked = view.root.findByProps({ 'data-champi-candidate': 75 });
        const text = (node: import('react-test-renderer').ReactTestInstance | string): string =>
          typeof node === 'string' ? node : node.children.map(text).join('');
        expect(text(blocked)).toContain('单位资料未核实');
        expect(text(blocked)).toContain('暂不能计算');
        expect(blocked.findAllByType('a')).toHaveLength(0);
      } else {
        expect(view.root.findAllByType('a')).toHaveLength(0);
        expect(view.root.findAllByType('button')).toHaveLength(0);
        expect(JSON.stringify(view.toJSON())).toContain('当前资料尚未核对');
        expect(JSON.stringify(view.toJSON())).not.toContain('DE NaN');
      }
    } finally {
      if (view) await act(async () => view.unmount());
      vi.doUnmock('../../src/shared/utils/dataInfo');
      vi.resetModules();
    }
  },
);
