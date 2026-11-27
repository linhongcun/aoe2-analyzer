import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { militaryTechAge } from '../../../domain/availabilityAge';
import { DPS_UNAVAILABLE_REASON, fighterCanAttack, fighterUsesAssumeHit, mainAttackType, NO_NORMAL_ATTACK_REASON } from '../../../domain/duel';
import { applicableUnmodeledTechIds } from '../../../domain/duelUnmodeled';
import { formatHp } from '../../../domain/hpFormat';
import { baseUnit, isElite } from '../../../domain/family';
import type { collapse } from '../../../domain/family';
import { AGE_ZH } from '../../../domain/ratings';
import { TEAM_BONUSES, type CivRelicBonus } from '../../../domain/effects';
import { baseStats, civBonusNotes } from '../../../domain/simulator';
import type { SideSpec } from '../../../domain/duelState';
import { unitTrainCount } from '../../../domain/trainBatch';
import { unitAvailable } from '../../../domain/unitAvailability';
import { unitOptionLabel } from '../../../domain/unitOptionLabel';
import type { Unit } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CivIcon, StatIcon, UnitIcon } from '../../../shared/ui/art';
import { CivArtLayer } from '../../../shared/ui/CivArtLayer';
import { Icon } from '../../../shared/ui/Icon';
import { NumWrappedText } from '../../../shared/ui/widgets';
import { RangeB } from '../../../shared/ui/RangeB';
import { RelicCountSelector } from '../../../shared/ui/RelicCountSelector';
import SimPanel, { type StatRow } from '../../../shared/ui/sim/SimPanel';
import { SIM_ROWS } from '../../../shared/utils/simFormat';
import { RealCostBlock } from '../../../shared/ui/RealCost';
import { EMPTY_TRAINING_TECH } from '../logic/trainingCostView';
import { CostDiscountBlock } from './CostDiscount';
import { PkCost } from './PkCost';
import { TrainingPrice } from './TrainingPrice';
import { UnitPicker } from '../../../shared/ui/UnitPicker';
import { filterExplicitTechsForAge, isUnavail, r1, switchSideCiv, switchSideUnit, type SideState, type Unavail } from '../logic/duelSide';
import { radioKeyboard } from './radioKeyboard';
import { RangedModeToggle } from './RangedModeToggle';
import { duelToTrainTotal } from '../../../domain/productionTransfer';
import type { ProductionContext } from '../../../domain/production';
import { encodeTrainTotal } from '../../../domain/trainTotal';
import { productionTransferState } from '../../../shared/utils/productionTransferState';
import '../../../shared/ui/productionTransfer.css';
import '../unmodeled-notes.css';

const AGES = [1, 2, 3, 4] as const;

