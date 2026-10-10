/** 工具：单位 PK（1v1 / N vs M / 等资源）。属性复用科技模拟器引擎，战斗计算见 domain/duel.ts */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { duel, fighterFrom, groupFight, countForBudget, costSum, type Fighter } from '../../../domain/duel';
import { baseUnit, collapse } from '../../../domain/family';
import { AGE_ZH } from '../../../domain/ratings';
import { TEAM_BONUSES } from '../../../domain/effects';
import { allNumeric, baseStats, civBonusNotes, makeSimContext, presetUpTo, simTechs, simulate, type SimContext } from '../../../domain/simulator';
import type { StatSet, Unit } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CostView, StatIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading } from '../../../shared/ui/widgets';
import SimPanel, { type StatRow } from '../../simulator/components/SimPanel';
import { SIM_ROWS } from '../../simulator/logic/format';
import { fmtSide, parseSide, type Mode, type SideSpec } from '../logic/state';
import { UnitPicker } from './UnitPicker';

const DEF_A: SideSpec = { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] };
const DEF_B: SideSpec = { uid: 359, civ: 'Japanese', age: 4, techs: 'f', team: [] };
const r1 = (x: number) => String(Math.round(x * 10) / 10);

interface Resolved {
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  sel: Set<number>;
  S: StatSet;
  F: Fighter;
  avail: ReturnType<typeof simTechs>;
}
function resolve(ctx: SimContext, byId: Record<number, Unit>, spec: SideSpec, fallback: number): Resolved {
  let u = byId[spec.uid];
  if (!u || !u.civs.length) u = byId[fallback]!;
  const civ = u.civs.includes(spec.civ) ? spec.civ : u.civs[0]!;
  const age = Math.max(u.age, spec.age);
  const avail = simTechs(ctx, u, civ);
  const ok = new Set(avail.map((x) => x.t.id));
  const sel = spec.techs === 'f' ? allNumeric(avail) : spec.techs === 'c' ? presetUpTo(avail, age) : new Set(spec.techs.filter((i) => ok.has(i)));
  const fullAge = spec.techs === 'f' ? 4 : age;
  const S = simulate(ctx, u, civ, fullAge, sel, new Set(spec.team));
  return { spec, u, civ, age: fullAge, sel, S, F: fighterFrom(u, S), avail };
}

