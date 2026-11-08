import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import {
  collectedLabel,
  formatRatioPercent,
  isLowSampleCount,
  patchLabel,
  presentWin,
  sampleHeading,
  type InsightsSnapshot,
} from '../../domain/ladderInsights';
import type { LadderViewId } from './LadderViewSwitch';
import { CivIcon } from '../../shared/ui/art';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';

export function LadderInsights({
  snapshot,
  view,
  hideLow,
  children,
}: {
  snapshot: InsightsSnapshot;
  view: LadderViewId;
  hideLow: boolean;
  children?: ReactNode;
}) {
  const [sort, setSort] = useState<'win' | 'sample'>('win');
  const share = useShareLink({ stateKey: snapshot.map.key });
  const threshold = snapshot.lowSample.threshold;
  const heading = sampleHeading(snapshot.sample);
  const pendingUnit = heading.includes('待确认');
  const rows = useMemo(() => {
    const visible = snapshot.rows.filter((row) => !hideLow || !isLowSampleCount(row.aggNMatches, threshold));
    return [...visible].sort((a, b) => (sort === 'sample' ? b.aggNMatches - a.aggNMatches : b.aggWinRate - a.aggWinRate));
  }, [hideLow, snapshot.rows, sort, threshold]);
  const hidden = snapshot.rows.filter((row) => isLowSampleCount(row.aggNMatches, threshold)).length;
  const patch = patchLabel(snapshot.patch);

  return (
    <>
      <div
        className="ladder-source"
        data-testid="ladder-source"
        data-fetched-at={snapshot.fetchedAt}
        data-slice-mode="rm1v1"
        data-slice-map={snapshot.map.key}
        data-sha256={snapshot.rawSha256}
        data-sample-unit={snapshot.sample.unit}
        data-sample-status={snapshot.sample.unitStatus}
      >
        <Icon name="database" />
        <div className="ladder-copy">
          <p className="ladder-source-facts" data-testid="ladder-source-facts">
            <span data-testid="ladder-source-name">{snapshot.source}</span>
            <span aria-hidden="true"> · </span>
            <span data-testid="ladder-source-mode" className="nw">
              {snapshot.ladder.label}
            </span>
            <span aria-hidden="true"> · </span>
            <span data-testid="ladder-source-map">{snapshot.map.zh}</span>
            <span aria-hidden="true"> · </span>
            <span data-testid="ladder-source-elo">Elo 未筛选</span>
            <span aria-hidden="true"> · </span>
            <span data-testid="ladder-source-patch">{patch}</span>
          </p>
          <p className="ladder-cutoff" data-testid="ladder-collected">
            <span className="nw">
              采集于 <span className="num">{collectedLabel(snapshot.fetchedAt)}</span>
            </span>
            <span className="ladder-fixed"> 采集时间，不是统计覆盖截止</span>
          </p>
          <p className="ladder-source-meta">
            <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
              {snapshot.source}
              <Icon name="external-link" />
              （外部）
            </a>
            <span className="ladder-fixed">
              {' '}
              指纹 <span className="num">{snapshot.rawSha256.slice(0, 12)}</span>
            </span>
          </p>
          <p className="ladder-query-url" data-testid="ladder-query-url">
            {snapshot.queryUrl}
          </p>
          <p className="ladder-insights-note" data-testid="ladder-sample-note">
            样本字段 {snapshot.sample.field}，单位是{pendingUnit ? '待确认' : heading}。{snapshot.sample.note}
          </p>
        </div>
      </div>
      {children}
      <p className="ladder-insights-note" data-testid="ladder-low-note">
        {snapshot.lowSample.note} 当前暂定阈值{' '}
        <span className="nw">
          <span className="num">{threshold}</span>
        </span>
        。
        {hidden > 0 ? (
          hideLow ? (
            <>
              {' '}
              已隐藏{' '}
              <span className="nw">
                <span className="num">{hidden}</span> 个
              </span>
              低样本。
            </>
          ) : (
            <>
              {' '}
              有{' '}
              <span className="nw">
                <span className="num">{hidden}</span> 个
              </span>
              低样本，表内已标出。
            </>
          )
        ) : (
          ' 这张图没有低于暂定阈值的文明。'
        )}
      </p>
      {view !== 'table' ? (
        <div className="ladder-empty" data-testid="ladder-insights-view-note">
          <Icon name="inbox" />
          <p className="ladder-empty-title">这张地图只有汇总表</p>
          <p>快照没有分层或分布所需的额外字段。不借用另一张地图的图。</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="ladder-empty" data-testid="ladder-empty">
          <Icon name="inbox" />
          <p className="ladder-empty-title">这张地图暂无数据</p>
          <p>没有可展示的文明行。不补 0，也不改用另一张地图。</p>
        </div>
      ) : (
        <div className="ladder-scroll">
          <table className="ladder-table" data-testid="ladder-insights-table">
            <caption className="ladder-sr">{snapshot.map.zh} RM 1v1 各文明胜率</caption>
            <thead>
              <tr>
                <th>文明</th>
                <th className="ladder-num">
                  <button type="button" className="ladder-sort" data-testid="ladder-sort-win" onClick={() => setSort('win')}>
                    胜率
                  </button>
                </th>
                <th className="ladder-num">选取率</th>
                <th className="ladder-num">
                  <button type="button" className="ladder-sort" data-testid="ladder-sort-sample" onClick={() => setSort('sample')}>
                    <span className="nw">{heading}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const civ = civByEn(row.civilization);
                const win = presentWin(row.aggWinRate, row.aggNMatches);
                const low = isLowSampleCount(row.aggNMatches, threshold);
                return (
                  <tr
                    key={row.civilization}
                    data-testid={`ladder-row-${row.civilization}`}
                    data-sample={row.aggNMatches}
                    data-low-sample={low ? 'true' : 'false'}
                    data-win-reliable={win.reliable ? 'true' : 'false'}
                  >
                    <td>
                      <span className="ladder-civ">
                        {civ && <CivIcon c={{ en: row.civilization }} />}
                        <span className="ladder-civ-name">
                          {civ ? (
                            <Link to={`/civ/${row.civilization}`}>
                              <span className="ladder-zh">{civ.zh}</span>
                            </Link>
                          ) : (
                            <span className="ladder-zh">{row.civilization}</span>
                          )}
                          <small className="ladder-en" lang="en">
                            {row.civilization}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td className="ladder-num">
                      <span className="num" data-testid={`ladder-win-${row.civilization}`}>
                        {win.text}
                      </span>
                    </td>
                    <td className="ladder-num">
                      <span className="num">{formatRatioPercent(row.aggPlayRate)}</span>
                    </td>
                    <td className="ladder-num">
                      <span className="num nw">{new Intl.NumberFormat('en-US').format(row.aggNMatches)}</span>
                      {low && <span className="ladder-few">低样本</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <aside className="ladder-side">
        <section className="ladder-card" data-testid="ladder-share">
          <h2>分享</h2>
          <button type="button" onClick={() => void share.copy(window.location.href)}>
            <Icon name={share.copied ? 'check' : 'link'} />
            复制当前链接
          </button>
          <p {...share.statusProps}>{share.status}</p>
          {share.manualLink && <input readOnly value={share.manualLink} aria-label="分享链接" onFocus={(event) => event.currentTarget.select()} />}
        </section>
      </aside>
      <p className="ladder-footer" data-testid="ladder-footer">
        <Icon name="info" />
        <span className="ladder-copy">本站保存静态快照，不实时抓取。胜率不是平衡建议。低样本线是本站暂定，不是来源规则，也不是平衡建议。</span>
      </p>
    </>
  );
}