export function Side({
  k,
  side,
  fams,
  onChange,
  count,
  batches,
  bud,
  time,
  context,
  canKite = false,
  kite = false,
  onKiteChange,
  relicBonus = null,
  relics = 0,
  onRelicsChange,
}: {
  k: 'a' | 'b';
  side: SideState;
  fams: ReturnType<typeof collapse>;
  onChange: (s: SideSpec) => void;
  count: number | null;
  batches?: number | null;
  /** 等资源预算；0 = 不显示派出数量和训练投入 */
  bud: number;
  /** issue 88 等采集时间预算 [村民数, 分钟]；null = 非该模式 */
  time: [number, number] | null;
  context: ProductionContext;
  canKite?: boolean;
  kite?: boolean;
  onKiteChange?: (kite: boolean) => void;
  relicBonus?: CivRelicBonus | null;
  relics?: number;
  onRelicsChange?: (relics: number) => void;
}) {
  const core = useCore()!;
  const fullUnits = useMemo(() => fams.map((entry) => entry.u), [fams]);
  const formatUnitLabel = useMemo(() => (unit: Unit) => unitOptionLabel(context, unit, fullUnits), [context, fullUnits]);
  const displayCount = count ?? 0;
  const transfer = useMemo(
    () =>
      count !== null && count >= 1
        ? duelToTrainTotal(context, {
            side: k,
            unit: side.u,
            civ: side.civ,
            age: side.age,
            count,
            techs: side.spec.techs,
            selected: isUnavail(side) ? undefined : side.sel,
          })
        : null,
    [context, k, side, count],
  );
  const transferLink = transfer ? (
    <Link
      className="duel-transfer-link"
      to={'/production?' + encodeTrainTotal(transfer.config)}
      state={productionTransferState(transfer.notice)}
      replace={false}
    >
      <Icon name="calculator" />
      <span>算 {k.toUpperCase()} 方训练总价</span>
      {displayCount > 1 && <span className="num nw">（× {displayCount}）</span>}
      <Icon name="arrow-right" />
    </Link>
  ) : null;
  if (isUnavail(side))
    return <UnavailSide k={k} side={side} fams={fams} formatUnitLabel={formatUnitLabel} onChange={onChange} transferLink={transferLink} context={context} />;
  const { u, spec } = side;
  const tc = unitTrainCount(u);
  const base = baseUnit(u, core.fam),
    elite = core.fam.eliteOf[base.id];
  const eliteSelected = isElite(u, core.fam);
  const preset = Array.isArray(spec.techs) ? (spec.techs.length ? '' : 'none') : spec.techs === 'f' && side.age < 4 ? 'c' : spec.techs;
  const rows: StatRow[] = SIM_ROWS.map(([kk, n, ic]) => [kk, n, ic === null ? (mainAttackType(u) === '穿刺' ? 'patk' : 'atk') : ic]);
  const onAgeChange = (nextAge: number) => {
    const nextTechs: SideSpec['techs'] = Array.isArray(spec.techs)
      ? filterExplicitTechsForAge(spec.techs, core.techById, side.civ, nextAge)
      : spec.techs === 'f' && nextAge < 4
        ? 'c'
        : spec.techs;
    onChange({ ...spec, age: nextAge, ageSet: true, techs: nextTechs });
  };
  const onCivChange = (nextCiv: string) =>
    onChange(switchSideCiv({ byId: context.core.unitById, techById: context.core.techById, trees: context.trees }, spec, u, nextCiv));
  const civObj = civByEn(side.civ);
  const ownTeamLabels = TEAM_BONUSES.filter(([teamCiv, , f]) => teamCiv === side.civ && f(u)).map(([, label]) => label);
  const extraTeam = new Set(spec.team.filter((id) => TEAM_BONUSES[id]?.[0] !== side.civ));
  return (
    <div className={`duel-side side-${k} civ-art-host`} id={`duel-${k}`}>
      <CivArtLayer civ={side.civ} side={k} variant="head-band" mirror={k === 'b'} />
      <div className="duel-head">
        <UnitIcon u={u} big />
        <div className="duel-head-main">
          <h2 className="duel-side-title">
            <span className={`civ-side-badge is-${k}`}>{k.toUpperCase()} 方</span>
            <span>{u.zh}</span>
            {displayCount > 1 && <span className="tag duel-count-pill num nw">× {displayCount}</span>}
          </h2>
          <small className="note duel-meta">
            <span className="duel-meta-civ">
              {civObj && <CivIcon c={civObj} alt="" />}
              <span>
                {civObj?.zh} · <span className="duel-age">{AGE_ZH[side.age]}</span>
              </span>
            </span>
            <PkCost cost={side.training.price.cost} base={side.training.before} showPairTag={(bud > 0 || time !== null) && tc > 1} />
          </small>
        </div>
      </div>
      <div data-t={`pk-cost-${k}`}>
        <TrainingPrice quote={side.training} sel={side.sel} bud={bud} count={count} batches={batches} trainCount={tc} />
        <CostDiscountBlock unit={u.zh} civ={civByEn(side.civ)?.zh ?? side.civ} d={side.disc} />
      </div>
      {time && (
        <RealCostBlock
          headingLevel={3}
          k={k}
          civ={side.civ}
          civZh={civByEn(side.civ)?.zh ?? side.civ}
          age={side.age}
          d={{ ...side.disc, cost: side.training.price.cost, exact: side.training.price.exact }}
          vils={time[0]}
          min={time[1]}
          trainCount={tc}
        />
      )}
      <div className="duel-pickers">
        <div className="duel-unit-slot">
          <UnitPicker
            id={`duel-${k}-unit`}
            label={`${k.toUpperCase()} 方单位`}
            value={u}
            civ={side.civ}
            list={fams}
            formatLabel={formatUnitLabel}
            onChange={(x) => onChange(switchSideUnit(core.techById, spec, x.id, x.chargeType ?? 0))}
          />
          {elite && (
            <span className="eseg" role="radiogroup" aria-label="普通/精锐" onKeyDown={radioKeyboard}>
              <button
                type="button"
                role="radio"
                aria-checked={u.id === base.id}
                tabIndex={u.id === base.id ? 0 : -1}
                className={u.id === base.id ? 'on' : undefined}
                onClick={() => onChange(switchSideUnit(core.techById, spec, base.id, base.chargeType ?? 0))}
              >
                普通
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={eliteSelected}
                tabIndex={eliteSelected ? 0 : -1}
                className={eliteSelected ? 'on' : undefined}
                onClick={() => onChange(switchSideUnit(core.techById, spec, elite.id, elite.chargeType ?? 0))}
              >
                精锐
              </button>
            </span>
          )}
        </div>
        <div className="duel-civ-slot">
          <CivPicker id={`duel-${k}-civ`} label={`${k.toUpperCase()} 方文明`} value={side.civ} allowed={u.civs} compactTrigger onChange={onCivChange} />
        </div>
      </div>
      <div className="duel-age-presets">
        <select
          id={`duel-${k}-age`}
          className="duel-age-select"
          aria-label={`${k.toUpperCase()} 方时代`}
          value={side.age}
          onChange={(e) => onAgeChange(Number(e.target.value))}
        >
          {AGES.map((age) => (
            <option key={age} value={age} disabled={!unitAvailable(context, side.civ, u.id, age) && age !== side.age}>
              {AGE_ZH[age]}
            </option>
          ))}
        </select>
        <div className="duel-presets" role="radiogroup" aria-label="科技预设" onKeyDown={radioKeyboard}>
          {(
            [
              ['none', '无科技', () => onChange({ ...spec, techs: [] })],
              ['c', '当前时代满', () => onChange({ ...spec, techs: 'c' })],
              ['f', '帝王满科技', () => onChange({ ...spec, techs: 'f', age: 4, ageSet: true })],
            ] as const
          ).map(([id, l, f]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={preset === id}
              tabIndex={preset === id || (!preset && id === 'none') ? 0 : -1}
              className={preset === id ? 'on' : undefined}
              onClick={f}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {canKite && onKiteChange && <RangedModeToggle side={k} active={kite} onChange={onKiteChange} />}
      {relicBonus && onRelicsChange && (
        <RelicCountSelector
          variant="duel"
          side={k}
          value={relics}
          maxRelics={relicBonus.maxRelics}
          perRelicAtk={relicBonus.perRelicAtk}
          maxAtk={relicBonus.maxAtk}
          ageLocked={side.age < relicBonus.minAge}
          onChange={onRelicsChange}
        />
      )}
      <dl className="duel-stats">
        {(
          [
            ['hp', '生命值', <span className="num nw">{formatHp(side.F.hp)}</span>],
            [
              fighterCanAttack(side.F) && mainAttackType(u) === '穿刺' ? 'patk' : 'atk',
              '攻击',
              fighterCanAttack(side.F) ? (
                <>
                  <span className="num nw">{r1(side.S.atk)}</span>
                  {`（${mainAttackType(u)}）`}
                </>
              ) : (
                <span data-t={`pk-no-atk-${k}`}>{NO_NORMAL_ATTACK_REASON}</span>
              ),
            ],
            ['marm', '护甲', <span className="num nw">{`${r1(side.S.ma)} / ${r1(side.S.pa)}`}</span>],
            [
              'rof',
              '攻击间隔',
              !fighterCanAttack(side.F) ? (
                <span>{NO_NORMAL_ATTACK_REASON}</span>
              ) : side.S.rof > 0 ? (
                <span className="num nw">{`${Math.round(side.S.rof * 100) / 100}s`}</span>
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
                <span className="num nw">{r1(side.S.rng)}</span>
                <RangeB u={side.S} compact />
              </>,
            ],
            !fighterCanAttack(side.F)
              ? ['', '本场命中口径', <span data-t={`pk-no-atk-acc-${k}`}>{NO_NORMAL_ATTACK_REASON}</span>]
              : fighterUsesAssumeHit(side.F)
                ? [
                    '',
                    '本场命中口径',
                    <span className="duel-acc-assume" data-t={`pk-assume-hit-stat-${k}`}>
                      <span className="pk-acc-pill nw">按每击命中估算</span>
                      <small className="note duel-acc-sub">
                        目录准确度 <span className="num nw">0%</span>
                      </small>
                    </span>,
                  ]
                : (['', '命中率', <span className="num nw">{`${Math.round(side.F.acc * 100)}%`}</span>] as const),
          ] as readonly (readonly [string, string, ReactNode])[]
        ).map(([ic, n, v]) => (
          <div className="duel-stat-cell" key={n}>
            <dt>
              <StatIcon k={ic} t={n} />
              {n}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {ownTeamLabels.length > 0 && (
        <p className="duel-own-team" data-t={`duel-own-team-${k}`}>
          <Icon name="check" className="ic sim-team-own-ic" />
          <span>
            本方常驻团队加成（已自动计入）：
            <NumWrappedText text={ownTeamLabels.join('；')} />
          </span>
        </p>
      )}
      <div className="duel-card-foot">
        <details className="duel-tech">
          <summary>
            科技详情（已选 <span className="num nw">{side.sel.size} 项</span>）
          </summary>
          {!side.training.costs.length && <p className="note">{EMPTY_TRAINING_TECH}</p>}
          <SimPanel
            hideAge
            headingLevel={2}
            embedded={`duel-${k}`}
            civs={u.civs}
            minAge={AGES.find((a) => unitAvailable(context, side.civ, u.id, a)) ?? u.age}
            civ={side.civ}
            age={side.age}
            sel={side.sel}
            team={extraTeam}
            cmp=""
            avail={[
              ...side.avail,
              ...side.training.costs.filter((item) => !side.avail.some((row) => row.t.id === item.tech.id)).map((item) => ({ t: item.tech, ef: null })),
            ]}
            selectableWithoutEffect={
              new Set([
                ...side.training.costs.map((item) => item.tech.id),
                ...applicableUnmodeledTechIds(side.avail, u.id, u.combatAbility ?? 0, u.chargeType ?? 0),
                ...side.sel,
              ])
            }
            presetExtra={(scope) => {
              const limit = scope === 'all' ? 4 : scope;
              return new Set(
                side.training.costs
                  .filter((item) => item.supported && !item.partial && militaryTechAge(side.civ, item.tech.id, item.tech.age) <= limit)
                  .map((item) => item.tech.id),
              );
            }}
            techById={core.techById}
            rows={rows}
            base={baseStats(u)}
            cur={side.S}
            cmpStats={null}
            civNotes={civBonusNotes(u, side.civ)}
            armorClasses={Object.entries(side.S.armc)}
            teamBonuses={TEAM_BONUSES.map(([civ, label, f]) => ({ civ, label, ok: f(u) }))}
            go={(civ, age, sel, team) =>
              onChange({
                uid: u.id,
                civ,
                age,
                ageSet: true,
                techs: [...sel],
                team: [...team].filter((id) => TEAM_BONUSES[id]?.[0] !== civ),
              })
            }
            setCmp={() => {}}
          />
        </details>
        {transferLink}
      </div>
    </div>
  );
}

/** issue 124：选的文明造不了这个单位。文明保持玩家选的，URL 不动；只有点按钮才改写 a / b */
function UnavailSide({
  k,
  side,
  fams,
  formatUnitLabel,
  onChange,
  transferLink,
  context,
}: {
  k: 'a' | 'b';
  side: Unavail;
  fams: ReturnType<typeof collapse>;
  formatUnitLabel: (unit: Unit) => string;
  onChange: (s: SideSpec) => void;
  transferLink: React.ReactNode;
  context: ProductionContext;
}) {
  const { u, spec, sub } = side;
  const civObj = civByEn(side.civ);
  const civZh = civObj?.zh ?? side.civ;
  const civId = `duel-${k}-civ`;
  return (
    <div className={`duel-side side-${k} is-unavail civ-art-host`} id={`duel-${k}`} data-unavailable="true">
      <CivArtLayer civ={side.civ} side={k} variant="head-band" mirror={k === 'b'} muted />
      <div className="duel-head">
        <UnitIcon u={u} big />
        <div className="duel-head-main">
          <h2 className="duel-side-title">
            <span className={`civ-side-badge is-${k}`}>{k.toUpperCase()} 方</span>
            <span>{u.zh}</span>
          </h2>
          <small className="note duel-meta">
            <span className="duel-meta-civ">
              {civObj && <CivIcon c={civObj} alt="" />}
              <span>
                {civZh} · <span className="duel-age">{AGE_ZH[side.age]}</span>
              </span>
            </span>
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
            <button
              type="button"
              className="pk-act pri"
              onClick={() => onChange({ ...switchSideUnit(context.core.techById, spec, sub.id, sub.chargeType ?? 0), age: Math.max(spec.age, sub.age) })}
            >
              换成{sub.zh}
            </button>
          )}
          <button type="button" className="pk-act" onClick={() => document.getElementById(civId)?.click()}>
            换个文明
          </button>
        </div>
      </div>
      <div className="duel-pickers">
        <div className="duel-unit-slot">
          <UnitPicker
            id={`duel-${k}-unit`}
            label={`${k.toUpperCase()} 方单位`}
            value={u}
            civ={side.civ}
            list={fams}
            formatLabel={formatUnitLabel}
            onChange={(x) => onChange(switchSideUnit(context.core.techById, spec, x.id, x.chargeType ?? 0))}
          />
        </div>
        <div className="duel-civ-slot">
          <CivPicker
            id={civId}
            label={`${k.toUpperCase()} 方文明`}
            value={side.civ}
            allowed={u.civs}
            compactTrigger
            onChange={(c) => onChange(switchSideCiv({ byId: context.core.unitById, techById: context.core.techById, trees: context.trees }, spec, u, c))}
          />
        </div>
      </div>
      <div className="duel-card-foot duel-card-foot-unavail">{transferLink}</div>
    </div>
  );
}
