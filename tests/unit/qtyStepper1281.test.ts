import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { canStepQuantity, parseStrictDecimal, stepQuantity, type QtyStepBounds } from '../../src/domain/qtyStepper';
import { unitQueryMatches } from '../../src/domain/unitFilters';
import { sortUnitFamilies, unitEntryMatchKind } from '../../src/domain/unitOrder';

const PROD: QtyStepBounds = { min: 0, max: 100 };
const TRAIN: QtyStepBounds = { min: 1, max: 1000 };

describe('Issue 1281 qtyStepper 纯函数', () => {
  it('parseStrictDecimal 仅接受严格十进制有限数并归一化 -0', () => {
    expect(parseStrictDecimal('0')).toBe(0);
    expect(Object.is(parseStrictDecimal('-0'), 0)).toBe(true);
    expect(Object.is(parseStrictDecimal('-0.0'), 0)).toBe(true);
    expect(parseStrictDecimal(' 42 ')).toBe(42);
    expect(parseStrictDecimal('007')).toBe(7);
    expect(parseStrictDecimal('1.5')).toBe(1.5);
    expect(parseStrictDecimal('-3.25')).toBe(-3.25);

    for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1e5', '1e309', '+5', '12px', '1,000', '.5', '5.']) {
      expect(parseStrictDecimal(bad), bad).toBeNull();
    }
  });

  it('持续生产 [0, 100] 步进与边界禁用', () => {
    expect(canStepQuantity('0', -1, PROD)).toBe(false);
    expect(canStepQuantity('0', 1, PROD)).toBe(true);
    expect(canStepQuantity('100', 1, PROD)).toBe(false);
    expect(canStepQuantity('100', -1, PROD)).toBe(true);
    expect(canStepQuantity('0.0', -1, PROD)).toBe(false);
    expect(canStepQuantity('-0', -1, PROD)).toBe(false);

    expect(stepQuantity('1', 1, PROD)).toBe('2');
    expect(stepQuantity('1', -1, PROD)).toBe('0');
    expect(stepQuantity('0', -1, PROD)).toBe('0');
    expect(stepQuantity('0', 1, PROD)).toBe('1');
    expect(stepQuantity('100', 1, PROD)).toBe('100');
    expect(stepQuantity('100', -1, PROD)).toBe('99');
    expect(stepQuantity('0.0', 1, PROD)).toBe('1');
    expect(stepQuantity('1.0', -1, PROD)).toBe('0');
    expect(stepQuantity('007', 1, PROD)).toBe('8');
  });

  it('训练总价 [1, 1000] 步进与边界禁用', () => {
    expect(canStepQuantity('1', -1, TRAIN)).toBe(false);
    expect(canStepQuantity('1', 1, TRAIN)).toBe(true);
    expect(canStepQuantity('1000', 1, TRAIN)).toBe(false);
    expect(canStepQuantity('1000', -1, TRAIN)).toBe(true);
    expect(canStepQuantity('0', -1, TRAIN)).toBe(false);
    expect(canStepQuantity('0', 1, TRAIN)).toBe(true);

    expect(stepQuantity('1', 1, TRAIN)).toBe('2');
    expect(stepQuantity('1', -1, TRAIN)).toBe('1');
    expect(stepQuantity('1000', -1, TRAIN)).toBe('999');
    expect(stepQuantity('1000', 1, TRAIN)).toBe('1000');
    expect(stepQuantity('0', 1, TRAIN)).toBe('1');
    expect(stepQuantity('1.0', 1, TRAIN)).toBe('2');
  });

  it('空串、非数字、负数、小数与超限值恢复', () => {
    // 空串 / 纯空白：减禁用，加回到活跃默认值 1
    for (const empty of ['', '   ']) {
      expect(canStepQuantity(empty, -1, PROD)).toBe(false);
      expect(canStepQuantity(empty, 1, PROD)).toBe(true);
      expect(stepQuantity(empty, 1, PROD)).toBe('1');
      expect(stepQuantity(empty, -1, PROD)).toBe('0');
      expect(stepQuantity(empty, 1, TRAIN)).toBe('1');
      expect(stepQuantity(empty, -1, TRAIN)).toBe('1');
    }

    // 非数字与科学计数法：两端均可点恢复
    for (const bad of ['abc', 'NaN', 'Infinity', '1e5', '1e309']) {
      expect(canStepQuantity(bad, -1, PROD), bad).toBe(true);
      expect(canStepQuantity(bad, 1, PROD), bad).toBe(true);
      expect(stepQuantity(bad, 1, PROD), bad).toBe('1');
      expect(stepQuantity(bad, -1, PROD), bad).toBe('0');
      expect(stepQuantity(bad, 1, TRAIN), bad).toBe('1');
      expect(stepQuantity(bad, -1, TRAIN), bad).toBe('1');
    }

    // 负数与 -0
    expect(canStepQuantity('-5', -1, PROD)).toBe(false);
    expect(canStepQuantity('-5', 1, PROD)).toBe(true);
    expect(stepQuantity('-5', 1, PROD)).toBe('0');
    expect(stepQuantity('-5', 1, TRAIN)).toBe('1');
    expect(stepQuantity('-0', 1, PROD)).toBe('1');
    expect(stepQuantity('-0', -1, PROD)).toBe('0');

    // 超上限
    expect(canStepQuantity('999', 1, PROD)).toBe(false);
    expect(canStepQuantity('999', -1, PROD)).toBe(true);
    expect(stepQuantity('999', -1, PROD)).toBe('100');
    expect(stepQuantity('2000', -1, TRAIN)).toBe('1000');

    // 非整数小数：向下 / 向上取最近整数
    expect(stepQuantity('2.4', -1, PROD)).toBe('2');
    expect(stepQuantity('2.4', 1, PROD)).toBe('3');
    expect(stepQuantity('0.5', -1, PROD)).toBe('0');
    expect(stepQuantity('0.5', 1, PROD)).toBe('1');
    expect(stepQuantity('99.5', 1, PROD)).toBe('100');
  });
});

describe('Issue 1281 ArmyUnitPicker 领域检索与排序复用', () => {
  it('拼音与别名匹配且法兰克特色兵置顶', () => {
    const entries = CORE.units.map((u) => ({ u }));
    const franksSorted = sortUnitFamilies(entries, { civ: 'Franks' });
    // 法兰克独特单位掷斧兵(281)或精锐掷斧兵(531)排在最前
    expect(franksSorted[0]?.u.type).toBe('UniqueUnit');
    expect(franksSorted[0]?.u.civs).toContain('Franks');

    const paladin = CORE.unitById[569]!;
    const knight = CORE.unitById[38]!;
    expect(unitQueryMatches(paladin, 'yx')).toBe(true);
    expect(unitQueryMatches(paladin, '圣骑士')).toBe(true);
    expect(unitEntryMatchKind({ u: paladin }, 'yx')).toBe('py');
    expect(unitEntryMatchKind({ u: paladin }, '圣骑士')).toBe('alias');
    expect(unitQueryMatches(knight, 'qishi')).toBe(true);
    expect(unitEntryMatchKind({ u: knight }, 'qishi')).toBe('py');
  });
});
