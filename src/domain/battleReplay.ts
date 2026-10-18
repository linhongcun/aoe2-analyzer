import type { DuelResult, Fighter, GroupResult } from './duel';

export interface ReplayFrame {
  time: number;
  a: number;
  b: number;
}

/** 群战沿用引擎事件采样，末帧时间保留计算值，避免百分秒取整越过滑块终点。 */
export function groupReplay(result: GroupResult): ReplayFrame[] {
  const frames = result.timeline.map(([time, a, b]) => ({ time: Math.min(time, result.duration), a, b }));
  frames.push({ time: result.duration, a: result.aAlive, b: result.bAlive });
  return frames;
}

/** 1v1 的攻击发生在各自攻击间隔的整倍数，使用结果卡的期望每击与终局生命。 */
export function oneReplay(a: Fighter, b: Fighter, result: DuelResult): ReplayFrame[] {
  const times = new Set<number>([0]);
  for (const fighter of [a, b]) {
    if (fighter.rof <= 0) continue;
    for (let i = 1; i * fighter.rof < result.duration - 1e-9; i++) times.add(i * fighter.rof);
  }
  const hits = (f: Fighter, t: number) => (f.rof > 0 ? Math.floor((t + 1e-9) / f.rof) + 1 : 1);
  const frames = [...times]
    .sort((x, y) => x - y)
    .map((time) => ({
      time,
      a: Math.max(0, a.hp - hits(b, time) * result.ba.expDmg),
      b: Math.max(0, b.hp - hits(a, time) * result.ab.expDmg),
    }));
  const noKill = result.ab.time === null && result.ba.time === null && result.ab.hits > 1 && result.ba.hits > 1;
  frames.push({
    time: result.duration,
    a: result.winner === 'a' ? result.remaining : noKill ? frames[0]!.a : 0,
    b: result.winner === 'b' ? result.remaining : noKill ? frames[0]!.b : 0,
  });
  return frames;
}

/** 定位到时间点已完成的最后一次结算，支持倒拖和同刻多帧。 */
export function replayAt(frames: readonly ReplayFrame[], time: number): ReplayFrame {
  let lo = 0,
    hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]!.time <= time + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return frames[Math.max(0, lo - 1)] ?? { time: 0, a: 0, b: 0 };
}
