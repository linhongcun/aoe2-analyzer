import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import type { BuildOrder } from '../../domain/buildOrder';
import './buildApplicability.css';

export function BuildApplicability({
  order,
  requestedCiv = '',
  heading = false,
}: {
  order: Pick<BuildOrder, 'civs'>;
  requestedCiv?: string;
  heading?: boolean;
}) {
  const civs = [...new Set(order.civs)];
  const outsideList = requestedCiv && civs.length > 0 && !civs.includes(requestedCiv);
  const caption = '资料标注适用文明';
  return (
    <div className="build-applicability">
      {heading ? <h2 className="build-applicability-caption">{caption}</h2> : <p className="build-applicability-caption">{caption}</p>}
      {civs.length ? (
        <div className="build-applicability-links">
          {civs.map((civ) => (
            <Link key={civ} to={`/civ/${encodeURIComponent(civ)}`}>
              {civByEn(civ)?.zh ?? civ}
            </Link>
          ))}
        </div>
      ) : (
        <p className="note build-applicability-note">通用</p>
      )}
      {outsideList && <p className="note build-applicability-note">{civByEn(requestedCiv)?.zh ?? requestedCiv}：资料未列出该文明，当前作为通用示意</p>}
    </div>
  );
}
