import { Link } from 'react-router-dom';
import { buildsPath, explicitMatchupPath } from '../../../domain/matchupRoute';
import { encodeTeamFit } from '../../../domain/teamFitQuery';
import type { StartState } from '../../../domain/startGame';

const planned = [
  ['maps', '更多地图与人数机制', '目前仅有部分场景的计算建议；更多地图与人数待完善，仍可自主选文明。'],
  ['routes', '更多文明与时代路线', '当前比较只覆盖声明文明和城堡路线；更多兵种及帝王路线尚未核验。'],
  ['practice', '按文明练习', '尚未提供按文明组织的练习流程；可先使用现有开局库。'],
  ['team', '团队协同机制', '当前可手填队友并查看文明搭配；本局尚不计算联合兵种的协同行动。'],
] as const;

export default function StartFeatureMenu({ state }: { state: StartState }) {
  const { civ, opponent, mates } = state.choice;
  const tools = [
    ['打开对局助手', explicitMatchupPath(civ, opponent), '带入我方与对手；未选的一方保留空白。'],
    ['打开文明搭配', '/team-fit?' + encodeTeamFit({ candidate: civ ?? '', mates }), '带入我方和手填队友；也可在工具内补选。'],
    ['打开开局流程', buildsPath(civ ?? undefined), '只带文明上下文；仍是全部开局，不按地图、路位筛选。'],
  ] as const;
  return (
    <details className="start-feature-menu" data-testid="start-feature-menu">
      <summary>开一局功能菜单</summary>
      <div className="start-menu-grid">
        <div>
          <section aria-labelledby="start-menu-current">
            <h2 id="start-menu-current" className="start-ask-title">
              本局设置
            </h2>
            <button
              type="button"
              className="start-btn"
              onClick={(event) => {
                const menu = event.currentTarget.closest('details')!;
                const region = menu.parentElement?.querySelector<HTMLElement>('[data-testid="start-step"], [data-testid="start-summary"]');
                const title = region?.getAttribute('aria-labelledby');
                const target = (title && document.getElementById(title)) || region;
                menu.open = false;
                if (target) {
                  target.tabIndex = -1;
                  target.focus({ preventScroll: true });
                  target.scrollIntoView({ block: 'center' });
                }
              }}
            >
              回到本局步骤
            </button>
            <p className="start-hint">保留选择；配置模式、地图、路位、文明与对手，并查看声明条件内的城堡建议。</p>
          </section>
          <section className="start-menu-tools" aria-labelledby="start-menu-tools">
            <h2 id="start-menu-tools" className="start-ask-title">
              已有工具
            </h2>
            <ul className="start-menu-list">
              {tools.map(([label, path, reason]) => (
                <li key={label}>
                  <Link className="start-link" to={path}>
                    {label}
                  </Link>
                  <p className="start-hint">{reason}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section aria-labelledby="start-menu-planned">
          <h2 id="start-menu-planned" className="start-ask-title">
            后续完善
          </h2>
          <ul className="start-menu-list">
            {planned.map(([id, label, reason]) => (
              <li key={id}>
                <button
                  type="button"
                  className="start-btn"
                  disabled
                  data-testid={id === 'practice' ? 'start-practice' : undefined}
                  aria-describedby={'start-menu-reason-' + id}
                >
                  {label} · 规划中
                </button>
                <p className="start-hint" id={'start-menu-reason-' + id}>
                  {reason}
                </p>
              </li>
            ))}
          </ul>
          <p className="start-hint">规划中表示尚未支持，不承诺上线时间。</p>
        </section>
      </div>
    </details>
  );
}
