import { expect, it } from 'vitest';
import { search, withSearchPy, type SearchItem } from '../../src/domain/search';
it('新增页面不能挤掉短拼音保留的文明/单位；精确搜页面仍可直达', () => {
  const text: SearchItem[] = Array.from({ length: 30 }, (_, i) => ({
    kind: 'tech',
    id: 'text' + i,
    zh: '英文命中' + i,
    en: 'Ballistics ' + i,
    href: '/tech/' + i,
    sub: '',
  }));
  const entities: SearchItem[] = ['柏柏尔', '拜占庭', '保加利亚', '豹勇士', '百夫长'].map((zh, i) => ({
    kind: i < 3 ? 'civ' : 'unit',
    id: 'entity' + i,
    zh,
    en: 'entity' + i,
    py: 'ba' + i,
    href: '/unit/' + i,
    sub: '',
  }));
  const page = withSearchPy({ kind: 'page', id: 'patches', zh: '版本补丁', en: 'Patch Notes', href: '/patches', sub: '' });
  const ids = (items: SearchItem[]) =>
    search(items, 'ba')
      .filter((x) => x.id.startsWith('entity'))
      .map((x) => x.id);
  expect(ids([...text, ...entities, page])).toEqual(ids([...text, ...entities]));
  expect(ids([...text, ...entities, page])).toHaveLength(5);
  expect(search([...text, ...entities, page], '版本补丁')[0]?.id).toBe('patches');
  expect(search([...text, ...entities, page], 'banben')[0]?.id).toBe('patches');
});
