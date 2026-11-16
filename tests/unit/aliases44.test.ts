import { describe, expect, it } from 'vitest';
import { search, score, TIER, type SearchItem } from '../../src/domain/search';
import { PENDING_UNIT_ALIASES, UNIT_ALIAS_ROWS, UNIT_ALIASES } from '../../src/data/aliases';
import { CONFUSABLES, confusablesOf } from '../../src/data/confusables';
import { civNote, dupIdsIn, dupNameGroups, dupPeers, nameKey } from '../../src/domain/dupNames';
import { buildFamilies, collapse } from '../../src/domain/family';
import { filterUnitFamilies, type UnitFilters } from '../../src/domain/unitFilters';
import civsRaw from '../../data/game/civs.json';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const fam = buildFamilies(units, byId);
const fams = collapse(units, fam);
const cz = (en: string) => (civsRaw as { en: string; zh: string }[]).find((c) => c.en === en)?.zh;
const items: SearchItem[] = fams.map(({ u }) => ({
  kind: 'unit',
  id: String(u.id),
  zh: u.zh,
  en: u.en,
  href: `/unit/${u.id}`,
  sub: '',
  aliases: UNIT_ALIASES[u.id],
}));
const U = (id: number) => byId[id]!;

describe('#44 单位别名', () => {
  it('上线名单：有 2020 年以后出处的 10 个（含 #1055 两种字形）', () => {
    expect(UNIT_ALIAS_ROWS.map(([, a]) => a).sort()).toEqual(
      ['冲车', '和尚', '圣骑士', '投石车', '斥候', '波斯象', '骆驼', '骑射', '匈牙利轻骑兵', '匈牙利輕騎兵'].sort(),
    );
  });
  for (const [id, a] of UNIT_ALIAS_ROWS)
    it(`「${a}」搜出 ${U(id).zh}（${id}），别名档或更高`, () => {
      const r = search(items, a);
      const hit = r.find((x) => x.id === String(id));
      expect(hit).toBeDefined();
      expect(score(hit!, a)).toBeGreaterThanOrEqual(TIER.alias);
    });
  it('别名不与任何官方名完全相同（去 <br> 和空白后）', () => {
    const names = new Set(units.map((u) => nameKey(u.zh)));
    for (const [, a] of UNIT_ALIAS_ROWS) expect(names.has(a)).toBe(false);
  });
  it('不作别名：散兵、投石机、游侠骑兵、战象、侦察骑；待定的 3 个不上线', () => {
    const all = Object.values(UNIT_ALIASES).flat();
    for (const x of ['散兵', '投石机', '游侠骑兵', '战象', '侦察骑', '条顿', '芒古代']) expect(all).not.toContain(x);
    for (const [, a] of PENDING_UNIT_ALIASES) expect(all).not.toContain(a);
    expect(UNIT_ALIASES[441]).toEqual(['匈牙利轻骑兵', '匈牙利輕騎兵']);
    expect(UNIT_ALIASES[1132]).toBeUndefined();
  });
  it('「战象」「游侠」列出全部匹配，不只一个结果', () => {
    expect(search(items, '战象').map((x) => x.id)).toEqual(expect.arrayContaining(['239']));
    for (const q of ['战象', '游侠']) {
      const want = fams.filter(({ u }) => u.zh.includes(q)).map(({ u }) => String(u.id));
      expect(search(items, q, 100).map((x) => x.id)).toEqual(expect.arrayContaining(want));
    }
    expect(search(items, '战象')[0]!.id).toBe('239');
    expect(search(items, '游侠')[0]!.id).toBe('569');
  });
});

