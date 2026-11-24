import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { trainingUnitAge } from '../../../domain/availabilityAge';
import { AGE_ZH } from '../../../domain/ratings';
import { makeSimContext } from '../../../domain/simulator';
import type { Tech, Trees, Unit } from '../../../domain/types';
import {
  buildCivRankDuelHref,
  buildUnitCivRank,
  DUEL_BUDGET_DEFAULT,
  filterUnitCivRankRows,
  NO_NORMAL_ATTACK_REASON,
  RANK_COL_META_BY_KEY,
  RANK_METRIC_COLS,
  sortUnitCivRankRows,
  unitRankAgeBounds,
  unitRankCombatKind,
  type RankMetricCol,
  type RankSortCol,
  type SortDir,
  type UnitCivRankRow,
} from '../../../domain/unitCivRank';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from '../../../shared/ui/radioKeyboard';
import { SearchInput } from '../../../shared/ui/widgets';
import { UnitCivRankTable } from './UnitCivRankTable';
import './unit-civ-rank.css';

const COLLAPSE_LIMIT = 12;

function useNarrowTable(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 720px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 720px)');
    const sync = () => setNarrow(mql.matches);
    sync();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
    return undefined;
  }, []);
  return narrow;
}

export function AvailableCivsHeader({ count, total, showRankLink }: { count: number; total: number; showRankLink: boolean }) {
  const loc = useLocation();
  const href = `#${loc.pathname}${loc.search}`;
  return (
    <div className="ucr-avail-head">
      <h3>
        可用文明（<span className="num nw">{count}</span>/<span className="num nw">{total}</span>）
      </h3>
      {showRankLink && (
        <a
          href={href}
          className="ucr-jump-btn"
          onClick={(event) => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              document.getElementById('unit-civ-rank')?.scrollIntoView({ block: 'start' });
            }
          }}
        >
          <span>看各文明满科技对照</span>
          <Icon name="arrow-right" />
        </a>
      )}
    </div>
  );
}

interface UnitCivRankProps {
  unit: Unit;
  core: { techs: Tech[] };
  trees: Trees | null;
  treeWaiting: ReactNode;
}

