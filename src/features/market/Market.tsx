import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { RES_ZH } from '../../domain/ratings';
import {
  MARKET_DATA,
  MARKET_LOT_LIMIT,
  MARKET_ORDER_LIMIT,
  MARKET_RESOURCES,
  MARKET_STOCK_LIMIT,
  STOCK_RESOURCES,
  calculateMarket,
  decodeMarket,
  defaultMarketConfig,
  encodeMarket,
  marketErrors,
  marketHasGuilds,
  type MarketConfig,
  type MarketOrder,
  type MarketPlan,
  type MarketResult,
} from '../../domain/market';
import { CalcDock } from '../../shared/ui/CalcDock';
import { Icon } from '../../shared/ui/Icon';
import './market.css';

const number = (value: number) => value.toLocaleString('zh-CN');
const signed = (value: number) => (value > 0 ? '+' : '') + number(value);
const PAGE_SIZE = 25;
function marketLead(result: MarketResult, name: string) {
  if (result.errors.length) return <>方案 {name}：输入无效</>;
  if (result.failure)
    return (
      <>
        方案 {name}：只覆盖部分交易，已执行 <span className="market-number">{result.trades.length} 笔</span>
      </>
    );
  if (!result.trades.length) return <>方案 {name}：没有交易</>;
  return (
    <>
      方案 {name}：预计可执行 <span className="market-number">{result.trades.length} 笔</span>
    </>
  );
}