describe('#1055 Hussar 别名白名单与共享消费者', () => {
  for (const alias of ['匈牙利轻骑兵', '匈牙利輕騎兵']) {
    it(`「${alias}」仅登记441，完整词及空白归一化只搜出正式单位`, () => {
      expect(UNIT_ALIAS_ROWS.filter(([, name]) => name === alias)).toEqual([[441, alias]]);
      for (const query of [alias, ` ${alias.split('').join(' ')} `]) {
        expect(search(items, query)).toEqual([expect.objectContaining({ id: '441', zh: '翼骑兵', en: 'Hussar', href: '/unit/441' })]);
      }
    });
    it(`目录「${alias}」只筛出441，且不绕过其他筛选`, () => {
      const select = (overrides: Partial<UnitFilters> = {}) =>
        filterUnitFamilies(units, fam, { query: alias, type: '', age: '', dlc: '', ...overrides }).map(({ u }) => u.id);
      expect(select()).toEqual([441]);
      for (const civ of ['Cumans', 'Tatars']) expect(select({ civ, type: 'UnitUpgrade', age: '4', role: 'cavalry' })).toEqual([441]);
      for (const blocked of [{ civ: 'Poles' }, { type: 'RegionalUnit' }, { age: '3' }, { role: 'infantry' }, { dlc: 'none' }] as const)
        expect(select(blocked)).toEqual([]);
    });
  }
  it('不为1707新增别名，不收录无修饰的骠骑兵／驃騎兵', () => {
    expect(UNIT_ALIASES[1707]).toBeUndefined();
    for (const alias of ['骠骑兵', '驃騎兵']) expect(UNIT_ALIAS_ROWS.some(([, name]) => name === alias)).toBe(false);
    expect(U(441).en).toBe('Hussar');
    expect(U(1707).en).toBe('Winged Hussar');
  });
  it.each([
    ['Hussar', ['441', '1707']],
    ['Winged Hussar', ['1707']],
    ['翼骑兵', ['441', '1707']],
    ['波兰翼骑兵', ['1707']],
  ])('正式名「%s」仍保持精确命中优先及自然匹配', (query, ids) => {
    const result = search(items, query);
    expect(result.map(({ id }) => id)).toEqual(ids);
    expect(score(result[0]!, query)).toBe(TIER.exact);
  });
});

describe('#44 完全重名（自动识别）', () => {
  it('只识别出 楼船、战车 两组（同英文名的多 id 不算）', () => {
    const g = dupNameGroups(units);
    expect([...g.keys()].sort()).toEqual(['战车', '楼船'].sort());
    expect(
      g
        .get('楼船')!
        .map((u) => u.id)
        .sort(),
    ).toEqual([1750, 1948]);
    expect(
      g
        .get('战车')!
        .map((u) => u.id)
        .sort(),
    ).toEqual([1759, 1962]);
  });
  it('比较前去掉 <br> 与首尾空白', () => {
    expect(nameKey(' 战<br>车 ')).toBe('战车');
    expect(nameKey('战<BR/>车')).toBe('战车');
  });
  it('双向互链', () => {
    expect(dupPeers(U(1750), units).map((u) => u.id)).toEqual([1948]);
    expect(dupPeers(U(1948), units).map((u) => u.id)).toEqual([1750]);
    expect(dupPeers(U(1759), units).map((u) => u.id)).toEqual([1962]);
    expect(dupPeers(U(1962), units).map((u) => u.id)).toEqual([1759]);
    expect(dupPeers(U(441), units)).toEqual([]);
    expect(dupPeers(U(41), units)).toEqual([]);
  });
  it('文明小字：取 civs 第一个，多文明写「等 N 个文明」', () => {
    expect(civNote(U(1750), cz)).toBe('达罗毗荼');
    expect(civNote(U(1948), cz)).toBe('中国等 5 个文明');
    expect(civNote(U(1759), cz)).toBe('孟加拉');
    expect(civNote(U(1962), cz)).toBe('蜀');
  });
  it('列表里两个楼船、两个战车都保留（#70 口径）', () => {
    const ids = fams.map((x) => x.u.id);
    for (const id of [1750, 1948, 1759, 1962]) expect(ids).toContain(id);
    expect(fams.filter((x) => x.u.en === 'Huskarl').length).toBe(1);
  });
  it('同时出现才加文明小字', () => {
    expect(dupIdsIn([U(1750), U(1948)])).toEqual(new Set([1750, 1948]));
    expect(dupIdsIn([U(1750), U(441)]).size).toBe(0);
  });
});

describe('#44 易混淆对照表 v1', () => {
  it('只有一条：翼骑兵 441 与 波兰翼骑兵 1707，原因逐字', () => {
    expect(CONFUSABLES).toHaveLength(1);
    expect(U(441).zh).toBe('翼骑兵');
    expect(U(1707).zh).toBe('波兰翼骑兵');
    const r = '通用单位 Hussar 的官方名就叫「翼骑兵」，和波兰翼骑兵只差两个字';
    expect(confusablesOf(441)).toEqual([{ other: 1707, reason: r }]);
    expect(confusablesOf(1707)).toEqual([{ other: 441, reason: r }]);
  });
  it('战象 / 象兵 不出现混淆提示；重名单位不进对照表', () => {
    for (const id of [239, 1132, 1750, 1948, 1759, 1962]) expect(confusablesOf(id)).toEqual([]);
  });
});
