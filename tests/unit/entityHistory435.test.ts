import { describe, expect, it } from 'vitest';
import { filterHistory, historyFor, historyRangeError, type PatchArchive } from '../../src/domain/patchHistory';
import type { PatchEntry } from '../../src/domain/patches';

const entry = (id: string, overrides: Partial<PatchEntry> = {}): PatchEntry => ({
  id,
  kind: 'nerf',
  targetType: 'unit',
  targetId: 24,
  targetNameZh: '弩手',
  civIds: [],
  summaryZh: '升级费用提高',
  before: '125 食物、75 黄金',
  after: '175 食物、125 黄金',
  source: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-66692/',
  provenance: 'official',
  originalText: 'Crossbowman research cost increased from 125 food 75 gold to 175 food 125 gold.',
  verification: 'official',
  changeType: 'upgrade',
  ...overrides,
});

const archive = (id: string, date: string, entries: PatchEntry[]): PatchArchive => ({
  id,
  date,
  branch: 'DE',
  releaseType: 'release',
  coverage: '文明平衡栏目',
  source: entries[0]?.source ?? 'https://www.ageofempires.com/news/',
  note: '非连续完整历史；此档案依据当时官方说明。',
  entries,
});

describe('#435 按实体查更新历史', () => {
  it('主目标与关联同时命中只显示一次，并优先直接改动', () => {
    const patch = archive('66692', '2022-08-29', [
      entry('direct-and-related', {
        relatedTargets: [
          { targetType: 'unit', targetId: 24, targetNameZh: '弩手', relation: '升级科技影响' },
          { targetType: 'unit', targetId: 24, targetNameZh: '弩手', relation: '重复关联' },
        ],
      }),
    ]);
    const records = historyFor([patch], { targetType: 'unit', targetId: 24 });
    expect(records).toHaveLength(1);
    expect(records[0]?.entry.id).toBe('direct-and-related');
    expect(records[0]?.relation).toBe('direct');
  });

  it('科技对单位的条件影响只来自明确保存的历史关联', () => {
    const patch = archive('81058', '2023-04-11', [
      entry('gambesons-introduced', {
        targetType: 'tech',
        targetId: 875,
        targetNameZh: '软甲',
        kind: 'new',
        changeType: 'mechanic',
        summaryZh: '新增科技，研究后民兵系远程护甲增加1。',
        relatedTargets: [{ targetType: 'unit', targetId: 74, targetNameZh: '民兵', relation: '拥有并研究软甲后生效' }],
      }),
    ]);
    const records = historyFor([patch], { targetType: 'unit', targetId: 74 });
    expect(records).toHaveLength(1);
    expect(records[0]?.relation).toBe('related');
    expect(records[0]?.relationNote).toContain('研究软甲');
    expect(historyFor([patch], { targetType: 'tech', targetId: 875 })[0]?.relation).toBe('direct');
    expect(historyFor([patch], { targetType: 'unit', targetId: 75 })).toEqual([]);
  });

  it('文明历史使用当时明确的文明范围，不把所有全局项投放给任意文明', () => {
    const patch = archive('66692', '2022-08-29', [
      entry('unscoped-global'),
      entry('burgundian-bonus', { targetType: 'civ', targetId: 'Burgundians', targetNameZh: '勃艮第', civIds: ['Burgundians'] }),
      entry('burgundian-unit', { targetId: 1655, targetNameZh: '马上轻装兵', civIds: ['Burgundians'] }),
      entry('explicit-historical-scope', { affectedCivIds: ['Britons'] }),
    ]);
    expect(historyFor([patch], { targetType: 'civ', targetId: 'Burgundians' }).map((row) => row.entry.id)).toEqual(['burgundian-bonus', 'burgundian-unit']);
    expect(historyFor([patch], { targetType: 'civ', targetId: 'Britons' }).map((row) => row.entry.id)).toEqual(['explicit-historical-scope']);
    expect(historyFor([patch], { targetType: 'civ', targetId: 'Franks' })).toEqual([]);
  });

  it('普通、精锐、不同目录的相同数字以及被替换科技身份互不串联', () => {
    const patch = archive('66692', '2022-08-29', [
      entry('ghulam-hp', { targetId: 1747, targetNameZh: '古拉姆', before: '65', after: '55', changeType: 'stats' }),
      entry('elite-ghulam-hp', { targetId: 1749, targetNameZh: '精锐古拉姆', before: '75', after: '65', changeType: 'stats' }),
      entry('old-tech', { targetType: 'tech', targetId: 'legacy-berserkergang', targetNameZh: '狂战士帮' }),
      entry('new-tech', { targetType: 'tech', targetId: 49, targetNameZh: '博格斯维加尔' }),
      entry('same-number-unit', { targetType: 'unit', targetId: 49, targetNameZh: '其他单位' }),
    ]);
    expect(historyFor([patch], { targetType: 'unit', targetId: 1747 }).map((row) => row.entry.after)).toEqual(['55']);
    expect(historyFor([patch], { targetType: 'unit', targetId: 1749 }).map((row) => row.entry.after)).toEqual(['65']);
    expect(historyFor([patch], { targetType: 'tech', targetId: 'legacy-berserkergang' }).map((row) => row.entry.id)).toEqual(['old-tech']);
    expect(historyFor([patch], { targetType: 'tech', targetId: 49 }).map((row) => row.entry.id)).toEqual(['new-tech']);
    expect(historyFor([patch], { targetType: 'unit', targetId: '49' }).map((row) => row.entry.id)).toEqual(['same-number-unit']);
  });

  it('同一对象跨版本的变化保留当时前后值，不以现在的费用重写旧记录', () => {
    const patches = [
      archive('66692', '2022-08-29', [entry('more-expensive')]),
      archive('125283', '2024-10-15', [
        entry('partial-rollback', { kind: 'buff', before: '175 食物、125 黄金', after: '175 食物、100 黄金', summaryZh: '升级黄金费用降低' }),
      ]),
    ];
    const records = filterHistory(historyFor(patches, { targetType: 'unit', targetId: 24 }), new URLSearchParams('histOrder=oldest'));
    expect(records.map((row) => [row.patch.id, row.entry.before, row.entry.after])).toEqual([
      ['66692', '125 食物、75 黄金', '175 食物、125 黄金'],
      ['125283', '175 食物、125 黄金', '175 食物、100 黄金'],
    ]);
  });
});

