import { createRequire } from 'node:module';
import type { ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
import { reverseCounters } from '../../src/domain/reverseCounters';
import type { ReverseCounterSession } from '../../src/features/units/reverseCounterSession';

type ControlledScheduler = {
  unstable_flushAllWithoutAsserting: () => void;
  unstable_getFirstCallbackNode: () => unknown;
};

type ModuleLoader = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
type ReverseCountersComponent = (typeof import('../../src/features/units/components/ReverseCounters'))['ReverseCounters'];
type SessionModule = typeof import('../../src/features/units/reverseCounterSession');
type ConcurrentCreate = (element: ReactElement, options: { unstable_isConcurrent: true }) => ReactTestRenderer;

const nodeRequire = createRequire(import.meta.url);
const nodeModule = nodeRequire('node:module') as ModuleLoader;
const originalModuleLoad = nodeModule._load;
const originalModuleLoadBound = originalModuleLoad.bind(nodeModule);
const location = { pathname: '/unit/40', search: '?civ=Byzantines&tab=ov', hash: '' };
let core: Core;
let trees: Trees;
let renderer: ReactTestRenderer | null = null;
let controlledScheduler: ControlledScheduler;
let createElement!: typeof import('react').createElement;
let MemoryRouter!: typeof import('react-router-dom').MemoryRouter;
let act!: typeof import('react-test-renderer').act;
let createConcurrent!: ConcurrentCreate;
let ReverseCounters!: ReverseCountersComponent;
let session!: SessionModule;

beforeAll(async () => {
  controlledScheduler = nodeRequire('scheduler/unstable_mock.js') as ControlledScheduler;
  nodeModule._load = (request, parent, isMain) => (request === 'scheduler' ? controlledScheduler : originalModuleLoadBound(request, parent, isMain));
  const React = nodeRequire('react') as typeof import('react');
  const router = nodeRequire('react-router-dom') as typeof import('react-router-dom');
  const rendererApi = nodeRequire('react-test-renderer') as typeof import('react-test-renderer');
  createElement = React.createElement;
  MemoryRouter = router.MemoryRouter;
  act = rendererApi.act;
  createConcurrent = rendererApi.create as unknown as ConcurrentCreate;
  const [component, sessionApi] = await Promise.all([
    import('../../src/features/units/components/ReverseCounters'),
    import('../../src/features/units/reverseCounterSession'),
  ]);
  ReverseCounters = component.ReverseCounters;
  session = sessionApi;
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

afterAll(() => {
  nodeModule._load = originalModuleLoad;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  vi.unstubAllGlobals();
});

function nodeText(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : nodeText(child))).join('');
}

function restoreNoteText(view: ReactTestRenderer): string {
  return view.root
    .findAll((node) => node.props.className === 'ud-reverse-restore')
    .map(nodeText)
    .join('');
}

function pkSummaryCount(view: ReactTestRenderer): number {
  return view.root.findAll((node) => node.props.className === 'ud-reverse-pk').length;
}

function cancelButton(view: ReactTestRenderer): ReactTestInstance {
  return view.root.find((node) => node.type === 'button' && nodeText(node) === '取消');
}

describe('反向查询恢复提示并发取消（#1053）', () => {
  it('ready effect 排队提示后取消会使旧更新失效，正常恢复仍先提示再滚动和聚焦', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const target = core.unitById[40]!;
    const query = reverseCounters(
      target,
      core.units,
      core,
      civs.map((civ) => civ.en),
      trees,
      { civ: '', age: null },
    );
    const group = query.groups.find((item) => item.rows.length > 0);
    const row = group?.rows[0];
    expect(group && row).toBeTruthy();
    const key = session.reverseCounterSessionKey(target.id, 'Byzantines', location)!;
    const record: ReverseCounterSession = {
      version: 1,
      location,
      filters: { civ: '', age: null },
      collapsed: [],
      expandedRows: [],
      openPk: { category: group!.category, id: row!.unit.id },
      anchor: 'saved-anchor',
      fallbackAnchor: null,
      offset: 80,
      focus: 'saved-focus',
    };
    expect(session.writeReverseCounterSession(key, record, storage)).toBe(true);

    const elements = new Map<string, FakeElement>();
    const focusCalls: string[] = [];
    const scrollCalls: ScrollToOptions[] = [];
    let scrollY = 20;
    class FakeElement {
      constructor(readonly id: string) {}

      getBoundingClientRect() {
        return { top: 100, bottom: 140 };
      }

      closest() {
        return null;
      }

      focus() {
        focusCalls.push(this.id);
      }
    }
    for (const id of ['saved-anchor', 'saved-focus', 'unit-reverse-counters', 'unit-reverse-title']) {
      elements.set(id, new FakeElement(id));
    }
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestFrame = (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    };
    const cancelFrame = (id: number) => frames.delete(id);
    vi.stubGlobal('window', {
      sessionStorage: storage,
      innerHeight: 800,
      get scrollY() {
        return scrollY;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: (options: ScrollToOptions) => {
        scrollCalls.push(options);
        scrollY = options.top ?? scrollY;
      },
      requestAnimationFrame: requestFrame,
      cancelAnimationFrame: cancelFrame,
    });
    vi.stubGlobal('document', {
      activeElement: null,
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelectorAll: () => [],
    });
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    const makeTree = (treesPending: boolean) =>
      createElement(
        MemoryRouter,
        { initialEntries: [`${location.pathname}${location.search}${location.hash}`] },
        createElement(ReverseCounters, {
          target,
          rawTarget: target,
          targetIssues: [],
          core,
          corePending: false,
          coreError: false,
          retryCore: () => {},
          trees: treesPending ? null : trees,
          rawTrees: treesPending ? null : trees,
          treesPending,
          treesError: false,
          retryTrees: () => {},
          targetCiv: 'Byzantines',
          location,
        }),
      );
    const flushSync = (callback: () => void) =>
      (renderer as ReactTestRenderer & { unstable_flushSync: (callback: () => void) => void }).unstable_flushSync(callback);

    await act(async () => {
      renderer = createConcurrent(makeTree(true), { unstable_isConcurrent: true });
      controlledScheduler.unstable_flushAllWithoutAsserting();
      await Promise.resolve();
    });
    expect(restoreNoteText(renderer!)).toBe('');
    expect(pkSummaryCount(renderer!)).toBe(1);

    flushSync(() => renderer!.update(makeTree(false)));
    expect(restoreNoteText(renderer!)).toBe('');
    expect(pkSummaryCount(renderer!)).toBe(1);
    expect(controlledScheduler.unstable_getFirstCallbackNode()).not.toBeNull();

    flushSync(() => cancelButton(renderer!).props.onClick());
    expect(pkSummaryCount(renderer!)).toBe(0);
    expect(restoreNoteText(renderer!)).toBe('');

    await act(async () => {
      controlledScheduler.unstable_flushAllWithoutAsserting();
      await Promise.resolve();
    });
    expect(pkSummaryCount(renderer!)).toBe(0);
    expect(restoreNoteText(renderer!)).toBe('');

    await act(async () => renderer!.unmount());
    renderer = null;
    frames.clear();
    focusCalls.length = 0;
    scrollCalls.length = 0;
    scrollY = 20;
    expect(session.writeReverseCounterSession(key, record, storage)).toBe(true);

    await act(async () => {
      renderer = createConcurrent(makeTree(false), { unstable_isConcurrent: true });
      controlledScheduler.unstable_flushAllWithoutAsserting();
      await Promise.resolve();
    });
    expect(restoreNoteText(renderer!)).toBe('已恢复上次筛选与阅读位置。');
    expect(pkSummaryCount(renderer!)).toBe(1);
    expect(scrollCalls).toEqual([]);
    expect(frames.size).toBe(1);

    const [restoreFrame] = frames.values();
    frames.clear();
    await act(async () => restoreFrame!(0));
    expect(scrollCalls).toEqual([{ top: 40, behavior: 'auto' }]);
    expect(focusCalls).toContain('saved-focus');
  });
});
