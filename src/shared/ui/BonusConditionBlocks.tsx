import { Link } from 'react-router-dom';
import type { CivBonusEnt, Example } from '../../domain/civBonus';
import type { CivRelicBonus } from '../../domain/effects';
import { AGE_ZH } from '../../domain/ratings';
import { fmtStat } from '../utils/simFormat';
import { StatIcon } from './art';
import { Icon } from './Icon';

const STAT_ZH: Record<string, [string, string]> = {
  hp: ['生命值', 'hp'],
  atk: ['攻击', 'atk'],
  ma: ['近战护甲', 'marm'],
  pa: ['穿刺护甲', 'parm'],
  rng: ['射程', 'range'],
  spd: ['移动速度', 'speed'],
  los: ['视野', ''],
  rof: ['攻击间隔', 'rof'],
  gar: ['驻扎容量', ''],
  bt: ['建造/生产时间', 'time'],
  minr: ['最小射程', ''],
};

const ageTxt = (a: number[]) => a.map((x) => AGE_ZH[x]!.slice(0, 2)).join('/');

/** issue 1383：立陶宛圣物加攻条件计入说明块（加成百科与文明页弹窗共用）。 */
export function RelicConditionCallout({ relicFx }: { relicFx: CivRelicBonus }) {
  return (
    <div className="bonus-cond-note" data-t="bonus-relic-condition-note">
      <p>
        <strong>条件计入</strong>：每在修道院驻守 <span className="num nw">1 件</span>圣物，骑士系和烈堤司攻击{' '}
        <span className="num nw">+{relicFx.perRelicAtk}</span>，最多 <span className="num nw">+{relicFx.maxAtk}</span>。本站默认按{' '}
        <span className="num nw">0 件</span>计算，不自动叠加；在
        <Link className="ulink" to="/unit/569/Lithuanians/4/?civ=Lithuanians&tab=sim">
          科技模拟器
        </Link>
        和
        <Link className="ulink" to="/duel?a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=1">
          单位 PK
        </Link>{' '}
        里可选 <span className="num nw">0–{relicFx.maxRelics} 件</span>，城堡时代起生效。
      </p>
    </div>
  );
}

/** 加成详情页与文明页「作用与依据」弹窗共用的数值示例表（含条件触发圣物 0–4 件模式）。 */
export function BonusExampleTable({ b, ex }: { b: CivBonusEnt; ex: Example }) {
  if (ex.relicRows?.length) {
    return (
      <table className="stat bextab" data-t="bonus-relic-example-table">
        <tbody>
          {ex.relicRows.map((row) => (
            <tr key={row.relics}>
              <td className="num nw">驻守 {row.relics} 件</td>
              <td>
                <StatIcon k={STAT_ZH[row.stat]?.[1] ?? ''} t={STAT_ZH[row.stat]?.[0]} />
                {STAT_ZH[row.stat]?.[0] ?? row.stat}
              </td>
              <td className="num nw">
                {row.relics === 0 ? (
                  <>{fmtStat(row.stat, row.before)}（默认）</>
                ) : (
                  <>
                    {fmtStat(row.stat, row.before)} <Icon name="arrow-right" /> <b className="up">{fmtStat(row.stat, row.after)}</b>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="stat bextab">
      <tbody>
        {ex.rows.map(([ages, k, a, v], i) => (
          <tr key={i}>
            {!b.team && <td>{ageTxt(ages)}</td>}
            <td>
              <StatIcon k={STAT_ZH[k]?.[1] ?? ''} t={STAT_ZH[k]?.[0]} />
              {STAT_ZH[k]?.[0] ?? k}
            </td>
            <td>
              {fmtStat(k, a)} <Icon name="arrow-right" /> <b className="up">{fmtStat(k, v)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
