import type { KeyboardEvent, ReactNode } from 'react';
import type { LadderSnapshot } from '../../domain/ladder';
import { eloFilterOptions, renderedEloOptions, type EloFilterOption, type LadderModeId } from '../../domain/ladderQuery';
import { Icon } from '../../shared/ui/Icon';

export function HideLowSample({ checked, threshold, onChange }: { checked: boolean; threshold: number; onChange: (checked: boolean) => void }) {
  return (
    <label className="ladder-hide">
      <input type="checkbox" checked={checked} data-testid="ladder-hide-low" data-threshold={threshold} onChange={(event) => onChange(event.target.checked)} />
      隐藏低样本
    </label>
  );
}

export function LadderFilters({
  mode,
  elo,
  arabia,
  team,
  onMode,
  onElo,
  onEloRef,
  children,
}: {
  mode: LadderModeId;
  elo: string;
  arabia: LadderSnapshot;
  team: LadderSnapshot;
  onMode: (mode: LadderModeId) => void;
  onElo: (option: EloFilterOption) => void;
  onEloRef?: (id: string, node: HTMLButtonElement | null) => void;
  children?: ReactNode;
}) {
  const options = eloFilterOptions(mode, elo, arabia, team);
  const visible = renderedEloOptions(options);
  const hasOtherGap = options.some((option) => !option.enabled && !option.current);
  const checked = visible.some((option) => option.current);
  const onEloKey = (event: KeyboardEvent<HTMLButtonElement>, option: EloFilterOption) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const from = visible.findIndex((item) => item.key === option.key);
    if (from < 0) return;
    let target: number;
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = visible.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (from + 1) % visible.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (from - 1 + visible.length) % visible.length;
    else return;
    event.preventDefault();
    const next = visible[target];
    if (!next) return;
    if (!next.enabled) {
      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-elo="${CSS.escape(next.key)}"]`)?.focus();
      return;
    }
    onElo(next);
  };
  return (
    <div className="ladder-filters" data-testid="ladder-filters">
      <div className="ladder-filter-line">
        <span className="ladder-filter-label">模式</span>
        <div className="ladder-filter-row" role="radiogroup" aria-label="模式" data-testid="ladder-mode">
          <ModeChip id="4v4" mode={mode} icon="users" testId="ladder-mode-4v4" onMode={onMode}>
            <span className="nw">4v4</span> 随机地图
          </ModeChip>
          <ModeChip id="arabia1v1" mode={mode} icon="swords" testId="ladder-mode-arabia1v1" onMode={onMode}>
            阿拉伯 <span className="nw">1v1</span>
          </ModeChip>
        </div>
        <span className="ladder-filter-label">天梯分段</span>
        <div className="ladder-filter-row" role="radiogroup" aria-label="天梯分段" data-testid="ladder-elo">
          {visible.map((option, index) => {
            const firstEnabled = visible.findIndex((item) => item.enabled) === index;
            return (
              <button
                key={`${option.mode}:${option.key}`}
                // 保留内联 ref：选中属性更新或子树替换后，都交由根组件恢复焦点。
                ref={(node) => onEloRef?.(`${option.mode}:${option.key}`, node)}
                type="button"
                role="radio"
                aria-checked={option.current}
                aria-disabled={!option.enabled}
                tabIndex={option.current || (!checked && firstEnabled) ? 0 : -1}
                className="ladder-elo-option"
                data-testid={option.enabled ? 'ladder-elo-option' : 'ladder-elo-disabled'}
                data-elo={option.key}
                data-target-mode={option.enabled ? option.mode : undefined}
                onClick={() => {
                  if (option.enabled) onElo(option);
                }}
                onKeyDown={(event) => onEloKey(event, option)}
              >
                <span className="nw">{option.label}</span>
                {!option.enabled && <span className="ladder-fixed">暂无数据</span>}
              </button>
            );
          })}
        </div>
        {children}
      </div>
      {hasOtherGap && (
        <p className="ladder-elo-gap" data-testid="ladder-elo-gap">
          其他 Elo 分段暂无本模式快照，不估算。
        </p>
      )}
      <p className="ladder-fixed-note" data-testid="ladder-fixed-range">
        {mode === '4v4' ? (
          <>
            近 <span className="nw">90 天</span>、全图是当前快照的固定范围，不是可改筛选。
          </>
        ) : (
          '整段快照、阿拉伯是当前快照的固定范围，不是可改筛选。'
        )}
      </p>
    </div>
  );
}

function ModeChip({
  id,
  mode,
  icon,
  testId,
  onMode,
  children,
}: {
  id: LadderModeId;
  mode: LadderModeId;
  icon: 'users' | 'swords';
  testId: string;
  onMode: (mode: LadderModeId) => void;
  children: ReactNode;
}) {
  const checked = mode === id;
  return (
    <button type="button" role="radio" aria-checked={checked} className="ladder-mode-chip" data-testid={testId} data-mode={id} onClick={() => onMode(id)}>
      <Icon name={icon} />
      {children}
    </button>
  );
}
