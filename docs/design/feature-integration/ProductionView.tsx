import { Icon } from '../../../src/shared/ui/Icon';
import { civs } from '../../../src/data';
import { productionBuildings } from '../../../src/domain/production';
import { AGE_ZH, RES_ZH } from '../../../src/domain/ratings';
import { Go, Notice, productHref, num, type ViewProps } from './ui';

export function ProductionView({ model, ctx, state, write, updateConfig, stageLink }: ViewProps) {
  const { config, result, row, unit, units, buildings, baseline, productionPath, tradePath } = model;
  return (
    <>
      <div className="content-grid">
        <section className="panel settings">
          <div className="section-heading">
            <h2>你的生产方案</h2>
            <span className="pill">可分享</span>
          </div>
          <div className="field-grid">
            <label>
              我的文明
              <select value={config.civ} onChange={(event) => updateConfig({ civ: event.currentTarget.value })}>
                {civs.map((c) => (
                  <option key={c.en} value={c.en}>
                    {c.zh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              时代
              <select value={config.age} onChange={(event) => updateConfig({ age: +event.currentTarget.value })}>
                {[1, 2, 3, 4].map((age) => (
                  <option key={age} value={age}>
                    {AGE_ZH[age]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label>
              训练单位
              <select
                value={row.unit}
                onChange={(event) => {
                  const nextUnit = ctx.core.unitById[+event.currentTarget.value]!;
                  updateConfig({ rows: [{ ...row, unit: nextUnit.id, building: productionBuildings(ctx, config, nextUnit)[0]! }] });
                }}
              >
                {!units.some((u) => u.id === row.unit) && <option value={row.unit}>{unit?.zh ?? row.unit}（当前不可用）</option>}
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.zh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              生产建筑数量
              <input
                type="number"
                min="0"
                max="100"
                value={row.count}
                onChange={(event) => updateConfig({ rows: [{ ...row, count: event.currentTarget.value }] })}
              />
            </label>
          </div>
          <label>
            生产建筑
            <select value={row.building} onChange={(event) => updateConfig({ rows: [{ ...row, building: +event.currentTarget.value }] })}>
              {!buildings.includes(row.building) && <option value={row.building}>原建筑当前不可用</option>}
              {buildings.map((id) => (
                <option key={id} value={id}>
                  {ctx.core.buildingById[id]?.zh ?? id}
                </option>
              ))}
            </select>
          </label>
          <details className="conditions">
            <summary>采集条件与已有科技</summary>
            <p className="muted">本原型未勾选可选科技；免费加成由原引擎处理。</p>
            <div className="field-grid">
              <label>
                木金石单程距离（格）
                <input type="number" min="0" max="10" value={config.walk} onChange={(event) => updateConfig({ walk: +event.currentTarget.value })} />
              </label>
              <label>
                农田单程距离（格）
                <input type="number" min="0" max="10" value={config.farm} onChange={(event) => updateConfig({ farm: +event.currentTarget.value })} />
              </label>
            </div>
          </details>
          <a className="text-link" href={productHref(productionPath)}>
            在现有工具中编辑完整方案 <Go />
          </a>
        </section>
        <section className="panel result-panel" aria-label="生产估算结果">
          <div className="section-heading">
            <h2>持续供给需要什么</h2>
            <span className="pill subtle">模型估算</span>
          </div>
          {result.errors.length ? (
            <div role="alert" className="error-list">
              {result.errors.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          ) : (
            <>
              <div className="hero-number">
                <span className="num">{result.total}</span>
                <div>
                  名村民<p className="muted small">各资源理论人数分别向上取整</p>
                </div>
              </div>
              {!!result.warnings.length && <Notice icon="triangle-alert">{result.warnings[0]} 全部限制可在下方展开。</Notice>}
              <div className="resource-grid">
                {result.resources.map((resource) => (
                  <div key={resource.key} className="resource-stat">
                    <span className="muted small">{RES_ZH[resource.key]}</span>
                    <strong className="num">
                      {resource.rounded}
                      <small> 人</small>
                    </strong>
                    <span className="muted small num">{num(resource.spend)} / 分钟</span>
                  </div>
                ))}
              </div>
              <div className="result-summary">
                <Icon name="factory" />
                <p>
                  {result.lines.map((line) => (
                    <span key={line.unit.id}>
                      每分钟约 <strong className="num">{num(line.perMinute)} 个</strong>
                      {line.unit.zh}。{' '}
                    </span>
                  ))}
                  持续训练，未计停产。
                </p>
              </div>
              <button className="compare-toggle" onClick={() => write({ ...state, compare: !state.compare })}>
                <Icon name="scale" />
                {state.compare ? '收起对照' : '对比少一座生产建筑的需求'}
                <Icon name={state.compare ? 'chevron-down' : 'chevron-right'} />
              </button>
              {state.compare && (
                <div className="comparison">
                  <div>
                    <span className="muted small">
                      当前 <span className="num">{row.count} 座</span>
                    </span>
                    <strong className="num">{result.total} 人</strong>
                  </div>
                  <div>
                    <span className="muted small">
                      对照 <span className="num">{Math.max(0, +row.count - 1)} 座</span>
                    </span>
                    <strong className="num">{baseline.total} 人</strong>
                  </div>
                  <p className="small muted">
                    两方案使用相同文明、时代与采集条件。人数差 <span className="num">{result.total - baseline.total} 人</span>。
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <section className="next-section">
        <div>
          <p className="eyebrow">继续分析这个方案</p>
          <h2>从一个数字，走到下一个问题</h2>
          <p className="muted">原方案随跳转保留，回来时继续原来的设置。</p>
        </div>
        <div className="next-grid">
          <article className="panel action-card">
            <Icon name="flask-conical" />
            <h3>研究经济科技有多少增量？</h3>
            <p className="muted">沿用文明与时代，再明确用于估算的村民人数。</p>
            {result.errors.length ? (
              <span className="muted">请先修正生产方案</span>
            ) : (
              stageLink(
                'payoff',
                <>
                  带着方案核对收益 <Go />
                </>,
                'text-link',
              )
            )}
          </article>
          <article className="panel action-card">
            <Icon name="git-branch" />
            <h3>黄金还有哪些供给方式？</h3>
            <p className="muted">现有商路工具已支持带入生产金耗和返回原方案。</p>
            {result.errors.length ? (
              <span className="muted">请先修正生产方案</span>
            ) : (
              <a className="text-link" href={productHref(tradePath)}>
                查看现有商路工具 <Go />
              </a>
            )}
          </article>
          <article className="panel action-card">
            <Icon name="book-open" />
            <h3>确认兵种与科技条件</h3>
            <p className="muted">保留当前文明与时代，回到选定单位继续核对。</p>
            {stageLink(
              'unit',
              <>
                查看当前单位 <Go />
              </>,
              'text-link',
            )}
          </article>
        </div>
      </section>
    </>
  );
}
