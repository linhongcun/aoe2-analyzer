import type { ProductionContext } from '../../domain/production';
import {
  FORCE_STATUS_NAMES,
  TEAM_PLAN_UNIT_IDS,
  checkPlanForce,
  planPotentialBuildings,
  type PlanAge,
  type PlanForce,
  type PlanPlayer,
  type PlayerPhase,
} from '../../domain/teamPlan';
import { labelFor, unique, unitOptionLabel } from './teamPlanLabels';

export function ForceEditor({
  ctx,
  player,
  row,
  age,
  force,
  label,
  change,
}: {
  ctx: ProductionContext;
  player: PlanPlayer;
  row: PlayerPhase;
  age: PlanAge;
  force: PlanForce | null;
  label: string;
  change: (force: PlanForce | null) => void;
}) {
  const result = checkPlanForce(ctx, player, row, age, force);
  const options = ctx.core.units.filter((u) => TEAM_PLAN_UNIT_IDS.includes(u.id));
  const other = ctx.core.units.filter((u) => !TEAM_PLAN_UNIT_IDS.includes(u.id));
  const buildingIds = force
    ? unique([...planPotentialBuildings(ctx, player.civ, age, force.unitId), ...planPotentialBuildings(ctx, player.civ, 4, force.unitId), force.buildingId])
    : [];
  return (
    <div className="tp-force">
      <label className="tp-field">
        {label}
        <select
          value={force?.unitId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value),
              unit = ctx.core.unitById[id];
            change(
              unit
                ? { unitId: id, buildingId: planPotentialBuildings(ctx, player.civ, age, id)[0] ?? planPotentialBuildings(ctx, player.civ, 4, id)[0] ?? unit.b }
                : null,
            );
          }}
        >
          <option value="">未指定</option>
          {force && !ctx.core.unitById[force.unitId] && <option value={force.unitId}>未知单位 ID {force.unitId}</option>}
          <optgroup label="本版核对的39个常规形态">
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {unitOptionLabel(ctx, u, options)}
              </option>
            ))}
          </optgroup>
          <optgroup label="其它具名形态（仅记录，核对暂未支持）">
            {other.map((u) => (
              <option key={u.id} value={u.id}>
                {unitOptionLabel(ctx, u, other)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {force && (
        <label className="tp-field">
          {label}生产地点
          <select value={force.buildingId} onChange={(e) => change({ ...force, buildingId: Number(e.target.value) })}>
            {buildingIds.map((id) => (
              <option key={id} value={id}>
                {labelFor(ctx, 'building', id)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        className={`tp-force-result${result.status === 'conditions-met' ? ' tp-met' : ''}`}
        data-testid={`${player.id}-${label.includes('主') ? 'main' : 'secondary'}-status`}
      >
        <strong>{FORCE_STATUS_NAMES[result.status]}</strong>
        {result.reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        {result.status === 'conditions-met' && <p>按你填写的前置状态核对；兵力与资源是否足够仍需另行确认。</p>}
      </div>
    </div>
  );
}
