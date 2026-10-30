import { Icon } from '../../../src/shared/ui/Icon';
import { AGE_ZH, RES_ZH } from '../../../src/domain/ratings';
import { Go, Notice, productHref, num, type ViewProps } from './ui';
import { encodeEcoPayoff, payoffAvailable, PAYOFF_RESOURCES } from '../../../src/domain/ecoPayoff';
import { clock } from './ui';

export function PayoffView({ model, ctx, state, write, updatePayoff, applyTheory, stageLink }: ViewProps) {
  const { config, own, unit, row, payoff, eligible, payoffResult, result } = model;
  return (
    <>
      <section className="source-strip">
        <div>
          <Icon name="arrow-left" />
          <div>
            <strong>来自你的生产方案</strong>
            <p className="muted small">
              {own.zh} · {AGE_ZH[config.age]} · {unit?.zh} · <span className="num">{row.count} 座</span>生产建筑
            </p>
          </div>
        </div>
        {stageLink(
          'production',
          <>
            返回原方案 <Go />
          </>,
          'button secondary',
        )}
      </section>
      <div className="content-grid">
        <section className="panel settings">
          <h2>先确认带入条件</h2>
          <div className="carried">
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
          <Notice>木金石距离沿用原方案；农田距离不带入，食物投入按收益工具的固定农田基准折算。选用人数后按此假设估算。</Notice>
          <label>
            要核对的科技
            <select value={payoff.target} onChange={(event) => updatePayoff({ target: +event.currentTarget.value })}>
              {!eligible.some((t) => t.id === payoff.target) && <option value={payoff.target}>请选择可用科技</option>}
              {eligible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.zh}
                  {t.pre && !payoff.known.includes(t.pre) ? '（需先确认前置）' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="people-choice">
            <h3>用于估算的村民从哪里来？</h3>
            <p className="muted small">理论供给人数不代表你当前实际拥有的村民。</p>
            <button className="button secondary full" disabled={!!result.errors.length} onClick={applyTheory}>
              <Icon name="calculator" />
              使用原方案的理论供给人数
            </button>
            <button
              className="text-link"
              onClick={() => write({ ...state, people: 'manual', payoff: { ...payoff, workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' } } })}
            >
              我来填写实际人数 <Go />
            </button>
          </div>
          {state.people !== 'none' && (
            <>
              <p className="small provenance">
                <Icon name="info" />
                {state.people === 'theory'
                  ? '正在使用理论供给人数作为假设'
                  : state.people === 'adjusted'
                    ? '正在使用手动调整的供给假设'
                    : '正在使用你填写的人数'}
              </p>
              <div className="field-grid workers">
                {PAYOFF_RESOURCES.map((resource) => (
                  <label key={resource}>
                    {RES_ZH[resource]}村民
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={payoff.workers[resource]}
                      onChange={(event) =>
                        write({
                          ...state,
                          people: state.people === 'theory' || state.people === 'adjusted' ? 'adjusted' : 'manual',
                          payoff: { ...payoff, workers: { ...payoff.workers, [resource]: event.currentTarget.value } },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <details className="conditions">
                <summary>已完成科技与观察时长</summary>
                <div className="tech-choices">
                  {payoffAvailable(ctx, config)
                    .filter((t) => t.id !== payoff.target)
                    .map((t) => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          checked={payoff.known.includes(t.id)}
                          onChange={(event) =>
                            updatePayoff({ known: event.currentTarget.checked ? [...payoff.known, t.id] : payoff.known.filter((id) => id !== t.id) })
                          }
                        />
                        {t.zh}
                      </label>
                    ))}
                </div>
                <label>
                  观察时长（游戏分钟）
                  <input type="number" min="1" max="120" value={payoff.minutes} onChange={(event) => updatePayoff({ minutes: event.currentTarget.value })} />
                </label>
              </details>
            </>
          )}
        </section>
        <section className="panel result-panel" aria-label="经济科技收益结果">
          <div className="section-heading">
            <h2>这项投入带来了什么</h2>
            <span className="pill subtle">固定人数估算</span>
          </div>
          {state.people === 'none' ? (
            <div className="empty-state">
              <Icon name="users" />
              <h3>还需要确认村民人数</h3>
              <p className="muted">选择理论供给人数，或填入实际人数后，再查看收益。</p>
            </div>
          ) : payoffResult.errors.length ? (
            <div className="error-list" role="alert">
              {payoffResult.errors.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          ) : (
            <>
              <p className="muted">
                {payoffResult.target?.zh} ·{' '}
                {payoffResult.state === 'free' ? '自动免费，已获得' : payoffResult.state === 'already' ? '已经研究，无新增投入' : '等采集投入平衡时间'}
              </p>
              <div className="hero-number">
                <span className="num">{payoffResult.balance === null ? '暂无' : clock(payoffResult.balance)}</span>
                <div>
                  {payoffResult.balance === null ? '有限平衡时间' : '游戏时间'}
                  <p className="muted small">{payoffResult.complete ? '按当前模型支持的机制估算' : '机制尚未完整核实，仅展示已支持部分'}</p>
                </div>
              </div>
              <div className="payoff-resources">
                {payoffResult.resources
                  .filter((resource) => resource.cost || resource.gainPerMinute)
                  .map((resource) => (
                    <div key={resource.key}>
                      <span>{RES_ZH[resource.key]}</span>
                      <span className="num">投入 {num(resource.cost)}</span>
                      <strong className="num">每分钟增量 {num(resource.gainPerMinute)}</strong>
                    </div>
                  ))}
              </div>
              <Notice>人数在估算中保持不变。平衡时间只描述等采集投入，不代表实战中的最佳研究时机。</Notice>
              {!!payoffResult.warnings.length && <Notice icon="triangle-alert">{payoffResult.warnings[0]} 全部限制可在下方展开。</Notice>}
              <a className="text-link" href={productHref('/eco-payoff?' + encodeEcoPayoff(payoff))}>
                在现有收益工具中查看完整结果 <Go />
              </a>
            </>
          )}
        </section>
      </div>
    </>
  );
}
