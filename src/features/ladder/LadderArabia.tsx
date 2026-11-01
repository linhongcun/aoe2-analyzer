import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import beginnerNotes from '../../data/ladder-beginner.json';
import snapshotJson from '../../data/ladder-arabia-p162286.json';
import {
  firstSortDir,
  formatGames,
  formatPercent,
  friendliness,
  isLowSample,
  isPatchMismatch,
  snapshotPatchBuild,
  sortLadder,
  TIER_LABEL,
  TIER_RANK,
  toggleSort,
  viewBracket,
  type BeginnerNotes,
  type BracketKey,
  type LadderSnapshot,
  type SortDir,
  type SortKey,
} from '../../domain/ladder';
import { LadderMeta, LadderTiers } from './LadderBands';
import { LadderBracketGroup } from './LadderElo';
import type { LadderViewId } from './LadderViewSwitch';
import { CivIcon } from '../../shared/ui/art';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import { DATA_SOURCES } from '../../shared/utils/dataInfo';
import './ladder.css';

const snapshot = snapshotJson as LadderSnapshot;
const beginner = beginnerNotes as BeginnerNotes;
const SITE_BUILD = DATA_SOURCES.patch?.build ?? 0;

function useWideTable() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 960px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 960px)');
    const onChange = () => setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}

const TIERS = [
  { tier: 'easy' as const, gloss: '编辑认为上手门槛较低。' },
  { tier: 'mid' as const, gloss: '编辑认为接近常规开局。' },
  { tier: 'advanced' as const, gloss: '编辑认为需要更多练习。' },
  { tier: 'pending' as const, gloss: '理由还没写，不影响胜率。' },
];

/** 以 50% 为中线。±10 个百分点铺满半边，再大也停在端点，避免几乎看不见。 */
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

function SortMark({ active, dir }: { active: boolean; dir: SortDir }) {
  const name: IconName = !active ? 'arrow-up-down' : dir === 'asc' ? 'arrow-up' : 'arrow-down';
  return <Icon name={name} className={active ? 'ic ladder-sort-on' : 'ic ladder-sort-idle'} />;
}

