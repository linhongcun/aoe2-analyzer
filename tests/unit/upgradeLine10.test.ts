import { describe, expect, it } from 'vitest';
import { upgradeLine } from '../../src/domain/units';
import { civStatus } from '../../src/domain/simulator';
import type { Trees, Unit } from '../../src/domain/types';
import treesJson from '../../src/data/trees.json';
import { units } from './helpers';

const trees = treesJson as unknown as Trees;
const byId: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const ids = (id: number, civ?: string) => {
  const st = civ ? civStatus(trees, civ) : null;
  return upgradeLine(byId[id]!, units, byId, st ? (x) => st['u' + x] === 1 : undefined).map((u) => u.id);
};

describe('#10 升级路线分叉', () => {
  it('通用：骑士/重装骑士 升级到 游侠，不是萨瓦尔', () => {
    expect(ids(38)).toEqual([38, 283, 569]);
    expect(ids(283)).toEqual([38, 283, 569]);
  });
  it('波斯：最后一级为萨瓦尔', () => {
    expect(ids(38, 'Persians')).toEqual([38, 283, 1813]);
  });
  it('其它分叉通用视角都取非独特单位', () => {
    expect(ids(75)).toContain(473); // 双手剑士，不是罗马军团兵
    expect(ids(75)).not.toContain(1793);
    expect(ids(529).at(-1)).toBe(532); // 快速火船，不是龙船
    expect(ids(546).at(-1)).toBe(441); // 匈牙利骠骑兵，不是翼骑兵
  });
  it('罗马/波兰/中国按文明取独特分叉', () => {
    expect(ids(77, 'Romans')).toContain(1793);
    expect(ids(546, 'Poles').at(-1)).toBe(1707);
    expect(ids(529, 'Chinese').at(-1)).toBe(1302);
  });
  it('所有带分叉的 from_ 在通用视角下都不取独特单位', () => {
    const forks = new Map<number, Unit[]>();
    units.forEach((u) => u.from_ != null && forks.set(u.from_, [...(forks.get(u.from_) ?? []), u]));
    for (const [from, cs] of forks) {
      if (cs.length < 2) continue;
      const line = ids(from);
      const next = line[line.indexOf(from) + 1]!;
      expect(byId[next]!.type, `from ${from}`).not.toBe('UniqueUnit');
    }
  });
});

describe('#10 独特单位所属文明标签', () => {
  it('萨瓦尔属于波斯，罗马军团兵属于罗马，游侠不是独特单位', async () => {
    const { uniqueCivs } = await import('../../src/domain/units');
    expect(uniqueCivs(byId[1813]!, trees)).toEqual(['Persians']);
    expect(uniqueCivs(byId[1793]!, trees)).toEqual(['Romans']);
    expect(uniqueCivs(byId[569]!, trees)).toEqual([]);
  });
});
