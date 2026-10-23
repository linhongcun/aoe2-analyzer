import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WIKI } from '../../src/shared/nav/sections';
import { buildFamilies, collapse, unitCount, unitCountLabel } from '../../src/domain/family';
import type { Unit } from '../../src/domain/types';
import { units } from './helpers';

const byId: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const fam = buildFamilies(units, byId);
const n = unitCount(units, fam);

describe('#14 单位总数口径', () => {
  it('精锐版并入对应单位计 = 163', () => expect(n).toBe(163));
  it('首页文案用同一个函数算出的数字，并注明口径', () => {
    const desc = WIKI.find((s) => s.key === 'units')!.desc;
    expect(desc).toContain(unitCountLabel(n));
    expect(desc).toBe('163 个单位（精锐版并入对应单位计）的属性、克制与升级路线');
    expect(desc).not.toContain('248');
    expect(desc).not.toContain('161');
  });
  it('首页卡片数字 = 单位列表页总数（同一 collapse 口径）', () => {
    const desc = WIKI.find((s) => s.key === 'units')!.desc;
    expect(+desc.match(/^(\d+) 个单位/)![1]!).toBe(collapse(units, fam).length);
  });
  it('源码不再写死单位数', () => {
    expect(readFileSync('src/shared/nav/sections.ts', 'utf8')).not.toMatch(/\d+ 个单位/);
    expect(readFileSync('src/shared/nav/pageRegistry.ts', 'utf8')).not.toMatch(/\d+ 个单位/);
  });
  it('同中文名不同英文名的单位分开计：楼船 1750/1948、战车 1759/1962', () => {
    const ids = collapse(units, fam).map((x) => x.u.id);
    expect(ids).toEqual(expect.arrayContaining([1750, 1948, 1962, 1759]));
  });
  it('同英文名不同 id 的单位只计一次：答刺罕（城堡/马厩）', () => {
    const r = collapse(
      units.filter((u) => u.en.endsWith('Tarkan')),
      fam,
    );
    expect(r).toHaveLength(1);
  });
});