export default function Market() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeMarket(location.search), [location.search]);
  const [active, setActive] = useState<0 | 1>(0),
    [status, setStatus] = useState(''),
    [manualLink, setManualLink] = useState('');
  const config = decoded.config;
  const results = config.plans.map(calculateMarket);
  const update = (next: MarketConfig) => {
    navigate({ pathname: '/market', search: '?' + encodeMarket(next) }, { replace: true });
    setStatus('');
    setManualLink('');
  };
  const updatePlan = (next: MarketPlan) => update({ plans: config.plans.map((plan, index) => (index === active ? next : plan)) as MarketConfig['plans'] });
  const share = async () => {
    const url = new URL(document.baseURI);
    url.hash = '/market?' + encodeMarket(config);
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus('方案链接已复制，包含两份方案、库存与交易顺序。');
      setManualLink('');
    } catch {
      setStatus('自动复制失败，请手动复制下方链接。');
      setManualLink(url.href);
    }
  };
  return (
    <section className="pane market-page" data-testid="market-page">
      <header className="market-heading">
        <div>
          <h1>市场买卖预算</h1>
          <p className="note">按你的交易顺序，估算资源收支与下一笔报价。</p>
        </div>
      </header>
      <CalcDock
        note={status}
        resultId={decoded.errors.length ? undefined : 'market-compare-title'}
        actions={[
          {
            label: '复制两份方案链接',
            icon: 'copy',
            disabled: decoded.errors.length > 0 || config.plans.some((plan) => marketErrors(plan).length > 0),
            onClick: () => void share(),
          },
          { label: '重置方案', onClick: () => update(defaultMarketConfig()) },
        ]}
      />
      {!decoded.errors.length && (
        <p className="market-lead" data-testid="market-lead">
          {marketLead(results[0]!, 'A')}；{marketLead(results[1]!, 'B')}。
        </p>
      )}
      <aside className="market-caution" aria-label="预算口径">
        <strong>预算估算，游戏实际报价优先</strong>
        <p>
          按每笔整数报价估算。费率取自 DE 185872 固定数据，其余引擎规则尚未在同版游戏逐笔复测。游戏内部可能保留小数余额，累计黄金和预算不足的临界点可能不同。
        </p>
        <p>所有玩家共用市场行情；这里仅执行你给定的交易，假设期间无人改变行情。不计建市场、研究科技或采集资源的开销。</p>
      </aside>
      {!!decoded.errors.length && (
        <div className="market-error" role="alert">
          {decoded.errors.join(' ')}
        </div>
      )}
      {manualLink && (
        <label className="market-link">
          手动复制方案链接
          <input readOnly value={manualLink} onFocus={(event) => event.target.select()} />
        </label>
      )}
      {!decoded.errors.length && (
        <div className="market-panel">
          <div className="market-toolbar">
            <div className="market-switch" role="group" aria-label="编辑方案">
              {([0, 1] as const).map((index) => (
                <button
                  type="button"
                  className={'btn' + (active === index ? ' active' : '')}
                  aria-pressed={active === index}
                  key={index}
                  onClick={() => setActive(index)}
                >
                  编辑方案 {index === 0 ? 'A' : 'B'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              onClick={() =>
                update({ plans: active === 0 ? [config.plans[0], structuredClone(config.plans[0])] : [structuredClone(config.plans[1]), config.plans[1]] })
              }
            >
              复制当前方案到 {active === 0 ? 'B' : 'A'}
            </button>
          </div>
          <PlanEditor key={active} plan={config.plans[active]} update={updatePlan} name={active === 0 ? 'A' : 'B'} />
        </div>
      )}
      {!decoded.errors.length && (
        <>
          <section className="market-panel" aria-labelledby="market-compare-title">
            <h2 id="market-compare-title" className="calc-dock-target" tabIndex={-1}>
              方案对照
            </h2>
            <p className="note">分别使用每份方案的初始库存和行情，不共用交易历史；不同资源分别列账。</p>
            <div className="market-comparison">
              {results.map((result, index) => (
                <div className="market-summary" key={index} data-testid={`market-summary-${index}`}>
                  <h3>方案 {index === 0 ? 'A' : 'B'}</h3>
                  <p className="note">{civs.find((civ) => civ.en === config.plans[index]!.civ)?.zh ?? '文明无效'}</p>
                  {result.errors.length ? (
                    <p className="market-invalid">输入无效，暂停计算</p>
                  ) : (
                    <>
                      <p>{result.failure ? '预算仅覆盖部分交易，后续已停止' : result.trades.length ? '预计全部交易可执行' : '没有交易，库存不变'}</p>
                      <p>
                        手续费 <strong className="market-number">{number(result.fee * 100)}%</strong> · 预算可执行{' '}
                        <span className="market-number">{result.trades.length} 笔</span>
                      </p>
                      <dl>
                        {STOCK_RESOURCES.map((resource) => (
                          <div key={resource}>
                            <dt>{RES_ZH[resource]}净变化</dt>
                            <dd>{signed(result.delta[resource])}</dd>
                          </div>
                        ))}
                        <div>
                          <dt>累计花费黄金</dt>
                          <dd>{number(result.spent)}</dd>
                        </div>
                        <div>
                          <dt>累计获得黄金</dt>
                          <dd>{number(result.received)}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
          <PlanResult key={active + JSON.stringify(config.plans[active])} result={results[active]!} name={active === 0 ? 'A' : 'B'} />
        </>
      )}
      <details className="market-panel market-method">
        <summary>计算规则与数据来源</summary>
        <p>
          每笔成交 <span className="market-number">{MARKET_DATA.engine.lot} 资源</span>
          。先使用当前手续费前基价计算买卖报价，按每笔四舍五入到整数黄金；成交后，该资源基价按买入增加、卖出减少{' '}
          <span className="market-number">{MARKET_DATA.engine.step}</span>，限制在{' '}
          <span className="market-number">
            {MARKET_DATA.engine.minBase}–{MARKET_DATA.engine.maxBase}
          </span>
          。不对整批总价再次取整。
        </p>
        <p>最低买价由最低基价和当前费率自然计算，不另设统一买价下限。报价是整数预算，实际引擎取整仍需同版复核，临界库存请以游戏为准。</p>
        <p>行会和大干道只切换已研究后的费率，不扣研究费。萨拉森与印度斯坦没有行会，不会叠加两种费率。</p>
        {/* issue 275：不再向玩家显示 .dat 的校验值，固定版本与校验信息统一放在「关于数据」 */}
        <p className="note">
          数据所用游戏 .dat 的固定版本与校验信息见<Link to="/about-data">关于数据</Link>。
        </p>
        <ul>
          {MARKET_DATA.engine.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.scope}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function PlanEditor({ plan, update, name }: { plan: MarketPlan; update: (plan: MarketPlan) => void; name: string }) {
  const errors = marketErrors(plan),
    unique = MARKET_DATA.uniqueFees[plan.civ];
  const editOrder = (index: number, patch: Partial<MarketOrder>) =>
    update({ ...plan, orders: plan.orders.map((order, i) => (i === index ? { ...order, ...patch } : order)) });
  const moveOrder = (index: number, by: number) => {
    const orders = [...plan.orders];
    [orders[index], orders[index + by]] = [orders[index + by]!, orders[index]!];
    update({ ...plan, orders });
  };
  return (
    <div data-testid={`market-editor-${name}`}>
      <h2>方案 {name} 的初始状态</h2>
      <div className="market-settings">
        <label>
          文明
          <select aria-label="文明" value={plan.civ} onChange={(event) => update({ ...plan, civ: event.target.value, guilds: false, unique: false })}>
            {civs.map((civ) => (
              <option key={civ.en} value={civ.en}>
                {civ.zh}
              </option>
            ))}
          </select>
        </label>
        <label className="market-check">
          <input
            type="checkbox"
            checked={plan.guilds}
            disabled={!marketHasGuilds(plan.civ) && !plan.guilds}
            onChange={(event) => update({ ...plan, guilds: event.target.checked })}
          />
          已研究行会{!marketHasGuilds(plan.civ) && '（该文明无此科技）'}
        </label>
        {(unique || plan.unique) && (
          <label className="market-check">
            <input type="checkbox" checked={plan.unique} onChange={(event) => update({ ...plan, unique: event.target.checked })} />
            已研究{unique?.name ?? '费率特色科技（该文明不可用）'}
          </label>
        )}
      </div>
      <fieldset>
        <legend>初始库存</legend>
        <div className="market-fields">
          {STOCK_RESOURCES.map((resource) => (
            <label key={resource}>
              {RES_ZH[resource]}库存
              <input
                aria-label={`${RES_ZH[resource]}库存`}
                inputMode="numeric"
                type="number"
                min="0"
                max={MARKET_STOCK_LIMIT}
                step="1"
                value={plan.stock[resource]}
                onChange={(event) => update({ ...plan, stock: { ...plan.stock, [resource]: event.target.value } })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <details className="market-base">
        <summary>高级：手续费前市场基价</summary>
        <p className="note">
          单位为「每 {MARKET_DATA.engine.lot} 资源对应的黄金」。初始食物 {MARKET_DATA.engine.initial.Food}、木材 {MARKET_DATA.engine.initial.Wood}、石料{' '}
          {MARKET_DATA.engine.initial.Stone}。这里输入不含手续费的基价，不能填游戏面板里的买价或卖价。
        </p>
        <div className="market-fields">
          {MARKET_RESOURCES.map((resource) => (
            <label key={resource}>
              {RES_ZH[resource]}基价
              <input
                aria-label={`${RES_ZH[resource]}手续费前基价`}
                inputMode="numeric"
                type="number"
                min={MARKET_DATA.engine.minBase}
                max={MARKET_DATA.engine.maxBase}
                step="1"
                value={plan.base[resource]}
                onChange={(event) => update({ ...plan, base: { ...plan.base, [resource]: event.target.value } })}
              />
            </label>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => update({ ...plan, base: defaultMarketConfig().plans[0].base })}>
          恢复初始行情
        </button>
      </details>
      <div className="market-toolbar">
        <div>
          <h2>有序交易</h2>
          <p className="note">
            从上到下执行；每笔 {MARKET_DATA.engine.lot} 资源，合计最多 {number(MARKET_LOT_LIMIT)} 笔。
          </p>
        </div>
        <button
          className="btn"
          type="button"
          disabled={plan.orders.length >= MARKET_ORDER_LIMIT}
          onClick={() => update({ ...plan, orders: [...plan.orders, { resource: 'Food', direction: 'buy', lots: '1' }] })}
        >
          <Icon name="plus" />
          添加交易
        </button>
      </div>
      {!plan.orders.length && <p>暂无交易，可添加第一项操作。</p>}
      <ol className="market-orders">
        {plan.orders.map((order, index) => (
          <li key={index} data-testid="market-order">
            <h3>第 {index + 1} 项操作</h3>
            <div className="market-order-fields">
              <label>
                方向
                <select
                  aria-label={`第 ${index + 1} 项方向`}
                  value={order.direction}
                  onChange={(event) => editOrder(index, { direction: event.target.value as MarketOrder['direction'] })}
                >
                  <option value="sell">卖出</option>
                  <option value="buy">买入</option>
                </select>
              </label>
              <label>
                资源
                <select
                  aria-label={`第 ${index + 1} 项资源`}
                  value={order.resource}
                  onChange={(event) => editOrder(index, { resource: event.target.value as MarketOrder['resource'] })}
                >
                  {MARKET_RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {RES_ZH[resource]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                数量（笔）
                <input
                  aria-label={`第 ${index + 1} 项笔数`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MARKET_LOT_LIMIT}
                  step="1"
                  value={order.lots}
                  onChange={(event) => editOrder(index, { lots: event.target.value })}
                />
              </label>
            </div>
            <div className="market-order-actions">
              <button type="button" className="btn" aria-label={`上移第 ${index + 1} 项`} disabled={index === 0} onClick={() => moveOrder(index, -1)}>
                <Icon name="arrow-up" />
                上移
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`下移第 ${index + 1} 项`}
                disabled={index === plan.orders.length - 1}
                onClick={() => moveOrder(index, 1)}
              >
                <Icon name="arrow-down" />
                下移
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`删除第 ${index + 1} 项`}
                onClick={() => update({ ...plan, orders: plan.orders.filter((_, i) => i !== index) })}
              >
                <Icon name="x" />
                删除
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!!errors.length && (
        <div role="alert" className="market-error">
          <strong>请修正输入后计算</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanResult({ result, name }: { result: MarketResult; name: string }) {
  const [page, setPage] = useState(0);
  if (result.errors.length) return null;
  const failure = result.failure,
    pageCount = Math.ceil(result.trades.length / PAGE_SIZE);
  return (
    <section className="market-panel" aria-labelledby="market-result-title" data-testid="market-result">
      <h2 id="market-result-title">方案 {name} 的预算明细</h2>
      {failure && (
        <div role="alert" className="market-error" data-testid="market-failure">
          <strong>
            第 {failure.order} 项的第 {failure.lot} 笔无法成交
          </strong>
          <p>
            {RES_ZH[failure.resource]}需要 <span className="market-number">{number(failure.needed)}</span>，现有{' '}
            <span className="market-number">{number(failure.available)}</span>，缺少{' '}
            <span className="market-number">{number(failure.needed - failure.available)}</span>。本笔及后续操作已停止预算推演，以下仅显示此前可执行部分。
          </p>
        </div>
      )}
      <h3>预计库存</h3>
      <dl className="market-stock">
        {STOCK_RESOURCES.map((resource) => (
          <div key={resource}>
            <dt>{RES_ZH[resource]}</dt>
            <dd>{number(result.stock[resource])}</dd>
          </div>
        ))}
      </dl>
      <h3>下一笔报价（估算）</h3>
      <div className="market-quotes">
        {MARKET_RESOURCES.map((resource) => (
          <div key={resource}>
            <h4>{RES_ZH[resource]}</h4>
            <p>
              手续费前基价 <strong className="market-number">{number(result.quotes[resource].base)}</strong>
            </p>
            <p>
              买入 <strong className="market-number">{number(result.quotes[resource].buy)} 金</strong> / 卖出{' '}
              <strong className="market-number">{number(result.quotes[resource].sell)} 金</strong>
            </p>
          </div>
        ))}
      </div>
      <p className="note">每笔 {MARKET_DATA.engine.lot} 资源；报价含手续费。以下为预算模型成交价。</p>
      {!result.trades.length ? (
        <p>暂无可执行交易。</p>
      ) : (
        <>
          <table className="market-ledger">
            <caption>逐笔预计收支与库存</caption>
            <thead>
              <tr>
                <th scope="col">操作 / 笔</th>
                <th scope="col">交易</th>
                <th scope="col">黄金变化</th>
                <th scope="col">预计库存</th>
                <th scope="col">该资源下一笔报价</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((trade, i) => (
                <tr key={i}>
                  <td data-label="操作 / 笔">
                    {trade.order} / {trade.lot}
                  </td>
                  <td data-label="交易">
                    {trade.direction === 'buy' ? '买入' : '卖出'}
                    {MARKET_DATA.engine.lot}
                    {RES_ZH[trade.resource]}
                  </td>
                  <td data-label="黄金变化">{signed(trade.gold)}</td>
                  <td data-label="预计库存">
                    <span className="market-inventory">
                      {STOCK_RESOURCES.map((resource) => (
                        <span key={resource}>
                          {RES_ZH[resource]} {number(trade.stock[resource])}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td data-label="下一笔报价">
                    <span>
                      买 {number(trade.next.buy)} / 卖 {number(trade.next.sell)}
                    </span>
                    <small>基价 {number(trade.next.base)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <nav className="market-pagination" aria-label="交易明细分页">
              <button className="btn" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span className="market-number">
                {page + 1} / {pageCount} 页
              </span>
              <button className="btn" type="button" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
                下一页
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
