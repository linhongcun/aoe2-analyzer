import { civByEn, type Core } from '../../../data';
import { unitAvailable } from '../../../domain/unitAvailability';
import { AGE_ZH } from '../../../domain/ratings';
import type { Trees, Unit } from '../../../domain/types';

export { AGE_ZH };

export function PkAvailability({
  target,
  targetLabel,
  counter,
  counterLabel,
  targetCiv,
  counterCiv,
  age,
  core,
  trees,
  treesPending,
  treesError,
  retryTrees,
  showReady = true,
}: {
  target: Unit;
  targetLabel?: string;
  counter: Unit;
  counterLabel?: string;
  targetCiv: string;
  counterCiv: string;
  age: number;
  core: Core;
  trees: Trees | null;
  treesPending: boolean;
  treesError: boolean;
  retryTrees: () => void;
  showReady?: boolean;
}) {
  if (!targetCiv || !counterCiv) {
    return (
      <p className="ud-reverse-pk-warning" role="status">
        请先补齐双方文明；不会自动选择文明。
        {!targetCiv && (
          <button type="button" className="ud-btn" onClick={() => focusPicker('unitciv')}>
            选择本单位文明
          </button>
        )}
        {!counterCiv && (
          <button type="button" className="ud-btn" onClick={() => focusPicker('reverse-counter-civ')}>
            选择敌方文明
          </button>
        )}
      </p>
    );
  }
  if (treesPending)
    return (
      <p className="ud-reverse-pk-warning" role="status">
        正在核对双方形态的可用性…
      </p>
    );
  if (treesError) {
    return (
      <p className="ud-reverse-pk-warning" role="alert">
        科技树资料无法核对双方可用性。
        <button type="button" className="ud-btn" onClick={retryTrees} disabled={treesPending}>
          重试科技树
        </button>
      </p>
    );
  }
  if (!trees)
    return (
      <p className="ud-reverse-pk-warning" role="status">
        科技树资料尚不可用，暂时不能核对 PK。
        <button type="button" className="ud-btn" onClick={retryTrees}>
          重试科技树资料
        </button>
      </p>
    );
  const availability = (() => {
    try {
      return [unitAvailable({ core, trees }, targetCiv, target.id, age), unitAvailable({ core, trees }, counterCiv, counter.id, age)] as const;
    } catch {
      return null;
    }
  })();
  if (!availability)
    return (
      <p className="ud-reverse-pk-warning" role="alert">
        科技树结构无法解析，暂时不能核对 PK。
        <button type="button" className="ud-btn" onClick={retryTrees} disabled={treesPending}>
          重试科技树
        </button>
      </p>
    );
  if (!availability[0] || !availability[1]) {
    const unavailable = [
      !availability[0] ? `${targetLabel ?? target.zh}（${civByEn(targetCiv)?.zh ?? targetCiv}）` : '',
      !availability[1] ? `${counterLabel ?? counter.zh}（${civByEn(counterCiv)?.zh ?? counterCiv}）` : '',
    ]
      .filter(Boolean)
      .join('、');
    return (
      <p className="ud-reverse-pk-warning" role="status">
        {unavailable}在{AGE_ZH[age]}不可用；不会更换当前单位形态。
        <button type="button" className="ud-btn" onClick={() => focusPicker('reverse-counter-age')}>
          调整敌方时代
        </button>
      </p>
    );
  }
  return showReady ? <p className="ud-reverse-pk-ready">双方形态在所选时代可用。仅传入下列明确设置，不带入科技模拟工作区。</p> : null;
}

function focusPicker(id: string) {
  const control = document.getElementById(id);
  control?.focus();
  control?.click();
}
