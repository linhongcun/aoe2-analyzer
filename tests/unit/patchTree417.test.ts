import { expect, it } from 'vitest';
import raw from '../../src/data/patches/185872.json';
import { groupTreeChanges, patchTarget, type PatchEntry } from '../../src/domain/patches';

it('#417 从固定补丁记录提取全部科技树得失，保持来源与目标', () => {
  const entries = raw.entries as PatchEntry[];
  const groups = groupTreeChanges(entries);
  expect(groups.size).toBe(21);
  expect([...groups.values()].flat()).toHaveLength(57);
  const saracens = groups.get('Saracens')!;
  expect(saracens).toHaveLength(1);
  expect(saracens[0]).toMatchObject({ targetId: 54, targetNameZh: '脚踏起重机', before: '已开放', after: '未开放' });
  expect(patchTarget(saracens[0]!)).toBe('/tech/54');
  expect(groups.get('Franks')!.map(patchTarget)).toContain('/unit/2700');
  expect(groupTreeChanges([]).size).toBe(0);
});

it('#417 仅按明确开放状态分组，多文明分别归入且不改变输入', () => {
  const original = (raw.entries as PatchEntry[]).find((e) => e.targetId === 54 && e.civIds.includes('Saracens'))!;
  const multi = { ...original, civIds: ['Saracens', 'Franks'] };
  const entries: PatchEntry[] = [
    multi,
    { ...multi, targetType: 'civ' },
    { ...multi, civIds: [] },
    { ...multi, before: '10', after: '12' },
    { ...multi, before: '已开放', after: '已开放' },
  ];
  const saved = JSON.stringify(entries);
  const groups = groupTreeChanges(entries);
  expect([...groups.keys()]).toEqual(['Saracens', 'Franks']);
  expect(groups.get('Saracens')).toEqual([multi]);
  expect(groups.get('Franks')).toEqual([multi]);
  expect(JSON.stringify(entries)).toBe(saved);
});
