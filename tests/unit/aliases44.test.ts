import { describe, expect, it } from 'vitest';
import { search, score, TIER, type SearchItem } from '../../src/domain/search';
import { PENDING_UNIT_ALIASES, UNIT_ALIAS_ROWS, UNIT_ALIASES } from '../../src/data/aliases';
import { CONFUSABLES, confusablesOf } from '../../src/data/confusables';
import { civNote, dupIdsIn, dupNameGroups, dupPeers, nameKey } from '../../src/domain/dupNames';
import { buildFamilies, collapse } from '../../src/domain/family';
import civsRaw from '../../src/data/civs.json';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const fam = buildFamilies(units, byId);
const fams = collapse(units, fam);
const cz = (en: string) => (civsRaw as { en: string; zh: string }[]).find((c) => c.en === en)?.zh;
const items: SearchItem[] = fams.map(({ u }) => ({ kind: 'unit', id: String(u.id), zh: u.zh, en: u.en, href: '', sub: '', aliases: UNIT_ALIASES[u.id] }));
const U = (id: number) => byId[id]!;

describe('#44 单位别名', () => {
  it('上线名单：有 2020 年以后出处的 7 个', () => {
    expect(UNIT_ALIAS_ROWS.map(([, a]) => a).sort()).toEqual(['冲车', '和尚', '投石车', '斥候', '波斯象', '骆驼', '骑射'].sort());
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
  it('不作别名：散兵、投石机、游侠骑兵、战象、侦察骑；待定的 4 个不上线', () => {
    const all = Object.values(UNIT_ALIASES).flat();
    for (const x of ['散兵', '投石机', '游侠骑兵', '战象', '侦察骑', '条顿', '芒古代']) expect(all).not.toContain(x);
    for (const [, a] of PENDING_UNIT_ALIASES) expect(all).not.toContain(a);
    expect(UNIT_ALIASES[441]).toBeUndefined();
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
  // 列表里两个楼船、两个战车都保留：由 #70（按英文名去重，163）负责，#70 合入后 rebase 时在这里补断言
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
