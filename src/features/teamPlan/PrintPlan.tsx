import { civs } from '../../data';
import type { ProductionContext } from '../../domain/production';
import {
  FORCE_STATUS_NAMES,
  POSITION_NAMES,
  SUPPLY_NAMES,
  TASK_NAMES,
  TASK_STATUS_NAMES,
  checkPlanForce,
  planTaskStatus,
  teamPlanErrors,
  type TeamPlan,
} from '../../domain/teamPlan';
import { Sources } from './PlanSources';
import { AGE_NAMES, OPEN_NAMES, labelFor, playerLabel } from './teamPlanLabels';

export function PrintPlan({ ctx, plan }: { ctx: ProductionContext; plan: TeamPlan }) {
  const names = (ids: number[], kind: 'unit' | 'tech' | 'building') => (ids.length ? ids.map((id) => labelFor(ctx, kind, id)).join('、') : '未确认');
  const errors = teamPlanErrors(plan, ctx);
  return (
    <div className="tp-print" data-testid="team-plan-print">
      <h1>{plan.title || '团战分工计划'}</h1>
      <p>
        DE{__DATA_SOURCES__.patch.build} · 地图：{plan.map.name || '未填写'} · {OPEN_NAMES[plan.map.openness]}
      </p>
      <p>{plan.map.conditions || '地图补充条件未填写'}</p>
      <p>各阶段按各玩家到达时代的约定。形态/研究/建筑是用户确认记录，不认证完整研究链、资源、人口、兵力或队友执行。</p>
      {plan.example && <p>本站整理的范例；完成状态仅为可修改的示例假设。</p>}
      {!!errors.length && (
        <section>
          <h2>需要修正的记录</h2>
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      )}
      {plan.players.map((p) => (
        <p key={p.id}>
          {p.id.toUpperCase()} {playerLabel(p)} · {civs.find((c) => c.en === p.civ)?.zh ?? p.civ} · {POSITION_NAMES[p.position]} ·{' '}
          {p.positionNote || '位置补充未填写'}
        </p>
      ))}
      {plan.phases.map((phase) => (
        <section className="tp-print-phase" key={phase.age}>
          <h2>{AGE_NAMES[phase.age]}阶段</h2>
          {phase.players.map((row) => {
            const player = plan.players.find((p) => p.id === row.playerId)!;
            return (
              <article key={row.playerId}>
                <h3>{playerLabel(player)}</h3>
                {(['main', 'secondary'] as const).map((kind) => {
                  const f = row[kind],
                    result = checkPlanForce(ctx, player, row, phase.age, f);
                  return (
                    <div key={kind}>
                      <p>
                        {kind === 'main' ? '主' : '副'}兵种：{f ? `${labelFor(ctx, 'unit', f.unitId)} / ${labelFor(ctx, 'building', f.buildingId)}` : '未指定'}{' '}
                        · {FORCE_STATUS_NAMES[result.status]}
                      </p>
                      {result.reasons.map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </div>
                  );
                })}
                <p>已完成形态升级：{names(row.completedForms, 'unit')}</p>
                <p>已完成解锁研究：{names(row.completedUnlockTechIds, 'tech')}</p>
                <p>已建成可用建筑：{names(row.completedBuildings, 'building')}</p>
                <p>
                  {SUPPLY_NAMES[row.supply]}：{row.supplyNote || '备注未填写'}
                </p>
              </article>
            );
          })}
          <h3>主动选择的任务</h3>
          {!phase.tasks.length && <p>未选择任务</p>}
          {phase.tasks.map((task) => (
            <article key={task.kind}>
              <p>
                {TASK_NAMES[task.kind]} · {TASK_STATUS_NAMES[planTaskStatus(task)]} · 负责人：
                {task.owners
                  .map((id) => {
                    const p = plan.players.find((p) => p.id === id);
                    return p ? playerLabel(p) : `已移除 ${id}`;
                  })
                  .join('、') || '未认领'}
              </p>
              <p>留空理由：{task.gapReason || '未填写'}</p>
              <p>分工备注：{task.note || '未填写'}</p>
            </article>
          ))}
          <p>支援触发：{phase.supportTrigger || '未填写'}</p>
          <p>集合约定：{phase.rally || '未填写'}</p>
          <p>撤退约定：{phase.retreat || '未填写'}</p>
          <p>不适用条件：{phase.notApplicable || '未填写'}</p>
        </section>
      ))}
      <Sources />
    </div>
  );
}
