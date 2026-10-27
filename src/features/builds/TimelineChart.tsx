import { Info, Landmark } from 'lucide-react';
import { timelineAxis, timelineBottleneckLayout } from '../../domain/buildTimelineLayout';
import type { BuildTimeline } from '../../domain/buildSim';
import { RES_ZH, mmss, type RowKey, type Seg, type TimelineView } from './timelineModel';
import './wei.css';

const ROWS: { key: RowKey; zh: string }[] = [
  { key: 'tc', zh: '城镇中心' },
  { key: 'food', zh: '食物' },
  { key: 'wood', zh: '木头' },
  { key: 'gold', zh: '金子' },
  { key: 'military', zh: '军事' },
];

export function TimelineChart({
  v,
  selectedStep,
  tl,
  showAssume,
  setShowAssume,
}: {
  v: TimelineView;
  selectedStep: number | null;
  tl: BuildTimeline;
  showAssume: boolean;
  setShowAssume: (value: boolean | ((old: boolean) => boolean)) => void;
}) {
  const { span, every, ticks, pct, width } = timelineAxis(v.end);
  const { tagged, merged } = timelineBottleneckLayout(v.bottlenecks, v.top);
  return (
    <div className="tl-card">
      <div className="tl-chart" role="list" aria-label="时间线">
        <div className="tl-axis" aria-hidden>
          {ticks.map((m) => (
            <span key={m} className={(m / every) % 2 ? 'odd' : ''} style={{ left: pct(m * 60) }}>
              {m}:00
            </span>
          ))}
        </div>
        {ROWS.map((r) => (
          <div className="tl-row" key={r.key} data-row={r.key}>
            <span className="tl-lab">{r.zh}</span>
            <div className="tl-track">
              {v.rows[r.key].map((s: Seg, i) => (
                <span
                  key={i}
                  role="listitem"
                  className={`tl-bar k-${s.kind}${s.step !== undefined && s.step === selectedStep ? ' is-sel' : ''}`}
                  style={{ left: pct(s.from), width: width(s.from, s.to) }}
                  title={`${s.label} · 约 ${mmss(s.from)}–${mmss(s.to)}`}
                  aria-label={`${r.zh} ${s.label} 约 ${mmss(s.from)} 到 ${mmss(s.to)}`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        ))}
        {!!tl.bonusVillagerEvents?.length && (
          <div className="tl-row" data-row="bonus">
            <span className="tl-lab">研究赠村</span>
            <div className="tl-track">
              {tl.bonusVillagerEvents.map((event) => (
                <span
                  key={event.tech}
                  className="tl-wei-point"
                  style={{ left: pct(event.at) }}
                  title={`经济研究完成 · 约${mmss(event.at)} · 赠送${event.count}个村民`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        )}
        <div className="tl-row" data-row="age">
          <span className="tl-lab">到达时代</span>
          <div className="tl-track">
            {v.ages.map((a) => (
              <span key={a.age}>
                <span
                  className="tl-band"
                  data-errband
                  data-early={a.errSec.early}
                  data-late={a.errSec.late}
                  style={{ left: pct(a.reachAt - a.errSec.early), width: width(a.reachAt - a.errSec.early, a.reachAt + a.errSec.late) }}
                />
                <span
                  className={`tl-age${Math.min(span, Math.max(0, a.reachAt)) / span > 0.7 ? ' is-end' : ''}`}
                  style={{ left: pct(a.reachAt) }}
                  data-age={a.age}
                  role="listitem"
                  aria-label={`到达${a.nameZh} 约 ${mmss(a.reachAt)}`}
                >
                  <Landmark size={14} aria-hidden />
                  <span className="tl-age-t" data-time>
                    {a.nameZh} · {a.vils} 村民 · 人口 {a.pop.used}/{a.pop.cap} · 约 {mmss(a.reachAt)}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="tl-blocks" aria-hidden>
          {merged.map((b, i) => (
            <span
              key={i}
              className="tl-block is-soft"
              data-anomaly={[...b.types].join(' ')}
              data-short-range={b.types.has('resource_short') ? '' : undefined}
              style={{ left: pct(b.from), width: width(b.from, b.to) }}
            />
          ))}
          {tagged && (
            <span
              className="tl-block is-top"
              data-anomaly={tagged.type}
              data-short-range={tagged.type === 'resource_short' ? '' : undefined}
              style={{ left: pct(tagged.from), width: width(tagged.from, tagged.to) }}
              title={tagged.reasonZh}
            >
              <span className="tl-block-tag">{tagged.label}</span>
            </span>
          )}
        </div>
      </div>
      {tl.bonusVillagerEvents && (
        <div className="tl-civ-note tl-wei-grants" role="group" aria-label="魏研究赠送村民">
          <p>
            城镇中心训练：
            <span className="nw" data-t="paid-villager-total" data-count={tl.villagerEvents?.length ?? 0}>
              {tl.villagerEvents?.length ?? 0}个村民
            </span>
            ；研究赠送：
            <span className="nw" data-t="bonus-villager-total">
              {tl.bonusVillagerEvents.reduce((n, event) => n + event.count, 0)}个村民
            </span>
          </p>
          {!!tl.bonusVillagerEvents.length && (
            <ul>
              {tl.bonusVillagerEvents.map((event) => (
                <li key={event.tech} data-t="bonus-villager-event" data-at={event.at} data-trigger={event.trigger} data-count={event.count}>
                  <span className="num nw">约{mmss(event.at)}</span> 经济研究完成，赠送<span className="nw">{event.count}个村民</span>； 人口
                  <span className="num nw">
                    {event.pop.used}/{event.pop.cap}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="tl-legend">
        {(['food', 'wood', 'gold'] as const).map((r) => (
          <span key={r}>
            <i className={`k-${r}`} />
            {RES_ZH[r]}
          </span>
        ))}
        <span>
          <i className="k-villager" />
          村民生产
        </span>
        <span>
          <i className="k-military" />
          军事
        </span>
        <span>
          <i className="k-ageup" />
          升级时代
        </span>
        <span>
          <i className="k-band" />
          估算范围
        </span>
        <span>
          <i className="k-bad" />
          卡点
        </span>
        <button type="button" className="tl-est" onClick={() => setShowAssume((x) => !x)} aria-expanded={showAssume}>
          <Info size={14} aria-hidden /> 估算
        </button>
      </div>
      {showAssume && (
        <div role="dialog" aria-label="估算说明" className="tl-assume">
          <ul>
            {tl.model.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <span className="note">模型版本 {tl.model.version}</span>
        </div>
      )}
    </div>
  );
}
