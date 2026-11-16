import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import {
  SOURCE_STATE_LABELS,
  clearHistoryQuery,
  filterCivilizationUpdates,
  overviewQueryError,
  setHistoryQuery,
  type CivUpdatesData,
} from '../../domain/civUpdates';
import { CivUpdatesLoading } from './CivUpdatePrimitives';
import './civ-updates.css';

export function CivUpdatesOverviewReader({ data }: { data: CivUpdatesData }) {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const error = overviewQueryError(query);
  const rows = filterCivilizationUpdates(data, query);
  const change = (key: string, value: string) => setQuery(setHistoryQuery(query, key, value), { replace: key === 'histQuery' });
  const returnPath = location.pathname + location.search;
  return (
    <>
      <p>按文明查阅来源章节与已收录历史；来源处理状态与历史覆盖分别说明收录情况，没有日志的文明仍可查看来源说明。</p>
      <div className="civ-update-filters civ-update-overview-filters">
        <label>
          搜索文明
          <input value={query.get('histQuery') ?? ''} placeholder="输入中文或英文名称" onChange={(e) => change('histQuery', e.target.value)} />
        </label>
        <label>
          历史覆盖
          <select value={query.get('histCoverage') ?? ''} onChange={(e) => change('histCoverage', e.target.value)}>
            <option value="">全部覆盖状态</option>
            <option value="partial">部分收录</option>
            <option value="none">尚未收录</option>
          </select>
        </label>
        <label>
          来源章节状态
          <select value={query.get('histSourceState') ?? ''} onChange={(e) => change('histSourceState', e.target.value)}>
            <option value="">全部来源状态</option>
            {Object.entries(SOURCE_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          文明排序
          <select value={query.get('histListOrder') ?? 'catalog'} onChange={(e) => change('histListOrder', e.target.value)}>
            <option value="catalog">目录顺序</option>
            <option value="name">文明中文名称</option>
          </select>
        </label>
        <button type="button" onClick={() => setQuery(clearHistoryQuery(query, 'overview'))}>
          清除文明筛选
        </button>
      </div>
      {error ? (
        <p role="alert" className="civ-update-warning">
          {error}
        </p>
      ) : (
        <>
          <p role="status">
            显示{' '}
            <span className="num nw">
              {rows.length} / {data.civilizations.length} 个文明
            </span>
          </p>
          {!rows.length ? (
            <p>没有符合筛选条件的文明，请调整或清除筛选。</p>
          ) : (
            <table className="civ-update-table" aria-label="文明来源与收录状态">
              <thead>
                <tr>
                  <th>文明</th>
                  <th>来源章节</th>
                  <th>历史覆盖</th>
                  <th>原文 / 去重事件 / 版本</th>
                  <th>入口</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((civ) => {
                  const detail = new URLSearchParams({ tab: 'history', histReturn: returnPath });
                  return (
                    <tr key={civ.civId} data-civ={civ.civId}>
                      <th scope="row">
                        {civ.nameZh}
                        <small>{civ.civId}</small>
                      </th>
                      <td>
                        <span className="civ-update-mobile-label">来源章节</span>
                        <span className={`civ-update-pill civ-update-state-${civ.sourceState}`}>{SOURCE_STATE_LABELS[civ.sourceState]}</span>
                      </td>
                      <td>
                        <span className="civ-update-mobile-label">历史覆盖</span>
                        <span className="civ-update-pill">{civ.historyCoverage === 'partial' ? '部分收录' : '尚未收录'}</span>
                      </td>
                      <td>
                        <span className="num nw">原文 {civ.sourceEntryCount ?? '未统计'}</span> ·{' '}
                        <span className="num nw">事件 {civ.eventCount ?? '未统计'}</span>
                        <small>
                          <span className="num nw">{civ.versionCount ?? '未统计'} 个版本</span> ·{' '}
                          <span className="num nw">{civ.unknownVersionEventCount ?? '未统计'} 个事件</span>未登记版本
                        </small>
                      </td>
                      <td>
                        <Link className="civ-update-open" aria-label={`查看${civ.nameZh}文明历史`} to={`/civ/${civ.civId}?${detail.toString()}#patches`}>
                          查看文明历史
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

export function CivUpdatesOverview() {
  const { data, error, retry } = useCivUpdates();
  return (
    <section className="civ-updates civ-updates-overview" aria-label="文明更新历史" data-testid="civ-updates-overview">
      <h2>文明更新历史</h2>
      {data ? <CivUpdatesOverviewReader data={data} /> : <CivUpdatesLoading error={error} retry={retry} />}
    </section>
  );
}
