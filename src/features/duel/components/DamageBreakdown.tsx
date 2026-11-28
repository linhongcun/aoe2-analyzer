import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import type { CostDiscount } from '../../../domain/costDiscount';
import { damageBreakdown, damageSources } from '../../../domain/damageBreakdown';
import { formatBdrMultiplier, formatBdrSigned, hasIgnoreArmor } from '../../../domain/damageCore';
import { fighterUsesAssumeHit, NO_NORMAL_ATTACK_REASON, type Fighter } from '../../../domain/duel';
import type { SimContext } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { CostView } from '../../../shared/ui/art';
import { PkCost } from './PkCost';

interface Side {
  u: Unit;
  civ: string;
  age: number;
  sel: Set<number>;
  spec: { team: number[] };
  F: Fighter;
  disc: CostDiscount;
  training: { price: { cost: CostDiscount['cost'] } };
  relics?: number;
}
const n = (v: number) => Number(v.toFixed(3));
function formatSourceLabel(text: string) {
  const parts = text.split(/(\d+\s*件|[+-]?\d+(?:\.\d+)?%|\+\d+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, idx) =>
    idx % 2 ? (
      <span className="num nw" key={idx}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function DamageBreakdown({ ctx, a, b }: { ctx: SimContext; a: Side; b: Side }) {
  return (
    <details className="damage-breakdown" data-t="damage-breakdown">
      <summary>查看逐击伤害与加成来源</summary>
      <p className="note">
        每类攻击只与同类护甲相减，再合计；负攻击可能扣减伤害，有普通攻击时总伤害最低为 <span className="num nw">1</span>
        。常规远程期望伤害另计命中率；目录准确度为 <span className="num nw">0%</span>{' '}
        的特殊远程攻击按每击命中主目标估算。攻击方「无视护甲」时，目标的近战、穿刺护甲不扣；目标「抵抗无视护甲」时照扣。目标带「额外伤害减免」时，近战、穿刺之外的每类伤害按减免比例折减后再合计。
      </p>
      {(
        [
          ['A', a, b],
          ['B', b, a],
        ] as const
      ).map(([side, attacker, defender]) => {
        const d = damageBreakdown(attacker.F, defender.F);
        const trace = damageSources(ctx, attacker.u, attacker.civ, attacker.age, attacker.sel, new Set(attacker.spec.team), attacker.relics ?? 0);
        return (
          <section key={side} aria-label={`${side} 伤害拆解`}>
            <h3 className="damage-heading">
              {side} · {attacker.u.zh} 攻击 {defender.u.zh}
            </h3>
            {d.canAttack ? (
              <>
                <ul className="damage-classes">
                  {d.rows.map((row) => (
                    <li key={row.category}>
                      {row.category}：
                      <span className="nw">
                        攻击 <b className="num">{n(row.attack)}</b>
                      </span>
                      ，
                      <span className="nw">
                        目标护甲 <b className="num">{n(row.armor)}</b>
                      </span>
                      {row.ignored && <span className="nw">（已无视）</span>}
                      {row.bonusDamageReduction !== undefined && row.rawDamage !== undefined && (
                        <>
                          {Math.abs(row.rawDamage - row.attack) > 1e-9 && (
                            <>
                              ，
                              <span className="nw">
                                减免前 <b className="num">{n(row.rawDamage)}</b>
                              </span>
                            </>
                          )}
                          ，
                          <span className="nw">
                            额外伤害 <span className="num">{formatBdrSigned(row.bonusDamageReduction)}</span>
                          </span>
                        </>
                      )}
                      ，
                      <span className="nw">
                        伤害 <b className="num">{n(row.damage)}</b>
                      </span>
                    </li>
                  ))}
                </ul>
                {d.ignoreArmor.applied && (
                  <p className="note" data-t={`damage-ignore-armor-${side}`}>
                    本击无视目标的{d.ignoreArmor.categories.join('、')}护甲；其他类别护甲照扣。
                  </p>
                )}
                {d.ignoreArmor.resisted && (
                  <p className="note" data-t={`damage-ignore-armor-${side}`}>
                    目标抵抗无视护甲，本击照常扣{d.ignoreArmor.categories.join('、')}护甲。
                  </p>
                )}
                {d.bonusDamageReduction.active && (
                  <p className="note" data-t={`damage-bdr-${side}`}>
                    目标自带额外伤害减免 <span className="num nw">{formatBdrSigned(d.bonusDamageReduction.rate)}</span>：上述非基础类别均先按同类相减再乘以{' '}
                    <span className="num nw">{formatBdrMultiplier(d.bonusDamageReduction.rate)}</span>（近战、穿刺主攻击不折减
                    {d.bonusDamageReduction.hasNegativeBonus ? '；正负额外伤害行同比例折减以保持抵消' : ''}）。
                  </p>
                )}
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
                  {fighterUsesAssumeHit(attacker.F) && (
                    <>
                      （按每击命中主目标估算，目录准确度 <span className="num nw">0%</span>）
                    </>
                  )}
                </p>
              </>
            ) : (
              <p data-t={`damage-no-attack-${side}`}>{NO_NORMAL_ATTACK_REASON}（不造成普通攻击伤害）。</p>
            )}
            <h4 className="damage-source-heading">{civByEn(attacker.civ)?.zh ?? attacker.civ} · 攻击与护甲来源</h4>
            <p>
              单位基础：攻击 <span className="nw">{attacker.u.atk}</span>，近战护甲 <span className="nw">{attacker.u.ma}</span>，穿刺护甲{' '}
              <span className="nw">{attacker.u.pa}</span>
              {hasIgnoreArmor(attacker.u.combatAbility) && (
                <>
                  ；<span className="nw">攻击无视护甲</span>
                </>
              )}
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
                    formatSourceLabel(source.source)
                  )}
                  {source.changes.map((change) => (
                    <span className="damage-change" key={change.stat}>
                      {change.stat}{' '}
                      {change.kind === 'boolean' ? (
                        <span className="nw">
                          {change.before ? '开启' : '未开启'} 至 {change.after ? '开启' : '未开启'}
                        </span>
                      ) : change.kind === 'bdr' ? (
                        <span className="num nw">
                          {formatBdrSigned(change.before)} 至 {formatBdrSigned(change.after)}
                        </span>
                      ) : (
                        <>
                          <span className="nw">
                            {n(change.before)} 至 {n(change.after)}
                          </span>
                          （
                          <span className="nw">
                            {change.after >= change.before ? '+' : ''}
                            {n(change.after - change.before)}
                          </span>
                          ）
                        </>
                      )}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            <p>
              训练费用：
              <CostView c={attacker.disc.base} />
              ；折后：
              <PkCost cost={attacker.training.price.cost} />
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
