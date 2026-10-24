import { Link } from 'react-router-dom';
import { civs } from '../../data';
import { encodeProduction, type ProductionContext } from '../../domain/production';
import {
  PLAN_LIMITS,
  POSITION_NAMES,
  SUPPLY_NAMES,
  planPotentialBuildings,
  requiredPlanUnlocks,
  type PlanForce,
  type PlanPhase,
  type PlanPlayer,
  type PlayerPhase,
} from '../../domain/teamPlan';
import { ForceEditor } from './ForceEditor';
import { TextField } from './PlanTextField';
import { labelFor, playerLabel, unique } from './teamPlanLabels';

const toggle = (values: number[], id: number) => (values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);

export function PlayerEditor({
  ctx,
  player,
  phase,
  row,
  update,
}: {
  ctx: ProductionContext;
  player: PlanPlayer;
  phase: PlanPhase;
  row: PlayerPhase;
  update: (row: PlayerPhase) => void;
}) {
  const selected = [row.main, row.secondary].filter((f): f is PlanForce => f !== null);
  const forms = unique([
    ...selected.map((f) => f.unitId).filter((id) => ctx.core.unitById[id]?.from_ !== null && ctx.core.unitById[id]?.from_ !== undefined),
    ...row.completedForms,
  ]);
  const techs = unique([...selected.flatMap((f) => requiredPlanUnlocks(f.unitId)), ...row.completedUnlockTechIds]);
  const buildings = unique([
    ...selected.flatMap((f) => [...planPotentialBuildings(ctx, player.civ, phase.age, f.unitId), f.buildingId]),
    ...row.completedBuildings,
  ]);
  const production = selected.length
    ? '/production?' +
      encodeProduction({
        civ: player.civ,
        age: phase.age,
        rows: selected.map((f) => ({ unit: f.unitId, building: f.buildingId, count: '1' })),
        techs: row.completedUnlockTechIds,
        walk: 3,
        farm: 1,
      })
    : null;
  return (
    <article className="tp-panel tp-player-phase" data-testid={`team-plan-player-${row.playerId}`}>
      <h3>
        {playerLabel(player)} · {civs.find((c) => c.en === player.civ)?.zh ?? player.civ}
      </h3>
      <p className="note">
        {POSITION_NAMES[player.position]} {player.positionNote}
      </p>
      {(['main', 'secondary'] as const).map((kind) => (
        <ForceEditor
          key={kind}
          ctx={ctx}
          player={player}
          row={row}
          age={phase.age}
          force={row[kind]}
          label={`${player.id.toUpperCase()} ${kind === 'main' ? '主' : '副'}兵种`}
          change={(force) => update({ ...row, [kind]: force })}
        />
      ))}
      <details className="tp-prerequisites">
        <summary>{player.id.toUpperCase()} 明确完成的前置记录</summary>
        <p className="note">逐项确认实际完成。形态确认包含其所需前置升级的实际完成声明；本页不自动验证完整研究链，也不自动确认免费项。</p>
        {!selected.length && !forms.length && !buildings.length && !techs.length && (
          <p className="note">选择兵种后，在这里明确确认其前置；选择本身不会确认。</p>
        )}
        {forms.map((id) => (
          <label className="tp-check" key={`u${id}`}>
            <input
              type="checkbox"
              checked={row.completedForms.includes(id)}
              onChange={() => update({ ...row, completedForms: toggle(row.completedForms, id) })}
            />
            {player.id.toUpperCase()} 已完成形态升级：{labelFor(ctx, 'unit', id)}
          </label>
        ))}
        {techs.map((id) => (
          <label className="tp-check" key={`t${id}`}>
            <input
              type="checkbox"
              checked={row.completedUnlockTechIds.includes(id)}
              onChange={() => update({ ...row, completedUnlockTechIds: toggle(row.completedUnlockTechIds, id) })}
            />
            {player.id.toUpperCase()} 已完成解锁研究：{labelFor(ctx, 'tech', id)}
          </label>
        ))}
        {buildings.map((id) => (
          <label className="tp-check" key={`b${id}`}>
            <input
              type="checkbox"
              checked={row.completedBuildings.includes(id)}
              onChange={() => update({ ...row, completedBuildings: toggle(row.completedBuildings, id) })}
            />
            {player.id.toUpperCase()} 已建成并可用：{labelFor(ctx, 'building', id)}
          </label>
        ))}
      </details>
      <label className="tp-field">
        {player.id.toUpperCase()} 兵力与资源自报
        <select value={row.supply} onChange={(e) => update({ ...row, supply: e.target.value as PlayerPhase['supply'] })}>
          {Object.entries(SUPPLY_NAMES).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label={`${player.id.toUpperCase()} 兵力与资源备注`}
        value={row.supplyNote}
        max={PLAN_LIMITS.note}
        onChange={(supplyNote) => update({ ...row, supplyNote })}
      />
      <p className="note">自报不会改变资格核对或证明支援足够。</p>
      <div className="tp-actions">
        <Link to={`/tree/${player.civ}`}>文明科技树</Link>
        {production && <Link to={production}>持续生产资料（每行按1座）</Link>}
      </div>
    </article>
  );
}
