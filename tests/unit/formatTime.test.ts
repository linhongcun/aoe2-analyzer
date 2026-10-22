import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { floorSec, formatClock } from '../../src/domain/formatTime';
import { bottleneckLabel, rowTime } from '../../src/features/builds/timelineModel';
import { comboCount, SHARDS, shardCombos } from './formatTimeConsistency';

const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const ECO = eco as unknown as EcoData;

describe('formatClock：向下取整到秒', () => {
  it.each([
    [0, '0:00'],
    [0.99, '0:00'],
    [59.999, '0:59'],
    [60, '1:00'],
    [584.4, '9:44'],
    [584.5, '9:44'],
    [584.9, '9:44'],
    [585, '9:45'],
    [599.9999999, '10:00'], // 浮点累加误差视为整秒
    [3600, '60:00'],
    [-3, '0:00'],
    [NaN, '0:00'],
  ])('%s -> %s', (s, out) => expect(formatClock(s)).toBe(out));
  it('floorSec 与 formatClock 同一口径', () => expect(floorSec(24.8)).toBe(24));
});

// #289：「开局 × 文明」逐条检查拆到 formatTime.consistency-1..4.test.ts 并行跑（共用代码在 formatTimeConsistency.ts）
describe('同一个时间全站一致', () => {
  it('#289 拆分自检：各份组合合起来不重不漏', () => {
    const parts = Array.from({ length: SHARDS }, (_, i) => shardCombos(i + 1));
    const keys = parts.flat().map(([b, c]) => `${b}|${c}`);
    expect(keys).toHaveLength(comboCount);
    expect(new Set(keys).size).toBe(comboCount);
    expect(parts.every((p) => p.length > 0)).toBe(true);
  });

  it('archers-19 已知用例：摘要 9:44 与第 8 步一致', () => {
    const bo = buildOrders.find((b) => b.id === 'archers-19')!;
    const tl = simulateBuild(bo, 'Generic', ECO, UPS);
    const feudal = tl.ageUps.find((a) => a.age === 'feudal')!;
    expect(formatClock(feudal.reachAt)).toBe('9:44');
    expect(formatClock(rowTime(tl.steps[7]!))).toBe('9:44');
    expect(bottleneckLabel({ type: 'idle_tc', from: 0, to: 24.8, step: 0 } as never)).toBe('城镇中心闲置 · 约 0:24');
  });
});
