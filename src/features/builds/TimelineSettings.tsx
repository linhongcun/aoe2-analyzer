import { WALK } from '../../domain/buildSim';
import { simSupport } from '../../domain/simSupport';
import { CivPicker } from '../../shared/ui/CivPicker';
import type { TimelineQuery } from './timelineModel';

const PRESETS = [
  ['近', WALK.presets.near],
  ['中', WALK.presets.mid],
  ['远', WALK.presets.far],
] as const;

export function TimelineSettings({
  q,
  unsupported,
  noHouses,
  noNeedZh,
  set,
}: {
  q: TimelineQuery;
  unsupported: boolean;
  noHouses: boolean;
  noNeedZh: string;
  set: (key: string, value: string | null) => void;
}) {
  const dot = (on: boolean) => on && <span className="tl-dot" aria-label="非默认" />;
  return (
    <>
      <span className="tl-ctl">
        文明{' '}
        <CivPicker
          id="tlciv"
          label="文明"
          none="通用"
          isEnabled={simSupport}
          disabledGroup="暂不支持 · 文明加成尚未计入"
          disabledNote="文明加成尚未计入"
          value={unsupported ? '' : q.civ}
          onChange={(en) => set('civ', en || null)}
        />
        {dot(q.civ !== '')}
      </span>
      <div className="tl-settings-economy">
        <div className="tl-seg" role="radiogroup" aria-label="走路距离预设">
          {PRESETS.map(([zh, d]) => (
            <button key={d} type="button" role="radio" aria-checked={q.dist === d} aria-label={zh} onClick={() => set('dist', String(d))}>
              {zh} {d}
            </button>
          ))}
        </div>
        <label className="tl-ctl">
          走路距离
          <input
            type="range"
            min={WALK.min}
            max={WALK.max}
            value={q.dist}
            aria-label="走路距离"
            aria-valuemin={WALK.min}
            aria-valuemax={WALK.max}
            aria-valuenow={q.dist}
            onChange={(e) => set('dist', e.target.value)}
          />
          <span className="tl-num">{q.dist} 格</span>
          {dot(q.dist !== WALK.default)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={noHouses ? false : q.house}
          aria-disabled={noHouses || undefined}
          disabled={noHouses}
          className="tl-switch"
          data-t="auto-house"
          onClick={() => set('house', q.house ? '0' : '1')}
        >
          自动造房 <span className="tl-knob" aria-hidden />
          {!noHouses && dot(!q.house)}
        </button>
        {noHouses && (
          <span className="tl-no-need" data-t="no-need">
            {noNeedZh}
          </span>
        )}
        <span className="note">羊和浆果按近距离计{!q.house && ' · 关掉可以看到不造房会卡在哪'}</span>
      </div>
    </>
  );
}
