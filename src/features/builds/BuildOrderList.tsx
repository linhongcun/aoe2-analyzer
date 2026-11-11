import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../data';
import type { ListMeta } from './listMeta';
import { Ban } from 'lucide-react';
import { buildOrders } from '../../data/buildOrders';
import { Breadcrumbs } from '../../shared/ui/layout';
import FeedbackLink from '../../shared/ui/FeedbackLink';
import TimelineLoader from './TimelineLoader';
import { BuildContext } from './BuildContext';
import { displayBuildMap } from './buildMapLabel';
import { readBuildsFocus } from './buildsFocus';
import './catalog.css';

/** 资料标注适用文明：加成已计入的排前面，未计入的沉底（各自保持原顺序） */
export const sortCivs = (civs: string[], off: string[] = []) => [...civs.filter((c) => !off.includes(c)), ...civs.filter((c) => off.includes(c))];

const AGE = ['', '黑暗', '封建', '城堡', '帝王'];

const RELATED = [
  ['先看懂一局的目标与角色', '/game-guide'],
  ['赛后整理事实与下局目标', '/match-review'],
  ['先从教程与战役认识游戏', '/campaigns'],
  ['查看本体包含和可选内容', '/content-guide'],
] as const;

/** #/builds：开局目录。到达时间按通用默认参数现算，不读开局 JSON 里手写的预计时间。 */
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
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const meta = useListMeta();
  const bo = sp.get('bo');
  // issue 772：非法 bo 静默退回列表时给出提示并清掉坏参数，避免再次分享还是坏链接。
  // 地址栏被 replace 成干净地址后，提示靠 history state 保留一次；换到别的链接即清除。
  // 只删非法 bo，其它查询保留。不要改成地图页那种留下无效参数、持续提示的做法。
  const currentInvalid = !!bo && !buildOrders.some((b) => b.id === bo);
  const stateInvalidBo = (location.state as { buildsInvalidBo?: boolean } | null)?.buildsInvalidBo ?? false;
  const invalidBo = currentInvalid || stateInvalidBo;
  const focusId = readBuildsFocus(location.state);
  useEffect(() => {
    if (!currentInvalid) return;
    const next = new URLSearchParams(sp);
    next.delete('bo');
    setSp(next, { replace: true, state: { buildsInvalidBo: true } });
  }, [currentInvalid, sp, setSp]);
  useEffect(() => {
    if (!focusId || currentInvalid || typeof document === 'undefined') return;
    if (!buildOrders.some((b) => b.id === focusId)) return;
    document.getElementById(`bo-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [focusId, meta, currentInvalid]);
  if (bo && buildOrders.some((b) => b.id === bo))
    return (
      <>
        <BuildContext params={sp} />
        <TimelineLoader />
      </>
    );
  const orderPath = (id: string, practice = false) => {
    const next = new URLSearchParams(sp);
    next.set('bo', id);
    next.delete('step');
    if (practice) next.set('view', 'practice');
    else next.delete('view');
    return `/builds?${next}`;
  };
  const civName = (en: string) => civByEn(en)?.zh ?? en;
  const scale = (id: string, vils: number, age: number) => `${vils} ${id === 'hybrid-fish-18' ? '村民' : '人口'}${AGE[age] ?? ''}`;
  return (
    <section className="pane" id="builds">
      <Breadcrumbs />
      <header className="bo-catalog-head">
        <h1 className="page-heading bo-catalog-title">开局流程</h1>
        <p className="bo-catalog-lede">比较并选择一套开局，再查看时间线或专注跟练。</p>
        <p className="bo-catalog-meta">
          <span className="nw">
            <span className="num">{buildOrders.length}</span> 个主流开局
          </span>
          <span>
            看不懂 FC、drush 等用语？
            <Link className="bo-glossary-link" to="/glossary">
              查看术语与缩写
            </Link>
          </span>
        </p>
      </header>
      {invalidBo && (
        <p className="note" role="status">
          链接中的开局无效，已显示全部开局。
        </p>
      )}
      <BuildContext params={sp} />
      <ul className="bo-catalog-list">
        {buildOrders.map((b) => {
          const time = meta?.[b.id]?.time;
          const civs = sortCivs(b.civs, meta?.[b.id]?.unsupported);
          return (
            <li key={b.id} id={`bo-${b.id}`} className="bo-catalog-item" data-t="build-order">
              <div>
                <h2 className="bo-catalog-name">
                  <Link to={orderPath(b.id)}>{b.name.zh}</Link>
                </h2>
                <p className="bo-catalog-facts">
                  <span className="bo-catalog-en">{b.name.en}</span>
                  <span className="bo-catalog-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="num nw">{scale(b.id, b.target.vils, b.target.age)}</span>
                  <span className="bo-catalog-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>{displayBuildMap(b.map)}</span>
                  {time && (
                    <>
                      <span className="bo-catalog-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="num nw bo-catalog-time" data-t="bo-time">
                        {time}
                      </span>
                      <span className="bo-catalog-basis">
                        ，<span data-t="bo-basis">按通用计</span>
                      </span>
                    </>
                  )}
                </p>
                <p className="bo-catalog-summary">{b.summary}</p>
                <p className="bo-catalog-civs">
                  <span className="bo-catalog-caption">资料标注适用文明</span>
                  {civs.length
                    ? civs.map((c, i) => {
                        const off = meta?.[b.id]?.unsupported?.includes(c);
                        return (
                          <span key={c}>
                            {i > 0 && (
                              <span className="bo-catalog-sep" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <Link
                              className={off ? 'bo-catalog-civ is-off' : 'bo-catalog-civ'}
                              to={`/civ/${encodeURIComponent(c)}`}
                              data-t="bo-civ"
                              data-off={off ? '' : undefined}
                            >
                              {civName(c)}
                              {off && (
                                <small className="tl-civ">
                                  <Ban size={12} aria-hidden /> 加成未计入
                                </small>
                              )}
                            </Link>
                          </span>
                        );
                      })
                    : '通用'}
                </p>
              </div>
              <div className="bo-catalog-actions">
                <Link className="bo-catalog-go" to={orderPath(b.id)}>
                  查看时间线
                </Link>
                <Link className="bo-catalog-practice" to={orderPath(b.id, true)}>
                  专注跟练
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <section className="bo-related" aria-labelledby="builds-related">
        <h2 id="builds-related">相关入门</h2>
        <ul>
          {RELATED.map(([label, href]) => (
            <li key={href}>
              <Link to={href}>{label}</Link>
            </li>
          ))}
        </ul>
      </section>
      <p>
        <FeedbackLink kind="data" />
      </p>
    </section>
  );
}
