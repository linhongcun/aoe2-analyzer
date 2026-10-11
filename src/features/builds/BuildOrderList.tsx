import { Link, useSearchParams } from 'react-router-dom';
import { visibleSources } from './sources';
import { ChartGantt } from 'lucide-react';
import { buildOrders } from '../../data/buildOrders';
import type { Phase } from '../../domain/buildOrder';
import { ListHead } from '../../shared/ui/layout';
import FeedbackLink from '../feedback/FeedbackLink';
import TimelineLoader from './TimelineLoader';
import { PENDING_FIX, PENDING_LABEL, keptTime } from './pendingFix';

const PHASE: Record<Phase, string> = {
  'feudal-click': '点封建',
  feudal: '到达封建',
  'castle-click': '点城堡',
  castle: '到达城堡',
  'imperial-click': '点帝王',
  imperial: '到达帝王',
};
const AGE = ['', '黑暗', '封建', '城堡', '帝王'];

/** #/builds：开局库只读列表（时间轴视图见 #2/#3） */
export default function BuildOrderList() {
  const [sp] = useSearchParams();
  const bo = sp.get('bo');
  if (bo && buildOrders.some((b) => b.id === bo)) return <TimelineLoader />;
  return (
    <section className="pane" id="builds">
      <ListHead title="开局流程" desc={`${buildOrders.length} 个主流开局，点开看每一步卡在哪`} />
      <div className="tl-empty" data-t="timeline-empty">
        <div className="tl-empty-axis" aria-hidden />
        <p>选一个开局，看看你会卡在哪</p>
        <div className="tl-empty-btns">
          {buildOrders.slice(0, 6).map((b) => (
            <Link key={b.id} to={`/builds?bo=${b.id}`} role="button" className="tl-chip">
              开局：{b.name.zh}
            </Link>
          ))}
        </div>
      </div>
      {buildOrders.map((b) => (
        <details key={b.id} className="bo" data-t="build-order">
          <summary>
            <b>{b.name.zh}</b> <span className="note">{b.name.en}</span> · {b.target.vils} 人口{AGE[b.target.age]}
            {PENDING_FIX[b.id] ? (
              <span className="is-pending" data-pending>
                （{keptTime(b.target.time) ? `${keptTime(b.target.time)}、` : ''}— 城堡 <small className="pending-note">{PENDING_LABEL}</small>）
              </span>
            ) : b.target.time ? (
              `（${b.target.time}）`
            ) : (
              ''
            )}{' '}
            · {b.civs.length ? b.civs.join('、') : '通用'}
          </summary>
          <p>{b.summary}</p>
          <p>
            <Link to={`/builds?bo=${b.id}`} className="tl-open">
              <ChartGantt size={16} aria-hidden /> 看时间线
            </Link>
          </p>
          <ol className="bo-steps">
            {b.steps.map((s, i) => (
              <li key={i}>
                <span className="bo-vils">{s.vils}</span>
                {s.phase && <span className="tag">{PHASE[s.phase]}</span>} {s.note}
              </li>
            ))}
          </ol>
          {visibleSources(b.sources).length > 0 ? (
            <p className="note" data-t="bo-source">
              来源：
              {visibleSources(b.sources).map((s, i) => (
                <span key={i}>
                  {i > 0 && '；'}
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                  {s.section ? `（${s.section}）` : ''}
                </span>
              ))}
              。{b.license}
            </p>
          ) : (
            b.license && <p className="note">{b.license}</p>
          )}
        </details>
      ))}
      <p>
        <FeedbackLink kind="data" />
      </p>
    </section>
  );
}
