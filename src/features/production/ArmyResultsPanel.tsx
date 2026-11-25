import type { RefObject } from 'react';
import { hasDecimalCost, type evaluateArmyCost } from '../../domain/armyCost';
import type { ArmyCostConfig } from '../../domain/armyCostConfig';
import { RES_ZH } from '../../domain/ratings';
import type { Cost } from '../../domain/types';
import { Icon } from '../../shared/ui/Icon';
import { ArmyLedger } from './ArmyLedger';

const RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;

function ResourceGrid({ cost, primary = false }: { cost: Cost; primary?: boolean }) {
  return (
    <div className={'army-resources' + (primary ? ' army-primary' : '')}>
      {RES.map((r) => (
        <div key={r}>
          <span>{RES_ZH[r]}</span>
          <strong className="num">{(cost[r] ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</strong>
        </div>
      ))}
    </div>
  );
}

export function ArmyResultsPanel({
  config,
  result,
  resultRef,
  onRemoveResearch,
}: {
  config: ArmyCostConfig;
  result: ReturnType<typeof evaluateArmyCost> | null;
  resultRef: RefObject<HTMLHeadingElement>;
  onRemoveResearch: (key: string) => void;
}) {
  const decimalCount = result?.ledger.filter((e) => e.status === 'planned' && hasDecimalCost(e.cost)).length ?? 0;
  return (
    <div className="army-results">
      <section className="army-card">
        <h2 ref={resultRef} tabIndex={-1}>
          {result?.partial ? '已核实项目小计' : '本期新增费用合计'}
        </h2>
        {result?.blocked.length ? (
          <div role="alert">
            {result.blocked.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        ) : null}
        {!result?.hasValue ? (
          <p className="note">
            {config.rows.length || config.targets.length ? '当前没有可完整计入的项目，请查看各项原因。' : '添加兵种并核对研究状态后查看费用。'}
          </p>
        ) : (
          <>
            <p className="note">{result.partial ? '仅包含已核实部分，不能代表整套阵容。' : '训练费与一次性研究费分别列示，再按资源相加。'}</p>
            <ResourceGrid cost={result.total} primary />
            <h3>训练费</h3>
            <ResourceGrid cost={result.trainingTotal} />
            <p className="note">按「已完成＋本次目标达成后」的有效单价计算。</p>
            <h3>一次性研究 / 升级费</h3>
            <ResourceGrid cost={result.researchTotal} />
            <p className="note">按实际研究动作去重，不乘训练数量。</p>
            {decimalCount > 0 && (
              <p className="army-boundary army-decimal-note" data-t="army-decimal-note" role="note">
                <Icon name="info" />
                <span>
                  有{' '}
                  <span className="nw">
                    <span className="num">{decimalCount}</span> 项
                  </span>
                  研究的折后价含小数：按固定数据的折扣比例保留至多两位小数并计入；游戏内实际是否取整未核实。
                </span>
              </p>
            )}
            {!result.partial && result.ledger.length > 0 && result.ledger.every((e) => ['done', 'inferred-done', 'free'].includes(e.status)) && (
              <p className="note">
                所有必要和目标研究均已完成；新增研究费为 <span className="num">0</span>。
              </p>
            )}
          </>
        )}
        <p className="army-boundary">
          <Icon name="info" />
          <span>共享研究只计一次；不同兵种线的升级与独立护甲研究分别计费。</span>
        </p>
      </section>
      <section className="army-card">
        <h2>研究账本</h2>
        <p className="note">名称仅用于显示，按同一个实际研究动作计费。</p>
        {result?.ledger.map((entry) => (
          <ArmyLedger key={entry.key} entry={entry} entries={result.ledger} config={config} onRemove={() => onRemoveResearch(entry.key)} />
        ))}
        {!result?.ledger.length && <p className="note">暂无研究动作。</p>}
      </section>
      {result?.partial && (
        <section className="army-card">
          <h2>未计入清单</h2>
          <ul>
            {result.training.lines.map(
              (line, i) =>
                line.status !== 'ok' && (
                  <li key={i}>
                    第 <span className="num">{i + 1}</span> 行：{line.reason.replace(/研究费用不计。?/g, '')}
                  </li>
                ),
            )}
            {result.ledger
              .filter((e) => e.status === 'invalid')
              .map((e) => (
                <li key={e.key}>
                  {e.name}：{e.reason}
                </li>
              ))}
          </ul>
          <p className="note">修正输入、移除无效项或更换目标后自动重新核算。</p>
        </section>
      )}
    </div>
  );
}
