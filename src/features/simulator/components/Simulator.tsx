import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { TEAM_BONUSES } from '../../../domain/effects';
import { toggleTech } from '../../../domain/prereq';
import { AGE_ZH } from '../../../domain/ratings';
import {
  allNumeric,
  baseStats,
  civBonusNotes,
  presetUpTo,
  simGroup,
  simTechs,
  simulate,
  totalCost,
  type SimRoute,
  type SimTech,
} from '../../../domain/simulator';
import type { StatSet, Unit } from '../../../domain/types';
import { CostView, StatIcon, TechIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { Loading } from '../../../shared/ui/widgets';
import { useSimState } from '../hooks/useSimState';
import { fmtStat, SIM_ROWS } from '../logic/format';

function StatRows({ u, B, S, C }: { u: Unit; B: StatSet; S: StatSet; C: StatSet | null }) {
  const ks = [...new Set([...Object.keys(B.bonus), ...Object.keys(S.bonus)])].filter((k) => S.bonus[k] || B.bonus[k]);
  return (
    <>
      {SIM_ROWS.map(([k, n, ic0]) => {
        const ic1 = ic0 === null ? (u.rng > 1 ? 'patk' : 'atk') : ic0,
          d = S[k] - B[k],
          good = k === 'rof' ? d < 0 : d > 0;
        return (
          <tr key={k}>
            <td>
              <StatIcon k={ic1} t={n} />
              {n}
            </td>
            <td>{fmtStat(k, B[k])}</td>
            <td>
              <b>{fmtStat(k, S[k])}</b>{' '}
              {Math.abs(d) > 1e-9 && (
                <span className={good ? 'up' : 'dn'}>
                  {d > 0 ? '+' : ''}
                  {fmtStat(k, d).replace('s', '')}
                </span>
              )}
            </td>
            {C && <td>{fmtStat(k, C[k])}</td>}
          </tr>
        );
      })}
      {ks.map((k) => {
        const b = B.bonus[k] ?? 0,
          s = S.bonus[k] ?? 0;
        return (
          <tr key={'b' + k}>
            <td>
              <span className="si" />对 {k} 加成
            </td>
            <td>{b}</td>
            <td>
              <b>{s}</b>{' '}
              {s !== b && (
                <span className={s > b ? 'up' : 'dn'}>
                  {s > b ? '+' : ''}
                  {s - b}
                </span>
              )}
            </td>
            {C && <td>{C.bonus[k] ?? 0}</td>}
          </tr>
        );
      })}
    </>
  );
}

export default function Simulator({ u, route }: { u: Unit; route: SimRoute }) {
  const core = useCore();
  const { state: S, go, setCmp } = useSimState(u, route);
  if (!S || !core)
    return (
      <div id="sim" className="posbox">
        <Loading />
      </div>
    );
  const B = baseStats(u);
  const cur = simulate(S.ctx, u, S.civ, S.age, S.sel, S.team);
  const C = S.cmp
    ? (() => {
        const av = simTechs(S.ctx, u, S.cmp);
        return simulate(S.ctx, u, S.cmp, 4, allNumeric(av), new Set());
      })()
    : null;
  const tot = totalCost(S.avail, S.sel);
  const groups: Record<string, SimTech[]> = {};
  S.avail.forEach((x) => (groups[simGroup(x.t)] ??= []).push(x));
  const cb = civBonusNotes(u, S.civ);
  const toggle = (id: number) => {
    const t = core.techById[id]!;
    const was = S.sel.has(id);
    go(
      S.civ,
      was ? S.age : Math.max(S.age, t.age),
      toggleTech(
        id,
        S.sel,
        S.avail.map((a) => a.t),
        core.techById,
      ),
      S.team,
    );
  };
  const teamToggle = (i: number) => {
    const n = new Set(S.team);
    n.has(i) ? n.delete(i) : n.add(i);
    go(S.civ, S.age, S.sel, n);
  };
  return (
    <div id="sim" className="posbox">
      <h3>
        <Icon name="flask-conical" /> 科技模拟器 <small className="note">选择文明与科技，查看属性变化与累计研究费用</small>
      </h3>
      <div className="bar">
        文明{' '}
        <select id="simciv" value={S.civ} onChange={(e) => go(e.target.value, S.age, S.sel, S.team)}>
          {u.civs.map((n) => {
            const c = civByEn(n);
            return (
              <option key={n} value={n}>
                {c ? c.zh + ' ' + n : n}
              </option>
            );
          })}
        </select>{' '}
        时代{' '}
        <select
          id="simage"
          value={S.age}
          onChange={(e) => {
            const a = +e.target.value;
            go(
              S.civ,
              a,
              [...S.sel].filter((i) => core.techById[i]!.age <= a),
              S.team,
            );
          }}
        >
          {[1, 2, 3, 4]
            .filter((a) => a >= u.age)
            .map((a) => (
              <option key={a} value={a}>
                {AGE_ZH[a]}
              </option>
            ))}
        </select>
        <button onClick={() => go(S.civ, 4, allNumeric(S.avail), S.team)}>满科技</button>
        <button onClick={() => go(S.civ, S.age, [], S.team)}>清空</button>
        {[2, 3, 4]
          .filter((a) => a >= u.age)
          .map((a) => (
            <button
              key={a}
              onClick={() => {
                const ag = Math.max(u.age, a);
                go(S.civ, ag, presetUpTo(S.avail, ag), S.team);
              }}
            >
              {AGE_ZH[a]!.slice(0, 2)}预设
            </button>
          ))}{' '}
        对比{' '}
        <select id="simcmp" value={S.cmp} onChange={(e) => setCmp(e.target.value)}>
          <option value="">（不对比）</option>
          {u.civs
            .filter((n) => n !== S.civ)
            .map((n) => (
              <option key={n} value={n}>
                {civByEn(n)?.zh ?? n} 满科技
              </option>
            ))}
        </select>
      </div>
      {cb.length > 0 && <p className="note">已计入文明加成：{cb.join('；')}</p>}
      <div className="two">
        <div>
          {Object.entries(groups).map(([g, l]) => (
            <div className="simg" key={g}>
              <h4>{g}</h4>
              {l.map(({ t, ef }) => {
                const on = S.sel.has(t.id);
                return (
                  <label key={t.id} className={`simt${on ? ' on' : ''}${ef ? '' : ' txt'}${t.age > S.age && !on ? ' late' : ''}`}>
                    {ef ? <input type="checkbox" checked={on} onChange={() => toggle(t.id)} /> : <span className="tag">仅文本</span>}
                    <TechIcon t={t} />
                    <Link className="ulink tl" to={`/tech/${t.id}`}>
                      {t.zh}
                    </Link>
                    <small>{AGE_ZH[t.age]!.slice(0, 2)}</small>
                    <span className="simc">
                      <CostView c={t.cost} /> <StatIcon k="time" t="研究时间" />
                      {t.rt}s
                    </span>
                    {!ef && <div className="note">{t.desc}</div>}
                  </label>
                );
              })}
            </div>
          ))}
          <div className="simg">
            <h4>团队加成（开关）</h4>
            {TEAM_BONUSES.some(([, , f]) => f(u)) ? (
              TEAM_BONUSES.map(
                ([, n, f], i) =>
                  f(u) && (
                    <label key={i} className="simt">
                      <input type="checkbox" checked={S.team.has(i)} onChange={() => teamToggle(i)} />
                      {n}
                    </label>
                  ),
              )
            ) : (
              <span className="note">无适用的已编码团队加成</span>
            )}
          </div>
        </div>
        <div>
          <table className="stat simtab">
            <tbody>
              <tr>
                <th>属性</th>
                <th>基础</th>
                <th>当前</th>
                {C && <th>{civByEn(S.cmp)?.zh} 满</th>}
              </tr>
              <StatRows u={u} B={B} S={cur} C={C} />
            </tbody>
          </table>
          <div className="posbox">
            <h4>累计研究费用（{S.sel.size} 项）</h4>
            <p style={{ fontSize: 18 }}>
              <CostView c={tot.cost} />　<StatIcon k="time" t="研究时间" />
              {tot.time}s
            </p>
          </div>
          <p className="note">
            <Icon name="triangle-alert" className="ic warn" />
            数值为近似：基于 aoe2techtree 基础属性 + 手工编码的通用科技与部分文明加成（来源：游戏内说明与 AoE2 Fandom
            Wiki）。独特科技与部分效果仅显示文本、不计入；未计入的文明加成、圣物、英雄等可能使实际数值不同。
          </p>
        </div>
      </div>
    </div>
  );
}
