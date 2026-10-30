import { describe, expect, it } from 'vitest';
import { EARLY_UNIT_AGES, unitAvailabilityAge } from '../../src/domain/availabilityAge';

describe('#531 实际可用时代与属性模拟下限分别使用', () => {
  it('复用已经建模的文明提前解锁，不改共享表', () => {
    expect(unitAvailabilityAge({ id: 75, age: 2 }, 'Armenians')).toBe(EARLY_UNIT_AGES.Armenians![75]);
    expect(unitAvailabilityAge({ id: 283, age: 4 }, 'Burgundians')).toBe(EARLY_UNIT_AGES.Burgundians![283]);
    expect(unitAvailabilityAge({ id: 5, age: 4 }, 'Bohemians')).toBe(EARLY_UNIT_AGES.Bohemians![5]);
  });
  it('长矛兵的通用与亚美尼亚实际时代不借用目录展示函数', () => {
    expect(unitAvailabilityAge({ id: 93, age: 1 }, 'Franks')).toBe(2);
    expect(unitAvailabilityAge({ id: 93, age: 1 }, 'Armenians')).toBe(1);
  });
  it('没有提前规则的单位保持原数据时代', () => {
    expect(unitAvailabilityAge({ id: 38, age: 3 }, 'Franks')).toBe(3);
    expect(unitAvailabilityAge({ id: 75, age: 2 })).toBe(2);
  });
});
