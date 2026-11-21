import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { expect, it } from 'vitest';
import catalog from '../../data/game/units.json';
import { UnitCharge } from '../../src/features/units/components/UnitCharge';

type Charge = Parameters<typeof UnitCharge>[0]['unit'];
const byId = new Map(catalog.map((unit) => [unit.id, unit]));
function show(unit: Charge, base?: Charge) {
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/', children: createElement(UnitCharge, { unit, base }) }));
}

it('目录保留显式零、非零类型和原始非常规值', () => {
  expect(catalog.filter((u) => u.chargeType !== 0)).toHaveLength(24);
  expect(catalog.filter((u) => u.rechargeDuration !== undefined)).toHaveLength(28);
  expect(
    catalog
      .filter((u) => u.chargeType === 0 && u.rechargeDuration === 0)
      .map((u) => u.id)
      .sort((a, b) => a - b),
  ).toEqual([529, 532, 1103, 1302]);
  expect(byId.get(1948)).toMatchObject({ chargeType: 6, chargeEvent: -3, rechargeRate: 100000, rechargeDuration: 0.00001 });
});

it.each([
  [1655, 1657, '攻击蓄力', '25', '40 秒', '0.625 /秒', '+5', '与普通相同'],
  [1735, 1737, '范围蓄力攻击', '15', '20 秒', '0.75 /秒', '+3', '-4 秒'],
  [1751, 1753, '投射物闪避', '7', '20 秒', '0.35 /秒', '+2', '与普通相同'],
  [1908, 1910, '近战格挡', '1', '30 秒', '约 0.033 /秒', '与普通相同', '-10 秒'],
] as const)('按普通 %d 与精锐 %d 的同类参数比较', (base, id, ...text) => {
  const html = show(byId.get(id)!, byId.get(base)!);
  for (const label of text) expect(html).toContain('>' + label + '<');
});

it('按源值识别异常，隐藏真实的零类型及缺失类型', () => {
  expect(
    catalog
      .filter((unit) => show(unit).includes('不作冷却解读'))
      .map((u) => u.id)
      .sort((a, b) => a - b),
  ).toEqual([1948, 1968, 1970, 2711, 2712]);
  expect(show(byId.get(529)!)).toBe('');
  expect(show({})).toBe('');
  expect(show({ chargeType: NaN })).toBe('');
  expect(show(byId.get(831)!)).toContain('约 5.88 秒');
  expect(show(byId.get(1970)!, byId.get(1968)!)).not.toContain('相对普通');
});

it('未知类型、缺失、显式零各用独立文案，未知参照值不参与比较', () => {
  const missing = show({ chargeType: 42 }, { chargeType: 42, rechargeDuration: 5 });
  for (const label of ['充能用途待核实', '待核实', '暂无数据']) expect(missing).toContain(label);
  expect(missing).not.toContain('相对普通');
  const zero = show({ chargeType: 4, maxCharge: 0, rechargeRate: 0, rechargeDuration: 0 });
  for (const label of ['固定源显式为 0 秒', '固定源显式记录为 0 /秒', '固定源显式记录为 0。']) expect(zero).toContain(label);
  expect(show({ chargeType: 99, maxCharge: 8 }, { chargeType: 4, maxCharge: 2 })).not.toContain('相对普通');
});
