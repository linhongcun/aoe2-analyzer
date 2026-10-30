import { Link } from 'react-router-dom';
import { useCore } from '../../data/hooks';
import { entityPath, type EntityContext } from '../nav/context';

/** 单位/科技页中的“所属建筑”链接；建筑数据缺失时退化为文本标签 */
export function BLink({ id, zh, context }: { id: number; zh: string; context?: EntityContext }) {
  const core = useCore();
  return core?.buildingById[id] ? (
    <Link className="tag tagl" to={context ? entityPath('building', id, context.civ, context.search, context.source, context.age) : `/building/${id}`}>
      {zh}
    </Link>
  ) : (
    <span className="tag">{zh}</span>
  );
}
