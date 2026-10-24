import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadCore, loadTrees } from '../../data';
import type { ProductionContext } from '../../domain/production';
import { decodeTeamPlan, defaultTeamPlan, encodeTeamPlan, teamPlanShareUrl, type TeamPlan } from '../../domain/teamPlan';
import { CalcDock } from '../../shared/ui/CalcDock';
import { PlanEditor } from './PlanEditor';
import { PrintPlan } from './PrintPlan';
import './teamPlan.css';

export { unitOptionLabel } from './teamPlanLabels';

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
          <button type="button" className="btn" disabled={!plan || !ctx} onClick={() => window.print()}>
            打印全部阶段
          </button>
        </div>
      </header>
      <div className="tp-screen">
        <CalcDock
          note={notice}
          resultId={plan && ctx ? 'tp-phase-heading' : undefined}
          actions={[
            { label: '复制完整计划', icon: 'copy', disabled: !plan, onClick: () => void share() },
            { label: '重置计划', onClick: () => update(defaultTeamPlan(), Boolean(plan)) },
          ]}
        />
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
