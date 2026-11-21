import { Link } from 'react-router-dom';
import type { Core } from '../../../data';
import { hasValidCombatPairs, reverseCounterDuelHref, type ReverseCounterGroup } from '../../../domain/reverseCounters';
import type { Unit, Trees } from '../../../domain/types';
import { UnitIcon } from '../../../shared/ui/art';
import { PkSummary } from './ReverseCounterPkSummary';

const groupId = (category: string) => `reverse-counter-group-${encodeURIComponent(category)}`;
export const rowId = (category: string, id: number) => `reverse-counter-row-${encodeURIComponent(category)}-${id}`;
export const pkButtonId = (category: string, id: number) => `reverse-counter-pk-${encodeURIComponent(category)}-${id}`;

export function CounterGroup({
  group,
  collapsed,
  expanded,
  onToggle,
  onExpandRows,
  onOpenPk,
  openPk,
  target,
  targetCiv,
  enemyCiv,
  age,
  core,
  trees,
  treesPending,
  treesError,
  retryTrees,
  pkAllowed,
  pkUnavailableReason,
  filterActive,
  showNoRows,
  returnFocus,
}: {
  group: ReverseCounterGroup;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpandRows: () => void;
  onOpenPk: (id: number, buttonId: string) => void;
  openPk: number | null;
  target: Unit;
  targetCiv: string;
  enemyCiv: string;
  age: number | null;
  core: Core;
  trees: Trees | null;
  treesPending: boolean;
  treesError: boolean;
  retryTrees: () => void;
  pkAllowed: boolean;
  pkUnavailableReason: string;
  filterActive: boolean;
  showNoRows: boolean;
  returnFocus: (id: string) => void;
}) {
  const detailOnly = !core.unitById[target.id];
  const visibleRows = expanded ? group.rows : group.rows.slice(0, 5);
  const ariaId = groupId(group.category);
  return (
    <section className="ud-reverse-group" data-reverse-group="" data-t="reverse-counter-group" id={ariaId} tabIndex={-1}>
      <button type="button" className="ud-reverse-group-toggle" aria-expanded={!collapsed} aria-controls={`${ariaId}-rows`} onClick={onToggle}>
        <span>{group.category}</span>
        <span className="ud-reverse-count">
          本单位该类护甲 <span className="num nw">{group.armor}</span> · <span className="num nw">{group.rows.length} 项</span>
        </span>
        <span className="ud-btn">{collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <div id={`${ariaId}-rows`} className="ud-reverse-rows">
          {visibleRows.length > 0 && (
            <div className="ud-reverse-table-head" aria-hidden="true">
              <span>敌方单位形态</span>
              <span>该类攻击</span>
              <span>目标该类护甲</span>
              <span>类别贡献</span>
              <span />
            </div>
          )}
          {visibleRows.map((row) => {
            const id = rowId(group.category, row.unit.id);
            const buttonId = pkButtonId(group.category, row.unit.id);
            const counterCombatValid = hasValidCombatPairs(row.unit);
            const rowPkAllowed = pkAllowed && counterCombatValid;
            const selectedMember = row.members.find((member) => member.id === openPk) ?? null;
            const selectedRow = selectedMember ? { ...row, unit: selectedMember } : null;
            const selectedPkAllowed = rowPkAllowed && !!selectedMember && hasValidCombatPairs(selectedMember);
            const duelHref =
              selectedMember && selectedPkAllowed && trees && !treesError && !treesPending && targetCiv && enemyCiv
                ? reverseCounterDuelHref(target, selectedMember, core, trees, targetCiv, enemyCiv, age ?? 4)
                : null;
            return (
              <div className="ud-reverse-row-wrap" data-reverse-row="" id={id} key={row.unit.id} tabIndex={-1}>
                <div className="ud-reverse-row">
                  <Link id={`${id}-unit-link`} className="ud-reverse-unit" to={`/unit/${row.unit.id}`} data-t="reverse-counter-link">
                    <UnitIcon u={row.unit} />
                    <span>
                      <strong>{row.unit.zh}</strong>
                      <small>{row.unit.en}</small>
                    </span>
                  </Link>
                  <span className="ud-reverse-value">
                    <span className="ud-reverse-mobile-label">该类攻击</span>
                    <span className="num nw">{row.attack}</span>
                  </span>
                  <span className="ud-reverse-value">
                    <span className="ud-reverse-mobile-label">目标该类护甲</span>
                    <span className="num nw">{row.armor}</span>
                  </span>
                  <strong className="ud-reverse-damage">
                    <span className="ud-reverse-mobile-label">类别贡献</span>
                    <span className="num nw">+{row.damage}</span>
                  </strong>
                  {!detailOnly && (
                    <button
                      id={buttonId}
                      type="button"
                      className="ud-btn ud-reverse-pk-button"
                      data-t="reverse-counter-pk"
                      disabled={!rowPkAllowed}
                      aria-expanded={!!selectedMember}
                      onClick={() => onOpenPk(row.unit.id, buttonId)}
                    >
                      核对 PK
                    </button>
                  )}
                </div>
                {!detailOnly && !rowPkAllowed && (
                  <p className="ud-reverse-pk-disabled" role="status">
                    {counterCombatValid ? pkUnavailableReason : `敌方单位${row.unit.zh}的攻击、护甲或护甲类别资料异常，不能生成 PK。`}
                  </p>
                )}
                {selectedRow && (
                  <PkSummary
                    id={id}
                    row={selectedRow}
                    buttonId={buttonId}
                    target={target}
                    targetCiv={targetCiv}
                    enemyCiv={enemyCiv}
                    age={age}
                    core={core}
                    trees={trees}
                    treesPending={treesPending}
                    treesError={treesError}
                    retryTrees={retryTrees}
                    duelHref={duelHref}
                    returnFocus={returnFocus}
                  />
                )}
              </div>
            );
          })}
          {group.rows.length > 5 && (
            <button type="button" className="ud-btn ud-reverse-more" onClick={onExpandRows}>
              {expanded ? (
                '收起其余单位'
              ) : (
                <>
                  展开本类其余 <span className="num nw">{group.rows.length - 5} 个单位</span>
                </>
              )}
            </button>
          )}
          {!group.rows.length && showNoRows && (
            <p className="ud-reverse-no-row">{filterActive ? '当前筛选下没有该类别的正贡献匹配。' : '基础目录未找到该类别的正贡献匹配。'}</p>
          )}
        </div>
      )}
    </section>
  );
}
