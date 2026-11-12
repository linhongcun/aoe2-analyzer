import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadCore, loadTrees } from '../../data';
import type { ProductionContext } from '../../domain/production';
import { decodeTeamPlan, defaultTeamPlan, encodeTeamPlan, teamPlanShareUrl, type TeamPlan } from '../../domain/teamPlan';
import { CalcDock } from '../../shared/ui/CalcDock';
import { TeamSections } from '../../shared/ui/TeamSections';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { PlanEditor } from './PlanEditor';
import { PrintPlan } from './PrintPlan';
import { useShareLink } from '../../shared/ui/useShareLink';
import './teamPlan.css';

export { unitOptionLabel } from './teamPlanLabels';

export default function TeamPlanPage() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeTeamPlan(location.search), [location.search]);
  const [ctx, setContext] = useState<ProductionContext | null>(null),
    [loadError, setLoadError] = useState('');
  const [editError, setEditError] = useState('');
  const noticeKey = useRef(location.search);
  useEffect(() => {
    noticeKey.current = location.search;
  }, [location.search]);
  const {
    copy,
    status: notice,
    manualLink,
    reset: resetShare,
    announce,
  } = useShareLink({
    stateKey: location.search,
    successMessage: '链接已复制，包含全部三个阶段与备注。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
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
      noticeKey.current = search;
      resetShare();
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
    await copy(url);
  };
  const plan = decoded.plan;
  return (
    <section className="pane team-plan-page" data-testid="team-plan-page">
      <ToolPageHeader
        className="tp-screen"
        top={<TeamSections />}
        title="团战分工计划"
        description="记录谁出兵、谁承担任务、何时会合；各阶段按玩家各自到达的时代约定。"
        related={{ links: [{ to: '/team-fit', label: '选文明前看搭配' }] }}
        dock={
          <CalcDock
            note={notice}
            resultId={plan && ctx ? 'tp-phase-heading' : undefined}
            actions={[
              { label: '复制完整计划', icon: 'copy', disabled: !plan, onClick: () => void share() },
              { label: '打印全部阶段', icon: 'printer', disabled: !plan || !ctx, onClick: () => window.print() },
            ]}
          />
        }
        more={[{ label: '重置计划', icon: 'rotate-ccw', onClick: () => update(defaultTeamPlan(), Boolean(plan)) }]}
      />
      <div className="tp-screen">
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
          <PlanEditor ctx={ctx} plan={plan} update={update} notice={(message) => announce(message, noticeKey.current)} />
        )}
      </div>
      {plan && ctx && <PrintPlan ctx={ctx} plan={plan} />}
    </section>
  );
}
