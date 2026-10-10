import { describe, expect, it } from 'vitest';
import { buildFamilies, collapse, groupLines } from '../../src/domain/family';
import { search, type SearchItem } from '../../src/domain/search';
import { techAffects } from '../../src/domain/affects';
import type { Unit } from '../../src/domain/types';
import { tech, units } from './helpers';

const byId: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const fam = buildFamilies(units, byId);
const en = (id: number) => byId[id]!.en;

describe('普通/精锐合并', () => {
  it('所有 Elite X 都能找到普通版（含 from_ 缺失的精锐钦察）', () => {
    const elites = units.filter((u) => u.en.startsWith('Elite '));
    expect(elites.filter((e) => !fam.baseOf[e.id])).toEqual([]);
    expect(en(fam.baseOf[1260]!.id)).toBe('Kipchak');
    expect(en(fam.eliteOf[281]!.id)).toBe('Elite Throwing Axeman');
  });
  it('同名不同 id 的近卫军各自配对', () => {
    expect(fam.eliteOf[41]!.id).toBe(555);
    expect(fam.eliteOf[759]!.id).toBe(761);
  });
  it('collapse：普通+精锐合并为一条；只有精锐时保留精锐', () => {
    const r = collapse([byId[281]!, byId[531]!, byId[8]!], fam);
    expect(r.map((x) => [x.u.id, x.elite?.id])).toEqual([
      [281, 531],
      [8, undefined],
    ]);
    expect(collapse([byId[531]!], fam).map((x) => x.u.id)).toEqual([531]);
  });
  it('维京独特单位只剩 1 个家族条目', () => {
    const v = units.filter((u) => u.type === 'UniqueUnit' && u.civs.includes('Vikings'));
    expect(collapse(v, fam).length).toBeLessThan(v.length);
  });
  it('有独立名称的升级路线不合并（骑士/重骑士/圣骑士 仍为 3 个单位）', () => {
    const k = units.filter((u) => ['Knight', 'Cavalier', 'Paladin'].includes(u.en));
    expect(collapse(k, fam)).toHaveLength(3);
  });
  it('作用对象：血统里骑士系合并为一组，按升级顺序', () => {
    const us = techAffects(tech('Bloodlines'), units, []).flatMap((g) => g.rows.flatMap((r) => r.units));
    const lines = groupLines(us, units, byId, fam);
    const knight = lines.find((l) => l.members.some((m) => m.u.en === 'Knight'))!;
    const n = knight.members.map((m) => m.u.en);
    expect(n.indexOf('Knight')).toBeLessThan(n.indexOf('Cavalier'));
    expect(n.indexOf('Cavalier')).toBeLessThan(n.indexOf('Paladin'));
    // 精锐版不再单独出现
    expect(lines.flatMap((l) => l.members.map((m) => m.u.en)).some((n) => n.startsWith('Elite '))).toBe(false);
  });
});

describe('搜索：一个家族一条结果，精锐名也能搜到', () => {
  const items: SearchItem[] = collapse(units, fam).map(({ u, elite }) => ({
    kind: 'unit',
    id: String(u.id),
    zh: u.zh,
    en: u.en,
    href: '',
    sub: '',
    alt: elite ? [elite.zh, elite.en.toLowerCase()] : undefined,
  }));
  it('搜“长弓”只出一条长弓兵', () => {
    expect(search(items, '长弓').filter((x) => x.zh.includes('长弓'))).toHaveLength(1);
  });
  it('搜“精锐掷斧兵”命中掷斧兵家族', () => {
    expect(search(items, '精锐掷斧兵')[0]!.en).toBe('Throwing Axeman');
  });
});

describe('同名单位去重', () => {
  it('两个答刺罕 id + 两个精锐答刺罕 只剩一条', () => {
    const t = units.filter((u) => u.en.endsWith('Tarkan'));
    expect(t.length).toBe(4);
    const r = collapse(t, fam);
    expect(r).toHaveLength(1);
    expect(r[0]!.elite).toBeDefined();
  });
});
