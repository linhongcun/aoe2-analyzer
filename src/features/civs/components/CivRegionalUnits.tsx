import { Link } from 'react-router-dom';
import { regionalUnitLines } from '../../../domain/civUnits';
import { unitPath } from '../../../domain/simRoute';
import type { Unit } from '../../../domain/types';
import { SideBlock } from '../../../shared/ui/layout';
import { UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import './civ-regional-units.css';

export function CivRegionalUnits({ civ, units }: { civ: string; units: readonly Unit[] | null }) {
  const lines = units ? regionalUnitLines(civ, units) : [];
  if (units && !lines.length) return null;
  return (
    <SideBlock title="区域单位">
      {!units ? (
        <p role="status">正在加载区域单位…</p>
      ) : (
        <div className="civ-regional-units">
          {lines.map((line) => {
            const base = line[0]!;
            if (line.length === 1)
              return (
                <Link key={base.id} className="civ-regional-single" to={unitPath(base.id, civ, base.age, [], [])}>
                  <UnitIcon u={base} />
                  {base.zh}
                </Link>
              );
            return (
              <details key={`${civ}-${base.id}`} className="civ-regional-line">
                <summary>
                  <UnitIcon u={base} />
                  <span className="civ-regional-name">{base.zh}</span>
                  <span className="civ-regional-hint">升级线</span>
                  <Icon name="chevron-down" />
                </summary>
                <ol aria-label={`${base.zh}升级路线`}>
                  {line.map((u, index) => (
                    <li key={u.id}>
                      <Link to={unitPath(u.id, civ, u.age, [], [])}>
                        <span>{u.zh}</span>
                        <small aria-hidden="true">{index === 0 ? '基础' : '升级'}</small>
                      </Link>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </div>
      )}
    </SideBlock>
  );
}
