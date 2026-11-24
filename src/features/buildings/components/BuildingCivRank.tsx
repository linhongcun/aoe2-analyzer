import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Core } from '../../../data';
import { buildingAge } from '../../../domain/availabilityAge';
import {
  buildBuildingCivRank,
  BUILDING_RANK_COL_META_BY_KEY,
  buildingRankAgeBounds,
  buildingRankCategory,
  filterBuildingCivRankRows,
  sortBuildingCivRankRows,
  type BuildingCivRankContext,
  type BuildingCivRankRow,
  type BuildingGarrisonArrowEntry,
  type BuildingGarrisonArrowsState,
  type BuildingRankMetricCol,
  type BuildingRankSortCol,
  type SortDir,
} from '../../../domain/buildingCivRank';
import { TOWN_CENTER_ID, townCenterBuildTimes } from '../../../domain/buildTimeFacts';
import { AGE_ZH } from '../../../domain/ratings';
import type { Building } from '../../../domain/types';
import { useNarrowTable } from '../../../shared/hooks/useNarrowTable';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from '../../../shared/ui/radioKeyboard';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useCoreTrees } from '../../../shared/utils/useCoreTrees';
import { BuildingCivRankTable } from './BuildingCivRankTable';
import '../../../shared/styles/civ-rank.css';

const COLLAPSE_LIMIT = 12;
const SHORT_AGE_ZH: Readonly<Record<number, string>> = { 1: '黑暗', 2: '封建', 3: '城堡', 4: '帝王' };
const FORTIFIED_CHURCH_ID = 1806;
const FISH_TRAP_ID = 199;

type GarrisonGeneralMod = typeof import('../../../domain/garrisonGeneral');

let garrisonModPromise: Promise<GarrisonGeneralMod> | null = null;
let garrisonModCache: GarrisonGeneralMod | null = null;

function loadGarrisonGeneralModule(): Promise<GarrisonGeneralMod> {
  if (garrisonModCache) return Promise.resolve(garrisonModCache);
  garrisonModPromise ??= import('../../../domain/garrisonGeneral')
    .then((mod) => {
      garrisonModCache = mod;
      return mod;
    })
    .catch((err: unknown) => {
      garrisonModPromise = null;
      throw err;
    });
  return garrisonModPromise;
}

function computeGarrisonArrowsByCiv(
  mod: GarrisonGeneralMod,
  ctx: BuildingCivRankContext,
  building: Building,
  age: number,
): Record<string, BuildingGarrisonArrowEntry> {
  const out: Record<string, BuildingGarrisonArrowEntry> = {};
  for (const civ of building.civs) {
    if (buildingAge(building, civ, ctx.trees) > age) continue;
    const allTechs = mod.getGarrisonTechs(ctx, building, { civ, age, techs: [], rows: [] }).map((t) => t.id);
    // 遵循 issue 1262 URL 契约：先剔除基础免费科技，再以手动科技集做二次免费科技剔除（避免高丽 TC 帝王泄漏免费炮塔 64）。
    const baseFree = new Set(mod.getFreeGarrisonTechs(ctx, building, { civ, age, techs: [], rows: [] }));
    const firstManual = allTechs.filter((id) => !baseFree.has(id));
    const nextFree = new Set(mod.getFreeGarrisonTechs(ctx, building, { civ, age, techs: firstManual, rows: [] }));
    const manualTechs = firstManual.filter((id) => !nextFree.has(id)).sort((a, b) => a - b);
    const res = mod.calculateGeneralGarrison(ctx, building, { civ, age, techs: manualTechs, rows: [] });
    if (res.errors.length === 0) {
      out[civ] = {
        baseProjectiles: res.baseProjectiles,
        maxProjectiles: res.maxProjectiles,
        garrisonTechIds: manualTechs,
      };
    }
  }
  return out;
}

