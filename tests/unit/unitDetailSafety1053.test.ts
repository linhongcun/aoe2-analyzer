import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Core } from '../../src/data';
import type { Trees, Unit } from '../../src/domain/types';
import UnitDetail from '../../src/features/units/components/UnitDetail';
import { coreSafeForUnitDetail, projectUnitForDetail, rereadUnitResource, treesSafeForUnitDetail } from '../../src/features/units/unitDetailSafety';

const state = vi.hoisted(() => ({
  core: null as Core | null,
  trees: null as Trees | null,
  coreError: false,
  treesError: false,
  coreRetry: vi.fn(),
  treesRetry: vi.fn(),
}));
const loaders = vi.hoisted(() => ({ core: vi.fn(), trees: vi.fn() }));

vi.mock('../../src/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data')>();
  return {
    ...actual,
    loadCore: () => loaders.core(),
    loadTrees: () => loaders.trees(),
  };
});

vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({
    core: { data: state.core, pending: false, error: state.coreError, retry: state.coreRetry },
    trees: { data: state.trees, pending: false, error: state.treesError, retry: state.treesRetry },
  }),
}));

let originalCore: Core;
let originalTrees: Trees;
let readCore: () => Promise<Core>;
let readTrees: () => Promise<Trees>;
const mountedViews: ReactTestRenderer[] = [];
const browserDescriptors = new Map<string, PropertyDescriptor | undefined>();

beforeAll(async () => {
  const data = await vi.importActual<typeof import('../../src/data')>('../../src/data');
  readCore = data.loadCore;
  readTrees = data.loadTrees;
  [originalCore, originalTrees] = await Promise.all([readCore(), readTrees()]);
  state.core = originalCore;
  state.trees = originalTrees;
  loaders.core.mockImplementation(readCore);
  loaders.trees.mockImplementation(readTrees);
});

afterEach(() => {
  while (mountedViews.length) {
    const view = mountedViews.pop()!;
    act(() => view.unmount());
  }
  state.core = originalCore;
  state.trees = originalTrees;
  state.coreError = false;
  state.treesError = false;
  state.coreRetry.mockClear();
  state.treesRetry.mockClear();
  loaders.core.mockReset().mockImplementation(readCore);
  loaders.trees.mockReset().mockImplementation(readTrees);
  for (const [name, descriptor] of browserDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  browserDescriptors.clear();
});

function renderUnit(path: string) {
  return renderToStaticMarkup(createElement(StaticRouter, { location: path }, createElement(UnitDetail)));
}

function setBrowserGlobal(name: string, value: unknown) {
  if (!browserDescriptors.has(name)) browserDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

async function mountUnit(path: string) {
  const sessionValues = new Map<string, string>();
  setBrowserGlobal('HTMLElement', class {});
  setBrowserGlobal('Element', class {});
  setBrowserGlobal('document', {
    activeElement: null,
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  setBrowserGlobal('window', {
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => sessionValues.set(key, value),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
  });
  setBrowserGlobal('scrollTo', () => {});
  setBrowserGlobal('requestAnimationFrame', () => 0);
  setBrowserGlobal('cancelAnimationFrame', () => {});
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(createElement(MemoryRouter, { initialEntries: [path] }, createElement(UnitDetail)));
  });
  mountedViews.push(view);
  return view;
}

function nodeText(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : nodeText(child))).join('');
}

function buttonByText(view: ReactTestRenderer, text: string) {
  return view.root.findAllByType('button').find((button) => nodeText(button) === text);
}

async function setReverseFilter(view: ReactTestRenderer) {
  const picker = view.root.findAll((node) => node.props.id === 'reverse-counter-civ')[0]!;
  await act(async () => picker.props.onChange('Mayans'));
  const age = view.root.findByProps({ id: 'reverse-counter-age' });
  await act(async () => age.props.onChange({ target: { value: '3' } }));
}

