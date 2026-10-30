import { Link } from 'react-router-dom';
import { contextPath, type EntityContext } from '../../../shared/nav/context';
import { regionalBuildings } from '../../../domain/civBuildings';
import type { Building } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { BuildingIcon } from '../../../shared/ui/art';
import './civ-regional-buildings.css';

export function CivRegionalBuildings({ civ, buildings, context }: { civ: string; buildings: readonly Building[] | null; context?: EntityContext }) {
  const list = buildings ? regionalBuildings(civ, buildings) : [];
  if (buildings && !list.length) return null;
  return (
    <SideBlock title="区域建筑">
      {!buildings ? (
        <p role="status">正在加载区域建筑…</p>
      ) : (
        <div className="uchips civ-regional-buildings">
          {list.map((b) => (
            <Link
              key={b.id}
              className="ulink"
              to={contextPath(`/building/${b.id}?${new URLSearchParams({ civ, age: String(b.age) })}`, context?.search ?? '', context?.source)}
            >
              <BuildingIcon b={b} />
              {b.zh}
            </Link>
          ))}
        </div>
      )}
    </SideBlock>
  );
}
