import { Icon } from './Icon';
import { radioKeyboard } from './radioKeyboard';
import './relic-selector.css';

export interface RelicCountSelectorProps {
  /** 'sim' = 单位详情模拟器；'duel' = 单位 PK 单兵卡；'mixed' = 混编对战卡 */
  variant: 'sim' | 'duel' | 'mixed';
  /** 单位 PK / 混编传入 'a' | 'b'；单位详情模拟器省略 */
  side?: 'a' | 'b';
  value: number;
  maxRelics: number;
  perRelicAtk: number;
  maxAtk: number;
  /** 时代低于城堡（或混编非法时代）时禁用，但保留已选件数 */
  ageLocked: boolean;
  /** 混编模式下命中的单位中文名（已去重） */
  matchedUnits?: readonly string[];
  onChange: (relics: number) => void;
}

/** issue 1383：单位详情模拟器 / 单位 PK 单兵 / 混编共用的「驻守圣物」0–4 件分段选择器（不含 <h*> 保护标题大纲）。 */
export function RelicCountSelector({ variant, side, value, maxRelics, perRelicAtk, maxAtk, ageLocked, matchedUnits, onChange }: RelicCountSelectorProps) {
  const effectiveValue = Math.max(0, Math.min(maxRelics, Math.floor(value)));
  const active = !ageLocked && effectiveValue > 0;
  const groupLabel = side ? `${side.toUpperCase()} 方驻守圣物件数` : '驻守圣物件数';
  const testPrefix = side ? `relic-${side}` : 'relic-sim';

  return (
    <div className={`relic-block${active ? ' is-active' : ''}${ageLocked ? ' is-locked' : ''}`} data-t={`${testPrefix}-block`}>
      <div className="relic-head">
        <span className="relic-title">
          <Icon name="church" className="ic" />
          <span>驻守圣物</span>
        </span>
        <span className={`relic-tag${active ? ' is-active' : ''}`} data-t={`${testPrefix}-tag`}>
          {ageLocked ? (
            '城堡时代起生效'
          ) : effectiveValue === 0 ? (
            <>
              默认 <span className="num nw">0 件</span>
            </>
          ) : (
            <>
              攻击 <span className="num nw">+{effectiveValue * perRelicAtk}</span>
            </>
          )}
        </span>
      </div>
      <div
        className="relic-seg"
        role="radiogroup"
        aria-label={groupLabel}
        aria-disabled={ageLocked || undefined}
        data-t={`${testPrefix}-group`}
        onKeyDown={ageLocked ? undefined : radioKeyboard}
      >
        {Array.from({ length: maxRelics + 1 }, (_, n) => {
          const checked = effectiveValue === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={ageLocked ? -1 : checked ? 0 : -1}
              disabled={ageLocked}
              className={checked ? 'is-on' : undefined}
              onClick={() => onChange(n)}
            >
              <span className="num nw">{n} 件</span>
            </button>
          );
        })}
      </div>
      <p className="relic-hint" data-t={`${testPrefix}-hint`}>
        {ageLocked ? (
          '城堡时代起才能驻守圣物，本时代不计入圣物加攻。'
        ) : variant === 'sim' ? (
          <>
            每件使骑士系和烈堤司攻击 <span className="num nw">+{perRelicAtk}</span>，最多 <span className="num nw">+{maxAtk}</span>
            （城堡时代起）。满科技、时代预设和清空都不改这里。
          </>
        ) : variant === 'duel' ? (
          <>
            每件使骑士系和烈堤司攻击 <span className="num nw">+{perRelicAtk}</span>，最多 <span className="num nw">+{maxAtk}</span>
            （城堡时代起）。满科技和时代预设不改这里。
          </>
        ) : (
          <>
            只加在本方骑士系和烈堤司的行：{(matchedUnits ?? []).join('、')}。每件攻击 <span className="num nw">+{perRelicAtk}</span>，最多{' '}
            <span className="num nw">+{maxAtk}</span>；满科技不改这里。
          </>
        )}
      </p>
    </div>
  );
}
