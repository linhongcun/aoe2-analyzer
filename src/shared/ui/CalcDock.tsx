import { Icon, type IconName } from './Icon';
import './calcDock.css';

export type CalcDockAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: IconName;
};

/** 计算器页的复制、重置和跳到结果。窄屏固定在底部，宽屏留在页首。 */
export function CalcDock({ actions, resultId, note }: { actions: CalcDockAction[]; resultId?: string; note?: string }) {
  const jump = () => {
    if (!resultId) return;
    const target = document.getElementById(resultId);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  };
  return (
    <nav className="calc-dock" aria-label="方案操作" data-testid="calc-dock">
      {note && (
        <p className="calc-dock-note" role="status">
          {note}
        </p>
      )}
      <div className="calc-dock-actions">
        {resultId && (
          <button type="button" className="calc-dock-jump" onClick={jump}>
            <Icon name="arrow-down" />
            跳到结果
          </button>
        )}
        {actions.map((action) => (
          <button key={action.label} type="button" className="btn" disabled={action.disabled} onClick={action.onClick}>
            {action.icon && <Icon name={action.icon} />}
            {action.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
