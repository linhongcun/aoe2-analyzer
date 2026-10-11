import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WIKI } from '../../src/app/nav/sections';
import { buildFamilies, collapse, unitCount, unitCountLabel } from '../../src/domain/family';
import type { Unit } from '../../src/domain/types';
import { units } from './helpers';

const byId: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const n = unitCount(units, buildFamilies(units, byId));

describe('#14 单位总数口径', () => {
  it('精锐版并入对应单位计 = 161', () => expect(n).toBe(161));
  it('首页文案用同一个函数算出的数字，并注明口径', () => {
    const desc = WIKI.find((s) => s.key === 'units')!.desc;
    expect(desc).toContain(unitCountLabel(n));
    expect(desc).toBe('161 个单位（精锐版并入对应单位计）的属性、克制与升级路线');
    expect(desc).not.toContain('248');
  });
  it('首页卡片数字 = 单位列表页总数（同一 collapse 口径）', () => {
    const desc = WIKI.find((s) => s.key === 'units')!.desc;
    expect(+desc.match(/^(\d+) 个单位/)![1]!).toBe(collapse(units, buildFamilies(units, byId)).length);
  });
  it('源码不再写死单位数', () => {
    expect(readFileSync('src/app/nav/sections.ts', 'utf8')).not.toMatch(/\d+ 个单位/);
  });
});
