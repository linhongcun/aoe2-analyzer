import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
import buildings from '../../src/data/buildings.json';
import { buildOrders } from '../../src/data/buildOrders';
import { findTerms, glossary, glossarySearchItems, termById } from '../../src/domain/glossary';
import { search, type SearchItem } from '../../src/domain/search';
import { sharePageUrl } from '../../src/domain/sharePage';

describe('#217 术语的规范条目与检索', () => {
  it.each([
    ['MAA', 'maa'],
    ['m@a', 'maa'],
    ['Man-at-Arms', 'maa'],
    ['FC', 'fc'],
    ['Fast Castle', 'fc'],
    ['民兵快攻', 'drush'],
    ['double range', 'double-range'],
    ['双靶场', 'double-range'],
    ['idle TC', 'idle-tc'],
    ['满科技', 'fu'],
    ['暴经济', 'boom'],
    ['城镇中心闲置', 'idle-tc'],
    ['工作更快', 'rate-and-time'],
    ['work faster', 'rate-and-time'],
    ['科技增强', 'stronger-effect'],
  ])('%s 找到同一条目 %s', (query, id) => {
    expect(findTerms(query)[0]?.id).toBe(id);
  });
  it('空搜索列全；没有命中和失效 ID 不返回其他词条', () => {
    expect(findTerms('  ')).toEqual(glossary);
    expect(findTerms('not-a-term-at-all')).toEqual([]);
    expect(termById('missing')).toBeUndefined();
  });
  it('实体精确命中优先于相同英文的术语，保留实体拼音', () => {
    const unit = units.find((u) => u.id === 75)!;
    const entity: SearchItem = { kind: 'unit', id: '75', zh: unit.zh, en: unit.en, href: '/unit/75', sub: '', py: unit.py, pyi: unit.pyi };
    expect(search([entity, ...glossarySearchItems], 'Man-at-Arms')[0]).toEqual(entity);
    expect(search([entity, ...glossarySearchItems], unit.py)[0]?.id).toBe('75');
    expect(search(glossarySearchItems, 'sulvyuhaoshi')[0]?.id).toBe('rate-and-time');
  });
  it('每个稳定 ID 唯一，有来源、语境与有效实体/开局关联', () => {
    expect(new Set(glossary.map((t) => t.id)).size).toBe(9);
    for (const term of glossary) {
      expect(term.meaning && term.example && term.note).toBeTruthy();
      expect(term.sources.length).toBeGreaterThan(0);
      for (const source of term.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(Number(source.date.slice(0, 4))).toBeGreaterThanOrEqual(2020);
      }
      for (const link of term.links) {
        const [path, query] = link.href.split('?');
        if (path?.startsWith('/unit/')) expect(units.some((u) => String(u.id) === path.split('/')[2])).toBe(true);
        if (path?.startsWith('/building/')) expect(buildings.some((b) => String(b.id) === path.split('/')[2])).toBe(true);
        const bo = new URLSearchParams(query).get('bo');
        if (bo) expect(buildOrders.some((b) => b.id === bo)).toBe(true);
      }
    }
  });
  it('术语静态分享页有独立元数据，子路径根目录解析稳定', () => {
    expect(sharePageUrl('/glossary/maa', '', 'https://example.com/aoe2-analyzer/')).toBe('https://example.com/aoe2-analyzer/glossary/maa/');
  });
});
