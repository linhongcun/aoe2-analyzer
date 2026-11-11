import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import raw81058 from '../../src/data/patches/81058.json';
import { historyFor, resolveHistoryIdentity, type PatchArchive } from '../../src/domain/patchHistory';
import { civSelection, filterPatch, groupTreeChanges, parseObjectParam, partitionByStatedCiv, searchObjects, type PatchEntry } from '../../src/domain/patches';

const known = civs.map((civ) => civ.en);
const entries = raw81058.entries as PatchEntry[];
const gambeson = entries.find((entry) => entry.id === '81058-1')!;

describe('更新历史筛选与对象路由 #946', () => {
  it('软甲 civIds 为空时按 affectedCivIds 进入写明适用，不进入未写明', () => {
    expect(gambeson.civIds).toEqual([]);
    expect(gambeson.affectedCivIds).toContain('Franks');
    expect(gambeson.affectedCivIds).not.toContain('Chinese');
    const franks = filterPatch(entries, new URLSearchParams('civ=Franks'), known);
    const grouped = partitionByStatedCiv(franks, ['Franks']);
    expect(grouped.stated.some((entry) => entry.id === '81058-1')).toBe(true);
    expect(grouped.unstated.some((entry) => entry.id === '81058-1')).toBe(false);
    const chinese = partitionByStatedCiv(filterPatch(entries, new URLSearchParams('civ=Chinese'), known), ['Chinese']);
    expect([...chinese.stated, ...chinese.unstated].some((entry) => entry.id === '81058-1')).toBe(false);
  });

  it('空的写明集合不是全局通过，未知文明不能看成全部', () => {
    const blank: PatchEntry = { ...gambeson, id: 'blank', civIds: [], affectedCivIds: [], summaryZh: '未写明' };
    const grouped = partitionByStatedCiv(filterPatch([blank, gambeson], new URLSearchParams('civ=Franks'), known), ['Franks']);
    expect(grouped.unstated.map((entry) => entry.id)).toEqual(['blank']);
    expect(grouped.stated.map((entry) => entry.id)).toEqual(['81058-1']);
    expect(filterPatch(entries, new URLSearchParams('civ=NotACiv'), known)).toEqual([]);
    expect(civSelection(new URLSearchParams('civ=NotACiv'), known).allUnknown).toBe(true);
    const partial = civSelection(new URLSearchParams('civ=Franks,NotACiv'), known);
    expect(partial.allUnknown).toBe(false);
    expect(partial.unknown).toEqual(['NotACiv']);
    expect(partial.recognized).toEqual(['Franks']);
    expect(filterPatch(entries, new URLSearchParams('civ=Franks,NotACiv'), known).some((entry) => entry.id === '81058-1')).toBe(true);
  });

  it('游戏修复只认 changeType，kind=fix 不混用', () => {
    const fixes = entries.filter((entry) => entry.changeType === 'fix');
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.every((entry) => entry.kind !== 'fix')).toBe(true);
    expect(filterPatch(entries, new URLSearchParams('ctype=fix'), known).every((entry) => entry.changeType === 'fix')).toBe(true);
    expect(filterPatch(fixes, new URLSearchParams('kind=fix'), known)).toEqual([]);
    expect(filterPatch(fixes, new URLSearchParams('kind=adjust'), known)).toEqual(fixes);
  });

  it('对象参数、搜索截断和历史身份', () => {
    expect(parseObjectParam(null)).toBeNull();
    expect(parseObjectParam('unit')).toBeNull();
    expect(parseObjectParam('unit:')).toBeNull();
    expect(parseObjectParam('map:arabia')).toBeNull();
    expect(parseObjectParam('tech:legacy-berserkergang')).toEqual({ type: 'tech', id: 'legacy-berserkergang' });
    expect(parseObjectParam('%')).toBeNull();
    const many = Array.from({ length: 25 }, (_, index) => ({ type: 'unit' as const, id: String(index), zh: `兵${index}`, en: 'Soldier' }));
    const found = searchObjects('兵', many);
    expect(found.total).toBe(25);
    expect(found.shown).toHaveLength(20);
    expect(searchObjects('  ', many).total).toBe(0);
    const archive = raw81058 as PatchArchive;
    expect(resolveHistoryIdentity([archive], { targetType: 'tech', targetId: 'legacy-berserkergang' })?.name).toBe('旧狂战士科技');
    expect(resolveHistoryIdentity([archive], { targetType: 'tech', targetId: 'missing' }, '目录名')?.name).toBe('目录名');
    expect(resolveHistoryIdentity([archive], { targetType: 'unit', targetId: '999999999' })).toBeNull();
  });

  it('文明时间线不收未写明条目，科技树只认开放状态', () => {
    const blank: PatchEntry = { ...gambeson, id: 'blank', civIds: [], affectedCivIds: [] };
    const archive = { ...(raw81058 as PatchArchive), date: raw81058.releaseDate, entries: [blank, gambeson] };
    expect(historyFor([archive], { targetType: 'civ', targetId: 'Franks' }).map((row) => row.entry.id)).toEqual(['81058-1']);
    const numeric: PatchEntry = { ...gambeson, id: 'num', targetType: 'unit', before: '1', after: '2', civIds: ['Franks'] };
    const opened: PatchEntry = { ...gambeson, id: 'open', targetType: 'tech', before: '未开放', after: '已开放', civIds: ['Franks'] };
    expect([...groupTreeChanges([numeric, opened]).get('Franks')!].map((entry) => entry.id)).toEqual(['open']);
  });
});
