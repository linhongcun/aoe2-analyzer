import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import { encodeProduction, type ProductionContext } from '../../domain/production';
import {
  calculateTradeIncome,
  decodeTradeIncome,
  encodeTradeIncome,
  newTradeIncomeConfig,
  tradeIncomeUnits,
  TRADE_INCOME_RES,
  TRADE_INCOME_UNITS,
  type TradeIncomeConfig,
} from '../../domain/tradeIncome';
import { Breadcrumbs } from '../../shared/ui/layout';
import { Loading } from '../../shared/ui/widgets';
import { Icon } from '../../shared/ui/Icon';
import { GameClockLink } from '../../shared/ui/GameClockLink';
import './trade-income.css';

const number = (n: number) =>
  n.toLocaleString(
    'zh-CN',
    n !== 0 && (Math.abs(n) >= 1e9 || Math.abs(n) < 0.01) ? { notation: 'scientific', maximumFractionDigits: 4 } : { maximumFractionDigits: 2 },
  );
export default function TradeIncome() {
  const core = useCore(),
    trees = useTrees(),
    location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeTradeIncome(location.search), [location.search]);
  // Invalid in-progress input stays editable and is never serialized as a valid share link.
  const [draft, setDraft] = useState<{ search: string; config: TradeIncomeConfig } | null>(null);
  const [shared, setShared] = useState<{ key: string; text: string; link: string } | null>(null);
  const config = draft?.search === location.search ? draft.config : decoded.config;
  if (!core || !trees)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const ctx = { core, trees };
  const result = calculateTradeIncome(ctx, config);
  const write = (next: TradeIncomeConfig) => {
    setDraft(null);
    navigate({ pathname: '/trade-income', search: '?' + encodeTradeIncome(next) }, { replace: true });
  };
  const update = (next: TradeIncomeConfig) => {
    if (decoded.errors.length) return;
    setShared(null);
    if (decodeTradeIncome(encodeTradeIncome(next)).errors.length) setDraft({ search: location.search, config: next });
    else write(next);
  };
  const copy = async () => {
    const url = new URL(window.location.href);
    url.hash = '/trade-income?' + encodeTradeIncome(config);
    const key = encodeTradeIncome(config);
    try {
      await navigator.clipboard.writeText(url.href);
      setShared({ key, text: '方案链接已复制。', link: '' });
    } catch {
      setShared({ key, text: '自动复制失败，请手动复制下方方案链接。', link: url.href });
    }
  };
  return (
    <TradeIncomeBody
      ctx={ctx}
      config={config}
      parseErrors={decoded.errors}
      update={update}
      reset={() => write(newTradeIncomeConfig())}
      copy={copy}
      shared={shared?.key === encodeTradeIncome(config) ? shared : null}
      result={result}
    />
  );
}

