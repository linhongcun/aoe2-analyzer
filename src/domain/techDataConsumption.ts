/**
 * issue 1448：全站科技的数据消费分类与底部 DetailSource 三态说明（纯函数）。
 * 严格按站内工具/数据层实际解码消费的规则类目自动推导，零硬编码科技 ID；
 * 绝不以 dat.eco.length > 0 冒充已编码，仅不透明 res:33 与未消费杂项资源槽归入 unencoded。
 */
import { ECO, type EcoDataView } from '../data/eco';
import { BALLISTICS_TECH_ID } from './accuracyBoundary';
import { resistDelta } from './conversion';
import { DAT, type DatEco, type DatFile } from './datEffects';
import { TRADE_FEE_RES, TRIBUTE_TAX_RES } from './marketFeeFacts';
import type { Building, Tech, Unit } from './types';
import { isUnitCostAttribute } from './unitCost';

export const TECH_COST_OPS = new Set(['set', 'mul', 'add']);
const CONVERSION_RES = new Set([27, 28, 29, 192, 193]);
const UNIT_COMBAT_NOTICE_ATTRS = new Set([22, 63, 102, 107, 109]);
const BUILDING_GARRISON_ATTRS = new Set([102, 107]);
const BUILDING_COMBAT_NOTICE_ATTRS = new Set([22, 24, 109]);
const PAYOFF_GATHER_TARGETS = new Set(['task:wood', 'task:gold', 'task:stone']);
const FARM_FOOD_RES = 36;
const FISHING_SHIP_CLASS = 21;

export type TechDataConsumptionKind = 'simulated' | 'cost' | 'consumed' | 'unencoded';
export type TechAdoptedDomain =
  'market' | 'eco-payoff' | 'production' | 'eco-farm' | 'eco-fishing' | 'eco-build' | 'garrison-healing' | 'building-garrison' | 'conversion' | 'army-cost';
export type TechNoticeDomain = 'unit-combat-notice' | 'building-combat-notice';
export type TechConsumedDomain = 'cost-unit' | 'cost-building' | TechAdoptedDomain | TechNoticeDomain;

export interface TechDataConsumption {
  kind: TechDataConsumptionKind;
  domains: TechConsumedDomain[];
  hasUndecoded: boolean;
  sourceNote: string;
}

export interface TechConsumptionDeps {
  dat?: DatFile;
  eco?: EcoDataView;
  unitById?: Readonly<Record<number, Unit>>;
  buildingById?: Readonly<Record<number, Building>>;
}

export function validCostEffectsOf(datEco: readonly DatEco[]): DatEco[] {
  return datEco.filter((e) => isUnitCostAttribute(e.a) && TECH_COST_OPS.has(e.op) && (e.t?.length ?? 0) > 0);
}

const DOMAIN_LABEL: Record<TechAdoptedDomain | TechNoticeDomain, { label: string; isToolName: boolean }> = {
  market: { label: '市场', isToolName: true },
  'eco-payoff': { label: '经济收益', isToolName: true },
  production: { label: '持续生产', isToolName: true },
  'eco-farm': { label: '农田食物量', isToolName: false },
  'eco-fishing': { label: '渔船采集', isToolName: false },
  'eco-build': { label: '开局模拟', isToolName: true },
  'garrison-healing': { label: '驻军回血', isToolName: true },
  'building-garrison': { label: '建筑驻军与满科技对照', isToolName: false },
  conversion: { label: '招降说明与阵容账本', isToolName: false },
  'army-cost': { label: '阵容账本', isToolName: true },
  'unit-combat-notice': { label: '单位 PK 与模拟器', isToolName: false },
  'building-combat-notice': { label: '建筑满科技对照', isToolName: false },
};

