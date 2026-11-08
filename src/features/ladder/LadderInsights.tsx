import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import {
  collectedLabel,
  isLowSampleCount,
  LOW_SAMPLE_THRESHOLD,
  patchLabel,
  sampleHeading,
  visibleWin,
  type InsightsSnapshot,
} from '../../domain/ladderInsights';
import type { LadderViewId } from './LadderViewSwitch';
import { LadderMeta, LadderTiers } from './LadderBands';
import { CivIcon } from '../../shared/ui/art';
import { Icon } from '../../shared/ui/Icon';

/** 有数据时的表、图形和来源。没有新分享按钮。胜率低于阈值不渲染。 */
export function LadderInsights({
  snapshot,
  view,
  hideLow,
  onShowLow,
  children,
}: {
  snapshot: InsightsSnapshot;
  view: LadderViewId;
  hideLow: boolean;
  onShowLow: () => void;
  children?: ReactNode;
}) {
  const [sort, setSort] = useState<'win' | 'sample'>('win');
  const threshold = snapshot.lowSample.threshold || LOW_SAMPLE_THRESHOLD;
  const rows = useMemo(() => {
    const visible = snapshot.rows.filter((row) => !hideLow || !isLowSampleCount(row.aggNMatches, threshold));
    return [...visible].sort((a, b) => (sort === 'sample' ? b.aggNMatches - a.aggNMatches : b.aggWinRate - a.aggWinRate));
  }, [hideLow, snapshot.rows, sort, threshold]);
  const allHidden = snapshot.rows.length > 0 && rows.length === 0;
  const chartCivs = rows
    .filter((row) => visibleWin(row.aggWinRate, row.aggNMatches, threshold).showRate)
    .map((row) => {
      const civ = civByEn(row.civilization);
      return {
        en: row.civilization,
        zh: civ?.zh ?? row.civilization,
        linked: Boolean(civ),
        winRate: row.aggWinRate * 100,
        playRate: row.aggPlayRate * 100,
        games: row.aggNMatches,
      };
    });

  return (
    <>
      {children}
      <div
        className="ladder-source"
        data-testid="ladder-source"
        data-fetched-at={snapshot.fetchedAt}
        data-slice-mode="rm1v1"
        data-slice-map={snapshot.map.key}
        data-sha256={snapshot.rawSha256}
        data-sample-unit="unconfirmed"
      >
        <Icon name="database" />
        <div className="ladder-copy">
          <p className="ladder-source-line" data-testid="ladder-source-name">
            <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
              {snapshot.source}
              <Icon name="external-link" />
              （外部）
            </a>
          </p>
          <p className="ladder-source-line" data-testid="ladder-source-slice">
            <span data-testid="ladder-source-mode">{snapshot.ladder.label}</span>
            <span data-testid="ladder-source-map">{snapshot.map.zh}</span>
            <span data-testid="ladder-source-elo">Elo 未筛选</span>
            <span data-testid="ladder-source-patch">{patchLabel(snapshot.patch)}</span>
          </p>
          <p className="ladder-source-line" data-testid="ladder-collected">
            <span className="nw">
              采集于 <span className="num">{collectedLabel(snapshot.fetchedAt)}</span>
            </span>
          </p>
          <details className="ladder-source-details" data-testid="ladder-source-details">
            <summary>来源详情</summary>
            <p data-testid="ladder-sample-note">
              {sampleHeading()}。{snapshot.sample.note}
            </p>
            <p data-testid="ladder-query-url">{snapshot.queryUrl}</p>
            <p className="num" data-testid="ladder-sha">
              {snapshot.rawSha256}
            </p>
            <p>{snapshot.lowSample.note}</p>
          </details>
        </div>
      </div>
      {allHidden ? (
        <div className="ladder-empty" data-testid="ladder-low-hidden">
          <Icon name="inbox" />
          <p className="ladder-empty-title">当前结果均为低样本，已隐藏</p>
          <button type="button" data-testid="ladder-show-low" onClick={onShowLow}>
            显示低样本
          </button>
        </div>
      ) : view === 'tiers' ? (
        <LadderTiers civs={chartCivs} />
      ) : view === 'meta' ? (
        <LadderMeta civs={chartCivs} sampleUnit="待确认" />
      ) : (
        <div className="ladder-scroll">
          <table className="ladder-table" data-testid="ladder-insights-table">
            <caption className="ladder-sr">{snapshot.map.zh} RM 1v1</caption>
            <thead>
              <tr>
                <th>文明</th>
                <th className="ladder-num">
                  <button type="button" className="ladder-sort" data-testid="ladder-sort-win" onClick={() => setSort('win')}>
                    胜率
                  </button>
                </th>
                <th className="ladder-num">
                  <button type="button" className="ladder-sort" data-testid="ladder-sort-sample" onClick={() => setSort('sample')}>
                    样本
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const civ = civByEn(row.civilization);
                const win = visibleWin(row.aggWinRate, row.aggNMatches, threshold);
                return (
                  <tr
                    key={row.civilization}
                    className={win.low ? 'ladder-row-low' : undefined}
                    data-testid={`ladder-row-${row.civilization}`}
                    data-sample={row.aggNMatches}
                    data-low-sample={win.low ? 'true' : 'false'}
                    data-win-shown={win.showRate ? 'true' : 'false'}
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
                    <td className="ladder-num" data-testid={`ladder-win-${row.civilization}`}>
                      {win.showRate ? (
                        <span className="num">{win.text}</span>
                      ) : win.low ? (
                        <span className="ladder-few">样本不足</span>
                      ) : (
                        <span>{win.text}</span>
                      )}
                    </td>
                    <td className="ladder-num">
                      <span className="num nw">{new Intl.NumberFormat('en-US').format(row.aggNMatches)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((row) => isLowSampleCount(row.aggNMatches, threshold)) && (
        <p className="ladder-insights-note" data-testid="ladder-low-note">
          低于{' '}
          <span className="nw">
            <span className="num">{threshold}</span>
          </span>{' '}
          的可见项标「样本不足」，不显示胜率。
        </p>
      )}
      <p className="ladder-footer" data-testid="ladder-footer">
        <Icon name="info" />
        <span className="ladder-copy">静态快照，不是平衡建议。</span>
      </p>
    </>
  );
}
