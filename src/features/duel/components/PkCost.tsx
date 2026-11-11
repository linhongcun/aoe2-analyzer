/** PK 卡头训练价。资源值为 0 也显示。不改全局 CostView。 */
import { TRAINING_RESOURCES } from '../../../domain/duelTrainingCost';
import { RES_ZH } from '../../../domain/ratings';
import type { Cost } from '../../../domain/types';
import { StatIcon } from '../../../shared/ui/art';

const ICON: Record<string, string> = { Food: 'food', Wood: 'wood', Gold: 'gold', Stone: 'stone' };

function Amounts({ cost, strike }: { cost: Cost; strike?: boolean }) {
  const keys = TRAINING_RESOURCES.filter((res) => cost[res] !== undefined);
  const body = keys.map((res) => (
    <span key={res} className="res nw" data-zero={cost[res] === 0 ? 'true' : undefined}>
      <StatIcon k={ICON[res] ?? ''} t={RES_ZH[res]} />
      <span className="num">{cost[res]}</span>
    </span>
  ));
  return strike ? <s>{body}</s> : <>{body}</>;
}

export function PkCost({ cost, base }: { cost: Cost; base?: Cost }) {
  const changed = !!base && TRAINING_RESOURCES.some((res) => (base[res] ?? null) !== (cost[res] ?? null));
  return (
    <span className="pk-price" data-t="pk-price">
      <Amounts cost={cost} />
      {changed && base && (
        <span className="pk-base" data-t="pk-base">
          基价 <Amounts cost={base} strike />
        </span>
      )}
    </span>
  );
}
