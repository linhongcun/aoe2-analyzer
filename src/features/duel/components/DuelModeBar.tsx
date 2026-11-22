import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from './radioKeyboard';

export type TopMode = '1' | 'n' | 'r' | 'mix';

export interface DuelModeBarProps {
  active: TopMode;
  mixedDisabled?: boolean;
  mixedHint?: string;
  onSelect: (mode: TopMode, trigger: HTMLButtonElement, viaKeyboard: boolean) => void;
  children?: ReactNode;
}

const MODES: readonly { mode: TopMode; label: string; icon?: 'users' }[] = [
  { mode: '1', label: '1v1' },
  { mode: 'n', label: 'N vs M' },
  { mode: 'r', label: '等资源' },
  { mode: 'mix', label: '混编', icon: 'users' },
];

/**
 * issue 1279：单兵与混编共用的顶层 4 项模式栏。
 * radiogroup 严格只直接包裹 4 个 radio 按钮，确保 radioKeyboard 的 :scope > 扫描与 N vs M 按 Tab 直达 #duel-na。
 */
export function DuelModeBar({ active, mixedDisabled = false, mixedHint, onSelect, children }: DuelModeBarProps) {
  const keyNav = useRef(false);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    keyNav.current = true;
    try {
      radioKeyboard(event);
    } finally {
      keyNav.current = false;
    }
  };
  const showHint = mixedDisabled && Boolean(mixedHint);
  return (
    <div className="bar fbar duel-mode-shell">
      <div className="duel-mode-group" role="radiogroup" aria-label="模式" onKeyDown={onKeyDown}>
        {MODES.map(({ mode, label, icon }) => {
          const checked = active === mode;
          const disabled = mode === 'mix' && mixedDisabled;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              data-mode={mode}
              aria-checked={checked}
              aria-describedby={disabled && showHint ? 'duel-mix-unavail-hint' : undefined}
              tabIndex={checked ? 0 : -1}
              className={checked ? 'on' : undefined}
              disabled={disabled}
              onClick={(event) => {
                if (disabled) return;
                onSelect(mode, event.currentTarget, keyNav.current || event.detail === 0);
              }}
            >
              {icon ? <Icon name={icon} /> : null}
              {label}
            </button>
          );
        })}
      </div>
      {children}
      {showHint ? (
        <span id="duel-mix-unavail-hint" className="note duel-mode-hint">
          {mixedHint}
        </span>
      ) : null}
    </div>
  );
}
