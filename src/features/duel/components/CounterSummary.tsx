import { damageByClass, type Fighter } from '../../../domain/duel';
import { Icon } from '../../../shared/ui/Icon';

/** issue 168 只列本场匹配且扣除对应护甲后仍为正的克制伤害。 */
export function CounterSummary({ a, b }: { a: Fighter; b: Fighter }) {
  const rows = (
    [
      ['A', a, b],
      ['B', b, a],
    ] as const
  ).flatMap(([side, attacker, defender]) =>
    damageByClass(attacker, defender)
      .filter((x) => x.category !== '近战' && x.category !== '穿刺' && x.damage > 0)
      .map((x) => ({ ...x, side, name: attacker.name })),
  );
  if (!rows.length) return null;
  return (
    <div className="duel-counters" data-t="counter-summary" aria-label="本场生效的克制加成">
      <span className="note">
        <Icon name="swords" /> 本场克制加成
      </span>
      {rows.map((x) => (
        <span key={`${x.side}-${x.category}`} className="duel-counter">
          {x.side} · {x.name}对{x.category} <b className="nw">+{Number(x.damage.toFixed(2))}</b>
        </span>
      ))}
    </div>
  );
}
