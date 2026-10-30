import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { buildsMatchupReturn, buildsPath } from '../../domain/matchupRoute';
import { Icon } from '../../shared/ui/Icon';
import '../../shared/ui/contextLinks.css';

export function BuildContext({ params }: { params: URLSearchParams }) {
  const civ = civByEn(params.get('civ') ?? '');
  const back = buildsMatchupReturn(params);
  if (!civ && !back) return null;
  return (
    <nav className="ctx-bar" aria-label="对阵相关入口">
      {back && (
        <Link className="community-tool-entry" to={back}>
          <Icon name="arrow-left" />
          回对局助手
        </Link>
      )}
      {civ && (
        <Link className="community-tool-entry" to={`/civ/${civ.en}`}>
          {civ.zh}
        </Link>
      )}
      {params.has('bo') && (
        <Link className="community-tool-entry" to={buildsPath(civ?.en)}>
          查看全部开局
        </Link>
      )}
    </nav>
  );
}
