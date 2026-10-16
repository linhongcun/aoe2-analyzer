import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import { pyMatch, search, type SearchItem } from '../../src/domain/search';

/** v0.9.0 验收（#145）。Kent 写，先失败，功能做完后应全部通过。 */

describe('A #145 huns42flag 行数断言等字体加载', () => {
  it('A1 huns42flag.spec.ts 在量行数之前 await document.fonts.ready', () => {
    const src = readFileSync('tests/e2e/huns42flag.spec.ts', 'utf8');
    expect(src).toMatch(/document\.fonts\.ready/);
    // 必须在 lines() 里（或其调用前）等字体，不能只在别处出现
    const body = src.slice(src.indexOf('const lines'), src.indexOf('const lines') + 600);
    expect(body).toMatch(/fonts\.ready/);
  });
});

describe('B #145 发版脚本重跑认合入提交、本地残留 tag 提前报错', () => {
  const src = readFileSync('scripts/release.mjs', 'utf8');
  it('B1 重跑时以 release 合入 main 的提交为准（findReleaseCommit），不是当前 main 头部', () => {
    expect(src).toMatch(/export function findReleaseCommit/);
    expect(src).toMatch(/--first-parent/);
  });
  it('B2 本地残留 tag 在前置检查（合并之前）报错', () => {
    const early = src.indexOf('本地残留 tag');
    const mergeStep = src.indexOf('第 1 步：合并');
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(mergeStep);
  });
});

// ── E #145（kent/v090-acceptance @ fae2fc8 原样）──
type Row = { zh: string; en: string; py?: string; pyi?: string; id?: number };
const KINDS = { civs: 'civ', units: 'unit', buildings: 'building', techs: 'tech' } as const;
const DATA = { civs, units, buildings, techs } as unknown as Record<keyof typeof KINDS, Row[]>;
const items: SearchItem[] = (Object.keys(KINDS) as (keyof typeof KINDS)[]).flatMap((f) =>
  DATA[f].map((r) => ({ ...r, kind: KINDS[f] }) as unknown as SearchItem),
);

describe('E #145 短拼音前缀不能被中英文命中挤出前 30', () => {
  it('E1 「ba」前 30 条里有百夫长', () => {
    expect(search(items, 'ba').map((r) => r.zh)).toContain('百夫长');
  });
  it('E2 任一 2 字母查询，只要有拼音命中，前 30 条里至少出现 1 条拼音命中', () => {
    const bad: string[] = [];
    for (const a of 'abcdefghijklmnopqrstuvwxyz')
      for (const b of 'abcdefghijklmnopqrstuvwxyz') {
        const q = a + b;
        const pyHits = items.filter((it) => pyMatch(it, q));
        if (!pyHits.length) continue;
        const top = search(items, q);
        if (!top.some((it) => pyMatch(it, q))) bad.push(q);
      }
    expect(bad).toEqual([]);
  });
  it('E3 中英文命中仍排在拼音命中前面（「ba」弹道学在百夫长前）', () => {
    const r = search(items, 'ba').map((x) => x.zh);
    expect(r.indexOf('弹道学')).toBeGreaterThanOrEqual(0);
    expect(r.indexOf('弹道学')).toBeLessThan(r.indexOf('百夫长'));
  });
});
