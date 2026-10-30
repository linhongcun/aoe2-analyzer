import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { buildListPath, buildNavigationParams } from '../../domain/buildNavigation531';
import { NavigationContext } from '../../shared/ui/NavigationContext';
import '../../shared/ui/contextLinks.css';

export function BuildContext({ params }: { params: URLSearchParams }) {
  const normalized = buildNavigationParams(params);
  const civ = civByEn(normalized.get('civ') ?? '');
  return (
    <div className="build-navigation">
      <NavigationContext search={normalized.toString()} currentCiv={civ?.en} label="对阵相关入口">
        {normalized.has('bo') && (
          <Link className="community-tool-entry" to={buildListPath(normalized)}>
            查看全部开局
          </Link>
        )}
      </NavigationContext>
    </div>
  );
}
