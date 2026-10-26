import { Link } from 'react-router-dom';
import { regionalBuildings } from '../../../domain/civBuildings';
import type { Building } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { BuildingIcon } from '../../../shared/ui/art';
import './civ-regional-buildings.css';

export function CivRegionalBuildings({ civ, buildings }: { civ: string; buildings: readonly Building[] | null }) {
  const list = buildings ? regionalBuildings(civ, buildings) : [];
  return (
    <SideBlock title="区域建筑">
      {!buildings ? (
        <p role="status">正在加载区域建筑…</p>
      ) : list.length ? (
        <div className="uchips civ-regional-buildings">
          {list.map((b) => (
            <Link key={b.id} className="ulink" to={`/building/${b.id}?${new URLSearchParams({ civ, age: String(b.age) })}`}>
              <BuildingIcon b={b} />
              {b.zh}
            </Link>
          ))}
        </div>
      ) : (
        <p>本文明没有区域建筑。</p>
      )}
    </SideBlock>
  );
}
