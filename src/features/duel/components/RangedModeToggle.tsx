import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from './radioKeyboard';
import '../ranged-kite.css';

export interface RangedModeToggleProps {
  side: 'a' | 'b';
  active: boolean;
  hasMeleeFront?: boolean;
  onChange: (kite: boolean) => void;
}

/** issue 1295：单兵与混编共用的 A/B 独立「远程作战模式」分段开关（不含 <h*> 保护标题大纲）。 */
export function RangedModeToggle({ side, active, hasMeleeFront = false, onChange }: RangedModeToggleProps) {
  const title = hasMeleeFront ? '后排远程作战模式' : '远程作战模式';
  const groupLabel = `${side.toUpperCase()} 方${title}`;
  return (
    <div className={`duel-kite-block${active ? ' is-active' : ''}`} data-t={`duel-kite-block-${side}`}>
      <div className="duel-kite-head">
        <span className="duel-kite-title">
          <Icon name="bow-arrow" className="ic" />
          <span>{title}</span>
        </span>
        <span className={`duel-kite-tag${active ? ' is-active' : ''}`}>
          {active ? (
            <>
              退距上限 <span className="num nw">40 格</span>
            </>
          ) : (
            '默认行为'
          )}
        </span>
      </div>
      <div className="duel-kite-seg" role="radiogroup" aria-label={groupLabel} data-t={`duel-kite-toggle-${side}`} onKeyDown={radioKeyboard}>
        <button
          type="button"
          role="radio"
          aria-checked={!active}
          tabIndex={!active ? 0 : -1}
          className={`is-stand${!active ? ' is-on' : ''}`}
          onClick={() => onChange(false)}
        >
          站桩输出
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={active}
          tabIndex={active ? 0 : -1}
          className={`is-kite${active ? ' is-on' : ''}`}
          onClick={() => onChange(true)}
        >
          <Icon name="footprints" className="ic" />
          边走边射（拉扯）
        </button>
      </div>
      {active && (
        <p className="duel-kite-hint" data-t={`duel-kite-hint-${side}`}>
          {hasMeleeFront ? (
            <>
              前排近战存活挡线期间后排保持站桩；前排清空后自动转入边走边射（累计上限 <span className="num nw">40 格</span>）。
            </>
          ) : (
            <>
              按真实出手前摇停顿估算，单方最多后撤 <span className="num nw">40 格</span>（触底后接战）。
            </>
          )}
        </p>
      )}
    </div>
  );
}
