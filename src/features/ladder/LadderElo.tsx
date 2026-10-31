import { type KeyboardEvent } from 'react';
import { visibleBrackets, type LadderSnapshot } from '../../domain/ladder';

/** 可见分段只剩一个时，上下文行末的只读 pill。没有可切换的档，就不画 radiogroup。 */
export function LadderStaticPill({ snapshot }: { snapshot: LadderSnapshot }) {
  const shown = visibleBrackets(snapshot);
  const sole = shown.length === 1 ? shown[0] : undefined;
  if (!sole) return null;
  return (
    <span className="ladder-pill" data-testid="ladder-elo-static">
      天梯分段 <span className="nw">{sole.label}</span>
      <span className="ladder-fixed">当前快照</span>
    </span>
  );
}

/** 至少两个分段有文明数据时，恢复分段单选。方向键只在这些芯片之间移动。 */
export function LadderBracketGroup({ snapshot, elo, onSelect }: { snapshot: LadderSnapshot; elo: string; onSelect: (key: string) => void }) {
  const shown = visibleBrackets(snapshot);
  if (shown.length < 2) return null;

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = shown.findIndex((item) => item.key === elo);
    if (index < 0) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next = shown[(index + step + shown.length) % shown.length];
    if (next) onSelect(next.key);
  };

  return (
    <div className="ladder-elo">
      <span id="ladder-elo-label">天梯分段（Elo）</span>
      <div className="ladder-scroll">
        <div role="radiogroup" aria-labelledby="ladder-elo-label" className="ladder-brackets" onKeyDown={onKey}>
          {shown.map((item) => {
            const checked = item.key === elo;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-testid="ladder-bracket"
                data-elo={item.key}
                className="ladder-bracket"
                onClick={() => onSelect(item.key)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
