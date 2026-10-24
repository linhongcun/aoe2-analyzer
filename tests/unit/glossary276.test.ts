import { describe, expect, it } from 'vitest';
import { findTerms, glossary, glossarySearchItems, groupTerms, GLOSSARY_CATEGORIES } from '../../src/domain/glossary';
import { search } from '../../src/domain/search';

const additions = [
  ['trush', '塔攻', 'tagong'],
  ['scouts', '侦察骑兵快攻', 'zhenchaqibingkuaigong'],
  ['pocket', '口袋位', 'koudaiwei'],
  ['flank', '边位', 'bianwei'],
  ['eco', '经济', 'jingji'],
  ['deer-push', '推鹿', 'tuilu'],
  ['lure', '引野猪', 'yinyezhu'],
  ['forward', '前置', 'qianzhi'],
  ['gg', '打得好', 'dadehao'],
  ['xbow', '弩手', 'nushou'],
  ['ca', '骑射手', 'qisheshou'],
  ['uu', '独特单位', 'dutedanwei'],
] as const;

describe('#276 新手常用术语', () => {
  it('分类完整且每个词条只出现一次，两条措辞独立列出，检索不留下空组', () => {
    const groups = groupTerms(glossary);
    expect(groups.map((group) => group.category)).toEqual(GLOSSARY_CATEGORIES);
    expect(
      groups
        .flatMap((group) => group.terms)
        .map((term) => term.id)
        .sort(),
    ).toEqual(glossary.map((term) => term.id).sort());
    expect(groups.find((group) => group.category === '常见措辞')?.terms.map((term) => term.id)).toEqual(['rate-and-time', 'stronger-effect']);
    expect(groupTerms(findTerms('推鹿')).map((group) => group.category)).toEqual(['经济']);
    expect(groupTerms([])).toEqual([]);
  });
  it.each(additions)('%s 有来源、语境及站内关联，并能按中英文和拼音检索', (id, zh, py) => {
    const term = glossary.find((entry) => entry.id === id);
    expect(term).toBeDefined();
    expect(term!.meaning && term!.example && term!.note).toBeTruthy();
    expect(term!.checkedAt).toBe('2026-10-24');
    expect(term!.links.length).toBeGreaterThan(0);
    expect(term!.sources.length).toBeGreaterThan(0);
    for (const source of term!.sources) {
      expect(new URL(source.url).protocol).toBe('https:');
      expect(Number(source.date.slice(0, 4))).toBeGreaterThanOrEqual(2020);
    }
    for (const query of [term!.en, zh, py]) {
      expect(
        findTerms(query).some((result) => result.id === id),
        query,
      ).toBe(true);
      expect(
        search(glossarySearchItems, query, glossary.length).some((result) => result.id === id),
        query,
      ).toBe(true);
    }
  });
});
