import { describe, expect, it } from 'vitest';
import { search, SIEGE_SEARCH_RAM_UNIT_ID, type SearchItem } from '../../src/domain/search';
import { unit } from './helpers';

const page: SearchItem = {
  kind: 'page',
  id: 'siege',
  zh: '攻城拆建筑',
  en: 'Siege',
  href: '/siege',
  sub: '几台攻城单位拆一座建筑要多久',
  aliases: ['冲车'],
};
const hammer: SearchItem = {
  kind: 'unit',
  id: '1258',
  zh: '攻城锤',
  en: 'Battering Ram',
  href: '/unit/1258',
  sub: '攻城武器厂',
  aliases: ['冲车'],
};

describe('#554 搜索「冲车」预填冲车系', () => {
  it('预填单位是数据里的中型冲车，不是攻城锤 1258', () => {
    const capped = unit('Capped Ram');
    expect(capped.zh).toBe('中型冲车');
    expect(capped.from_).toBe(1258);
    expect(SIEGE_SEARCH_RAM_UNIT_ID).toBe(capped.id);
    expect(SIEGE_SEARCH_RAM_UNIT_ID).not.toBe(unit('Battering Ram').id);
    expect(unit('Siege Tower').id).not.toBe(SIEGE_SEARCH_RAM_UNIT_ID);
  });

  it('只有搜索词「冲车」会改攻城拆建筑的地址，单位结果和其它搜索词不变', () => {
    const hits = search([page, hammer], '冲车');
    expect(hits.find((item) => item.id === 'siege')?.href).toBe(`/siege?unit=${SIEGE_SEARCH_RAM_UNIT_ID}`);
    expect(hits.find((item) => item.id === '1258')).toBe(hammer);
    expect(search([page], ' 冲车 ')[0]?.href).toBe(`/siege?unit=${SIEGE_SEARCH_RAM_UNIT_ID}`);
    expect(search([page], '攻城拆建筑')[0]?.href).toBe('/siege');
    expect(search([page], '冲')[0]?.href).toBe('/siege');
    expect(search([page], '中型冲车')).toEqual([]);
  });
});
