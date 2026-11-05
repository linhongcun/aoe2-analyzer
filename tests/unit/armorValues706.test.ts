import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import rawUnits from '../../src/data/raw/units';
import type { Unit } from '../../src/domain/types';
import { ArmorClasses } from '../../src/shared/ui/sim/SimPanel';

const units = rawUnits as unknown as Unit[];
const render = (list: [string, number][]) => renderToStaticMarkup(createElement(ArmorClasses, { list }));
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('#706 护甲类别显示已有数值', () => {
  it('真实骑士、长弓兵、轻型投石车、巨型投石机均明确显示零护甲', () => {
    for (const id of [38, 8, 280, 331]) {
      const unit = units.find((row) => row.id === id)!;
      const visible = text(render(unit.armc));
      for (const [name, value] of unit.armc) expect(visible, `${unit.zh}：${name}`).toContain(`${name} ${value}`);
    }
  });

  it('保留正护甲和真实高丽战车的负护甲，不把负号隐藏', () => {
    expect(text(render([['测试护甲', 4]]))).toContain('测试护甲 4');
    const warWagon = units.find((row) => row.id === 827)!;
    expect(warWagon.armc.find(([name]) => name === '骑射手')?.[1]).toBe(-1);
    expect(text(render(warWagon.armc))).toContain('骑射手 -1');
  });

  it('旧称的可访问名称包含已显示的护甲值', () => {
    const html = render([['冲击步兵', 0]]);
    expect(text(html)).toContain('冲击步兵 0');
    expect(html).toContain('aria-label="冲击步兵 0（旧称：鹰战士类）"');
  });

  it('空列表与既有未知类别过滤不制造零值', () => {
    expect(text(render([]))).toMatch(/—$/);
    const html = render([['类别999', 0]]);
    expect(text(html)).toMatch(/—$/);
    expect(html).not.toContain('类别999');
  });
});
