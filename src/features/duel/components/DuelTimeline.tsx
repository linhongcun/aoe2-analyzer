import { MAX_TIMELINE_HITS, sampleContactHitTimes } from '../../../domain/battleReplay';
import type { DuelResult, GroupOutcome, OneVOneResult } from '../../../domain/duel';
import { r1, type Resolved } from '../logic/duelSide';

export function OneTimeline({ A, B, result }: { A: Resolved; B: Resolved; result: DuelResult | OneVOneResult }) {
  const isContact = 'mode' in result && result.mode === 'contact';
  const T = isContact ? Math.max(result.duration, 0.01) : Math.max(result.ab.time ?? 0, result.ba.time ?? 0, result.duration, 0.01);
  return (
    <>
      <h3 className="duel-timeline-title">时间线（每个点为一次攻击，竖线为击杀时刻）</h3>
      <div className="duel-tl">
        {(
          [
            ['a', A, result.ab],
            ['b', B, result.ba],
          ] as const
        ).map(([k, s, w]) => {
          const fillPct = isContact ? (result.duration / T) * 100 : !w.canAttack ? 0 : (Math.min(w.time ?? result.duration, result.duration) / T) * 100;
          const hitTimes = isContact
            ? sampleContactHitTimes(result.replay, k, MAX_TIMELINE_HITS)
            : w.canAttack && s.F.rof > 0
              ? Array.from({ length: Math.min(w.hits, MAX_TIMELINE_HITS) }, (_, i) => i * s.F.rof).filter((t) => t <= result.duration + 1e-9)
              : [];
          const killTime = isContact
            ? (result.status === 'win' && result.winner === k) || result.status === 'draw'
              ? result.duration
              : null
            : w.canAttack && w.time !== null && w.time <= result.duration + 1e-9
              ? w.time
              : null;
          return (
            <div key={k} className={`tl-row tl-${k}`}>
              <span className="tl-l">{k.toUpperCase()}</span>
              <div className="tl-track">
                <div className="tl-fill" style={{ width: `${fillPct}%` }} />
                {hitTimes.map((t, i) => (
                  <i key={i} className="tl-hit" style={{ left: `${(t / T) * 100}%` }} />
                ))}
                {killTime !== null && <b className="tl-kill" style={{ left: `${(killTime / T) * 100}%` }} title={`击杀 ${r1(killTime)}s`} />}
              </div>
            </div>
          );
        })}
        <div className="tl-axis">
          <span>0s</span>
          <span>{r1(T)}s</span>
        </div>
      </div>
    </>
  );
}

export function GroupTimeline({ result, na, nb }: { result: GroupOutcome; na: number; nb: number }) {
  const T = Math.max(result.duration, 0.01),
    W = 600,
    H = 120,
    M = Math.max(na, nb);
  const path = (i: 1 | 2) =>
    result.timeline
      .map(([t, a, b], j) => {
        const x = ((t / T) * W).toFixed(1);
        const y = (H - ((i === 1 ? a : b) / M) * H).toFixed(1);
        return j ? `H${x}V${y}` : `M${x},${y}`;
      })
      .join(' ') + `H${((result.duration / T) * W).toFixed(1)}`;
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
