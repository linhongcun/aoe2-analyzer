import { describe, expect, it } from 'vitest';
import { regionalUnitLines } from '../../src/domain/civUnits';
import { civStatus } from '../../src/domain/civStatus';
import civs from '../../src/data/raw/civs';
import { trees, units } from './helpers';

const ids = (civ: string) => regionalUnitLines(civ, units).map((line) => line.map((u) => u.id));

describe('#450 文明区域单位', () => {
  it.each(civs.map((c) => c.en))('%s 仅包含科技树真实可用的全部区域形态', (civ) => {
    const status = civStatus(trees, civ);
    const expected = units.filter((u) => u.type === 'RegionalUnit' && status['u' + u.id] === 1).map((u) => u.id);
    expect(
      regionalUnitLines(civ, units)
        .flat()
        .map((u) => u.id)
        .sort((a, b) => a - b),
    ).toEqual(expected.sort((a, b) => a - b));
  });
  it('非 Elite 命名升级仍按路线排列，乱序输入不影响升级先后', () => {
    const list = units.filter((u) => [2700, 2701].includes(u.id)).reverse();
    expect(regionalUnitLines('Franks', list).map((line) => line.map((u) => u.id))).toEqual([[2700, 2701]]);
    expect(ids('Chinese')).toContainEqual([1904, 1907]);
  });
  it('高级形态权限不跨文明拼接，也不混入帝王骆驼兵', () => {
    expect(ids('Dravidians')).toContainEqual([1132]);
    expect(ids('Dravidians').flat()).not.toContain(1134);
    expect(ids('Cumans')).toContainEqual([329]);
    expect(ids('Cumans').flat()).not.toContain(330);
    expect(ids('Hindustanis')).toContainEqual([329, 330]);
    expect(ids('Hindustanis').flat()).not.toContain(207);
  });
  it('南美完整升级路线保留每个实际形态', () => {
    expect(ids('Aztecs')).toContainEqual([751, 753, 752]);
    expect(ids('Muisca')).toContainEqual([2550, 2588, 2552, 2554]);
  });
  it('无区域单位或未知文明返回空列表', () => {
    expect(ids('Japanese')).toEqual([]);
    expect(ids('not-a-civ')).toEqual([]);
    expect(regionalUnitLines('Franks', [])).toEqual([]);
  });
  it('只读投影，保留原始单位对象和输入顺序', () => {
    const list = Object.freeze([...units]);
    const before = list.map((u) => u.id);
    for (const u of regionalUnitLines('Chinese', list).flat()) expect(list.find((v) => v.id === u.id)).toBe(u);
    expect(list.map((u) => u.id)).toEqual(before);
  });
});