function formatConsumers(domains: readonly (TechAdoptedDomain | TechNoticeDomain)[]): string {
  const unique = [...new Set(domains)];
  const labels = unique.map((d) => DOMAIN_LABEL[d].label);
  const appendTool = unique.length > 0 && unique.every((d) => DOMAIN_LABEL[d].isToolName);
  let text: string;
  if (labels.length <= 1) {
    text = labels[0] ?? '站内';
  } else if (labels.some((l) => l.includes('与'))) {
    text = labels.join('、');
  } else if (labels.length === 2) {
    text = `${labels[0]}与${labels[1]}`;
  } else {
    text = `${labels.slice(0, -1).join('、')}与${labels[labels.length - 1]}`;
  }
  return appendTool ? `${text}工具` : text;
}

/** 按站内工具/数据层实际解码消费的规则分类单条科技，生成底部 DetailSource 三态说明。 */
export function classifyTechDataConsumption(tech: Pick<Tech, 'id' | 'en'>, hasSimEntries: boolean, deps: TechConsumptionDeps = {}): TechDataConsumption {
  if (hasSimEntries) {
    return {
      kind: 'simulated',
      domains: [],
      hasUndecoded: false,
      sourceNote: '结构化效果与科技模拟器同源；未编码效果以游戏说明为准',
    };
  }

  const dat = deps.dat ?? DAT;
  const ecoData = deps.eco ?? ECO;
  const datTech = dat.techs[tech.en];
  const datEco = datTech?.eco ?? [];
  const hasResMarker = datEco.some((e) => e.res !== undefined);

  const hasUnitTarget = (ids: readonly number[] | undefined): boolean =>
    Boolean(ids?.length && (deps.unitById ? ids.some((id) => !!deps.unitById![id]) : !deps.buildingById));
  const hasBuildingTarget = (ids: readonly number[] | undefined): boolean =>
    Boolean(ids?.length && (deps.buildingById ? ids.some((id) => !!deps.buildingById![id]) : false));

  const costEffects = validCostEffectsOf(datEco);
  if (costEffects.length > 0) {
    const targetIds = [...new Set(costEffects.flatMap((e) => e.t ?? []))];
    const hasUnit = hasUnitTarget(targetIds);
    const hasBuilding = hasBuildingTarget(targetIds);
    const domains: TechConsumedDomain[] = [];
    if (hasUnit) domains.push('cost-unit');
    if (hasBuilding) domains.push('cost-building');
    if (!domains.length) domains.push('cost-unit');

    const invalidCostOp = datEco.some((e) => isUnitCostAttribute(e.a) && !TECH_COST_OPS.has(e.op));
    const hasUndecoded = hasResMarker || invalidCostOp;
    const scopeLabel = hasUnit && hasBuilding ? '训练与建造' : hasBuilding ? '建造' : '训练';
    const sourceNote = hasUndecoded
      ? `部分${scopeLabel}费用已按固定数据编码；其余效果以游戏说明为准`
      : `${scopeLabel}费用已按固定数据编码；未在站内消费的效果以游戏说明为准`;

    return { kind: 'cost', domains, hasUndecoded, sourceNote };
  }

  const adopted: TechAdoptedDomain[] = [];
  const notices: TechNoticeDomain[] = [];
  const inEcoTechs = Object.hasOwn(ecoData.ecoTechs, String(tech.id));
  const inCivEcoTechs = Boolean(ecoData.civEcoTechs && Object.hasOwn(ecoData.civEcoTechs, String(tech.id)));
  const ecoEffects = ecoData.ecoTechs[tech.id]?.effects ?? [];

  const isMarket =
    (inEcoTechs || inCivEcoTechs) && datEco.some((e) => (e.res === TRADE_FEE_RES || e.res === TRIBUTE_TAX_RES) && e.op === 'set' && Number.isFinite(e.v));

  if (inCivEcoTechs) {
    // 文明专属采集科技由持续生产按需采用，不进入经济收益工具（ecoPayoff）
    adopted.push('production');
  }

  if (isMarket) adopted.push('market');

  if (inEcoTechs && !isMarket) {
    const isEcoPayoff = ecoEffects.some((e) => e.kind === 'attr' && e.attr === 'workRate' && PAYOFF_GATHER_TARGETS.has(e.target ?? ''));
    const isFarmFood = ecoEffects.some((e) => e.kind === 'res' && e.res === FARM_FOOD_RES);
    const hasFarmCarry = ecoEffects.some((e) => e.kind === 'attr' && e.target === 'task:farm' && e.attr === 'carry' && (e.v ?? 0) > 0);
    const isFishing =
      ecoEffects.some((e) => e.target === `class:${FISHING_SHIP_CLASS}`) || datEco.some((e) => (e.a === 13 || e.a === 14) && e.cls === FISHING_SHIP_CLASS);

    if (isEcoPayoff) {
      adopted.push('eco-payoff');
    } else if (isFarmFood) {
      adopted.push('eco-farm');
      if (hasFarmCarry) adopted.push('production');
      adopted.push('eco-build');
    } else if (isFishing) {
      adopted.push('eco-fishing', 'eco-build');
    } else {
      adopted.push('eco-build');
    }
  }

  // 与 production.ts 保持一致：含资源标记（如 res:33）的工作速率科技在持续生产中整项跳过，仅由建筑满科技对照读取作提示
  const hasBuildingWorkRate = !inEcoTechs && datEco.some((e) => e.a === 13 && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t));
  if (hasBuildingWorkRate) {
    if (hasResMarker) {
      if (datEco.some((e) => e.a === 13 && e.op === 'mul' && e.v > 0 && hasBuildingTarget(e.t))) {
        notices.push('building-combat-notice');
      }
    } else {
      adopted.push('production');
    }
  }

  if (datEco.some((e) => e.a === 108 && TECH_COST_OPS.has(e.op) && (deps.buildingById ? hasBuildingTarget(e.t) : (e.t?.length ?? 0) > 0))) {
    adopted.push('garrison-healing');
  }

  if (datEco.some((e) => e.a !== undefined && BUILDING_GARRISON_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t))) {
    adopted.push('building-garrison');
  }

  if (resistDelta(datTech) !== null) {
    adopted.push('conversion');
  } else if (
    datEco.some((e) => e.res !== undefined && CONVERSION_RES.has(e.res)) ||
    datEco.some((e) => e.a === 10 && TECH_COST_OPS.has(e.op) && hasUnitTarget(e.t))
  ) {
    adopted.push('army-cost');
  }

  const poisonScope = dat.projectilePoison?.[tech.en];
  const passThroughScope = dat.projectilePassThrough?.[tech.en];

  const hasUnitCombatNotice =
    datEco.some((e) => e.a !== undefined && UNIT_COMBAT_NOTICE_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && hasUnitTarget(e.t)) ||
    (poisonScope?.units.length ?? 0) > 0 ||
    (passThroughScope?.units.length ?? 0) > 0 ||
    (tech.id === BALLISTICS_TECH_ID && Boolean(dat.ballistics));
  if (hasUnitCombatNotice) notices.push('unit-combat-notice');

  const hasBuildingCombatNotice =
    datEco.some((e) => e.a !== undefined && BUILDING_COMBAT_NOTICE_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t)) ||
    (poisonScope?.buildings.length ?? 0) > 0 ||
    (passThroughScope?.buildings.length ?? 0) > 0;
  if (hasBuildingCombatNotice && !notices.includes('building-combat-notice')) {
    notices.push('building-combat-notice');
  }

  const domains: TechConsumedDomain[] = [...adopted, ...notices];
  if (domains.length > 0) {
    const clauses: string[] = [];
    if (adopted.length > 0) clauses.push(`${formatConsumers(adopted)}已采用固定数据编码`);
    if (notices.length > 0) clauses.push(`${formatConsumers(notices)}已读取固定数据编码作机制提示`);
    return {
      kind: 'consumed',
      domains,
      hasUndecoded: hasResMarker,
      sourceNote: `本页不逐条模拟属性；${clauses.join('，')}，其余效果以游戏说明为准`,
    };
  }

  return {
    kind: 'unencoded',
    domains: [],
    hasUndecoded: hasResMarker,
    sourceNote: '这条科技没有已解码数值规则，以游戏说明为准',
  };
}
