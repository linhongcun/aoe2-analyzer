import ShareImage from '../../share/ShareImage';
/** 工具：单位 PK（1v1 / N vs M / 等资源）。属性复用科技模拟器引擎，战斗计算见 domain/duel.ts */
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { discountedCost, priceAge, type CostDiscount } from '../../../domain/costDiscount';
import { duel, fighterFrom, groupFight, countForBudget, costSum, type Fighter, DPS_UNAVAILABLE_REASON } from '../../../domain/duel';
import { baseUnit, collapse } from '../../../domain/family';
import { AGE_ZH } from '../../../domain/ratings';
import { TEAM_BONUSES } from '../../../domain/effects';
import { baseStats, civBonusNotes, makeSimContext, presetUpTo, simTechs, simulate, type SimContext } from '../../../domain/simulator';
import type { StatSet, Unit } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CostView, StatIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { RangeB } from '../../../shared/ui/RangeB';
import { ListHead } from '../../../shared/ui/layout';
import { Loading } from '../../../shared/ui/widgets';
import SimPanel, { type StatRow } from '../../simulator/components/SimPanel';
import { SIM_ROWS } from '../../simulator/logic/format';
import { fmtSide, parseSide, type Mode, type SideSpec } from '../logic/state';
import { CostDiscountBlock } from './CostDiscount';
import { UnitPicker } from './UnitPicker';
import { substituteIn } from '../logic/substitute';
import { BreakEven } from './BreakEven';
import { RealCostBlock, realCostOf } from './RealCost';
import { formatTrade, tradeLosses } from '../../../domain/trade';
import { countForTime, DEFAULT_MIN, DEFAULT_VILS, fmtClock } from '../../../domain/realCost';
import { CounterSummary } from './CounterSummary';
import { DamageBreakdown } from './DamageBreakdown';
import { AgeComparison } from './AgeComparison';
import { BattleReplay } from './BattleReplay';
import { groupReplay, oneReplay } from '../../../domain/battleReplay';

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
  /** 训练费用（已按已核实的常驻文明加成折算，#24） */
  disc: CostDiscount;
}
/** issue 124 选的文明造不了这个单位：保留玩家选的文明，不出属性与战斗结果，等玩家点按钮 */
interface Unavail {
  unavail: true;
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  /** 可替代单位；null = 没有替代 */
  sub: Unit | null;
}
type SideState = Resolved | Unavail;
const isUnavail = (s: SideState): s is Unavail => 'unavail' in s;

function resolve(ctx: SimContext, byId: Record<number, Unit>, spec: SideSpec, fallback: number): SideState {
  let u = byId[spec.uid];
  if (!u || !u.civs.length) u = byId[fallback]!;
  // issue 124：URL 里是一个真实文明但它造不了这个单位时，不再静默换成 civs[0]；只有文明为空/不认识时才回落
  if (!u.civs.includes(spec.civ) && civByEn(spec.civ)) {
    const s = substituteIn(byId, u.id, spec.civ);
    return { unavail: true, spec, u, civ: spec.civ, age: Math.max(u.age, spec.age), sub: s !== null && s !== u.id ? byId[s]! : null };
  }
  const civ = u.civs.includes(spec.civ) ? spec.civ : u.civs[0]!;
  const age = Math.max(u.age, spec.age);
  const avail = simTechs(ctx, u, civ);
  const ok = new Set(avail.map((x) => x.t.id));
  // issue 100：模拟、标题、取价统一用 URL 时代（未写时代按帝王）；「满科技」= 该时代及以前可研究的科技全算
  const sel = spec.techs === 'f' || spec.techs === 'c' ? presetUpTo(avail, age) : new Set(spec.techs.filter((i) => ok.has(i)));
  const S = simulate(ctx, u, civ, age, sel, new Set(spec.team));
  const disc = discountedCost(u, civ, priceAge(u.age, age), { techIds: ok });
  return { spec, u, civ, age, sel, S, F: { ...fighterFrom(u, S), cost: disc.cost }, avail, disc };
}