function TradeIncomeBody({
  ctx,
  config: c,
  parseErrors,
  update,
  reset,
  copy,
  shared,
  result: r,
}: {
  ctx: ProductionContext;
  config: TradeIncomeConfig;
  parseErrors: string[];
  update: (c: TradeIncomeConfig) => void;
  reset: () => void;
  copy: () => Promise<void>;
  shared: { text: string; link: string } | null;
  result: ReturnType<typeof calculateTradeIncome>;
}) {
  const errors = [...parseErrors, ...r.errors];
  const available = tradeIncomeUnits(ctx, c);
  const field = (key: 'gold' | 'cycle' | 'count' | 'target', label: string, whole = false) => (
    <label>
      {label}
      <input aria-label={label} inputMode={whole ? 'numeric' : 'decimal'} value={c[key]} onChange={(e) => update({ ...c, [key]: e.target.value })} />
    </label>
  );
  const baseline = () => {
    const price = calculateTradeIncome(ctx, { ...c, priceMode: 'baseline' }).cost;
    update({ ...c, priceMode: 'manual', prices: Object.fromEntries(TRADE_INCOME_RES.map((k) => [k, String(price[k] ?? 0)])) as TradeIncomeConfig['prices'] });
  };
  return (
    <section className="pane trade-income" data-testid="trade-income-page">
      <Breadcrumbs />
      <header className="trade-income-heading">
        <div>
          <h1>商路供给规划</h1>
          <p className="note">用本局实测交金与完整周期，规划持续补兵所需的贸易车船。</p>
        </div>
        <Link className="ulink" to="/production">
          持续生产工具
        </Link>
      </header>
      <div className="trade-income-actions">
        <button className="btn" type="button" disabled={errors.length > 0} onClick={() => void copy()}>
          <Icon name="copy" />
          复制方案链接
        </button>
        <button className="btn" type="button" onClick={reset}>
          重置方案
        </button>
      </div>
      {shared && (
        <p role="status" className="note">
          {shared.text}
        </p>
      )}
      {shared?.link && (
        <label className="trade-income-manual">
          方案链接
          <input readOnly value={shared.link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {parseErrors.length > 0 && <p className="trade-income-warning">链接格式有误，设置已锁定。请重置方案后重新配置。</p>}
      <p className="trade-income-boundary">默认数字只是用户测量示例，不是游戏固定收益。所有时间均为游戏时间；本工具不自动估算路线、拥堵或骚扰。</p>
      <div className="trade-income-columns">
        <fieldset className="trade-income-settings" disabled={parseErrors.length > 0}>
          <section className="trade-income-card">
            <h2>本局贸易条件</h2>
            <div className="trade-income-form">
              <label>
                文明
                <select aria-label="贸易文明" value={c.civ} onChange={(e) => update({ ...c, civ: e.target.value })}>
                  {!civs.some((v) => v.en === c.civ) && <option value={c.civ}>无效文明</option>}
                  {civs.map((v) => (
                    <option key={v.en} value={v.en}>
                      {v.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                时代
                <select aria-label="贸易时代" value={c.age} onChange={(e) => update({ ...c, age: +e.target.value })}>
                  {![1, 2, 3, 4].includes(c.age) && <option value={c.age}>无效时代</option>}
                  {[1, 2, 3, 4].map((a) => (
                    <option key={a} value={a}>
                      {AGE_ZH[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="trade-income-full">
                贸易单位
                <select aria-label="贸易单位" value={c.unit} onChange={(e) => update({ ...c, unit: +e.target.value })}>
                  {!(TRADE_INCOME_UNITS as readonly number[]).includes(c.unit) && <option value={c.unit}>无效单位</option>}
                  {TRADE_INCOME_UNITS.map((id) => (
                    <option key={id} value={id} disabled={!available.some((u) => u.id === id)}>
                      {ctx.core.unitById[id]?.zh}
                      {available.some((u) => u.id === id) ? '' : '（当前不可用）'}
                    </option>
                  ))}
                </select>
              </label>
              {field('gold', '每次实际交金量')}
              {field('cycle', '完整周期（游戏秒）')}
              {field('count', '当前车船数量', true)}
            </div>
            <p className="note">
              完整周期是同一交金点两次连续交金之间的时间，包含往返和装卸；不能填写单程时间或首趟启动时间。例如连续交金发生在游戏时间{' '}
              <span className="trade-income-number">10:00</span> 和 <span className="trade-income-number">12:00</span>，周期填{' '}
              <span className="trade-income-number">120 秒</span>。
            </p>
            <p className="note">实测交金与周期已包含篷车科技、文明、队伍及路线效果，本页不会再次叠加。条件变化后请重新测量；附带食物收入不计入。</p>
            {errors.length === 0 && <GameClockLink seconds={Number(c.cycle)} label="换算这段贸易周期" />}
          </section>
          <section className="trade-income-card">
            <h2>目标黄金消耗</h2>
            <p className="note">当前来源：{c.targetMode === 'production' ? '原生产方案的持续训练金耗' : '手动填写的黄金需求'}。</p>
            {c.targetMode === 'production' ? (
              <>
                {r.production ? (
                  <div className="trade-income-production">
                    <p>
                      {civs.find((v) => v.en === r.production!.civ)?.zh} · {AGE_ZH[r.production.age]} ·{' '}
                      <span className="trade-income-number">{r.production.rows.length} 条生产需求</span>
                    </p>
                    <Link className="ulink" to={'/production?' + encodeProduction(r.production)}>
                      查看原生产方案
                    </Link>
                  </div>
                ) : (
                  <p className="trade-income-warning">原生产方案损坏或不可用，目标已暂停；贸易条件的编辑不会清除该错误。</p>
                )}
                <button
                  className="btn"
                  type="button"
                  onClick={() => update({ ...c, targetMode: 'manual', source: '', target: r.target === null ? c.target : String(r.target) })}
                >
                  显式切换手动目标
                </button>
              </>
            ) : (
              <>
                {field('target', '目标黄金／游戏分钟')}
                <Link className="ulink trade-income-source-link" to="/production">
                  到持续生产工具带入方案
                </Link>
              </>
            )}
          </section>
          <section className="trade-income-card">
            <h2>投资单价</h2>
            <label className="trade-income-label">
              价格来源
              <select
                aria-label="贸易单价来源"
                value={c.priceMode}
                onChange={(e) => (e.target.value === 'manual' ? baseline() : update({ ...c, priceMode: 'baseline' }))}
              >
                <option value="baseline">固定基础价及已核常驻折扣</option>
                <option value="manual">手填本局实际单价</option>
              </select>
            </label>
            <p className="note">
              基线仅计现有模型已核常驻折扣，未计降价科技或盟友造价折扣。选择文明或时代不代表已研究意大利等文明的降价科技；如本局价格不同，请手填。
            </p>
            {c.priceMode === 'manual' && (
              <>
                <div className="trade-income-form">
                  {TRADE_INCOME_RES.map((res) => (
                    <label key={res}>
                      {RES_ZH[res]}单价
                      <input
                        aria-label={`${RES_ZH[res]}单价`}
                        inputMode="decimal"
                        value={c.prices[res]}
                        onChange={(e) => update({ ...c, prices: { ...c.prices, [res]: e.target.value } })}
                      />
                    </label>
                  ))}
                </div>
                <label className="trade-income-label">
                  实际单价来源
                  <input
                    aria-label="实际单价来源"
                    maxLength={200}
                    value={c.priceSource}
                    placeholder="例如：本局生产面板，已研究相关科技"
                    onChange={(e) => update({ ...c, priceSource: e.target.value })}
                  />
                </label>
                <p className="note">确定免费才填 0；未知价格请先核对。各项为单个车船的实际资源费用。</p>
                <p className="trade-income-warning">手填价不随文明、时代或单位选择自动变化；更换选择后请重新核对实际单价和来源。</p>
              </>
            )}
          </section>
        </fieldset>
        <div className="trade-income-results" aria-live="polite">
          {errors.length > 0 ? (
            <section className="trade-income-card trade-income-error" role="alert">
              <h2>当前方案无法计算</h2>
              <ul>
                {[...new Set(errors)].map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <section className="trade-income-card trade-income-summary">
                <h2>黄金供需</h2>
                <dl>
                  <div>
                    <dt>单个车船收入</dt>
                    <dd data-testid="trade-single">{number(r.single!)} 金／分钟</dd>
                  </div>
                  <div>
                    <dt>当前总收入</dt>
                    <dd data-testid="trade-total">{number(r.total!)} 金／分钟</dd>
                  </div>
                  <div>
                    <dt>目标消耗</dt>
                    <dd data-testid="trade-target">{number(r.target!)} 金／分钟</dd>
                  </div>
                  <div>
                    <dt>供需差额</dt>
                    <dd data-testid="trade-balance" className={r.balance! < 0 ? 'trade-income-deficit' : 'trade-income-surplus'}>
                      {r.balance! >= 0 ? '+' : ''}
                      {number(r.balance!)} 金／分钟
                    </dd>
                  </div>
                </dl>
                <p className="trade-income-needed" data-testid="trade-needed">
                  {r.needed === null ? (
                    '当前单个车船零收入，正目标无解'
                  ) : (
                    <>
                      目标所需 <strong className="trade-income-number">{number(r.needed)} 个</strong>
                    </>
                  )}
                </p>
                {r.additional !== null && (
                  <p className="note">
                    相对当前数量，还需增加{' '}
                    <span className="trade-income-number" data-testid="trade-additional">
                      {number(r.additional)} 个
                    </span>
                    。
                  </p>
                )}
                <p className="note">按目标金耗除以单个收入向上取整。总量假设每个车船都达到相同实测速率；扩容后出现拥堵须重新测量。</p>
              </section>
              <section className="trade-income-card">
                <h2>资源投资与人口</h2>
                <div className="trade-income-costs">
                  {TRADE_INCOME_RES.map((res) => (
                    <article key={res}>
                      <h3>{RES_ZH[res]}</h3>
                      <dl>
                        <div>
                          <dt>单个费用</dt>
                          <dd data-testid={'trade-cost-' + res}>{number(r.cost[res] ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>当前总投资</dt>
                          <dd data-testid={'trade-investment-' + res}>{number(r.investment[res] ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>目标数量总投资</dt>
                          <dd>{r.neededInvestment === null ? '无有限方案' : number(r.neededInvestment[res] ?? 0)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
                {r.costNotes.length > 0 && <p className="note">单价依据：{r.costNotes.join('；')}</p>}
                <dl className="trade-income-population">
                  <div>
                    <dt>单个所占人口</dt>
                    <dd>{r.populationEach === null ? '未核实' : number(r.populationEach)}</dd>
                  </div>
                  <div>
                    <dt>当前所占人口</dt>
                    <dd data-testid="trade-population">{r.currentPopulation === null ? '未核实' : number(r.currentPopulation)}</dd>
                  </div>
                  <div>
                    <dt>目标数量所占人口</dt>
                    <dd>{r.neededPopulation === null ? '无可用结果' : number(r.neededPopulation)}</dd>
                  </div>
                </dl>
                <p className="note">木材、黄金等分别列出，不能相加当作黄金成本或黄金回本时间。这里显示车船造价，未计市场／船坞、科技、行程启动及补损成本。</p>
              </section>
              {r.warnings.length > 0 && (
                <section className="trade-income-card trade-income-warning">
                  <h2>具体未计入项</h2>
                  <ul>
                    {r.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          <section className="trade-income-card">
            <h2>计算口径</h2>
            <details>
              <summary>查看公式与限制</summary>
              <p>单个黄金／游戏分钟 = 每次实际交金量 × 60 ÷ 完整周期。当前总收入 = 单个收入 × 当前数量。供需差额 = 当前总收入 − 目标消耗。</p>
              <p>目标为零时所需数量为零；单个收入为零且目标大于零时无解。不预测寻路、路线距离、拥堵、盟友行为、市场资源买卖或战斗胜率。</p>
            </details>
            <p className="note">大于等于十亿或非零且小于 0.01 的结果采用科学计数法显示，数量按完整精度向上取整。</p>
            <p className="note">
              费用与可训练性复用本站固定 DE185872 单位及生产模型；人口来自固定 .dat 导出。收益由用户测量，软件校验不代表客户端实测。
              <Link to="/about-data">查看数据来源</Link>
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
