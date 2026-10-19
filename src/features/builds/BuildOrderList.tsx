import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../data';
import type { ListMeta } from './listMeta';
import { visibleSources } from './sources';
import { Ban, ChartGantt } from 'lucide-react';
import { buildOrders } from '../../data/buildOrders';
import type { Phase } from '../../domain/buildOrder';
import { ListHead } from '../../shared/ui/layout';
import FeedbackLink from '../feedback/FeedbackLink';
import TimelineLoader from './TimelineLoader';

/** 推荐文明：加成已计入的排前面，未计入的沉底（各自保持原顺序） */
export const sortCivs = (civs: string[], off: string[] = []) => [...civs.filter((c) => !off.includes(c)), ...civs.filter((c) => off.includes(c))];

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
function useListMeta(): Record<string, ListMeta> | null {
  const [meta, setMeta] = useState<Record<string, ListMeta> | null>(null);
  useEffect(() => {
    let live = true;
    import('./listMeta').then((m) => live && setMeta(Object.fromEntries(buildOrders.map((b) => [b.id, m.listMeta(b)])))).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return meta;
}

export default function BuildOrderList() {
  const [sp] = useSearchParams();
  const meta = useListMeta();
  const bo = sp.get('bo');
  if (bo && buildOrders.some((b) => b.id === bo)) return <TimelineLoader />;
  const civName = (en: string) => civByEn(en)?.zh ?? en;
  const showOrder = (id: string) => {
    const group = document.getElementById(`bo-${id}`) as HTMLDetailsElement | null;
    if (!group) return;
    group.open = true;
    group.querySelector('summary')?.focus({ preventScroll: true });
    group.scrollIntoView({ block: 'start' });
  };
  return (
    <section className="pane" id="builds">
      <ListHead title="开局流程" desc={`${buildOrders.length} 个主流开局，点开看每一步卡在哪`} />
      <div className="tl-empty" data-t="timeline-empty">
        <div className="tl-empty-axis" aria-hidden />
        <p>选一个开局，看看你会卡在哪</p>
        <p className="note">快速定位下方开局详情，再打开时间线。</p>
        <div className="tl-empty-btns">
          {buildOrders.slice(0, 6).map((b) => (
            <button key={b.id} type="button" className="tl-chip" aria-controls={`bo-${b.id}`} onClick={() => showOrder(b.id)}>
              开局：{b.name.zh}
            </button>
          ))}
        </div>
      </div>
      {buildOrders.map((b) => (
        <details key={b.id} id={`bo-${b.id}`} className="bo" data-t="build-order">
          <summary>
            <b>{b.name.zh}</b> <span className="note">{b.name.en}</span> · {b.target.vils} {b.id === 'hybrid-fish-18' ? '村民' : '人口'}
            {AGE[b.target.age]}
            {meta?.[b.id]?.time && (
              <>
                {' · '}
                <span data-t="bo-time">{meta[b.id]!.time}</span>{' '}
              </>
            )}{' '}
            ·{' '}
            {b.civs.length
              ? sortCivs(b.civs, meta?.[b.id]?.unsupported).map((c, i) => {
                  const off = meta?.[b.id]?.unsupported.includes(c);
                  return (
                    <span
                      key={c}
                      data-t="bo-civ"
                      data-off={off ? '' : undefined}
                      className={off ? 'bo-civ-off' : undefined}
                      aria-disabled={off ? 'true' : undefined}
                    >
                      {i > 0 && '、'}
                      {civName(c)}
                      {off && (
                        <small className="tl-civ">
                          <Ban size={12} aria-hidden /> 加成未计入
                        </small>
                      )}
                    </span>
                  );
                })
              : '通用'}
            {meta?.[b.id]?.time && (
              <small className="tl-civ bo-basis" data-t="bo-basis">
                按通用计
              </small>
            )}
          </summary>
          <p>{b.summary}</p>
          <p>
            <Link to={`/builds?bo=${b.id}`} className="tl-open">
              <ChartGantt size={16} aria-hidden /> 看时间线
            </Link>
            {' · '}
            <Link to={`/builds?bo=${b.id}&view=practice`} className="bo-practice-open">
              专注跟练
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
