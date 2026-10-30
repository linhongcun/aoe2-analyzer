import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { contextPath } from '../../shared/nav/context';
import { encodeEcoPayoff } from '../../domain/ecoPayoff';
import { calculateProduction, encodeProduction, type ProductionConfig, type ProductionContext, type ProductionResult } from '../../domain/production';
import { payoffFromProduction } from '../../domain/productionIntegration';
import { tradeIncomeProductionHref } from '../../domain/tradeIncome';
import { encodeRelicIncome, newRelicIncomeConfig } from '../../domain/relicIncome';

export function ProductionNextSteps({ ctx, config, valid }: { ctx: ProductionContext; config: ProductionConfig; valid: boolean }) {
  const location = useLocation();
  const payoff = payoffFromProduction(ctx, config);
  const source = contextPath('/production?' + encodeProduction(config), location.search);
  const payoffPath = contextPath('/eco-payoff?' + encodeEcoPayoff(payoff.config) + '&ctxPeople=none', location.search, source);
  const relicPath = contextPath('/relic-income?' + encodeRelicIncome({ ...newRelicIncomeConfig(), civ: config.civ }), location.search, source);
  return (
    <section className="production-next" aria-labelledby="production-next-title">
      <h2 id="production-next-title">继续分析这个方案</h2>
      <p className="note">保留原方案，再明确下一项分析所需的条件。</p>
      <div className="production-next-grid">
        <article>
          <Icon name="flask-conical" />
          <h3>研究经济科技有多少增量？</h3>
          <p className="note">带入文明、时代与兼容科技；先确认村民人数，再核对研究投入和收益。</p>
          {valid && config.rows.length ? (
            <Link className="ulink production-payoff-entry" to={payoffPath}>
              经济科技收益：带着方案核对收益 <Icon name="arrow-right" />
            </Link>
          ) : (
            <p className="note">修正并添加生产需求后可带入收益工具。</p>
          )}
        </article>
        <article>
          <Icon name="git-branch" />
          <h3>黄金还能怎样供给？</h3>
          <p className="note">按当前生产金耗核对商路需求，原方案可从商路工具完整返回。</p>
          {valid ? (
            <Link className="ulink production-payoff-entry" to={contextPath(tradeIncomeProductionHref(config), location.search, source)}>
              按当前生产金耗规划商路供给 <Icon name="arrow-right" />
            </Link>
          ) : (
            <p className="note">修正当前生产配置后可带入商路供给。</p>
          )}
        </article>
      </div>
      <details className="production-related-tools">
        <summary>其他相关工具</summary>
        <nav className="bar" aria-label="生产与战术规划">
          <Link className="community-tool-entry" to="/mixed-army">
            结合当前局面查看混兵条件
          </Link>
          <Link className="community-tool-entry" to="/team-plan">
            在团战计划中约定主副兵种
          </Link>
          <Link className="community-tool-entry" to={relicPath}>
            另查固定圣物收益
          </Link>
        </nav>
      </details>
    </section>
  );
}

export function ProductionComparison({ ctx, config, result }: { ctx: ProductionContext; config: ProductionConfig; result: ProductionResult }) {
  const [open, setOpen] = useState(false);
  const index = config.rows.findIndex((row) => /^\d+$/.test(row.count) && +row.count > 0);
  if (result.errors.length || index < 0) return null;
  const comparison = calculateProduction(ctx, {
    ...config,
    rows: config.rows.map((row, i) => (i === index ? { ...row, count: String(+row.count - 1) } : row)),
  });
  if (comparison.errors.length) return null;
  return (
    <div className="production-comparison">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="scale" />
        {open ? '收起建筑数量对照' : '对比少一座生产建筑的需求'}
      </button>
      {open && (
        <div className="production-comparison-body">
          <div>
            <span>当前方案</span>
            <strong className="num">{result.total} 人</strong>
          </div>
          <div>
            <span>
              需求 <span className="num">{index + 1}</span> 少一座建筑
            </span>
            <strong className="num">{comparison.total} 人</strong>
          </div>
          <p className="note">
            总供给人数差 <span className="num">{result.total - comparison.total} 人</span>；其余需求、文明、时代与采集条件保持一致。
          </p>
        </div>
      )}
    </div>
  );
}
