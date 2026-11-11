import { describe, expect, it } from 'vitest';
import { toggleSelected } from '../../src/domain/prereq';
import type { Tech } from '../../src/domain/types';

const byId = {
  1: { id: 1, pre: null },
  2: { id: 2, pre: 1 },
  3: { id: 3, pre: 2 },
  4: { id: 4, pre: 1 },
  5: { id: 5, pre: 99 },
  6: { id: 6, pre: 7 },
  7: { id: 7, pre: 1 },
} as unknown as Record<number, Tech>;
const available = new Set([1, 2, 3, 4, 5]);

describe('科技选择共享切换（issue 904）', () => {
  it('选中时补全可用前置链', () => {
    expect([...toggleSelected(3, new Set(), byId, { available })].sort()).toEqual([1, 2, 3]);
    expect([...toggleSelected(3, new Set(), byId, { available: new Set([3]) })].sort()).toEqual([3]);
  });

  it('中间前置已选中时仍继续补更早的链', () => {
    expect([...toggleSelected(3, new Set([2]), byId, { available })].sort()).toEqual([1, 2, 3]);
  });

  it('取消时按前置缺失移除后继', () => {
    expect([...toggleSelected(2, new Set([1, 2, 3, 4]), byId, { available, removeMissing: 'any' })].sort()).toEqual([1, 4]);
  });

  it('removeMissing 区分 any 与 available', () => {
    const opts = { available, removeMissing: 'any' as const };
    expect(toggleSelected(1, new Set([1, 5]), byId, opts).has(5)).toBe(false);
    expect(toggleSelected(1, new Set([1, 5]), byId, { ...opts, removeMissing: 'available' }).has(5)).toBe(true);
  });

  it('免费科技不可取消，不可用科技按 ignoreUnavailable 处理', () => {
    const free = new Set([2]);
    expect([...toggleSelected(2, new Set([1, 2]), byId, { available, free })]).toEqual([1, 2]);
    expect([...toggleSelected(5, new Set(), byId, { available: new Set([1]) })]).toEqual([]);
    expect([...toggleSelected(5, new Set([5]), byId, { available: new Set([1]) })]).toEqual([]);
    expect([...toggleSelected(5, new Set([5]), byId, { available: new Set([1]), ignoreUnavailable: true })]).toEqual([5]);
  });

  it('crossUnavailable 只影响补链，不把不可用项加入选择', () => {
    expect([...toggleSelected(6, new Set(), byId, { available: new Set([1, 6]) })]).toEqual([6]);
    expect([...toggleSelected(6, new Set(), byId, { available: new Set([1, 6]), crossUnavailable: true })].sort()).toEqual([1, 6]);
  });

  it('sort 只影响返回顺序', () => {
    expect([...toggleSelected(1, new Set([4, 3]), byId, { available, sort: true })]).toEqual([1, 3, 4]);
  });
});
