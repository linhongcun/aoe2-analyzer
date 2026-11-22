import { Link } from 'react-router-dom';
import { DATA_PATCH, SOURCE_PINS } from '../../../data/sources';
import {
  ballisticsBoundary,
  ballisticsSentence,
  catalogAccuracyAssumesHit,
  catalogAccuracyFeedsExpectedHit,
  DUEL_MODEL_PATH,
  PK_UNSIMULATED,
  type CatalogTech,
} from '../../../domain/accuracyBoundary';
import type { Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import './unit-accuracy.css';

type AccuracyReading = Pick<Unit, 'rng' | 'acc' | 'accuracyDispersion'> & { id?: number; atks?: Unit['atks'] };

const dat = SOURCE_PINS.dat;
const datUrl = `https://github.com/${dat.repo}/blob/${dat.commit}/${dat.path}`;

export function AccuracyBoundaryNote({ unit, techs }: { unit: AccuracyReading; techs: readonly CatalogTech[] }) {
  if (!catalogAccuracyFeedsExpectedHit(unit)) return null;
  const facts = ballisticsBoundary(techs);
  const known = Number.isFinite(unit.acc) && unit.acc >= 0 && unit.acc <= 100;
  const assumesHit = known && catalogAccuracyAssumesHit(unit);
  const spread = unit.accuracyDispersion;
  const hasSpread = typeof spread === 'number' && Number.isFinite(spread) && spread >= 0;

  return (
    <section className="ud-acc-box" aria-label="准确度与落点散布" data-accuracy="panel">
      <div data-accuracy="boundary">
        <h3>准确度与落点散布</h3>
        <dl className="ud-acc-cards">
          <div className="ud-acc-card" data-accuracy="catalog">
            <dt>
              <Icon name="crosshair" />
              目录准确度
            </dt>
            <dd>
              {known ? (
                <span className="num nw" data-accuracy="percent">
                  {unit.acc}%
                </span>
              ) : (
                '待确认'
              )}
            </dd>
            <dd className="ud-acc-note">
              {!known ? (
                '目录准确度待确认，本页不把它写成 PK 期望命中。'
              ) : assumesHit ? (
                <>
                  目录准确度 <span className="num nw">0%</span> 不表示打不中。单位 PK 把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。
                </>
              ) : (
                '目录百分比读数；进入单位 PK 的期望命中。'
              )}
              {unit.id === 331 && '目录打包记录的准确度，不代表展开命中率。'}
            </dd>
          </div>
          <div className="ud-acc-card" data-accuracy="dispersion">
            <dt>
              <Icon name="chart-scatter" />
              落点散布参数
            </dt>
            <dd>{hasSpread ? <span className="num nw">{Number(spread.toFixed(2))}</span> : '暂无数据'}</dd>
            <dd className="ud-acc-note">
              {!hasSpread ? (
                <>
                  当前形态未收录落点散布参数；不会补成 <span className="num nw">0</span>，也无法据此判断实战命中。
                </>
              ) : spread === 0 ? (
                <>
                  固定源显式记录为 <span className="num nw">0</span>（无量纲原始参数）；不进入单位 PK，不代表实战必定命中。
                </>
              ) : (
                '无量纲原始参数（非百分比、非格数）；不进入单位 PK，无法据此判断实战命中。'
              )}
            </dd>
          </div>
        </dl>
        <p className="note" data-accuracy="dispersion-boundary">
          落点散布参数的物理单位与实战弹着分布未核实，未接入单位 PK、弹道学或伤害公式。
        </p>
        <p className="note" data-accuracy="ballistics">
          {ballisticsSentence(facts)}
        </p>
        <p className="note" data-accuracy="pk">
          {PK_UNSIMULATED}
        </p>
        <p className="note ud-acc-source">
          来源：固定 DE DAT（DE <span className="num nw">{DATA_PATCH.build}</span>，<span className="num nw">{DATA_PATCH.date}</span>） ·{' '}
          <a href={datUrl}>固定版本 DAT</a> · <Link to="/about-data">数据说明</Link>
        </p>
        <p className="community-tool-row">
          {facts.found && (
            <Link className="community-tool-entry" to={`/tech/${facts.id}`}>
              查看弹道学
            </Link>
          )}
          <Link className="community-tool-entry" to={DUEL_MODEL_PATH}>
            查看单位 PK 模型边界
          </Link>
        </p>
      </div>
    </section>
  );
}
