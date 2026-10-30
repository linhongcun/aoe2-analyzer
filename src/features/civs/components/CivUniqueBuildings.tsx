import { Link } from 'react-router-dom';
import { contextPath, type EntityContext } from '../../../shared/nav/context';
import { uniqueBuildings } from '../../../domain/civBuildings';
import type { Building } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { BuildingIcon } from '../../../shared/ui/art';
import './civ-unique-buildings.css';

export function CivUniqueBuildings({ civ, buildings, context }: { civ: string; buildings: readonly Building[] | null; context?: EntityContext }) {
  const list = buildings ? uniqueBuildings(civ, buildings) : [];
  if (buildings && !list.length) return null;
  return (
    <SideBlock title="独特建筑">
      {!buildings ? (
        <p role="status">正在加载独特建筑…</p>
      ) : (
        <div className="uchips civ-unique-buildings">
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
