import type { Civ, Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';

const CONFIRMED_TRANSPORT_IDS = new Set([422, 545, 548, 1105, 1258]);

export function UnitTransportCapacity({ unit, civ }: { unit: Unit; civ?: Civ }) {
  if (!CONFIRMED_TRANSPORT_IDS.has(unit.id)) return null;

  const capacity = unit.garrisonCapacity;
  const hasCapacity = capacity !== undefined && Number.isSafeInteger(capacity) && capacity >= 0;
  const saracenBonus =
    unit.id === 545 && civ?.en === 'Saracens'
      ? civ.bon.find((bonus) => bonus.startsWith('运输船'))?.match(/运载量\s*(\+\d+)(?=\s*[，。；]|$)/u)?.[1]
      : undefined;

  return (
    <div className="ud-capacity" data-t="unit-capacity">
      <dl className="ud-capacity-row">
        <dt className="ud-stat-lab">
          <Icon name="package" />
          基础容量
        </dt>
        <dd className={hasCapacity ? 'ud-capacity-value num nw' : 'nw'}>{hasCapacity ? capacity : '待核实'}</dd>
      </dl>
      <p className="ud-kicker">{hasCapacity ? '本单位的基础载量，不含文明加成。' : '暂无可靠的基础载量。'}</p>
      {saracenBonus && (
        <dl className="ud-capacity-row ud-capacity-bonus">
          <dt>{civ?.zh}文明加成</dt>
          <dd>
            运载量 <span className="num nw">{saracenBonus}</span>
          </dd>
        </dl>
      )}
    </div>
  );
}
