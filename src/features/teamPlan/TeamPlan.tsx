import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs, loadCore, loadTrees } from '../../data';
import type { ProductionContext } from '../../domain/production';
import { encodeProduction } from '../../domain/production';
import { encodeTeamBonuses } from '../../domain/teamBonuses';
import {
  PLAN_AGES,
  PLAN_LIMITS,
  POSITION_NAMES,
  SUPPLY_NAMES,
  TASK_KINDS,
  TASK_NAMES,
  TASK_STATUS_NAMES,
  TEAM_PLAN_UNIT_IDS,
  TEAM_PLAN_SOURCES,
  TEAM_PLAN_CHECKED,
  FORCE_STATUS_NAMES,
  addPlanPlayer,
  removePlanPlayer,
  defaultTeamPlan,
  exampleTeamPlan,
  decodeTeamPlan,
  encodeTeamPlan,
  teamPlanShareUrl,
  teamPlanErrors,
  checkPlanForce,
  planPotentialBuildings,
  requiredPlanUnlocks,
  planTaskStatus,
  type TeamPlan,
  type PlanPlayer,
  type PlanPhase,
  type PlayerPhase,
  type PlanForce,
  type PlanAge,
  type PlanTask,
} from '../../domain/teamPlan';
import { Icon } from '../../shared/ui/Icon';
import './teamPlan.css';

