import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
// 草案：#124 需要的纯函数（模块尚不存在，实现时由 Linus 落地；名字可改）
import { substituteFor } from '../../src/features/duel/logic/substitute';

type U = { id: number; type: string; b: number; age: number; civs: string[]; from_: number | null };
const U = units as unknown as U[];
const by = Object.fromEntries(U.map((u) => [u.id, u]));
const NO_CA_WITH_MC = by[2700]!.civs.filter((c) => !by[39]!.civs.includes(c));
const ALL = [...new Set(U.flatMap((u) => u.civs))];
const NO_HCA_WITH_HMC = by[2701]!.civs.filter((c) => !by[474]!.civs.includes(c));
const NO_HCA_NO_HMC = ALL.filter((c) => !by[474]!.civs.includes(c) && !by[2701]!.civs.includes(c));
const NO_CA_NO_MC = [...new Set(U.flatMap((u) => u.civs))].filter((c) => !by[39]!.civs.includes(c) && !by[2700]!.civs.includes(c));

describe('#124 区域替代单位（从 units.json RegionalUnit + civs 推出）', () => {
  it('数据前提：15 个文明不能造骑射手(39) 但能造骑马弩兵(2700)', () => {
    expect(NO_CA_WITH_MC.sort()).toEqual(
      ['Bohemians', 'Britons', 'Burgundians', 'Celts', 'Danes', 'Franks', 'Italians', 'Poles', 'Portuguese', 'Saxons', 'Sicilians', 'Spanish', 'Teutons', 'Varangians', 'Vikings'],
    );
  });
  it.each(NO_CA_WITH_MC)('%s + 骑射手(39) → 骑马弩兵(2700)', (civ) => {
    expect(substituteFor(39, civ)).toBe(2700);
  });
  it.each(NO_CA_NO_MC)('%s + 骑射手(39) → 无替代（null）', (civ) => {
    expect(substituteFor(39, civ)).toBeNull();
  });
  it('数据前提：474 无替代的 19 个文明（含 Bohemians/Burgundians/Italians/Portuguese/Vikings：能造 2700 但不能造 2701）', () => {
    expect(NO_HCA_NO_HMC.sort()).toEqual(
      ['Armenians', 'Aztecs', 'Bengalis', 'Bohemians', 'Burgundians', 'Chinese', 'Dravidians', 'Gurjaras', 'Incas', 'Italians', 'Malay', 'Mapuche', 'Mayans', 'Muisca', 'Portuguese', 'Tupi', 'Vikings', 'Wei', 'Wu'],
    );
  });
  it.each(NO_HCA_WITH_HMC)('%s + 重装骑射手(474) → 重装骑马弩兵(2701)', (civ) => {
    expect(substituteFor(474, civ)).toBe(2701);
  });
  it.each(NO_HCA_NO_HMC)('%s + 重装骑射手(474) → 无替代（null）', (civ) => {
    expect(substituteFor(474, civ)).toBeNull();
  });
  it('能造的文明不给替代：Armenians + 39 → 39', () => {
    expect(substituteFor(39, 'Armenians')).toBe(39);
  });
});
