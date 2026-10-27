import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { civs, loadCore } from '../../src/data';
import { civBonuses } from '../../src/domain/civBonus';
import BonusBody from '../../src/shared/ui/BonusBody';

// Isolate the encoded-body rendering contract from the domain calculation tested in mayans197.test.ts.
vi.mock('../../src/domain/bonusUsage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/domain/bonusUsage')>();
  return {
    ...original,
    bonusUsage: (b: Parameters<typeof original.bonusUsage>[0]) =>
      b.id === 'Mayans-1' ? [{ tool: 'sim', name: '开局模拟', on: true, note: '已计入资源产量与工作率配对；储量和耗尽未模拟' }] : original.bonusUsage(b),
  };
});

beforeAll(async () => {
  await loadCore();
});
const bonus = (civ: string, idx: number) => civBonuses(civs.find((c) => c.en === civ)!).find((b) => b.idx === idx)!;
const render = (civ: string, idx: number, compact = false) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/civ/${civ}/bonus/${idx}` }, createElement(BonusBody, { b: bonus(civ, idx), compact })));

describe('#197 玛雅已编码详情的局部开局说明', () => {
  it.each([false, true])('compact=%s：实际渲染已计算的时间线行，encoded闸不能静默吃掉说明', (compact) => {
    const b = bonus('Mayans', 1);
    expect(b.src).toBe('dat');
    expect(b.encoded).toBe(true);
    const html = render('Mayans', 1, compact);
    expect(html).toContain('data-usage="sim" data-on="true"');
    expect(html).toContain('已计入资源产量与工作率配对；储量和耗尽未模拟');
    expect(html).toContain('已计入数值');
  });
  it('其它已编码加成保留原展示，不追加玛雅专用说明', () => {
    expect(bonus('Franks', 2).encoded).toBe(true);
    const html = render('Franks', 2);
    expect(html).toContain('已计入数值');
    expect(html).not.toContain('data-usage="sim"');
    expect(html).not.toContain('储量和耗尽未模拟');
  });
});
