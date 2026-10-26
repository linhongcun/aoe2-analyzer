import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import type { CostDiscount } from '../../../domain/costDiscount';
import { damageBreakdown, damageSources } from '../../../domain/damageBreakdown';
import type { Fighter } from '../../../domain/duel';
import type { SimContext } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { CostView } from '../../../shared/ui/art';

interface Side {
  u: Unit;
  civ: string;
  age: number;
  sel: Set<number>;
  spec: { team: number[] };
  F: Fighter;
  disc: CostDiscount;
}
const n = (v: number) => Number(v.toFixed(3));

export function DamageBreakdown({ ctx, a, b }: { ctx: SimContext; a: Side; b: Side }) {
  return (
    <details className="damage-breakdown" data-t="damage-breakdown">
      <summary>查看逐击伤害与加成来源</summary>
      <p className="note">每类攻击只与同类护甲相减，再合计；负攻击可能扣减伤害，总伤害最低为 1。远程期望伤害另计命中率。</p>
      {(
        [
          ['A', a, b],
          ['B', b, a],
        ] as const
      ).map(([side, attacker, defender]) => {
        const d = damageBreakdown(attacker.F, defender.F);
        const trace = damageSources(ctx, attacker.u, attacker.civ, attacker.age, attacker.sel, new Set(attacker.spec.team));
        return (
          <section key={side} aria-label={`${side} 伤害拆解`}>
            <h3 className="damage-heading">
              {side} · {attacker.u.zh} 攻击 {defender.u.zh}
            </h3>
            <ul className="damage-classes">
              {d.rows.map((row) => (
                <li key={row.category}>
                  {row.category}：攻击 <b className="nw">{n(row.attack)}</b>，目标护甲 <b className="nw">{n(row.armor)}</b>，伤害{' '}
                  <b className="nw">{n(row.damage)}</b>
                </li>
              ))}
            </ul>
            {d.minimum > 0 && (
              <p>
                最低伤害补足：<b className="nw">+{n(d.minimum)}</b>
              </p>
            )}
            <p>
              每击伤害：
              <b className="nw" data-t={`damage-total-${side}`}>
                {n(d.total)}
              </b>
              ；期望每击：<b className="nw">{n(d.expected)}</b>
            </p>
            <h4 className="damage-source-heading">{civByEn(attacker.civ)?.zh ?? attacker.civ} · 攻击与护甲来源</h4>
            <p>
              单位基础：攻击 <span className="nw">{attacker.u.atk}</span>，近战护甲 <span className="nw">{attacker.u.ma}</span>，穿刺护甲{' '}
              <span className="nw">{attacker.u.pa}</span>
            </p>
            <ul>
              {Object.entries(trace.base.attack)
                .filter(([key]) => key !== '近战' && key !== '穿刺')
                .map(([key, value]) => (
                  <li key={key}>
                    单位基础对{key}加成：<span className="nw">{n(value)}</span>
                  </li>
                ))}
              {trace.sources.map((source, i) => (
                <li key={i}>
                  {source.techId ? (
                    <Link className="ulink" to={`/tech/${source.techId}`}>
                      {source.source}
                    </Link>
                  ) : (
                    source.source
                  )}
                  {source.changes.map((change) => (
                    <span className="damage-change" key={change.stat}>
                      {change.stat}{' '}
                      <span className="nw">
                        {n(change.before)} 至 {n(change.after)}
                      </span>
                      （
                      <span className="nw">
                        {change.after >= change.before ? '+' : ''}
                        {n(change.after - change.before)}
                      </span>
                      ）
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            <p>
              训练费用：
              <CostView c={attacker.disc.base} />
              ；折后：
              <CostView c={attacker.disc.cost} />
            </p>
            {attacker.disc.applied.map((line, i) => (
              <p className="note" key={i}>
                已计入文明费用加成：{line.text}（来源：固定版本游戏数据与文明说明）
              </p>
            ))}
            {attacker.disc.unsupported.map((line, i) => (
              <p className="note" key={i}>
                费用加成未计入：{line.text}
              </p>
            ))}
            {!attacker.disc.applied.length && <p className="note">无已计入的常驻文明费用折扣。</p>}
            <Link className="ulink" to={`/civ/${attacker.civ}`}>
              查看{civByEn(attacker.civ)?.zh ?? attacker.civ}文明加成
            </Link>
          </section>
        );
      })}
    </details>
  );
}
