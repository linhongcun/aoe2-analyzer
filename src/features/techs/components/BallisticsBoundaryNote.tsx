import { Link } from 'react-router-dom';
import { ballisticsBoundary, ballisticsSentence, CATALOG_DISTINCT, DUEL_MODEL_PATH, PK_UNSIMULATED, type CatalogTech } from '../../../domain/accuracyBoundary';
import { DetailSection } from '../../../shared/ui/DetailBlocks';

/** 弹道学页：跟踪移动目标，与目录准确度、PK 期望命中分开；量化预判待确认。 */
export function BallisticsBoundaryNote({ techs }: { techs: readonly CatalogTech[] }) {
  const facts = ballisticsBoundary(techs);
  return (
    <DetailSection title="准确度与弹道学">
      <p className="note" data-ballistics="track" data-ballistics-rules={facts.rules} data-ballistics-eco={facts.eco}>
        {ballisticsSentence(facts)}
      </p>
      <p className="note" data-ballistics="catalog">
        {CATALOG_DISTINCT}
      </p>
      <p className="note" data-ballistics="pk">
        {PK_UNSIMULATED}
      </p>
      <p className="community-tool-row">
        <Link className="community-tool-entry" to={DUEL_MODEL_PATH}>
          查看单位 PK 模型边界
        </Link>
      </p>
    </DetailSection>
  );
}
