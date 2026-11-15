import { createElement } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
import { ReverseCounters } from '../../src/features/units/components/ReverseCounters';
import {
  decodeReverseCounterSession,
  readReverseCounterSession,
  reverseCounterSessionKey,
  useReverseCounterSession,
  writeReverseCounterSession,
  type ReverseCounterSession,
} from '../../src/features/units/reverseCounterSession';

const location = { pathname: '/unit/40', search: '?civ=Byzantines&tab=ov', hash: '' };
const session: ReverseCounterSession = {
  version: 1,
  location,
  filters: { civ: 'Franks', age: 3 },
  collapsed: ['步兵'],
  expandedRows: ['骑兵'],
  openPk: { category: '骑兵', id: 93 },
  anchor: 'row:40:骑兵',
  fallbackAnchor: 'group:骑兵',
  offset: 84.5,
  focus: 'pk:骑兵:93',
};

let realCore: Core;
let realTrees: Trees;
const mountedViews: ReactTestRenderer[] = [];

beforeAll(async () => {
  [realCore, realTrees] = await Promise.all([loadCore(), loadTrees()]);
});

afterEach(() => {
  while (mountedViews.length) {
    const view = mountedViews.pop()!;
    act(() => view.unmount());
  }
  vi.unstubAllGlobals();
});

function nodeText(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : nodeText(child))).join('');
}

