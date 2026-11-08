import { describe, expect, it } from 'vitest';
import { effectiveGatherRate, tripTime } from '../../src/domain/gatherRate';

describe('#798 采集速率纯函数', () => {
  const base = { workRate: 0.5, carry: 10, speed: 1.2, walkTiles: 0 };

  it('无走路时等于 workRate；noReturnWalk 也等于 workRate', () => {
    expect(effectiveGatherRate(base)).toBeCloseTo(0.5, 12);
    expect(effectiveGatherRate({ ...base, walkTiles: 3, noReturnWalk: true })).toBeCloseTo(0.5, 12);
  });

  it('往返 3 格：walk=5 秒，有效速率 0.4，每趟 25 秒', () => {
    expect(effectiveGatherRate({ ...base, walkTiles: 3 })).toBeCloseTo(0.4, 10);
    expect(tripTime({ ...base, walkTiles: 3 })).toBeCloseTo(25, 10);
  });

  it('渔船调用点复用同一有效速率，并保持多船乘法顺序', () => {
    const rate = effectiveGatherRate({ ...base, walkTiles: 4 });
    expect(rate).toBeCloseTo(10 / (20 + 8 / 1.2), 10);
    const many = effectiveGatherRate({ ...base, walkTiles: 4, units: 3 });
    expect(many).toBeCloseTo(30 / (20 + 8 / 1.2), 10);
  });

  it('deepFish 倍率由调用方乘进 workRate 后仍走同一公式', () => {
    const rate = effectiveGatherRate({ ...base, workRate: 0.5 * 1.2, walkTiles: 4 });
    expect(rate).toBeCloseTo(10 / (10 / 0.6 + 8 / 1.2), 10);
  });
});
