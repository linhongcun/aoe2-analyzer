import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import { Loading } from '../../shared/ui/widgets';
import { Icon } from '../../shared/ui/Icon';
import { CostView } from '../../shared/ui/art';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import {
  BUILDING_LIMIT,
  DEFAULT_PRODUCTION,
  PRODUCTION_LIMIT,
  calculateProduction,
  decodeProduction,
  effectiveProductionTechs,
  encodeProduction,
  freeProductionTechs,
  productionBuildings,
  productionTechs,
  productionUnits,
  toggleProductionTech,
  type ProductionConfig,
  type ProductionContext,
  type ProductionRow,
} from '../../domain/production';
import './production.css';

const num = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export default function Production() {
  const core = useCore(),
    trees = useTrees(),
    location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeProduction(location.search), [location.search]);
  const config = decoded.config;
  const context = useMemo(() => (core && trees ? { core, trees } : null), [core, trees]);
  const [shareStatus, setShareStatus] = useState(''),
    [manualLink, setManualLink] = useState('');
  if (!context)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const update = (next: ProductionConfig) => {
    navigate({ pathname: '/production', search: '?' + encodeProduction(next) }, { replace: true });
    setShareStatus('');
    setManualLink('');
  };
  return (
    <ProductionBody
      context={context}
      config={config}
      linkErrors={decoded.errors}
      update={update}
      shareStatus={shareStatus}
      manualLink={manualLink}
      share={async () => {
        const url = new URL(window.location.href);
        url.hash = '/production?' + encodeProduction(config);
        try {
          await navigator.clipboard.writeText(url.href);
          setShareStatus('链接已复制，包含当前全部设置。');
          setManualLink('');
        } catch {
          setShareStatus('自动复制失败，请手动复制下方链接。');
          setManualLink(url.href);
        }
      }}
    />
  );
}

