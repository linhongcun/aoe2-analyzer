import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, loadCore, loadTrees } from '../../../data';
import type { BuildOrder } from '../../../domain/buildOrder';
import { selectStartOpening } from '../../../domain/openingBuildChoices';
import { buildsPath } from '../../../domain/matchupRoute';
import { scenarioProfile, scenarioRows, type SceneContext } from '../../../domain/positionScenarios';
import { ageRoutes } from '../../../domain/ageRoutes';
import { sceneDefaults } from '../../../domain/startGameInputs';
import type { StartState } from '../../../domain/startGame';
import { SceneEvidence } from './ScenarioSuggestions';
import { RouteEvidence } from './RouteContinuity';

export default function StartPlanSummary({ state }: { state: StartState }) {
  const lane = state.choice.lane!;
  const civ = state.choice.civ ? civByEn(state.choice.civ) : undefined;
  const cfg = state.sceneConfig ?? sceneDefaults(lane);
  const [data, setData] = useState<{ context: SceneContext; orders: BuildOrder[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([loadCore(), loadTrees(), import('../../../data/buildOrders')])
      .then(([core, trees, catalog]) => {
        if (live) setData({ context: { core, trees }, orders: catalog.buildOrders });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const row = useMemo(() => {
    if (!data || !civ) return null;
    const listed = scenarioRows(data.context, lane, cfg).find((r) => r.civ === civ.en);
    if (listed) return listed;
    const profile = scenarioProfile(data.context, civ.en, lane, cfg);
    return { civ: civ.en, status: 'blocked' as const, preferred: false, reason: '不在此路位首批比较范围' + (profile.reason ? `；${profile.reason}` : '') };
  }, [data, civ, lane, cfg]);
  const route = useMemo(
    () => (data && civ && state.routeConfig ? ageRoutes(data.context, lane, state.routeConfig).find((r) => r.civ === civ.en) : null),
    [data, civ, lane, state.routeConfig],
  );
  if (failed)
    return (
      <section>
        <p role="alert">
          本局打法数据加载失败，已选文明和输入保留。
          <button
            type="button"
            className="start-btn"
            onClick={() => {
              setFailed(false);
              retry((n) => n + 1);
            }}
          >
            重试本局打法
          </button>
        </p>
        <Link className="start-link" to={buildsPath(civ?.en)}>
          查看全部开局
        </Link>
      </section>
    );
  if (!data) return <p role="status">正在整理本局打法…</p>;
  const choices = civ ? selectStartOpening(civ, data.orders, lane) : null;
  const order = choices?.order;
  return (
    <section className="start-scenes" aria-label="本局打法">
      <section data-testid="start-scene-summary">
        <h2>本局场景</h2>
        <p>
          城堡时代 · {data.context.core.unitById[lane === 'flank' ? 24 : 38]?.zh ?? '路线兵种未核实'}；
          {state.sceneConfig ? '已保存调整输入' : '当前路位默认输入'}。
        </p>
        <p className="start-hint">
          军事投入 <span className="num nw">{cfg.budget} 工秒</span> · 距离 <span className="num nw">{cfg.distance} 格</span> ·{' '}
          {lane === 'flank' ? (
            <>
              反应 <span className="num nw">{cfg.reaction} 秒</span> · 后撤 <span className="num nw">{cfg.room} 格</span>
            </>
          ) : (
            <>
              {cfg.mode === 'ready' ? '现成部队' : '新训练部队'} · 期限 <span className="num nw">{cfg.deadline} 秒</span> ·{' '}
              {cfg.husbandry ? '已研究畜牧' : '未研究畜牧'}
            </>
          )}
        </p>
        {row ? (
          <>
            <p>
              {civ?.zh}：{row.status === 'ok' ? '使用本局当前输入计算；不是整局胜率。' : row.reason}
            </p>
            <details className="start-scene-details">
              <summary>查看本局场景结果</summary>
              <SceneEvidence row={row} lane={lane} />
            </details>
          </>
        ) : (
          <p>尚未选择文明，不生成默认文明结果。</p>
        )}
      </section>
      {state.routeConfig ? (
        <section data-testid="start-route-summary">
          <h2>两阶段参考</h2>
          <p className="start-hint">
            独立封建额度 <span className="num nw">{state.routeConfig.feudalBudget} 工秒</span> · 城堡追加{' '}
            <span className="num nw">{state.routeConfig.castleBudget} 工秒</span> · 计划保留 <span className="num nw">{state.routeConfig.survivors} 兵</span> ·
            新增上限 <span className="num nw">{state.routeConfig.newLimit} 兵</span> · 距离 <span className="num nw">{state.routeConfig.distance} 格</span> ·
            窗口 <span className="num nw">{state.routeConfig.deadline} 秒</span> · {state.routeConfig.husbandry ? '按需研究畜牧' : '不研究畜牧'}
            。与本局场景额度和部队分开。
          </p>
          {route?.ok ? (
            <details className="start-scene-details">
              <summary>查看两阶段结果</summary>
              <RouteEvidence row={route} lane={lane} cfg={state.routeConfig} />
            </details>
          ) : (
            <p>{route && !route.ok ? route.reason : civ ? '所选文明未在此两阶段路线核验，不套用其它文明。' : '尚未选择文明，不生成默认结果。'}</p>
          )}
        </section>
      ) : null}
      <h2>本局开局</h2>
      {order ? (
        <>
          <p>
            {order.name.zh} · {choices?.kind === 'generic' ? '通用示意，资料未列出该文明。' : '资料列出的适用文明。'}
          </p>
          <p>
            基础流程：<span className="num nw">{order.target.vils} 村民</span>时点击升级{order.target.age === 2 ? '封建' : '城堡'}
            ，不是到达时代人口或文明修正时刻。
          </p>
          {order.id === 'fast-castle-knights' ? <p>安全直城后转型，不适合盲目裸奔。</p> : null}
          <Link className="start-link" to={`/builds?${new URLSearchParams({ bo: order.id, civ: civ!.en })}`}>
            开局流程
          </Link>
          <p className="start-hint">带入该流程与文明；地图、路位不传入目标页，参数仍需自行核对。</p>
        </>
      ) : (
        <>
          <p>暂无与当前路线匹配的开局；保留所选文明，不套用其它文明流程。</p>
          <Link className="start-link" to={buildsPath(civ?.en)}>
            查看全部开局
          </Link>
          <p className="start-hint">仅带入文明上下文，列表仍为全部开局。</p>
        </>
      )}
    </section>
  );
}
