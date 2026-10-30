import { Link } from 'react-router-dom';

export function UnitSimulationNotice({
  invalidCiv,
  civName,
  ageUnavailable,
  modelUnsupported,
  to,
}: {
  invalidCiv: boolean;
  civName?: string;
  ageUnavailable: boolean;
  modelUnsupported: boolean;
  to: string | null;
}) {
  if (!invalidCiv && !civName && !ageUnavailable && !modelUnsupported) return null;
  const reason = invalidCiv
    ? '链接中的文明无效或重复'
    : civName
      ? `${civName}无法生产该单位`
      : modelUnsupported
        ? '属性模拟模型暂不支持当前时代'
        : '当前时代尚未解锁该单位';
  return (
    <>
      <p className="note" role="status">
        {reason}；保留已选条件，仍可查阅基础资料。
      </p>
      {to && !invalidCiv && !civName && (ageUnavailable || modelUnsupported) && (
        <Link className="community-tool-entry" to={to}>
          {modelUnsupported ? '按模型支持时代查看模拟' : '按可用时代查看模拟'}
        </Link>
      )}
    </>
  );
}
