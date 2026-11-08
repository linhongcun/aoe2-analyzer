import type { KeyboardEvent, ReactNode } from 'react';
import type { LadderSnapshot } from '../../domain/ladder';
import type { InsightsMapKey } from '../../domain/ladderInsights';
import { eloFilterOptions, insightsMapOptions, type EloFilterOption, type LadderModeId, type MapFilterOption } from '../../domain/ladderQuery';
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
  insightsMap,
  insightsAvailable,
  onMode,
  onElo,
  onMap,
  onEloRef,
}: {
  mode: LadderModeId;
  elo: string;
  arabia: LadderSnapshot;
  team: LadderSnapshot;
  insightsMap: InsightsMapKey | null;
  insightsAvailable: readonly InsightsMapKey[];
  onMode: (mode: LadderModeId) => void;
  onElo: (option: EloFilterOption) => void;
  onMap: (option: MapFilterOption) => void;
  onEloRef?: (id: string, node: HTMLButtonElement | null) => void;
}) {
  const teamMode = mode === '4v4';
  const insights = insightsMap != null && mode === 'arabia1v1';
  const eloOptions = eloFilterOptions(mode, elo, arabia, team).map((option) => (insights ? { ...option, enabled: false, current: false } : option));
  const mapOptions = insightsMapOptions(mode, insightsMap, insightsAvailable);
  const checked = eloOptions.some((option) => option.current);
  const onEloKey = (event: KeyboardEvent<HTMLButtonElement>, option: EloFilterOption) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const enabled = eloOptions.filter((item) => item.enabled);
    const from = enabled.findIndex((item) => item.mode === option.mode && item.key === option.key);
    if (from < 0) return;
    let target: number;
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = enabled.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (from + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (from - 1 + enabled.length) % enabled.length;
    else return;
    event.preventDefault();
    onElo(enabled[target]!);
  };
  return (
    <div className="ladder-filters" data-testid="ladder-filters">
      <span className="ladder-filter-label">模式</span>
      <div className="ladder-filter-row" role="radiogroup" aria-label="模式" data-testid="ladder-mode">
        <ModeChip id="4v4" mode={mode} icon="users" testId="ladder-mode-4v4" onMode={onMode}>
          <span className="nw">4v4</span> 随机地图
        </ModeChip>
        <ModeChip id="arabia1v1" mode={mode} icon="swords" testId="ladder-mode-arabia1v1" onMode={onMode}>
          阿拉伯 <span className="nw">1v1</span>
        </ModeChip>
      </div>
      <span className="ladder-filter-label">时段</span>
      <div className="ladder-filter-row">
        <span className="ladder-pill" data-testid="ladder-period-static">
          <Icon name="calendar" />
          {insights ? (
            '全时段'
          ) : teamMode ? (
            <>
              近 <span className="nw">90 天</span>
            </>
          ) : (
            '整段快照'
          )}
          <span className="ladder-fixed">{insights ? '未按补丁筛选' : '当前快照'}</span>
        </span>
      </div>
      <span className="ladder-filter-label">天梯分段</span>
      <div className="ladder-filter-row" role="radiogroup" aria-label="天梯分段" data-testid="ladder-elo">
        {eloOptions.map((option, index) => {
          const firstEnabled = eloOptions.findIndex((item) => item.enabled) === index;
          return (
            <button
              key={`${option.mode}:${option.key}`}
              // 保留内联 ref：选中属性更新或子树替换后，都交由根组件恢复焦点。
              ref={(node) => onEloRef?.(`${option.mode}:${option.key}`, node)}
              type="button"
              role="radio"
              aria-checked={option.current}
              disabled={!option.enabled}
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
      <span className="ladder-filter-label">地图</span>
      <div className="ladder-filter-row">
        {insightsMap == null && (
          <span className="ladder-pill" data-testid="ladder-map-static">
            <Icon name="map" />
            {teamMode ? '全图' : '阿拉伯 · 固定'}
            <span className="ladder-fixed">当前快照</span>
          </span>
        )}
        <div className="ladder-filter-row" role="radiogroup" aria-label="地图" data-testid="ladder-map">
          {mapOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={option.current}
              disabled={!option.enabled}
              className="ladder-map-option"
              data-testid={`ladder-map-${option.key}`}
              data-map={option.key}
              onClick={() => {
                if (option.enabled) onMap(option);
              }}
            >
              <Icon name="map" />
              <span>{option.label}</span>
              <span className="ladder-fixed">{option.enabled ? option.note : '暂无数据'}</span>
            </button>
          ))}
        </div>
      </div>
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
