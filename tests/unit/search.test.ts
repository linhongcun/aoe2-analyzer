import { describe, expect, it } from 'vitest';
import { search, type SearchItem } from '../../src/domain/search';
import { units } from './helpers';

const items: SearchItem[] = units.map((u) => ({ kind: 'unit', id: String(u.id), zh: u.zh, en: u.en, href: '', sub: '' }));
describe('global search', () => {
  it('exact English match ranks first', () => expect(search(items, 'Paladin')[0]!.en).toBe('Paladin'));
  it('prefix / word match', () => expect(search(items, 'eagle').every((r) => r.en.toLowerCase().includes('eagle'))).toBe(true));
  it('Chinese match', () => expect(search(items, '骑士').length).toBeGreaterThan(0));
  it('empty query returns nothing', () => expect(search(items, '  ')).toEqual([]));
});
