import { Link } from 'react-router-dom';
import { uniqueBuildings } from '../../../domain/civBuildings';
import type { Building } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { BuildingIcon } from '../../../shared/ui/art';
import './civ-unique-buildings.css';

export function CivUniqueBuildings({ civ, buildings }: { civ: string; buildings: readonly Building[] | null }) {
  const list = buildings ? uniqueBuildings(civ, buildings) : [];
  return (
    <SideBlock title="独特建筑">
      {!buildings ? (
        <p role="status">正在加载独特建筑…</p>
      ) : list.length ? (
        <div className="uchips civ-unique-buildings">
          {list.map((b) => (
            <Link key={b.id} className="ulink" to={`/building/${b.id}?${new URLSearchParams({ civ, age: String(b.age) })}`}>
              <BuildingIcon b={b} />
              {b.zh}
            </Link>
          ))}
        </div>
      ) : (
        <p>本文明没有独特建筑。</p>
      )}
    </SideBlock>
  );
}