export default function Duel() {
  const core = useCore(),
    trees = useTrees();
  const [sp, setSp] = useSearchParams();
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const mode = (['1', 'n', 'r', 't'].includes(sp.get('m') ?? '') ? sp.get('m') : '1') as Mode;
  const na = Math.max(1, Math.min(200, Number(sp.get('na')) || 10)),
    nb = Math.max(1, Math.min(200, Number(sp.get('nb')) || 10)),
    bud = Math.max(100, Math.min(100000, Number(sp.get('bud')) || 3000));
  const vils = Math.max(1, Math.min(200, Math.floor(Number(sp.get('vil'))) || DEFAULT_VILS)),
    mins = Math.max(1, Math.min(120, Math.floor(Number(sp.get('min'))) || DEFAULT_MIN));
  const eq = mode === 'r' || mode === 't';
  const set = (k: Record<string, string>, drop: string[] = []) => {
    const n = new URLSearchParams(sp);
    Object.entries(k).forEach(([a, b]) => n.set(a, b));
    drop.forEach((d) => n.delete(d));
    setSp(n, { replace: true });
  };
  // issue 102：地址栏始终带完整的 a、b、m（等资源再带 bud，N vs M 再带 na/nb），反馈链接读地址栏即可复现当前对阵
  const canon = new URLSearchParams(sp);
  // issue 141：文明为空或认不出时页面回落到该单位第一个能造的文明（issue 124 的规则不变），URL 也用 replace 写成这个文明
  const civFix = (s: SideSpec, fallback: number): SideSpec => {
    if (!core || civByEn(s.civ)) return s;
    const u = core.unitById[s.uid]?.civs.length ? core.unitById[s.uid]! : core.unitById[fallback];
    return u?.civs.length ? { ...s, civ: u.civs[0]! } : s;
  };
  canon.set('a', fmtSide(civFix(parseSide(sp.get('a'), DEF_A), DEF_A.uid)));
  canon.set('b', fmtSide(civFix(parseSide(sp.get('b'), DEF_B), DEF_B.uid)));
  canon.set('m', mode);
  if (mode === 'r') canon.set('bud', String(bud));
  if (mode === 't' && vils !== DEFAULT_VILS) canon.set('vil', String(vils));
  else canon.delete('vil');
  if (mode === 't' && mins !== DEFAULT_MIN) canon.set('min', String(mins));
  else canon.delete('min');
  if (mode === 'n') {
    canon.set('na', String(na));
    canon.set('nb', String(nb));
  }
  const canonStr = canon.toString();
  useEffect(() => {
    if (canonStr !== sp.toString()) setSp(new URLSearchParams(canonStr), { replace: true });
  }, [canonStr, sp, setSp]);
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
  const cnt = (s: SideState, n: number) =>
    isUnavail(s)
      ? 1
      : mode === 'r'
        ? countForBudget(s.disc.cost, bud)
        : mode === 't'
          ? Math.max(1, countForTime(realCostOf(s.disc, s.age, s.civ).rc.total, vils, mins))
          : mode === 'n'
            ? n
            : 1;
  const cntA = cnt(A, na),
    cntB = cnt(B, nb);
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
          <button
            key={k}
            role="radio"
            aria-checked={mode === k || (k === 'r' && mode === 't')}
            className={mode === k || (k === 'r' && mode === 't') ? 'on' : undefined}
            onClick={() => set({ m: k }, ['be'])}
          >
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
      {eq && (
        <div className="rc-seg">
          <span className="seg" role="radiogroup" aria-label="比法" data-t="rc-toggle">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'r'}
              className={mode === 'r' ? 'on' : undefined}
              onClick={() => set({ m: 'r' }, ['vil', 'min'])}
            >
              等资源
            </button>
            <button type="button" role="radio" aria-checked={mode === 't'} className={mode === 't' ? 'on' : undefined} onClick={() => set({ m: 't' })}>
              <Icon name="clock" className="ic" />
              等采集时间
            </button>
          </span>
        </div>
      )}
      {mode === 't' && (
        <div className="rc-budget" data-t="rc-budget">
          <span>
            村民时间 <b data-t="rc-budget-text">{`${vils} 个村民 × ${fmtClock(mins * 60)}`}</b>
          </span>
          <label>
            村民 <input id="duel-vil" type="number" min={1} max={200} value={vils} onChange={(e) => set({ vil: e.target.value })} />
          </label>
          <label>
            分钟 <input id="duel-min" type="number" min={1} max={120} value={mins} onChange={(e) => set({ min: e.target.value })} />
          </label>
        </div>
      )}
      <div className="duel-sides">
        <Side k="a" side={A} fams={fams} onChange={(s) => upd('a', s)} count={cntA} bud={mode === 'r' ? bud : 0} time={mode === 't' ? [vils, mins] : null} />
        <div className="duel-vs">VS</div>
        <Side k="b" side={B} fams={fams} onChange={(s) => upd('b', s)} count={cntB} bud={mode === 'r' ? bud : 0} time={mode === 't' ? [vils, mins] : null} />
      </div>
      {isUnavail(A) || isUnavail(B) ? (
        <div id="duel-pending" className="posbox duel-pending">
          <p data-t="pk-pending">
            <Icon name="info" className="ic" />
            先在上面选好能造的单位或文明，再出对战结果。
          </p>
        </div>
      ) : mode === '1' ? (
        <OneVOne key={[fmtSide(A.spec), fmtSide(B.spec)].join('|')} A={A} B={B} />
      ) : (
        <Group key={[mode, fmtSide(A.spec), fmtSide(B.spec), cntA, cntB].join('|')} A={A} B={B} na={cntA} nb={cntB} bud={mode === 'r' ? bud : 0} />
      )}
      {!isUnavail(A) && !isUnavail(B) && <DamageBreakdown ctx={ctx} a={A} b={B} />}
      {!isUnavail(A) && !isUnavail(B) && <AgeComparison ctx={ctx} byId={core.unitById} a={{ ...A.spec, civ: A.civ }} b={{ ...B.spec, civ: B.civ }} />}
      {!eq && !isUnavail(A) && !isUnavail(B) && (
        // #25 盈亏平衡点：等资源模式 v1 不放入口（v2 SPEC）
        <BreakEven
          key={mode}
          a={A.F}
          b={B.F}
          nb={cntB}
          summary={`${beSide(A)} vs ${beSide(B)}`}
          sig={[mode, fmtSide(A.spec), fmtSide(B.spec), cntB].join('|')}
          auto={sp.get('be') === '1'}
          onComputed={() => set({ be: '1' })}
          onOpen={(n, m) => set({ m: 'n', na: String(n), nb: String(m) }, mode === 'n' ? [] : ['be'])}
        />
      )}
      <p className="note duel-note">
        <Icon name="triangle-alert" className="ic warn" />
        近似模型：伤害 = max(1, Σ max(0, 攻击类别 − 对应护甲类别))（来源：Fandom「Armor class」、aoe2.rocks 伤害计算）；双方 t=0
        同时出手（缺少出手前摇数据）；远程按命中率取期望伤害；忽略射程、走位/风筝、地形高低差、冲锋攻击、溅射、特殊能力与独特科技（仅文本）。群战为集火模型，不考虑近战包围空间；等资源已计入已核实的常驻文明训练费用加成；未核实的加成、团队加成与需研究的科技折扣不计入。结果用于比较强弱趋势，不等同于实战。
      </p>
    </section>
  );
}

