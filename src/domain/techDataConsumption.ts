/**
 * issue 1448：全站科技的数据消费分类与底部 DetailSource 三态说明（纯函数）。
 * 严格按站内工具/数据层实际解码消费的规则类目自动推导，零硬编码科技 ID；
 * 绝不以 dat.eco.length > 0 冒充已编码，仅不透明 res:33 与未消费杂项资源槽归入 unencoded。
 */
import { ECO, type EcoDataView } from '../data/eco';
import { RELIC_INCOME_RAW } from '../data/relicIncome';
import { BALLISTICS_TECH_ID } from './accuracyBoundary';
import { CONVERT_RESIST_MAX_RES, CONVERT_RESIST_MIN_RES, resistDelta } from './conversion';
import { DAT, type DatEco, type DatFile } from './datEffects';
import { GARRISON_NUMERIC_EFFECT_TECH_IDS } from './garrisonTechs';
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

export interface RelicModifierSummary {
  techId?: number | null;
  resources?: readonly number[];
  value?: number;
}

export interface RelicDataSummary {
  modifiers?: Readonly<Record<string, RelicModifierSummary | undefined>>;
}

function readRelicTechIds(raw: unknown): ReadonlySet<number> {
  if (!raw || typeof raw !== 'object') return new Set();
  const mods = (raw as RelicDataSummary).modifiers;
  if (!mods || typeof mods !== 'object') return new Set();
  const ids = new Set<number>();
  for (const m of Object.values(mods)) {
    if (
      m &&
      typeof m.techId === 'number' &&
      Number.isSafeInteger(m.techId) &&
      Array.isArray(m.resources) &&
      m.resources.length > 0 &&
      typeof m.value === 'number' &&
      Number.isFinite(m.value)
    ) {
      ids.add(m.techId);
    }
  }
  return ids;
}

const DEFAULT_RELIC_TECH_IDS: ReadonlySet<number> = readRelicTechIds(RELIC_INCOME_RAW);

export type TechDataConsumptionKind = 'simulated' | 'cost' | 'consumed' | 'unencoded';
export type TechAdoptedDomain =
  | 'market'
  | 'eco-payoff'
  | 'production'
  | 'construction'
  | 'real-cost'
  | 'relic-income'
  | 'eco-farm'
  | 'eco-fishing'
  | 'eco-build'
  | 'garrison-healing'
  | 'building-garrison'
  | 'building-civ-rank'
  | 'conversion'
  | 'army-cost';
export type TechNoticeDomain = 'duel-unmodeled' | 'unit-civ-rank-notice' | 'ballistics-notice' | 'building-sim-notice' | 'building-combat-notice';
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
  relic?: RelicDataSummary | null;
  garrisonNumericTechIds?: ReadonlySet<number>;
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
  construction: { label: '多人施工', isToolName: true },
  'real-cost': { label: '真实成本', isToolName: false },
  'relic-income': { label: '圣物收益', isToolName: true },
  'eco-farm': { label: '农田食物量', isToolName: false },
  'eco-fishing': { label: '渔船采集', isToolName: false },
  'eco-build': { label: '开局模拟', isToolName: true },
  'garrison-healing': { label: '驻军回血', isToolName: true },
  'building-garrison': { label: '建筑驻军', isToolName: false },
  'building-civ-rank': { label: '建筑满科技对照', isToolName: false },
  conversion: { label: '招降说明与阵容账本', isToolName: false },
  'army-cost': { label: '阵容账本', isToolName: true },
  'duel-unmodeled': { label: '单位 PK', isToolName: false },
  'unit-civ-rank-notice': { label: '单位满科技对照', isToolName: false },
  'ballistics-notice': { label: '单位 PK 与科技模拟器', isToolName: false },
  'building-sim-notice': { label: '建筑模拟器', isToolName: false },
  'building-combat-notice': { label: '建筑满科技对照', isToolName: false },
};

