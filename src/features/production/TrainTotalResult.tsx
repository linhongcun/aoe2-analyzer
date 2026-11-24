import type { evaluateTrainTotal, TrainTotalConfig, TrainTotalTechChoice } from '../../domain/trainTotal';
import { RES_ZH } from '../../domain/ratings';
import type { Tech } from '../../domain/types';
import { CostView, RK, StatIcon, TechIcon, UnitIcon } from '../../shared/ui/art';
import { pendingTrainQuantity, TRAIN_TOTAL_PENDING, type TrainTotalSummary } from './trainTotalCopy';

const RESOURCES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
const amount = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export function TrainTotalResult({
  decodedWarnings,
  result,
  summary,
  excluded,
  config,
  write,
}: {
  decodedWarnings: string[];
  result: ReturnType<typeof evaluateTrainTotal>;
  summary: TrainTotalSummary;
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
            <p key={line.summary}>
              {pendingTrainQuantity(line) ? (
                <>
                  <span className="nw num">第 {result.lines.indexOf(line) + 1} 行</span>还没有填写训练数量，未计入下面的小计。
                </>
              ) : (
                line.summary
              )}
            </p>
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
          {result.lines.every(pendingTrainQuantity) ? TRAIN_TOTAL_PENDING : <>{summary.none}不展示合计数字。可改回文明或时代、勾选所需科技，或移除不可用行。</>}
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
            const isPair = line.trainCount > 1 && line.billedBatches !== null && line.deliveredQty !== null;
            return [
              <li key={index}>
                <UnitIcon u={line.unit} />
                <div>
                  <div>
                    {line.unit.zh}{' '}
                    {isPair ? (
                      <span className="nw num">
                        × {line.deliveredQty}（{line.billedBatches} 对）
                      </span>
                    ) : (
                      <span className="nw">× {line.qtyValue}</span>
                    )}
                  </div>
                  <div className="train-total-mini">
                    <span>
                      {isPair ? '每对' : '单价'} <CostView c={line.cost} />
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

export function TechCheck({ choice, onToggle }: { choice: TrainTotalTechChoice; onToggle: () => void }) {
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