const PRESET_ZH = { f: '满科技', c: '当前时代满科技' } as const;
const beSide = (s: Resolved) =>
  `${civByEn(s.civ)?.zh ?? s.civ} ${s.u.zh}` +
  (Array.isArray(s.spec.techs) ? (s.spec.techs.length ? ` · 自选科技 ${s.sel.size} 项` : ' · 无科技') : ` · ${PRESET_ZH[s.spec.techs]}`);

function Side({
  k,
  side,
  fams,
  onChange,
  count,
  bud,
  time,
}: {
  k: 'a' | 'b';
  side: SideState;
  fams: ReturnType<typeof collapse>;
  onChange: (s: SideSpec) => void;
  count: number;
  /** 等资源预算；0 = 非等资源模式（不显示折后价） */
  bud: number;
  /** #88 等采集时间预算 [村民数, 分钟]；null = 非该模式 */
  time: [number, number] | null;
}) {
  const core = useCore()!;
  if (isUnavail(side)) return <UnavailSide k={k} side={side} fams={fams} onChange={onChange} />;
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
            {civByEn(side.civ)?.zh} · <span className="duel-age">{AGE_ZH[side.age]}</span> · <CostView c={u.cost} />
          </small>
        </div>
      </div>
      {time && <RealCostBlock k={k} civ={side.civ} civZh={civByEn(side.civ)?.zh ?? side.civ} age={side.age} d={side.disc} vils={time[0]} min={time[1]} />}
      {bud > 0 && <CostDiscountBlock k={k} unit={u.zh} civ={civByEn(side.civ)?.zh ?? side.civ} d={side.disc} bud={bud} count={count} />}
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
            ['f', '满科技', () => onChange({ ...spec, techs: 'f', age: 4, ageSet: true })],
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
              [
                'rof',
                '攻击间隔',
                side.S.rof > 0 ? (
                  (Math.round(side.S.rof * 100) / 100).toString() + 's'
                ) : (
                  <>
                    —
                    <small className="note rof-reason" data-t="rof-reason">
                      {DPS_UNAVAILABLE_REASON}
                    </small>
                  </>
                ),
              ],
              [
                'range',
                '射程',
                <>
                  {r1(side.S.rng)}
                  <RangeB u={side.S} compact />
                </>,
              ],
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

/** issue 124：选的文明造不了这个单位。文明保持玩家选的，URL 不动；只有点按钮才改写 a / b */
function UnavailSide({ k, side, fams, onChange }: { k: 'a' | 'b'; side: Unavail; fams: ReturnType<typeof collapse>; onChange: (s: SideSpec) => void }) {
  const { u, spec, sub } = side;
  const civZh = civByEn(side.civ)?.zh ?? side.civ;
  const civId = `duel-${k}-civ`;
  return (
    <div className={`duel-side side-${k} is-unavail`} id={`duel-${k}`} data-unavailable="true">
      <div className="duel-head">
        <UnitIcon u={u} big />
        <div>
          <h3>
            {k.toUpperCase()} · {u.zh}
          </h3>
          <small className="note">
            {civZh} · <span className="duel-age">{AGE_ZH[side.age]}</span>
          </small>
        </div>
      </div>
      <div className="pk-unavail" role="status">
        <p className="pk-unavail-t">
          <Icon name="info" className="ic" />
          <span data-t={`pk-unavail-${k}`}>{sub ? `${civZh}造不了${u.zh}。` : `${civZh}造不了${u.zh}，也没有可以替代的单位。`}</span>
        </p>
        <div className="pk-unavail-acts">
          {sub && (
            <button type="button" className="pk-act pri" onClick={() => onChange({ ...spec, uid: sub.id, age: Math.max(spec.age, sub.age) })}>
              换成{sub.zh}
            </button>
          )}
          <button type="button" className="pk-act" onClick={() => document.getElementById(civId)?.click()}>
            换个文明
          </button>
        </div>
      </div>
      <div className="bar">
        <UnitPicker id={`duel-${k}-unit`} label={`${k.toUpperCase()} 方单位`} value={u} list={fams} onChange={(x) => onChange({ ...spec, uid: x.id })} />
      </div>
      <div className="bar">
        <CivPicker id={civId} label={`${k.toUpperCase()} 方文明`} value={side.civ} allowed={u.civs} onChange={(c) => onChange({ ...spec, civ: c })} />
      </div>
    </div>
  );
}

function OneVOne({ A, B }: { A: Resolved; B: Resolved }) {
  const r = duel(A.F, B.F);
  const wn = r.winner === 'draw' ? '平局（同时击杀）' : `${r.winner === 'a' ? 'A' : 'B'} · ${(r.winner === 'a' ? A : B).u.zh} 获胜`;
  const T = Math.max(r.ab.time ?? 0, r.ba.time ?? 0, r.duration, 0.01);
  const fmtTime = (ow: typeof r.ab) => (ow.time === null ? '—' : r1(ow.time) + 's');
  const fmtDps = (ow: typeof r.ab) => (ow.dps === null || !Number.isFinite(ow.dps) ? '—' : (Math.round(ow.dps * 100) / 100).toString());
  const rows: [string, string, string, string?][] = [
    ['每击伤害', r1(r.ab.dmg), r1(r.ba.dmg)],
    ['期望每击（含命中率）', r1(r.ab.expDmg), r1(r.ba.expDmg)],
    ['击杀所需次数', String(r.ab.hits), String(r.ba.hits)],
    ['击杀用时', fmtTime(r.ab), fmtTime(r.ba)],
    ['DPS', fmtDps(r.ab), fmtDps(r.ba)],
  ];
  const dpsReason = r.ab.dpsReason || r.ba.dpsReason;
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
      <ShareImage
        title={`${A.u.zh} 对 ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(r.duration)} 秒`],
          ['剩余生命', r1(r.remaining)],
          ['双方数量', '1 / 1'],
        ]}
        note="忽略射程拉扯与操作；完整文明和科技参数见链接。"
      />
      <CounterSummary a={A.F} b={B.F} />
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
      {dpsReason && (
        <p className="note" data-t="dps-reason">
          {dpsReason}
        </p>
      )}
      <BattleReplay frames={oneReplay(A.F, B.F, r)} duration={r.duration} a={A.u} b={B.u} maxA={A.F.hp} maxB={B.F.hp} unit="生命" />
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
              <div className="tl-fill" style={{ width: `${(Math.min(w.time ?? r.duration, r.duration) / T) * 100}%` }} />
              {s.F.rof > 0 &&
                Array.from({ length: Math.min(w.hits, 60) }, (_, i) => i * s.F.rof)
                  .filter((t) => t <= r.duration + 1e-9)
                  .map((t, i) => <i key={i} className="tl-hit" style={{ left: `${(t / T) * 100}%` }} />)}
              {w.time !== null && w.time <= r.duration + 1e-9 && (
                <b className="tl-kill" style={{ left: `${(w.time / T) * 100}%` }} title={`击杀 ${r1(w.time)}s`} />
              )}
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
      <ShareImage
        title={`${na} ${A.u.zh} 对 ${nb} ${B.u.zh}：${wn}`}
        stats={[
          ['模拟用时', `${r1(g.duration)} 秒`],
          ['A 存活', g.aAlive],
          ['B 存活', g.bAlive],
        ]}
        note="群战不模拟走位、围墙与城镇中心火力；完整参数见链接。"
      />
      {bud > 0 && (
        <p className="note">
          预算 {bud}：A {A.u.zh} × {na}（单价 {costSum(A.disc.cost)}，投入 {na * costSum(A.disc.cost)}），B {B.u.zh} × {nb}（单价 {costSum(B.disc.cost)}，投入{' '}
          {nb * costSum(B.disc.cost)}）
        </p>
      )}
      <CounterSummary a={A.F} b={B.F} />
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
      <TradeRow A={A} B={B} na={na} nb={nb} aAlive={g.aAlive} bAlive={g.bAlive} />
      <BattleReplay frames={groupReplay(g)} duration={g.duration} a={A.u} b={B.u} maxA={na} maxB={nb} unit="个单位" />
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