export function LadderArabia({ view, elo, onSelect, hideLow }: { view: LadderViewId; elo: BracketKey; onSelect: (key: string) => void; hideLow: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'win', dir: firstSortDir('win') });
  const [open, setOpen] = useState<string | null>(null);
  const share = useShareLink({ stateKey: elo });
  const wide = useWideTable();
  const mismatch = isPatchMismatch(snapshot.patchNote, SITE_BUILD);
  const patchBuild = snapshotPatchBuild(snapshot.patchNote);
  const bracket = useMemo(() => viewBracket(snapshot, elo), [elo]);
  const rows = useMemo(() => {
    const visible = hideLow ? bracket.civs.filter((stat) => !isLowSample(stat.games)) : bracket.civs;
    const enriched = visible.map((stat) => {
      const civ = civByEn(stat.en);
      const note = friendliness(stat.en, beginner.entries);
      const bonusIdx = note.bonusIdx.filter((idx) => (civ ? idx < civ.bon.length : true));
      return {
        ...stat,
        zh: civ?.zh ?? stat.en,
        linked: Boolean(civ),
        bonuses: bonusIdx.map((idx) => ({ idx, text: civ?.bon[idx] })),
        tier: note.tier,
        tierRank: TIER_RANK[note.tier],
        reason: note.reason,
        nameKey: civ?.py || stat.en,
      };
    });
    return sortLadder(enriched, sort.key, sort.dir);
  }, [bracket.civs, hideLow, sort]);

  const expandedEn = open && bracket.civs.some((civ) => civ.en === open) ? open : null;

  const select = (key: string) => {
    onSelect(key);
    queueMicrotask(() => {
      const node = document.querySelector<HTMLButtonElement>(`[data-testid="ladder-bracket"][data-elo="${CSS.escape(key)}"]`);
      node?.focus();
      node?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    });
  };

  if (!snapshot.fetchedAt) {
    return (
      <div className="ladder-empty" data-testid="ladder-error">
        <Icon name="circle-alert" />
        <p className="ladder-empty-title">天梯快照没有读到</p>
        <p>页面不会显示任何胜率或出场率，以免给出不准确的数字。</p>
        <button type="button" onClick={() => window.location.reload()}>
          <Icon name="rotate-ccw" />
          重试
        </button>
        <a href="https://aoestats.io/maps/arabia/" target="_blank" rel="noopener noreferrer">
          aoestats.io
          <Icon name="external-link" />
          （外部）
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="ladder-context" data-testid="ladder-context">
        <span className="ladder-pill">
          <Icon name="map" />
          阿拉伯 <span lang="en">{snapshot.map}</span>
          <span className="ladder-fixed">固定</span>
        </span>
        <span className="ladder-pill">
          <Icon name="swords" />
          <span className="nw">1v1</span> 随机地图（RM）
        </span>
      </div>
      <LadderBracketGroup snapshot={snapshot} elo={elo} onSelect={select} />
      {/* 玩家界面只写 aoestats、统计日期和补丁号。Wayback 路径留在快照 JSON 与设计文档，不渲染到页面。 */}
      <div className="ladder-source" data-testid="ladder-source" data-cutoff={mismatch ? 'mismatch' : 'aligned'} data-fetched-at={snapshot.fetchedAt}>
        <Icon name="database" />
        <div className="ladder-copy">
          <p className="ladder-cutoff" data-testid="ladder-cutoff">
            {mismatch && patchBuild ? (
              <>
                <span className="ladder-cutoff-flag">非当前平衡</span>
                {' · '}
                <span className="nw">
                  统计截止 <span className="num">{snapshot.fetchedAt}</span>
                </span>
                {' · '}
                <span className="nw">
                  补丁 <span className="num">{patchBuild}</span> 与本站 DE <span className="num">{SITE_BUILD}</span> 不同
                </span>
              </>
            ) : (
              <>
                <span className="nw">
                  统计截止 <span className="num">{snapshot.fetchedAt}</span>
                </span>
                {patchBuild && (
                  <>
                    {' · '}
                    <span className="nw">
                      补丁 <span className="num">{patchBuild}</span>
                    </span>
                  </>
                )}
                {' · '}
                <span className="ladder-fixed">静态快照</span>
              </>
            )}
          </p>
          <p className="ladder-source-meta">
            <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
              {snapshot.source}
              <Icon name="external-link" />
              （外部）
            </a>
            。
            {!bracket.empty && (
              <span className="nw">
                本分段样本 <span className="num">{formatGames(bracket.games)}</span> 局
              </span>
            )}
          </p>
        </div>
      </div>
      {mismatch && patchBuild && (
        <p className="ladder-patch" data-testid="ladder-patch-note">
          <Icon name="triangle-alert" />
          <span className="ladder-copy">胜率可能未反映最新平衡改动。</span>
        </p>
      )}
      <div className="ladder-layout">
        <div className="ladder-main">
          {bracket.empty ? (
            <div className="ladder-empty" data-testid="ladder-empty">
              <Icon name="inbox" />
              <p className="ladder-empty-title">这个分段暂无数据</p>
              <p>当前快照里没有「{bracket.label}」分段的阿拉伯 1v1 统计。不推算，不补数。</p>
              <button type="button" onClick={() => select('all')}>
                <Icon name="rotate-ccw" />
                看「全部」分段
              </button>
            </div>
          ) : (
            <>
              {view === 'tiers' && <LadderTiers civs={rows} />}
              {view === 'meta' && <LadderMeta civs={rows} />}
              {view === 'table' && (
                <div className="ladder-table-card">
                  <table className="ladder-table" data-testid="ladder-table">
                    <caption className="ladder-sr">阿拉伯 1v1 {bracket.label} 各文明胜率</caption>
                    <colgroup>
                      <col className="ladder-col-name" />
                      <col className="ladder-col-win" />
                      <col className="ladder-col-play" />
                      {wide && <col className="ladder-col-games" />}
                      <col className="ladder-col-tier" />
                      <col className="ladder-col-trend" />
                      <col className="ladder-col-expand" />
                    </colgroup>
                    <thead>
                      <tr>
                        <SortHead id="name" label="文明" sort={sort} onSort={setSort} />
                        <SortHead id="win" label="胜率" sort={sort} onSort={setSort} numeric />
                        <SortHead id="play" label="出场率" sort={sort} onSort={setSort} numeric />
                        {wide && <SortHead id="games" label="样本局数" sort={sort} onSort={setSort} numeric className="ladder-games-col" />}
                        <SortHead id="tier" label="新手友好度" sort={sort} onSort={setSort} />
                        <th>走势</th>
                        <th className="ladder-expand-col">
                          <span className="ladder-sr">展开</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const expanded = expandedEn === row.en;
                        const toggle = () => setOpen(expanded ? null : row.en);
                        const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
                          if ((event.target as HTMLElement).closest('a, button')) return;
                          toggle();
                        };
                        return (
                          <Fragment key={row.en}>
                            <tr data-testid={`ladder-row-${row.en}`} data-games={row.games} onClick={onRowClick}>
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
                              <td className="ladder-num">
                                <span className="num">{formatPercent(row.playRate)}</span>
                              </td>
                              {wide && (
                                <td className="ladder-num ladder-games-col">
                                  <span className="num">{formatGames(row.games)}</span>
                                  {isLowSample(row.games) && <span className="ladder-few">样本少</span>}
                                </td>
                              )}
                              <td>
                                <span className="ladder-tier" data-tier={row.tier} data-testid={`ladder-tier-${row.en}`}>
                                  {TIER_LABEL[row.tier]}
                                </span>
                              </td>
                              <td data-testid={`ladder-trend-${row.en}`}>无走势</td>
                              <td className="ladder-expand-col">
                                <button
                                  type="button"
                                  className="ladder-expand"
                                  data-testid={`ladder-expand-${row.en}`}
                                  aria-expanded={expanded}
                                  aria-controls={expanded ? `ladder-reason-${row.en}` : undefined}
                                  aria-label={`${expanded ? '收起' : '展开'}${row.zh}`}
                                  onClick={toggle}
                                >
                                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
                                </button>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="ladder-reason-row">
                                <td colSpan={wide ? 7 : 6}>
                                  <div id={`ladder-reason-${row.en}`} data-testid={`ladder-reason-${row.en}`} className="ladder-reason">
                                    <p className="ladder-reason-games">
                                      样本局数 <span className="num">{formatGames(row.games)}</span>
                                      {isLowSample(row.games) && <span className="ladder-few">样本少</span>}
                                    </p>
                                    <p>
                                      <strong>{TIER_LABEL[row.tier]}</strong>
                                    </p>
                                    {row.tier === 'pending' ? <p>这个文明的新手友好度理由还没写，不影响上面的胜率数据。</p> : <p>{row.reason}</p>}
                                    <p className="ladder-reason-links">
                                      {row.bonuses.map((bonus) => (
                                        <Link key={bonus.idx} to={`/civ/${row.en}/bonus/${bonus.idx}`}>
                                          <Icon name="scroll" />
                                          {bonus.text ?? `加成 ${bonus.idx + 1}`}
                                        </Link>
                                      ))}
                                      <Link to="/bonuses">全部文明加成</Link>
                                      <Link to={`/civ/${row.en}`}>{row.zh}文明详情</Link>
                                    </p>
                                    {row.tier !== 'pending' && <p className="ladder-reason-note">编辑口径：理由只引用站内加成原文，不由胜率推导。</p>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <aside className="ladder-side">
          <section className="ladder-card ladder-wide-only">
            <h2>怎么读这张表</h2>
            <ul>
              <li>胜率：本分段里，该文明赢下的对局占比。</li>
              <li>出场率：本分段里，该文明被选中的对局占比。</li>
              <li>
                样本局数：计入上面两项的对局数。少于 <span className="num">300</span> 局时标「样本少」，数字仍照实显示。
              </li>
            </ul>
          </section>
          <section className="ladder-card ladder-wide-only">
            <h2>新手友好度</h2>
            <p>四档是本站编辑口径，不是官方推荐。</p>
            <ul className="ladder-legend">
              {TIERS.map((item) => (
                <li key={item.tier}>
                  <span className="ladder-tier" data-tier={item.tier}>
                    {TIER_LABEL[item.tier]}
                  </span>
                  <span>{item.gloss}</span>
                </li>
              ))}
            </ul>
          </section>
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
      </div>
      <p className="ladder-footer" data-testid="ladder-footer">
        <Icon name="info" />
        <span className="ladder-copy">
          数据来源：aoestats.io（阿拉伯 · RM <span className="nw">1v1</span>）·{' '}
          <span className="nw">
            统计更新 <span className="num">{snapshot.fetchedAt}</span>
          </span>
          。本站保存静态快照，不实时抓取、不自建统计；胜率不是平衡建议。新手友好度为本站编辑口径，不是官方推荐。
        </span>
      </p>
    </>
  );
}

function SortHead({
  id,
  label,
  sort,
  onSort,
  numeric,
  className,
}: {
  id: SortKey;
  label: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (next: { key: SortKey; dir: SortDir }) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.key === id;
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className ? `${className}${numeric ? ' ladder-num' : ''}` : numeric ? 'ladder-num' : undefined}
    >
      <button type="button" data-testid={`ladder-sort-${id}`} className="ladder-sort" onClick={() => onSort(toggleSort(sort, id))}>
        {id === 'tier' ? (
          <>
            <span className="ladder-tier-full">新手友好度</span>
            <span className="ladder-tier-short">友好度</span>
          </>
        ) : (
          label
        )}
        <SortMark active={active} dir={sort.dir} />
      </button>
    </th>
  );
}