export default function Duel() {
  const core = useCore(),
    trees = useTrees();
  const [sp, setSp] = useSearchParams();
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const mode = (['1', 'n', 'r'].includes(sp.get('m') ?? '') ? sp.get('m') : '1') as Mode;
  const na = Math.max(1, Math.min(200, Number(sp.get('na')) || 10)),
    nb = Math.max(1, Math.min(200, Number(sp.get('nb')) || 10)),
    bud = Math.max(100, Math.min(100000, Number(sp.get('bud')) || 3000));
  const set = (k: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    Object.entries(k).forEach(([a, b]) => n.set(a, b));
    setSp(n, { replace: true });
  };
  const fams = useMemo(
    () =>
      core
        ? collapse(
            core.units.filter((u) => u.civs.length),
            core.fam,
          )
        : [],
    [core],
  );
  if (!core || !ctx)
    return (
      <section id="duel" className="pane">
        <ListHead title="单位 PK" desc="两个单位对战模拟" />
        <Loading />
      </section>
    );
  const A = resolve(ctx, core.unitById, parseSide(sp.get('a'), DEF_A), DEF_A.uid);
  const B = resolve(ctx, core.unitById, parseSide(sp.get('b'), DEF_B), DEF_B.uid);
  const upd = (k: 'a' | 'b', s: SideSpec) => set({ [k]: fmtSide(s) });
  const cntA = mode === 'r' ? countForBudget(A.u.cost, bud) : mode === 'n' ? na : 1,
    cntB = mode === 'r' ? countForBudget(B.u.cost, bud) : mode === 'n' ? nb : 1;
  return (
    <section id="duel" className="pane">
      <ListHead title="单位 PK" desc="选择双方单位、文明与科技，计算每击伤害、击杀次数与用时；支持群战与等资源对比" />
      <div className="bar fbar" role="radiogroup" aria-label="模式">
        {(
          [
            ['1', '1v1'],
            ['n', 'N vs M'],
            ['r', '等资源'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : undefined} onClick={() => set({ m: k })}>
            {l}
          </button>
        ))}
        {mode === 'n' && (
          <>
            <label>
              A 数量 <input id="duel-na" type="number" min={1} max={200} value={na} onChange={(e) => set({ na: e.target.value })} style={{ width: 64 }} />
            </label>
            <label>
              B 数量 <input id="duel-nb" type="number" min={1} max={200} value={nb} onChange={(e) => set({ nb: e.target.value })} style={{ width: 64 }} />
            </label>
          </>
        )}
        {mode === 'r' && (
          <label>
            资源预算 <input id="duel-bud" type="number" min={100} step={500} value={bud} onChange={(e) => set({ bud: e.target.value })} style={{ width: 90 }} />
          </label>
        )}
      </div>
      <div className="duel-sides">
        <Side k="a" side={A} fams={fams} onChange={(s) => upd('a', s)} count={cntA} />
        <div className="duel-vs">VS</div>
        <Side k="b" side={B} fams={fams} onChange={(s) => upd('b', s)} count={cntB} />
      </div>
      {mode === '1' ? <OneVOne A={A} B={B} /> : <Group A={A} B={B} na={cntA} nb={cntB} bud={mode === 'r' ? bud : 0} />}
      <p className="note duel-note">
        <Icon name="triangle-alert" className="ic warn" />
        近似模型：伤害 = max(1, Σ max(0, 攻击类别 − 对应护甲类别))（来源：Fandom「Armor class」、aoe2.rocks 伤害计算）；双方 t=0
        同时出手（缺少出手前摇数据）；远程按命中率取期望伤害；忽略射程、走位/风筝、地形高低差、冲锋攻击、溅射、特殊能力与独特科技（仅文本）。群战为集火模型，不考虑近战包围空间；等资源按造价总和计算，未计文明折扣。结果用于比较强弱趋势，不等同于实战。
      </p>
    </section>
  );
}

