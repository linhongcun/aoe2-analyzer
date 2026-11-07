import { Link } from 'react-router-dom';
import {
  ballisticsBoundary,
  ballisticsSentence,
  catalogAccuracyFeedsExpectedHit,
  DUEL_MODEL_PATH,
  PK_UNSIMULATED,
  type CatalogTech,
} from '../../../domain/accuracyBoundary';

/** 远程单位「准确度」旁：目录百分比进入 PK 期望命中，弹道学另说且站内未量化。 */
export function AccuracyBoundaryNote({ unit, techs }: { unit: { rng: number; acc: number }; techs: readonly CatalogTech[] }) {
  if (!catalogAccuracyFeedsExpectedHit(unit)) return null;
  const facts = ballisticsBoundary(techs);
  const known = Number.isFinite(unit.acc);
  return (
    <div data-accuracy="boundary">
      <p className="note" data-accuracy="catalog">
        {known ? (
          <>
            目录准确度{' '}
            <span className="num nw" data-accuracy="percent">
              {unit.acc}%
            </span>{' '}
            进入单位 PK 的期望命中。
          </>
        ) : (
          '目录准确度待确认，本页不把它写成 PK 期望命中。'
        )}
      </p>
      <p className="note" data-accuracy="ballistics">
        {ballisticsSentence(facts)}
      </p>
      <p className="note" data-accuracy="pk">
        {PK_UNSIMULATED}
      </p>
      <p className="community-tool-row">
        {facts.found && (
          <Link className="community-tool-entry" to={`/tech/${facts.id}`}>
            查看弹道学
          </Link>
        )}
        <Link className="community-tool-entry" to={DUEL_MODEL_PATH}>
          查看单位 PK 模型边界
        </Link>
      </p>
    </div>
  );
}
