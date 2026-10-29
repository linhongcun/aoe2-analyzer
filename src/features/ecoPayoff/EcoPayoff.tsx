import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import { Loading } from '../../shared/ui/widgets';
import { Breadcrumbs } from '../../shared/ui/layout';
import { CalcDock } from '../../shared/ui/CalcDock';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import { fmtClock } from '../../domain/realCost';
import {
  calculateEcoPayoff,
  decodeEcoPayoff,
  DEFAULT_PAYOFF,
  encodeEcoPayoff,
  payoffAvailable,
  PAYOFF_RESOURCES,
  PAYOFF_TARGETS,
  type EcoPayoffConfig,
  type EcoPayoffResult,
} from '../../domain/ecoPayoff';
import type { ProductionContext } from '../../domain/production';
import { useShareLink } from '../../shared/ui/useShareLink';
import './eco-payoff.css';

const number = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
function payoffLead(result: EcoPayoffResult) {
  const name = result.target?.zh ?? '这项科技';
  if (result.state === 'free') return `${name}：自动免费，已获得。`;
  if (result.state === 'already') return `${name}：已研究，无新增投入。`;
  if (!result.complete) return `${name}：机制未完整核实，下面只展示已支持部分。`;
  if (result.balance === null) return `${name}：暂无有限的等采集平衡时间。`;
  return name;
}
export default function EcoPayoff() {
  const core = useCore(),
    trees = useTrees(),
    location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeEcoPayoff(location.search), [location.search]);
  const {
    copy: copyLink,
    status,
    manualLink,
    reset: resetShare,
  } = useShareLink({
    stateKey: JSON.stringify([location.search, decoded.config]),
    successMessage: '方案链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方方案链接。',
  });
  if (!core || !trees)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const write = (config: EcoPayoffConfig) => {
    resetShare();
    navigate({ pathname: '/eco-payoff', search: '?' + encodeEcoPayoff(config) }, { replace: true });
  };
  const update = (config: EcoPayoffConfig) => {
    if (decoded.errors.length) return;
    write(config);
  };
  const reset = () => write({ ...DEFAULT_PAYOFF, workers: { ...DEFAULT_PAYOFF.workers } });
  const copy = async () => {
    await copyLink(() => {
      const url = new URL(window.location.href);
      url.hash = '/eco-payoff?' + encodeEcoPayoff(decoded.config);
      return url.href;
    });
  };
  return (
    <EcoPayoffBody
      ctx={{ core, trees }}
      config={decoded.config}
      parseErrors={decoded.errors}
      update={update}
      reset={reset}
      copy={copy}
      shared={status ? { text: status, link: manualLink } : null}
    />
  );
}