function Side({
  k,
  side,
  fams,
  onChange,
  count,
}: {
  k: 'a' | 'b';
  side: Resolved;
  fams: ReturnType<typeof collapse>;
  onChange: (s: SideSpec) => void;
  count: number;
}) {
  const core = useCore()!;
  const { u, spec } = side;
  const base = baseUnit(u, core.fam),
    elite = core.fam.eliteOf[base.id];
  const preset = Array.isArray(spec.techs) ? (spec.techs.length ? '' : 'none') : spec.techs;
  const rows: StatRow[] = SIM_ROWS.map(([kk, n, ic]) => [kk, n, ic === null ? (u.rng > 1 ? 'patk' : 'atk') : ic]);
  return (
    <div className={`duel-side side-${k}`} id={`duel-${k}`}>
      <div className="duel-head">
        <UnitIcon u={u} big />
        <div>
          <h3>
            {k.toUpperCase()} · {u.zh} {count > 1 && <span className="tag">× {count}</span>}
          </h3>
          <small className="note">
            {civByEn(side.civ)?.zh} · {AGE_ZH[side.age]} · <CostView c={u.cost} />
          </small>
        </div>
      </div>
      <div className="bar">
        <UnitPicker id={`duel-${k}-unit`} label={`${k.toUpperCase()} 方单位`} value={u} list={fams} onChange={(x) => onChange({ ...spec, uid: x.id })} />
        {elite && (
          <span className="eseg" role="radiogroup" aria-label="普通/精锐">
            <button
              type="button"
              role="radio"
              aria-checked={u.id === base.id}
              className={u.id === base.id ? 'on' : undefined}
              onClick={() => onChange({ ...spec, uid: base.id })}
            >
              普通
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={u.id === elite.id}
              className={u.id === elite.id ? 'on' : undefined}
              onClick={() => onChange({ ...spec, uid: elite.id })}
            >
              精锐
            </button>
          </span>
        )}
      </div>
      <div className="bar">
        <CivPicker id={`duel-${k}-civ`} label={`${k.toUpperCase()} 方文明`} value={side.civ} allowed={u.civs} onChange={(c) => onChange({ ...spec, civ: c })} />
      </div>
      <div className="bar duel-presets" role="radiogroup" aria-label="科技预设">
        {(
          [
            ['none', '无科技', () => onChange({ ...spec, techs: [] })],
            ['c', '当前时代满科技', () => onChange({ ...spec, techs: 'c' })],
            ['f', '满科技', () => onChange({ ...spec, techs: 'f', age: 4 })],
          ] as const
        ).map(([id, l, f]) => (
          <button key={id} role="radio" aria-checked={preset === id} className={preset === id ? 'on' : undefined} onClick={f}>
            {l}
          </button>
        ))}
      </div>
      <table className="stat duel-stats">
        <tbody>
          {(
            [
              ['hp', '生命值', r1(side.F.hp)],
              [u.rng > 1 ? 'patk' : 'atk', '攻击', r1(side.S.atk) + (side.F.ranged ? '（穿刺）' : '（近战）')],
              ['marm', '护甲', `${r1(side.S.ma)} / ${r1(side.S.pa)}`],
              ['rof', '攻击间隔', r1(side.S.rof * 100) === '0' ? '-' : (Math.round(side.S.rof * 100) / 100).toString() + 's'],
              ['range', '射程', r1(side.S.rng)],
              ['', '命中率', Math.round(side.F.acc * 100) + '%'],
            ] as const
          ).map(([ic, n, v]) => (
            <tr key={n}>
              <td>
                <StatIcon k={ic} t={n} />
                {n}
              </td>
              <td>
                <b>{v}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="duel-tech">
        <summary>科技详情（已选 {side.sel.size} 项，可逐项勾选）</summary>
        <SimPanel
          embedded={`duel-${k}`}
          civs={u.civs}
          minAge={u.age}
          civ={side.civ}
          age={side.age}
          sel={side.sel}
          team={new Set(spec.team)}
          cmp=""
          avail={side.avail}
          techById={core.techById}
          rows={rows}
          base={baseStats(u)}
          cur={side.S}
          cmpStats={null}
          civNotes={civBonusNotes(u, side.civ)}
          armorClasses={u.armc}
          teamBonuses={TEAM_BONUSES.map(([, label, f]) => ({ label, ok: f(u) }))}
          go={(civ, age, sel, team) => onChange({ uid: u.id, civ, age, techs: [...sel], team: [...team] })}
          setCmp={() => {}}
        />
      </details>
    </div>
  );
}

function OneVOne({ A, B }: { A: Resolved; B: Resolved }) {
  const r = duel(A.F, B.F);
  const wn = r.winner === 'draw' ? '平局（同时击杀）' : `${r.winner === 'a' ? 'A' : 'B'} · ${(r.winner === 'a' ? A : B).u.zh} 获胜`;
  const T = Math.max(r.ab.time, r.ba.time, 0.01);
  const rows: [string, string, string][] = [
    ['每击伤害', r1(r.ab.dmg), r1(r.ba.dmg)],
    ['期望每击（含命中率）', r1(r.ab.expDmg), r1(r.ba.expDmg)],
    ['击杀所需次数', String(r.ab.hits), String(r.ba.hits)],
    ['击杀用时', r1(r.ab.time) + 's', r1(r.ba.time) + 's'],
    ['DPS', (Math.round(r.ab.dps * 100) / 100).toString(), (Math.round(r.ba.dps * 100) / 100).toString()],
  ];
  return (
    <div id="duel-res" className="posbox">
      <h3 className={'duel-win w-' + r.winner}>
        <Icon name="trophy" /> {wn}
        {r.winner !== 'draw' && (
          <small className="note">
            {' '}
            · 用时 {r1(r.duration)}s · 剩余生命 {r1(r.remaining)} / {r1((r.winner === 'a' ? A : B).F.hp)}
          </small>
        )}
      </h3>
      <table className="stat duel-tab">
        <thead>
          <tr>
            <td></td>
            <td>A {A.u.zh} 打 B</td>
            <td>B {B.u.zh} 打 A</td>
          </tr>
        </thead>
        <tbody>
          {rows.map(([n, a, b]) => (
            <tr key={n}>
              <td>{n}</td>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>时间线（每个点为一次攻击，竖线为击杀时刻）</h4>
      <div className="duel-tl">
        {(
          [
            ['a', A, r.ab],
            ['b', B, r.ba],
          ] as const
        ).map(([k, s, w]) => (
          <div key={k} className={`tl-row tl-${k}`}>
            <span className="tl-l">{k.toUpperCase()}</span>
            <div className="tl-track">
              <div className="tl-fill" style={{ width: `${(Math.min(w.time, r.duration) / T) * 100}%` }} />
              {Array.from({ length: Math.min(w.hits, 60) }, (_, i) => i * s.F.rof)
                .filter((t) => t <= r.duration + 1e-9)
                .map((t, i) => (
                  <i key={i} className="tl-hit" style={{ left: `${(t / T) * 100}%` }} />
                ))}
              {w.time <= r.duration + 1e-9 && <b className="tl-kill" style={{ left: `${(w.time / T) * 100}%` }} title={`击杀 ${r1(w.time)}s`} />}
            </div>
          </div>
        ))}
        <div className="tl-axis">
          <span>0s</span>
          <span>{r1(T)}s</span>
        </div>
      </div>
      {(A.F.ranged || B.F.ranged) && (
        <p className="note">
          <Icon name="triangle-alert" className="ic warn" /> 1v1 基础模式忽略射程与风筝：远程单位实战中可在接敌前先手输出（射程 {r1(A.S.rng)} / {r1(B.S.rng)}
          ）。
        </p>
      )}
    </div>
  );
}

function Group({ A, B, na, nb, bud }: { A: Resolved; B: Resolved; na: number; nb: number; bud: number }) {
  const g = groupFight(A.F, na, B.F, nb);
  const wn = g.winner === 'draw' ? '平局 / 同归于尽' : `${g.winner === 'a' ? 'A' : 'B'} · ${(g.winner === 'a' ? A : B).u.zh} 获胜`;
  const T = Math.max(g.duration, 0.01),
    W = 600,
    H = 120,
    M = Math.max(na, nb);
  const path = (i: 1 | 2) =>
    g.timeline.map(([t, a, b], j) => `${j ? 'L' : 'M'}${((t / T) * W).toFixed(1)},${(H - ((i === 1 ? a : b) / M) * H).toFixed(1)}`).join(' ');
  return (
    <div id="duel-res" className="posbox">
      <h3 className={'duel-win w-' + g.winner}>
        <Icon name="trophy" /> {wn}
        <small className="note">
          {' '}
          · 用时 {r1(g.duration)}s · 剩余 {g.winner === 'b' ? g.bAlive : g.aAlive} 个单位、总生命 {g.hpLeft}
        </small>
      </h3>
      {bud > 0 && (
        <p className="note">
          预算 {bud}：A {A.u.zh} × {na}（单价 {costSum(A.u.cost)}），B {B.u.zh} × {nb}（单价 {costSum(B.u.cost)}）
        </p>
      )}
      <table className="stat duel-tab">
        <tbody>
          <tr>
            <td>数量</td>
            <td>
              A {na}，剩 {g.aAlive}
            </td>
            <td>
              B {nb}，剩 {g.bAlive}
            </td>
          </tr>
        </tbody>
      </table>
      <h4>存活数量随时间变化</h4>
      <svg className="duel-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="存活数量随时间变化">
        <path d={path(1)} className="ln-a" />
        <path d={path(2)} className="ln-b" />
      </svg>
      <div className="tl-axis">
        <span>0s</span>
        <span>{r1(T)}s</span>
      </div>
      <p className="note">集火模型：每方所有单位攻击对方第一个存活单位，同时刻伤害同时结算，单位死亡后多余伤害转给下一个目标。</p>
    </div>
  );
}
