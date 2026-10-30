import { Link } from 'react-router-dom';
import type { LineEntry } from '../../domain/family';
import { EliteBadge, UnitIcon, UnitLink } from './art';
import { entityPath, type EntityContext } from '../nav/context';

/** 一条升级路线一个条目：叠放图标 + 「骑士 / 重骑士 / 圣骑士」，每个名字可点；精锐版合并为小标 */
export function LineChip({ g, context }: { g: LineEntry; context?: EntityContext }) {
  if (g.members.length === 1) return <UnitLink u={g.members[0]!.u} elite={g.members[0]!.elite} context={context} />;
  return (
    <span className="lchip" title={g.members.map((m) => m.u.zh + (m.elite ? '（含精锐）' : '')).join('、')}>
      <span className="stack">
        {g.members.map((m) => (
          <UnitIcon key={m.u.id} u={m.u} />
        ))}
      </span>
      {g.members.map((m, i) => (
        <span key={m.u.id}>
          {i > 0 && <span className="lsep"> / </span>}
          <Link className="ulink" to={context ? entityPath('unit', m.u.id, context.civ, context.search, context.source, context.age) : `/unit/${m.u.id}`}>
            {m.u.zh}
          </Link>
          {m.elite && <EliteBadge />}
        </span>
      ))}
    </span>
  );
}
