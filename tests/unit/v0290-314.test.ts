/**
 * v0.29.0 验收（#329）A 组 #314 部分：取自 Kent Beck test/v0290-acceptance @ 646ac40 tests/unit/v0290-A.test.ts，断言原样未改。
 */
import { describe, expect, it } from 'vitest';
import { defaultCampaignFilters, filterCampaigns, type Campaign } from '../../src/domain/campaigns';

// ---------- #314 ----------
// 选项 1：按游戏内战役列表顺序。《国王时代》战役列表：William Wallace → Joan of Arc → Saladin → Genghis Khan → Barbarossa
//   （https://ageofempires.fandom.com/wiki/Campaigns_(Age_of_Empires_II) ）；《征服者》：Attila the Hun → El Cid → Montezuma，历史战役排在战役之后。
// 选项 2：按英文名（nameEn）字母顺序，比较键从内部 id 改为 nameEn。
const year = (list: readonly Campaign[], y: number) => list.filter((c) => c.releaseYear === y).map((c) => c.nameEn);
const alpha = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, 'en'));
const IN_GAME_1999 = ['William Wallace', 'Joan of Arc', 'Saladin', 'Genghis Khan', 'Barbarossa'];
const IN_GAME_2000_CAMPAIGNS = ['Attila the Hun', 'El Cid', 'Montezuma'];

describe('#314 战役目录：同一年发行的排序规则', () => {
  const list = filterCampaigns(defaultCampaignFilters());
  it('1999、2000 两组的顺序符合二选一规则之一（英文名字母序，或游戏内列表顺序）', () => {
    const y1999 = year(list, 1999),
      y2000 = year(list, 2000);
    const byName = JSON.stringify(y1999) === JSON.stringify(alpha(y1999)) && JSON.stringify(y2000) === JSON.stringify(alpha(y2000));
    const inGame =
      JSON.stringify(y1999) === JSON.stringify(IN_GAME_1999) &&
      JSON.stringify(y2000.filter((n) => IN_GAME_2000_CAMPAIGNS.includes(n))) === JSON.stringify(IN_GAME_2000_CAMPAIGNS) &&
      y2000.slice(0, 3).every((n) => IN_GAME_2000_CAMPAIGNS.includes(n));
    expect(byName || inGame, `1999：${y1999.join('、')}；2000：${y2000.join('、')}`).toBe(true);
  });
  it('比较键不是内部 id：把某条的 id 改到字母序最前，同年顺序不应随之改变（选「游戏内顺序」且按 id 查表时本条不适用）', () => {
    if (JSON.stringify(year(list, 1999)) === JSON.stringify(IN_GAME_1999)) return;
    const entries = filterCampaigns(defaultCampaignFilters()).map((c) => (c.nameEn === 'William Wallace' ? { ...c, id: 'aaa-william-wallace' } : c));
    const resorted = filterCampaigns(defaultCampaignFilters(), entries);
    expect(year(resorted, 1999)).toEqual(year(list, 1999));
  });
  it('「游戏覆盖历史起始时间」排序：同年平局同样不按内部 id（对调两条的 id，顺序不变）', () => {
    const base = filterCampaigns(defaultCampaignFilters());
    const a = { ...base[0]!, historicalStartYear: 1000 },
      b = { ...base[1]!, historicalStartYear: 1000 };
    const order = (x: Campaign, y: Campaign) => filterCampaigns({ ...defaultCampaignFilters(), sort: 'history' }, [x, y]).map((c) => c.nameEn);
    expect(order({ ...a, id: 'zzz' }, { ...b, id: 'aaa' })).toEqual(order({ ...a, id: 'aaa' }, { ...b, id: 'zzz' }));
  });
});
