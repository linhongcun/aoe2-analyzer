import { evaluateIgnoreArmor } from '../../../domain/damageCore';
import type { Resolved } from '../logic/duelSide';

const fmtArmor = (value: number) => String(Number(value.toFixed(3)));

function ArmorList({ armors }: { armors: readonly number[] }) {
  return (
    <>
      {armors.map((value, index) => (
        <span key={index}>
          {index > 0 && '、'}
          <span className="num nw">{fmtArmor(value)}</span>
        </span>
      ))}
    </>
  );
}

/** 单位 PK 结果区「无视护甲」一行说明（1v1、N vs M、等资源、等采集时间共用）。 */
export function IgnoreArmorNotes({ a, b }: { a: Resolved; b: Resolved }) {
  const entries = (
    [
      ['A', a, b],
      ['B', b, a],
    ] as const
  ).flatMap(([side, attacker, defender]) => {
    const evalRes = evaluateIgnoreArmor(attacker.F, defender.F);
    if (!evalRes.active) return [];
    const categories = evalRes.categories.join('、');
    return [{ side, attacker, defender, evalRes, categories }];
  });
  if (!entries.length) return null;
  return (
    <>
      {entries.map(({ side, attacker, defender, evalRes, categories }) => (
        <p className="note" key={side} data-t={`ignore-armor-note-${side.toLowerCase()}`}>
          {evalRes.resisted ? (
            <>
              {side} · {attacker.u.zh}无视护甲，但{defender.u.zh}抵抗无视护甲：每击照常扣{categories}护甲（
              <ArmorList armors={evalRes.armors} />
              ）。
            </>
          ) : attacker.ignoreArmorTech ? (
            <>
              {side} · {attacker.u.zh}无视护甲（来自{attacker.ignoreArmorTech}）：每击不扣{defender.u.zh}的{categories}护甲（
              <ArmorList armors={evalRes.armors} />
              ）。
            </>
          ) : (
            <>
              {side} · {attacker.u.zh}无视护甲：每击不扣{defender.u.zh}的{categories}护甲（
              <ArmorList armors={evalRes.armors} />
              ）。
            </>
          )}
        </p>
      ))}
    </>
  );
}
