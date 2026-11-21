import type { Tech } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';

export function GarrisonTechStatus({
  age,
  available,
  free,
  selected,
  onSelect,
}: {
  age: string;
  available: readonly Tech[];
  free: readonly Tech[];
  selected: ReadonlySet<number>;
  onSelect: (ids: number[]) => void;
}) {
  const count = available.filter((tech) => selected.has(tech.id)).length;
  const all = available.length > 0 && count === available.length;
  const [label, style] = !available.length
    ? ['无可选相关科技', 'neutral']
    : all
      ? ['已全选当前时代可用项', 'good']
      : count
        ? ['已自选部分科技', 'link']
        : ['当前未自选相关科技', 'warn'];

  return (
    <div className="garrison-tech-status">
      <div className="garrison-tech-summary" role="status">
        <span className={`garrison-badge garrison-badge-${style}`}>{label}</span>
        <span>
          当前时代：{age}
          {available.length > 0 ? (
            <>
              {' · 已自选 '}
              <span className="num nw">
                {count} / {available.length} 项
              </span>
              可用相关科技
            </>
          ) : (
            ' · 当前时代无影响驻军的可选科技'
          )}
          {free.length > 0 ? (
            <>
              {' · 免费自动生效 '}
              <span className="num nw">{free.length} 项</span>（{free.map((tech) => tech.zh).join('、')}）
            </>
          ) : (
            available.length > 0 && ' · 无免费自动科技'
          )}
          {available.length > 0 && count === 0 && '（仅所选时代与免费科技生效）'}
        </span>
      </div>
      {available.length > 0 && (
        <div className="garrison-tech-actions">
          <button type="button" className="garrison-tech-select" disabled={all} onClick={() => onSelect(available.map((tech) => tech.id))}>
            <Icon name="check" /> 全选当前时代可用相关科技
          </button>
          <button type="button" disabled={count === 0} onClick={() => onSelect([])}>
            <Icon name="rotate-ccw" /> 清空自选科技
          </button>
        </div>
      )}
    </div>
  );
}