function stubBrowser(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  vi.stubGlobal('window', {
    sessionStorage: storage,
    innerHeight: 800,
    scrollY: 0,
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
  });
  vi.stubGlobal('document', {
    activeElement: null,
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
}

describe('反向查询会话阅读状态（#1053）', () => {
  it('使用目标 ID 和本单位文明隔离会话，并完整恢复筛选、展开、锚点和位置', () => {
    const key = reverseCounterSessionKey(40, 'Byzantines', location);
    expect(key).toBe(`unit-reverse-counters:v2:40:${encodeURIComponent(JSON.stringify(['Byzantines', location.pathname, location.search, location.hash]))}`);
    expect(reverseCounterSessionKey(40, '', location)).not.toBe(key);
    expect(reverseCounterSessionKey(40, '   ', location)).toBe(reverseCounterSessionKey(40, '', location));
    expect(reverseCounterSessionKey(40, 'Byzantines', { ...location, pathname: '/unit/41' })).not.toBe(key);
    expect(reverseCounterSessionKey(40, 'Byzantines', { ...location, search: '?civ=Franks' })).not.toBe(key);
    expect(reverseCounterSessionKey(40, 'Byzantines', { ...location, hash: '#anchor' })).not.toBe(key);
    expect(reverseCounterSessionKey(0, 'Byzantines', location)).toBeNull();
    const separatorCollision = { pathname: '/unit/40?tab=ov', search: '&civ=Byzantines', hash: '' };
    const separatedLocation = { pathname: '/unit/40', search: '?tab=ov&civ=Byzantines', hash: '' };
    expect(`${separatorCollision.pathname}${separatorCollision.search}${separatorCollision.hash}`).toBe(
      `${separatedLocation.pathname}${separatedLocation.search}${separatedLocation.hash}`,
    );
    expect(reverseCounterSessionKey(40, 'Byzantines', separatorCollision)).not.toBe(reverseCounterSessionKey(40, 'Byzantines', separatedLocation));
    const restored = decodeReverseCounterSession(JSON.stringify(session), location);
    expect(restored).toEqual(session);
    expect(decodeReverseCounterSession(JSON.stringify({ ...session, openPk: undefined }), location)?.openPk).toBeNull();
    expect(decodeReverseCounterSession(JSON.stringify({ ...session, openPk: { category: '', id: 93 } }), location)?.openPk).toBeNull();
    expect(decodeReverseCounterSession(JSON.stringify(session), { ...location, search: '?civ=Franks' })).toBeNull();
  });

  it('坏记录与被禁用的存储安全回退，不影响查询；可写入和读取会话', () => {
    const key = reverseCounterSessionKey(40, 'Byzantines', location)!;
    const records = new Map<string, string>();
    const storage = {
      getItem: (name: string) => records.get(name) ?? null,
      setItem: (name: string, value: string) => records.set(name, value),
    };
    expect(writeReverseCounterSession(key, session, storage)).toBe(true);
    expect(readReverseCounterSession(key, location, storage)).toEqual(session);
    expect(readReverseCounterSession(key, location, null)).toBeNull();
    expect(decodeReverseCounterSession('{bad json', location)).toBeNull();
    expect(decodeReverseCounterSession(JSON.stringify({ ...session, version: 9 }), location)).toBeNull();
    expect(
      writeReverseCounterSession(key, session, {
        getItem: () => null,
        setItem: () => {
          throw new Error('storage disabled');
        },
      }),
    ).toBe(false);
  });

  it('首次读取无记录后不把自己的写入当作恢复，重新挂载仍能恢复', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.stubGlobal('window', { sessionStorage: storage });
    const route = { pathname: '/unit/761', search: '?civ=Goths', hash: '' };
    const key = reverseCounterSessionKey(761, 'Goths', route)!;
    const saved: ReverseCounterSession = {
      ...session,
      location: route,
      filters: { civ: '', age: null },
      collapsed: [],
      expandedRows: [],
      openPk: null,
      anchor: null,
      fallbackAnchor: null,
      offset: 0,
      focus: null,
    };
    let current!: ReturnType<typeof useReverseCounterSession>;
    function Probe() {
      current = useReverseCounterSession(761, 'Goths', route);
      return null;
    }
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(createElement(Probe));
    });
    expect(current.record).toBeNull();
    expect(current.restorePending).toBe(false);

    expect(writeReverseCounterSession(key, saved)).toBe(true);
    await act(async () => {
      renderer.update(createElement(Probe));
    });
    expect(current.record).toBeNull();
    expect(current.restorePending).toBe(false);

    await act(async () => {
      renderer.unmount();
      renderer = create(createElement(Probe));
    });
    expect(current.record).toEqual(saved);
    expect(current.restorePending).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('回到已访问过的相同 URL 时仍按新导航快照处理恢复', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.stubGlobal('window', { sessionStorage: storage });
    const a = { pathname: '/unit/40', search: '?tab=first', hash: '' };
    const b = { pathname: '/unit/40', search: '?tab=second', hash: '' };
    expect(writeReverseCounterSession(reverseCounterSessionKey(40, 'Byzantines', a), { ...session, location: a }, storage)).toBe(true);
    let current!: ReturnType<typeof useReverseCounterSession>;
    function Probe({ route }: { route: typeof a }) {
      current = useReverseCounterSession(40, 'Byzantines', route);
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Probe, { route: a }));
    });
    expect(current.restorePending).toBe(true);
    await act(async () => current.markRestored());
    expect(current.restorePending).toBe(false);
    await act(async () => renderer.update(createElement(Probe, { route: b })));
    expect(current.record).toBeNull();
    await act(async () => renderer.update(createElement(Probe, { route: a })));
    expect(current.restorePending).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('真实 ReverseCounters 在完整 URL A/B 间分别 autosave 并恢复筛选、分组和 PK', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const a = { pathname: '/unit/40', search: '?civ=Byzantines&tab=ov', hash: '' };
    const b = { pathname: '/unit/40', search: '?civ=Byzantines&tab=sim', hash: '' };
    const locationKey = (route: typeof a) => JSON.stringify([route.pathname, route.search, route.hash]);
    let currentRoute = a;
    let scrollY = 20;
    let activeElement: FakeDomElement | null = null;
    const elements = new Map<string, FakeDomElement>();
    class FakeDomElement {
      readonly focus = vi.fn(function (this: FakeDomElement) {
        activeElement = elements.get(this.id) ?? null;
      });

      constructor(
        readonly id: string,
        public top: number,
        readonly parentGroup: FakeDomElement | null = null,
      ) {}

      getBoundingClientRect() {
        return { top: this.top, bottom: this.top + 40 } as DOMRect;
      }

      closest(selector: string) {
        return selector === '[data-reverse-group]' ? this.parentGroup : null;
      }
    }
    const addElement = (id: string, top: number, parentGroup: FakeDomElement | null = null) => {
      const element = new FakeDomElement(id, top, parentGroup);
      elements.set(id, element);
      return element;
    };
    const groupA = addElement('reader-group-a', 50);
    const groupB = addElement('reader-group-b', 50);
    const rowA = addElement('reader-row-a', 84.5, groupA);
    const rowB = addElement('reader-row-b', 84.5, groupB);
    const rowByLocation = new Map([
      [locationKey(a), rowA],
      [locationKey(b), rowB],
    ]);
    const initialFocus = addElement('reader-focus-a', 0);
    addElement('reader-focus-b', 0);
    addElement('unit-reverse-counters', 40);
    addElement('unit-reverse-title', 0);
    activeElement = initialFocus;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      const nextScrollY = options.top ?? scrollY;
      const delta = nextScrollY - scrollY;
      const row = rowByLocation.get(locationKey(currentRoute));
      if (row) row.top -= delta;
      scrollY = nextScrollY;
    });
    const getElementById = vi.fn((id: string) => {
      const existing = elements.get(id);
      if (existing) return existing;
      if (id.startsWith('reverse-counter-pk-')) return addElement(id, 0);
      return null;
    });
    const fakeWindow = {
      sessionStorage: storage,
      innerHeight: 800,
      get scrollY() {
        return scrollY;
      },
      scrollTo,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const fakeDocument = {
      get activeElement() {
        return activeElement;
      },
      getElementById,
      querySelectorAll: vi.fn((selector: string) => (selector === '[data-reverse-row]' ? [rowByLocation.get(locationKey(currentRoute))].filter(Boolean) : [])),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const pendingFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      pendingFrames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number) => pendingFrames.delete(id));
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('Element', FakeDomElement);
    vi.stubGlobal('HTMLElement', FakeDomElement);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const target = realCore.unitById[40]!;
    const keyFor = (route: typeof a) => reverseCounterSessionKey(40, 'Byzantines', route)!;
    const recordFor = (route: typeof a) => readReverseCounterSession(keyFor(route), route, storage);
    const seedA: ReverseCounterSession = {
      ...session,
      location: a,
      filters: { civ: '', age: null },
      collapsed: [],
      expandedRows: ['骑兵'],
      openPk: null,
      anchor: rowA.id,
      fallbackAnchor: groupA.id,
      offset: 84.5,
      focus: initialFocus.id,
    };
    expect(writeReverseCounterSession(keyFor(a), seedA, storage)).toBe(true);
    const makeTree = (initial: typeof a) =>
      createElement(MemoryRouter, { initialEntries: [`${initial.pathname}${initial.search}${initial.hash}`] }, createElement(RouterHarness));
    const settle = async () => act(async () => new Promise((resolve) => setTimeout(resolve, 1)));
    const flushFrames = async () => {
      while (pendingFrames.size) {
        const callbacks = [...pendingFrames.values()];
        pendingFrames.clear();
        await act(async () => callbacks.forEach((callback) => callback(0)));
      }
      await settle();
    };
    function RouterHarness() {
      const route = useLocation();
      const navigate = useNavigate();
      const location = { pathname: route.pathname, search: route.search, hash: route.hash };
      currentRoute = location;
      return createElement(
        'div',
        null,
        createElement('button', { id: 'navigate-a', onClick: () => navigate(`${a.pathname}${a.search}${a.hash}`) }),
        createElement('button', { id: 'navigate-b', onClick: () => navigate(`${b.pathname}${b.search}${b.hash}`) }),
        createElement(ReverseCounters, {
          target,
          rawTarget: target,
          targetIssues: [],
          core: realCore,
          corePending: false,
          coreError: false,
          retryCore: () => {},
          trees: realTrees,
          rawTrees: realTrees,
          treesPending: false,
          treesError: false,
          retryTrees: () => {},
          targetCiv: 'Byzantines',
          location,
        }),
      );
    }
    const mountAt = async (route: typeof a) => {
      let view!: ReactTestRenderer;
      await act(async () => {
        view = create(makeTree(route));
      });
      mountedViews.push(view);
      await flushFrames();
      return view;
    };
    const unmount = async (view: ReactTestRenderer) => {
      await act(async () => view.unmount());
      mountedViews.splice(mountedViews.indexOf(view), 1);
    };
    const navigateTo = async (view: ReactTestRenderer, route: typeof a) => {
      const button = view.root.findByProps({ id: route.search === a.search ? 'navigate-a' : 'navigate-b' });
      await act(async () => button.props.onClick());
      await flushFrames();
    };
    const setFilter = async (view: ReactTestRenderer, civ: string, age: number) => {
      const picker = view.root.findAll((node) => node.props.id === 'reverse-counter-civ')[0]!;
      await act(async () => picker.props.onChange(civ));
      const ageInput = view.root.findByProps({ id: 'reverse-counter-age' });
      await act(async () => ageInput.props.onChange({ target: { value: String(age) } }));
      await settle();
    };
    const groupCategories = (view: ReactTestRenderer) =>
      view.root.findAllByProps({ className: 'ud-reverse-group-toggle' }).map((toggle) => nodeText(toggle.children[0] as ReactTestInstance));
    const setExpandedGroups = async (view: ReactTestRenderer, expanded: string[]) => {
      for (const category of groupCategories(view)) {
        const toggle = view.root
          .findAllByProps({ className: 'ud-reverse-group-toggle' })
          .find((item) => nodeText(item.children[0] as ReactTestInstance) === category)!;
        if (toggle.props['aria-expanded'] !== expanded.includes(category)) await act(async () => toggle.props.onClick());
      }
      await settle();
    };
    const selectPk = async (view: ReactTestRenderer, excludedId?: number) => {
      const findButton = () =>
        view.root
          .findAllByProps({ 'data-t': 'reverse-counter-pk' })
          .find((item) => !item.props.disabled && Number(item.props.id?.split('-').at(-1)) !== excludedId);
      let button = findButton();
      while (!button) {
        const collapsedGroup = view.root.findAllByProps({ className: 'ud-reverse-group-toggle' }).find((toggle) => toggle.props['aria-expanded'] === false);
        if (!collapsedGroup) break;
        await act(async () => collapsedGroup.props.onClick());
        await settle();
        button = findButton();
      }
      expect(button).toBeDefined();
      getElementById(button!.props.id)?.focus();
      await act(async () => button!.props.onClick());
      await flushFrames();
      return button!;
    };
    const expectGroupExpanded = (view: ReactTestRenderer, category: string) => {
      const toggle = view.root
        .findAllByProps({ className: 'ud-reverse-group-toggle' })
        .find((item) => nodeText(item.children[0] as ReactTestInstance) === category);
      expect(toggle).toBeDefined();
      expect(toggle!.props['aria-expanded']).toBe(true);
    };
    const expectRestored = (view: ReactTestRenderer, route: typeof a, expected: ReverseCounterSession) => {
      const picker = view.root.findAll((node) => node.props.id === 'reverse-counter-civ')[0]!;
      expect(picker.props.value).toBe(expected.filters.civ);
      expect(view.root.findByProps({ id: 'reverse-counter-age' }).props.value).toBe(expected.filters.age ?? '');
      const toggles = view.root.findAllByProps({ className: 'ud-reverse-group-toggle' });
      for (const toggle of toggles) {
        const category = nodeText(toggle.children[0] as ReactTestInstance);
        expect(toggle.props['aria-expanded']).toBe(!expected.collapsed.includes(category));
      }
      const openPkId = expected.openPk?.id;
      expect(openPkId).toBeDefined();
      expect(view.root.findAllByProps({ id: `reverse-counter-pk-title-${openPkId}` })).toHaveLength(1);
      expect(recordFor(route)).toEqual(expected);
    };
    const expectRestoreEffects = (route: typeof a, expected: ReverseCounterSession, startingTop: number, destinationTop: number) => {
      const row = rowByLocation.get(locationKey(route))!;
      expect(expected.anchor).toBe(row.id);
      expect(expected.fallbackAnchor).toBe(row.parentGroup?.id);
      expect(expected.offset).toBe(84.5);
      expect(expected.focus).toBeTruthy();
      expect(scrollTo).toHaveBeenCalledWith({ top: startingTop + destinationTop - expected.offset, behavior: 'auto' });
      expect(row.top).toBe(expected.offset);
      expect(getElementById(expected.focus!)?.focus).toHaveBeenCalled();
      expect(activeElement?.id).toBe(expected.focus);
    };
    const restoreByNavigation = async (view: ReactTestRenderer, route: typeof a, expected: ReverseCounterSession, destinationTop: number) => {
      const row = rowByLocation.get(locationKey(route))!;
      row.top = destinationTop;
      const startingTop = scrollY;
      scrollTo.mockClear();
      getElementById(expected.focus!)?.focus.mockClear();
      await navigateTo(view, route);
      expectRestored(view, route, expected);
      expectRestoreEffects(route, expected, startingTop, destinationTop);
    };

    let view = await mountAt(a);
    expect(recordFor(a)).toEqual(seedA);
    expect(scrollTo).toHaveBeenCalledWith({ top: 20, behavior: 'auto' });
    expect(initialFocus.focus).toHaveBeenCalled();
    await setFilter(view, 'Franks', 3);
    await setExpandedGroups(view, []);
    const selectedA = await selectPk(view);
    const selectedAId = selectedA.props.id;
    const selectedRecordA = recordFor(a)!;
    const categoryA = selectedRecordA.openPk?.category;
    expect(categoryA).toBeTruthy();
    expectGroupExpanded(view, categoryA!);
    await setExpandedGroups(view, [categoryA!]);
    const recordA = recordFor(a)!;
    expect(recordA.filters).toEqual({ civ: 'Franks', age: 3 });
    expect(recordA.openPk).not.toBeNull();
    expect(recordA.anchor).toBe(rowA.id);
    expect(recordA.fallbackAnchor).toBe(groupA.id);
    expect(recordA.offset).toBe(84.5);
    expect(recordA.focus).toBeTruthy();
    expect(recordA.expandedRows).toContain('骑兵');

    await navigateTo(view, b);
    expect(recordFor(b)?.filters).toEqual({ civ: '', age: null });
    await setFilter(view, 'Goths', 3);
    await setExpandedGroups(view, []);
    const selectedB = await selectPk(view, recordA.openPk!.id);
    const selectedBId = selectedB.props.id;
    const selectedRecordB = recordFor(b)!;
    const categoryB = selectedRecordB.openPk?.category;
    expect(categoryB).toBeTruthy();
    expectGroupExpanded(view, categoryB!);
    const extraCategory = groupCategories(view).find((category) => category !== categoryA && category !== categoryB);
    await setExpandedGroups(view, extraCategory ? [categoryB!, extraCategory] : [categoryB!]);
    const recordB = recordFor(b)!;
    expect(recordB.filters).toEqual({ civ: 'Goths', age: 3 });
    expect(recordB.openPk).not.toBeNull();
    expect(recordB.openPk?.id).not.toBe(recordA.openPk?.id);
    expect(recordB.collapsed).not.toEqual(recordA.collapsed);
    expect(recordB.expandedRows).toEqual([]);
    expect(recordB.anchor).toBe(rowB.id);
    expect(recordB.fallbackAnchor).toBe(groupB.id);
    expect(recordB.offset).toBe(84.5);
    expect(recordB.focus).toBeTruthy();
    expect(recordFor(a)).toEqual(recordA);

    await restoreByNavigation(view, a, recordA, 150);
    await restoreByNavigation(view, b, recordB, 170);

    await unmount(view);
    rowA.top = 190;
    const scrollBeforeA = scrollY;
    scrollTo.mockClear();
    getElementById(recordA.focus!)?.focus.mockClear();
    view = await mountAt(a);
    expectRestored(view, a, recordA);
    expectRestoreEffects(a, recordA, scrollBeforeA, 190);
    await unmount(view);
    rowB.top = 210;
    const scrollBeforeB = scrollY;
    scrollTo.mockClear();
    getElementById(recordB.focus!)?.focus.mockClear();
    view = await mountAt(b);
    expectRestored(view, b, recordB);
    expectRestoreEffects(b, recordB, scrollBeforeB, 210);
    expect(selectedAId).not.toBe(selectedBId);
  });

  it('仅可信的全空结果展示空面板，partial、pending 与 error 保留各自状态', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    stubBrowser(storage);
    const target = realCore.unitById[83]!;
    const route = { pathname: '/unit/83', search: '', hash: '' };
    const makeTree = (options: { targetIssues?: string[]; trees?: Trees | null; rawTrees?: Trees | null; treesPending?: boolean; treesError?: boolean } = {}) =>
      createElement(
        MemoryRouter,
        { initialEntries: ['/unit/83'] },
        createElement(ReverseCounters, {
          target,
          rawTarget: target,
          targetIssues: options.targetIssues ?? [],
          core: realCore,
          corePending: false,
          coreError: false,
          retryCore: () => {},
          trees: options.trees === undefined ? realTrees : options.trees,
          rawTrees: options.rawTrees === undefined ? realTrees : options.rawTrees,
          treesPending: options.treesPending ?? false,
          treesError: options.treesError ?? false,
          retryTrees: () => {},
          targetCiv: '',
          location: route,
        }),
      );
    let view!: ReactTestRenderer;
    const mount = async (options?: Parameters<typeof makeTree>[0]) => {
      await act(async () => {
        if (view) view.update(makeTree(options));
        else view = create(makeTree(options));
      });
      await act(async () => new Promise((resolve) => setTimeout(resolve, 1)));
      if (!mountedViews.includes(view)) mountedViews.push(view);
    };

    await mount();
    expect(view.root.findAllByProps({ 'data-t': 'reverse-counter-empty' })).toHaveLength(1);
    expect(view.root.findAllByProps({ className: 'ud-reverse-group' })).toHaveLength(0);

    const civ = view.root.findAll((node) => node.props.id === 'reverse-counter-civ')[0]!;
    await act(async () => civ.props.onChange('Britons'));
    await act(async () => view.root.findByProps({ id: 'reverse-counter-age' }).props.onChange({ target: { value: '1' } }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1)));
    const emptyPanel = view.root.findByProps({ 'data-t': 'reverse-counter-empty' });
    const clear = emptyPanel.findByType('button');
    await act(async () => clear.props.onClick());
    expect(view.root.findAllByProps({ 'data-t': 'reverse-counter-empty' })[0]?.findByType('h3').children.join('')).toBe('基础目录未找到正贡献类别匹配');

    await mount({ targetIssues: ['atks'] });
    expect(view.root.findAllByProps({ 'data-t': 'reverse-counter-empty' })).toHaveLength(0);
    expect(view.root.findAll((node) => node.props.className === 'ud-reverse-empty').some((node) => nodeText(node).includes('不作为无匹配判断'))).toBe(true);
    expect(view.root.findAllByProps({ className: 'ud-reverse-group' })).toHaveLength(0);

    await mount({ trees: null, rawTrees: null, treesPending: true });
    expect(view.root.findAllByProps({ 'data-t': 'reverse-counter-empty' })).toHaveLength(0);
    expect(view.root.findAll((node) => node.props.role === 'status').some((node) => nodeText(node).includes('正在核对可用性筛选'))).toBe(true);

    await mount({ trees: null, rawTrees: null, treesError: true });
    expect(view.root.findAllByProps({ 'data-t': 'reverse-counter-empty' })).toHaveLength(0);
    expect(view.root.findAll((node) => node.props.role === 'alert').some((node) => nodeText(node).includes('可用性资料加载失败'))).toBe(true);
  });
});
