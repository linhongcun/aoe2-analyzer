import { describe, expect, it } from 'vitest';
import { norm, score, search, TIER, type SearchItem } from '../../src/domain/search';
import { BUILD_ALIAS_ROWS, BUILD_ALIASES } from '../../src/data/aliases';
import { buildOrders } from '../../src/data/buildOrders';
import { units } from './helpers';

const boItems: SearchItem[] = buildOrders.map((b) => ({
  kind: 'page',
  id: 'bo-' + b.id,
  zh: b.name.zh,
  en: b.name.en,
  href: '',
  sub: '开局时间线',
  aliases: BUILD_ALIASES[b.id],
  late: true,
}));
const unitItems: SearchItem[] = units.map((u) => ({ kind: 'unit', id: String(u.id), zh: u.zh, en: u.en, href: '', sub: '' }));
const items = [...unitItems, ...boItems];
const boIds = (r: SearchItem[]) => r.filter((x) => x.id.startsWith('bo-')).map((x) => x.id.slice(3));

describe('开局别名（审定名单）', () => {
  it('名单只含审定的别名，不含 FC、骑士速城、19p斥候', () => {
    const all = BUILD_ALIAS_ROWS.map(([n]) => n);
    expect(all).not.toContain('FC');
    expect(all).not.toContain('fc');
    expect(all).not.toContain('骑士速城');
    expect(all).not.toContain('19p斥候');
    expect(all).toHaveLength(13);
  });
  for (const [alias, ids] of BUILD_ALIAS_ROWS)
    it(`「${alias}」→ ${ids.join('、')}`, () => {
      const r = search(items, alias);
      const got = boIds(r);
      // 指向的开局都在结果里，并且排在其他开局前面
      expect(got.slice(0, ids.length).sort()).toEqual([...ids].sort());
      for (const id of ids)
        expect(
          score(
            boItems.find((b) => b.id === 'bo-' + id)!,
            alias,
          ),
        ).toBeGreaterThanOrEqual(TIER.alias);
    });
});

describe('归一化：不分大小写、忽略空格', () => {
  it.each([
    ['Drush', 'drush'],
    ['Fast Castle', 'fast castle'],
    ['FASTCASTLE', 'fast castle'],
    [' 黑 快 ', '黑快'],
  ])('「%s」与别名「%s」完全匹配', (q, alias) => {
    expect(norm(q)).toBe(norm(alias));
    const ids = BUILD_ALIAS_ROWS.find(([n]) => n === alias)![1];
    expect(boIds(search(items, q)).slice(0, ids.length).sort()).toEqual([...ids].sort());
  });
});

describe('分档：名称完全 > 名称前缀 > 别名完全 > 包含', () => {
  const it0 = (zh: string, aliases?: string[]): SearchItem => ({ kind: 'page', id: zh, zh, en: '', href: '', sub: '', aliases });
  it('分值顺序', () => {
    expect(score(it0('黑快'), '黑快')).toBe(TIER.exact);
    expect(score(it0('黑快开局'), '黑快')).toBe(TIER.prefix);
    expect(score(it0('某开局', ['黑快']), '黑快')).toBe(TIER.alias);
    expect(score(it0('民兵黑快'), '黑快')).toBe(TIER.sub);
    expect(TIER.exact > TIER.prefix && TIER.prefix > TIER.alias && TIER.alias > TIER.sub).toBe(true);
  });
  // 搜单位名时，名字含该词的单位不能被开局压过
  it.each(['侦察骑', '弓箭手', '长剑', '武士', '骑士'])('搜「%s」：没有开局排在匹配的单位前面', (q) => {
    const r = search(items, q, 100);
    const firstBo = r.findIndex((x) => x.id.startsWith('bo-'));
    const unitsHit = r.map((x, i) => [x, i] as const).filter(([x]) => x.kind === 'unit' && score(x, q) >= TIER.sub);
    if (firstBo >= 0) for (const [, i] of unitsHit) expect(i).toBeLessThan(firstBo);
  });
  it('「武士」「骑士」「长剑」第一条是单位', () => {
    for (const q of ['武士', '骑士', '长剑']) expect(search(items, q)[0]!.kind).toBe('unit');
  });
});
