import { describe, expect, it } from 'vitest';
import { TECH_AKA } from '../../src/data/aliases';
import { civByEn } from '../../src/data';
import { DLCS } from '../../src/domain/dlc';
import {
  filterTechList,
  techBuildingOptions,
  techCivLabel,
  techIsUnlabeled,
  techQueryMatches,
  techReleaseLabel,
  unlabeledTechCount,
  type TechListFilters,
} from '../../src/features/techs/components/techQuery';
import { tech, techById, techs } from './helpers';

const filters = (overrides: Partial<TechListFilters> = {}): TechListFilters => ({ query: '', type: '', age: '', building: '', release: '', ...overrides });
const ids = (overrides: Partial<TechListFilters>) => filterTechList(techs, filters(overrides)).map((t) => t.id);

describe('#883 科技目录搜索与筛选', () => {
  it('默认保持源顺序，分母是当时目录长度', () => {
    expect(ids({})).toEqual(techs.map((t) => t.id));
  });

  it('类别、时代、建筑、首发在同一条记录上 AND', () => {
    const yeomen = techById[3]!;
    const matched = filterTechList(techs, filters({ type: 'UniqueTech', age: String(yeomen.age), building: yeomen.bz, release: String(yeomen.dlc) }));
    expect(matched.every((t) => t.type === 'UniqueTech' && t.age === yeomen.age && t.bz === yeomen.bz && t.dlc === yeomen.dlc)).toBe(true);
    expect(matched.map((t) => t.id)).toContain(3);
    expect(matched.map((t) => t.id)).toEqual(
      techs.filter((t) => t.type === 'UniqueTech' && t.age === yeomen.age && t.bz === yeomen.bz && t.dlc === yeomen.dlc).map((t) => t.id),
    );
  });

  it('研究建筑选项按首次出现，不按字母序重排', () => {
    expect(techBuildingOptions(techs)).toEqual([...new Set(techs.map((t) => t.bz))]);
  });

  it('未标注计数与 none 筛选一致，免费更新走 introducedUpdate', () => {
    expect(unlabeledTechCount(techs)).toBe(techs.filter((t) => techIsUnlabeled(t)).length);
    expect(ids({ release: 'none' })).toEqual(techs.filter((t) => techIsUnlabeled(t)).map((t) => t.id));
    expect(ids({ release: 'update' })).toEqual(techs.filter((t) => t.introducedUpdate).map((t) => t.id));
    expect(ids({ release: 'update' })).toHaveLength(5);
    expect(unlabeledTechCount(techs)).toBe(0);
  });

  it.each(['英皇侍卫', 'yhsw', 'YHSW', 'yinghuangshiwei'])('%s 只命中英皇侍卫', (query) => {
    expect(ids({ query })).toEqual([3]);
  });

  it('效果文本仍可包含匹配，空白被 norm 忽略', () => {
    expect(ids({ query: '步弓手' })).toContain(3);
    expect(techQueryMatches(techById[3]!, 'ying huang shi wei')).toBe(true);
  });

  it('绞盘弩和 cranequins 命中 1452，且不扩充别名表', () => {
    expect(TECH_AKA).toEqual({ 1452: ['绞盘弩', 'cranequins'] });
    expect(ids({ query: '绞盘弩' })).toEqual([1452]);
    expect(ids({ query: 'cranequins' })).toEqual([1452]);
    expect(ids({ query: 'Crane quins' })).toEqual([1452]);
  });

  it('堡垒按源顺序保留同名两条，并带上包含匹配', () => {
    expect(ids({ query: '堡垒' })).toEqual([455, 482, 996, 7]);
    const named = filterTechList(techs, filters({ query: '堡垒' })).filter((t) => t.zh === '堡垒');
    expect(named.map((t) => [t.id, t.en, t.age, t.civs[0]])).toEqual([
      [482, 'Stronghold', 3, 'Celts'],
      [7, 'Citadels', 4, 'Persians'],
    ]);
  });

  it('不搜 descEn，也不搜文明名', () => {
    const sample = techs[0]!;
    const decoy = { ...sample, id: -1, zh: '甲', en: 'A', desc: '乙', descEn: 'onlyenglishphrase', py: 'jia', pyi: 'j' };
    expect(techQueryMatches(decoy, 'onlyenglishphrase')).toBe(false);
    expect(techQueryMatches(techById[3]!, '不列颠')).toBe(false);
    expect(techQueryMatches(techById[3]!, 'Britons')).toBe(false);
    expect(ids({ query: '契丹' })).not.toEqual(expect.arrayContaining([1012, 1013, 1014]));
  });

  it('拼音 v 与 u 等价，独特科技才显示文明', () => {
    const sample = techs[0]!;
    expect(techQueryMatches({ ...sample, id: -2, zh: '甲', en: 'A', desc: '乙', py: 'nv', pyi: 'n' }, 'nu')).toBe(true);
    expect(techCivLabel(techById[3]!)).toBe(civByEn('Britons')?.zh);
    expect(techCivLabel({ type: 'UniqueTech', civs: ['Britons', 'Goths'] })).toBe([civByEn('Britons')?.zh, civByEn('Goths')?.zh].join('/'));
    expect(techCivLabel(techById[1452]!)).toBe('');
    expect(techCivLabel(techById[1014]!)).toBe('');
    expect(techCivLabel(techById[1013]!)).toBe('');
    expect(techCivLabel(techById[1012]!)).toBe('');
    expect(ids({ type: 'UniqueTech' })).toEqual(techs.filter((t) => t.type === 'UniqueTech').map((t) => t.id));
    expect(ids({ type: 'RegionalTech' })).toEqual([1452]);
  });

  it('原版行不写国王时代，免费更新和资料片写文字', () => {
    expect(techReleaseLabel(tech('Fletching'))).toBe('');
    expect(techReleaseLabel({ dlc: 0 })).toBe('');
    expect(techReleaseLabel(techById[875]!)).toBe('免费更新 · 81058');
    expect(techReleaseLabel({ dlc: null })).toBe('未标注');
    expect(techReleaseLabel(tech('Chivalry'))).toBe('失落帝国');
    expect(DLCS[0]?.zh).toBe('国王时代');
    const blank = techs.filter((t) => techReleaseLabel(t) === '');
    expect(blank.length).toBeGreaterThan(0);
    expect(blank.every((t) => t.dlc === 0 && !t.introducedUpdate)).toBe(true);
    expect(techs.map((t) => techReleaseLabel(t)).some((label) => label.includes('国王时代'))).toBe(false);
  });
});
