import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AGE_ZH } from '../../../domain/ratings';
import {
  DUEL_BUDGET_DEFAULT,
  NO_NORMAL_ATTACK_REASON,
  type RankMetricCol,
  type RankSortCol,
  type SortDir,
  type UnitCivRankChampion,
  type UnitCivRankResult,
  type UnitCivRankRow,
} from '../../../domain/unitCivRank';
import type { UnitCivRankFilterTech, UnitRankEmptyState, UnitRankUrlNotice } from '../../../domain/unitCivRankFilter';
import { CivIcon, TechIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

export interface UnitCivRankAgeNotice {
  nextAgeZh: string;
  removedNames: string[];
}

interface UnitCivRankTechFilterProps {
  filterTechs: readonly UnitCivRankFilterTech[];
  selectedTechIds: readonly number[];
  matchedCount: number;
  totalCount: number;
  ageNotice: UnitCivRankAgeNotice | null;
  urlNotice: UnitRankUrlNotice | null;
  onToggleTech: (techId: number) => void;
  onClearTechs: () => void;
  onDismissUrlNotice: () => void;
}

function AgeRemovedNotice({ notice }: { notice: UnitCivRankAgeNotice }) {
  return (
    <div className="ucr-tf-notice" role="status" data-t="ucr-tech-age-notice">
      <span className="ucr-tf-notice-body">
        <Icon name="info" />
        <span>
          切至{notice.nextAgeZh}已自动移出不再适用的科技：
          {notice.removedNames.map((name, idx) => (
            <Fragment key={name}>
              {idx > 0 && '、'}
              <span className="nw">{name}</span>
            </Fragment>
          ))}
          。
        </span>
      </span>
    </div>
  );
}

function UrlWarnNotice({ notice, onDismiss }: { notice: UnitRankUrlNotice; onDismiss: () => void }) {
  const ignoredNodes = notice.ignoredTokens.map((tok, idx) => (
    <Fragment key={`${tok}-${idx}`}>
      {idx > 0 && '、'}
      <span className="num nw">{tok}</span>
    </Fragment>
  ));
  return (
    <div className="ucr-tf-notice is-warn" role="status" data-t="ucr-tech-url-notice">
      <span className="ucr-tf-notice-body">
        <Icon name="triangle-alert" />
        <span>
          {notice.kind === 'partial' ? (
            <>链接中的部分科技参数对当前单位或时代不适用（已忽略：{ignoredNodes}），已保留有效筛选。</>
          ) : (
            <>链接中的科技筛选参数无效或对当前单位/时代不适用（已忽略：{ignoredNodes}），当前显示全部可训练文明。</>
          )}
        </span>
      </span>
      <button type="button" className="ucr-tf-notice-btn" data-t="ucr-tech-url-dismiss" onClick={onDismiss}>
        {notice.kind === 'partial' ? '知道了' : '清除无效参数'}
      </button>
    </div>
  );
}

/** issue 1567：单位详情「各文明满科技对照」科技多选反查芯片区与状态提示。 */
export function UnitCivRankTechFilter({
  filterTechs,
  selectedTechIds,
  matchedCount,
  totalCount,
  ageNotice,
  urlNotice,
  onToggleTech,
  onClearTechs,
  onDismissUrlNotice,
}: UnitCivRankTechFilterProps) {
  if (filterTechs.length === 0) {
    if (!ageNotice && !urlNotice) return null;
    return (
      <div className="ucr-tf-standalone">
        {ageNotice && <AgeRemovedNotice notice={ageNotice} />}
        {urlNotice && <UrlWarnNotice notice={urlNotice} onDismiss={onDismissUrlNotice} />}
      </div>
    );
  }

  const selectedSet = new Set(selectedTechIds);
  const selectedCount = selectedTechIds.length;

  return (
    <div className="ucr-tech-filter" role="region" aria-label="按本单位适用科技筛选" data-t="ucr-tech-filter">
      <div className="ucr-tf-head">
        <div className="ucr-tf-title-group">
          <Icon name="filter" className="ic ucr-tf-ic" />
          <span className="ucr-tf-label">按本单位适用科技筛选</span>
          <span className="ucr-tf-sub">
            {selectedCount === 0 ? (
              '多选同时具备（AND）· 仅列存在文明差异的科技'
            ) : (
              <>
                已选 <span className="num nw">{selectedCount} 项</span>（同时具备）· 命中 <span className="num nw">{matchedCount}</span> /{' '}
                <span className="num nw">{totalCount}</span> 个文明
              </>
            )}
          </span>
        </div>
        {selectedCount > 0 && (
          <button type="button" className="ucr-tf-clear" data-t="ucr-tech-clear" onClick={onClearTechs}>
            <Icon name="x" />
            <span>清空科技筛选</span>
          </button>
        )}
      </div>
      <div className="ucr-tf-list">
        {filterTechs.map((t) => {
          const active = selectedSet.has(t.id);
          const techAgeZh = AGE_ZH[t.age] ?? `${t.age}时代`;
          return (
            <button
              key={t.id}
              type="button"
              className={active ? 'ucr-tf-chip is-on' : 'ucr-tf-chip'}
              aria-pressed={active}
              data-tech-id={t.id}
              title={`${t.zh}（${techAgeZh} · ${t.buildingZh} · ${t.availableCount}/${t.totalCount} 个文明可用）`}
              onClick={() => onToggleTech(t.id)}
            >
              <TechIcon t={t} />
              <span className="ucr-tf-body">
                <span className="ucr-tf-name">{t.zh}</span>
                <span className="ucr-tf-meta">
                  <span>{t.buildingZh}</span>
                  <span className="num nw">
                    {t.availableCount}/{t.totalCount}
                  </span>
                </span>
              </span>
              <span className="ucr-tf-check" aria-hidden="true">
                {active && <Icon name="check" />}
              </span>
            </button>
          );
        })}
      </div>
      {ageNotice && <AgeRemovedNotice notice={ageNotice} />}
      {urlNotice && <UrlWarnNotice notice={urlNotice} onDismiss={onDismissUrlNotice} />}
    </div>
  );
}

interface UnitCivRankEmptyProps {
  emptyState: Exclude<UnitRankEmptyState, { kind: 'none' }>;
  ageLabel: string;
  unitZh: string;
  onClearTechs: () => void;
  onClearSearch: () => void;
}

/** issue 1567：三类空态视图（科技组合 0 匹配 / 科技非空+搜索 0 匹配 / 仅文明搜索 0 匹配）。 */
export function UnitCivRankEmpty({ emptyState, ageLabel, unitZh, onClearTechs, onClearSearch }: UnitCivRankEmptyProps) {
  if (emptyState.kind === 'search-only') {
    return (
      <div className="ucr-empty" data-t="ucr-empty">
        <p>{emptyState.message}</p>
        <button type="button" className="ud-btn" onClick={onClearSearch}>
          清除搜索
        </button>
      </div>
    );
  }
  if (emptyState.kind === 'tech-zero') {
    return (
      <div className="ucr-empty" data-t="ucr-empty">
        <p>
          没有文明在{ageLabel}同时具备所选的 <span className="num nw">{emptyState.selectedTechs.length} 项</span>科技（
          {emptyState.selectedTechs.map((t, idx) => (
            <Fragment key={t.id}>
              {idx > 0 && ' + '}
              <span className="nw">{t.zh}</span>
            </Fragment>
          ))}
          ）。
        </p>
        <div className="ucr-empty-actions">
          <button type="button" className="ud-btn" data-t="ucr-empty-clear-tech" onClick={onClearTechs}>
            清空科技筛选
          </button>
          {emptyState.hasQuery && (
            <button type="button" className="ud-btn" data-t="ucr-empty-clear-search" onClick={onClearSearch}>
              清除搜索
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="ucr-empty" data-t="ucr-empty">
      <p>
        {emptyState.kind === 'tech-plus-search-excluded' ? (
          <>
            在当前科技筛选结果（<span className="num nw">{emptyState.matchedTechCount}</span> 个文明）中未找到「{emptyState.query}」；该文明可训练{unitZh}
            ，但缺少部分已选科技。
          </>
        ) : (
          <>
            在当前科技筛选结果中未找到「{emptyState.query}」（{emptyState.baseMessage}）。
          </>
        )}
      </p>
      <div className="ucr-empty-actions">
        <button type="button" className="ud-btn" data-t="ucr-empty-clear-search" onClick={onClearSearch}>
          清除搜索
        </button>
        <button type="button" className="ud-btn" data-t="ucr-empty-clear-tech" onClick={onClearTechs}>
          清空科技筛选
        </button>
      </div>
    </div>
  );
}

interface UnitCivRankChampionsProps {
  champions: readonly UnitCivRankChampion[];
  matchedCount: number;
  hasActiveTechFilter: boolean;
  sortCol: RankSortCol;
  sortDir: SortDir;
  onSelectChampion: (col: RankMetricCol, bestDir: SortDir) => void;
}

/** issue 1567：「各项第一」快捷排序胶囊组（科技筛选启用时展示当前子集家数）。 */
export function UnitCivRankChampions({ champions, matchedCount, hasActiveTechFilter, sortCol, sortDir, onSelectChampion }: UnitCivRankChampionsProps) {
  if (matchedCount < 2 || champions.length === 0) return null;
  return (
    <div className="ucr-champs" role="group" aria-label="各项第一">
      <span className="ucr-champs-label">
        {hasActiveTechFilter ? (
          <>
            各项第一（当前 <span className="num nw">{matchedCount}</span> 家）
          </>
        ) : (
          '各项第一'
        )}
      </span>
      <div className="ucr-champs-list">
        {champions.map((champ) => {
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
              onClick={() => onSelectChampion(champ.col, champ.bestDir)}
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
  );
}

interface UnitCivRankPkBarProps {
  data: Pick<UnitCivRankResult, 'canDuel' | 'rows' | 'standardAge' | 'combatKind'>;
  techFilteredRows: readonly UnitCivRankRow[];
  selectedRows: readonly UnitCivRankRow[];
  removedNotice: string | null;
  ageLabel: string;
  narrow: boolean;
  canLaunchDuel: boolean;
  duelHref: string;
  onToggleSelect: (civ: string) => void;
  onClearSelect: () => void;
}

/** issue 1567：单位 PK 槽位条（支持科技筛选命中 < 2 家优先禁用提示与移出状态播报）。 */
export function UnitCivRankPkBar({
  data,
  techFilteredRows,
  selectedRows,
  removedNotice,
  ageLabel,
  narrow,
  canLaunchDuel,
  duelHref,
  onToggleSelect,
  onClearSelect,
}: UnitCivRankPkBarProps) {
  const duelBtnLabel = narrow ? (
    '去 PK'
  ) : data.combatKind === 'suicide' ? (
    <>
      <span className="num nw">1v1</span> 对打
    </>
  ) : (
    <>
      等资源 <span className="num nw">{DUEL_BUDGET_DEFAULT}</span> 对打
    </>
  );

  return (
    <div className="ucr-pk" data-t="ucr-pk-bar">
      {removedNotice && (
        <p className="ucr-notice" role="status" data-t="ucr-pk-notice">
          {removedNotice}
        </p>
      )}
      {!data.canDuel ? (
        <p className="ucr-pk-disabled">{NO_NORMAL_ATTACK_REASON}，不适用单位 PK。</p>
      ) : data.rows.length < 2 ? (
        <p className="ucr-pk-disabled">
          {ageLabel}只有 <span className="num nw">1</span> 个文明能训练，没有可对打的另一方。切到{AGE_ZH[data.standardAge]}可选两个文明。
        </p>
      ) : techFilteredRows.length < 2 ? (
        <div className="ucr-pk-row">
          <div className="ucr-pk-slots">
            <span className="ucr-pk-title">单位 PK</span>
            <span className="ucr-pk-hint">
              {techFilteredRows.length === 1 ? (
                <>
                  当前筛选仅命中 <span className="num nw">1</span> 个文明（{techFilteredRows[0]!.civZh}），减少或清空科技筛选后可选两家对打。
                </>
              ) : (
                <>
                  当前筛选命中 <span className="num nw">0</span> 个文明，减少或清空科技筛选后可选两家对打。
                </>
              )}
            </span>
          </div>
          <div className="ucr-pk-actions">
            <button type="button" className="ucr-pk-go is-disabled" aria-disabled="true" data-t="ucr-pk-go" onClick={(e) => e.preventDefault()}>
              <Icon name="swords" />
              <span>{duelBtnLabel}</span>
              <Icon name="arrow-right" />
            </button>
          </div>
        </div>
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
                    <button type="button" className="ucr-chip-x" aria-label={`移出${row.civZh}`} onClick={() => onToggleSelect(row.civ)}>
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
              <button type="button" className="ud-btn ucr-clear-btn" onClick={onClearSelect}>
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
  );
}
