import type { DuelResult, GroupResult } from '../../../domain/duel';
import { r1, type Resolved } from '../logic/duelSide';

export function OneTimeline({ A, B, result }: { A: Resolved; B: Resolved; result: DuelResult }) {
  const T = Math.max(result.ab.time ?? 0, result.ba.time ?? 0, result.duration, 0.01);
  return (
    <>
      <h3 className="duel-timeline-title">时间线（每个点为一次攻击，竖线为击杀时刻）</h3>
      <div className="duel-tl">
        {(
          [
            ['a', A, result.ab],
            ['b', B, result.ba],
          ] as const
        ).map(([k, s, w]) => (
          <div key={k} className={`tl-row tl-${k}`}>
            <span className="tl-l">{k.toUpperCase()}</span>
            <div className="tl-track">
              <div className="tl-fill" style={{ width: `${(Math.min(w.time ?? result.duration, result.duration) / T) * 100}%` }} />
              {s.F.rof > 0 &&
                Array.from({ length: Math.min(w.hits, 60) }, (_, i) => i * s.F.rof)
                  .filter((t) => t <= result.duration + 1e-9)
                  .map((t, i) => <i key={i} className="tl-hit" style={{ left: `${(t / T) * 100}%` }} />)}
              {w.time !== null && w.time <= result.duration + 1e-9 && (
                <b className="tl-kill" style={{ left: `${(w.time / T) * 100}%` }} title={`击杀 ${r1(w.time)}s`} />
              )}
            </div>
          </div>
        ))}
        <div className="tl-axis">
          <span>0s</span>
          <span>{r1(T)}s</span>
        </div>
      </div>
    </>
  );
}

export function GroupTimeline({ result, na, nb }: { result: GroupResult; na: number; nb: number }) {
  const T = Math.max(result.duration, 0.01),
    W = 600,
    H = 120,
    M = Math.max(na, nb);
  const path = (i: 1 | 2) =>
    result.timeline.map(([t, a, b], j) => `${j ? 'L' : 'M'}${((t / T) * W).toFixed(1)},${(H - ((i === 1 ? a : b) / M) * H).toFixed(1)}`).join(' ');
  return (
    <>
      <h3 className="duel-timeline-title">存活数量随时间变化</h3>
      <svg className="duel-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="存活数量随时间变化">
        <path d={path(1)} className="ln-a" />
        <path d={path(2)} className="ln-b" />
      </svg>
      <div className="tl-axis">
        <span>0s</span>
        <span>{r1(T)}s</span>
      </div>
    </>
  );
}
