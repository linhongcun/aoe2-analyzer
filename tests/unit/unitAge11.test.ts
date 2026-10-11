import { describe, expect, it } from 'vitest';
import { units } from './helpers';

// #11：升级单位的时代取 .dat 升级科技前置链中的时代（scripts/units_build.py techAge）
const byId = (id: number) => units.find((u) => u.id === id)!;

describe('#11 升级单位时代', () => {
  it('长戟兵、冠军剑士为帝王时代', () => {
    for (const id of [359, 567]) expect(byId(id).age).toBe(4);
  });
  it('同批校正：双手剑士帝王，长剑士、长枪兵城堡', () => {
    expect(byId(473).age).toBe(4);
    expect(byId(77).age).toBe(3);
    expect(byId(358).age).toBe(3);
  });
  it('战争趸船保持城堡时代（.dat 科技 34 War Galley 升级 2626 到 2627，前置 102 城堡时代）', () => {
    expect(byId(2627).age).toBe(3);
  });
});