function EcoPayoffBody({
  ctx,
  config,
  parseErrors,
  update,
  reset,
  copy,
  shared,
}: {
  ctx: ProductionContext;
  config: EcoPayoffConfig;
  parseErrors: string[];
  update: (c: EcoPayoffConfig) => void;
  reset: () => void;
  copy: () => Promise<void>;
  shared: { text: string; link: string } | null;
}) {
  const result = calculateEcoPayoff(ctx, config),
    available = payoffAvailable(ctx, config);
  const errors = [...parseErrors, ...result.errors];
  const groups = [...new Set(available.map((t) => t.bz.replace(/\n/g, '')))];
  return (
    <section className="pane eco-payoff" data-testid="eco-payoff-page">
      <Breadcrumbs />
      <header className="eco-heading">
        <div>
          <h1>经济科技收益</h1>
          <p className="note">固定人数与采集条件，对比现在研究一项科技带来的投入和增量。</p>
        </div>
        <Link className="ulink" to="/production">
          持续生产工具
        </Link>
      </header>
      <CalcDock
        note={shared?.text}
        resultId="eco-result"
        actions={[
          { label: '复制方案链接', icon: 'copy', disabled: parseErrors.length > 0, onClick: () => void copy() },
          { label: '重置方案', onClick: reset },
        ]}
      />
      <p className="eco-lead" data-testid="eco-lead">
        {errors.length ? (
          '当前方案无法计算，请先修正或重置。'
        ) : result.balance !== null && result.state === 'ready' && result.complete ? (
          <>
            {payoffLead(result)}：从现在起约 <span className="eco-number">{fmtClock(result.balance)}</span>。
          </>
        ) : (
          payoffLead(result)
        )}
      </p>
      {shared?.link && (
        <label className="eco-manual">
          方案链接
          <input readOnly value={shared.link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {parseErrors.length > 0 && <p className="note">链接格式有误，设置暂时锁定。请重置方案后重新配置。</p>}
      <p className="eco-boundary">首版评估伐木、采金、采石的一次升级；不计算人口增长、资源耗尽、农田补种、TC 停产或军事风险。所有时长为游戏时间。</p>

      <div className="eco-columns">
        <fieldset className="eco-settings" disabled={parseErrors.length > 0}>
          <section className="eco-card">
            <h2>研究方案</h2>
            <div className="eco-form-grid">
              <label>
                文明
                <select aria-label="收益文明" value={config.civ} onChange={(e) => update({ ...config, civ: e.target.value })}>
                  {!civs.some((c) => c.en === config.civ) && <option value={config.civ}>无效文明：{config.civ}</option>}
                  {civs.map((c) => (
                    <option key={c.en} value={c.en}>
                      {c.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                时代
                <select aria-label="收益时代" value={config.age} onChange={(e) => update({ ...config, age: +e.target.value })}>
                  {![1, 2, 3, 4].includes(config.age) && <option value={config.age}>无效时代</option>}
                  {[1, 2, 3, 4].map((a) => (
                    <option key={a} value={a}>
                      {AGE_ZH[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="eco-full">
                待研究科技
                <select aria-label="待研究科技" value={config.target} onChange={(e) => update({ ...config, target: +e.target.value })}>
                  {!PAYOFF_TARGETS.some((id) => id === config.target) && <option value={config.target}>无效科技：{config.target}</option>}
                  {PAYOFF_TARGETS.map((id) => (
                    <option key={id} value={id} disabled={!available.some((t) => t.id === id)}>
                      {ctx.core.techById[id]?.zh}
                      {!available.some((t) => t.id === id) ? '（当前不可用）' : result.free.has(id) ? '（自动免费）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                观察时长（分钟）
                <input aria-label="观察时长" inputMode="decimal" value={config.minutes} onChange={(e) => update({ ...config, minutes: e.target.value })} />
              </label>
              <label>
                木金石单程距离（格）
                <input
                  aria-label="收益单程距离"
                  inputMode="decimal"
                  value={config.distance}
                  onChange={(e) => update({ ...config, distance: e.target.value })}
                />
              </label>
            </div>
          </section>
          <section className="eco-card">
            <h2>固定村民人数</h2>
            <div className="eco-form-grid">
              {PAYOFF_RESOURCES.map((r) => (
                <label key={r}>
                  {RES_ZH[r]}
                  <input
                    aria-label={`${RES_ZH[r]}村民数`}
                    inputMode="numeric"
                    value={config.workers[r]}
                    onChange={(e) => update({ ...config, workers: { ...config.workers, [r]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            <p className="note">每项 0–200 人；人数固定，不计建造和走动干扰。食物基准按贴近磨坊的农田计算，仅用于静态劳动量折算。</p>
          </section>
          <section className="eco-card">
            <h2>已研究科技</h2>
            <p className="note">明确勾选已有科技。缺前置时停止计算，不自动补研究队列。推车仅作为已完成条件；其费用和 TC 占用不在本次比较中。</p>
            <button type="button" className="btn" onClick={() => update({ ...config, known: [] })}>
              清空手动选择
            </button>
            {groups.map((group) => (
              <fieldset className="eco-tech-group" key={group}>
                <legend>{group}</legend>
                {available
                  .filter((t) => t.bz.replace(/\n/g, '') === group)
                  .map((t) => (
                    <label className="eco-check" key={t.id}>
                      <input
                        type="checkbox"
                        aria-label={`已有${t.zh}`}
                        checked={result.known.has(t.id)}
                        disabled={result.free.has(t.id)}
                        onChange={() =>
                          update({ ...config, known: config.known.includes(t.id) ? config.known.filter((id) => id !== t.id) : [...config.known, t.id] })
                        }
                      />
                      <span>
                        {t.zh}
                        {result.free.has(t.id) && <small>免费，自动已有</small>}
                      </span>
                    </label>
                  ))}
              </fieldset>
            ))}
            {config.known.some((id) => !available.some((t) => t.id === id)) && (
              <button
                type="button"
                className="btn"
                onClick={() => update({ ...config, known: config.known.filter((id) => available.some((t) => t.id === id)) })}
              >
                清除不可用的已有科技
              </button>
            )}
          </section>
        </fieldset>
        <div className="eco-results calc-dock-target" id="eco-result" tabIndex={-1} aria-live="polite">
          {errors.length ? (
            <section className="eco-card eco-errors" role="alert">
              <h2>当前方案无法计算</h2>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <section className="eco-card">
                <h2>
                  {result.target?.zh}：{result.state === 'free' ? '自动免费，已获得' : result.state === 'already' ? '已研究，无新增投入' : '现在研究'}
                </h2>
                {result.state !== 'ready' && (
                  <p className="note" data-testid="eco-already">
                    基准已经拥有这项科技，不重复收费或计算增益。
                  </p>
                )}
                {!result.complete && (
                  <p className="eco-incomplete" data-testid="eco-incomplete">
                    该文明存在未完整计入的机制，以下为已支持部分；停止等采集时间平衡结论。
                  </p>
                )}
                <div className="eco-stat">
                  <span>研究用时</span>
                  <strong data-testid="eco-research-time">{number(result.time)} 秒</strong>
                </div>
                <h3>新增研究费用</h3>
                <div className="eco-costs">
                  {result.resources.map((r) => (
                    <span key={r.key}>
                      {RES_ZH[r.key]} <b data-testid={'eco-cost-' + r.key}>{number(r.cost)}</b>
                    </span>
                  ))}
                </div>
                {result.costNotes.length > 0 && <p className="note">科研修正：{result.costNotes.join('；')}</p>}
                <p className="note">研究期间村民照常采集；完成后才开始累计额外收入。</p>
              </section>
              <section className="eco-card">
                <h2>逐资源收入与增量</h2>
                <div className="eco-resource-grid">
                  {result.resources.map((r) => (
                    <article className="eco-resource" key={r.key} data-testid={'eco-resource-' + r.key}>
                      <h3>
                        {RES_ZH[r.key]} · <span className="eco-number">{r.workers} 人</span>
                      </h3>
                      <dl>
                        <div>
                          <dt>基准收入</dt>
                          <dd>{number(r.beforeIncome)} / 分钟</dd>
                        </div>
                        <div>
                          <dt>完成后收入</dt>
                          <dd>{number(r.afterIncome)} / 分钟</dd>
                        </div>
                        <div>
                          <dt>每分钟增量</dt>
                          <dd>{number(r.gainPerMinute)}</dd>
                        </div>
                        <div>
                          <dt>观察期累计增量</dt>
                          <dd data-testid={'eco-gain-' + r.key}>{number(r.gain)}</dd>
                        </div>
                      </dl>
                      <small>
                        单村民：{number(r.beforeRate * 60)} 至 {number(r.afterRate * 60)} / 分钟
                      </small>
                    </article>
                  ))}
                </div>
                <p className="note">累计增量是额外采集量，尚未扣除上方研究费用；各资源分别核对，不直接相加。</p>
              </section>
              <section className="eco-card">
                <h2>等采集时间收支平衡</h2>
                <p className="eco-balance" data-testid="eco-balance">
                  {!result.complete
                    ? '机制未完整核实，暂不提供'
                    : result.state !== 'ready'
                      ? '基准已拥有，无需再次计算'
                      : result.balance === null
                        ? '零人数或无增益，无有限平衡时间'
                        : `从现在起约 ${fmtClock(result.balance)}`}
                </p>
                <p className="note">这是一种静态村民劳动量估算，不是现金流回本、市场换算或实战建议。</p>
                {result.complete && (
                  <>
                    <div className="eco-stat">
                      <span>投入折合劳动量</span>
                      <b className="eco-number">{number(result.investment)} 村民秒</b>
                    </div>
                    <div className="eco-stat">
                      <span>观察期额外劳动量</span>
                      <b className="eco-number">{number(result.windowLabourGain)} 村民秒</b>
                    </div>
                  </>
                )}
                <details>
                  <summary>查看折算公式与限制</summary>
                  <p>
                    投入劳动量 = 各资源研究费用分别除以该资源基准单村民每秒速率，再合计。每秒收益劳动量 = 各资源每秒增量分别除以其基准单村民每秒速率，再合计。
                  </p>
                  <p>平衡时刻 = 研究用时 + 投入劳动量 ÷ 每秒收益劳动量。累计增量 = 完成后的每秒增量 × max(0，观察期秒数 − 研究用时)。</p>
                  <p>
                    食物按农田基准，不计播种、农田容量和补种木材。资源点不耗尽，不计人口增长、研究奖励、TC
                    机会成本、军压或战斗损失；推车的实战价值不由本页评判。
                  </p>
                </details>
              </section>
              {result.warnings.length > 0 && (
                <section className="eco-card eco-warnings">
                  <h2>具体未计入项</h2>
                  <ul>
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          <p className="note eco-source">
            数据：DE Update {__DATA_SOURCES__.patch.build}，固定游戏 .dat 导出。<Link to="/about-data">查看数据来源</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
