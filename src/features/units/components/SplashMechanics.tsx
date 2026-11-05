import { Link } from 'react-router-dom';
import type { Unit } from '../../../domain/types';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

const scoped = (id: number) => [280, 550, 588].includes(id);

/** 只清这三条说明的平衡空括号及水平邻接空隙；不重排换行和有义内容。 */
export function splashDescription(unit: Pick<Unit, 'id' | 'desc'>): string {
  if (!scoped(unit.id)) return unit.desc;
  return unit.desc.replace(/[ \t]*(?:(?:\([ \t]*\)|（[ \t]*）)[ \t]*)+/g, (empty: string, offset: number, source: string) => {
    const before = source[offset - 1],
      after = source[offset + empty.length];
    return before && after && !/[\r\n]/.test(before + after) && /^[ \t]|[ \t]$/.test(empty) ? ' ' : '';
  });
}

export function SplashMechanics({ unit }: { unit: Pick<Unit, 'id' | 'blast' | 'minr'> }) {
  if (!scoped(unit.id)) return null;
  const radiusKnown = Number.isFinite(unit.blast) && unit.blast > 0;
  const minimumKnown = Number.isFinite(unit.minr) && unit.minr >= 0;
  const source = DATA_SOURCES.sources.aoe2techtree!;
  return (
    <DetailSection title="溅射与最小射程">
      <dl className="detail-cost-grid">
        <div>
          <dt>落点溅射半径</dt>
          <dd data-splash-field="radius">{radiusKnown ? <span className="num nw">{unit.blast}</span> : '数据待确认'}</dd>
        </div>
        <div>
          <dt>最小射程</dt>
          <dd data-splash-field="minimum">{minimumKnown ? <span className="num nw">{unit.minr}</span> : '数据待确认'}</dd>
        </div>
      </dl>
      <p className="note">半径字段表示落点周围的溅射半径；半径数值的单位（是否以格计）待确认。满伤区与边缘伤害/衰减待确认。</p>
      <p className="note">最小射程是攻击者至瞄准点的发射限制，不是免伤圈。溅射围绕落点；即使不能直接瞄准近处，也不代表不会被其他落点的溅射波及。</p>
      <p className="note">
        来源：aoe2techtree字段说明与目录值；DE <span className="num nw">{DATA_SOURCES.patch.build}</span>。未引入溅射伤害模拟。
      </p>
      <a className="community-tool-entry" href={`https://github.com/${source.repo}/blob/${source.commit}/js/main.js#L387`} target="_blank" rel="noreferrer">
        固定版本字段说明
      </a>{' '}
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
