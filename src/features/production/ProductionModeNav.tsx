import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { Breadcrumbs } from '../../shared/ui/layout';
import { productionMode } from './productionMode';
import { TRAIN_COMPARE_ENTRY } from './trainCompareCodec';
import { legacyHrefFromTotal, trainTotalHrefFrom } from './trainTotalCodec';

/** 当前项保留地址和参数。训练总价从其它模式进入时只带文明和合法显式时代。 */
export function ProductionModeNav() {
  const { pathname, search } = useLocation();
  const mode = productionMode(search);
  const here = { pathname, search };
  const current = mode.kind === 'legacy' ? 'legacy' : mode.kind === 'total' || (mode.kind === 'error' && mode.subject === 'total') ? 'total' : 'compare';
  const legacyTo = current === 'legacy' ? here : mode.kind === 'total' ? legacyHrefFromTotal(search) : '/production';
  const totalTo = current === 'total' ? here : trainTotalHrefFrom(search);
  const compareTo = current === 'compare' ? here : TRAIN_COMPARE_ENTRY;
  return (
    <nav className="bar team-sections" aria-label="生产模式">
      <Link className="community-tool-entry" to={legacyTo} aria-current={current === 'legacy' ? 'page' : undefined}>
        持续生产
      </Link>
      <Link className="community-tool-entry" to={totalTo} aria-current={current === 'total' ? 'page' : undefined}>
        训练总价
      </Link>
      <Link className="community-tool-entry" to={compareTo} aria-current={current === 'compare' ? 'page' : undefined}>
        跨文明训练对照
      </Link>
    </nav>
  );
}

/** 页头两行：面包屑，然后是生产模式。 */
export function ProductionPageTop({ crumb, flat = false }: { crumb?: string; flat?: boolean }) {
  return (
    <>
      {flat ? (
        <nav className="crumbs" aria-label="面包屑">
          <Link to="/">
            <Icon name="home" /> 首页
          </Link>
          <Icon name="chevron-right" />
          <span>{crumb}</span>
        </nav>
      ) : (
        <Breadcrumbs current={crumb} />
      )}
      <ProductionModeNav />
    </>
  );
}
