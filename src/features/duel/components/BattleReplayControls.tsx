import type { ReplayMarker } from '../../../domain/battleReplay';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from './radioKeyboard';

const SPEEDS = [0.5, 1, 2, 4] as const;

interface BattleReplayControlsProps {
  duration: number;
  time: number;
  playing: boolean;
  speed: number;
  phaseLabel: string;
  markers: readonly ReplayMarker[];
  activeMarkerIndex: number;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSpeedChange: (speed: number) => void;
}

export function BattleReplayControls({
  duration,
  time,
  playing,
  speed,
  phaseLabel,
  markers,
  activeMarkerIndex,
  onSeek,
  onTogglePlay,
  onReplay,
  onSpeedChange,
}: BattleReplayControlsProps) {
  const disabled = duration <= 0;
  return (
    <>
      {markers.length > 0 && (
        <div className="br-markers" role="group" aria-label="关键节点跳转">
          {markers.map((marker, idx) => {
            const active = idx === activeMarkerIndex;
            return (
              <button
                key={marker.id}
                type="button"
                className={`br-marker${active ? ' is-active' : ''}`}
                aria-current={active ? 'step' : undefined}
                data-t={`replay-marker-${marker.kind}`}
                onClick={() => onSeek(marker.t)}
              >
                {marker.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="br-scrubber">
        <input
          className="br-range"
          type="range"
          min={0}
          max={duration}
          step="any"
          value={time}
          disabled={disabled}
          aria-label="回放时间进度"
          aria-valuetext={`${time.toFixed(2)} 秒，${phaseLabel}`}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <div className="br-ticks" aria-hidden="true">
          {markers.map((marker, idx) => {
            const pct = duration > 0 ? Math.max(0, Math.min(100, (marker.t / duration) * 100)) : 0;
            return <span key={marker.id} className={`br-tick${idx === activeMarkerIndex ? ' is-active' : ''}`} style={{ left: `${pct}%` }} />;
          })}
        </div>
      </div>

      <div className="br-controls">
        <div className="br-actions">
          <button type="button" className="br-btn br-btn-pri" disabled={disabled} onClick={onTogglePlay}>
            <Icon name={playing ? 'pause' : 'play'} />
            {playing ? '暂停' : '播放'}
          </button>
          <button type="button" className="br-btn" disabled={disabled} onClick={onReplay}>
            <Icon name="rotate-ccw" />
            重播
          </button>
        </div>

        <div className="br-speed" role="radiogroup" aria-label="回放倍速" onKeyDown={radioKeyboard}>
          {SPEEDS.map((x) => {
            const checked = speed === x;
            return (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={checked ? 'is-active' : undefined}
                data-speed={x}
                onClick={() => onSpeedChange(x)}
              >
                {x}×
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
