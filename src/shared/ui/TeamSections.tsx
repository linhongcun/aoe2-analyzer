import { Link, useLocation } from 'react-router-dom';

const SECTIONS = [
  ['/team-fit', '文明搭配'],
  ['/team-bonuses', '团队加成'],
  ['/team-plan', '团战分工'],
] as const;

/** 团队三套能力的分区。当前页保留查询，另外两套走到各自的直达地址。 */
export function TeamSections() {
  const { pathname, search } = useLocation();
  return (
    <nav className="bar team-sections" aria-label="团队能力" data-testid="team-sections">
      {SECTIONS.map(([path, label]) => {
        const current = pathname === path;
        return (
          <Link key={path} className="community-tool-entry" to={current ? { pathname, search } : path} aria-current={current ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