describe('#435 历史筛选与时间范围', () => {
  const patches = [
    archive('66692', '2022-08-29', [entry('nerf-crossbow')]),
    archive('81058', '2023-04-11', [
      entry('related-tech', {
        kind: 'buff',
        targetType: 'tech',
        targetId: 875,
        targetNameZh: '软甲',
        summaryZh: '研究后弩手不在此科技适用范围；本例仅测试显式关系',
        originalText: 'An explicit historical relationship for a filtering fixture.',
        relatedTargets: [{ targetType: 'unit', targetId: 24, targetNameZh: '弩手', relation: '仅作筛选夹具' }],
      }),
      entry('gameplay-fix', { kind: 'adjust', changeType: 'fix', summaryZh: '游戏机制修复' }),
      entry('source-correction', { kind: 'fix', summaryZh: '本站数据来源修正' }),
    ]),
    archive('125283', '2024-10-15', [entry('buff-crossbow', { kind: 'buff', summaryZh: '升级黄金费用降低' })]),
  ];
  const rows = historyFor(patches, { targetType: 'unit', targetId: 24 });

  it('默认新到旧、可切换旧到新，排序不改变输入', () => {
    const original = rows.map((row) => row.entry.id);
    expect(filterHistory(rows, new URLSearchParams())[0]?.patch.id).toBe('125283');
    expect(filterHistory(rows, new URLSearchParams('histOrder=oldest'))[0]?.patch.id).toBe('66692');
    expect(rows.map((row) => row.entry.id)).toEqual(original);
  });

  it('日期两端包含当天，开始结束同日仅保留当天记录', () => {
    const got = filterHistory(rows, new URLSearchParams('histFrom=2023-04-11&histTo=2023-04-11'));
    expect(got).toHaveLength(3);
    expect(got.every((row) => row.patch.id === '81058')).toBe(true);
    expect(filterHistory(rows, new URLSearchParams('histFrom=2024-10-15')).map((row) => row.entry.id)).toEqual(['buff-crossbow']);
    expect(filterHistory(rows, new URLSearchParams('histTo=2022-08-29')).map((row) => row.entry.id)).toEqual(['nerf-crossbow']);
  });

  it('类型、关系、日期和关键词取交集', () => {
    const query = new URLSearchParams('histKind=buff&histRelation=related&histFrom=2023-01-01&histTo=2023-12-31&histQuery=软甲');
    expect(filterHistory(rows, query).map((row) => row.entry.id)).toEqual(['related-tech']);
    query.set('histRelation', 'direct');
    expect(filterHistory(rows, query)).toEqual([]);
  });

  it('英文原文检索不区分大小写，并忽略首尾空白', () => {
    expect(filterHistory(rows, new URLSearchParams('histKind=nerf&histQuery=%20CROSSBOWMAN%20')).map((row) => row.entry.id)).toEqual(['nerf-crossbow']);
  });

  it('官方游戏修复和本站数据修正不会混为同一种改动', () => {
    expect(filterHistory(rows, new URLSearchParams('histKind=fix')).map((row) => row.entry.id)).toEqual(['source-correction']);
    expect(filterHistory(rows, new URLSearchParams('histKind=adjust')).map((row) => row.entry.id)).toEqual(['gameplay-fix']);
  });

  it('倒置日期给出明确错误，合法和空范围没有错误', () => {
    expect(historyRangeError(new URLSearchParams('histFrom=2024-10-15&histTo=2022-08-29'))).toBe('开始日期不能晚于结束日期');
    expect(historyRangeError(new URLSearchParams('histFrom=2023-04-11&histTo=2023-04-11'))).toBeUndefined();
    expect(historyRangeError(new URLSearchParams())).toBeUndefined();
  });

  it('尚无历史和已有历史但无筛选结果可由调用方明确区分', () => {
    expect(historyFor(patches, { targetType: 'unit', targetId: 999999 })).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(filterHistory(rows, new URLSearchParams('histQuery=无此历史内容'))).toEqual([]);
    expect(filterHistory(rows, new URLSearchParams('histKind=all&histRelation=all'))).toHaveLength(rows.length);
  });
});
