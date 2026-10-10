/** 通用科技模拟器面板（单位与建筑共用）：文明/时代选择、分组科技开关、预设、属性表、费用汇总、团队加成、对比列 */
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { toggleTech } from '../../../domain/prereq';
import { AGE_ZH } from '../../../domain/ratings';
import { allNumeric, presetUpTo, simGroup, totalCost, type SimTech } from '../../../domain/simulator';
import type { NumStat, StatSet, Tech } from '../../../domain/types';
import { CostView, StatIcon, TechIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { fmtStat } from '../logic/format';

export type StatRow = [NumStat, string, string];
export interface SimPanelProps {
  civs: string[];
  minAge: number;
  civ: string;
  age: number;
  sel: ReadonlySet<number>;
  team: ReadonlySet<number>;
  cmp: string;
  avail: SimTech[];
  techById: Record<number, Tech>;
  rows: StatRow[];
  base: StatSet;
  cur: StatSet;
  cmpStats: StatSet | null;
  civNotes: string[];
  teamBonuses: { label: string; ok: boolean }[];
  go: (civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) => void;
  setCmp: (c: string) => void;
}

function StatRows({ rows, B, S, C }: { rows: StatRow[]; B: StatSet; S: StatSet; C: StatSet | null }) {
  const ks = [...new Set([...Object.keys(B.bonus), ...Object.keys(S.bonus)])].filter((k) => S.bonus[k] || B.bonus[k]);
  return (
    <>
      {rows.map(([k, n, ic]) => {
        const d = S[k] - B[k],
          good = k === 'rof' || k === 'bt' || k === 'minr' ? d < 0 : d > 0;
        return (
          <tr key={k}>
            <td>
              <StatIcon k={ic} t={n} />
              {n}
            </td>
            <td>
              {fmtStat(k, B[k])}{' '}
              {Math.abs(d) > 1e-9 && (
                <span className={good ? 'up' : 'dn'}>
                  {d > 0 ? '+' : ''}
                  {fmtStat(k, d).replace('s', '')}
                </span>
              )}
            </td>
            <td>
              <b>{fmtStat(k, S[k])}</b>
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
            <td>
              {b}{' '}
              {s !== b && (
                <span className={s > b ? 'up' : 'dn'}>
                  {s > b ? '+' : ''}
                  {s - b}
                </span>
              )}
            </td>
            <td>
              <b>{s}</b>
            </td>
            {C && <td>{C.bonus[k] ?? 0}</td>}
          </tr>
        );
      })}
    </>
  );
}

export default function SimPanel(p: SimPanelProps) {
  const tot = totalCost(p.avail, p.sel);
  const groups: Record<string, SimTech[]> = {};
  p.avail.forEach((x) => (groups[simGroup(x.t)] ??= []).push(x));
  const toggle = (id: number) => {
    const t = p.techById[id]!;
    p.go(
      p.civ,
      p.sel.has(id) ? p.age : Math.max(p.age, t.age),
      toggleTech(
        id,
        p.sel,
        p.avail.map((a) => a.t),
        p.techById,
      ),
      p.team,
    );
  };
  const teamToggle = (i: number) => {
    const n = new Set(p.team);
    n.has(i) ? n.delete(i) : n.add(i);
    p.go(p.civ, p.age, p.sel, n);
  };
  return (
    <div id="sim" className="posbox">
      <h3>
        <Icon name="flask-conical" /> 科技模拟器 <small className="note">选择文明与科技，查看属性变化与累计研究费用</small>
      </h3>
      <div className="bar">
        文明{' '}
        <select id="simciv" value={p.civ} onChange={(e) => p.go(e.target.value, p.age, p.sel, p.team)}>
          {p.civs.map((n) => (
            <option key={n} value={n}>
              {civByEn(n) ? civByEn(n)!.zh + ' ' + n : n}
            </option>
          ))}
        </select>{' '}
        时代{' '}
        <select
          id="simage"
          value={p.age}
          onChange={(e) => {
            const a = +e.target.value;
            p.go(
              p.civ,
              a,
              [...p.sel].filter((i) => p.techById[i]!.age <= a),
              p.team,
            );
          }}
        >
          {[1, 2, 3, 4]
            .filter((a) => a >= p.minAge)
            .map((a) => (
              <option key={a} value={a}>
                {AGE_ZH[a]}
              </option>
            ))}
        </select>
        <button onClick={() => p.go(p.civ, 4, allNumeric(p.avail), p.team)}>满科技</button>
        <button onClick={() => p.go(p.civ, p.age, [], p.team)}>清空</button>
        {[2, 3, 4]
          .filter((a) => a >= p.minAge)
          .map((a) => (
            <button
              key={a}
              onClick={() => {
                const ag = Math.max(p.minAge, a);
                p.go(p.civ, ag, presetUpTo(p.avail, ag), p.team);
              }}
            >
              {AGE_ZH[a]!.slice(0, 2)}预设
            </button>
          ))}{' '}
        对比{' '}
        <select id="simcmp" value={p.cmp} onChange={(e) => p.setCmp(e.target.value)}>
          <option value="">（不对比）</option>
          {p.civs
            .filter((n) => n !== p.civ)
            .map((n) => (
              <option key={n} value={n}>
                {civByEn(n)?.zh ?? n} 满科技
              </option>
            ))}
        </select>
      </div>
      {p.civNotes.length > 0 && <p className="note">已计入文明加成：{p.civNotes.join('；')}</p>}
      <div className="two">
        <div>
          {Object.entries(groups).map(([g, l]) => (
            <div className="simg" key={g}>
              <h4>{g}</h4>
              {l.map(({ t, ef }) => {
                const on = p.sel.has(t.id);
                return (
                  <label key={t.id} className={`simt${on ? ' on' : ''}${ef ? '' : ' txt'}${t.age > p.age && !on ? ' late' : ''}`}>
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
          {!p.avail.length && <p className="note">该文明没有可影响此对象的已编码科技</p>}
          <div className="simg">
            <h4>团队加成（开关）</h4>
            {p.teamBonuses.some((x) => x.ok) ? (
              p.teamBonuses.map(
                (x, i) =>
                  x.ok && (
                    <label key={i} className="simt">
                      <input type="checkbox" checked={p.team.has(i)} onChange={() => teamToggle(i)} />
                      {x.label}
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
                {p.cmpStats && <th>{civByEn(p.cmp)?.zh} 满</th>}
              </tr>
              <StatRows rows={p.rows} B={p.base} S={p.cur} C={p.cmpStats} />
            </tbody>
          </table>
          <div className="posbox">
            <h4>累计研究费用（{p.sel.size} 项）</h4>
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