export function UnitCivRank({ unit, core, trees, treeWaiting }: UnitCivRankProps) {
  const loc = useLocation();
  const narrow = useNarrowTable();
  const initialCombat = unitRankCombatKind(unit);
  const initialSortCol: RankMetricCol = initialCombat === 'normal' ? 'dps' : initialCombat === 'suicide' ? 'atk' : 'hp';
  const [age, setAge] = useState<number>(4);
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<RankSortCol>(initialSortCol);
  const [sortDir, setSortDir] = useState<SortDir>(RANK_COL_META_BY_KEY[initialSortCol].bestDir);
  const [selected, setSelected] = useState<string[]>([]);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedCiv, setExpandedCiv] = useState<string | null>(null);

  const bounds = useMemo(() => unitRankAgeBounds(unit), [unit]);
  const ctx = useMemo(() => (trees ? makeSimContext(core.techs, trees) : null), [core.techs, trees]);
  const data = useMemo(() => (ctx ? buildUnitCivRank(ctx, unit, age) : null), [ctx, unit, age]);

  const rowByCiv = useMemo(() => {
    const map = new Map<string, UnitCivRankRow>();
    if (data) for (const r of data.rows) map.set(r.civ, r);
    return map;
  }, [data]);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    return sortUnitCivRankRows(data.rows, sortCol, sortDir);
  }, [data, sortCol, sortDir]);

  const filtered = useMemo(() => {
    if (!data) return { rows: [] as UnitCivRankRow[], emptyMessage: null };
    return filterUnitCivRankRows(sortedRows, query, unit, data.age);
  }, [data, sortedRows, query, unit]);

  const { visibleRows, hiddenCount, collapsibleCount } = useMemo(() => {
    const list = filtered.rows;
    if (query.trim() || list.length <= COLLAPSE_LIMIT) {
      return { visibleRows: list, hiddenCount: 0, collapsibleCount: 0 };
    }
    const selSet = new Set(selected);
    const collapsed = list.filter((r, idx) => idx < COLLAPSE_LIMIT || selSet.has(r.civ));
    const collapsible = list.length - collapsed.length;
    if (showAll || collapsible === 0) {
      return { visibleRows: list, hiddenCount: 0, collapsibleCount: collapsible };
    }
    return { visibleRows: collapsed, hiddenCount: collapsible, collapsibleCount: collapsible };
  }, [filtered.rows, query, showAll, selected]);

  const handleAgeChange = (nextAge: number) => {
    if (nextAge === age) return;
    setAge(nextAge);
    setExpandedCiv(null);
    if (selected.length === 0) {
      setRemovedNotice(null);
      return;
    }
    const kept: string[] = [];
    const removedNames: string[] = [];
    for (const civ of selected) {
      if (trainingUnitAge(civ, unit.id, unit.age) <= nextAge) kept.push(civ);
      else removedNames.push(rowByCiv.get(civ)?.civZh ?? civ);
    }
    setSelected(kept);
    if (removedNames.length > 0) {
      const nextAgeZh = AGE_ZH[nextAge] ?? `${nextAge}时代`;
      setRemovedNotice(`${removedNames.join('、')}${nextAgeZh}不能训练，已移出`);
    } else {
      setRemovedNotice(null);
    }
  };

  const handleSort = (col: RankSortCol) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'civ' ? 'asc' : RANK_COL_META_BY_KEY[col].bestDir);
    }
  };

  const handleChampionClick = (col: RankMetricCol, bestDir: SortDir) => {
    setSortCol(col);
    setSortDir(bestDir);
  };

  const handleToggleSelect = (civ: string) => {
    setRemovedNotice(null);
    setSelected((prev) => {
      if (prev.includes(civ)) return prev.filter((item) => item !== civ);
      if (prev.length >= 2) return prev;
      return [...prev, civ];
    });
  };

  const handleClearSelect = () => {
    setRemovedNotice(null);
    setSelected([]);
  };

  const handleToggleExpand = (civ: string) => {
    setExpandedCiv((prev) => (prev === civ ? null : civ));
  };

  const selectedRows = selected.map((civ) => rowByCiv.get(civ)).filter((r): r is UnitCivRankRow => !!r);
  const canLaunchDuel = !!data && data.canDuel && data.rows.length >= 2 && selectedRows.length === 2;
  const duelHref = canLaunchDuel ? buildCivRankDuelHref(unit.id, selectedRows[0]!, selectedRows[1]!, data.age, data.combatKind) : '';
  const ageLabel = AGE_ZH[data?.age ?? age] ?? `${age}时代`;
  const duelBtnLabel = narrow ? (
    '去 PK'
  ) : data?.combatKind === 'suicide' ? (
    <>
      <span className="num nw">1v1</span> 对打
    </>
  ) : (
    <>
      等资源 <span className="num nw">{DUEL_BUDGET_DEFAULT}</span> 对打
    </>
  );

  return (
    <section className="ud-section ucr" id="unit-civ-rank" aria-label="各文明满科技对照">
      <div className="ucr-head">
        <h2>各文明满科技对照</h2>
        <p className="ucr-sub">每个文明按单位 PK 的「满科技」研究完本时代能研究的数值科技与造价科技，只列客观数值，不给综合分。</p>
      </div>

      {!data ? (
        treeWaiting
      ) : (
        <>
          <div className="ucr-toolbar">
            <div className="ucr-toolbar-left">
              {bounds.availableAges.length > 1 ? (
                <div className="ucr-ages" role="radiogroup" aria-label="选择时代" onKeyDown={radioKeyboard}>
                  {bounds.availableAges.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={data.age === a}
                      tabIndex={data.age === a ? 0 : -1}
                      className={data.age === a ? 'ucr-age is-on' : 'ucr-age'}
                      onClick={() => handleAgeChange(a)}
                    >
                      {AGE_ZH[a]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="ucr-age-static">{ageLabel}满科技</span>
              )}
              {data.totalCivCount > COLLAPSE_LIMIT && (
                <div className="ucr-search-wrap">
                  <SearchInput id="ucr-search" value={query} onChange={setQuery} placeholder="搜索文明" label="搜索文明" />
                </div>
              )}
            </div>
            <p className="ucr-count">
              {ageLabel}可训练 <span className="num nw">{data.rows.length}</span> / <span className="num nw">{data.totalCivCount}</span> 个文明
            </p>
          </div>

          {data.rows.length >= 2 && data.champions.length > 0 && (
            <div className="ucr-champs" role="group" aria-label="各项第一">
              <span className="ucr-champs-label">各项第一</span>
              <div className="ucr-champs-list">
                {data.champions.map((champ) => {
                  const active = sortCol === champ.col && sortDir === champ.bestDir;
                  const civNames = champ.civs
                    .slice(0, 2)
                    .map((c) => c.civZh)
                    .join('、');
                  return (
                    <button
                      key={champ.col}
                      type="button"
                      className={active ? 'ucr-champ is-on' : 'ucr-champ'}
                      aria-pressed={active}
                      onClick={() => handleChampionClick(champ.col, champ.bestDir)}
                    >
                      <span>{champ.label}</span>
                      <strong className="ucr-champ-val num nw">{champ.formattedValue}</strong>
                      <span className="ucr-champ-sep" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        {civNames}
                        {champ.civs.length > 2 && (
                          <>
                            {' '}
                            等 <span className="num nw">{champ.civs.length} 家</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {data.commonMechanisms.length > 0 && <p className="ucr-common">全部文明都有：{data.commonMechanisms.join('、')}（未计入单位 PK 模拟）</p>}

          <div className="ucr-pk" data-t="ucr-pk-bar">
            {removedNotice && (
              <p className="ucr-notice" role="status">
                {removedNotice}
              </p>
            )}
            {!data.canDuel ? (
              <p className="ucr-pk-disabled">{NO_NORMAL_ATTACK_REASON}，不适用单位 PK。</p>
            ) : data.rows.length < 2 ? (
              <p className="ucr-pk-disabled">
                {ageLabel}只有 <span className="num nw">1</span> 个文明能训练，没有可对打的另一方。切到{AGE_ZH[data.standardAge]}可选两个文明。
              </p>
            ) : (
              <div className="ucr-pk-row">
                <div className="ucr-pk-slots">
                  {selectedRows.length === 0 ? (
                    <>
                      <span className="ucr-pk-title">单位 PK</span>
                      <span className="ucr-pk-hint">{narrow ? '点左侧圆圈选两个文明。' : '点表格左侧的圆圈选两个文明，带入单位 PK 对打。'}</span>
                    </>
                  ) : (
                    <>
                      {selectedRows.map((row, idx) => (
                        <span key={row.civ} className="ucr-pk-chip">
                          <span className={idx === 0 ? 'ucr-slot is-a' : 'ucr-slot is-b'}>{idx === 0 ? 'A' : 'B'}</span>
                          <CivIcon c={{ en: row.civ }} alt="" />
                          <span className="ucr-pk-chip-name">{row.civZh}</span>
                          <button type="button" className="ucr-chip-x" aria-label={`移出${row.civZh}`} onClick={() => handleToggleSelect(row.civ)}>
                            <Icon name="x" />
                          </button>
                        </span>
                      ))}
                      {selectedRows.length === 1 && (
                        <span className="ucr-pk-hint">
                          再选 <span className="num nw">1</span> 个文明
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="ucr-pk-actions">
                  {selectedRows.length === 2 && (
                    <button type="button" className="ud-btn ucr-clear-btn" onClick={handleClearSelect}>
                      清空
                    </button>
                  )}
                  {canLaunchDuel ? (
                    <Link className="ucr-pk-go" to={duelHref} data-t="ucr-pk-go">
                      <Icon name="swords" />
                      <span>{duelBtnLabel}</span>
                      <Icon name="arrow-right" />
                    </Link>
                  ) : (
                    <button type="button" className="ucr-pk-go is-disabled" aria-disabled="true" data-t="ucr-pk-go" onClick={(e) => e.preventDefault()}>
                      <Icon name="swords" />
                      <span>{duelBtnLabel}</span>
                      <Icon name="arrow-right" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {narrow && (
            <div className="ucr-mobile-sort">
              <label htmlFor="ucr-sort-select" className="ucr-ms-label">
                排序
              </label>
              <select
                id="ucr-sort-select"
                className="ucr-ms-select"
                value={sortCol}
                onChange={(e) => {
                  const next = e.target.value as RankSortCol;
                  setSortCol(next);
                  setSortDir(next === 'civ' ? 'asc' : RANK_COL_META_BY_KEY[next].bestDir);
                }}
              >
                {RANK_METRIC_COLS.filter((m) => data.applicableCols.includes(m.col)).map((m) => (
                  <option key={m.col} value={m.col}>
                    {m.fullLabel}
                  </option>
                ))}
                <option value="civ">文明</option>
              </select>
              <button type="button" className="ucr-ms-dir" onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}>
                <Icon name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} />
                <span>{sortDir === 'desc' ? '从高到低' : '从低到高'}</span>
              </button>
            </div>
          )}

          {filtered.emptyMessage ? (
            <div className="ucr-empty" data-t="ucr-empty">
              <p>{filtered.emptyMessage}</p>
              <button type="button" className="ud-btn" onClick={() => setQuery('')}>
                清除搜索
              </button>
            </div>
          ) : (
            <>
              <UnitCivRankTable
                data={data}
                rows={visibleRows}
                narrow={narrow}
                sortCol={sortCol}
                sortDir={sortDir}
                selected={selected}
                expandedCiv={expandedCiv}
                preserveSearch={loc.search}
                onSort={handleSort}
                onToggleSelect={handleToggleSelect}
                onToggleExpand={handleToggleExpand}
              />
              {!query.trim() && collapsibleCount > 0 && (
                <div className="ucr-more-wrap">
                  {hiddenCount > 0 ? (
                    <button type="button" className="ud-btn ucr-more-btn" onClick={() => setShowAll(true)}>
                      <span>
                        显示其余 <span className="num nw">{hiddenCount}</span> 个文明
                      </span>
                      <Icon name="chevron-down" />
                    </button>
                  ) : (
                    <button type="button" className="ud-btn ucr-more-btn" onClick={() => setShowAll(false)}>
                      <span>收起</span>
                      <Icon name="chevron-up" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          <ul className="ucr-notes">
            {data.combatKind === 'normal' ? (
              <li>裸 DPS = 攻击 ÷ 攻击间隔，不计护甲、命中率和克制加成。</li>
            ) : data.combatKind === 'non-attacking' ? (
              <li>无普通攻击：攻击、攻击间隔和裸 DPS 不适用，默认按生命排序。</li>
            ) : (
              <li>爆炸单位，无攻击间隔：攻击间隔和裸 DPS 不适用，默认按攻击排序。</li>
            )}
            {data.rows.length < data.totalCivCount && (
              <li>
                其余 <span className="num nw">{data.totalCivCount - data.rows.length}</span> 个文明要到{AGE_ZH[data.standardAge]}才能训练{unit.zh}。
              </li>
            )}
            {data.hasEstimatedCost && <li>「估算」：含尚未完全解码的造价科技，总价按已解码部分计算。</li>}
            <li>训练时间沿用科技模拟器单兵口径（未计征招及建筑工作效率加成，完整产兵周期见「持续生产」）。</li>
            <li>「缺」：本时代其他文明能研究、这个文明研究不了的通用科技。</li>
          </ul>
        </>
      )}
    </section>
  );
}
