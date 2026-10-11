import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Anomaly } from '../../src/domain/buildSim';
import { RowSegs } from '../../src/features/builds/RowSegs';
import { rowSegments } from '../../src/features/builds/timelineModel';

describe('RowSegs：超过 3 段时折叠（#51）', () => {
  // 5 段首尾相接、互不重叠：100 至 400 秒
  const types: Anomaly['type'][] = ['resource_short', 'tc_busy', 'prereq_wait', 'resource_short', 'tc_busy'];
  const list = types.map((type, k) => ({ type, from: 100 + k * 60, to: 160 + k * 60, waitSec: 60, reasonZh: '', resource: 'gold', shortfall: 10 }) as Anomaly);
  const segs = rowSegments(list, { from: 100, to: 400 });
  const html = renderToStaticMarkup(createElement(RowSegs, { segs, tOut: Infinity }));
  const lines = [...html.matchAll(/<span class="rl" data-t="([\w-]+)"/g)].map((m) => m[1]);
  const segAttrs = [...html.matchAll(/<span[^>]*data-t="row-seg"[^>]*>/g)].map((m) => m[0]);

  it('显示 2 行 + 「另有 3 段等待」', () => {
    expect(segs).toHaveLength(5);
    expect(lines).toEqual(['row-seg', 'row-seg', 'row-seg-more']);
    expect(html).toContain('另有 3 段等待');
  });
  it('折叠的 3 段仍带 data-start/data-end，5 段之和 = 跳变 300 秒', () => {
    expect(segAttrs).toHaveLength(5);
    expect(segAttrs.filter((t) => / hidden/.test(t))).toHaveLength(3);
    const sum = segAttrs.reduce((x, t) => x + Number(t.match(/data-end="([\d.]+)"/)![1]) - Number(t.match(/data-start="([\d.]+)"/)![1]), 0);
    expect(Math.abs(sum - 300)).toBeLessThanOrEqual(0.5);
  });
});
