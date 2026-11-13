import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { PRODUCTION_LIMIT, productionUnits, type ProductionContext } from '../../domain/production';
import { defaultTrainUnit, evaluateTrainTotal, type TrainTotalConfig, type TrainTotalTechChoice } from '../../domain/trainTotal';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import type { Tech } from '../../domain/types';
import { CostView, RK, StatIcon, TechIcon, UnitIcon } from '../../shared/ui/art';
import { Icon } from '../../shared/ui/Icon';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { ToolFooter, ToolGrid } from '../../shared/ui/ToolShell';
import { useShareLink } from '../../shared/ui/useShareLink';
import { ProductionPageTop } from './ProductionModeNav';
import { decodeTrainTotal, encodeTrainTotal, legacyHrefFromTotal } from './trainTotalCodec';
import { TRAIN_TOTAL_DESCRIPTION, TRAIN_TOTAL_FOOTER, TRAIN_TOTAL_TITLE, trainTotalSummary } from './trainTotalCopy';
import './trainTotal.css';

const RESOURCES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
const amount = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export function TrainTotalLinkError({ errors }: { errors: string[] }) {
  return (
    <section className="pane train-total-page" data-testid="train-total-error">
      <ToolPageHeader
        title={TRAIN_TOTAL_TITLE}
        description={TRAIN_TOTAL_DESCRIPTION}
        top={<ProductionPageTop crumb={TRAIN_TOTAL_TITLE} flat />}
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
    navigate({ pathname: '/production', search: '?' + encodeTrainTotal(next) }, { replace: true });
    share.reset();
  };
  const blocked = result.blocked.length > 0;
  const civName = civs.find((item) => item.en === config.civ)?.zh;
  const options =
    config.age == null || !civName ? [] : productionUnits(context, { civ: config.civ, age: config.age, techs: config.techs, walk: 0, farm: 0, rows: [] });
  const unlocks = result.techs.filter((tech) => tech.panel === 'unlock');
  const costs = result.techs.filter((tech) => tech.panel === 'cost');
  const excluded = result.lines.filter((line) => line.status !== 'ok');
  return (
    <section className="pane train-total-page" data-testid="train-total-page">
      <ToolPageHeader
        title={TRAIN_TOTAL_TITLE}
        description={TRAIN_TOTAL_DESCRIPTION}
        top={<ProductionPageTop crumb={TRAIN_TOTAL_TITLE} flat />}
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
      {share.manualLink && (
        <label className="train-total-manual">
          方案链接
          <input readOnly value={share.manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <div className="train-total-setup">
        <section className="train-total-settings" aria-labelledby="train-total-settings-title">
          <h2 id="train-total-settings-title">文明与时代</h2>
          <label>
            文明
            <select aria-label="训练总价文明" value={config.civ} onChange={(event) => write({ ...config, civ: event.target.value })}>
              {!civName && <option value={config.civ}>无效文明：{config.civ}</option>}
              {civs.map((item) => (
                <option key={item.en} value={item.en}>
                  {item.zh}
                </option>
              ))}
            </select>
          </label>
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
              onClick={() => write({ ...config, rows: [...config.rows, { unit: defaultTrainUnit(context, config), qty: '1' }] })}
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
                return (
                  <article className={line.status === 'ok' ? 'train-total-row' : 'train-total-row is-bad'} key={index} data-testid="train-total-row">
                    <h3>
                      兵种 {index + 1}
                      {line.status === 'pending' ? ' · 待选' : ''}
                    </h3>
                    <label>
                      单位形态
                      <select
                        aria-label={`兵种 ${index + 1} 单位`}
                        aria-invalid={line.status === 'unavail' || line.status === 'pending'}
                        value={row.unit}
                        onChange={(event) => editRow(config, index, { unit: Number(event.target.value) }, write)}
                      >
                        <option value={0}>请选择单位</option>
                        {row.unit > 0 && !options.some((unit) => unit.id === row.unit) && (
                          <option value={row.unit}>当前不可用：{line.unit?.zh ?? row.unit}</option>
                        )}
                        {options.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.zh}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      训练数量
                      <input
                        aria-label={`兵种 ${index + 1} 训练数量`}
                        aria-invalid={line.status === 'badqty'}
                        type="text"
                        inputMode="numeric"
                        value={row.qty}
                        onChange={(event) => editRow(config, index, { qty: event.target.value }, write)}
                      />
                    </label>
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
                        <Icon name="triangle-alert" />
                        {line.reason}
                      </p>
                    )}
                    {line.status === 'ok' && line.cost && line.subtotal && (
                      <div className="train-total-mini">
                        <span>
                          有效单价 <CostView c={line.cost} />
                        </span>
                        <span>
                          小计 <CostView c={line.subtotal} />
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
          <Result config={config} decodedWarnings={decoded.warnings} result={result} summary={summary} excluded={excluded} write={write} />
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

function Result({
  decodedWarnings,
  result,
  summary,
  excluded,
  config,
  write,
}: {
  decodedWarnings: string[];
  result: ReturnType<typeof evaluateTrainTotal>;
  summary: ReturnType<typeof trainTotalSummary>;
  excluded: ReturnType<typeof evaluateTrainTotal>['lines'];
  config: TrainTotalConfig;
  write: (next: TrainTotalConfig) => void;
}) {
  const blocked = result.blocked.length > 0;
  return (
    <section className="train-total-summary" aria-labelledby="train-total-result-title" data-testid="train-total-result">
      <div className="train-total-summary-top">
        <h2 id="train-total-result-title" className="calc-dock-target" tabIndex={-1}>
          {summary.title}
          {summary.marks.map((mark) => (
            <span className={mark === '部分训练费用' ? 'train-total-mark is-partial' : 'train-total-mark is-estimate'} key={mark}>
              {mark}
            </span>
          ))}
        </h2>
        {summary.count && <strong className="nw num">{summary.count}</strong>}
      </div>
      {summary.scopes.map((scope) => (
        <p className="train-total-scope" key={scope}>
          {scope}
        </p>
      ))}
      {blocked && (
        <div role="alert">
          {result.blocked.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      {(decodedWarnings.length > 0 || (!blocked && (excluded.length > 0 || result.invalidTechIds.length > 0))) && (
        <div className="train-total-alert" role="status">
          {decodedWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {result.invalidTechIds.length > 0 && <p>有科技在当前条件下不可用，已停止计入。可手动移除，不会自动取消勾选。</p>}
          {excluded.map((line) => (
            <p key={line.summary}>{line.summary}</p>
          ))}
          {result.lines.some((line) => line.status === 'unavail') && (
            <button
              type="button"
              className="btn"
              onClick={() => write({ ...config, rows: config.rows.filter((_, index) => result.lines[index]?.status !== 'unavail') })}
            >
              移除不可用行
            </button>
          )}
          {result.invalidTechIds.length > 0 && (
            <button type="button" className="btn" onClick={() => write({ ...config, techs: config.techs.filter((id) => !result.invalidTechIds.includes(id)) })}>
              移除不可用科技
            </button>
          )}
        </div>
      )}
      {summary.empty && (
        <p className="train-total-empty" data-testid="train-total-empty">
          {summary.empty}
        </p>
      )}
      {summary.none && (
        <p className="train-total-empty" data-testid="train-total-none">
          {summary.none}不展示合计数字。可改回文明或时代、勾选所需科技，或移除不可用行。
        </p>
      )}
      {summary.showCards && (
        <div className="train-total-resources">
          {RESOURCES.map((key) => (
            <div className="train-total-resource" key={key} data-testid={'train-total-resource-' + key}>
              <span>
                <StatIcon k={RK[key] ?? key.toLowerCase()} t={RES_ZH[key]} />
                {RES_ZH[key]}
              </span>
              <strong className="nw num">{amount(result.total[key] ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
      {summary.showCards && (
        <ul className="train-total-lines">
          {result.lines.flatMap((line, index) => {
            if (line.status !== 'ok' || !line.unit || !line.cost || !line.subtotal) return [];
            return [
              <li key={index}>
                <UnitIcon u={line.unit} />
                <div>
                  <div>
                    {line.unit.zh} <span className="nw">× {line.qtyValue}</span>
                  </div>
                  <div className="train-total-mini">
                    <span>
                      单价 <CostView c={line.cost} />
                    </span>
                    <span>
                      小计 <CostView c={line.subtotal} />
                    </span>
                  </div>
                  {line.notes.map((note) => (
                    <div key={note}>{note}</div>
                  ))}
                </div>
              </li>,
            ];
          })}
        </ul>
      )}
    </section>
  );
}

function TechCheck({ choice, onToggle }: { choice: TrainTotalTechChoice; onToggle: () => void }) {
  const tech = choice.tech;
  return (
    <label className={choice.invalidReason ? 'train-total-tech is-invalid' : 'train-total-tech'}>
      <input
        type="checkbox"
        aria-label={choice.zh}
        checked={choice.selected}
        disabled={choice.free || (!choice.selected && !choice.selectable)}
        onChange={onToggle}
      />
      {tech && <TechIcon t={tech as Tech} />}
      <span>
        {choice.zh}
        {choice.hint && <small>{choice.hint}</small>}
      </span>
    </label>
  );
}

function toggleTech(config: TrainTotalConfig, id: number, write: (next: TrainTotalConfig) => void) {
  write({ ...config, techs: config.techs.includes(id) ? config.techs.filter((item) => item !== id) : [...config.techs, id] });
}
function editRow(config: TrainTotalConfig, index: number, fields: Partial<TrainTotalConfig['rows'][number]>, write: (next: TrainTotalConfig) => void) {
  write({ ...config, rows: config.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...fields } : row)) });
}
