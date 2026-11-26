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
const UNMODELED_COMBAT_ATTRS = new Set([22, 63, 102, 107, 109]);
const GATHER_ATTRS = new Set(['workRate', 'carry', 'speed']);
const FARM_FOOD_RES = 36;
const FISHING_SHIP_CLASS = 21;

export type TechDataConsumptionKind = 'simulated' | 'cost' | 'consumed' | 'unencoded';
export type TechConsumedDomain =
  'cost-unit' | 'cost-building' | 'market' | 'eco-gather' | 'eco-other' | 'work-rate' | 'garrison-healing' | 'conversion' | 'combat-unmodeled';

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

function hasEcoGatherSignal(ecoData: EcoDataView, techId: number, datEco: readonly DatEco[]): boolean {
  const effects = ecoData.ecoTechs[techId]?.effects ?? [];
  if (effects.some((e) => (e.kind === 'attr' && GATHER_ATTRS.has(e.attr ?? '')) || (e.kind === 'res' && e.res === FARM_FOOD_RES))) {
    return true;
  }
  return datEco.some((e) => (e.a === 13 || e.a === 14) && e.cls === FISHING_SHIP_CLASS);
}

const DOMAIN_TOOL_LABEL: Record<Exclude<TechConsumedDomain, 'cost-unit' | 'cost-building'>, string> = {
  market: '市场',
  'eco-gather': '经济收益',
  'eco-other': '经济与开局',
  'work-rate': '持续生产',
  'garrison-healing': '驻军回血',
  conversion: '招降与阵容账本',
  'combat-unmodeled': '单位 PK 与模拟器',
};

function formatToolList(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= 1) return unique[0] ?? '站内';
  if (unique.length === 2) return `${unique[0]}与${unique[1]}`;
  return unique.join('、');
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

  const costEffects = validCostEffectsOf(datEco);
  if (costEffects.length > 0) {
    const targetIds = [...new Set(costEffects.flatMap((e) => e.t ?? []))];
    const hasUnit = deps.unitById ? targetIds.some((id) => !!deps.unitById![id]) : true;
    const hasBuilding = deps.buildingById ? targetIds.some((id) => !!deps.buildingById![id]) : false;
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

  const domains: Exclude<TechConsumedDomain, 'cost-unit' | 'cost-building'>[] = [];
  const inEcoTechs = Object.hasOwn(ecoData.ecoTechs, String(tech.id));
  const inCivEcoTechs = Boolean(ecoData.civEcoTechs && Object.hasOwn(ecoData.civEcoTechs, String(tech.id)));

  const isMarket = inEcoTechs && datEco.some((e) => (e.res === TRADE_FEE_RES || e.res === TRIBUTE_TAX_RES) && e.op === 'set' && Number.isFinite(e.v));
  if (isMarket) domains.push('market');

  if (inCivEcoTechs) {
    domains.push('eco-gather');
  } else if (inEcoTechs && !isMarket) {
    domains.push(hasEcoGatherSignal(ecoData, tech.id, datEco) ? 'eco-gather' : 'eco-other');
  }

  if (!inEcoTechs && datEco.some((e) => e.a === 13 && TECH_COST_OPS.has(e.op) && (e.t?.length ?? 0) > 0)) {
    domains.push('work-rate');
  }
  if (datEco.some((e) => e.a === 108 && TECH_COST_OPS.has(e.op) && (e.t?.length ?? 0) > 0)) {
    domains.push('garrison-healing');
  }

  const hasConversion =
    resistDelta(datTech) !== null ||
    datEco.some((e) => e.res !== undefined && CONVERSION_RES.has(e.res)) ||
    datEco.some((e) => e.a === 10 && TECH_COST_OPS.has(e.op) && (e.t?.length ?? 0) > 0);
  if (hasConversion) domains.push('conversion');

  const hasCombatUnmodeled =
    datEco.some((e) => e.a !== undefined && UNMODELED_COMBAT_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && (e.t?.length ?? 0) > 0) ||
    Boolean(dat.projectilePoison?.[tech.en]) ||
    Boolean(dat.projectilePassThrough?.[tech.en]) ||
    (tech.id === BALLISTICS_TECH_ID && Boolean(dat.ballistics));
  if (hasCombatUnmodeled) domains.push('combat-unmodeled');

  if (domains.length > 0) {
    const tools = formatToolList(domains.map((d) => DOMAIN_TOOL_LABEL[d]));
    return {
      kind: 'consumed',
      domains,
      hasUndecoded: hasResMarker,
      sourceNote: `本页不逐条模拟属性；${tools}工具已采用固定数据编码，其余效果以游戏说明为准`,
    };
  }

  return {
    kind: 'unencoded',
    domains: [],
    hasUndecoded: hasResMarker,
    sourceNote: '这条科技没有已解码数值规则，以游戏说明为准',
  };
}
