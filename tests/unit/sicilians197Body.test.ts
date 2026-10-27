import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, expect, it } from 'vitest';
import { civs, loadCore } from '../../src/data';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import BonusBody from '../../src/shared/ui/BonusBody';

const bonuses = () => civBonuses(civs.find((c) => c.en === 'Sicilians')!);
const bonus = (idx: number) => bonuses().find((b) => b.idx === idx)!;
beforeAll(async () => {
  await loadCore();
});

it('#197 actual Sicilians-4 source has sim and construction usage with precise current support', () => {
  expect(bonus(4)).toMatchObject({ id: 'Sicilians-4', src: 'dat', encoded: true });
  expect(bonusUsage(bonus(4))).toEqual([
    { tool: 'sim', name: '开局模拟', on: true, note: '已计入城镇中心、城堡和防御工事的实际施工工期' },
    { tool: 'construction', name: '施工工具', on: true, note: '施工工期已计入' },
  ]);
});
it('#197 encoded Sicilians-4 actual body renders its timeline usage', () => {
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Sicilians/bonus/4' }, createElement(BonusBody, { b: bonus(4) })));
  expect(html).toContain('data-usage="sim" data-on="true"');
  expect(html).toContain('已计入城镇中心、城堡和防御工事的实际施工工期');
  expect(html).toContain('新城镇中心按实际施工形态计算');
});
it('#197 Sicilians-1 storage remains uncounted after civilization support', () => {
  const line = bonusUsage(bonus(1)).find((line) => line.tool === 'sim');
  expect(line?.on).toBe(false);
  expect(line?.note).toBe('未计入：农田升级额外储量、耗尽和续种未模拟，也未估算节省的木材');
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Sicilians/bonus/1' }, createElement(BonusBody, { b: bonus(1) })));
  expect(html).toContain('data-usage="sim" data-on="false"');
  expect(html).not.toContain('data-usage="sim" data-on="true"');
});
