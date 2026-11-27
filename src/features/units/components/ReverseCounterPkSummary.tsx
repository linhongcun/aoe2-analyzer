import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../../data';
import type { ReverseCounterState, ReverseCounterUnit } from '../../../domain/reverseCounters';
import type { Trees, Unit } from '../../../domain/types';
import { UnitIcon } from '../../../shared/ui/art';
import { AGE_ZH, PkAvailability } from './ReverseCounterAvailability';

export function getPkUnavailableReason(targetName: string, targetDataWarning: boolean, corePending: boolean, coreError: boolean, state: ReverseCounterState) {
  if (targetDataWarning) return `本单位${targetName}的攻击或护甲类别资料不完整，不能生成 PK。`;
  if (corePending) return '正在重新核验目录资料，暂不能生成 PK。';
  if (coreError) return '目录资料重试失败，暂不能核实 PK。';
  if (state === 'availability-unknown') return '科技树可用性尚未核实，暂不能生成 PK。';
  if (state === 'unreadable') return '本次类别数据无法核实，暂不能生成 PK。';
  return '目录中有部分异常数据，暂不能安全生成 PK。';
}

export function selectPkSummaryMode(
  hasOpenPk: boolean,
  resultState: ReverseCounterState,
  hasFilteredRow: boolean,
  hasBaseRow: boolean,
): 'filtered' | 'retained' | null {
  if (!hasOpenPk) return null;
  if (resultState === 'ready' && hasFilteredRow) return 'filtered';
  return hasBaseRow ? 'retained' : null;
}

interface PkSummaryProps {
  id: string;
  row: ReverseCounterUnit;
  buttonId: string;
  target: Unit;
  targetLabel?: string;
  counterLabel?: string;
  buildingsText?: string | null;
  targetCiv: string;
  enemyCiv: string;
  age: number | null;
  core: Core;
  trees: Trees | null;
  treesPending: boolean;
  treesError: boolean;
  retryTrees: () => void;
  showReadyAvailability?: boolean;
  duelHref: string | null;
  unavailableReason?: string;
  returnFocus: (id: string) => void;
}

export function PkSummary({
  id,
  row,
  buttonId,
  target,
  targetLabel,
  counterLabel,
  buildingsText,
  targetCiv,
  enemyCiv,
  age,
  core,
  trees,
  treesPending,
  treesError,
  retryTrees,
  showReadyAvailability = true,
  duelHref,
  unavailableReason,
  returnFocus,
}: PkSummaryProps) {
  const resolvedTargetLabel = targetLabel ?? target.zh;
  const resolvedCounterLabel = counterLabel ?? row.unit.zh;
  return (
    <div className="ud-reverse-pk" role="region" aria-label="核对单位 PK">
      <h3 tabIndex={-1} id={`reverse-counter-pk-title-${row.unit.id}`}>
        核对单位 PK
      </h3>
      <div className="ud-reverse-pk-sides">
        <div className="ud-reverse-pk-side">
          <span>A · 本单位</span>
          <Link id={`${id}-target-link`} className="ud-reverse-pk-link" to={`/unit/${target.id}`}>
            <UnitIcon u={target} />
            <span>{resolvedTargetLabel}</span>
          </Link>
          <span>{civByEn(targetCiv)?.zh ?? '未选择本单位文明'}</span>
        </div>
        <div className="ud-reverse-pk-side">
          <span>B · 敌方单位</span>
          <Link id={`${id}-counter-link`} className="ud-reverse-pk-link" to={`/unit/${row.unit.id}`}>
            <UnitIcon u={row.unit} />
            <span>{resolvedCounterLabel}</span>
          </Link>
          <span>{civByEn(enemyCiv)?.zh ?? '未选择敌方文明'}</span>
          {buildingsText && <span className="ud-reverse-pk-meta">训练建筑：{buildingsText}</span>}
        </div>
      </div>
      <p className="ud-reverse-pk-era">
        双方时代：{age === null ? `${AGE_ZH[4]}（时代不限时用于核对）` : AGE_ZH[age]}
        <span>自选科技：无 · 团队科技：无</span>
      </p>
      {unavailableReason && (
        <p className="ud-reverse-pk-warning" role="status">
          {unavailableReason}
        </p>
      )}
      <PkAvailability
        target={target}
        targetLabel={resolvedTargetLabel}
        counter={row.unit}
        counterLabel={resolvedCounterLabel}
        targetCiv={targetCiv}
        counterCiv={enemyCiv}
        age={age ?? 4}
        core={core}
        trees={trees}
        treesPending={treesPending}
        treesError={treesError}
        retryTrees={retryTrees}
        showReady={showReadyAvailability}
      />
      <p className="ud-reverse-pk-note">PK 会按双方文明效果及现有模型计算，结果与基础目录类别贡献口径不同。</p>
      <div className="ud-reverse-pk-actions">
        {duelHref ? (
          <Link id={`${id}-duel-link`} className="ud-btn ud-reverse-primary" to={duelHref} data-t="reverse-counter-open-duel">
            打开单位 PK
          </Link>
        ) : (
          <button type="button" className="ud-btn ud-reverse-primary" data-t="reverse-counter-open-duel" disabled>
            打开单位 PK（暂不可用）
          </button>
        )}
        <button type="button" className="ud-btn" onClick={() => returnFocus(buttonId)}>
          取消
        </button>
      </div>
    </div>
  );
}

export function RetainedPkSummary({
  id,
  buttonId,
  row,
  unresolved,
  ...props
}: Omit<PkSummaryProps, 'duelHref' | 'unavailableReason'> & { unresolved: boolean }) {
  return (
    <div className="ud-reverse-pk-retained">
      <p className="ud-reverse-pk-retained-note" role="status">
        {unresolved ? '已保留上次选择的 PK 形态；当前筛选目录尚未核实，此形态不表示已通过筛选。' : '上次选择的形态不在当前筛选结果中；不会替换形态或降低时代。'}
      </p>
      <PkSummary
        id={id}
        buttonId={buttonId}
        row={row}
        {...props}
        showReadyAvailability={false}
        duelHref={null}
        unavailableReason={unresolved ? undefined : '所选单位形态不属于当前筛选下可核实的正贡献结果，不能打开 PK；请从当前结果重新选择。'}
      />
    </div>
  );
}
