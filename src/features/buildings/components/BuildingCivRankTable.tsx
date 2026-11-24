import { Fragment, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  buildBuildingRankConstructionHref,
  buildBuildingRankGarrisonHref,
  buildBuildingRankSimHref,
  BUILDING_RANK_COL_META_BY_KEY,
  formatBuildingRankMetric,
  isBuildingRankBestCell,
  type BuildingCivRankContext,
  type BuildingCivRankResult,
  type BuildingCivRankRow,
  type BuildingOpenSlot,
  type BuildingRankMetricCol,
  type BuildingRankSortCol,
  type SortDir,
} from '../../../domain/buildingCivRank';
import { AGE_ZH } from '../../../domain/ratings';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

interface BuildingCivRankTableProps {
  ctx: BuildingCivRankContext;
  data: BuildingCivRankResult;
  rows: readonly BuildingCivRankRow[];
  narrow: boolean;
  sortCol: BuildingRankSortCol;
  sortDir: SortDir;
  expandedCiv: string | null;
  onSort: (col: BuildingRankSortCol) => void;
  onToggleExpand: (civ: string) => void;
}

const WORKSPACE_LINK_STATE = { scrollTo: 'building-workspace' } as const;

function ariaSortFor(active: boolean, dir: SortDir): 'ascending' | 'descending' | 'none' {
  if (!active) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

function sortIconFor(active: boolean, dir: SortDir): 'arrow-up' | 'arrow-down' | 'arrow-up-down' {
  if (!active) return 'arrow-up-down';
  return dir === 'asc' ? 'arrow-up' : 'arrow-down';
}

function BuildingCivTags({ row }: { row: BuildingCivRankRow }) {
  return (
    <div className="ucr-civ-tags">
      {row.earlyUnlock && <span className="ucr-tag is-early">提前解锁</span>}
      {row.tags.map((tag) => (
        <span key={tag} className="ucr-tag is-mech">
          {tag}
        </span>
      ))}
      {row.missingTechs.length > 0 ? (
        <span className="ucr-tag is-miss">
          <span>缺</span>{' '}
          {row.missingTechs.map((t, idx) => (
            <Fragment key={t.id}>
              {idx > 0 && '、'}
              <span className="nw">{t.zh}</span>
            </Fragment>
          ))}
        </span>
      ) : (
        <span className="ucr-all-tech">科技齐全</span>
      )}
    </div>
  );
}

function MetricCellContent({ data, row, col }: { data: BuildingCivRankResult; row: BuildingCivRankRow; col: BuildingRankMetricCol }) {
  if ((col === 'baseProj' || col === 'maxProj') && data.category === 'A' && (data.garrisonStatus === 'idle' || data.garrisonStatus === 'loading')) {
    return <span className="bcr-skel" aria-label="加载中" />;
  }
  const value = row[col];
  if (value === null) {
    return (
      <span className="ucr-na" title={col === 'bt' ? (row.btReason ?? undefined) : undefined}>
        —
      </span>
    );
  }
  const best = isBuildingRankBestCell(data, col, value);
  const meta = BUILDING_RANK_COL_META_BY_KEY[col];
  const valNode = (
    <span className={best ? 'ucr-best num nw' : 'num nw'} title={best ? (meta.bestDir === 'desc' ? '本列最高' : '本列最低') : undefined}>
      {formatBuildingRankMetric(col, value)}
    </span>
  );
  if (col === 'totalCost' && row.estimatedCost) {
    return (
      <span className="ucr-cost-stack">
        <span className="ucr-est">估算</span>
        {valNode}
      </span>
    );
  }
  return valNode;
}

function DesktopOpenCell({
  ctx,
  data,
  row,
  ageLabel,
}: {
  ctx: BuildingCivRankContext;
  data: BuildingCivRankResult;
  row: BuildingCivRankRow;
  ageLabel: string;
}) {
  const simHref = buildBuildingRankSimHref(data.buildingId, row, data.age);
  const garrisonHref = data.isGarrisonHost ? buildBuildingRankGarrisonHref(data.buildingId, row, data.age) : null;
  const constructionHref = buildBuildingRankConstructionHref(ctx, data.buildingId, row, data.age);

  const renderSlot = (slot: BuildingOpenSlot) => {
    if (slot === 'sim') {
      const label = `在模拟器打开${row.civZh}${ageLabel}满科技`;
      return (
        <Link key="sim" className="ucr-sim-btn" to={simHref} state={WORKSPACE_LINK_STATE} aria-label={label} title={label} data-bcr-open="sim">
          <Icon name="flask-conical" />
        </Link>
      );
    }
    if (slot === 'garrison') {
      if (!garrisonHref) return <span key="garrison" className="bcr-open-empty" aria-hidden="true" />;
      const label = `打开${row.civZh}驻军预览`;
      return (
        <Link key="garrison" className="ucr-sim-btn" to={garrisonHref} state={WORKSPACE_LINK_STATE} aria-label={label} title={label} data-bcr-open="garrison">
          <Icon name="shield" />
        </Link>
      );
    }
    if (!constructionHref) return <span key="construction" className="bcr-open-empty" aria-hidden="true" />;
    const label = `比较${row.civZh}多人施工`;
    return (
      <Link key="construction" className="ucr-sim-btn" to={constructionHref} aria-label={label} title={label} data-bcr-open="construction">
        <Icon name="users" />
      </Link>
    );
  };

  return (
    <td className="ucr-action-cell">
      <div className="bcr-open-group">{data.openSlots.map(renderSlot)}</div>
    </td>
  );
}

export function BuildingCivRankTable({ ctx, data, rows, narrow, sortCol, sortDir, expandedCiv, onSort, onToggleExpand }: BuildingCivRankTableProps) {
  const sortableSet = new Set(data.sortableCols);
  const ageLabel = AGE_ZH[data.age] ?? `${data.age}时代`;

  if (narrow) {
    const activeMetricCol: BuildingRankMetricCol = sortCol === 'civ' ? data.defaultSortCol : sortCol;
    const activeMeta = BUILDING_RANK_COL_META_BY_KEY[activeMetricCol];
    return (
      <div className="ucr-table-wrap is-mobile">
        <table className="ucr-table ucr-table--mobile">
          <colgroup>
            <col className="ucr-m-civ" />
            <col className="ucr-m-val" />
            <col className="ucr-m-exp" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="ucr-th-civ-static">
                文明
              </th>
              <th scope="col" className="ucr-th-num-static" title={activeMeta.fullLabel}>
                {activeMeta.unitLabel ? `${activeMeta.shortLabel} ${activeMeta.unitLabel}` : activeMeta.shortLabel}
              </th>
              <th scope="col" className="ucr-th-action" aria-label="展开明细" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = expandedCiv === row.civ;
              const simHref = buildBuildingRankSimHref(data.buildingId, row, data.age);
              const garrisonHref = data.isGarrisonHost ? buildBuildingRankGarrisonHref(data.buildingId, row, data.age) : null;
              const constructionHref = buildBuildingRankConstructionHref(ctx, data.buildingId, row, data.age);
              return (
                <Fragment key={row.civ}>
                  <tr className="ucr-row" data-civ={row.civ}>
                    <td className={sortCol === 'civ' ? 'ucr-civ-cell is-sorted' : 'ucr-civ-cell'}>
                      <div className="ucr-civ-head">
                        <CivIcon c={{ en: row.civ }} alt="" />
                        <span className="ucr-civ-name">{row.civZh}</span>
                      </div>
                      <BuildingCivTags row={row} />
                    </td>
                    <td className={sortCol === 'civ' ? 'ucr-num-cell' : 'ucr-num-cell is-sorted'}>
                      <MetricCellContent data={data} row={row} col={activeMetricCol} />
                    </td>
                    <td className="ucr-action-cell">
                      <button
                        type="button"
                        className="ucr-exp-btn"
                        aria-expanded={expanded}
                        aria-label={expanded ? `收起${row.civZh}明细` : `展开${row.civZh}明细`}
                        onClick={() => onToggleExpand(row.civ)}
                      >
                        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="ucr-detail-row" data-civ-detail={row.civ}>
                      <td colSpan={3}>
                        <div className="ucr-detail-box">
                          <dl className="ucr-dl">
                            {data.visibleCols.map((col) => {
                              const meta = BUILDING_RANK_COL_META_BY_KEY[col];
                              return (
                                <div key={col} className="ucr-dl-item">
                                  <dt>{meta.fullLabel}</dt>
                                  <dd>
                                    <MetricCellContent data={data} row={row} col={col} />
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                          <div className="bcr-dl-actions">
                            <Link className="bd-btn ucr-dl-sim" to={simHref} state={WORKSPACE_LINK_STATE} data-bcr-open="sim">
                              <Icon name="flask-conical" />
                              <span>在模拟器打开{ageLabel}满科技</span>
                            </Link>
                            {garrisonHref && (
                              <Link className="bd-btn ucr-dl-sim" to={garrisonHref} state={WORKSPACE_LINK_STATE} data-bcr-open="garrison">
                                <Icon name="shield" />
                                <span>打开驻军预览</span>
                              </Link>
                            )}
                            {constructionHref && (
                              <Link className="bd-btn ucr-dl-sim" to={constructionHref} data-bcr-open="construction">
                                <Icon name="users" />
                                <span>比较多人施工</span>
                              </Link>
                            )}
                          </div>
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
    );
  }

  const desktopStyle = { '--bcr-min-w': `${data.desktopMinWidthPx}px` } as CSSProperties;

  return (
    <div className="ucr-table-wrap">
      <table className="ucr-table bcr-table--desktop" style={desktopStyle}>
        <colgroup>
          <col className="ucr-c-civ" />
          {data.visibleCols.map((col) => (
            <col key={col} className={`bcr-c-${col}`} />
          ))}
          <col className={`bcr-c-open-${data.openSlots.length}`} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSortFor(sortCol === 'civ', sortDir)}>
              <button
                type="button"
                className={sortCol === 'civ' ? 'ucr-sort is-civ is-on' : 'ucr-sort is-civ'}
                title="按文明英文名排序"
                onClick={() => onSort('civ')}
              >
                <span>文明</span>
                <Icon name={sortIconFor(sortCol === 'civ', sortDir)} />
              </button>
            </th>
            {data.visibleCols.map((col) => {
              const meta = BUILDING_RANK_COL_META_BY_KEY[col];
              const sortable = sortableSet.has(col);
              const active = sortCol === col;
              const labelNode = meta.unitLabel ? (
                <span className="ucr-th-stack">
                  <span>{meta.shortLabel}</span>
                  <span className="ucr-th-unit">{meta.unitLabel}</span>
                </span>
              ) : (
                <span>{meta.shortLabel}</span>
              );
              return (
                <th key={col} scope="col" aria-sort={sortable ? ariaSortFor(active, sortDir) : undefined}>
                  {sortable ? (
                    <button type="button" className={active ? 'ucr-sort is-on' : 'ucr-sort'} title={meta.fullLabel} onClick={() => onSort(col)}>
                      {labelNode}
                      <Icon name={sortIconFor(active, sortDir)} />
                    </button>
                  ) : (
                    <span className="ucr-th-na" title={meta.fullLabel}>
                      {labelNode}
                    </span>
                  )}
                </th>
              );
            })}
            <th scope="col">
              <span className="bcr-th-open">打开</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.civ} className="ucr-row" data-civ={row.civ}>
              <td className={sortCol === 'civ' ? 'ucr-civ-cell is-sorted' : 'ucr-civ-cell'}>
                <div className="ucr-civ-head">
                  <CivIcon c={{ en: row.civ }} alt="" />
                  <span className="ucr-civ-name">{row.civZh}</span>
                </div>
                <BuildingCivTags row={row} />
              </td>
              {data.visibleCols.map((col) => (
                <td key={col} className={sortCol === col ? 'ucr-num-cell is-sorted' : 'ucr-num-cell'}>
                  <MetricCellContent data={data} row={row} col={col} />
                </td>
              ))}
              <DesktopOpenCell ctx={ctx} data={data} row={row} ageLabel={ageLabel} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
