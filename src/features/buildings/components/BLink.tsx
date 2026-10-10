import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';

/** 单位/科技页中的“所属建筑”链接；建筑数据缺失时退化为文本标签 */
export function BLink({ id, zh }: { id: number; zh: string }) {
  const core = useCore();
  return core?.buildingById[id] ? (
    <Link className="tag tagl" to={`/building/${id}`}>
      {zh}
    </Link>
  ) : (
    <span className="tag">{zh}</span>
  );
}
