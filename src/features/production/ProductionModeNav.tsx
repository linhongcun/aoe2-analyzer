import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { Breadcrumbs } from '../../shared/ui/layout';
import { productionMode } from './productionMode';
import { TRAIN_COMPARE_ENTRY } from './trainCompareCodec';
import { legacyHrefFromTotal, trainTotalHrefFrom } from './trainTotalCodec';
import { armyContextQuery } from './armyCostCodec';

export interface ProductionModeTransfer {
  to: string;
  state: unknown;
}

export function ProductionModeNav({ transfer }: { transfer?: ProductionModeTransfer }) {
  const { pathname, search, state } = useLocation();
  const mode = productionMode(search);
  const here = { pathname, search };
  const current =
    mode.kind === 'army'
      ? 'army'
      : mode.kind === 'legacy'
        ? 'legacy'
        : mode.kind === 'total' || (mode.kind === 'error' && mode.subject === 'total')
          ? 'total'
          : 'compare';
  const shared = armyContextQuery(search);
  const legacyTo =
    current === 'legacy' ? here : current === 'army' ? '/production?' + shared : mode.kind === 'total' ? legacyHrefFromTotal(search) : '/production';
  const totalTo = current === 'total' ? here : current === 'army' ? '/production?mode=train-total&' + shared : trainTotalHrefFrom(search);
  const compareTo = current === 'compare' ? here : TRAIN_COMPARE_ENTRY;
  const needsTransfer = mode.kind === 'legacy' || mode.kind === 'total';
  return (
    <nav className="bar team-sections" aria-label="生产模式">
      {current !== 'legacy' && needsTransfer && !transfer ? (
        <span className="community-tool-entry" aria-disabled="true">
          持续生产
        </span>
      ) : (
        <Link
          className="community-tool-entry"
          to={current !== 'legacy' && transfer ? transfer.to : legacyTo}
          state={current === 'legacy' ? state : transfer?.state}
          replace={current === 'legacy'}
          aria-current={current === 'legacy' ? 'page' : undefined}
        >
          持续生产
        </Link>
      )}
      {current !== 'total' && needsTransfer && !transfer ? (
        <span className="community-tool-entry" aria-disabled="true">
          训练总价
        </span>
      ) : (
        <Link
          className="community-tool-entry"
          to={current !== 'total' && transfer ? transfer.to : totalTo}
          state={current === 'total' ? state : transfer?.state}
          replace={current === 'total'}
          aria-current={current === 'total' ? 'page' : undefined}
        >
          训练总价
        </Link>
      )}
      <Link
        className="community-tool-entry"
        to={compareTo}
        state={current === 'compare' ? state : null}
        aria-current={current === 'compare' ? 'page' : undefined}
      >
        跨文明训练对照
      </Link>
      <Link
        className="community-tool-entry"
        to={current === 'army' ? here : '/production?mode=army-cost&' + shared}
        state={null}
        aria-current={current === 'army' ? 'page' : undefined}
      >
        阵容新增费用
      </Link>
    </nav>
  );
}

/** 页头两行：面包屑，然后是生产模式。 */
export function ProductionPageTop({ crumb, flat = false, transfer }: { crumb?: string; flat?: boolean; transfer?: ProductionModeTransfer }) {
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
      <ProductionModeNav transfer={transfer} />
    </>
  );
}
