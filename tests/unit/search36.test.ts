import { describe, expect, it } from 'vitest';
import { score, search, TIER, type SearchItem } from '../../src/domain/search';

const eagle: SearchItem = { kind: 'unit', id: '751', zh: '鹰斥候', en: 'Eagle Scout', href: '/unit/751', sub: '', keywords: ['冲击步兵', '步兵'] };

describe('issue 36：护甲类别检索', () => {
  it('可按护甲类别中文名及其片段找到单位', () => {
    expect(search([eagle], '冲击步兵')).toEqual([eagle]);
    expect(search([eagle], ' 冲 击 ')).toEqual([eagle]);
    expect(search([eagle], '骑兵')).toEqual([]);
  });
  it('类别命中不挤占名称、别名和拼音命中的优先级', () => {
    const named: SearchItem = { ...eagle, id: 'named', zh: '冲击步兵', keywords: undefined };
    const alias: SearchItem = { ...eagle, id: 'alias', keywords: undefined, aliases: ['冲击步兵'] };
    expect(search([eagle, alias, named], '冲击步兵').map((x) => x.id)).toEqual(['named', 'alias', '751']);
    expect(score(eagle, '步兵')).toBeLessThan(TIER.py);
  });
  it('仍支持单位原名称搜索', () => {
    expect(score(eagle, '鹰斥候')).toBe(TIER.exact);
    expect(score(eagle, 'Eagle Scout')).toBe(TIER.exact);
  });
});
