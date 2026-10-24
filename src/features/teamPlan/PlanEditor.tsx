import { Link } from 'react-router-dom';
import { civs } from '../../data';
import type { ProductionContext } from '../../domain/production';
import { encodeTeamBonuses } from '../../domain/teamBonuses';
import {
  PLAN_AGES,
  PLAN_LIMITS,
  POSITION_NAMES,
  TASK_KINDS,
  TASK_NAMES,
  TASK_STATUS_NAMES,
  TEAM_PLAN_CHECKED,
  addPlanPlayer,
  removePlanPlayer,
  exampleTeamPlan,
  planTaskStatus,
  teamPlanErrors,
  type PlanPhase,
  type PlanPlayer,
  type PlanTask,
  type TeamPlan,
} from '../../domain/teamPlan';
import { PlayerEditor } from './PlayerEditor';
import { Sources } from './PlanSources';
import { TextField } from './PlanTextField';
import { AGE_NAMES, OPEN_NAMES, playerLabel } from './teamPlanLabels';

export function PlanEditor({
  ctx,
  plan,
  update,
  notice,
}: {
  ctx: ProductionContext;
  plan: TeamPlan;
  update: (plan: TeamPlan, push?: boolean) => boolean;
  notice: (message: string) => void;
}) {
  const errors = teamPlanErrors(plan, ctx),
    phase = plan.phases.find((p) => p.age === plan.activeAge)!;
  const changePhase = (next: PlanPhase) => update({ ...plan, phases: plan.phases.map((p) => (p.age === next.age ? next : p)) });
  const changePlayer = (next: PlanPlayer) => update({ ...plan, players: plan.players.map((p) => (p.id === next.id ? next : p)) });
  const teamHref = '/team-bonuses?' + encodeTeamBonuses({ players: plan.players.map((p) => p.civ), age: phase.age, target: 'all', unit: null, researched: [] });
  return (
    <>
      <section className="tp-panel tp-lead" aria-labelledby="tp-lead-heading">
        <h2 id="tp-lead-heading">当前约定</h2>
        <p>
          {AGE_NAMES[phase.age]}阶段
          <span className="tp-number"> · {plan.players.length} 名玩家</span>
          <span> · {plan.map.name.trim() || (plan.map.openness === 'unspecified' ? '地图未填' : OPEN_NAMES[plan.map.openness])}</span>
          <span>{phase.tasks.length ? <span className="tp-number"> · {phase.tasks.length} 项任务</span> : ' · 尚未选择任务'}</span>
        </p>
      </section>
      <div className="tp-actions">
        <button className="btn" onClick={() => update(exampleTeamPlan(), true)}>
          载入开放陆地4v4范例
        </button>
        <Link className="btn" to={teamHref}>
          查看队伍加成来源
        </Link>
      </div>
      <p className="tp-boundary">只核对固定数据与玩家明确确认的形态升级、解锁和生产建筑。未核对资源、人口、兵力或队友实际支援；任务认领仅表示约定。</p>
      {plan.example && (
        <p className="tp-boundary" data-testid="team-plan-example-note">
          本站整理的开放陆地范例；建筑与升级完成是可修改的示例假设，兵力与资源仍未核对。来源核对日期：{TEAM_PLAN_CHECKED}。
        </p>
      )}
      {!!errors.length && (
        <section className="tp-error" role="alert" aria-label="计划引用与确认问题">
          <h2>有记录需要修正</h2>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p>原记录完整保留，下面可逐项调整；任务分配与兵种资格分别显示。</p>
        </section>
      )}
      <section className="tp-panel" aria-labelledby="tp-map-heading">
        <h2 id="tp-map-heading">这局的地图条件</h2>
        <div className="tp-grid">
          <TextField label="计划名称" value={plan.title} max={PLAN_LIMITS.title} multiline={false} onChange={(title) => update({ ...plan, title })} />
          <TextField
            label="地图名称"
            value={plan.map.name}
            max={PLAN_LIMITS.map}
            multiline={false}
            onChange={(name) => update({ ...plan, map: { ...plan.map, name } })}
          />
          <label className="tp-field">
            陆地条件
            <select
              value={plan.map.openness}
              onChange={(e) => update({ ...plan, map: { ...plan.map, openness: e.target.value as TeamPlan['map']['openness'] } })}
            >
              {Object.entries(OPEN_NAMES).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <TextField label="地图补充条件" value={plan.map.conditions} onChange={(conditions) => update({ ...plan, map: { ...plan.map, conditions } })} />
        </div>
      </section>
      <section className="tp-panel" aria-labelledby="tp-roster-heading">
        <h2 id="tp-roster-heading">玩家与自记位置</h2>
        <p className="note">
          支持 <span className="tp-number">2–4</span> 名同队玩家。位置由你填写；2v2也不强制或禁止口袋，不根据文明评分安排位置。
        </p>
        <div className="tp-grid">
          {plan.players.map((player) => (
            <fieldset key={player.id} className="tp-player">
              <legend>{player.id.toUpperCase()}</legend>
              <TextField
                label={`${player.id.toUpperCase()} 称呼`}
                value={player.name}
                max={PLAN_LIMITS.name}
                multiline={false}
                onChange={(name) => changePlayer({ ...player, name })}
              />
              <label className="tp-field">
                {player.id.toUpperCase()} 文明
                <select value={player.civ} onChange={(e) => changePlayer({ ...player, civ: e.target.value })}>
                  {!civs.some((c) => c.en === player.civ) && <option value={player.civ}>未知文明：{player.civ}</option>}
                  {civs.map((c) => (
                    <option key={c.en} value={c.en}>
                      {c.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tp-field">
                {player.id.toUpperCase()} 位置
                <select value={player.position} onChange={(e) => changePlayer({ ...player, position: e.target.value as PlanPlayer['position'] })}>
                  {Object.entries(POSITION_NAMES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label={`${player.id.toUpperCase()} 位置补充`}
                value={player.positionNote}
                max={PLAN_LIMITS.position}
                multiline={false}
                onChange={(positionNote) => changePlayer({ ...player, positionNote })}
              />
              <button
                className="btn"
                disabled={plan.players.length <= 2}
                onClick={() => {
                  if (update(removePlanPlayer(plan, player.id))) notice(`已移除${playerLabel(player)}及其认领；其余玩家身份保留，请查看尚未分配的任务。`);
                }}
              >
                移除 {player.id.toUpperCase()}
              </button>
            </fieldset>
          ))}
        </div>
        <button
          className="btn"
          disabled={plan.players.length >= 4}
          onClick={() => {
            const next = addPlanPlayer(plan);
            if (next === plan) notice('请先取消已移除负责人的悬空认领，再添加玩家；不会把旧认领转交给新玩家。');
            else update(next);
          }}
        >
          添加玩家
        </button>
      </section>
      <nav className="tp-ages" aria-label="计划阶段">
        {PLAN_AGES.map((age) => (
          <button key={age} className="btn" aria-pressed={phase.age === age} onClick={() => update({ ...plan, activeAge: age })}>
            {AGE_NAMES[age]}阶段
          </button>
        ))}
      </nav>
      <section className="tp-phase" aria-labelledby="tp-phase-heading">
        <h2 id="tp-phase-heading" className="calc-dock-target" tabIndex={-1}>
          {AGE_NAMES[phase.age]}阶段的出兵约定
        </h2>
        <p className="note">
          本版核对 <span className="tp-number">39</span>{' '}
          个常规陆战形态。其他具名单位可记录并显示暂未支持，不静默替换。形态确认表示其所需升级已实际完成，免费升级也需本人确认。
        </p>
        <div className="tp-grid">
          {phase.players.map((row) => (
            <PlayerEditor
              key={row.playerId}
              ctx={ctx}
              player={plan.players.find((p) => p.id === row.playerId)!}
              phase={phase}
              row={row}
              update={(next) => changePhase({ ...phase, players: phase.players.map((r) => (r.playerId === next.playerId ? next : r)) })}
            />
          ))}
        </div>
      </section>
      <section className="tp-panel" aria-labelledby="tp-task-heading">
        <h2 id="tp-task-heading">{AGE_NAMES[phase.age]}阶段的任务分配</h2>
        <p className="note">只检查你勾选需要的任务。兵种不会自动认领；没有破城需求也不会因缺攻城单位报警。</p>
        {!phase.tasks.length && <p className="tp-boundary">尚未选择任务，可按这局需要逐项添加。</p>}
        <div className="tp-grid">
          {TASK_KINDS.map((kind) => {
            const task = phase.tasks.find((t) => t.kind === kind);
            const edit = (next: PlanTask) => changePhase({ ...phase, tasks: phase.tasks.map((t) => (t.kind === kind ? next : t)) });
            return (
              <fieldset className="tp-task" key={kind}>
                <legend>{TASK_NAMES[kind]}</legend>
                <label className="tp-check">
                  <input
                    type="checkbox"
                    checked={!!task}
                    onChange={(e) =>
                      changePhase({
                        ...phase,
                        tasks: e.target.checked
                          ? [...phase.tasks, { kind, owners: [], intentionalGap: false, gapReason: '', note: '' }]
                          : phase.tasks.filter((t) => t.kind !== kind),
                      })
                    }
                  />
                  本阶段需要{TASK_NAMES[kind]}
                </label>
                {task && (
                  <>
                    <p data-testid={`team-plan-task-${kind}`} className="tp-state">
                      {TASK_STATUS_NAMES[planTaskStatus(task)]}
                    </p>
                    <div className="tp-checks">
                      {uniqueOwnerList(plan, task).map(({ id, name }) => (
                        <label className="tp-check" key={id}>
                          <input
                            type="checkbox"
                            checked={task.owners.includes(id)}
                            onChange={(e) => edit({ ...task, owners: e.target.checked ? [...task.owners, id] : task.owners.filter((value) => value !== id) })}
                          />
                          {name}认领{TASK_NAMES[kind]}
                        </label>
                      ))}
                    </div>
                    <label className="tp-check">
                      <input type="checkbox" checked={task.intentionalGap} onChange={(e) => edit({ ...task, intentionalGap: e.target.checked })} />
                      有意留空{TASK_NAMES[kind]}
                    </label>
                    <TextField
                      label={`${TASK_NAMES[kind]}留空理由`}
                      value={task.gapReason}
                      max={PLAN_LIMITS.note}
                      onChange={(gapReason) => edit({ ...task, gapReason })}
                    />
                    <TextField label={`${TASK_NAMES[kind]}分工备注`} value={task.note} max={PLAN_LIMITS.note} onChange={(note) => edit({ ...task, note })} />
                  </>
                )}
              </fieldset>
            );
          })}
        </div>
      </section>
      <section className="tp-panel" aria-labelledby="tp-agreements-heading">
        <h2 id="tp-agreements-heading">{AGE_NAMES[phase.age]}阶段的支援与会合</h2>
        <div className="tp-grid">
          {(['supportTrigger', 'rally', 'retreat', 'notApplicable'] as const).map((key) => (
            <TextField
              key={key}
              label={{ supportTrigger: '支援触发', rally: '集合约定', retreat: '撤退约定', notApplicable: '不适用条件' }[key]}
              value={phase[key]}
              onChange={(value) => changePhase({ ...phase, [key]: value })}
            />
          ))}
        </div>
      </section>
      <details className="tp-panel">
        <summary>核对边界、分享限制与来源</summary>
        <p>
          DE185872。每阶段的完成状态独立，不从其他玩家或时代继承。我们不模拟完整研究链或自动免费升级；只有你确认完成的形态、解锁与建筑才解除对应提醒。单兵种资料和任务认领都不能证明资源、人口、兵力足够。
        </p>
        <p>
          文本上限在各输入旁显示；前置记录每阶段每人最多8个建筑、16个形态与32个解锁科技。计划正文最多96KiB，链接片段最多128KiB；超限会报错并保留原计划，不截断。链接包含全部计划，请自行决定分享对象；网址片段不是加密。聊天软件可能有更短的链接限制。
        </p>
        <p>打印同一网页的全部三个阶段和备注，长内容允许多张A4；不预测最佳支援时间，不检测队友实际执行。</p>
        <Sources />
      </details>
    </>
  );
}

function uniqueOwnerList(plan: TeamPlan, task: PlanTask) {
  return [
    ...plan.players.map((p) => ({ id: p.id, name: playerLabel(p) })),
    ...task.owners.filter((id) => !plan.players.some((p) => p.id === id)).map((id) => ({ id, name: `已移除负责人 ${id}` })),
  ];
}
