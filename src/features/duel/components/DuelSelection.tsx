import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DPS_UNAVAILABLE_REASON } from '../../../domain/duel';
import { baseUnit } from '../../../domain/family';
import type { collapse } from '../../../domain/family';
import { AGE_ZH } from '../../../domain/ratings';
import { TEAM_BONUSES } from '../../../domain/effects';
import { baseStats, civBonusNotes } from '../../../domain/simulator';
import type { SideSpec } from '../../../domain/duelState';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CostView, StatIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { RangeB } from '../../../shared/ui/RangeB';
import SimPanel, { type StatRow } from '../../../shared/ui/sim/SimPanel';
import { SIM_ROWS } from '../../../shared/utils/simFormat';
import { RealCostBlock } from '../../../shared/ui/RealCost';
import { CostDiscountBlock } from './CostDiscount';
import { UnitPicker } from './UnitPicker';
import { isUnavail, r1, type SideState, type Unavail } from '../logic/duelSide';

export function Side({
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
