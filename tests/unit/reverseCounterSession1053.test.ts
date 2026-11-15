import { describe, expect, it } from 'vitest';
import {
  decodeReverseCounterSession,
  readReverseCounterSession,
  reverseCounterSessionKey,
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
});
