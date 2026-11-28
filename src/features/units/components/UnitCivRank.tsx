import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trainingUnitAge } from '../../../domain/availabilityAge';
import { AGE_ZH } from '../../../domain/ratings';
import { makeSimContext } from '../../../domain/simulator';
import type { Tech, Trees, Unit } from '../../../domain/types';
import {
  buildCivRankDuelHref,
  buildUnitCivRank,
  computeUnitCivRankSummary,
  filterUnitCivRankRows,
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
import {
  classifyUnitRankEmptyState,
  filterRowsByTechs,
  readUnitRankQuery,
  reconcilePkOnTechFilter,
  reconcileTechFilterOnAgeChange,
  resolveUnitRankUrl,
  stripUnitRankQuery,
  withUnitRankQuery,
} from '../../../domain/unitCivRankFilter';
import { useNarrowTable } from '../../../shared/hooks/useNarrowTable';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from '../../../shared/ui/radioKeyboard';
import { SearchInput } from '../../../shared/ui/widgets';
import { UnitCivRankRelicNotes, UnitCivRankTable } from './UnitCivRankTable';
import { UnitCivRankChampions, UnitCivRankEmpty, UnitCivRankPkBar, UnitCivRankTechFilter, type UnitCivRankAgeNotice } from './UnitCivRankTechFilter';
import '../../../shared/styles/civ-rank.css';
import './unit-civ-rank.css';

const COLLAPSE_LIMIT = 12;

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
  onRankQuerySync?: (nextSearch: string) => void;
}

