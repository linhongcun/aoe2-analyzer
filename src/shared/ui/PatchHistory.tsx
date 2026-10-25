import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../data';
import { usePatchArchives } from '../../data/patchHistory';
import { archivedTarget, filterHistory, historyCoverage, historyFor, historyRangeError, type PatchArchive } from '../../domain/patchHistory';
import { PATCH_KINDS, patchTarget, type HistoryTarget, type PatchEntry } from '../../domain/patches';
import { Icon } from './Icon';
import { DetailPage } from './layout';
import './patchHistory.css';

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

export function HistoryEvidence({ entry }: { entry: PatchEntry }) {
  const verification =
    entry.verification === 'official'
      ? '已核对当时官方记录'
      : entry.verification === 'conflict' || entry.provenance === 'source-conflict'
        ? '来源冲突，尚未确认'
        : entry.verification === 'unverified'
          ? '未核实'
          : '既有来源记录，尚未完成逐条原文核对';
  return (
    <div className="history-evidence">
      <p className="note">{verification}</p>
      {entry.originalText && (
        <details>
          <summary>查看官方原文摘录</summary>
          <blockquote lang="en">
            <NumericText text={entry.originalText} />
          </blockquote>
        </details>
      )}
      <a href={entry.source} target="_blank" rel="noopener noreferrer">
        查看官方来源
      </a>
    </div>
  );
}

export function PatchHistory({ target }: { target: HistoryTarget }) {
  const state = usePatchArchives();
  if (!state.archives) return <HistoryLoading error={state.error} retry={state.retry} />;
  return <HistoryTimeline archives={state.archives} target={target} />;
}

function HistoryScope({ entry }: { entry: PatchEntry }) {
  const ids = [...new Set([...entry.civIds, ...(entry.affectedCivIds ?? [])])];
  return ids.length ? <p className="note">适用文明：{ids.map((id) => civByEn(id)?.zh ?? id).join('、')}</p> : null;
}

function HistoryTimeline({ archives, target }: { archives: PatchArchive[]; target: HistoryTarget }) {
  const [params, setParams] = useSearchParams();
  const records = historyFor(archives, target);
  const shown = filterHistory(records, params);
  const rangeError = historyRangeError(params);
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
  return (
    <section className="entity-history" data-testid="entity-history" aria-label="更新历史">
      <h2>更新历史</h2>
      <p className="note">首批收录 DE 正式版 {archives.map((patch) => patch.id).join('、')}，属于分批收录，版本之间仍有空缺。历史数值不代表当前数值。</p>
      <p className="note">直接改动与有明确依据的关联影响分别显示；数值加强或削弱不能直接证明整体对局强弱。文明关联未核实的全局改动，请在版本补丁中查看。</p>
      <details className="history-coverage">
        <summary>查看收录范围</summary>
        <ul>
          {archives.map((patch) => (
            <li key={patch.id}>
              <Link to={`/patches/${patch.id}`}>DE {patch.id}</Link>：{historyCoverage(patch)}
            </li>
          ))}
        </ul>
      </details>
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
      <button type="button" onClick={clear}>
        清除历史筛选
      </button>
      {rangeError && <p role="alert">{rangeError}</p>}
      <p role="status">
        显示{' '}
        <span className="num nw">
          {shown.length} / {records.length}
        </span>{' '}
        条记录
      </p>
      {!records.length ? <p>尚未收录该对象的更新历史；这不代表它从未改动。</p> : !shown.length && !rangeError ? <p>没有符合筛选条件的记录</p> : null}
      {versions.map((patch) => (
        <section className="history-version" key={patch.id} data-history-version={patch.id} aria-label={`DE ${patch.id} 更新历史`}>
          <h3>
            <Link to={`/patches/${patch.id}`}>
              DE Update <span className="num nw">{patch.id}</span>
            </Link>
          </h3>
          <p className="note">
            <time dateTime={patch.date} className="num nw">
              {patch.date}
            </time>{' '}
            · DE 正式版
          </p>
          {patch.announcedAt && patch.announcedAt !== patch.date && (
            <p className="note">
              公告日期：<time className="num nw">{patch.announcedAt}</time>
            </p>
          )}
          {shown
            .filter((record) => record.patch.id === patch.id)
            .map(({ entry, relation, relationNote }) => (
              <article className="history-entry" data-history-entry={entry.id} key={entry.id}>
                <div className="history-labels">
                  <span>{relation === 'direct' ? '直接改动' : '关联影响'}</span>
                  <span className={`history-kind-${entry.kind}`}>{entry.changeType === 'fix' ? '游戏修复' : PATCH_KINDS[entry.kind]}</span>
                  {entry.changeType === 'upgrade' && <span>升级科技</span>}
                </div>
                <h4>
                  <Link to={`${patchTarget(entry)}${entry.targetType === 'building' ? '' : '?tab=history'}`}>{entry.targetNameZh}</Link>
                </h4>
                <p>
                  <NumericText text={entry.summaryZh} />
                </p>
                {(entry.before !== undefined || entry.after !== undefined) && (
                  <dl className="history-values">
                    {entry.before !== undefined && (
                      <div>
                        <dt>改动前</dt>
                        <dd>
                          <NumericText text={entry.before} />
                        </dd>
                      </div>
                    )}
                    {entry.after !== undefined && (
                      <div>
                        <dt>改动后</dt>
                        <dd>
                          <NumericText text={entry.after} />
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {relationNote && <p className="note">{relationNote}</p>}
                {entry.scopeNote && (
                  <p className="note">
                    <NumericText text={entry.scopeNote} />
                  </p>
                )}
                <HistoryScope entry={entry} />
                {!!entry.relatedTargets?.length && (
                  <p className="history-related">
                    相关档案：
                    {entry.relatedTargets.map((related) => (
                      <Link
                        key={`${related.targetType}:${related.targetId}`}
                        to={`${patchTarget(related)}${related.targetType === 'building' ? '' : '?tab=history'}`}
                      >
                        {related.targetNameZh ?? String(related.targetId)}
                      </Link>
                    ))}
                  </p>
                )}
                <HistoryEvidence entry={entry} />
              </article>
            ))}
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
        <Link to="/patches">查看版本补丁</Link>
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