function expectReverseFilter(view: ReactTestRenderer, civ: string, age: string | number) {
  const picker = view.root.findAll((node) => node.props.id === 'reverse-counter-civ')[0]!;
  expect(picker.props.value).toBe(civ);
  expect(view.root.findByProps({ id: 'reverse-counter-age' }).props.value).toBe(age);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('UnitDetail 资源与目标投影（#1053）', () => {
  it('投影异常目标类别供父层使用，不补零并保留查询原值', () => {
    const source = originalCore.unitById[93]!;
    const damaged = {
      ...source,
      atks: [['步兵', Number.NaN]],
      armc: [
        ['步兵', Infinity],
        ['步兵', 0],
      ],
    } as Unit;
    const projection = projectUnitForDetail(damaged);
    expect(projection.invalidFields).toEqual(expect.arrayContaining(['atks', 'armc']));
    expect(projection.unit.atks).toEqual([]);
    expect(projection.unit.armc).toEqual([]);

    const core = {
      ...originalCore,
      units: originalCore.units.map((unit) => (unit.id === 93 ? damaged : unit)),
      unitById: { ...originalCore.unitById, 93: damaged },
    };
    state.core = core;
    try {
      const html = renderUnit('/unit/93');
      expect(html).toContain('data-t="unit-identity"');
      expect(html).toContain('长矛兵');
      expect(html).toContain('unit-category-warning');
      expect(html).toContain('本单位类别资料部分无法解析');
    } finally {
      state.core = originalCore;
    }
  });

  it('保留合法类别但对坏 pair 告警、反查 partial，并停用工作区模拟器', () => {
    const source = originalCore.unitById[93]!;
    const damaged = {
      ...source,
      atks: [null, ['步兵', 3]],
      armc: [['步兵', 0], null],
      arms: [['步兵', 0], null],
    } as unknown as Unit;
    const projection = projectUnitForDetail(damaged);
    expect(projection.invalidFields).toEqual(expect.arrayContaining(['atks', 'armc', 'arms']));
    expect(projection.unit.atks).toContainEqual(['步兵', 3]);
    expect(projection.unit.armc).toContainEqual(['步兵', 0]);

    state.core = {
      ...originalCore,
      units: originalCore.units.map((unit) => (unit.id === 93 ? damaged : unit)),
      unitById: { ...originalCore.unitById, 93: damaged },
    };
    try {
      const html = renderUnit('/unit/93/Franks/3?tab=sim');
      expect(html).toContain('data-t="unit-identity"');
      expect(html).toContain('data-t="workspace-invalid-target"');
      expect(html).toContain('id="unit-reverse-counters"');
      expect(html).toContain('目录中的类别或数值异常');
      expect(html).not.toContain('id="simage"');
      expect(html).not.toContain('reverse-counter-duel-link');
    } finally {
      state.core = originalCore;
    }
  });

  it('挂载工作区时保留坏 pair 旁的合法类别，维持页面身份并阻止模拟器', async () => {
    const source = originalCore.unitById[93]!;
    const damaged = {
      ...source,
      atks: [null, ['步兵', 3]],
      armc: [['步兵', 0], null],
      arms: [['步兵', 0], null],
    } as unknown as Unit;
    state.core = {
      ...originalCore,
      units: originalCore.units.map((unit) => (unit.id === 93 ? damaged : unit)),
      unitById: { ...originalCore.unitById, 93: damaged },
    };
    const view = await mountUnit('/unit/93/Franks/3?tab=sim');
    expect(view.root.findByProps({ 'data-t': 'unit-identity' })).toBeDefined();
    expect(view.root.findByProps({ 'data-t': 'workspace-invalid-target' })).toBeDefined();
    expect(view.root.findByProps({ id: 'unit-reverse-counters' })).toBeDefined();
    expect(view.root.findAllByProps({ id: 'simage' })).toHaveLength(0);
    expect(view.root.findAllByProps({ 'data-reverse-group': '' }).length).toBeGreaterThan(0);
    expect(view.root.findAllByType('p').some((paragraph) => nodeText(paragraph).includes('攻击或护甲类别资料部分无法解析'))).toBe(true);
    expect(view.root.findAllByType('button').some((button) => nodeText(button).includes('重试目录资料'))).toBe(true);
  });

  // The built UnitDetail chunk statically preloads Core before mounting, so rejection is injected at the mounted resource boundary.
  it('Core 网络拒绝在真实 UnitDetail 路由显示可点击重试，不构造旧身份', async () => {
    state.core = null;
    state.coreError = true;
    const view = await mountUnit('/unit/93?tab=sim');
    expect(view.root.findAllByProps({ 'data-t': 'unit-identity' })).toHaveLength(0);
    const retry = buttonByText(view, '重试资料');
    expect(retry).toBeDefined();
    await act(async () => retry!.props.onClick());
    expect(state.coreRetry).toHaveBeenCalledOnce();
  });

  it('科技树网络拒绝只用共享重试，保留成功 Core 与筛选', async () => {
    state.trees = null;
    state.treesError = true;
    const view = await mountUnit('/unit/93');
    await setReverseFilter(view);
    expect(view.root.findByProps({ 'data-t': 'unit-identity' })).toBeDefined();
    const retry = buttonByText(view, '重试目录资料');
    expect(retry).toBeDefined();
    await act(async () => retry!.props.onClick());
    expect(state.treesRetry).toHaveBeenCalledOnce();
    expect(loaders.trees).not.toHaveBeenCalled();
    expect(view.root.findByProps({ 'data-t': 'unit-identity' })).toBeDefined();
    expectReverseFilter(view, 'Mayans', 3);
  });

  it('成功但结构错误的树缓存实际重读并重新校验，保留 Core 和筛选，清除后回基础目录', async () => {
    state.trees = { ...originalTrees, t: { ...originalTrees.t, Franks: [] } };
    const view = await mountUnit('/unit/93');
    await setReverseFilter(view);
    const wait = deferred<Trees>();
    loaders.trees.mockReturnValueOnce(wait.promise);
    const retry = buttonByText(view, '重试目录资料');
    expect(retry).toBeDefined();
    await act(async () => retry!.props.onClick());
    expect(loaders.trees).toHaveBeenCalledOnce();
    expect(view.root.findByProps({ 'data-t': 'unit-identity' })).toBeDefined();
    expectReverseFilter(view, 'Mayans', 3);
    wait.resolve(state.trees!);
    await act(async () => {
      await wait.promise;
    });
    expect(view.root.findAllByType('p').some((p) => nodeText(p).includes('科技树结构无法解析'))).toBe(true);
    expectReverseFilter(view, 'Mayans', 3);

    const secondRead = deferred<Trees>();
    loaders.trees.mockReturnValueOnce(secondRead.promise);
    const secondRetry = buttonByText(view, '重试目录资料');
    expect(secondRetry).toBeDefined();
    await act(async () => secondRetry!.props.onClick());
    expect(loaders.trees).toHaveBeenCalledTimes(2);
    secondRead.resolve(originalTrees);
    await act(async () => {
      await secondRead.promise;
    });
    expect(view.root.findAllByType('p').some((p) => nodeText(p).includes('科技树结构无法解析'))).toBe(false);
    expectReverseFilter(view, 'Mayans', 3);
    const clear = buttonByText(view, '清除筛选');
    expect(clear).toBeDefined();
    await act(async () => clear!.props.onClick());
    expectReverseFilter(view, '', '');
    expect(view.root.findByProps({ 'data-t': 'unit-identity' })).toBeDefined();
  });

  it('partial Core 重试失败不冒充 ready，随后真实重读恢复且保留筛选', async () => {
    const target = originalCore.unitById[93]!;
    const candidate = originalCore.unitById[1658]!;
    const damaged = { ...candidate, atks: [null, ...candidate.atks] } as unknown as Unit;
    state.core = {
      ...originalCore,
      units: originalCore.units.map((unit) => (unit.id === candidate.id ? damaged : unit)),
      unitById: { ...originalCore.unitById, [candidate.id]: damaged },
    };
    expect(target).toBeDefined();
    const view = await mountUnit('/unit/93');
    await setReverseFilter(view);
    expect(view.root.findAllByType('button').some((button) => nodeText(button) === '重试目录资料')).toBe(true);

    const failed = deferred<Core>();
    loaders.core.mockReturnValueOnce(failed.promise);
    const firstRetry = buttonByText(view, '重试目录资料');
    await act(async () => firstRetry!.props.onClick());
    expect(buttonByText(view, '正在重试…')).toBeDefined();
    failed.reject(new Error('core-reread-failed'));
    await act(async () => {
      await failed.promise.catch(() => undefined);
    });
    expect(view.root.findAllByType('p').some((p) => nodeText(p).includes('目录资料重试失败'))).toBe(true);
    expect(buttonByText(view, '重试目录资料')).toBeDefined();
    expectReverseFilter(view, 'Mayans', 3);

    const recovered = deferred<Core>();
    loaders.core.mockReturnValueOnce(recovered.promise);
    const secondRetry = buttonByText(view, '重试目录资料');
    await act(async () => secondRetry!.props.onClick());
    recovered.resolve(originalCore);
    await act(async () => {
      await recovered.promise;
    });
    expect(view.root.findAllByType('p').some((p) => nodeText(p).includes('目录资料重试失败'))).toBe(false);
    expectReverseFilter(view, 'Mayans', 3);
  });

  it('不可用 Core 在页面资源边界失败，不构造伪单位身份', () => {
    state.core = { ...originalCore, unitById: {} };
    try {
      const html = renderUnit('/unit/93');
      expect(html).toContain('单位资料结构无法解析');
      expect(html).not.toContain('data-t="unit-identity"');
      expect(html).not.toContain('历史资料');
    } finally {
      state.core = originalCore;
    }
  });

  it('候选单位类别异常不会使目标页父消费者崩溃', () => {
    const candidate = originalCore.unitById[1658]!;
    const category = originalCore.unitById[93]!.armc[0]![0];
    const damaged = { ...candidate, atks: [[category, Number.NaN]] } as Unit;
    state.core = {
      ...originalCore,
      units: originalCore.units.map((unit) => (unit.id === damaged.id ? damaged : unit)),
      unitById: { ...originalCore.unitById, [damaged.id]: damaged },
    };
    try {
      expect(() => renderUnit('/unit/93')).not.toThrow();
      const html = renderUnit('/unit/93');
      expect(html).toContain('data-t="unit-identity"');
      expect(html).toContain('目录中的类别或数值异常');
    } finally {
      state.core = originalCore;
    }
  });

  it('坏树结构不会传给父消费者，目录身份仍可读且显示错误状态', () => {
    state.trees = { ...originalTrees, t: { ...originalTrees.t, Franks: [] } };
    try {
      const html = renderUnit('/unit/93/Franks/3');
      expect(html).toContain('data-t="unit-identity"');
      expect(html).toContain('长矛兵');
      expect(html).toContain('科技树结构无法解析');
    } finally {
      state.trees = originalTrees;
    }
  });

  it('保留真实树结构及目录 Core，且损坏结构不被判为可用', () => {
    expect(coreSafeForUnitDetail(originalCore)).toBe(true);
    expect(coreSafeForUnitDetail({ ...originalCore, unitById: {} })).toBe(false);
    const names = Object.keys(originalTrees.t);
    expect(treesSafeForUnitDetail(originalTrees, names)).toBe(true);
    expect(treesSafeForUnitDetail({ ...originalTrees, t: { ...originalTrees.t, Franks: [] } }, names)).toBe(false);
    for (const age of ['5', null, 1.5]) {
      const malformed = structuredClone(originalTrees) as unknown as { t: Record<string, unknown[]>; b: Record<string, unknown> };
      const block = malformed.t.Franks!.find((value) => Array.isArray(value) && Array.isArray(value[3]) && value[3].length > 0) as unknown[];
      const cell = (block[3] as unknown[])[0] as unknown[];
      cell[0] = age;
      expect(treesSafeForUnitDetail(malformed as unknown as Trees, names)).toBe(false);
    }
  });
});

describe('UnitDetail 局部资源重验（#1053）', () => {
  it('网络拒绝只使用共享 retry，不伪造本地成功', async () => {
    const retry = vi.fn();
    const read = vi.fn(async () => ({ ok: true }));
    const resolved = vi.fn();
    const status = await rereadUnitResource(
      read,
      { current: 0 },
      {
        begin: vi.fn(),
        resolved,
        rejected: vi.fn(),
      },
      { data: null, error: true, retry },
    );
    expect(status).toBe('shared-retry');
    expect(retry).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(resolved).not.toHaveBeenCalled();
  });

  it('成功但结构错误时真实重读并重验，坏缓存仍然无效', async () => {
    const malformed = { t: { Franks: [] }, b: {} } as unknown as Trees;
    const read = vi.fn(async () => malformed);
    const resolved = vi.fn((value: Trees) => expect(treesSafeForUnitDetail(value, ['Franks'])).toBe(false));
    const retry = vi.fn();
    const status = await rereadUnitResource(
      read,
      { current: 0 },
      {
        begin: vi.fn(),
        resolved,
        rejected: vi.fn(),
      },
      { data: malformed, error: false, retry },
    );
    expect(status).toBe('resolved');
    expect(read).toHaveBeenCalledOnce();
    expect(resolved).toHaveBeenCalledWith(malformed, 1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('共享请求拒绝会使旧本地请求失效，避免晚到结果覆盖共享重试', async () => {
    let finish!: (value: string) => void;
    const generation = { current: 0 };
    const stale = rereadUnitResource(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      generation,
      {
        begin: vi.fn(),
        resolved: vi.fn(),
        rejected: vi.fn(),
      },
    );
    const retry = vi.fn();
    const status = await rereadUnitResource(
      async () => 'unused',
      generation,
      {
        begin: vi.fn(),
        resolved: vi.fn(),
        rejected: vi.fn(),
      },
      { data: null, error: true, retry },
    );
    finish('stale');
    expect(status).toBe('shared-retry');
    expect(generation.current).toBe(2);
    expect(retry).toHaveBeenCalledOnce();
    expect(await stale).toBe('stale');
  });

  it('较早异步结果不能覆盖较新的资源重验', async () => {
    let finishFirst!: (value: string) => void;
    const generation = { current: 0 };
    const seen: string[] = [];
    const callbacks = {
      begin: () => {},
      resolved: (value: string) => seen.push(value),
      rejected: () => {},
    };
    const first = rereadUnitResource(
      () =>
        new Promise<string>((resolve) => {
          finishFirst = resolve;
        }),
      generation,
      callbacks,
    );
    const second = await rereadUnitResource(async () => 'new', generation, callbacks);
    finishFirst('old');
    expect(second).toBe('resolved');
    expect(await first).toBe('stale');
    expect(seen).toEqual(['new']);
  });
});
