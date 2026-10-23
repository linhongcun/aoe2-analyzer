// #289：formatTime.test.ts「同一个时间全站一致」拆成 formatTime.consistency-*.test.ts 多个文件并行跑，
// 这里放共用的组合与逐条检查（原样从 formatTime.test.ts 搬来，断言与循环一条不少）。
// 不是 .test.ts，vitest 不会单独收集它。
import { expect } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import civs from '../../src/data/civs.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { formatClock } from '../../src/domain/formatTime';
import { buildView, rowTime, summaryText } from '../../src/features/builds/timelineModel';
import { timeText } from '../../src/features/builds/listMeta';

const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const ECO = eco as unknown as EcoData;

/** 所有开局 × 所有已支持文明 × 自动建房开关；距离预设 2/4/7 在通用下全跑（文明加成与距离无关，文明只跑默认距离，控制 CI 时长）：摘要、步骤行、列表页的同一时间一字不差（Steve #53） */
const civIds = ['Generic', ...(civs as { en: string }[]).map((c) => c.en).filter((c) => simSupport(c))];
const dists = Object.values(WALK.presets);
const allCombos = buildOrders.flatMap((bo) => civIds.map((civ) => [bo.id, civ] as const));

/** 拆分份数；formatTime.consistency-1..SHARDS.test.ts 各取一份，合起来正好是全部组合 */
export const SHARDS = 4;
/** 第 n 份（1 起）：按下标轮流分，通用（每个开局 6 次模拟）和其他文明（2 次）在各份里均匀 */
export const shardCombos = (n: number) => allCombos.filter((_, i) => i % SHARDS === n - 1);
export const comboCount = allCombos.length;

export function checkCombo(boId: string, civ: string) {
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
      // 摘要卡点：卡人口写开始时间；其余写同类合计时长，同样走 formatClock
      if (v.top && v.top.type !== 'timeout') {
        const main = summaryText(v.top, '').main;
        if (v.top.type === 'pop_block') expect(main, ctx).toBe(`卡人口 约 ${formatClock(v.top.from)} 起`);
        else expect(main.endsWith(` 约 ${formatClock(v.top.total!)}`), ctx).toBe(true);
      }
      // 列表页（通用、默认参数）
      if (civ === 'Generic' && house && dist === WALK.default) {
        const list = timeText(tl.ageUps, bo.target.age);
        for (const a of tl.ageUps.filter((x) => list.includes(x.age === 'feudal' ? '封建' : '城堡'))) expect(list, ctx).toContain(formatClock(a.reachAt));
      }
    }
}
