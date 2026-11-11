import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import raw from '../../src/data/patches/185872.json';
import units from '../../src/data/units.json';
import { filterPatch, patchTarget, statedCivIds, type PatchEntry } from '../../src/domain/patches';
const entries = raw.entries as PatchEntry[];
const known = civs.map((civ) => civ.en);
describe('补丁来源与筛选', () => {
  it('文明筛选认写明并集，未写明仍留下，组间 AND，组内 OR', () => {
    const got = filterPatch(entries, new URLSearchParams('civ=Franks,Byzantines&kind=buff&範囲=ignored'), known);
    expect(got.some((e) => e.targetId === 281)).toBe(true);
    expect(got.some((e) => e.targetId === 40)).toBe(true);
    expect(got.some((e) => e.targetId === 550)).toBe(true);
    expect(got.every((e) => e.kind === 'buff' && (statedCivIds(e).length === 0 || statedCivIds(e).some((c) => ['Franks', 'Byzantines'].includes(c))))).toBe(
      true,
    );
    expect(filterPatch(entries, new URLSearchParams('civ=Franks&type=unit&q=掷斧'), known).map(patchTarget)).toEqual(['/unit/281', '/unit/531']);
  });
  it('未确认的官方削弱不混入已验证削弱，当前数据保持一致', () => {
    const conflict = entries.find((e) => e.targetId === 2628)!;
    expect(conflict.kind).toBe('adjust');
    expect(conflict.provenance).toBe('source-conflict');
    expect(units.find((u) => u.id === 2628)!.ma).toBe(6);
    expect(conflict.after).toBeUndefined();
    const onager = entries.find((e) => e.targetId === 550 && e.summaryZh.includes('攻击'))!;
    expect(onager.after).toBe(String(units.find((u) => u.id === 550)!.atk));
  });
  it('没有把首次切换数据源的审计当成本补丁平衡，过滤可清空', () => {
    expect(entries.some((e) => e.kind === 'fix')).toBe(false);
    expect(filterPatch(entries, new URLSearchParams('q=无此内容'), known)).toEqual([]);
    expect(filterPatch(entries, new URLSearchParams(), known)).toHaveLength(entries.length);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
