import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import civs from '../../src/data/civs.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { floorSec, formatClock } from '../../src/domain/formatTime';
import { bottleneckLabel, buildView, rowTime, summaryText } from '../../src/features/builds/timelineModel';
import { timeText } from '../../src/features/builds/listMeta';

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

/** 所有开局 × 所有已支持文明 × 自动建房开关；距离预设 2/4/7 在通用下全跑（文明加成与距离无关，文明只跑默认距离，控制 CI 时长）：摘要、步骤行、列表页的同一时间一字不差（Steve #53） */
const civIds = ['Generic', ...(civs as { en: string }[]).map((c) => c.en).filter((c) => simSupport(c))];
const dists = Object.values(WALK.presets);
describe('同一个时间全站一致', () => {
  const combos = buildOrders.flatMap((bo) => civIds.map((civ) => [bo.id, civ] as const));
  it.each(combos)('%s × %s', (boId, civ) => {
    const bo = buildOrders.find((b) => b.id === boId)!;
    for (const house of [true, false])
      for (const dist of civ === 'Generic' ? dists : [WALK.default]) {
        const tl = simulateBuild(bo, civ, ECO, UPS, { walkTiles: dist, autoHouses: house });
        const v = buildView(tl, (id) => id);
        const ctx = `${bo.id} ${civ} house=${house} dist=${dist}`;
        for (const a of tl.ageUps) {
          const summary = formatClock(a.reachAt);
          // 升时代那一步：行时间 = 点击时刻；到达后紧接的那一步：行时间 = 到达时刻
          const up = tl.steps.find((s) => s.action === 'ageup' && s.doneAt === a.reachAt);
          if (up) expect(formatClock(rowTime(up)), ctx).toBe(formatClock(a.clickAt));
          const next = tl.steps.find((s) => rowTime(s) >= a.reachAt - 1e-6 && rowTime(s) - a.reachAt < 1);
          if (next) expect(formatClock(rowTime(next)), ctx).toBe(summary);
        }
        // 摘要卡点和它的步骤文案用同一个时长
        if (v.top && v.top.type !== 'timeout' && !summaryText(v.top, '', v.tOut).main.endsWith('起')) {
          const dur = summaryText(v.top, '', v.tOut).main.split('约 ')[1];
          expect(v.top.label.endsWith(`约 ${dur}`), ctx).toBe(true);
        }
        // 列表页（通用、默认参数）
        if (civ === 'Generic' && house && dist === WALK.default) {
          const list = timeText(tl.ageUps, bo.target.age);
          for (const a of tl.ageUps.filter((x) => list.includes(x.age === 'feudal' ? '封建' : '城堡'))) expect(list, ctx).toContain(formatClock(a.reachAt));
        }
      }
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
