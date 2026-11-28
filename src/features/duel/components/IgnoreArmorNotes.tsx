import { evaluateBonusDamageReduction, evaluateIgnoreArmor, formatBdrSigned } from '../../../domain/damageCore';
import { damageByClass } from '../../../domain/duel';
import type { Resolved } from '../logic/duelSide';

const fmtNum = (value: number) => String(Number(value.toFixed(3)));

function ArmorList({ armors }: { armors: readonly number[] }) {
  return (
    <>
      {armors.map((value, index) => (
        <span key={index}>
          {index > 0 && '、'}
          <span className="num nw">{fmtNum(value)}</span>
        </span>
      ))}
    </>
  );
}

/** 单位 PK 结果区「无视护甲」与「额外伤害减免」已计入说明行（1v1、N vs M、等资源、等采集时间共用）。 */
export function DuelMechNotes({ a, b }: { a: Resolved; b: Resolved }) {
  const ignoreEntries = (
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
  const bdrEntries = (
    [
      ['A', a, b],
      ['B', b, a],
    ] as const
  ).flatMap(([side, defender, attacker]) => {
    const evalRes = evaluateBonusDamageReduction(damageByClass(attacker.F, defender.F));
    if (!evalRes.netPositive) return [];
    const categories = evalRes.reducedRows.map((row) => row.category).join('、');
    return [{ side, defender, attacker, evalRes, categories }];
  });
  if (!ignoreEntries.length && !bdrEntries.length) return null;
  return (
    <div className="duel-mech-notes">
      {ignoreEntries.map(({ side, attacker, defender, evalRes, categories }) => (
        <p className="note" key={`ia-${side}`} data-t={`ignore-armor-note-${side.toLowerCase()}`}>
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
      {bdrEntries.map(({ side, defender, attacker, evalRes, categories }) => (
        <p className="note" key={`bdr-${side}`} data-t={`bdr-note-${side.toLowerCase()}`}>
          {side} · {defender.u.zh}额外伤害减免 <span className="num nw">{formatBdrSigned(evalRes.rate)}</span>：受{attacker.u.zh}的{categories}
          {evalRes.reducedRows.length > 1 ? '额外伤害合计由 ' : '额外伤害由 '}
          <span className="num nw">{fmtNum(evalRes.rawBonusSum)}</span> 降至 <span className="num nw">{fmtNum(evalRes.reducedBonusSum)}</span>。
        </p>
      ))}
    </div>
  );
}
