import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import { PRODUCTION_LIMIT, encodeProduction, productionUnits, type ProductionContext } from '../../domain/production';
import { defaultTrainQty, defaultTrainUnit, evaluateTrainTotal, TRAIN_TOTAL_QTY_MAX, type TrainTotalConfig } from '../../domain/trainTotal';
import { unitTrainCount } from '../../domain/trainBatch';
import { AGE_ZH } from '../../domain/ratings';
import { CostView } from '../../shared/ui/art';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Icon } from '../../shared/ui/Icon';
import { PairHintLine, PairOddBillingHint } from '../../shared/ui/PairTrainingHint';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { ToolFooter, ToolGrid } from '../../shared/ui/ToolShell';
import { UnitPicker } from '../../shared/ui/UnitPicker';
import { useShareLink } from '../../shared/ui/useShareLink';
import { ProductionCrumbs, ProductionModeNav } from './ProductionModeNav';
import { QtyStepper } from './QtyStepper';
import { decodeTrainTotal, encodeTrainTotal, legacyHrefFromTotal } from './trainTotalCodec';
import { TRAIN_TOTAL_DESCRIPTION, TRAIN_TOTAL_FOOTER, TRAIN_TOTAL_TITLE, pendingTrainQuantity, trainTotalSummary } from './trainTotalCopy';
import { TechCheck, TrainTotalResult } from './TrainTotalResult';
import { trainTotalToProduction } from '../../domain/productionTransfer';
import { productionTransferState, readProductionTransfer, withoutProductionTransfer } from '../../shared/utils/productionTransferState';
import { ProductionTransferBanner } from '../../shared/ui/ProductionTransferBanner';
import './trainTotal.css';

export function TrainTotalLinkError({ errors }: { errors: string[] }) {
  return (
    <section className="pane train-total-page" data-testid="train-total-error">
      <ToolPageHeader
        title={TRAIN_TOTAL_TITLE}
        description={TRAIN_TOTAL_DESCRIPTION}
        top={<ProductionCrumbs crumb={TRAIN_TOTAL_TITLE} flat />}
        subnav={<ProductionModeNav />}
        dock={
          <nav className="calc-dock" aria-label="方案操作">
            <div className="calc-dock-actions">
              <button type="button" className="btn" disabled>
                <Icon name="copy" />
                复制方案链接
              </button>
            </div>
          </nav>
        }
      />
      <section className="train-total-summary" aria-labelledby="train-total-result-title">
        <h2 id="train-total-result-title" tabIndex={-1}>
          无法打开这个方案链接
        </h2>
        <div role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
        <p className="note">可以回到训练总价的空方案重新开始。不会把无法识别的参数当成已计算的总价。</p>
        <p>
          <a className="btn train-total-entry" href="#/production?mode=train-total">
            回到训练总价入口
          </a>
        </p>
      </section>
    </section>
  );
}

