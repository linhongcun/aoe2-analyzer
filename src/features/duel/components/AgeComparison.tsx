import { Link } from 'react-router-dom';
import { ageComparison, type AgeSide } from '../../../domain/ageComparison';
import { AGE_ZH } from '../../../domain/ratings';
import type { SimContext } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { fmtSide } from '../logic/state';

const n = (v: number | null) => (v === null ? '—' : Number(v.toFixed(2)));
export function AgeComparison({ ctx, byId, a, b }: { ctx: SimContext; byId: Record<number, Unit>; a: AgeSide; b: AgeSide }) {
  const rows = ageComparison(ctx, byId, a, b);
  return (
    <details className="age-comparison" data-t="age-comparison">
      <summary>查看各时代强弱变化</summary>
      <p className="note">保留所选文明与团队加成，使用每个时代的满科技；所选单位尚未解锁时回溯其前置版本。每行可打开对应的 1v1 对阵。</p>
      {rows.map((row) => (
        <section key={row.age} aria-label={`${AGE_ZH[row.age]}对比`}>
          <h4>{AGE_ZH[row.age]}</h4>
          <table className="stat age-table">
            <thead>
              <tr>
                <th scope="col">属性</th>
                <th scope="col">A · {row.a?.u.zh ?? '尚未解锁'}</th>
                <th scope="col">B · {row.b?.u.zh ?? '尚未解锁'}</th>
              </tr>
            </thead>
            <tbody>
              {(['hp', 'atk', 'ma', 'pa'] as const).map((key) => (
                <tr key={key}>
                  <th scope="row">{{ hp: '生命', atk: '攻击', ma: '近战护甲', pa: '穿刺护甲' }[key]}</th>
                  <td>{n(row.a?.stats[key] ?? null)}</td>
                  <td>{n(row.b?.stats[key] ?? null)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">DPS</th>
                <td>{n(row.result?.ab.dps ?? null)}</td>
                <td>{n(row.result?.ba.dps ?? null)}</td>
              </tr>
              <tr>
                <th scope="row">击杀时间（秒）</th>
                <td>{n(row.result?.ab.time ?? null)}</td>
                <td>{n(row.result?.ba.time ?? null)}</td>
              </tr>
            </tbody>
          </table>
          {row.result && row.a && row.b ? (
            <p>
              <b>{row.result.winner === 'draw' ? '平局' : `${row.result.winner.toUpperCase()} 获胜`}</b>{' '}
              <Link
                className="ulink"
                to={`/duel?a=${fmtSide({ ...a, uid: row.a.u.id, age: row.age, techs: 'f' })}&b=${fmtSide({ ...b, uid: row.b.u.id, age: row.age, techs: 'f' })}&m=1`}
              >
                打开{AGE_ZH[row.age]}对阵
              </Link>
            </p>
          ) : (
            <p className="note">至少一方尚无可用单位，暂不比较胜负。</p>
          )}
        </section>
      ))}
    </details>
  );
}
