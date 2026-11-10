import { Link } from 'react-router-dom';
import { buildsPath, explicitMatchupPath } from '../../../domain/matchupRoute';
import { encodeTeamFit } from '../../../domain/teamFitQuery';
import type { StartState } from '../../../domain/startGame';

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
      </div>
    </details>
  );
}
