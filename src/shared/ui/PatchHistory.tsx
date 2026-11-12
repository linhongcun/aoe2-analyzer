import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../data';
import { usePatchArchives } from '../../data/patchHistory';
import { archivedTarget, filterHistory, historyCoverage, historyFor, historyRangeError, type PatchArchive } from '../../domain/patchHistory';
import { PATCH_KINDS, patchTarget, statedCivIds, type HistoryTarget, type PatchEntry } from '../../domain/patches';
import { parseResourceChange } from '../../domain/resourceValue';
import { Icon } from './Icon';
import { ResourceValue } from './ResourceValue';
import { DetailPage } from './layout';
import './patchHistory.css';

/** 前后值之间的箭头是规定文案，不是界面图标。 */
const VALUE_ARROW = String.fromCodePoint(0x2192);
const FILTER_KEYS = ['histQuery', 'histKind', 'histRelation', 'histFrom', 'histTo', 'histOrder'] as const;

export const HISTORY_EMPTY = '尚未收录该对象的更新历史。这不代表它从未改动。';
export const HISTORY_CONFLICT_NOTE = '不按数值改写档案标记。';
export const HISTORY_FILTER_EMPTY = '没有符合筛选条件的记录';

/** Keep each number and unit together without forcing a whole cost/effect sentence onto one line. */
export function NumericText({ text }: { text: string }) {
  return text.split(/([+\-−]?\d+(?:[.,]\d+)*(?:\s*(?:%|秒|分钟|食物|黄金|木材|石料|生命值|点|格|金|木|石|HP))?)/g).map((part, index) =>
    /\d/.test(part) ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export function historyScopeText(ids: readonly string[]) {
  return `分批收录 DE 正式版 ${ids.join('、')}，版本之间有空缺，没有出现在这里不代表从未改动。历史数值不是当前数值；档案标记不按数值重新判定，也不能直接证明整体对局强弱。`;
}

export function historyDateLine(patch: Pick<PatchArchive, 'releaseDate' | 'publishedAt' | 'date'>) {
  if (patch.releaseDate) {
    const published = patch.publishedAt ? ` · 公告公开（北京时间） ${patch.publishedAt}` : '';
    return `官方发行日（公告当地日期） ${patch.releaseDate} · DE 正式版${published}`;
  }
  return `档案日期 ${patch.date}（不是已核对的官方发行日）`;
}

export function historyVerification(entry: Pick<PatchEntry, 'verification' | 'provenance'>) {
  if (entry.verification === 'official') return '已核对当时官方记录';
  if (entry.verification === 'conflict' || entry.provenance === 'source-conflict') return '来源冲突，尚未确认';
  if (entry.verification === 'unverified') return '未核实';
  return '既有来源记录，尚未完成逐条原文核对';
}

export function historyIsConflict(entry: Pick<PatchEntry, 'verification' | 'provenance'>) {
  return entry.verification === 'conflict' || entry.provenance === 'source-conflict';
}

function HistoryLoading({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? (
    <div role="alert">
      <p>更新历史加载失败，请重试。</p>
      <button type="button" onClick={retry}>
        重试
      </button>
    </div>
  ) : (
    <p role="status">正在加载更新历史</p>
  );
}

function HistoryDate({ patch }: { patch: PatchArchive }) {
  return (
    <p className="history-version-date">
      {historyDateLine(patch)
        .split(/(\d{4}-\d{2}-\d{2})/g)
        .map((part, index) =>
          /^\d{4}-\d{2}-\d{2}$/.test(part) ? (
            <time className="num nw" dateTime={part} key={index}>
              {part}
            </time>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </p>
  );
}

function HistoryValues({ entry }: { entry: PatchEntry }) {
  if (entry.before === undefined && entry.after === undefined) return null;
  const parsed = parseResourceChange(entry);
  return (
    <p className="history-values">
      {entry.before !== undefined && (
        <span>
          <span className="history-value-label">前</span>{' '}
          <b>{parsed?.before ? <ResourceValue segments={parsed.before} other={parsed.after} variant="history" /> : <NumericText text={entry.before} />}</b>
        </span>
      )}
      {entry.before !== undefined && entry.after !== undefined && (
        <span className="history-arrow" aria-hidden="true">
          {VALUE_ARROW}
        </span>
      )}
      {entry.after !== undefined && (
        <span>
          <span className="history-value-label">后</span>{' '}
          <b>{parsed?.after ? <ResourceValue segments={parsed.after} other={parsed.before} variant="history" /> : <NumericText text={entry.after} />}</b>
        </span>
      )}
    </p>
  );
}

export function PatchHistory({
  target,
  hostedHeading = false,
  labelRegion = hostedHeading,
}: {
  target: HistoryTarget;
  hostedHeading?: boolean;
  /** 宿主已经给出同名标题时不再给这块区域起同名。文明页沿用原来的区域名。 */
  labelRegion?: boolean;
}) {
  const state = usePatchArchives();
  if (!state.archives) return <HistoryLoading error={state.error} retry={state.retry} />;
  return <HistoryTimeline archives={state.archives} target={target} hostedHeading={hostedHeading} labelRegion={labelRegion} />;
}

function HistoryTimeline({
  archives,
  target,
  hostedHeading = false,
  labelRegion = hostedHeading,
}: {
  archives: PatchArchive[];
  target: HistoryTarget;
  hostedHeading?: boolean;
  labelRegion?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const records = historyFor(archives, target);
  const shown = filterHistory(records, params);
  const rangeError = historyRangeError(params);
  const filtersActive = FILTER_KEYS.some((key) => params.has(key));
  const [filtersOpen, setFiltersOpen] = useState(filtersActive);
  const [trackedFilters, setTrackedFilters] = useState(filtersActive);
  if (trackedFilters !== filtersActive) {
    setTrackedFilters(filtersActive);
    if (filtersActive) setFiltersOpen(true);
  }
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all' || (key === 'histOrder' && value === 'newest')) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const key of [...next.keys()]) if (key.startsWith('hist')) next.delete(key);
    setParams(next, { replace: true });
  };
  const versions = archives.filter((patch) => shown.some((record) => record.patch.id === patch.id));
  if (params.get('histOrder') === 'oldest') versions.reverse();
  const samePage = (item: { targetType: string; targetId: number | string }) =>
    item.targetType === target.targetType && String(item.targetId) === String(target.targetId);
  return (
    <section className="entity-history" data-testid="entity-history" {...(labelRegion ? { 'aria-label': '更新历史' } : {})}>
      <div className={hostedHeading ? 'history-head history-head-hosted' : 'history-head'}>
        {hostedHeading ? null : <h2>更新历史</h2>}
        <p className="history-count">
          已收录 <span className="num nw">{records.length} 条</span>
        </p>
      </div>
      <p className="history-intro">
        <NumericText text={historyScopeText(archives.map((patch) => patch.id))} />
      </p>
      <div className="history-folds">
        <details className="history-fold">
          <summary>查看收录范围</summary>
          <div className="history-fold-body">
            <ul>
              {archives.map((patch) => (
                <li key={patch.id}>
                  <Link to={`/patches/${patch.id}`}>
                    DE <span className="num nw">{patch.id}</span>
                  </Link>
                  ：{historyCoverage(patch)}
                </li>
              ))}
            </ul>
          </div>
        </details>
        <details className="history-fold" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
          <summary>筛选本页记录</summary>
          <div className="history-fold-body">
            <div className="history-filters">
              <label>
                搜索历史
                <input
                  type="search"
                  value={params.get('histQuery') ?? ''}
                  onChange={(event) => setFilter('histQuery', event.target.value)}
                  placeholder="名称、改动或版本号"
                />
              </label>
              <label>
                改动类型
                <select value={params.get('histKind') ?? 'all'} onChange={(event) => setFilter('histKind', event.target.value)}>
                  <option value="all">全部类型</option>
                  {Object.entries(PATCH_KINDS).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                影响关系
                <select value={params.get('histRelation') ?? 'all'} onChange={(event) => setFilter('histRelation', event.target.value)}>
                  <option value="all">全部关系</option>
                  <option value="direct">直接改动</option>
                  <option value="related">关联影响</option>
                </select>
              </label>
              <label>
                开始日期
                <input type="date" value={params.get('histFrom') ?? ''} onChange={(event) => setFilter('histFrom', event.target.value)} />
              </label>
              <label>
                结束日期
                <input type="date" value={params.get('histTo') ?? ''} onChange={(event) => setFilter('histTo', event.target.value)} />
              </label>
              <label>
                时间顺序
                <select value={params.get('histOrder') ?? 'newest'} onChange={(event) => setFilter('histOrder', event.target.value)}>
                  <option value="newest">由新到旧</option>
                  <option value="oldest">由旧到新</option>
                </select>
              </label>
            </div>
            {filtersActive && (
              <p className="history-status" role="status">
                显示 <span className="num nw">{`${shown.length} / ${records.length}`}</span> 条记录
              </p>
            )}
            <button className="history-clear" type="button" onClick={clear}>
              清除历史筛选
            </button>
          </div>
        </details>
      </div>
      {rangeError && <p role="alert">{rangeError}</p>}
      {!records.length ? (
        <p className="history-empty">{HISTORY_EMPTY}</p>
      ) : !shown.length && !rangeError ? (
        <p className="history-empty">{HISTORY_FILTER_EMPTY}</p>
      ) : null}
      {versions.map((patch) => (
        <section className="history-version" key={patch.id} data-history-version={patch.id} aria-label={`DE ${patch.id} 更新历史`}>
          <div className="history-version-head">
            <h3>
              <Link to={`/patches/${patch.id}`}>
                DE Update <span className="num nw">{patch.id}</span>
              </Link>
            </h3>
            <HistoryDate patch={patch} />
            {target.targetType === 'civ' && (
              <Link className="history-civ-link" to={`/patches/${patch.id}?civ=${encodeURIComponent(String(target.targetId))}`}>
                查看本版本的文明分组改动（含未写明适用文明的记录）
              </Link>
            )}
          </div>
          {shown
            .filter((record) => record.patch.id === patch.id)
            .map((record) => {
              const { entry, relation, relationNote } = record;
              const civs = statedCivIds(entry);
              const related = (entry.relatedTargets ?? []).filter((item) => !samePage(item));
              const showName = !(relation === 'direct' && samePage(entry));
              return (
                <article className="history-entry" data-history-entry={entry.id} data-history-relation={relation} key={entry.id}>
                  {showName && (
                    <p className="history-related-name">
                      {relation === 'related' ? '关联 · ' : null}
                      <Link to={`${patchTarget(entry)}?tab=history`}>{entry.targetNameZh}</Link>
                    </p>
                  )}
                  <div className="history-cluster">
                    <p className="history-summary">
                      <NumericText text={entry.summaryZh} />
                    </p>
                    <HistoryValues entry={entry} />
                  </div>
                  {relationNote && <p className="history-note">{relationNote}</p>}
                  {entry.scopeNote && (
                    <p className="history-note">
                      <NumericText text={entry.scopeNote} />
                    </p>
                  )}
                  <div className="history-meta">
                    {entry.changeType === 'fix' ? (
                      <span className="history-mark">游戏修复</span>
                    ) : (
                      <span className="history-mark">档案标记 {PATCH_KINDS[entry.kind]}</span>
                    )}
                    {relation === 'related' && <span className="history-mark">关联影响</span>}
                    <span>{historyVerification(entry)}</span>
                    <a className="history-source" href={entry.source} target="_blank" rel="noopener noreferrer">
                      查看官方来源
                    </a>
                    {civs.length > 0 && <span className="history-scope">适用：{civs.map((id) => civByEn(id)?.zh ?? id).join('、')}</span>}
                    {entry.originalText && (
                      <details className="history-original">
                        <summary>官方原文</summary>
                        <blockquote lang="en">
                          <NumericText text={entry.originalText} />
                        </blockquote>
                      </details>
                    )}
                    {related.length > 0 && (
                      <span className="history-related">
                        相关：
                        {related.map((item, index) => (
                          <Fragment key={`${item.targetType}:${item.targetId}`}>
                            {index > 0 ? ' · ' : null}
                            <Link to={`${patchTarget(item)}?tab=history`}>{item.targetNameZh ?? String(item.targetId)}</Link>
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </div>
                  {historyIsConflict(entry) && <p className="history-conflict">{HISTORY_CONFLICT_NOTE}</p>}
                </article>
              );
            })}
        </section>
      ))}
    </section>
  );
}

/** Missing catalog entries keep a real address rather than silently falling back to the current list. */
export function HistoricalEntityDetail({ target }: { target: HistoryTarget }) {
  const state = usePatchArchives();
  if (!state.archives)
    return (
      <section className="pane">
        <HistoryLoading error={state.error} retry={state.retry} />
      </section>
    );
  const archived = archivedTarget(state.archives, target);
  const records = historyFor(state.archives, target);
  const name = archived?.targetNameZh ?? records.find((record) => record.relation === 'direct')?.entry.targetNameZh;
  if (!name)
    return (
      <section className="pane">
        <h1>尚未收录该对象的更新历史</h1>
        <p>当前目录和历史档案均未找到此项。</p>
        <Link to="/patches">查看更新历史</Link>
      </section>
    );
  return (
    <DetailPage
      id="historical-entity"
      crumb={name}
      title={name}
      en={archived?.nameEn ?? ''}
      icon={<Icon name="database" />}
      tags={<span className="tag">历史档案</span>}
      initialTab="history"
      showTabs={false}
      tabs={[
        {
          key: 'history',
          label: '更新历史',
          content: (
            <>
              <p>历史档案，当前数据目录未收录</p>
              <p className="note">{archived?.status === 'upgrade' ? '这是单位升级科技的历史身份。' : '此处保留旧内容的历史身份与当时记录。'}</p>
              <HistoryTimeline archives={state.archives} target={target} />
            </>
          ),
        },
      ]}
    />
  );
}
