import { describe, expect, it } from 'vitest';
import { keptTime, agePending, pendingFrom } from '../../src/features/builds/pendingFix';
import { buildOrders } from '../../src/data/buildOrders';

describe('pendingFix 临时置灰', () => {
  it('两条快速城堡开局从点城堡那步起置灰', () => {
    for (const id of ['fast-castle-boom', 'drush-fc']) {
      const bo = buildOrders.find((b) => b.id === id)!;
      const i = pendingFrom(bo)!;
      expect(bo.steps[i]!.phase).toBe('castle-click');
      expect(agePending(id, 3)).toBe(true);
      expect(agePending(id, 2)).toBe(false);
    }
  });
  it('其他开局不受影响', () => {
    expect(pendingFrom(buildOrders.find((b) => b.id === 'scouts-18')!)).toBeNull();
    expect(agePending('scouts-18', 3)).toBe(false);
  });
  it('列表目标时间只保留封建', () => {
    expect(keptTime('约 10:30 封建、14:00 城堡')).toBe('约 10:30 封建');
    expect(keptTime('约 16:00 城堡')).toBe('');
    expect(keptTime(undefined)).toBe('');
  });
});
