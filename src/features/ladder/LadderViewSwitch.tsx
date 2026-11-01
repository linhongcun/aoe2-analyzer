import { Icon } from '../../shared/ui/Icon';

export type LadderViewId = 'table' | 'tiers' | 'meta';

export function LadderViewSwitch({ view, onChange }: { view: LadderViewId; onChange: (view: LadderViewId) => void }) {
  return (
    <div className="ladder-views" role="radiogroup" aria-label="视图" data-testid="ladder-view">
      <button type="button" role="radio" aria-checked={view === 'table'} data-testid="ladder-view-table" onClick={() => onChange('table')}>
        <Icon name="table" />表
      </button>
      <button type="button" role="radio" aria-checked={view === 'tiers'} data-testid="ladder-view-tiers" onClick={() => onChange('tiers')}>
        <Icon name="rows-3" />
        分层
      </button>
      <button type="button" role="radio" aria-checked={view === 'meta'} data-testid="ladder-view-meta" onClick={() => onChange('meta')}>
        <Icon name="chart-scatter" />
        分布
      </button>
    </div>
  );
}
