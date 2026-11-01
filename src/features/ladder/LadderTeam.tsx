import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import snapshotJson from '../../data/ladder-4v4-rm-e1200-1400-90d.json';
import {
  LOW_SAMPLE,
  firstSortDir,
  formatGames,
  formatPercent,
  formatWinDelta,
  isBalanceAligned,
  isPlayerSample,
  snapshotCutoff,
  sortLadder,
  toggleSort,
  visibleSourceLabel,
  type LadderCivStat,
  type LadderSnapshot,
  type SortDir,
  type SortKey,
} from '../../domain/ladder';
import { LadderMeta, LadderTiers } from './LadderBands';
import type { LadderViewId } from './LadderViewSwitch';
import { CivIcon } from '../../shared/ui/art';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import { DATA_SOURCES } from '../../shared/utils/dataInfo';

const snapshot = snapshotJson as LadderSnapshot;
const SITE_BUILD = DATA_SOURCES.patch?.build ?? 0;

type TeamSort = Exclude<SortKey, 'tier'>;
type TeamSortState = { key: SortKey; dir: SortDir };

interface TeamRow extends LadderCivStat {
  zh: string;
  linked: boolean;
  nameKey: string;
  tierRank: number;
}

function hasInterval(civs: readonly LadderCivStat[]): boolean {
  return civs.length > 0 && civs.every((civ) => typeof civ.ci95Low === 'number' && typeof civ.ci95High === 'number');
}

