import { TEAM_PLAN_CHECKED, TEAM_PLAN_SOURCES } from '../../domain/teamPlan';

export function Sources() {
  return (
    <section className="tp-sources">
      <h3>范例依据与核对日期</h3>
      <p>
        本站整理，核对日 {TEAM_PLAN_CHECKED}。网页支持地图条件与协作思路，游戏资格只读固定 DE{__DATA_SOURCES__.patch.build} 数据。教学观点不代表胜率证据。
      </p>
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
