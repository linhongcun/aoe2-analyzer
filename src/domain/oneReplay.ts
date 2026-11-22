import type { DuelResult, Fighter } from './duel';

const EPS = 1e-9;

export interface ReplayFrame {
  time: number;
  a: number;
  b: number;
}

/** 1v1 静态回放帧：用于 issue 1322 无普攻/静态对照兼容单测与工具复用。 */
export function oneReplay(a: Fighter, b: Fighter, result: DuelResult): ReplayFrame[] {
  const times = new Set<number>([0]);
  for (const [f, ow] of [
    [a, result.ab],
    [b, result.ba],
  ] as const) {
    if (!ow.canAttack || f.rof <= 0) continue;
    for (let i = 1; i * f.rof < result.duration - EPS; i++) times.add(i * f.rof);
  }
  const hits = (f: Fighter, ow: DuelResult['ab'], t: number) => (!ow.canAttack ? 0 : f.rof > 0 ? Math.floor((t + EPS) / f.rof) + 1 : 1);
  const frames = [...times]
    .sort((x, y) => x - y)
    .map((time) => ({
      time,
      a: Math.max(0, a.hp - hits(b, result.ba, time) * result.ba.expDmg),
      b: Math.max(0, b.hp - hits(a, result.ab, time) * result.ab.expDmg),
    }));
  const noKill =
    result.outcome === 'both-no-attack' ||
    result.outcome === 'no-kill' ||
    (result.ab.time === null && result.ba.time === null && (!result.ab.canAttack || result.ab.hits > 1) && (!result.ba.canAttack || result.ba.hits > 1));
  frames.push({
    time: result.duration,
    a: result.winner === 'a' ? result.remaining : noKill ? frames[0]!.a : 0,
    b: result.winner === 'b' ? result.remaining : noKill ? frames[0]!.b : 0,
  });
  return frames;
}