function formatConsumers(domains: readonly (TechAdoptedDomain | TechNoticeDomain)[]): string {
  const unique = [...new Set(domains)];
  const labels = unique.map((d) => DOMAIN_LABEL[d].label);
  const appendTool = unique.length > 0 && unique.every((d) => DOMAIN_LABEL[d].isToolName);
  const joinAnd = (left: string, right: string) => (/[A-Za-z0-9]$/.test(left) ? `${left} 与${right}` : `${left}与${right}`);
  let text: string;
  if (labels.length <= 1) {
    text = labels[0] ?? '站内';
  } else if (labels.some((l) => l.includes('与'))) {
    text = labels.join('、');
  } else if (labels.length === 2) {
    text = joinAnd(labels[0]!, labels[1]!);
  } else {
    text = joinAnd(labels.slice(0, -1).join('、'), labels[labels.length - 1]!);
  }
  return appendTool ? `${text}工具` : text;
}

/** 按站内工具/数据层实际解码消费的规则分类单条科技，生成底部 DetailSource 三态说明。 */
export function classifyTechDataConsumption(
  tech: Pick<Tech, 'id' | 'en'> & Partial<Pick<Tech, 'type' | 'civs'>>,
  hasSimEntries: boolean,
  deps: TechConsumptionDeps = {},
): TechDataConsumption {
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
  const techOwnedByEntity = (civs: readonly string[]) => !tech.civs?.length || tech.civs.some((c) => civs.includes(c));
  const hasMultiCivUnitTarget = (ids: readonly number[] | undefined): boolean =>
    Boolean(
      ids?.length &&
      deps.unitById &&
      ids.some((id) => {
        const u = deps.unitById![id];
        return Boolean(u && u.civs.length >= 2 && techOwnedByEntity(u.civs));
      }),
    );
  const hasMultiCivBuildingTarget = (ids: readonly number[] | undefined): boolean =>
    Boolean(
      ids?.length &&
      deps.buildingById &&
      ids.some((id) => {
        const b = deps.buildingById![id];
        return Boolean(b && b.civs.length >= 2 && techOwnedByEntity(b.civs));
      }),
    );

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

  const relicTechIds = deps.relic === undefined ? DEFAULT_RELIC_TECH_IDS : readRelicTechIds(deps.relic);
  if (relicTechIds.has(tech.id)) adopted.push('relic-income');

  if (inEcoTechs && !isMarket) {
    const isEcoPayoff = ecoEffects.some((e) => e.kind === 'attr' && e.attr === 'workRate' && PAYOFF_GATHER_TARGETS.has(e.target ?? ''));
    const isFarmFood = ecoEffects.some((e) => e.kind === 'res' && e.res === FARM_FOOD_RES);
    const hasFarmCarry = ecoEffects.some((e) => e.kind === 'attr' && e.target === 'task:farm' && e.attr === 'carry' && (e.v ?? 0) > 0);
    const isFishing =
      ecoEffects.some((e) => e.target === `class:${FISHING_SHIP_CLASS}`) || datEco.some((e) => (e.a === 13 || e.a === 14) && e.cls === FISHING_SHIP_CLASS);

    // 时代升级科技与战船升级在开局模拟仅读取研究费用与时间，不结算 ecoTechs.effects，不计入已消费效果编码
    if (isEcoPayoff) {
      // 7 项伐木/采矿科技同步被经济收益、持续生产、多人施工、真实成本与开局模拟五处采集模型采用
      adopted.push('eco-payoff', 'production', 'construction', 'real-cost', 'eco-build');
    } else if (isFarmFood) {
      // 磨坊农田容量仅由农田食物量采用；仅带 task:farm carry 增量的科技（如重犁）额外被持续生产、多人施工与开局模拟采用（真实成本默认农田步距 0 不受 carry 影响）
      adopted.push('eco-farm');
      if (hasFarmCarry) adopted.push('production', 'construction', 'eco-build');
    } else if (isFishing) {
      adopted.push('eco-fishing', 'eco-build');
    }
  }

  // 与 production.ts 和 buildingCivRank.ts:201,238 保持一致：
  // 不含资源标记的工作速率科技由持续生产采用；含正倍率 a:13 的特色科技同步由建筑满科技对照读取作提示
  const hasBuildingWorkRate = !inEcoTechs && datEco.some((e) => e.a === 13 && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t));
  if (hasBuildingWorkRate) {
    if (!hasResMarker) {
      adopted.push('production');
    }
    const isUniqueWorkRateRank =
      (tech.type === undefined || tech.type === 'UniqueTech') &&
      datEco.some((e) => e.a === 13 && e.op === 'mul' && e.v > 0 && (deps.buildingById ? hasMultiCivBuildingTarget(e.t) : true));
    if (isUniqueWorkRateRank) {
      notices.push('building-combat-notice');
    }
  }

  if (datEco.some((e) => e.a === 108 && TECH_COST_OPS.has(e.op) && (deps.buildingById ? hasBuildingTarget(e.t) : (e.t?.length ?? 0) > 0))) {
    adopted.push('garrison-healing');
  }

  const garrisonIds = deps.garrisonNumericTechIds ?? GARRISON_NUMERIC_EFFECT_TECH_IDS;
  const hasBuildingExtraProj = datEco.some((e) => e.a !== undefined && BUILDING_GARRISON_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t));
  if (garrisonIds.has(tech.id) || hasBuildingExtraProj) {
    adopted.push('building-garrison');
  }
  const hasBuildingCivRankExtraProj =
    (tech.type === undefined || tech.type === 'UniqueTech') &&
    datEco.some((e) => e.a === 102 && e.op === 'add' && e.v > 0 && (deps.buildingById ? hasMultiCivBuildingTarget(e.t) : hasBuildingTarget(e.t)));
  if (hasBuildingCivRankExtraProj) {
    adopted.push('building-civ-rank');
  }

  // 与 conversion.ts / armyCost.ts:169-175 保持一致：纯 178/179 归招降说明与阵容账本；混合抗招降槽位与其余招降规则由阵容账本采用
  const hasMixedConvertResist =
    Boolean(datTech) &&
    resistDelta({
      ...datTech!,
      rules: [],
      eco: datEco.filter((e) => e.res === CONVERT_RESIST_MIN_RES || e.res === CONVERT_RESIST_MAX_RES),
    }) !== null;
  if (resistDelta(datTech) !== null) {
    adopted.push('conversion');
  } else if (
    hasMixedConvertResist ||
    datEco.some((e) => e.res !== undefined && CONVERSION_RES.has(e.res)) ||
    datEco.some((e) => e.a === 10 && TECH_COST_OPS.has(e.op) && hasUnitTarget(e.t))
  ) {
    adopted.push('army-cost');
  }

  const poisonScope = dat.projectilePoison?.[tech.en];
  const passThroughScope = dat.projectilePassThrough?.[tech.en];

  // 独立科技模拟器仅对弹道学等展示数据驱动 scopeNote；其余单位未建模战斗机制仅由单位 PK（duelUnmodeled）读取提示
  if (tech.id === BALLISTICS_TECH_ID && Boolean(dat.ballistics)) {
    notices.push('ballistics-notice');
  }

  const duelUnmodeledTargetIds = [
    ...datEco.filter((e) => e.a !== undefined && UNIT_COMBAT_NOTICE_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op)).flatMap((e) => e.t ?? []),
    ...(poisonScope?.units ?? []),
    ...(passThroughScope?.units ?? []),
  ];
  const hasDuelUnmodeled = hasUnitTarget(duelUnmodeledTargetIds) || (poisonScope?.units.length ?? 0) > 0 || (passThroughScope?.units.length ?? 0) > 0;
  if (hasDuelUnmodeled) {
    notices.push('duel-unmodeled');
    if (hasMultiCivUnitTarget(duelUnmodeledTargetIds)) {
      notices.push('unit-civ-rank-notice');
    }
  }

  if ((poisonScope?.buildings.length ?? 0) > 0) {
    notices.push('building-sim-notice');
  }

  const hasBuildingCombatNotice =
    datEco.some((e) => e.a !== undefined && BUILDING_COMBAT_NOTICE_ATTRS.has(e.a) && TECH_COST_OPS.has(e.op) && hasBuildingTarget(e.t)) ||
    (poisonScope?.buildings.length ?? 0) > 0 ||
    (passThroughScope?.buildings.length ?? 0) > 0;
  if (hasBuildingCombatNotice && !notices.includes('building-combat-notice')) {
    notices.push('building-combat-notice');
  }

  const domains: TechConsumedDomain[] = [...adopted, ...notices];
  if (domains.length > 0) {
    const withGap = (subject: string, verb: string) => (/[A-Za-z0-9]$/.test(subject) ? `${subject} ${verb}` : `${subject}${verb}`);
    const clauses: string[] = [];
    if (adopted.length > 0) clauses.push(withGap(formatConsumers(adopted), '已采用固定数据编码'));
    if (notices.length > 0) clauses.push(withGap(formatConsumers(notices), '已读取固定数据编码作机制提示'));
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
