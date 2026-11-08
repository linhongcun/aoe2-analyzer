import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { ECO, ECO_PATCH_BUILD } from '../../src/data/eco';

describe('#796 eco 类型化入口', () => {
  it('版本与 pin 一致，并暴露村民任务', () => {
    expect(ECO_PATCH_BUILD).toBe(pins.patch.build);
    expect(Object.keys(ECO.villager.tasks).length).toBeGreaterThan(0);
  });
});
