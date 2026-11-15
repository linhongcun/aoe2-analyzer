import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => vi.unstubAllGlobals());

describe('反向查询会话阅读状态（#1053）', () => {
  it('使用目标 ID 和本单位文明隔离会话，并完整恢复筛选、展开、锚点和位置', () => {
    expect(reverseCounterSessionKey(40, 'Byzantines')).toBe('unit-reverse-counters:v1:40:Byzantines');
    expect(reverseCounterSessionKey(40, '')).toBe('unit-reverse-counters:v1:40:none');
    expect(reverseCounterSessionKey(40, '   ')).toBe('unit-reverse-counters:v1:40:none');
    expect(reverseCounterSessionKey(40, '')).not.toBe(reverseCounterSessionKey(40, 'Byzantines'));
    expect(reverseCounterSessionKey(0, 'Byzantines')).toBeNull();
    const restored = decodeReverseCounterSession(JSON.stringify(session), location);
    expect(restored).toEqual(session);
    expect(decodeReverseCounterSession(JSON.stringify({ ...session, openPk: undefined }), location)?.openPk).toBeNull();
    expect(decodeReverseCounterSession(JSON.stringify({ ...session, openPk: { category: '', id: 93 } }), location)?.openPk).toBeNull();
    expect(decodeReverseCounterSession(JSON.stringify(session), { ...location, search: '?civ=Franks' })).toBeNull();
  });

  it('坏记录与被禁用的存储安全回退，不影响查询；可写入和读取会话', () => {
    const key = reverseCounterSessionKey(40, 'Byzantines')!;
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
    const key = reverseCounterSessionKey(761, 'Goths')!;
    const route = { pathname: '/unit/761', search: '?civ=Goths', hash: '' };
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
    expect(writeReverseCounterSession(reverseCounterSessionKey(40, 'Byzantines'), { ...session, location: a }, storage)).toBe(true);
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
});
