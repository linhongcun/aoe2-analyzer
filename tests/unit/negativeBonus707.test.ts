import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import rawUnits from '../../src/data/raw/units';
import type { Unit } from '../../src/domain/types';
import { damageByClass, damagePerHit, fighterFrom } from '../../src/domain/duel';
import { baseStats } from '../../src/domain/simulator';
import { BonusTable } from '../../src/shared/ui/sim/SimPanel';

const units = rawUnits as unknown as Unit[];
const fighter = (id: number) => {
  const unit = units.find((row) => row.id === id)!;
  return fighterFrom(unit, baseStats(unit));
};
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const negativeCases: Parameters<typeof BonusTable>[0][] = [
  { B: { 村民: -3 } },
  { B: { 村民: -3 }, S: { 村民: 1 } },
  { B: { 僧侣: 0 }, S: { 僧侣: -1 } },
  { B: { 僧侣: 0 }, C: { 僧侣: -1 }, cmpLabel: '对比' },
];

describe('#707 负攻击加成的同屏说明', () => {
  it.each(negativeCases)('任一显示列为负值时解释完整规则：%j', (props) => {
    const visible = text(renderToStaticMarkup(createElement(BonusTable, props)));
    expect(visible).toContain('负攻击加成可能扣减伤害');
    expect(visible).toContain('max(min(0, 攻击), 攻击 − 护甲)');
    expect(visible).toContain('与基础攻击的对应类别贡献合计');
    expect(visible).toContain('伤害最低为 1');
    expect(visible).toContain('目标已入库且具有的护甲类别');
    expect(visible).toContain('缺失或无匹配类别的这一项不计入');
  });

  it('正值、零值、空表及负增量本身不冒充负攻击', () => {
    const cases: Parameters<typeof BonusTable>[0][] = [{ B: {} }, { B: { 骑兵: 0 } }, { B: { 骑兵: 4 }, S: { 骑兵: 3 } }];
    for (const props of cases) {
      expect(text(renderToStaticMarkup(createElement(BonusTable, props)))).not.toContain('负攻击加成可能扣减伤害');
    }
  });
});

describe('#707 固定数据与现有引擎口径', () => {
  it('骑士的对村民 -3 因目标当前缺该类别而未计入，不编造 7 点', () => {
    const a = fighter(38),
      d = fighter(83);
    expect(a.attack['村民']).toBe(-3);
    expect(d.armor).not.toHaveProperty('村民');
    expect(damageByClass(a, d).some((row) => row.category === '村民')).toBe(false);
    expect(damagePerHit(a, d)).toBe(10);
  });

  it('轻型投石车对僧侣的实际类别贡献为 40 与 -1，合计 39', () => {
    const rows = damageByClass(fighter(280), fighter(125));
    expect(rows).toEqual(
      expect.arrayContaining([
        { category: '近战', attack: 40, armor: 0, damage: 40 },
        { category: '僧侣', attack: -1, armor: 0, damage: -1 },
      ]),
    );
    expect(damagePerHit(fighter(280), fighter(125))).toBe(39);
  });

  it('保留最低 1 与负护甲边界；无负贡献时简式与完整式等价', () => {
    expect(damagePerHit({ attack: { 近战: 2, 村民: -3 } }, { armor: { 近战: 0, 村民: 0 } })).toBe(1);
    for (const [attack, armor] of [
      [-3, -4],
      [0, -1],
      [5, 2],
      [2, 5],
    ]) {
      const rows = damageByClass({ attack: { 测试: attack! } }, { armor: { 测试: armor! } });
      expect(rows.every((row) => row.damage >= 0)).toBe(true);
      expect(damagePerHit({ attack: { 测试: attack! } }, { armor: { 测试: armor! } })).toBe(Math.max(1, Math.max(0, attack! - armor!)));
    }
  });
});
