import { Link, useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../../shared/ui/layout';
import { productionMode } from './productionMode';
import { TRAIN_COMPARE_ENTRY } from './trainCompareCodec';

/** 当前项保留地址和参数；另一项仍去原来的入口。 */
export function ProductionModeNav() {
  const { pathname, search } = useLocation();
  const legacy = productionMode(search).kind === 'legacy';
  const here = { pathname, search };
  return (
    <nav className="bar team-sections" aria-label="生产模式">
      <Link className="community-tool-entry" to={legacy ? here : '/production'} aria-current={legacy ? 'page' : undefined}>
        持续生产
      </Link>
      <Link className="community-tool-entry" to={legacy ? TRAIN_COMPARE_ENTRY : here} aria-current={legacy ? undefined : 'page'}>
        跨文明训练对照
      </Link>
    </nav>
  );
}

/** 页头两行：面包屑，然后是生产模式。 */
export function ProductionPageTop({ crumb }: { crumb?: string }) {
  return (
    <>
      <Breadcrumbs current={crumb} />
      <ProductionModeNav />
    </>
  );
}