export function BuildingCivsHeader({ count, showRankLink }: { count: number; showRankLink: boolean }) {
  const loc = useLocation();
  const href = `#${loc.pathname}${loc.search}`;
  return (
    <div className="bcr-civs-head">
      <p className="bd-kicker">
        拥有这座建筑的文明 <span className="num nw">{count}</span>
      </p>
      {showRankLink && (
        <a
          href={href}
          className="bcr-jump-inline"
          onClick={(event) => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              document.getElementById('building-civ-rank')?.scrollIntoView({ block: 'start' });
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

interface BuildingCivRankProps {
  building: Building;
  core: Core;
}

export function BuildingCivRank({ building, core }: BuildingCivRankProps) {
  const narrow = useNarrowTable();
  const { trees: treesRes } = useCoreTrees();
  const trees = treesRes.data;
  const category = buildingRankCategory(building);
  const needsGarrison = category === 'A';

  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(
    () => !needsGarrison || garrisonModCache !== null || typeof window === 'undefined' || typeof IntersectionObserver !== 'function',
  );
  const [garrisonMod, setGarrisonMod] = useState<GarrisonGeneralMod | null>(() => (needsGarrison ? garrisonModCache : null));
  const [garrisonAttempt, setGarrisonAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);

  const [age, setAge] = useState<number>(4);
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<BuildingRankSortCol>('hp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAll, setShowAll] = useState(false);
  const [expandedCiv, setExpandedCiv] = useState<string | null>(null);

  useEffect(() => {
    if (!needsGarrison || inView || typeof IntersectionObserver !== 'function') return;
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [needsGarrison, inView, building.id]);

  useEffect(() => {
    if (!needsGarrison || !inView || !trees || garrisonMod) return;
    let active = true;
    void loadGarrisonGeneralModule().then(
      (mod) => {
        if (!active) return;
        setGarrisonMod(mod);
      },
      () => {
        if (!active) return;
        setFailedAttempt(garrisonAttempt);
      },
    );
    return () => {
      active = false;
    };
  }, [needsGarrison, inView, trees, garrisonMod, garrisonAttempt, building.id]);

  const ctx = useMemo<BuildingCivRankContext | null>(() => (trees ? { core, trees } : null), [core, trees]);
  const bounds = useMemo(() => (trees ? buildingRankAgeBounds(building, trees) : null), [building, trees]);
  const clampedAge = bounds ? Math.max(bounds.minAge, Math.min(4, age)) : 4;
  const resolvedGarrisonMod = garrisonMod ?? (needsGarrison ? garrisonModCache : null);
  const garrisonState: 'idle' | 'loading' | 'ready' | 'error' = !needsGarrison
    ? 'idle'
    : resolvedGarrisonMod
      ? 'ready'
      : failedAttempt === garrisonAttempt
        ? 'error'
        : inView && trees
          ? 'loading'
          : 'idle';

  const garrisonArrows = useMemo<BuildingGarrisonArrowsState>(() => {
    if (!needsGarrison) return { status: 'idle' };
    if (garrisonState === 'ready' && resolvedGarrisonMod && ctx) {
      return { status: 'ready', byCiv: computeGarrisonArrowsByCiv(resolvedGarrisonMod, ctx, building, clampedAge) };
    }
    if (garrisonState === 'error') return { status: 'error' };
    return { status: 'loading' };
  }, [needsGarrison, garrisonState, resolvedGarrisonMod, ctx, building, clampedAge]);

  const data = useMemo(() => (ctx ? buildBuildingCivRank(ctx, building, clampedAge, garrisonArrows) : null), [ctx, building, clampedAge, garrisonArrows]);

  const effectiveSortCol: BuildingRankSortCol = !data || sortCol === 'civ' || data.sortableCols.includes(sortCol) ? sortCol : data.defaultSortCol;
  const effectiveSortDir: SortDir = effectiveSortCol === sortCol ? sortDir : BUILDING_RANK_COL_META_BY_KEY[effectiveSortCol as BuildingRankMetricCol].bestDir;

  const sortedRows = useMemo(() => {
    if (!data) return [];
    return sortBuildingCivRankRows(data.rows, effectiveSortCol, effectiveSortDir);
  }, [data, effectiveSortCol, effectiveSortDir]);

  const filtered = useMemo(() => {
    if (!data) return { rows: [] as BuildingCivRankRow[], emptyMessage: null };
    return filterBuildingCivRankRows(sortedRows, query, building, data.age);
  }, [data, sortedRows, query, building]);

  const { visibleRows, hiddenCount, collapsibleCount } = useMemo(() => {
    const list = filtered.rows;
    if (query.trim() || list.length <= COLLAPSE_LIMIT) {
      return { visibleRows: list, hiddenCount: 0, collapsibleCount: 0 };
    }
    const collapsible = list.length - COLLAPSE_LIMIT;
    if (showAll) return { visibleRows: list, hiddenCount: 0, collapsibleCount: collapsible };
    return { visibleRows: list.slice(0, COLLAPSE_LIMIT), hiddenCount: collapsible, collapsibleCount: collapsible };
  }, [filtered.rows, query, showAll]);

  const handleAgeChange = (nextAge: number) => {
    if (nextAge === clampedAge) return;
    setAge(nextAge);
    setExpandedCiv(null);
  };

  const handleSort = (col: BuildingRankSortCol) => {
    if (effectiveSortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'civ' ? 'asc' : BUILDING_RANK_COL_META_BY_KEY[col].bestDir);
    }
  };

  const handleChampionClick = (col: BuildingRankMetricCol, bestDir: SortDir) => {
    setSortCol(col);
    setSortDir(bestDir);
  };

  const ageLabel = AGE_ZH[data?.age ?? clampedAge] ?? `${clampedAge}时代`;
  const tcBuildTimes = building.id === TOWN_CENTER_ID ? townCenterBuildTimes() : null;
  const churchSample = building.id === FORTIFIED_CHURCH_ID && data?.garrisonStatus === 'ready' ? data.rows[0] : null;
  const compactAges = narrow && (bounds?.availableAges.length ?? 0) > 3;

  return (
    <section ref={sectionRef} className="bd-section ucr" id="building-civ-rank" aria-label="各文明满科技对照">
      <div className="ucr-head">
        <h2>各文明满科技对照</h2>
        <p className="ucr-sub">每个文明按建筑科技模拟器的「满科技」研究完本时代能研究的建筑科技与造价科技，只列客观数值，不给综合分。</p>
      </div>

      {!data || !ctx || !bounds ? (
        treesRes.error ? (
          <div className="ucr-empty" role="alert">
            <p>科技树资料暂时未能读取，请重试。</p>
            <button type="button" className="bd-btn bcr-retry" onClick={treesRes.retry}>
              <Icon name="rotate-ccw" />
              <span>重试</span>
            </button>
          </div>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="ucr-toolbar">
            <div className="ucr-toolbar-left">
              {bounds.availableAges.length > 1 ? (
                <div className={compactAges ? 'ucr-ages is-compact' : 'ucr-ages'} role="radiogroup" aria-label="选择时代" onKeyDown={radioKeyboard}>
                  {bounds.availableAges.map((a) => {
                    const full = AGE_ZH[a] ?? `${a}时代`;
                    return (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={data.age === a}
                        aria-label={full}
                        tabIndex={data.age === a ? 0 : -1}
                        className={data.age === a ? 'ucr-age is-on' : 'ucr-age'}
                        onClick={() => handleAgeChange(a)}
                      >
                        {compactAges ? (SHORT_AGE_ZH[a] ?? full) : full}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="ucr-age-static">{ageLabel}满科技</span>
              )}
              {data.totalCivCount > COLLAPSE_LIMIT && (
                <div className="ucr-search-wrap">
                  <SearchInput id="bcr-search" value={query} onChange={setQuery} placeholder="搜索文明" label="搜索文明" />
                </div>
              )}
            </div>
            <p className="ucr-count">
              {ageLabel}可建造 <span className="num nw">{data.rows.length}</span> / <span className="num nw">{data.totalCivCount}</span> 个文明
            </p>
          </div>

          {data.rows.length >= 2 && data.champions.length > 0 && (
            <div className="ucr-champs" role="group" aria-label="各项第一">
              <span className="ucr-champs-label">各项第一</span>
              <div className="ucr-champs-list">
                {data.champions.map((champ) => {
                  const active = effectiveSortCol === champ.col && effectiveSortDir === champ.bestDir;
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

          {data.commonTags.length > 0 && <p className="ucr-common">全部文明都有：{data.commonTags.join('、')}</p>}

          {data.category === 'A' && data.garrisonStatus === 'loading' && (
            <p className="bcr-status" role="status" data-t="bcr-garrison-loading">
              <Icon name="clock" />
              <span>正在读取驻军资料，空驻箭和满驻箭稍后显示；其他列已可排序。</span>
            </p>
          )}
          {data.category === 'A' && data.garrisonStatus === 'error' && (
            <div className="bcr-status" role="status" data-t="bcr-garrison-error">
              <span>驻军资料没有读取成功，空驻箭和满驻箭暂显示「—」。</span>
              <button type="button" className="bd-btn bcr-retry" onClick={() => setGarrisonAttempt((n) => n + 1)}>
                <Icon name="rotate-ccw" />
                <span>重试</span>
              </button>
            </div>
          )}

          {narrow && (
            <div className="ucr-mobile-sort">
              <label htmlFor="bcr-sort-select" className="ucr-ms-label">
                排序
              </label>
              <select
                id="bcr-sort-select"
                className="ucr-ms-select"
                value={effectiveSortCol}
                onChange={(e) => {
                  const next = e.target.value as BuildingRankSortCol;
                  setSortCol(next);
                  setSortDir(next === 'civ' ? 'asc' : BUILDING_RANK_COL_META_BY_KEY[next].bestDir);
                }}
              >
                {data.sortableCols.map((col) => {
                  const meta = BUILDING_RANK_COL_META_BY_KEY[col];
                  return (
                    <option key={col} value={col}>
                      {meta.fullLabel}
                    </option>
                  );
                })}
                <option value="civ">文明</option>
              </select>
              <button type="button" className="ucr-ms-dir" onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}>
                <Icon name={effectiveSortDir === 'desc' ? 'arrow-down' : 'arrow-up'} />
                <span>{effectiveSortDir === 'desc' ? '从高到低' : '从低到高'}</span>
              </button>
            </div>
          )}

          {filtered.emptyMessage ? (
            <div className="ucr-empty" data-t="bcr-empty">
              <p>{filtered.emptyMessage}</p>
              <button type="button" className="bd-btn" onClick={() => setQuery('')}>
                清除搜索
              </button>
            </div>
          ) : (
            <>
              <BuildingCivRankTable
                ctx={ctx}
                data={data}
                rows={visibleRows}
                narrow={narrow}
                sortCol={effectiveSortCol}
                sortDir={effectiveSortDir}
                expandedCiv={expandedCiv}
                onSort={handleSort}
                onToggleExpand={(civ) => setExpandedCiv((prev) => (prev === civ ? null : civ))}
              />
              {!query.trim() && collapsibleCount > 0 && (
                <div className="ucr-more-wrap">
                  {hiddenCount > 0 ? (
                    <button type="button" className="bd-btn ucr-more-btn" onClick={() => setShowAll(true)}>
                      <span>
                        显示其余 <span className="num nw">{hiddenCount}</span> 个文明
                      </span>
                      <Icon name="chevron-down" />
                    </button>
                  ) : (
                    <button type="button" className="bd-btn ucr-more-btn" onClick={() => setShowAll(false)}>
                      <span>收起</span>
                      <Icon name="chevron-up" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          <ul className="ucr-notes">
            {data.category === 'A' && <li>空驻箭：没有驻军时每次射出的箭数；满驻箭：驻满能贡献箭矢的单位后的上限，与「驻军预览」同一口径。</li>}
            {building.id === FORTIFIED_CHURCH_ID && churchSample && churchSample.baseProj !== null && churchSample.maxProj !== null && (
              <li>
                强化教堂须驻守圣物才会射箭：空驻军时 <span className="num nw">{churchSample.baseProj} 支</span>，每件圣物 <span className="num nw">+1 支</span>
                ，与村民合计最多 <span className="num nw">{churchSample.maxProj} 支</span>。
              </li>
            )}
            {tcBuildTimes && tcBuildTimes.construction !== null && tcBuildTimes.construction !== building.bt && (
              <li>
                城镇中心按游戏里实际建造的 <span className="num nw">{tcBuildTimes.construction} 秒</span>计算，和上方「面板工期」的{' '}
                <span className="num nw">{building.bt} 秒</span>不是同一个口径。
              </li>
            )}
            {building.id === FISH_TRAP_ID && !data.hasValidConstruction ? (
              <li>养鱼场由渔船建造，「多人施工」只算村民，工期显示「—」，也不提供多人施工入口。</li>
            ) : (
              <li>
                工期 = <span className="num nw">1 名</span>
                村民的施工时间，计入本时代可研究的脚踏起重机等施工科技，与「多人施工」同一口径，和上方「面板工期」不是同一口径。
              </li>
            )}
            {data.rows.length < data.totalCivCount && (
              <li>
                其余 <span className="num nw">{data.totalCivCount - data.rows.length}</span> 个文明要到{AGE_ZH[data.standardAge]}才能建造{building.zh}。
              </li>
            )}
            {data.moveSpeedTechNames.length > 0 && (
              <li>
                {building.zh}受{data.moveSpeedTechNames.join('、')}移速影响，本表未列移速，可在建筑科技模拟器查看。
              </li>
            )}
            {data.hasEstimatedCost && <li>「估算」：含尚未完全解码的造价科技，总价按已解码部分计算。</li>}
            <li>「缺」：本时代其他文明能研究、这个文明研究不了的通用科技。</li>
          </ul>
        </>
      )}
    </section>
  );
}