export function TrainTotal({ context }: { context: ProductionContext }) {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeTrainTotal(location.search), [location.search]);
  const config = decoded.config;
  const transfer = useMemo(() => {
    const mapped = trainTotalToProduction(context, config);
    return { to: '/production?' + encodeProduction(mapped.config), state: productionTransferState(mapped.notice) };
  }, [context, config]);
  const result = useMemo(() => evaluateTrainTotal(context, config), [context, config]);
  const summary = trainTotalSummary({
    blocked: result.blocked.length > 0,
    rowCount: result.lines.length,
    validCount: result.validCount,
    incomplete: result.incomplete,
  });
  const share = useShareLink({
    stateKey: location.search,
    successMessage: '链接已复制，包含当前全部设置。',
    failureMessage: '自动复制失败，请手动复制下方链接。',
  });
  const write = (next: TrainTotalConfig) => {
    const search = '?' + encodeTrainTotal(next);
    const clearNotice = search !== location.search && readProductionTransfer(location.state)?.source === 'mixed-duel';
    navigate({ pathname: '/production', search }, { replace: true, state: clearNotice ? withoutProductionTransfer(location.state) : location.state });
    share.reset();
  };
  const blocked = result.blocked.length > 0;
  const civName = civByEn(config.civ)?.zh;
  const options = useMemo(
    () =>
      config.age == null || !civName ? [] : productionUnits(context, { civ: config.civ, age: config.age, techs: config.techs, walk: 0, farm: 0, rows: [] }),
    [context, config.civ, config.age, config.techs, civName],
  );
  const unitEntries = useMemo(() => options.map((u) => ({ u })), [options]);
  const unlocks = result.techs.filter((tech) => tech.panel === 'unlock');
  const costs = result.techs.filter((tech) => tech.panel === 'cost');
  const excluded = result.lines.filter((line) => line.status !== 'ok');
  return (
    <section className="pane train-total-page" data-testid="train-total-page">
      <ToolPageHeader
        title={TRAIN_TOTAL_TITLE}
        description={TRAIN_TOTAL_DESCRIPTION}
        top={<ProductionCrumbs crumb={TRAIN_TOTAL_TITLE} flat />}
        subnav={<ProductionModeNav transfer={transfer} />}
        dock={
          <nav className="calc-dock" aria-label="方案操作">
            {share.status && (
              <p className="calc-dock-note" role="status">
                {share.status}
              </p>
            )}
            <div className="calc-dock-actions">
              <button
                type="button"
                className="btn"
                disabled={blocked}
                onClick={() =>
                  void share.copy(() => {
                    const url = new URL(window.location.href);
                    url.hash = '/production?' + encodeTrainTotal(config);
                    return url.href;
                  })
                }
              >
                <Icon name="copy" />
                复制方案链接
              </button>
              <button
                type="button"
                className="calc-dock-jump"
                onClick={() => {
                  const target = document.getElementById('train-total-result-title');
                  target?.scrollIntoView({ block: 'start' });
                  target?.focus({ preventScroll: true });
                }}
              >
                <Icon name="arrow-down" />
                跳到结果
              </button>
            </div>
          </nav>
        }
      />
      <ProductionTransferBanner />
      {share.manualLink && (
        <label className="train-total-manual">
          方案链接
          <input readOnly value={share.manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <div className="train-total-setup">
        <section className="train-total-settings" aria-labelledby="train-total-settings-title">
          <h2 id="train-total-settings-title">文明与时代</h2>
          <div className="train-total-field">
            <label htmlFor="train-total-civ">文明</label>
            <CivPicker
              id="train-total-civ"
              label="训练总价文明"
              value={config.civ}
              emptyText={!civName ? `无效文明：${config.civ}` : undefined}
              invalid={!civName}
              onChange={(civ) => write({ ...config, civ })}
            />
          </div>
          <label>
            时代
            <select
              aria-label="训练总价时代"
              value={config.age ?? ''}
              onChange={(event) => write({ ...config, age: Number(event.target.value), ageRaw: null })}
            >
              {config.age == null && <option value="">无效时代：{config.ageRaw || '空'}</option>}
              {[1, 2, 3, 4].map((age) => (
                <option key={age} value={age}>
                  {AGE_ZH[age]}
                </option>
              ))}
            </select>
          </label>
        </section>
        {unlocks.length > 0 && (
          <div className="train-total-unlocks">
            <h3>影响是否可训练</h3>
            {unlocks.map((tech) => (
              <TechCheck key={tech.id} choice={tech} onToggle={() => toggleTech(config, tech.id, write)} />
            ))}
          </div>
        )}
      </div>
      <ToolGrid className="train-total-workspace">
        <div className="train-total-conditions">
          <section className="train-total-rows" aria-labelledby="train-total-rows-title">
            <h2 id="train-total-rows-title">训练行</h2>
            <button
              type="button"
              className="btn train-total-add"
              disabled={config.rows.length >= PRODUCTION_LIMIT || blocked}
              onClick={() => {
                const unitId = defaultTrainUnit(context, config);
                write({ ...config, rows: [...config.rows, { unit: unitId, qty: defaultTrainQty(unitId ? context.core.unitById[unitId] : null) }] });
              }}
            >
              <Icon name="plus" />
              添加兵种
            </button>
            <p className="note">
              最多 12 条。填写的是训练数量，不是建筑数量。数量须为 1–1000
              的整数。单位列表随文明、时代和化学等解锁科技变化；当前不可用的行会保留，不会自动改成其它形态。没有可训练形态时，新行保持待选，不会自动填入某个单位。
            </p>
            <div className="train-total-row-list">
              {result.lines.map((line, index) => {
                const row = config.rows[index];
                if (!row) return null;
                const waiting = pendingTrainQuantity(line);
                const tc = line.trainCount;
                const isPair = tc > 1;
                const rowAvailable = row.unit > 0 && options.some((unit) => unit.id === row.unit);
                const unavailableText = row.unit > 0 && !rowAvailable ? `当前不可用：${line.unit?.zh ?? row.unit}` : undefined;
                return (
                  <article
                    className={`train-total-row${waiting ? ' is-waiting' : line.status === 'ok' ? '' : ' is-bad'}`}
                    key={index}
                    data-testid="train-total-row"
                  >
                    <h3>
                      <span className="nw num">兵种 {index + 1}</span>
                      {line.status === 'pending' ? ' · 待选' : ''}
                      {waiting ? ' · 待填写数量' : ''}
                    </h3>
                    <div className="train-total-field">
                      <label htmlFor={`train-total-unit-${index}`}>单位形态</label>
                      <UnitPicker
                        id={`train-total-unit-${index}`}
                        label={`兵种 ${index + 1} 单位`}
                        value={line.unit ?? undefined}
                        rawValue={row.unit}
                        civ={civName ? config.civ : undefined}
                        allowUnavailable={false}
                        list={unitEntries}
                        invalid={line.status === 'unavail' || line.status === 'pending'}
                        unavailableText={unavailableText}
                        onChange={(unit) => {
                          const nextTc = unitTrainCount(unit);
                          editRow(
                            config,
                            index,
                            nextTc > 1 && (row.qty === '' || row.qty === '1') ? { unit: unit.id, qty: String(nextTc) } : { unit: unit.id },
                            write,
                          );
                        }}
                      />
                    </div>
                    <div className="train-total-field">
                      <label htmlFor={`train-total-qty-${index}`}>训练数量</label>
                      <QtyStepper
                        id={`train-total-qty-${index}`}
                        value={row.qty}
                        bounds={isPair ? { min: tc, max: TRAIN_TOTAL_QTY_MAX, step: tc } : { min: 1, max: TRAIN_TOTAL_QTY_MAX }}
                        inputLabel={`兵种 ${index + 1} 训练数量`}
                        decrementLabel={`兵种 ${index + 1} 数量减 ${tc}`}
                        incrementLabel={`兵种 ${index + 1} 数量加 ${tc}`}
                        placeholder={isPair ? `填写 ${tc}–${TRAIN_TOTAL_QTY_MAX}` : '填写 1–1000'}
                        invalid={waiting ? undefined : line.status === 'badqty'}
                        onChange={(qty) => editRow(config, index, { qty }, write)}
                      />
                    </div>
                    {isPair &&
                      (line.status === 'ok' &&
                      line.qtyValue !== null &&
                      line.billedBatches !== null &&
                      line.deliveredQty !== null &&
                      line.qtyValue % tc !== 0 ? (
                        <PairOddBillingHint qty={line.qtyValue} batches={line.billedBatches} delivered={line.deliveredQty} dataT="train-total-pair-hint" />
                      ) : (
                        <PairHintLine dataT="train-total-pair-hint">
                          每点一次 <span className="num nw">± {tc} 只</span>，最少 <span className="num nw">{tc} 只</span>。
                        </PairHintLine>
                      ))}
                    {line.unlockSelectable && line.needUnlockId != null && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          write({
                            ...config,
                            techs: config.techs.includes(line.needUnlockId ?? -1) ? config.techs : [...config.techs, line.needUnlockId ?? -1],
                          })
                        }
                      >
                        勾选{line.unlockName}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn train-total-delete"
                      aria-label={`删除兵种 ${index + 1}`}
                      onClick={() => write({ ...config, rows: config.rows.filter((_, rowIndex) => rowIndex !== index) })}
                    >
                      <Icon name="x" />
                      删除
                    </button>
                    {line.status !== 'ok' && (
                      <p className="train-total-flag">
                        <Icon name={waiting ? 'info' : 'triangle-alert'} />
                        {waiting ? (
                          <span>
                            请填写训练数量（<span className="num nw">1–1000</span> 的整数）。填写后计入合计。
                          </span>
                        ) : (
                          line.reason
                        )}
                      </p>
                    )}
                    {line.status === 'ok' && line.cost && line.subtotal && (
                      <div className="train-total-mini">
                        <span>
                          {isPair ? '每对单价' : '有效单价'} <CostView c={line.cost} />
                        </span>
                        <span>
                          {isPair && line.billedBatches !== null ? (
                            <>
                              小计（<span className="num nw">{line.billedBatches} 对</span>）
                            </>
                          ) : (
                            '小计'
                          )}{' '}
                          <CostView c={line.subtotal} />
                        </span>
                        {line.notes.map((note) => (
                          <span key={note}>{note}</span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
        <div className="train-total-results">
          <TrainTotalResult config={config} decodedWarnings={decoded.warnings} result={result} summary={summary} excluded={excluded} write={write} />
          <section className="train-total-techs" aria-labelledby="train-total-techs-title">
            <h2 id="train-total-techs-title">影响训练单价的科技</h2>
            <p className="note">
              科技全方案共享。是否改价按每个单位单独判断；已选不等于每一行都计入，也不等于效果已全部完整计入。切文明或时代后，失效的已选科技会保留并标明原因，停止计入，需手动移除。
            </p>
            {costs.length === 0 && <p className="note">当前文明和时代没有可选手动费用科技。</p>}
            {costs.map((tech) => (
              <TechCheck key={tech.id} choice={tech} onToggle={() => toggleTech(config, tech.id, write)} />
            ))}
            {result.invalidTechIds.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => write({ ...config, techs: config.techs.filter((id) => !result.invalidTechIds.includes(id)) })}
              >
                移除不可用科技
              </button>
            )}
          </section>
        </div>
      </ToolGrid>
      <ToolFooter
        related={{
          links: [
            { to: legacyHrefFromTotal(location.search), label: '持续生产' },
            { to: '/market', label: '市场买卖预算' },
            ...(civName ? [{ to: `/civ/${config.civ}`, label: `${civName}详情` }] : [{ label: '当前文明无效，不能打开文明详情。' }]),
          ],
        }}
      >
        {TRAIN_TOTAL_FOOTER.map((text) => {
          const cut = text.indexOf('。') + 1;
          return (
            <p key={text.slice(0, cut)}>
              <strong>{text.slice(0, cut)}</strong>
              {text.slice(cut)}
            </p>
          );
        })}
      </ToolFooter>
    </section>
  );
}

function toggleTech(config: TrainTotalConfig, id: number, write: (next: TrainTotalConfig) => void) {
  write({ ...config, techs: config.techs.includes(id) ? config.techs.filter((item) => item !== id) : [...config.techs, id] });
}
function editRow(config: TrainTotalConfig, index: number, fields: Partial<TrainTotalConfig['rows'][number]>, write: (next: TrainTotalConfig) => void) {
  write({ ...config, rows: config.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...fields } : row)) });
}