const AGE_NAMES: Record<PlanAge, string> = { 2: '封建', 3: '城堡', 4: '帝王' };
const OPEN_NAMES = { unspecified: '未指定', open: '开放陆地', closed: '封闭陆地', 'mixed-land': '混合陆地条件' } as const;
const toggle = (values: number[], id: number) => (values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
const unique = (values: number[]) => [...new Set(values)];
const playerLabel = (player: PlanPlayer) => player.name || player.id.toUpperCase();
const labelFor = (ctx: ProductionContext, kind: 'unit' | 'tech' | 'building', id: number) =>
  (kind === 'unit' ? ctx.core.unitById[id] : kind === 'tech' ? ctx.core.techById[id] : ctx.core.buildingById[id])?.zh ?? `未知 ID ${id}`;
/** issue 271：同名但生产建筑和英文名都相同、规则区分不了的单位，在这里写玩家能看懂的专门标签（Steve 2026-10-22：不显示编号） */
const SPECIAL_UNIT_LABELS: Record<number, string> = {
  // 库曼雇佣兵送给队友的免费精锐钦察；另一个 1233 是库曼自己在城堡训练的，显示「精锐钦察」
  1260: '精锐钦察（库曼雇佣兵）',
};
/** issue 271：同一下拉分组内同名单位要能区分。先套专门标签；剩下的同名项优先标生产建筑（近卫军兵营/城堡），建筑也相同时用英文名。不显示编号。 */
export function unitOptionLabel(
  ctx: ProductionContext,
  unit: { id: number; zh: string; en: string; b: number },
  siblings: { id: number; zh: string; en: string; b: number }[],
): string {
  const special = SPECIAL_UNIT_LABELS[unit.id];
  if (special) return special;
  const same = siblings.filter((s) => s.zh === unit.zh && !SPECIAL_UNIT_LABELS[s.id]);
  if (same.length <= 1) return unit.zh;
  const withBuilding = same.map((s) => {
    const building = ctx.core.buildingById[s.b];
    return { id: s.id, label: building ? `${s.zh}（${building.zh}）` : '' };
  });
  const mine = withBuilding.find((row) => row.id === unit.id)!;
  if (mine.label && withBuilding.filter((row) => row.label === mine.label).length === 1) return mine.label;
  if (same.filter((s) => s.en === unit.en).length === 1) return `${unit.zh}（${unit.en}）`;
  return unit.zh;
}

export default function TeamPlanPage() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeTeamPlan(location.search), [location.search]);
  const [ctx, setContext] = useState<ProductionContext | null>(null),
    [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(''),
    [manualLink, setManualLink] = useState(''),
    [editError, setEditError] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([loadCore(), loadTrees()])
      .then(([core, trees]) => {
        if (active) setContext({ core, trees });
      })
      .catch(() => {
        if (active) setLoadError('单位资料加载失败，请刷新页面重试。');
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (plan: TeamPlan, push = false) => {
    try {
      const search = '?' + encodeTeamPlan(plan);
      navigate({ pathname: '/team-plan', search }, { replace: !push });
      setNotice('');
      setManualLink('');
      setEditError('');
      return true;
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '本次修改超出范围，原计划已保留。');
      return false;
    }
  };
  const share = async () => {
    if (!decoded.plan) return;
    let url: string;
    try {
      url = teamPlanShareUrl(decoded.plan, document.baseURI);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '无法生成完整链接。');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('链接已复制，包含全部三个阶段与备注。');
      setManualLink('');
    } catch {
      setNotice('自动复制失败，请手动复制下方完整链接。');
      setManualLink(url);
    }
  };
  const plan = decoded.plan;
  return (
    <section className="pane team-plan-page" data-testid="team-plan-page">
      <header className="tp-heading tp-screen">
        <div>
          <p className="note">共同约定这局的分工</p>
          <h1>团战分工计划</h1>
          <p>记录谁出兵、谁承担任务、何时会合；各阶段按玩家各自到达的时代约定。</p>
        </div>
        <div className="tp-actions">
          <button type="button" className="btn" disabled={!plan} onClick={() => void share()}>
            <Icon name="copy" />
            复制完整计划
          </button>
          <button type="button" className="btn" disabled={!plan || !ctx} onClick={() => window.print()}>
            打印全部阶段
          </button>
        </div>
      </header>
      <div className="tp-screen">
        {!!notice && <p role="status">{notice}</p>}
        {!!editError && (
          <p role="alert" className="tp-error">
            {editError}未截断或替换原计划。
          </p>
        )}
        {!!manualLink && (
          <label className="tp-field">
            手动复制计划链接
            <textarea aria-label="手动复制计划链接" readOnly value={manualLink} onFocus={(e) => e.target.select()} rows={4} />
          </label>
        )}
        {!plan ? (
          <div role="alert" className="tp-error">
            <h2>计划链接无法完整恢复</h2>
            <p>{decoded.errors.join(' ')}</p>
            <label className="tp-field">
              原始计划参数
              <textarea aria-label="原始计划参数" readOnly value={location.search} onFocus={(e) => e.target.select()} rows={4} />
            </label>
            <button className="btn" onClick={() => update(defaultTeamPlan())}>
              重置计划
            </button>
          </div>
        ) : !ctx ? (
          <div role={loadError ? 'alert' : 'status'} className="tp-panel">
            <p>{loadError || '正在加载文明、单位与前置资料。'}</p>
            {!!loadError && (
              <button className="btn" onClick={() => window.location.reload()}>
                刷新重试
              </button>
            )}
          </div>
        ) : (
          <PlanEditor ctx={ctx} plan={plan} update={update} notice={setNotice} />
        )}
      </div>
      {plan && ctx && <PrintPlan ctx={ctx} plan={plan} />}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  max = PLAN_LIMITS.agreement,
  multiline = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  multiline?: boolean;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={multiline ? 2 : 1} />
      <small className="note">
        最多 <span className="tp-number">{max}</span> 个字符
      </small>
    </label>
  );
}
function PlanEditor({
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
      <div className="tp-actions">
        <button className="btn" onClick={() => update(exampleTeamPlan(), true)}>
          载入开放陆地4v4范例
        </button>
        <button className="btn" onClick={() => update(defaultTeamPlan(), true)}>
          重置计划
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
        <h2 id="tp-phase-heading">{AGE_NAMES[phase.age]}阶段的出兵约定</h2>
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
function PlayerEditor({
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
function ForceEditor({
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
function Sources() {
  return (
    <section className="tp-sources">
      <h3>范例依据与核对日期</h3>
      <p>本站整理，核对日 {TEAM_PLAN_CHECKED}。网页支持地图条件与协作思路，游戏资格只读固定 DE185872 数据。教学观点不代表胜率证据。</p>
      {TEAM_PLAN_SOURCES.map((source) => (
        <div key={source.id}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title}
          </a>
          <p>
            {source.published} · {source.kind}。{source.claim}
          </p>
        </div>
      ))}
    </section>
  );
}
function PrintPlan({ ctx, plan }: { ctx: ProductionContext; plan: TeamPlan }) {
  const names = (ids: number[], kind: 'unit' | 'tech' | 'building') => (ids.length ? ids.map((id) => labelFor(ctx, kind, id)).join('、') : '未确认');
  const errors = teamPlanErrors(plan, ctx);
  return (
    <div className="tp-print" data-testid="team-plan-print">
      <h1>{plan.title || '团战分工计划'}</h1>
      <p>
        DE185872 · 地图：{plan.map.name || '未填写'} · {OPEN_NAMES[plan.map.openness]}
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
