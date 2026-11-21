import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { expect, it } from 'vitest';
import { UnitBlast } from '../../src/features/units/components/UnitBlast';
import { loadCore } from '../../src/data';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import units from '../../data/game/units.json';

type Sample = Parameters<typeof UnitBlast>[0]['unit'];
function text(unit: Partial<Sample>, catalog: Parameters<typeof UnitBlast>[0]['catalog'] = []) {
  const component = createElement(UnitBlast, { unit: { id: 1, blast: 0, ...unit }, catalog });
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/', children: component })).replace(/<[^>]+>/gu, '');
}

it('固定目录样本与范围攻击、受方及反例计数', () => {
  expect(units.filter((unit) => unit.blast > 0)).toHaveLength(35);
  expect(units.filter((unit) => unit.friendlyFireDamage !== 1).map((unit) => unit.id)).toEqual([1911]);
  expect(units.filter((unit) => unit.blast === 0 && Math.abs(unit.blastDamage - 0.33) < 0.000001)).toHaveLength(5);
  expect(units.filter((unit) => unit.blast === 0 && unit.blastDamage === -5)).toHaveLength(65);
  expect(units.find((unit) => unit.id === 550)).toMatchObject({ blast: 1.25, blastDamage: 1, blastAttackLevel: 1, friendlyFireDamage: 1 });
  const grenade = units.find((unit) => unit.id === 1911)!;
  expect(text(grenade, units)).toContain('仅本单位非 1');
  expect(text(grenade, [...units, { id: 0, friendlyFireDamage: 0.25 }])).not.toContain('仅本单位非 1');
});
it('负数保留固定伤害编码，未解码等级仅显示原值', () => {
  const result = text({ blast: 0.5, blastDamage: -5, blastAttackLevel: 11, friendlyFireDamage: 1 });
  expect(result).toContain('固定伤害编码');
  expect(result).toContain('固定源负值（-5）');
  expect(result).not.toContain('-5%');
  expect(result).toContain('编码 11（未解码）');
  expect(result).not.toContain('受方修正');
});
it('缺失与显式零按各字段分别判断', () => {
  expect(text({ blast: 1 })).toContain('当前形态未收录受方友军范围伤害倍率');
  expect(text({ blast: 1, blastDamage: NaN, blastAttackLevel: -1 })).toContain('当前形态未收录波及对象层级');
  const zero = text({ blast: 1, blastDamage: 0, blastAttackLevel: 0, friendlyFireDamage: 0 });
  expect(zero).toContain('固定源显式记录为 0。');
  expect(zero).toContain('等级 0（含资源）');
  expect(zero).toContain('×0');
  expect(text({})).toBe('');
  expect(text({ blastDamage: -5, friendlyFireDamage: 1 })).toBe('');
  const receiver = text({ friendlyFireDamage: 0 });
  expect(receiver).toContain('受方修正');
  expect(receiver).not.toContain('减半');
  expect(receiver).not.toContain('攻击方（本单位打出）');
});

it('切换到近战形态后保留自己的半径，清除训练记录的系数与受方数据', async () => {
  const core = await loadCore();
  for (const id of [1738, 1740]) {
    const { rawTarget, owner } = resolveUnitForm(core, id);
    expect(owner?.blastDamage).toBeDefined();
    expect(rawTarget?.blast).toBe(0.5);
    expect(rawTarget?.blastDamage).toBeUndefined();
    expect(rawTarget?.blastAttackLevel).toBeUndefined();
    expect(rawTarget?.friendlyFireDamage).toBeUndefined();
  }
});
