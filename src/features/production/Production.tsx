import { Fragment, lazy, Suspense, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loading } from '../../shared/ui/widgets';
import { Icon } from '../../shared/ui/Icon';
import { CostView } from '../../shared/ui/art';
import { CalcDock } from '../../shared/ui/CalcDock';
import { CivPicker } from '../../shared/ui/CivPicker';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { ToolFooter, ToolGrid } from '../../shared/ui/ToolShell';
import { UnitPicker } from '../../shared/ui/UnitPicker';
import { tradeIncomeProductionHref } from '../../domain/tradeIncome';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import {
  BUILDING_LIMIT,
  DEFAULT_PRODUCTION,
  DEFAULT_PRODUCTION_COUNT,
  PRODUCTION_LIMIT,
  calculateProduction,
  decodeProduction,
  effectiveProductionTechs,
  encodeProduction,
  freeProductionTechs,
  mapucheSettlementFooterSummary,
  productionBuildings,
  productionTechs,
  productionUnits,
  toggleProductionTech,
  type ProductionConfig,
  type ProductionContext,
  type ProductionRow,
} from '../../domain/production';
import { useShareLink } from '../../shared/ui/useShareLink';
import { productionMode, PRODUCTION_MODE_LABELS, selectedProductionMode } from '../../domain/productionMode';
import { decodeTrainCompare } from './trainCompareCodec';
import { ProductionCompareError } from './ProductionCompareError';
import { ProductionCrumbs, ProductionModeNav } from './ProductionModeNav';
import { ProductionTechs } from './ProductionTechs';
import { ProductionTrainCompare } from './ProductionTrainCompare';
import { QtyStepper } from './QtyStepper';
import { TrainTotal, TrainTotalLinkError } from './TrainTotal';
import { useProductionContext } from './useProductionContext';
import { isDefaultProduction, productionToTrainTotal } from '../../domain/productionTransfer';
import { encodeTrainTotal, trainTotalHrefFrom } from './trainTotalCodec';
import { productionTransferState } from '../../shared/utils/productionTransferState';
import { ProductionTransferBanner } from '../../shared/ui/ProductionTransferBanner';
import { formatProductionNumber as num, ProductionResources } from './ProductionResources';
import './production.css';
import './trainCompare.css';

export { ProductionModeNav };

const ArmyCost = lazy(() => import('./ArmyCost'));
const ArmySupply = lazy(() => import('./ArmySupply'));
export default function Production() {
  const location = useLocation();
  const mode = useMemo(() => productionMode(location.search), [location.search]);
  const decoded = useMemo(() => (mode.kind === 'compare' ? decodeTrainCompare(location.search) : null), [mode, location.search]);
  const { context, error } = useProductionContext();
  const errors = mode.kind === 'error' ? mode.errors : (decoded?.errors ?? []);
  const title = PRODUCTION_MODE_LABELS[selectedProductionMode(mode)];
  return mode.kind === 'army' ? (
    <Suspense fallback={<Loading />}>
      <ArmyCost context={context} loadingError={error} />
    </Suspense>
  ) : mode.kind === 'supply' ? (
    <Suspense fallback={<Loading />}>
      <ArmySupply context={context} loadingError={error} />
    </Suspense>
  ) : mode.kind === 'error' && mode.subject === 'total' ? (
    <TrainTotalLinkError key={location.search} errors={errors} />
  ) : errors.length ? (
    <ProductionCompareError key={location.search} errors={errors} />
  ) : error ? (
    <section className="pane train-compare-page">
      <ToolPageHeader title={title} top={<ProductionCrumbs />} subnav={<ProductionModeNav />} />
      <p role="alert">生产资料加载失败，请刷新页面重试。</p>
      <button className="btn" type="button" onClick={() => window.location.reload()}>
        刷新重试
      </button>
    </section>
  ) : !context ? (
    <section className="pane train-compare-page">
      <ToolPageHeader title={title} top={<ProductionCrumbs />} subnav={<ProductionModeNav />} />
      <Loading />
      <p className="note" role="status">
        正在加载文明、单位与生产资料。
      </p>
    </section>
  ) : mode.kind === 'legacy' ? (
    <LegacyProduction context={context} />
  ) : mode.kind === 'total' ? (
    <TrainTotal context={context} />
  ) : (
    <ProductionTrainCompare context={context} config={decoded!.config!} />
  );
}

