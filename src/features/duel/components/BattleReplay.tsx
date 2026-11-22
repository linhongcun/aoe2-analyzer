import { useEffect, useState } from 'react';
import { isLargeAggregate, replayAt, type BattleReplayModel, type ReplayKind } from '../../../domain/battleReplay';
import { formatHp } from '../../../domain/hpFormat';
import type { Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { BattleReplayControls } from './BattleReplayControls';
import { BattleReplaySides } from './BattleReplaySides';
import { BattleStageSvg } from './BattleStageSvg';
import '../battle-replay.css';

const NARROW_QUERY = '(max-width: 640px)';

const BOUNDARY_NOTES: Record<ReplayKind, string> = {
  group: '一维接敌与占位近似回放，与本场模拟结算严格同源；不含二维绕路、高地与走位躲箭。',
  mixed: '一维接敌与占位近似回放，按混编行序受击与换行，与本场混编结算严格同源。',
  one: '1v1 与群战共用一维接敌引擎（1 vs 1），胜负、剩余生命与接近/先手过程严格同源。',
};

export type BattleReplayProps =
  | {
      model: BattleReplayModel;
      unitById: Record<number, Unit>;
      fallback?: never;
    }
  | {
      fallback: { reason: string };
      model?: never;
      unitById?: never;
    };

export function BattleReplay(props: BattleReplayProps) {
  if (props.fallback) {
    return (
      <section className="battle-replay br-fallback" aria-label="战斗过程回放" data-t="battle-replay">
        <div className="br-head">
          <div className="br-head-left">
            <h3 className="duel-replay-title">战斗过程回放</h3>
            <span className="br-phase is-link" data-t="replay-phase">
              <Icon name="info" />
              已降级为静态对照
            </span>
          </div>
        </div>
        <div className="br-fallback-box" role="status" data-t="replay-fallback">
          <strong>当前对阵暂不绘制接近与接触过程动画</strong>
          <p>{props.fallback.reason}</p>
        </div>
      </section>
    );
  }
  return <BattleReplayStage model={props.model} unitById={props.unitById} />;
}

function BattleReplayStage({ model, unitById }: { model: BattleReplayModel; unitById: Record<number, Unit> }) {
  const [{ time, playing }, setPlayback] = useState({ time: 0, playing: false });
  const [speed, setSpeed] = useState(1);
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const duration = model.duration;
  useEffect(() => {
    if (!playing || duration <= 0) return;
    let last = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const delta = Math.min(Math.max(0, (now - last) / 1000), 0.1) * speed;
      last = now;
      setPlayback((prev) => {
        const next = Math.min(duration, prev.time + delta);
        return { time: next, playing: next < duration };
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, speed, duration]);

  const isCompact = isNarrow || isLargeAggregate(model);
  const snap = replayAt(model, time);
  const gapText =
    snap.gap <= 1e-6
      ? '0.0 格（已贴身）'
      : snap.silencedMinRange !== null
        ? `${snap.gap.toFixed(1)} 格（< ${formatHp(snap.silencedMinRange)} 格停火）`
        : `${snap.gap.toFixed(1)} 格`;

  const togglePlay = () =>
    setPlayback((prev) => ({
      time: prev.time >= duration ? 0 : prev.time,
      playing: !prev.playing,
    }));

  return (
    <section className="battle-replay" aria-label="战斗过程回放" data-t="battle-replay">
      <div className="br-head">
        <div className="br-head-left">
          <h3 className="duel-replay-title">战斗过程回放</h3>
          <span className={`br-phase is-${snap.phaseTone}`} data-t="replay-phase">
            <Icon name={snap.phaseIcon} />
            {snap.phaseLabel}
          </span>
        </div>
        <div className="br-meta">
          <span className="br-pill">
            阵线间距 <span className="num nw">{gapText}</span>
          </span>
          <span className="br-pill">
            时刻{' '}
            <span className="num nw" data-t="replay-time">
              {Number(snap.t.toFixed(2))} / {Number(duration.toFixed(2))} 秒
            </span>
          </span>
        </div>
      </div>

      <BattleStageSvg model={model} snap={snap} isCompact={isCompact} isNarrow={isNarrow} />
      <BattleReplaySides model={model} snap={snap} unitById={unitById} />
      <BattleReplayControls
        duration={duration}
        time={snap.t}
        playing={playing}
        speed={speed}
        phaseLabel={snap.phaseLabel}
        markers={model.markers}
        activeMarkerIndex={snap.activeMarkerIndex}
        onSeek={(nextT) => setPlayback({ time: nextT, playing: false })}
        onTogglePlay={togglePlay}
        onReplay={() => setPlayback({ time: 0, playing: true })}
        onSpeedChange={setSpeed}
      />

      <p className="br-note">{BOUNDARY_NOTES[model.kind]}</p>
    </section>
  );
}
