import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { score, search, TIER, type SearchItem } from '../../src/domain/search';
import { useSearchIndex } from '../../src/features/search/hooks';

let items: SearchItem[];
function IndexProbe() {
  return createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
}
beforeAll(async () => {
  await loadCore();
  const html = renderToStaticMarkup(createElement(IndexProbe));
  items = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
});

describe('#162 B 加成和页面拼音（沿用 #159 排序）', () => {
  it('构建时生成的拼音索引没有过期', () => {
    expect(() => execFileSync('node', ['scripts/pinyin_build.mjs', '--check'], { stdio: 'inherit' })).not.toThrow();
  });

  it('所有加成、团队加成和页面（不含开局）都有对应中文名的全拼和首字母', () => {
    const extra = items.filter((r) => (r.kind === 'bonus' || r.kind === 'page') && !r.id.startsWith('bo-'));
    expect(extra.some((r) => r.kind === 'bonus' && r.id.endsWith('-team'))).toBe(true);
    for (const r of extra) {
      const count = r.zh.replace(/[^\u4e00-\u9fff]/g, '').length;
      expect(r.py, r.zh).toMatch(count ? /^[a-z]+$/ : /^$/);
      expect(r.pyi, r.zh).toHaveLength(count);
    }
  });

  it.each([
    ['bonus', '伐木工工作速度 +15%', 'famugonggongzuosudu', 'fmggzsd', '/civ/Celts/bonus/'],
    ['page', '科技模拟器', 'kejimoniqi', 'kjmnq', '/simulator'],
  ])('%s「%s」支持全拼、首字母和前缀，忽略大小写及空白，保持原链接', (kind, zh, py, pyi, href) => {
    const item = items.find((r) => r.kind === kind && r.zh === zh)!;
    expect({ py: item.py, pyi: item.pyi }).toEqual({ py, pyi });
    expect(item.href).toContain(href);
    for (const q of [py, pyi, py.slice(0, 5), pyi.slice(0, 3), ` ${py.toUpperCase().split('').join(' ')} `]) {
      expect(search(items, q), q).toContain(item);
      expect(score(item, q), q).toBe(TIER.py);
    }
    for (const q of [py.slice(2), pyi.slice(2), `${py}!`]) expect(search(items, q), q).not.toContain(item);
    expect(search(items, zh)[0]).toBe(item);
    expect(search(items, item.en)).toContain(item);
  });

  it('开局不做拼音索引（v0.12.0 候选），中文名仍能命中', () => {
    const item = items.find((r) => r.id === 'bo-scouts-18')!;
    expect(item.py).toBeUndefined();
    expect(item.pyi).toBeUndefined();
    expect(search(items, 'rkzcqbsgdmj')).not.toContain(item);
    expect(search(items, item.zh)).toContain(item);
  });

  it('新类型遵循名称精确/前缀优先、拼音提前展示、其余文本随后展示的顺序', () => {
    const page = items.find((r) => r.id === 'simulator')!;
    const bonus = items.find((r) => r.kind === 'bonus' && r.py?.startsWith('ke'))!;
    const text = (id: string, en: string): SearchItem => ({ kind: 'unit', id, zh: id, en, href: '', sub: '' });
    const exact = text('exact', 'ke');
    const prefix = text('prefix', 'Kernel');
    const word = text('word', 'Some kernel');
    const sub = text('sub', 'Skeleton');
    expect(score(page, 'ke')).toBe(TIER.py);
    expect(score(bonus, 'ke')).toBe(TIER.py);
    expect(search([sub, bonus, word, page, prefix, exact], 'ke')).toEqual([exact, prefix, page, bonus, word, sub]);

    const crowded = [bonus, page, exact, ...Array.from({ length: 40 }, (_, i) => text(`sub-${i}`, 'Skeleton'))];
    const result = search(crowded, 'ke');
    expect(result).toHaveLength(30);
    expect(result.slice(0, 3)).toEqual([exact, page, bonus]);
    for (const limit of [0, 1, 2, 3, 4, 5]) {
      const r = search(crowded, 'ke', limit);
      expect(r).toHaveLength(limit);
      expect(new Set(r).size).toBe(limit);
      if (limit) expect(r[0]).toBe(exact);
    }
    expect(search([bonus, page], 'ke', 30)).toEqual([page, bonus]);
  });
});
