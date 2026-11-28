/** 科技模拟器行内研究价与累计研究费用汇总卡（issue 1496；单位、建筑与 PK 内嵌面板共用）。 */
import { Link } from 'react-router-dom';
import { encodeArmyCost } from '../../../domain/armyCostConfig';
import { formatBaseCostText, type SimResearchSummary, type SimTechResearchQuote } from '../../../domain/simResearchCost';
import { StatIcon } from '../art';
import { Icon } from '../Icon';
import { OrderedCost } from './SimEffectiveCost';

/** 科技行右侧研究价与研究时间（四态：无折扣 / 折后 / 免费 / 防御性费用未核实）。 */
export function SimRowPrice({ quote, rt }: { quote: SimTechResearchQuote; rt: number }) {
  const baseText = formatBaseCostText(quote.baseCost);
  const title =
    quote.state === 'discounted' || quote.state === 'free'
      ? baseText
        ? `目录原价：${baseText}`
        : undefined
      : quote.state === 'unverified'
        ? quote.reason
        : undefined;
  return (
    <span className="simc" data-price-state={quote.state} title={title}>
      {quote.state === 'normal' && <OrderedCost cost={quote.cost!} />}
      {quote.state === 'discounted' && (
        <>
          <span className="sim-price-pill is-good nw" data-t="sim-row-discounted">
            折后
          </span>
          <span className="simc-discounted">
            <OrderedCost cost={quote.cost!} base={quote.baseCost} />
          </span>
        </>
      )}
      {quote.state === 'free' && (
        <span className="sim-price-pill is-good nw" data-t="sim-row-free">
          免费
        </span>
      )}
      {quote.state === 'unverified' && (
        <span className="sim-price-pill is-warn nw" data-t="sim-row-unverified">
          费用未核实
        </span>
      )}
      <span className="simc-time num nw">
        <StatIcon k="time" t="研究时间" />
        {rt}s
      </span>
    </span>
  );
}

/** 累计研究费用与目录时长汇总卡（五态 + 全宽边界说明；保持既有 DOM 选择器契约）。 */
export function SimResearchSummaryCard({
  civ,
  age,
  selectedCount,
  summary,
  headingLevel,
  researchCostNote,
}: {
  civ: string;
  age: number;
  selectedCount: number;
  summary: SimResearchSummary;
  headingLevel?: 2 | 3;
  researchCostNote?: string;
}) {
  const Subheading = headingLevel === 2 ? 'h3' : 'h4';
  const armyCostHref = `/production?${encodeArmyCost({ civ, age: String(age), rows: [], done: [], targets: [] })}`;
  const freeDisplay = (
    <span className="sim-summary-free" data-t="sim-summary-free">
      <span className="sim-price-pill is-good nw">免费</span>
      <span className="sim-summary-zero num nw">0 资源</span>
    </span>
  );

  return (
    <section className="sim-summary" aria-label="累计研究">
      <div className="sim-summary-main">
        <div className="sim-summary-head">
          <Subheading className={headingLevel === undefined ? undefined : 'sim-summary-title'}>
            累计研究费用（<span className="num nw">{selectedCount} 项</span>）
          </Subheading>
          {summary.unverifiedCount > 0 ? (
            <span className="sim-price-pill is-warn nw" data-t="sim-summary-partial-badge">
              已核实项目小计
            </span>
          ) : summary.discounted && !summary.allFree && summary.verifiedCount > 0 ? (
            <span className="sim-price-pill is-good nw" data-t="sim-summary-discount-badge">
              已计入文明研究折扣
            </span>
          ) : null}
        </div>
        {researchCostNote && (
          <p className="sim-summary-note" data-t="sim-summary-note">
            {researchCostNote}
          </p>
        )}
        <div className="sim-summary-cost" data-state={summary.state}>
          {summary.state === 'empty' && '—'}
          {summary.state === 'free' && freeDisplay}
          {summary.state === 'unverified-only' && (
            <span className="sim-price-pill is-warn nw" data-t="sim-summary-unverified-only">
              费用未核实
            </span>
          )}
          {summary.state === 'normal' && <OrderedCost cost={summary.cost} />}
          {(summary.state === 'discounted' || summary.state === 'partial') &&
            (summary.allVerifiedFree ? freeDisplay : <OrderedCost cost={summary.cost} base={summary.discounted ? summary.baseCost : undefined} />)}
        </div>
        {summary.discounted && summary.verifiedCount > 0 && summary.costDiffersFromBase && (
          <p className="sim-summary-base" data-t="sim-summary-base">
            <span>目录原价</span>
            <s>
              <OrderedCost cost={summary.baseCost} />
            </s>
          </p>
        )}
      </div>
      <div className="sim-summary-time-col">
        <span className="note">累计研究时长</span>
        <strong className="sim-summary-time">
          <StatIcon k="time" t="研究时间" />
          {summary.time}
          <small>秒</small>
        </strong>
      </div>
      <div className="sim-summary-foot">
        {summary.unverifiedCount > 0 && (
          <p className="sim-summary-callout is-warn" role="status" data-t="sim-summary-unverified-note">
            <Icon name="triangle-alert" className="ic" />
            <span>
              {summary.verifiedCount > 0 ? (
                <>
                  有 <span className="num nw">{summary.unverifiedCount} 项</span>已选研究费用未核实，未计入上方小计（不按 <span className="num nw">0</span>{' '}
                  或目录原价补算）。
                </>
              ) : (
                <>
                  当前已选 <span className="num nw">{summary.unverifiedCount} 项</span>研究费用均未核实，暂不展示累计金额（不按{' '}
                  <span className="num nw">0</span> 或目录原价补算）。
                </>
              )}
            </span>
          </p>
        )}
        {summary.orderConflict && (
          <p className="sim-summary-callout is-warn" role="status" data-t="sim-summary-order-note">
            <Icon name="triangle-alert" className="ic" />
            <span>
              已同时勾选会改写其他研究费用的「{summary.orderConflict.modifierNames.join('、')}」与受影响研究（
              {summary.orderConflict.affectedNames.join('、')}）；此处按单项被动报价稳定合计，未按研究先后顺序折算。需按完成顺序精确核算，请前往{' '}
              <Link className="sim-summary-link" to={armyCostHref}>
                阵容新增费用
              </Link>
              。
            </span>
          </p>
        )}
        {summary.decimalCount > 0 && (
          <p className="sim-summary-callout is-info" role="note" data-t="sim-summary-decimal-note">
            <Icon name="info" className="ic" />
            <span>
              有 <span className="num nw">{summary.decimalCount} 项</span>已选研究折后价含小数：按固定数据折扣比例保留至多两位小数；游戏内实际是否取整未核实。
            </span>
          </p>
        )}
        <p className="sim-summary-time-note" data-t="sim-summary-time-note">
          <Icon name="clock" className="ic" />
          <span>累计研究时长按目录基础时间合计，未计研究加速、并行研究或免费科技瞬时完成。</span>
        </p>
      </div>
    </section>
  );
}
