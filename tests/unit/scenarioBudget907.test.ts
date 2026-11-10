import { describe, expect, it } from 'vitest';
import { gatherModel } from '../../src/domain/realCost';
import { affordableCount, neutralGatherModel } from '../../src/domain/scenarioBudget';

describe('情景预算与中性采集上下文（issue 907）', () => {
  it('预算付清固定投入后按单兵工秒计算数量', () => {
    expect(affordableCount(100, 40, 10)).toEqual({ paid: true, count: 6 });
    expect(affordableCount(40, 40, 10)).toEqual({ paid: true, count: 0 });
  });

  it('epsilon 容忍浮点边界，明显不足时 paid=false', () => {
    expect(affordableCount(39.9999999999, 40, 10).paid).toBe(true);
    expect(affordableCount(39.999999, 40, 10)).toEqual({ paid: false, count: 0 });
  });

  it('limit 只在 paid 后截断', () => {
    expect(affordableCount(100, 40, 10, 3)).toEqual({ paid: true, count: 3 });
    expect(affordableCount(30, 40, 10, 3)).toEqual({ paid: false, count: 0 });
  });

  it('负剩余预算不产生负数数量', () => {
    expect(affordableCount(39, 40, 10)).toEqual({ paid: false, count: 0 });
  });

  it('中性采集上下文与旧调用完全一致', () => {
    expect(neutralGatherModel()).toEqual(gatherModel(3, '', { techIds: new Set(), walkTiles: 3, farmTiles: 0 }));
  });
});