/** issue 107 交换比：只计阵亡单位，按折后取整单价；金按 1:1 计入 */
function TradeRow({ A, B, na, nb, aAlive, bAlive }: { A: Resolved; B: Resolved; na: number; nb: number; aAlive: number; bAlive: number }) {
  const t = tradeLosses({ na, nb, aAlive, bAlive, costA: A.disc.cost, costB: B.disc.cost });
  const f = formatTrade(t);
  return (
    <div className="pk-trade" data-t="pk-trade">
      <p className="pk-trade-main">
        {f.label}{' '}
        <b className="pk-trade-value" data-t="pk-trade-value">
          {f.value}
        </b>
      </p>
      {f.note && <p className="note">{f.note}</p>}
      {(['a', 'b'] as const).map((k) => (
        <p key={k} className="note pk-trade-loss" data-t={`pk-trade-loss-${k}`}>
          <span className="nw">
            {k.toUpperCase()} 损失 {t[k].total}
          </span>
          （阵亡 {t[k].dead}
          {t[k].dead > 0 && (
            <>
              ：<CostView c={t[k].res} />
            </>
          )}
          ）
        </p>
      ))}
      <p className="note">只计阵亡单位，存活单位掉的血不算；金按 1:1 计入。</p>
    </div>
  );
}
