import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { BuildingAttackDetails } from '../../src/features/buildings/components/BuildingAttackDetails';

function render(data: Parameters<typeof BuildingAttackDetails>[0]) {
  return renderToStaticMarkup(createElement(BuildingAttackDetails, data));
}

describe('#1219 建筑攻击明细', () => {
  it('目录保留固定源的类别、顺序、空表和显式零', () => {
    expect(CORE.buildingById[236]?.atks).toEqual([
      { classId: 16, amount: 40, label: '船只' },
      { classId: 3, amount: 120, label: '穿刺' },
      { classId: 30, amount: 1, label: '骆驼' },
    ]);
    expect(CORE.buildingById[12]?.atks).toEqual([]);
    expect(CORE.buildingById[109]?.atks).toEqual([{ classId: 3, amount: 5, label: '穿刺' }]);
    expect(CORE.buildingById[1665]?.atks?.map(({ classId, amount }) => [classId, amount])).toEqual([
      [27, 0],
      [11, 0],
      [16, 0],
      [3, 0],
      [30, 0],
    ]);
  });

  it('明确区分空表、仅有基础与额外类别显式为零', () => {
    const empty = render({ atk: 0, atks: [] });
    expect(empty).toContain('目录未列出攻击项。');
    expect(empty).not.toContain('基础攻击');
    const base = render({ atk: 5, atks: [{ classId: 3, amount: 5 }] });
    expect(base).toContain('仅有基础攻击，没有额外类别项。');
    expect(base).toContain('基础穿刺攻击');
    expect(base).not.toContain('>+5<');
    const zero = render({
      atk: 17,
      atks: [
        { classId: 3, amount: 0 },
        { classId: 16, amount: 0, label: '船只' },
      ],
    });
    expect(zero).toContain('>0</dd>');
    expect(zero).toContain('目录列出的额外类别值均为 0。');
    expect(zero).not.toMatch(/>17<|>\+0<|船只|面板基础攻击/);
  });

  it('缺类别来源时只保留已知面板值', () => {
    const knownPanel = render({ atk: 17 });
    expect(knownPanel).toContain('缺少攻击类别来源，未核实。');
    expect(knownPanel).toContain('面板基础攻击');
    expect(knownPanel).toContain('>17</dd>');
    expect(knownPanel).not.toContain('基础穿刺攻击');
    const missingPanel = render({});
    expect(missingPanel).toContain('缺少攻击类别来源，未核实。');
    expect(missingPanel).not.toContain('<dd');
  });

  it('仅展示一次独立基础分量，未知目标保留类别 ID 和原有带符号值', () => {
    const html = render({
      atk: 120,
      atks: [
        { classId: 3, amount: 120, label: '穿刺' },
        { classId: 4, amount: 2, label: '近战' },
        { classId: 999, amount: -7 },
      ],
    });
    expect(html.match(/>120<\/dd>/g)).toHaveLength(1);
    expect(html).toContain('基础近战攻击');
    expect(html).toContain('>2</dd>');
    expect(html).toContain('>999</span>');
    expect(html).toContain('名称未核实');
    expect(html).toContain('>-7</dd>');
    expect(html).not.toContain('面板基础攻击');
  });
});
