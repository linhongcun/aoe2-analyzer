import { Link, useLocation } from 'react-router-dom';
import type { Civ } from '../../domain/types';
import { treeSummaryReturn } from '../../domain/treeSummaryNavigation';
import './tree-summary-return.css';

export function TreeSummaryReturn({ civ, kind, id }: { civ?: Civ; kind: 'u' | 't'; id: number }) {
  const location = useLocation();
  const memory = treeSummaryReturn(location.state, civ?.en, kind, id, location.pathname);
  return memory && civ ? (
    <Link className="tree-summary-return" to={`/civ/${civ.en}#techtree`} state={{ treeSummary: memory }}>
      返回{civ.zh}科技树
    </Link>
  ) : null;
}
