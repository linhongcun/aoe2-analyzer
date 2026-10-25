import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '../../data/hooks';
import type { BuildOrder } from '../../domain/buildOrder';
import type { BuildTimeline } from '../../domain/buildSim';
import { RowSegs } from './RowSegs';
import { stepEntities, villagerGroups } from './timelineFollowups';
import { RES_ZH, ROW_SEG_MAX, mmss, noteParts, prereqDetail, rowSegments, rowTime, segLabel, type TimelineQuery, type TimelineView } from './timelineModel';

const fmtCost = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function TimelineSteps({
  bo,
  tl,
  v,
  q,
  noHouses,
  noNeedZh,
  hint,
  hideHint,
  nodeLabel,
  roam,
  jump,
  set,
}: {
  bo: BuildOrder;
  tl: BuildTimeline;
  v: TimelineView;
  q: TimelineQuery;
  noHouses: boolean;
  noNeedZh: string;
  hint: string | null;
  hideHint: () => void;
  nodeLabel: (index: number) => string;
  roam: (event: KeyboardEvent<HTMLButtonElement>, index: number, chart?: boolean) => void;
  jump: (index: number) => void;
  set: (key: string, value: string | null) => void;
}) {
  const core = useCore();
  const bad = new Set(tl.steps.filter((s) => s.anomalies.length).map((s) => s.index));
  const sel = q.step !== null ? tl.steps[q.step] : undefined;
  const groups = villagerGroups(tl);
  return (
    <>
      <details className="tl-extra-controls">
        <summary>时间线操作与村民生产</summary>
        <nav className="tl-node-list" aria-label="时间线节点">
          {bo.steps.map((_, i) => (
            <button
              type="button"
              key={i}
              data-node={i}
              aria-label={nodeLabel(i)}
              aria-pressed={q.step === i}
              onKeyDown={(e) => roam(e, i, true)}
              onClick={() => jump(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <div className="tl-villagers" aria-label="村民生产分段">
          {groups
            .filter((g) => g.length > 1)
            .map((g) => (
              <details key={g[0]!.from}>
                <summary>
                  村民 <span className="nw">×{g.length}</span> ·{' '}
                  <span className="nw">
                    约 {mmss(g[0]!.from)}–{mmss(g.at(-1)!.to)}
                  </span>
                </summary>
                <ol>
                  {g.map((event, i) => (
                    <li key={event.from}>
                      <button type="button" onClick={() => jump(event.step)}>
                        村民 {i + 1} ·{' '}
                        <span className="nw">
                          约 {mmss(event.from)}–{mmss(event.to)}
                        </span>{' '}
                        · 第 {event.step + 1} 步
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
        </div>
      </details>
      <ol className="tl-steps" aria-label="步骤">
        {bo.steps.map((st, i) => {
          const s = tl.steps[i]!;
          const open = q.step === i;
          return (
            <li
              key={i}
              data-step={i}
              data-start-at={s.startAt}
              data-row-at={rowTime(s)}
              className={`${bad.has(i) ? 'is-bad' : ''}${open ? ' is-sel' : ''}`}
              aria-selected={open}
            >
              <button
                type="button"
                className="tl-step"
                onKeyDown={(e) => roam(e, i)}
                aria-label={nodeLabel(i)}
                onClick={() => set('step', open ? null : String(i + 1))}
                aria-expanded={open}
              >
                <span className="tl-num i">{i + 1}</span>
                <span className="tl-num t" data-time>
                  约 {mmss(rowTime(s))}
                </span>
                <span className="n">
                  {noteParts(st.note ?? '', st.houseText, noHouses).map((x, k) =>
                    x.skip ? (
                      <span key={k} className="tl-skip" data-t="house-skip">
                        <s>{x.text}</s>
                        <span className="tl-no-need">{noNeedZh}</span>
                      </span>
                    ) : (
                      <span key={k}>{x.text}</span>
                    ),
                  )}
                  {st.siteAdded && (
                    <span className="tl-site-added" data-t="site-added">
                      本站补充，来源未列
                    </span>
                  )}
                </span>
                {s.anomalies.length > 0 && (
                  <span className="r">
                    <RowSegs segs={rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined)} tOut={v.tOut} />
                  </span>
                )}
              </button>
              {open && sel && (
                <div role="region" aria-label="步骤详情" className="tl-detail">
                  {hint && (
                    <div className="tl-followup" role="status">
                      <span>{hint}</span>
                      <button
                        type="button"
                        onClick={() => {
                          hideHint();
                        }}
                      >
                        知道了
                      </button>
                    </div>
                  )}
                  <div className="tl-entities">
                    {stepEntities(st).map((ref) => (
                      <Link className="ulink" key={`${ref.kind}-${ref.id}`} to={`/${ref.kind}/${ref.id}`}>
                        {(ref.kind === 'unit' ? core?.unitById[ref.id] : ref.kind === 'tech' ? core?.techById[ref.id] : core?.buildingById[ref.id])?.zh ??
                          `${ref.kind === 'unit' ? '单位' : ref.kind === 'tech' ? '科技' : '建筑'} ${ref.id}`}
                      </Link>
                    ))}
                  </div>
                  {rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined).length > ROW_SEG_MAX && (
                    <span className="note" data-t="seg-all">
                      {rowSegments(s.anomalies, s.researchAt !== undefined ? { from: s.startAt, to: s.researchAt } : undefined)
                        .map((x) => segLabel(x, v.tOut))
                        .join('；')}
                    </span>
                  )}
                  {s.anomalies
                    .filter((a) => a.type === 'prereq_wait')
                    .map((a, k) => (
                      <span key={'pre' + k} className="note" data-t="prereq-detail">
                        {prereqDetail(a)}
                      </span>
                    ))}
                  {sel.cost && (
                    <span data-t="step-cost">
                      费用{' '}
                      {(['food', 'wood', 'gold', 'stone'] as const)
                        .filter((r) => sel.cost![r] > 0)
                        .map((r, i) => (
                          <span key={r}>
                            {i > 0 && ' · '}
                            {RES_ZH[r]} <b className="tl-num">{fmtCost(sel.cost![r])}</b>
                          </span>
                        ))}
                    </span>
                  )}
                  {(['food', 'wood', 'gold', 'stone'] as const).map((r) => (
                    <span key={r}>
                      {RES_ZH[r]} <b className="tl-num">{Math.round(sel.stock[r])}</b>
                    </span>
                  ))}
                  <span>
                    人口{' '}
                    <b className="tl-num">
                      {sel.pop.used}/{sel.pop.cap}
                    </b>
                  </span>
                  <span>
                    村民 食 {sel.villagers.food} · 木 {sel.villagers.wood} · 金 {sel.villagers.gold} · 石 {sel.villagers.stone} · 建造 {sel.villagers.build}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
