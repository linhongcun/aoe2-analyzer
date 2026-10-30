import { Link, useLocation } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import type { Unit } from '../../../domain/types';
import type { SimRoute } from '../../../domain/simulator';
import { unitProductionEntry } from '../../../domain/unitProductionEntry';
import { encodeProduction } from '../../../domain/production';
import { contextPath } from '../../../shared/nav/context';
import { Icon } from '../../../shared/ui/Icon';

export function UnitProductionEntry({ u, route, civ, age, defaultAge }: { u: Unit; route: SimRoute; civ?: string; age: number; defaultAge: boolean }) {
  const core = useCore();
  const trees = useTrees();
  const location = useLocation();
  if (!core || !trees || !civ) return null;
  const entry = unitProductionEntry({ core, trees }, { unit: u.id, civ, age, techs: route.ids });
  const to = contextPath('/production?' + encodeProduction(entry.config), location.search, location.pathname + location.search);
  return (
    <nav className="ctx-chips" aria-label="当前单位的下一步">
      <Link className="community-tool-entry" to={to}>
        <Icon name="factory" />
        按当前单位规划生产
      </Link>
      <span className="note">
        {defaultAge ? '按单位解锁时代开始设置；' : ''}生产建筑数量需另行填写，战斗科技仅带入生产模型支持的部分。
        {entry.omittedTechs.length > 0 && `未带入科技：${entry.omittedTechs.map((id) => core.techById[id]?.zh ?? '未识别科技').join('、')}。`}
        {route.team.length > 0 && '队友加成未带入生产模型。'}
        {entry.errors.join(' ')}
      </span>
    </nav>
  );
}
