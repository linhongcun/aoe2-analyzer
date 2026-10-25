import { describe, expect, it } from 'vitest';
import { timelineAxis, timelineBottleneckLayout } from '../../src/domain/buildTimelineLayout';

describe('时间线布局边界（#288）', () => {
  it('按完整分钟确定轴长，并把左右边界与区间裁到轴内', () => {
    const axis = timelineAxis(61);
    expect(axis.minutes).toBe(2);
    expect(axis.span).toBe(120);
    expect(axis.ticks).toEqual([0, 1, 2]);
    expect(axis.pct(-1)).toBe('0%');
    expect(axis.pct(60)).toBe('50%');
    expect(axis.pct(121)).toBe('100%');
    expect(axis.width(-10, 60)).toBe('50%');
    expect(axis.width(60, 130)).toBe('50%');
    expect(axis.width(80, 60)).toBe('0%');
    expect(axis.width(-20, -10)).toBe('0%');
  });

  it('超过10分钟用2分钟刻度、超过30分钟用5分钟刻度', () => {
    expect(timelineAxis(600).every).toBe(1);
    expect(timelineAxis(601).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(timelineAxis(1800).every).toBe(2);
    expect(timelineAxis(1801).ticks).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });

  it('空轴不会产生NaN坐标', () => {
    expect(timelineAxis(0).pct(0)).toBe('0%');
    expect(timelineAxis(0).width(0, 0)).toBe('0%');
  });

  it('主卡点匹配原区间，排除零长卡点后合并相邻的浅色区间且不修改输入', () => {
    const main = { from: 20, to: 25, sec: 5, type: 'pop_block', step: 3 };
    const list = [
      { from: 12, to: 15, sec: 3, type: 'resource_short', step: 2 },
      { from: 4, to: 8, sec: 4, type: 'idle_tc', step: 0 },
      { from: 9, to: 12, sec: 3, type: 'prereq_wait', step: 1 },
      main,
      { from: 30, to: 30, sec: 0, type: 'timeout', step: 4 },
    ];
    const before = structuredClone(list);
    const summary = { ...main, total: 50 };
    const layout = timelineBottleneckLayout(list, summary);
    expect(layout.tagged).toBe(main);
    expect(layout.merged).toHaveLength(1);
    expect(layout.merged[0]).toEqual({ from: 4, to: 15, types: new Set(['idle_tc', 'prereq_wait', 'resource_short']) });
    expect(list).toEqual(before);
  });

  it('主卡点没有时以最长有效区间高亮；只有零长区间时不画高亮', () => {
    const short = { from: 0, to: 4, sec: 4, type: 'idle_tc', step: 0 };
    const long = { from: 10, to: 20, sec: 10, type: 'resource_short', step: 1 };
    expect(timelineBottleneckLayout([short, long], null).tagged).toBe(long);
    expect(timelineBottleneckLayout([{ ...short, to: 0 }], null)).toEqual({ tagged: undefined, merged: [] });
  });
});