function LegacyProduction({ context }: { context: ProductionContext }) {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeProduction(location.search), [location.search]);
  const config = decoded.config;
  const {
    copy,
    status: shareStatus,
    manualLink,
    reset: resetShare,
  } = useShareLink({
    stateKey: JSON.stringify([location.search, config]),
    successMessage: '链接已复制，包含当前全部设置。',
    failureMessage: '自动复制失败，请手动复制下方链接。',
  });
  const update = (next: ProductionConfig) => {
    navigate({ pathname: '/production', search: '?' + encodeProduction(next) }, { replace: true, state: location.state });
    resetShare();
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
        await copy(() => {
          const url = new URL(window.location.href);
          url.hash = '/production?' + encodeProduction(config);
          return url.href;
        });
      }}
    />
  );
}

function AppliedText({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((item, idx) => (
        <Fragment key={item}>
          {idx > 0 && '；'}
          {item.split(/(×\d+(?:\.\d+)?)/g).map((part, partIdx) =>
            partIdx % 2 === 1 ? (
              <span className="num nw" key={partIdx}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </Fragment>
      ))}
    </>
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
  const location = useLocation();
  const transfer = useMemo(() => {
    const mapped = productionToTrainTotal(ctx, config);
    return {
      to: isDefaultProduction(config) ? trainTotalHrefFrom(location.search) : '/production?' + encodeTrainTotal(mapped.config),
      state: productionTransferState(mapped.notice),
    };
  }, [ctx, config, location.search]);
  const result = calculateProduction(ctx, config);
  const units = useMemo(() => productionUnits(ctx, config), [ctx, config]);
  const unitEntries = useMemo(() => units.map((u) => ({ u })), [units]);
  const available = productionTechs(ctx, config),
    free = freeProductionTechs(ctx, config);
  const errors = [...linkErrors, ...result.errors];
  const selected = effectiveProductionTechs(ctx, config);
  const editRow = (index: number, fields: Partial<ProductionRow>) =>
    update({ ...config, rows: config.rows.map((r, i) => (i === index ? { ...r, ...fields } : r)) });
  const related = [
    { to: '/market', label: '市场买卖预算' },
    { to: '/eco-payoff', label: '经济科技收益：固定村民对比研究投入与增量' },
    errors.length ? { label: '修正当前生产配置后可带入商路供给。' } : { to: tradeIncomeProductionHref(config), label: '按当前生产金耗规划商路供给' },
    { to: '/matchup/mixed-army', label: '结合当前局面查看混兵条件' },
    { to: '/team-plan', label: '在团战计划中约定主副兵种' },
    { to: '/relic-income', label: '另查固定圣物收益' },
  ];
  return (
    <section className="pane production-page" data-testid="production-page">
      <ToolPageHeader
        title={PRODUCTION_MODE_LABELS.legacy}
        description="从专用生产建筑反推每分钟开销与村民分配。时间均为游戏时间。"
        top={<ProductionCrumbs />}
        subnav={<ProductionModeNav transfer={transfer} />}
        dock={
          <CalcDock
            note={shareStatus}
            resultId="production-summary-title"
            actions={[{ label: '复制方案链接', icon: 'copy', disabled: linkErrors.length > 0, onClick: () => void share() }]}
          />
        }
      />
      <ProductionTransferBanner />
      {linkErrors.length > 0 && <p className="note">请先修正链接错误，再复制方案。</p>}
      {manualLink && (
        <label className="production-manual">
          方案链接
          <input readOnly value={manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <ToolGrid>
        <div className="production-conditions">
          <div className="production-settings">
            <div className="production-field">
              <label htmlFor="production-civ">文明</label>
              <CivPicker id="production-civ" label="生产文明" value={config.civ} onChange={(civ) => update({ ...config, civ })} />
            </div>
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
          <section className="production-demands" aria-labelledby="production-demands-title">
            <div className="production-section-title">
              <h2 id="production-demands-title">生产需求</h2>
              <button
                type="button"
                className="btn"
                disabled={config.rows.length >= PRODUCTION_LIMIT}
                onClick={() => update({ ...config, rows: [...config.rows, { unit: 83, building: 109, count: DEFAULT_PRODUCTION_COUNT }] })}
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
              const rowUnitAvailable = units.some((u) => u.id === row.unit);
              const line = result.lines.find((l) => l.unit.id === row.unit && l.building === row.building && l.count === +row.count);
              const countInvalid = !/^\d+$/.test(row.count) || +row.count > BUILDING_LIMIT;
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
                  <div className="production-field">
                    <label htmlFor={`production-unit-${index}`}>单位</label>
                    <UnitPicker
                      id={`production-unit-${index}`}
                      label={`需求 ${index + 1} 单位`}
                      value={unit}
                      rawValue={row.unit}
                      civ={config.civ}
                      allowUnavailable={false}
                      list={unitEntries}
                      invalid={!rowUnitAvailable}
                      unavailableText={rowUnitAvailable ? undefined : `当前不可用：${unit?.zh ?? row.unit}`}
                      onChange={(u) => {
                        if (u.id === row.unit) return;
                        editRow(index, { unit: u.id, building: productionBuildings(ctx, config, u)[0]! });
                      }}
                    />
                  </div>
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
                    <div className="production-field">
                      <label htmlFor={`production-count-${index}`}>建筑数量</label>
                      <QtyStepper
                        id={`production-count-${index}`}
                        value={row.count}
                        bounds={{ min: 0, max: BUILDING_LIMIT }}
                        inputLabel={`需求 ${index + 1} 建筑数量`}
                        decrementLabel={`需求 ${index + 1} 建筑数减 1`}
                        incrementLabel={`需求 ${index + 1} 建筑数加 1`}
                        invalid={countInvalid}
                        onChange={(count) => editRow(index, { count })}
                      />
                    </div>
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
                      {line.applied.length > 0 && (
                        <small>
                          已计入：
                          <AppliedText items={line.applied} />
                        </small>
                      )}
                      {line.rowWarnings.map((note) => (
                        <small key={note} className="production-line-warn">
                          {note}
                        </small>
                      ))}
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
          <ProductionTechs
            available={available}
            free={free}
            selected={selected}
            onSelectEco={(techs) => update({ ...config, techs })}
            onClear={() => update({ ...config, techs: [] })}
            onToggle={(id) => update({ ...config, techs: toggleProductionTech(ctx, config, id) })}
          />
        </div>
        <section className="production-summary is-sticky" aria-labelledby="production-summary-title">
          <div className="production-section-title">
            <h2 id="production-summary-title" className="calc-dock-target" tabIndex={-1}>
              村民配置摘要
            </h2>
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
            <ProductionResources resources={result.resources} />
          )}
          <p className="note">先合计每种资源的开销，再分别向上取整。每行建筑专用于该单位，不模拟同一建筑混排。</p>
          {result.warnings.length > 0 && (
            <ul className="production-warnings">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      </ToolGrid>
      <ToolFooter related={{ links: related }}>
        {(() => {
          const settlementSummary = config.civ === 'Mapuche' ? mapucheSettlementFooterSummary() : null;
          if (!settlementSummary) return null;
          return (
            <p data-testid="production-mapuche-settlement-note">
              马普切在聚落训练掷矛手系、长矛兵系时，训练时间按时代倍率计算：封建时代 <span className="num nw">×{num(settlementSummary.feudal)}</span>
              ，城堡时代累计 <span className="num nw">×{num(settlementSummary.castle)}</span>，帝王时代累计
              {settlementSummary.imperialApproxOne ? (
                <span className="num nw">约 ×{num(settlementSummary.imperial)}</span>
              ) : (
                <>
                  {' '}
                  <span className="num nw">×{num(settlementSummary.imperial)}</span>
                </>
              )}
              ；征招不作用于聚落。兵营、靶场不受这些倍率影响。
            </p>
          );
        })()}
        <p>
          <strong>计算口径与未计入项。</strong>
          每条产量等于建筑数乘每分钟秒数，再除以实际训练时间。实际时间按单位训练倍率和建筑工作效率计算；同资源先合计，再除以每村民的有效分钟采集量。
        </p>
        <p>
          采集包含所选往返距离、携带量和移速，不模拟碰撞、农田布局或整趟交付。农田距离为 0
          时，模型不体现推车移速和携带量对农田的实际收益，不能据此认定推车科技无用。
        </p>
        <p>
          仅估算持续训练：不含农田补种、住房扩建、建筑建设和研究投入；不计资源耗尽、自动赠送单位及额外资源产出。按所选单位形态已解锁计算。数据：DE Update{' '}
          {__DATA_SOURCES__.patch.build}。
        </p>
        {result.applied.length > 0 && <p>已计入采集加成：{result.applied.join('；')}</p>}
        {result.warnings.length === 0 && <p>当前方案没有额外的已知未支持机制。仍受上述训练与采集模型限制。</p>}
      </ToolFooter>
    </section>
  );
}