function sparkline(values: number[]): { points: string; tone: 'good' | 'bad' | 'muted' } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 36 : 2 + (index * 68) / (values.length - 1);
      const y = 22 - ((value - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const tone = last > first ? 'good' : last < first ? 'bad' : 'muted';
  return { points, tone };
}

export function LadderTeam({ view, hideLow, onArabia, children }: { view: LadderViewId; hideLow: boolean; onArabia: () => void; children?: ReactNode }) {
  const [sort, setSort] = useState<TeamSortState>({ key: 'win', dir: firstSortDir('win') });
  const share = useShareLink({ stateKey: '4v4' });
  const bracket = snapshot.brackets[0];
  const threshold = snapshot.lowSampleGames ?? LOW_SAMPLE;
  const cutoff = snapshotCutoff(snapshot);
  const aligned = isBalanceAligned(snapshot.patchNote, SITE_BUILD);
  const player = isPlayerSample(snapshot.sample?.unit);
  const showInterval = hasInterval(bracket?.civs ?? []);
  const rows = useMemo(() => {
    const civs = (bracket?.civs ?? []).filter((civ) => !hideLow || civ.games >= threshold);
    const enriched: TeamRow[] = civs.map((stat) => {
      const civ = civByEn(stat.en);
      return { ...stat, zh: civ?.zh ?? stat.en, linked: Boolean(civ), nameKey: civ?.py || stat.en, tierRank: 0 };
    });
    return sortLadder(enriched, sort.key, sort.dir);
  }, [bracket?.civs, hideLow, sort, threshold]);

  if (!snapshot.fetchedAt || !bracket || bracket.civs.length === 0) {
    return (
      <>
        {children}
        <div className="ladder-empty" data-testid="ladder-empty">
          <Icon name="inbox" />
          <p className="ladder-empty-title">这个切片暂无快照。不推算，不补数。</p>
          <button type="button" onClick={onArabia}>
            看阿拉伯 1v1
          </button>
        </div>
      </>
    );
  }

  const sampleUnit = player ? '人次' : '局';
  const sampleScope = player ? '本切片样本' : '本分段样本';

  return (
    <>
      <div className="ladder-source" data-testid="ladder-source" data-cutoff={aligned ? 'aligned' : 'mismatch'} data-fetched-at={snapshot.fetchedAt}>
        <Icon name="database" />
        <div className="ladder-copy">
          <p className="ladder-cutoff" data-testid="ladder-cutoff">
            {!aligned && <span className="ladder-cutoff-flag">非当前平衡</span>}
            {!aligned && ' · '}
            <span className="nw">
              统计截止 <span className="num">{cutoff}</span>
            </span>
            {!aligned && (
              <>
                {' · '}
                <span>
                  快照没有补丁号，与本站 DE <span className="num">{SITE_BUILD}</span> 不是同一份平衡
                </span>
              </>
            )}
          </p>
          <p className="ladder-source-meta">
            <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
              {visibleSourceLabel(snapshot.source)}
              <Icon name="external-link" />
              （外部）
            </a>
            。
            <span className="nw">
              {sampleScope} <span className="num">{formatGames(bracket.games)}</span> {sampleUnit}
            </span>
          </p>
        </div>
      </div>
      {!aligned && (
        <p className="ladder-patch" data-testid="ladder-patch-note">
          <Icon name="triangle-alert" />
          <span className="ladder-copy">胜率可能未反映最新平衡改动。</span>
        </p>
      )}
      {children}
      <p className="ladder-slice" data-testid="ladder-context">
        <span className="nw">4v4</span> 随机地图 · 全图
      </p>
      {view === 'tiers' && <LadderTiers civs={rows} />}
      {view === 'meta' && <LadderMeta civs={rows} />}
      {view === 'table' && (
        <div className="ladder-table-card">
          <table className="ladder-table ladder-table-team" data-testid="ladder-table">
            <caption className="ladder-sr">4v4 随机地图 1200–1400 近 90 天 全图 各文明胜率</caption>
            <thead>
              <tr>
                <th>排名</th>
                <TeamHead id="name" label="文明" sort={sort} onSort={setSort} />
                <TeamHead id="win" label="胜率" sort={sort} onSort={setSort} numeric />
                {showInterval && <th className="ladder-num">95% 区间</th>}
                <TeamHead id="play" label="出场率" sort={sort} onSort={setSort} numeric />
                <TeamHead id="games" label={player ? '出场' : '样本局数'} sort={sort} onSort={setSort} numeric />
                <th className="ladder-num">相对 50%</th>
                <th className="ladder-num">走势</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const delta = formatWinDelta(row.winRate);
                const series = (row.trend ?? []).map((point) => point.winRate).filter((value) => Number.isFinite(value));
                const low = row.games < threshold;
                return (
                  <tr key={row.en} data-testid={`ladder-row-${row.en}`} data-games={row.games}>
                    <td className="ladder-num">
                      <span className="num">{index + 1}</span>
                    </td>
                    <td>
                      <span className="ladder-civ">
                        {row.linked && <CivIcon c={{ en: row.en }} />}
                        <span className="ladder-civ-name">
                          {row.linked ? (
                            <Link to={`/civ/${row.en}`}>
                              <span className="ladder-zh">{row.zh}</span>
                            </Link>
                          ) : (
                            <span className="ladder-zh">{row.zh}</span>
                          )}
                          <small className="ladder-en" lang="en">
                            {row.en}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td className="ladder-num">
                      <span className="ladder-win">
                        <WinBar rate={row.winRate} />
                        <span className="num">{formatPercent(row.winRate)}</span>
                      </span>
                    </td>
                    {showInterval && (
                      <td className="ladder-num">
                        <span className="num nw">
                          {formatPercent(row.ci95Low ?? 0)}–{formatPercent(row.ci95High ?? 0)}
                        </span>
                      </td>
                    )}
                    <td className="ladder-num">
                      <span className="num">{formatPercent(row.playRate)}</span>
                    </td>
                    <td className="ladder-num">
                      <span className="num">{formatGames(row.games)}</span>
                      {!hideLow && low && <span className="ladder-few">样本少</span>}
                    </td>
                    <td className="ladder-num">
                      <span className={`num nw ladder-delta`} data-tone={delta.tone}>
                        {delta.text}
                      </span>
                    </td>
                    <td className="ladder-num" data-testid={`ladder-trend-${row.en}`}>
                      {series.length >= 2 && !low ? <Spark values={series} /> : '无走势'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="ladder-notes">
            <ul>
              <li>胜率：这一切片里，该文明赢下的对局占比。</li>
              <li>走势：这份静态快照里的胜率序列，不是实时。</li>
              <li>
                相对 <span className="nw">50%</span>：胜率减去 <span className="nw">50</span> 个百分点。
              </li>
            </ul>
            <div data-testid="ladder-share">
              <button type="button" onClick={() => void share.copy(window.location.href)}>
                <Icon name={share.copied ? 'check' : 'link'} />
                复制当前链接
              </button>
              <p {...share.statusProps}>{share.status}</p>
            </div>
          </div>
        </div>
      )}
      <p className="ladder-footer" data-testid="ladder-footer">
        <Icon name="info" />
        <span className="ladder-copy">
          数据来源：静态快照（<span className="nw">4v4</span> 随机地图 · 全图 · <span className="nw">1200–1400</span> · 近 <span className="nw">90 天</span>）·{' '}
          <span className="nw">
            统计更新 <span className="num">{cutoff}</span>
          </span>
          。本站保存静态快照，不实时抓取、不自建统计；胜率不是平衡建议。
        </span>
      </p>
    </>
  );
}

function Spark({ values }: { values: number[] }) {
  const line = sparkline(values);
  return (
    <svg className={`ladder-spark ladder-spark-${line.tone}`} width="72" height="24" viewBox="0 0 72 24" aria-hidden="true">
      <polyline points={line.points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function WinBar({ rate }: { rate: number }) {
  const cap = 10;
  const delta = Math.max(-cap, Math.min(cap, rate - 50));
  const width = (Math.abs(delta) / cap) * 50;
  const left = delta >= 0 ? 50 : 50 - width;
  return (
    <span className="ladder-bar" aria-hidden="true">
      <span className="ladder-bar-fill" style={{ left: `${left}%`, width: `${width}%` }} />
    </span>
  );
}

function TeamHead({
  id,
  label,
  sort,
  onSort,
  numeric,
}: {
  id: TeamSort;
  label: string;
  sort: TeamSortState;
  onSort: (next: TeamSortState) => void;
  numeric?: boolean;
}) {
  const active = sort.key === id;
  const name: IconName = !active ? 'arrow-up-down' : sort.dir === 'asc' ? 'arrow-up' : 'arrow-down';
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={numeric ? 'ladder-num' : undefined}>
      <button type="button" data-testid={`ladder-sort-${id}`} className="ladder-sort" onClick={() => onSort(toggleSort(sort, id))}>
        {label}
        <Icon name={name} className={active ? 'ic ladder-sort-on' : 'ic ladder-sort-idle'} />
      </button>
    </th>
  );
}