function ProductionBody({
  context: ctx,
  config,
  linkErrors,
  update,
  share,
  shareStatus,
  manualLink,
}: {
  context: ProductionContext;
  config: ProductionConfig;
  linkErrors: string[];
  update: (next: ProductionConfig) => void;
  share: () => Promise<void>;
  shareStatus: string;
  manualLink: string;
}) {
  const result = calculateProduction(ctx, config);
  const units = productionUnits(ctx, config),
    available = productionTechs(ctx, config),
    free = freeProductionTechs(ctx, config);
  const errors = [...linkErrors, ...result.errors];
  const selected = effectiveProductionTechs(ctx, config);
  const groups = [...new Set(available.map((t) => t.bz.replace(/\n/g, '')))];
  const editRow = (index: number, fields: Partial<ProductionRow>) =>
    update({ ...config, rows: config.rows.map((r, i) => (i === index ? { ...r, ...fields } : r)) });
  return (
    <section className="pane production-page" data-testid="production-page">
      <header className="production-heading">
        <div>
          <h1>持续生产</h1>
          <p className="note">从专用生产建筑反推每分钟开销与村民分配。时间均为游戏时间。</p>
        </div>
        <Link className="btn" to="/market">
          市场买卖预算
        </Link>
        <button type="button" className="btn" disabled={linkErrors.length > 0} onClick={() => void share()}>
          <Icon name="copy" />
          复制方案链接
        </button>
      </header>
      {linkErrors.length > 0 && <p className="note">请先修正链接错误，再复制方案。</p>}
      {shareStatus && (
        <p className="note" role="status">
          {shareStatus}
        </p>
      )}
      {manualLink && (
        <label className="production-manual">
          方案链接
          <input readOnly value={manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <div className="production-settings">
        <label>
          文明
          <select aria-label="生产文明" value={config.civ} onChange={(e) => update({ ...config, civ: e.target.value })}>
            {civs.map((c) => (
              <option key={c.en} value={c.en}>
                {c.zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          时代
          <select aria-label="生产时代" value={config.age} onChange={(e) => update({ ...config, age: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((a) => (
              <option key={a} value={a}>
                {AGE_ZH[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          木金石单程距离
          <select aria-label="木金石单程距离" value={config.walk} onChange={(e) => update({ ...config, walk: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 7, 10].map((d) => (
              <option key={d} value={d}>
                {d} 格
              </option>
            ))}
          </select>
        </label>
        <label>
          农田单程距离
          <select aria-label="农田单程距离" value={config.farm} onChange={(e) => update({ ...config, farm: Number(e.target.value) })}>
            {[0, 0.5, 1, 2, 3, 5, 10].map((d) => (
              <option key={d} value={d}>
                {d} 格
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="production-summary" aria-labelledby="production-summary-title">
        <div className="production-section-title">
          <h2 id="production-summary-title">村民配置摘要</h2>
          {!errors.length && (
            <strong data-testid="production-total" className="production-number">
              合计 {num(result.total)} 人
            </strong>
          )}
        </div>
        {errors.length > 0 ? (
          <div className="production-errors" role="alert">
            <p>当前方案无法计算，请先修正以下项目：</p>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <div className="production-actions">
              <button
                type="button"
                className="btn"
                onClick={() => update({ ...config, techs: config.techs.filter((id) => available.some((t) => t.id === id)) })}
              >
                清除无效链接与不可用科技
              </button>
              <button type="button" className="btn" onClick={() => update({ ...DEFAULT_PRODUCTION })}>
                重置方案
              </button>
            </div>
          </div>
        ) : !config.rows.length ? (
          <p className="note" data-testid="production-empty">
            添加生产需求后查看配置。
          </p>
        ) : (
          <div className="production-resources">
            {result.resources.map((r) => (
              <div className="production-resource" key={r.key} data-testid={'production-resource-' + r.key}>
                <h3>{RES_ZH[r.key]}</h3>
                <strong className="production-number">{r.rounded} 人</strong>
                <span>
                  理论 <b className="production-number">{num(r.villagers)} 人</b>
                </span>
                <span>
                  开销 <b className="production-number">{num(r.spend)} / 分钟</b>
                </span>
                <small>
                  每村民 <span className="production-number">{num(r.income)} / 分钟</span>
                </small>
              </div>
            ))}
          </div>
        )}
        <p className="note">先合计每种资源的开销，再分别向上取整。每行建筑专用于该单位，不模拟同一建筑混排。</p>
        <p className="production-boundary">
          仅估算持续训练：不含农田补种、住房扩建、建筑建设和研究投入；不计资源耗尽、自动赠送单位及额外资源产出。按所选单位形态已解锁计算。数据：DE Update
          185872。
        </p>
      </section>

      <div className="production-columns">
        <section className="production-demands" aria-labelledby="production-demands-title">
          <div className="production-section-title">
            <h2 id="production-demands-title">生产需求</h2>
            <button
              type="button"
              className="btn"
              disabled={config.rows.length >= PRODUCTION_LIMIT}
              onClick={() => update({ ...config, rows: [...config.rows, { unit: 83, building: 109, count: '1' }] })}
            >
              <Icon name="plus" />
              添加需求
            </button>
          </div>
          <p className="note">
            最多 {PRODUCTION_LIMIT} 条，每条建筑数量上限 {BUILDING_LIMIT}；填 0 可暂停。单位列表随文明、时代和解锁科技变化。
          </p>
          {config.rows.map((row, index) => {
            const unit = ctx.core.unitById[row.unit];
            const buildings = unit ? productionBuildings(ctx, config, unit) : [];
            const line = result.lines.find((l) => l.unit.id === row.unit && l.building === row.building && l.count === +row.count);
            return (
              <article className="production-row" key={index} data-testid="production-row">
                <div className="production-section-title">
                  <h3>需求 {index + 1}</h3>
                  <button
                    type="button"
                    className="btn production-delete"
                    aria-label={`删除需求 ${index + 1}`}
                    onClick={() => update({ ...config, rows: config.rows.filter((_, i) => i !== index) })}
                  >
                    <Icon name="x" />
                    删除
                  </button>
                </div>
                <label>
                  单位
                  <select
                    aria-label={`需求 ${index + 1} 单位`}
                    value={row.unit}
                    onChange={(e) => {
                      const id = Number(e.target.value),
                        u = ctx.core.unitById[id]!;
                      editRow(index, { unit: id, building: productionBuildings(ctx, config, u)[0]! });
                    }}
                  >
                    {!units.some((u) => u.id === row.unit) && <option value={row.unit}>当前不可用：{unit?.zh ?? row.unit}</option>}
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.zh}（{u.bz.replace(/\n/g, '')}）
                      </option>
                    ))}
                  </select>
                </label>
                <div className="production-row-controls">
                  <label>
                    专用生产建筑
                    <select aria-label={`需求 ${index + 1} 建筑`} value={row.building} onChange={(e) => editRow(index, { building: Number(e.target.value) })}>
                      {!buildings.includes(row.building) && (
                        <option value={row.building}>当前不可用：{ctx.core.buildingById[row.building]?.zh ?? row.building}</option>
                      )}
                      {buildings.map((id) => (
                        <option key={id} value={id}>
                          {ctx.core.buildingById[id]?.zh}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    建筑数量
                    <input
                      aria-label={`需求 ${index + 1} 建筑数量`}
                      type="text"
                      inputMode="numeric"
                      value={row.count}
                      onChange={(e) => editRow(index, { count: e.target.value })}
                      aria-invalid={!/^\d+$/.test(row.count) || +row.count > BUILDING_LIMIT}
                    />
                  </label>
                </div>
                {line && (
                  <div className="production-line-result">
                    <div>
                      <span>单个造价</span>
                      <CostView c={line.cost} />
                    </div>
                    <div>
                      <span>实际训练</span>
                      <b className="production-number">{num(line.seconds)} 秒 / 个</b>
                    </div>
                    <div>
                      <span>产量</span>
                      <b className="production-number">{num(line.perMinute)} 个 / 分钟</b>
                    </div>
                    {line.count === 0 && <span className="note">已暂停</span>}
                    {line.applied.length > 0 && <small>已计入：{line.applied.join('；')}</small>}
                    <small>
                      {result.resources
                        .filter((r) => line.spend[r.key] > 0)
                        .map((r) => `${RES_ZH[r.key]} ${num(line.spend[r.key])}/分钟`)
                        .join('；') || '当前没有资源开销'}
                    </small>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="production-techs" aria-labelledby="production-techs-title">
          <h2 id="production-techs-title">已研究科技</h2>
          <div className="production-actions">
            <button
              type="button"
              className="btn"
              onClick={() => update({ ...config, techs: available.filter((t) => !!ecoGatherIds.has(t.id)).map((t) => t.id) })}
            >
              经济科技全研究
            </button>
            <button type="button" className="btn" onClick={() => update({ ...config, techs: [] })}>
              清空手动选择
            </button>
          </div>
          <p className="note">
            免费科技自动生效；前置联动选择。本文明团队训练加成自动计入，其他盟友加成未计入。选择单位形态视为已经完成其升级；下列科技控制额外训练地点、费用和生产速度。
          </p>
          {groups.map((group) => (
            <fieldset className="production-tech-group" key={group}>
              <legend>{group}</legend>
              {available
                .filter((t) => t.bz.replace(/\n/g, '') === group)
                .map((t) => (
                  <label key={t.id} className="production-checkbox">
                    <input
                      type="checkbox"
                      aria-label={t.zh}
                      checked={selected.has(t.id)}
                      disabled={free.has(t.id)}
                      onChange={() => update({ ...config, techs: toggleProductionTech(ctx, config, t.id) })}
                    />
                    <span>
                      {t.zh}
                      {free.has(t.id) && <small>免费，已计入</small>}
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
          {!available.length && <p className="note">当前时代没有可选的相关科技。</p>}
        </section>
      </div>
      <section className="production-notes">
        <h2>计算口径与未计入项</h2>
        <p>每条产量等于建筑数乘每分钟秒数，再除以实际训练时间。实际时间按单位训练倍率和建筑工作效率计算；同资源先合计，再除以每村民的有效分钟采集量。</p>
        <p className="note">
          采集包含所选往返距离、携带量和移速，不模拟碰撞、农田布局或整趟交付。农田距离为 0
          时，模型不体现推车移速和携带量对农田的实际收益，不能据此认定推车科技无用。
        </p>
        {result.applied.length > 0 && <p>已计入采集加成：{result.applied.join('；')}</p>}
        {result.warnings.length > 0 ? (
          <ul className="production-warnings">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="note">当前方案没有额外的已知未支持机制。仍受上述训练与采集模型限制。</p>
        )}
      </section>
    </section>
  );
}

// 仅用于预设分组；实际效果仍全部读取固定数据，并由领域层校验文明和时代。
const ecoGatherIds = new Set([12, 13, 14, 55, 182, 202, 203, 213, 221, 249, 278, 279]);
