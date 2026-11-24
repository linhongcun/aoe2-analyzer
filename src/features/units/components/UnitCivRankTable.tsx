import { Fragment, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AGE_ZH } from '../../../domain/ratings';
import {
  buildCivRankSimHref,
  formatRankMetric,
  isRankBestCell,
  RANK_COL_META_BY_KEY,
  RANK_METRIC_COLS,
  type RankMetricCol,
  type RankSortCol,
  type SortDir,
  type UnitCivRankResult,
  type UnitCivRankRow,
} from '../../../domain/unitCivRank';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

interface UnitCivRankTableProps {
  data: UnitCivRankResult;
  rows: readonly UnitCivRankRow[];
  narrow: boolean;
  sortCol: RankSortCol;
  sortDir: SortDir;
  selected: readonly string[];
  expandedCiv: string | null;
  onSort: (col: RankSortCol) => void;
  onToggleSelect: (civ: string) => void;
  onToggleExpand: (civ: string) => void;
}

function handleSimLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    document.getElementById('unit-sim')?.scrollIntoView({ block: 'start' });
  }
}

function CivTags({ row }: { row: UnitCivRankRow }) {
  return (
    <div className="ucr-civ-tags">
      {row.earlyUnlock && <span className="ucr-tag is-early">提前解锁</span>}
      {row.ignoreArmorTech && <span className="ucr-tag is-mech">无视护甲 · {row.ignoreArmorTech}（已计入）</span>}
      {row.unmodeledPills.map((pill) => (
        <span key={pill} className="ucr-tag is-mech">
          未计入：{pill}
        </span>
      ))}
      {row.missingTechs.length > 0 ? (
        <span className="ucr-tag is-miss">
          <span>缺</span>{' '}
          {row.missingTechs.map((t, i) => (
            <Fragment key={t.id}>
              {i > 0 && '、'}
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

function SelectButton({ row, slot, full, onToggle }: { row: UnitCivRankRow; slot: 'A' | 'B' | null; full: boolean; onToggle: (civ: string) => void }) {
  const disabled = slot === null && full;
  const label = slot ? `移出${row.civZh}（已选为 ${slot} 方）` : `选${row.civZh}进单位 PK`;
  return (
    <button
      type="button"
      className={slot ? `ucr-sel-btn is-${slot.toLowerCase()}` : disabled ? 'ucr-sel-btn is-full' : 'ucr-sel-btn'}
      aria-label={label}
      aria-pressed={slot !== null}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onToggle(row.civ);
      }}
    >
      <span className="ucr-circle" aria-hidden="true">
        {slot ?? ''}
      </span>
    </button>
  );
}

function MetricCellContent({ data, row, col }: { data: UnitCivRankResult; row: UnitCivRankRow; col: RankMetricCol }) {
  const value = row[col];
  if (value === null) return <span className="ucr-na">—</span>;
  const best = isRankBestCell(data, col, value);
  const meta = RANK_COL_META_BY_KEY[col];
  const valNode = (
    <span className={best ? 'ucr-best num nw' : 'num nw'} title={best ? (meta.bestDir === 'desc' ? '本列最高' : '本列最低') : undefined}>
      {formatRankMetric(col, value)}
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

function ariaSortFor(active: boolean, dir: SortDir): 'ascending' | 'descending' | 'none' {
  if (!active) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

function sortIconFor(active: boolean, dir: SortDir): 'arrow-up' | 'arrow-down' | 'arrow-up-down' {
  if (!active) return 'arrow-up-down';
  return dir === 'asc' ? 'arrow-up' : 'arrow-down';
}

export function UnitCivRankTable({
  data,
  rows,
  narrow,
  sortCol,
  sortDir,
  selected,
  expandedCiv,
  onSort,
  onToggleSelect,
  onToggleExpand,
}: UnitCivRankTableProps) {
  const showSelectCol = data.canDuel && data.rows.length >= 2;
  const applicableSet = new Set(data.applicableCols);
  const slotOf = (civ: string): 'A' | 'B' | null => {
    const idx = selected.indexOf(civ);
    return idx === 0 ? 'A' : idx === 1 ? 'B' : null;
  };
  const full = selected.length >= 2;
  const ageLabel = AGE_ZH[data.age] ?? `${data.age}时代`;

  if (narrow) {
    const activeMetricCol: RankMetricCol = sortCol === 'civ' ? data.defaultSortCol : sortCol;
    const activeMeta = RANK_COL_META_BY_KEY[activeMetricCol];
    const colSpan = showSelectCol ? 4 : 3;
    return (
      <div className="ucr-table-wrap is-mobile">
        <table className={showSelectCol ? 'ucr-table ucr-table--mobile' : 'ucr-table ucr-table--mobile is-no-duel'}>
          <colgroup>
            {showSelectCol && <col className="ucr-m-sel" />}
            <col className="ucr-m-civ" />
            <col className="ucr-m-val" />
            <col className="ucr-m-exp" />
          </colgroup>
          <thead>
            <tr>
              {showSelectCol && <th scope="col" className="ucr-th-action" aria-label="选入 PK" />}
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
              const slot = slotOf(row.civ);
              const expanded = expandedCiv === row.civ;
              const simHref = buildCivRankSimHref(data.unitId, row, data.age);
              return (
                <Fragment key={row.civ}>
                  <tr className={slot ? 'ucr-row is-selected' : 'ucr-row'} data-civ={row.civ}>
                    {showSelectCol && (
                      <td className="ucr-action-cell">
                        <SelectButton row={row} slot={slot} full={full} onToggle={onToggleSelect} />
                      </td>
                    )}
                    <td className="ucr-civ-cell">
                      <div className="ucr-civ-head">
                        <CivIcon c={{ en: row.civ }} alt="" />
                        <span className="ucr-civ-name">{row.civZh}</span>
                      </div>
                      <CivTags row={row} />
                    </td>
                    <td className="ucr-num-cell is-sorted">
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
                      <td colSpan={colSpan}>
                        <div className="ucr-detail-box">
                          <dl className="ucr-dl">
                            {RANK_METRIC_COLS.map((meta) => (
                              <div key={meta.col} className="ucr-dl-item">
                                <dt>{meta.fullLabel}</dt>
                                <dd>
                                  <MetricCellContent data={data} row={row} col={meta.col} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <Link className="ud-btn ucr-dl-sim" to={simHref} onClick={handleSimLinkClick}>
                            <Icon name="flask-conical" />
                            <span>在模拟器打开{ageLabel}满科技</span>
                          </Link>
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

  return (
    <div className="ucr-table-wrap">
      <table className={showSelectCol ? 'ucr-table ucr-table--desktop' : 'ucr-table ucr-table--desktop is-no-duel'}>
        <colgroup>
          {showSelectCol && <col className="ucr-c-sel" />}
          <col className="ucr-c-civ" />
          {RANK_METRIC_COLS.map((meta) => (
            <col key={meta.col} className={`ucr-c-${meta.col}`} />
          ))}
          <col className="ucr-c-sim" />
        </colgroup>
        <thead>
          <tr>
            {showSelectCol && <th scope="col" className="ucr-th-action" aria-label="选入 PK" />}
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
            {RANK_METRIC_COLS.map((meta) => {
              const sortable = applicableSet.has(meta.col);
              const active = sortCol === meta.col;
              const labelNode = meta.unitLabel ? (
                <span className="ucr-th-stack">
                  <span>{meta.shortLabel}</span>
                  <span className="ucr-th-unit">{meta.unitLabel}</span>
                </span>
              ) : (
                <span>{meta.shortLabel}</span>
              );
              return (
                <th key={meta.col} scope="col" aria-sort={sortable ? ariaSortFor(active, sortDir) : undefined}>
                  {sortable ? (
                    <button type="button" className={active ? 'ucr-sort is-on' : 'ucr-sort'} title={meta.fullLabel} onClick={() => onSort(meta.col)}>
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
            <th scope="col" className="ucr-th-action" aria-label="模拟器" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const slot = slotOf(row.civ);
            const simHref = buildCivRankSimHref(data.unitId, row, data.age);
            return (
              <tr key={row.civ} className={slot ? 'ucr-row is-selected' : 'ucr-row'} data-civ={row.civ}>
                {showSelectCol && (
                  <td className="ucr-action-cell">
                    <SelectButton row={row} slot={slot} full={full} onToggle={onToggleSelect} />
                  </td>
                )}
                <td className={sortCol === 'civ' ? 'ucr-civ-cell is-sorted' : 'ucr-civ-cell'}>
                  <div className="ucr-civ-head">
                    <CivIcon c={{ en: row.civ }} alt="" />
                    <span className="ucr-civ-name">{row.civZh}</span>
                  </div>
                  <CivTags row={row} />
                </td>
                {RANK_METRIC_COLS.map((meta) => (
                  <td key={meta.col} className={sortCol === meta.col ? 'ucr-num-cell is-sorted' : 'ucr-num-cell'}>
                    <MetricCellContent data={data} row={row} col={meta.col} />
                  </td>
                ))}
                <td className="ucr-action-cell">
                  <Link
                    className="ucr-sim-btn"
                    to={simHref}
                    aria-label={`在模拟器打开${row.civZh}${ageLabel}满科技`}
                    title={`在模拟器打开${row.civZh}${ageLabel}满科技`}
                    onClick={handleSimLinkClick}
                  >
                    <Icon name="flask-conical" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
