/** 单位与建筑模拟器有效训练/建造价卡片，以及固定顺位有序金额渲染（issue 1297）。 */
import { Fragment } from 'react';
import { AGE_ZH, RES_ZH } from '../../../domain/ratings';
import type { CostDelta, SimEffectiveCostView } from '../../../domain/simEffectiveCost';
import { perUnitCost, perUnitTime } from '../../../domain/trainBatch';
import type { Cost } from '../../../domain/types';
import { UNIT_COST_RESOURCES } from '../../../domain/unitCost';
import { RK, StatIcon } from '../art';
import { Icon } from '../Icon';
import { PairBadge } from '../PairTrainingHint';
import './sim-effective-cost.css';

const RES_SHORT: Record<string, string> = { Food: '食', Wood: '木', Gold: '金', Stone: '石' };

function SimPairPerUnit({ cost, trainCount, trainSeconds }: { cost: Cost; trainCount: number; trainSeconds?: number }) {
  const unitCost = perUnitCost(cost, trainCount);
  const items = [
    ...UNIT_COST_RESOURCES.filter((res) => (unitCost[res] ?? 0) > 0).map((res) => `${unitCost[res]} ${RES_SHORT[res] ?? res}`),
    ...(trainSeconds !== undefined && Number.isFinite(trainSeconds) && trainSeconds > 0 ? [`${perUnitTime(trainSeconds, trainCount)} 秒`] : []),
  ];
  if (!items.length) return null;
  return (
    <span className="sim-pair-sub" data-t="sim-pair-per-unit">
      折合每只{' '}
      {items.map((item, idx) => (
        <Fragment key={item}>
          {idx > 0 && ' · '}
          <span className="num nw">{item}</span>
        </Fragment>
      ))}
    </span>
  );
}

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
  const tc = view.trainCount !== undefined && Number.isInteger(view.trainCount) && view.trainCount > 1 ? view.trainCount : 1;
  const isPair = !isBuilding && tc > 1;
  const shortLabel = isBuilding ? '有效建造价' : '有效训练价';
  const title = isBuilding ? '当前模拟有效建造价' : '当前模拟有效训练价';
  const scopeTag = isBuilding ? '单座建造价 · 不含研究费' : isPair ? '每对训练价 · 不含研究费' : '单兵训练价 · 不含研究费';
  const pairBadge = isPair ? (
    <PairBadge dataT="sim-pair-badge">
      每对（<span className="num nw">{tc} 只</span>）
    </PairBadge>
  ) : null;

  const unsupportedDiscountNotice =
    view.unsupportedDiscountLabels.length > 0 ? (
      <p className="sim-eff-warn" role="status" data-t="sim-effective-unsupported-discount">
        <Icon name="triangle-alert" className="ic" />
        <span>以下文明折扣暂未计入：{view.unsupportedDiscountLabels.join('、')}。</span>
      </p>
    ) : null;

  if (view.kind === 'plain' && !unsupportedDiscountNotice) {
    return (
      <p className="sim-eff-plain" data-t="sim-effective-cost" data-state="plain">
        {pairBadge}
        <span>
          {shortLabel}与目录一致（
          <OrderedCost cost={view.base} />）
        </span>
        {isPair && <SimPairPerUnit cost={view.cost} trainCount={tc} trainSeconds={view.trainSeconds} />}
      </p>
    );
  }

  if (view.kind === 'available') {
    const names = view.availableTechNames.filter(Boolean).join('、');
    const ageNote = view.availableRequiresAge ? `（${AGE_ZH[view.availableRequiresAge] ?? ''}起）` : '';
    const actionHint = names
      ? view.availablePartialOnly
        ? `勾选「${names}」${ageNote}后按已解码费用生效，另含未解码效果`
        : `勾选「${names}」${ageNote}后生效`
      : null;
    return (
      <section className="sim-eff-cost is-available" data-t="sim-effective-cost" data-state="available" aria-label={title}>
        <p className="sim-eff-avail-line">
          {pairBadge}
          <strong className="sim-eff-avail-label">{title}：</strong>
          <OrderedCost cost={view.base} />
          <span className="sim-eff-avail-hint">{actionHint ? `（与目录一致；${actionHint}）` : '（与目录一致）'}</span>
          {isPair && <SimPairPerUnit cost={view.cost} trainCount={tc} trainSeconds={view.trainSeconds} />}
        </p>
        {unsupportedDiscountNotice}
      </section>
    );
  }

  const Heading = headingLevel === 2 ? 'h3' : 'h4';
  const accentClass = view.kind === 'undecoded-only' || view.kind === 'plain' ? 'is-warn' : 'is-good';

  return (
    <section className={`sim-eff-cost ${accentClass}`} data-t="sim-effective-cost" data-state={view.kind} aria-label={title}>
      <div className="sim-eff-head">
        <Heading className="sim-eff-title">{title}</Heading>
        <span className="sim-eff-scope nw">{scopeTag}</span>
      </div>
      <div className="sim-eff-price-row" data-t="sim-effective-price">
        {pairBadge}
        <span className="sim-eff-main">
          <OrderedCost cost={view.cost} base={view.base} />
        </span>
        {view.kind === 'undecoded-only' || view.kind === 'plain' ? (
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
      {isPair && (
        <p className="sim-pair-sub" data-t="sim-pair-per-unit-row">
          <SimPairPerUnit cost={view.cost} trainCount={tc} trainSeconds={view.trainSeconds} />
        </p>
      )}
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
      {unsupportedDiscountNotice}
    </section>
  );
}