export function UnitCivRank({ unit, core, trees, treeWaiting, onRankQuerySync }: UnitCivRankProps) {
  const loc = useLocation();
  const nav = useNavigate();
  const narrow = useNarrowTable();
  const bounds = useMemo(() => unitRankAgeBounds(unit), [unit]);
  const parsedQuery = useMemo(() => readUnitRankQuery(loc.search, bounds.availableAges), [loc.search, bounds.availableAges]);
  const initialCombat = unitRankCombatKind(unit);
  const initialSortCol: RankMetricCol = initialCombat === 'normal' ? 'dps' : initialCombat === 'suicide' ? 'atk' : 'hp';

  const [age, setAge] = useState<number>(() => parsedQuery.rankAge ?? 4);
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<RankSortCol>(initialSortCol);
  const [sortDir, setSortDir] = useState<SortDir>(RANK_COL_META_BY_KEY[initialSortCol].bestDir);
  const [selected, setSelected] = useState<string[]>([]);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const [ageNotice, setAgeNotice] = useState<UnitCivRankAgeNotice | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedCiv, setExpandedCiv] = useState<string | null>(null);
  const [localSyncSearch, setLocalSyncSearch] = useState<string | null>(null);
  const [prevSearch, setPrevSearch] = useState(loc.search);

  const replaceRankSearch = (nextSearch: string) => {
    if (nextSearch === loc.search) return;
    setLocalSyncSearch(nextSearch);
    onRankQuerySync?.(nextSearch);
    nav({ pathname: loc.pathname, search: nextSearch, hash: loc.hash }, { replace: true, state: loc.state });
  };

  if (prevSearch !== loc.search) {
    setPrevSearch(loc.search);
    if (localSyncSearch === loc.search) {
      setLocalSyncSearch(null);
    } else {
      if (localSyncSearch !== null) setLocalSyncSearch(null);
      if (parsedQuery.rankAge !== null) {
        setAge(parsedQuery.rankAge);
        setAgeNotice(null);
      } else if (parsedQuery.hasRankTech) {
        setAge(4);
        setAgeNotice(null);
      }
    }
  }

  const ctx = useMemo(() => (trees ? makeSimContext(core.techs, trees) : null), [core.techs, trees]);
  const data = useMemo(() => (ctx ? buildUnitCivRank(ctx, unit, age) : null), [ctx, unit, age]);
  const rowByCiv = useMemo(() => {
    const map = new Map<string, UnitCivRankRow>();
    if (data) for (const r of data.rows) map.set(r.civ, r);
    return map;
  }, [data]);

  const urlResolved = useMemo(
    () => (data ? resolveUnitRankUrl(loc.search, data.filterTechs, bounds.availableAges) : null),
    [data, loc.search, bounds.availableAges],
  );
  const selectedTechIds = useMemo(() => urlResolved?.validTechIds ?? [], [urlResolved]);
  const urlNotice = urlResolved?.notice ?? null;
  const hasActiveTechFilter = selectedTechIds.length > 0;
  const techFilteredRows = useMemo(() => (data ? filterRowsByTechs(data.rows, selectedTechIds) : []), [data, selectedTechIds]);

  const activeSummary = useMemo(() => {
    if (!data) return null;
    return hasActiveTechFilter ? computeUnitCivRankSummary(techFilteredRows, data.applicableCols) : { bestValues: data.bestValues, champions: data.champions };
  }, [data, hasActiveTechFilter, techFilteredRows]);

  const tableData = useMemo(() => {
    if (!data || !activeSummary) return null;
    return hasActiveTechFilter ? { ...data, bestValues: activeSummary.bestValues, champions: activeSummary.champions } : data;
  }, [data, activeSummary, hasActiveTechFilter]);

  const sortedRows = useMemo(() => (data ? sortUnitCivRankRows(techFilteredRows, sortCol, sortDir) : []), [data, techFilteredRows, sortCol, sortDir]);
  const filtered = useMemo(
    () => (data ? filterUnitCivRankRows(sortedRows, query, unit, data.age) : { rows: [] as UnitCivRankRow[], emptyMessage: null }),
    [data, sortedRows, query, unit],
  );
  const selectedFilterTechs = useMemo(() => {
    if (!data || !hasActiveTechFilter) return [];
    const selSet = new Set(selectedTechIds);
    return data.filterTechs.filter((t) => selSet.has(t.id));
  }, [data, hasActiveTechFilter, selectedTechIds]);

  const emptyState = useMemo(
    () =>
      !data
        ? { kind: 'none' as const }
        : classifyUnitRankEmptyState({
            selectedTechs: selectedFilterTechs,
            techFilteredRows,
            allAgeRows: data.rows,
            filteredResult: filtered,
            rawQuery: query,
            unit,
            age: data.age,
          }),
    [data, selectedFilterTechs, techFilteredRows, filtered, query, unit],
  );

  // 外部 / POP 导航改变科技筛选结果时同步裁剪 PK 槽位（纯文本 query 不触发）。
  const techScopeKey = `${age}:${selectedTechIds.join(',')}`;
  const [prevTechScopeKey, setPrevTechScopeKey] = useState(techScopeKey);
  if (data && prevTechScopeKey !== techScopeKey) {
    setPrevTechScopeKey(techScopeKey);
    if (hasActiveTechFilter && selected.length > 0) {
      const { keptCivs, removedNames } = reconcilePkOnTechFilter(selected, techFilteredRows, rowByCiv);
      if (removedNames.length > 0) {
        setSelected(keptCivs);
        setRemovedNotice(`${removedNames.join('、')}不满足所选科技筛选，已从单位 PK 移出。`);
      }
    }
  }

  const { visibleRows, hiddenCount, collapsibleCount } = useMemo(() => {
    const list = filtered.rows;
    if (hasActiveTechFilter || query.trim() || list.length <= COLLAPSE_LIMIT) return { visibleRows: list, hiddenCount: 0, collapsibleCount: 0 };
    const selSet = new Set(selected);
    const collapsed = list.filter((r, idx) => idx < COLLAPSE_LIMIT || selSet.has(r.civ));
    const collapsible = list.length - collapsed.length;
    return showAll || collapsible === 0
      ? { visibleRows: list, hiddenCount: 0, collapsibleCount: collapsible }
      : { visibleRows: collapsed, hiddenCount: collapsible, collapsibleCount: collapsible };
  }, [filtered.rows, hasActiveTechFilter, query, showAll, selected]);

  const handleToggleTech = (techId: number) => {
    const nextIds = selectedTechIds.includes(techId) ? selectedTechIds.filter((id) => id !== techId) : [...selectedTechIds, techId].sort((a, b) => a - b);
    setAgeNotice(null);
    if (data && selected.length > 0) {
      const { keptCivs, removedNames } = reconcilePkOnTechFilter(selected, filterRowsByTechs(data.rows, nextIds), rowByCiv);
      if (removedNames.length > 0) {
        setSelected(keptCivs);
        setRemovedNotice(`${removedNames.join('、')}不满足所选科技筛选，已从单位 PK 移出。`);
      } else {
        setRemovedNotice(null);
      }
    } else {
      setRemovedNotice(null);
    }
    replaceRankSearch(withUnitRankQuery(loc.search, nextIds, nextIds.length > 0 && age !== 4 ? age : null));
  };

  const handleClearTechs = () => {
    setAgeNotice(null);
    setRemovedNotice(null);
    replaceRankSearch(stripUnitRankQuery(loc.search));
  };

  const handleDismissUrlNotice = () => {
    replaceRankSearch(withUnitRankQuery(loc.search, selectedTechIds, hasActiveTechFilter && age !== 4 ? age : null));
  };

  const handleAgeChange = (nextAge: number) => {
    if (nextAge === age) return;
    setAge(nextAge);
    setExpandedCiv(null);
    const nextData = ctx ? buildUnitCivRank(ctx, unit, nextAge) : null;
    const { keptIds, removedTechs } =
      data && nextData ? reconcileTechFilterOnAgeChange(selectedTechIds, data.filterTechs, nextData.filterTechs) : { keptIds: [], removedTechs: [] };
    const nextAgeZh = AGE_ZH[nextAge] ?? `${nextAge}时代`;
    setAgeNotice(removedTechs.length > 0 ? { nextAgeZh, removedNames: removedTechs.map((t) => t.zh) } : null);
    if (hasActiveTechFilter || parsedQuery.hasRankTech || parsedQuery.hasRankAge) {
      replaceRankSearch(withUnitRankQuery(loc.search, keptIds, keptIds.length > 0 && nextAge !== 4 ? nextAge : null));
    }
    if (selected.length === 0) {
      setRemovedNotice(null);
      return;
    }
    const nextMatchedCivs = nextData ? new Set(filterRowsByTechs(nextData.rows, keptIds).map((r) => r.civ)) : null;
    const kept: string[] = [];
    const untrainableNames: string[] = [];
    const mismatchNames: string[] = [];
    for (const civ of selected) {
      if (trainingUnitAge(civ, unit.id, unit.age) > nextAge) untrainableNames.push(rowByCiv.get(civ)?.civZh ?? civ);
      else if (nextMatchedCivs && !nextMatchedCivs.has(civ)) mismatchNames.push(rowByCiv.get(civ)?.civZh ?? civ);
      else kept.push(civ);
    }
    setSelected(kept);
    const notices: string[] = [];
    if (untrainableNames.length > 0) notices.push(`${untrainableNames.join('、')}${nextAgeZh}不能训练，已移出`);
    if (mismatchNames.length > 0) notices.push(`${mismatchNames.join('、')}不满足所选科技筛选，已从单位 PK 移出。`);
    setRemovedNotice(notices.length > 0 ? notices.join('；') : null);
  };

  const handleSort = (col: RankSortCol) => {
    if (sortCol === col) setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    else {
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
    setSelected((prev) => (prev.includes(civ) ? prev.filter((item) => item !== civ) : prev.length >= 2 ? prev : [...prev, civ]));
  };
  const handleClearSelect = () => {
    setRemovedNotice(null);
    setSelected([]);
  };

  const selectedRows = selected.map((civ) => rowByCiv.get(civ)).filter((r): r is UnitCivRankRow => !!r);
  const allowDuelSelect = !!data && data.canDuel && techFilteredRows.length >= 2;
  const canLaunchDuel = allowDuelSelect && selectedRows.length === 2;
  const duelHref = canLaunchDuel ? buildCivRankDuelHref(unit.id, selectedRows[0]!, selectedRows[1]!, data.age, data.combatKind) : '';
  const ageLabel = AGE_ZH[data?.age ?? age] ?? `${age}时代`;
  const activeChampions = activeSummary?.champions ?? [];

  return (
    <section className="ud-section ucr" id="unit-civ-rank" aria-label="各文明满科技对照">
      <div className="ucr-head">
        <h2>各文明满科技对照</h2>
        <p className="ucr-sub">每个文明按单位 PK 的「满科技」自动计入本方常驻团队加成，并研究完本时代能研究的数值科技与造价科技；只列客观数值，不给综合分。</p>
      </div>

      {!data || !tableData ? (
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
              {hasActiveTechFilter ? (
                <>
                  符合科技筛选 <span className="num nw">{techFilteredRows.length}</span> / <span className="num nw">{data.rows.length}</span> 个{ageLabel}
                  可训练文明
                </>
              ) : (
                <>
                  {ageLabel}可训练 <span className="num nw">{data.rows.length}</span> / <span className="num nw">{data.totalCivCount}</span> 个文明
                </>
              )}
            </p>
          </div>

          <UnitCivRankTechFilter
            filterTechs={data.filterTechs}
            selectedTechIds={selectedTechIds}
            matchedCount={techFilteredRows.length}
            totalCount={data.rows.length}
            ageNotice={ageNotice}
            urlNotice={urlNotice}
            onToggleTech={handleToggleTech}
            onClearTechs={handleClearTechs}
            onDismissUrlNotice={handleDismissUrlNotice}
          />

          <UnitCivRankChampions
            champions={activeChampions}
            matchedCount={techFilteredRows.length}
            hasActiveTechFilter={hasActiveTechFilter}
            sortCol={sortCol}
            sortDir={sortDir}
            onSelectChampion={handleChampionClick}
          />

          {data.commonMechanisms.length > 0 && <p className="ucr-common">全部文明都有：{data.commonMechanisms.join('、')}（未计入单位 PK 模拟）</p>}

          <UnitCivRankPkBar
            data={data}
            techFilteredRows={techFilteredRows}
            selectedRows={selectedRows}
            removedNotice={removedNotice}
            ageLabel={ageLabel}
            narrow={narrow}
            canLaunchDuel={canLaunchDuel}
            duelHref={duelHref}
            onToggleSelect={handleToggleSelect}
            onClearSelect={handleClearSelect}
          />

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

          {emptyState.kind !== 'none' ? (
            <UnitCivRankEmpty emptyState={emptyState} ageLabel={ageLabel} unitZh={unit.zh} onClearTechs={handleClearTechs} onClearSearch={() => setQuery('')} />
          ) : (
            <>
              <UnitCivRankTable
                data={tableData}
                rows={visibleRows}
                narrow={narrow}
                sortCol={sortCol}
                sortDir={sortDir}
                selected={selected}
                allowSelect={allowDuelSelect}
                expandedCiv={expandedCiv}
                preserveSearch={loc.search}
                onSort={handleSort}
                onToggleSelect={handleToggleSelect}
                onToggleExpand={(civ) => setExpandedCiv((prev) => (prev === civ ? null : civ))}
              />
              {!query.trim() && !hasActiveTechFilter && collapsibleCount > 0 && (
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
            <li>各文明数值与训练时间均已自动计入本方常驻团队加成，未计额外盟友团队加成，也未计征招及建筑工作效率加成（完整产兵周期见「持续生产」）。</li>
            <li>「缺」：本时代其他文明能研究、这个文明研究不了的通用科技。</li>
            {data.filterTechs.length > 0 && (
              <li data-t="ucr-tech-filter-note">
                科技筛选仅列当前时代存在文明差异的通用与区域科技，勾选后按「同时具备（AND）」过滤文明，表内仍显示各文明满科技面板；按修道院非数值科技或独特科技筛选请前往「文明」页。
              </li>
            )}
            {data.hasBonusDamageReduction && (
              <li data-t="ucr-bdr-note">
                「额外伤害减免」：文明常驻减免非基础克制伤害，已计入科技模拟器与单位 PK，不改变上表 <span className="num nw">11</span> 列基础面板与排序。
              </li>
            )}
            {data.hasRelicBonus && <UnitCivRankRelicNotes rows={data.rows} />}
          </ul>
        </>
      )}
    </section>
  );
}
