import { Link } from 'react-router-dom';
import { regionalUnitLines } from '../../../domain/civUnits';
import { collapse, type Families } from '../../../domain/family';
import { unitPath } from '../../../domain/simRoute';
import type { Unit } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { EliteBadge, UnitIcon } from '../../../shared/ui/art';
import './civ-regional-units.css';

export function CivRegionalUnits({ civ, units, families }: { civ: string; units: readonly Unit[] | null; families: Families | null }) {
  const list = units && families ? collapse(regionalUnitLines(civ, units).flat(), families) : [];
  if (units && families && !list.length) return null;
  return (
    <SideBlock title="区域单位">
      {!units || !families ? (
        <p role="status">正在加载区域单位…</p>
      ) : (
        <div className="uchips civ-regional-units">
          {list.map(({ u, elite }) => (
            <Link key={u.id} className="ulink" to={unitPath(u.id, civ, u.age, [], [])} title={elite ? `${u.zh} / ${elite.zh}` : undefined}>
              <UnitIcon u={u} />
              {u.zh}
              {elite && <EliteBadge />}
            </Link>
          ))}
        </div>
      )}
    </SideBlock>
  );
}
