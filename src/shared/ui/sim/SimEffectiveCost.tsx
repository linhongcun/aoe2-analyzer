/** 单位与建筑模拟器有效训练/建造价卡片，以及固定顺位有序金额渲染（issue 1297）。 */
import { RES_ZH } from '../../../domain/ratings';
import type { CostDelta, SimEffectiveCostView } from '../../../domain/simEffectiveCost';
import type { Cost } from '../../../domain/types';
import { UNIT_COST_RESOURCES } from '../../../domain/unitCost';
import { RK, StatIcon } from '../art';
import { Icon } from '../Icon';
import './sim-effective-cost.css';

/**
 * 固定顺位（食物→木材→黄金→石料）的资源金额展示。
 * 不修改全局 CostView：仅当某资源从正数降为 0 时显式显示 0，忽略原本即为 0 的目录字段；每项带 .num.nw 防折行。
 */
export function OrderedCost({ cost, base }: { cost: Cost; base?: Cost }) {
  const keys = UNIT_COST_RESOURCES.filter((res) => (cost[res] ?? 0) > 0 || (cost[res] === 0 && (base?.[res] ?? 0) > 0));
  if (!keys.length) return <>—</>;
  return (
    <span className="sim-ordered-cost">
      {keys.map((res) => (
        <span key={res} className="res num nw" data-zero={cost[res] === 0 ? 'true' : undefined}>
          <StatIcon k={RK[res] ?? ''} t={RES_ZH[res]} />
          {cost[res]}
        </span>
      ))}
    </span>
  );
}

/** 造价差额胶囊行：降价绿底、置换新增资源琥珀底，数值包 .num.nw。 */
export function CostDeltaPills({ deltas }: { deltas: readonly CostDelta[] }) {
  if (!deltas.length) return null;
  return (
    <div className="sim-delta-pills">
      {deltas.map((item) => {
        const saving = item.delta < 0;
        const sign = saving ? '\u2212' : '+';
        const abs = Math.abs(item.delta);
        const pct = item.pct !== null ? `（\u2212${item.pct}%）` : '';
        return (
          <span key={item.res} className={`sim-delta-pill num nw ${saving ? 'is-good' : 'is-warn'}`}>
            {RES_ZH[item.res]} {sign}
            {abs}
            {pct}
          </span>
        );
      })}
    </div>
  );
}

export function SimEffectiveCost({ view, headingLevel }: { view: SimEffectiveCostView; headingLevel?: 2 | 3 }) {
  const isBuilding = view.entityKind === 'building';
  const shortLabel = isBuilding ? '有效建造价' : '有效训练价';
  const title = isBuilding ? '当前模拟有效建造价' : '当前模拟有效训练价';
  const scopeTag = isBuilding ? '单座建造价 · 不含研究费' : '单兵训练价 · 不含研究费';

  if (view.kind === 'plain') {
    return (
      <p className="sim-eff-plain" data-t="sim-effective-cost" data-state="plain">
        {shortLabel}与目录一致（
        <OrderedCost cost={view.base} />）
      </p>
    );
  }

  if (view.kind === 'available') {
    const names = view.availableTechNames.join('、');
    const actionHint = view.availablePartialOnly ? `勾选「${names}」后按已解码费用生效，另含未解码效果` : `勾选「${names}」后生效`;
    return (
      <section className="sim-eff-cost is-available" data-t="sim-effective-cost" data-state="available" aria-label={title}>
        <p className="sim-eff-avail-line">
          <strong className="sim-eff-avail-label">{title}：</strong>
          <OrderedCost cost={view.base} />
          <span className="sim-eff-avail-hint">（与目录一致；{actionHint}）</span>
        </p>
      </section>
    );
  }

  const Heading = headingLevel === 2 ? 'h3' : 'h4';
  const accentClass = view.kind === 'undecoded-only' ? 'is-warn' : 'is-good';

  return (
    <section className={`sim-eff-cost ${accentClass}`} data-t="sim-effective-cost" data-state={view.kind} aria-label={title}>
      <div className="sim-eff-head">
        <Heading className="sim-eff-title">{title}</Heading>
        <span className="sim-eff-scope nw">{scopeTag}</span>
      </div>
      <div className="sim-eff-price-row" data-t="sim-effective-price">
        <span className="sim-eff-main">
          <OrderedCost cost={view.cost} base={view.base} />
        </span>
        {view.kind === 'undecoded-only' ? (
          <span className="sim-eff-base">暂按目录基础价展示</span>
        ) : (
          <span className="sim-eff-base">
            目录基础价{' '}
            <s>
              <OrderedCost cost={view.base} />
            </s>
          </span>
        )}
      </div>
      {view.deltas.length > 0 && (
        <div data-t="sim-effective-deltas">
          <CostDeltaPills deltas={view.deltas} />
        </div>
      )}
      {view.appliedSources.length > 0 && (
        <p className="sim-eff-source" data-t="sim-effective-source">
          <Icon name="check" className="ic" />
          <span>
            已计入：{view.appliedSources.join('、')}（{view.undecodedTechNames.length ? '仅计入已解码费用条目' : '与持续生产、单位 PK 同一计价口径'}）
          </span>
        </p>
      )}
      {view.availableHint && (
        <p className="sim-eff-hint" data-t="sim-effective-hint">
          {view.availableHint}
        </p>
      )}
      {view.undecodedTechNames.length > 0 && (
        <p className="sim-eff-warn" role="status" data-t="sim-effective-undecoded">
          <Icon name="triangle-alert" className="ic" />
          <span>
            {view.kind === 'undecoded-only'
              ? `「${view.undecodedTechNames.join('、')}」含未解码的条件或资源触发效果，本页保守未折算其造价变动，当前仍按目录基础价展示。`
              : `「${view.undecodedTechNames.join('、')}」另含未解码的条件或资源触发效果，该部分未计入本页估算。`}
          </span>
        </p>
      )}
      {view.unsupportedDiscountLabels.length > 0 && (
        <p className="sim-eff-warn" role="status">
          <Icon name="triangle-alert" className="ic" />
          <span>以下文明折扣暂未计入：{view.unsupportedDiscountLabels.join('、')}。</span>
        </p>
      )}
    </section>
  );
}
