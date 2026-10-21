// issue 314：同一年发行（或「游戏覆盖历史起始时间」相同）的战役按英文名字母顺序排列，与页面文案一致。
import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, defaultCampaignFilters, filterCampaigns, type Campaign } from '../../src/domain/campaigns';

const names = (list: Campaign[], y: number) => list.filter((c) => c.releaseYear === y).map((c) => c.nameEn);

describe('issue 314 同年按英文名字母顺序', () => {
  const list = filterCampaigns(defaultCampaignFilters());
  it('1999 年 5 个战役', () => {
    expect(names(list, 1999)).toEqual(['Barbarossa', 'Genghis Khan', 'Joan of Arc', 'Saladin', 'William Wallace']);
  });
  it('2000 年 5 个战役', () => {
    expect(names(list, 2000)).toEqual(['Agincourt', 'Attila the Hun', 'El Cid', 'Hastings', 'Montezuma']);
  });
  it('按首发年排序：同年两条对调 id，仍按英文名排（Barbarossa 在 William Wallace 前）', () => {
    const pick = (en: string, id: string) => ({ ...CAMPAIGNS.find((c) => c.nameEn === en)!, id });
    const order = (xs: Campaign[]) => filterCampaigns(defaultCampaignFilters(), xs).map((c) => c.nameEn);
    expect(order([pick('Barbarossa', 'zzz'), pick('William Wallace', 'aaa')])).toEqual(['Barbarossa', 'William Wallace']);
    expect(order([pick('William Wallace', 'zzz'), pick('Barbarossa', 'aaa')])).toEqual(['Barbarossa', 'William Wallace']);
  });
  it('起始年相同：按英文名，不按内部 id（两条的 id 怎么对调，顺序都是 Barbarossa、Saladin）', () => {
    const pick = (en: string, id: string) => ({ ...CAMPAIGNS.find((c) => c.nameEn === en)!, historicalStartYear: 1100, id });
    const order = (xs: Campaign[]) => filterCampaigns({ ...defaultCampaignFilters(), sort: 'history' }, xs).map((c) => c.nameEn);
    expect(order([pick('Barbarossa', 'zzz'), pick('Saladin', 'aaa')])).toEqual(['Barbarossa', 'Saladin']);
    expect(order([pick('Saladin', 'zzz'), pick('Barbarossa', 'aaa')])).toEqual(['Barbarossa', 'Saladin']);
  });
});
