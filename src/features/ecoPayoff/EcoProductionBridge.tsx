import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { AGE_ZH } from '../../domain/ratings';
import type { EcoPayoffConfig } from '../../domain/ecoPayoff';
import type { ProductionConfig, ProductionContext } from '../../domain/production';
import { payoffFromProduction, theoreticalProductionWorkers } from '../../domain/productionIntegration';
import { Icon } from '../../shared/ui/Icon';
import type { PayoffPeople } from './productionBridge';

export function EcoProductionBridge({
  ctx,
  source,
  back,
  sourceErrors,
  people,
  config,
  locked,
  choose,
}: {
  ctx: ProductionContext;
  source: ProductionConfig | null;
  back: string | null;
  sourceErrors: string[];
  people: PayoffPeople | null;
  config: EcoPayoffConfig;
  locked: boolean;
  choose: (config: EcoPayoffConfig, people: PayoffPeople) => void;
}) {
  if (people === null && !source && !sourceErrors.length) return null;
  const theoretical = source ? theoreticalProductionWorkers(ctx, source) : null;
  const omitted = source ? payoffFromProduction(ctx, source).omittedTechs : [];
  return (
    <section className="eco-card eco-production-bridge" aria-labelledby="eco-source-title">
      <div className="eco-source-heading">
        <div>
          <h2 id="eco-source-title">{source ? '来自你的生产方案' : '确认这次收益估算的条件'}</h2>
          {source && (
            <p className="note">
              {civByEn(source.civ)?.zh ?? source.civ} · {AGE_ZH[source.age]} · <span className="num">{source.rows.length} 条</span>生产需求。原方案保持不变。
            </p>
          )}
        </div>
        {source && back && (
          <Link className="btn" to={back}>
            <Icon name="arrow-left" />
            返回原生产方案
          </Link>
        )}
      </div>
      {source && (
        <>
          <div className="eco-carry-list">
            <span>
              <Icon name="check" />
              文明与时代
            </span>
            <span>
              <Icon name="check" />
              兼容的已有科技
            </span>
            <span>
              <Icon name="check" />
              木金石采集距离
            </span>
          </div>
          <p className="note">农田距离不带入，食物投入按收益工具的固定农田基准折算。目标科技是初始选择，可自行调整，不代表研究推荐。</p>
          {omitted.length > 0 && (
            <p className="note">来源中未带入的科技：{omitted.map((id) => ctx.core.techById[id]?.zh ?? id).join('、')}；收益模型仅接收其支持的已有科技。</p>
          )}
        </>
      )}
      {sourceErrors.length > 0 && <p className="eco-incomplete">来源方案不能用于人数带入：{sourceErrors.join(' ')} 当前收益设置仍然保留。</p>}
      {people !== null && (
        <div className="eco-people-choice">
          <h3>用于估算的村民从哪里来？</h3>
          <p className="note">生产所需的理论人数，不代表你当前实际拥有的村民。确认后按本页条件计算。</p>
          <div className="eco-people-actions">
            {source && (
              <button
                type="button"
                className="btn"
                disabled={locked || !theoretical?.workers}
                onClick={() => {
                  if (theoretical?.workers) choose({ ...config, workers: theoretical.workers }, 'theory');
                }}
              >
                <Icon name="calculator" />
                使用原方案的理论供给人数
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={locked}
              onClick={() => choose({ ...config, workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' } }, 'manual')}
            >
              我来填写实际人数
            </button>
          </div>
          {theoretical?.errors.length ? <p className="note">{theoretical.errors.join(' ')}</p> : null}
          {people !== 'none' && (
            <p className="eco-people-provenance" role="status">
              <Icon name="info" />
              {people === 'theory' ? '正在使用理论供给人数作为假设' : people === 'adjusted' ? '正在使用手动调整的供给假设' : '正在使用你填写的人数'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
