import type { ReactNode } from 'react';
import { LadderStaticPill } from './LadderElo';
import type { LadderSnapshot } from '../../domain/ladder';
import type { LadderModeId } from '../../domain/ladderQuery';
import { Icon } from '../../shared/ui/Icon';

export function HideLowSample({ checked, threshold, onChange }: { checked: boolean; threshold: number; onChange: (checked: boolean) => void }) {
  return (
    <label className="ladder-hide">
      <input type="checkbox" checked={checked} data-testid="ladder-hide-low" data-threshold={threshold} onChange={(event) => onChange(event.target.checked)} />
      隐藏低样本
    </label>
  );
}

export function LadderFilters({ mode, arabia, onMode }: { mode: LadderModeId; arabia: LadderSnapshot; onMode: (mode: LadderModeId) => void }) {
  const team = mode === '4v4';
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
          {team ? (
            <>
              近 <span className="nw">90 天</span>
            </>
          ) : (
            '整段快照'
          )}
          <span className="ladder-fixed">当前快照</span>
        </span>
      </div>
      <span className="ladder-filter-label">天梯分段</span>
      <div className="ladder-filter-row">
        {team ? (
          <span className="ladder-pill" data-testid="ladder-elo-static">
            <span className="nw">1200–1400</span>
            <span className="ladder-fixed">当前快照</span>
          </span>
        ) : (
          <LadderStaticPill snapshot={arabia} />
        )}
      </div>
      <span className="ladder-filter-label">地图</span>
      <div className="ladder-filter-row">
        <span className="ladder-pill" data-testid="ladder-map-static">
          <Icon name="map" />
          {team ? '全图' : '阿拉伯 · 固定'}
          <span className="ladder-fixed">当前快照</span>
        </span>
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
