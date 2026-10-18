import { useEffect, useId, useState } from 'react';
import { replayAt, type ReplayFrame } from '../../../domain/battleReplay';
import type { Unit } from '../../../domain/types';
import { UnitIcon } from '../../../shared/ui/art';

export function BattleReplay({
  frames,
  duration,
  a,
  b,
  maxA,
  maxB,
  unit,
}: {
  frames: ReplayFrame[];
  duration: number;
  a: Unit;
  b: Unit;
  maxA: number;
  maxB: number;
  unit: '生命' | '个单位';
}) {
  const [{ time, playing }, setPlayback] = useState({ time: 0, playing: false });
  const [speed, setSpeed] = useState(1);
  const id = useId();
  useEffect(() => {
    if (!playing || duration <= 0) return;
    let last = performance.now(),
      request = 0;
    const tick = (now: number) => {
      const delta = ((now - last) / 1000) * speed;
      last = now;
      setPlayback((p) => ({ time: Math.min(duration, p.time + delta), playing: p.time + delta < duration }));
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, speed, duration]);

  const frame = replayAt(frames, time);
  const play = () => setPlayback((p) => ({ time: p.time >= duration ? 0 : p.time, playing: !p.playing }));
  return (
    <section className="battle-replay" aria-label="战斗回放" data-t="battle-replay">
      <h4>战斗回放</h4>
      <div className="replay-field">
        {(
          [
            ['A', a, frame.a, maxA],
            ['B', b, frame.b, maxB],
          ] as const
        ).map(([side, u, value, max]) => (
          <div key={side}>
            <p>
              <UnitIcon u={u} /> {side} · {u.zh}
            </p>
            <progress max={max} value={value} aria-label={`${side} 剩余${unit}`} />
            <p className="nw" data-t={`replay-${side}`}>
              {Number(value.toFixed(1))} {unit}
            </p>
          </div>
        ))}
      </div>
      <label htmlFor={id}>
        时间{' '}
        <span className="nw" data-t="replay-time">
          {Number(time.toFixed(2))} / {Number(duration.toFixed(2))} 秒
        </span>
      </label>
      <input
        id={id}
        type="range"
        min="0"
        max={duration}
        step="any"
        value={time}
        disabled={duration <= 0}
        onChange={(e) => {
          setPlayback({ time: Number(e.target.value), playing: false });
        }}
      />
      <div className="replay-controls">
        <button type="button" disabled={duration <= 0} onClick={play}>
          {playing ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          disabled={duration <= 0}
          onClick={() => {
            setPlayback({ time: 0, playing: true });
          }}
        >
          重播
        </button>
        <label>
          倍速{' '}
          <select aria-label="回放倍速" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.5, 1, 2, 4].map((x) => (
              <option key={x} value={x}>
                {x}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="note">首击在 0 秒同时结算；1v1 展示期望生命，群战展示存活数。回放沿用结果卡计算，不模拟走位和射程。</p>
    </section>
  );
}
