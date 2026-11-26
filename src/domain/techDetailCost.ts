/**
 * issue 1448：科技详情正文「费用变化」结构化视图模型（纯函数）。
 * 复用 unitCost / diffEntityCost 与固定 effects.json / eco.json / units.json / buildings.json / techs.json 动态推导，
 * 零硬编码科技 ID、单位名单或静态价表。
 */
import { civByEn, type Core } from '../data';
import { ECO, type EcoDataView } from '../data/eco';
import { encodeArmyCost } from './armyCostConfig';
import { entityCivLink } from './civRoute';
import { DAT, type DatEco, type DatFile } from './datEffects';
import { applyEffectValue } from './numericEffects';
import { DEFAULT_PRODUCTION, encodeProduction, productionBuildings } from './production';
import { diffEntityCost, type CostDelta } from './simEffectiveCost';
import { TECH_COST_OPS, validCostEffectsOf } from './techDataConsumption';
import type { Cost, Tech, Trees, Unit } from './types';
import { finalizeUnitPrice, isUnitCostAttribute, UNIT_COST_RESOURCES, unitCost, type UnitCostResource } from './unitCost';

export {
  classifyTechDataConsumption,
  type TechConsumedDomain,
  type TechConsumptionDeps,
  type TechDataConsumption,
  type TechDataConsumptionKind,
} from './techDataConsumption';

const COST_ATTR_RES: Record<number, UnitCostResource | 'all'> = {
  100: 'all',
  103: 'Food',
  104: 'Wood',
  105: 'Gold',
  106: 'Stone',
};

const RES_LABEL_ZH: Record<UnitCostResource, string> = {
  Food: '食物',
  Wood: '木材',
  Gold: '黄金',
  Stone: '石料',
};

const RES_SHORT_ZH: Record<UnitCostResource, string> = {
  Food: '食',
  Wood: '木',
  Gold: '金',
  Stone: '石',
};

const WHAT_TO_RES: Record<string, UnitCostResource> = {
  食物: 'Food',
  木材: 'Wood',
  黄金: 'Gold',
  石料: 'Stone',
};

export const TECH_COST_COLLAPSE_THRESHOLD = 6;
export const TECH_COST_PREVIEW_COUNT = 3;

export interface TechCostRow {
  entityKind: 'unit' | 'building';
  id: number;
  zh: string;
  age: number;
  href: string;
  base: Cost;
  after: Cost;
  deltas: CostDelta[];
  deltaText: string;
}

export interface TechSubCostRow {
  id: number;
  zh: string;
  href: string;
  base: Cost;
  after: Cost;
  deltas: CostDelta[];
  deltaText: string;
}

export interface TechCostAction {
  kind: 'army-cost' | 'production' | 'building' | 'unit';
  label: string;
  to: string;
}

export interface TechCostChangeView {
  ownerCivEn: string | null;
  ownerCivZh: string | null;
  scopeKind: 'unit' | 'building' | 'mixed';
  introText: string;
  countPill: string;
  rulePills: string[];
  hasUndecoded: boolean;
  matchedCount: number;
  unchangedCount: number;
  rows: TechCostRow[];
  previewRows: TechCostRow[];
  extraRows: TechCostRow[];
  techRows: TechSubCostRow[];
  actions: TechCostAction[];
  boundaryNote: string;
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function formatCostDeltaParts(deltas: readonly CostDelta[]): string[] {
  return deltas.map((d) => `${d.delta > 0 ? '+' : '-'}${formatNumber(Math.abs(d.delta))}${RES_SHORT_ZH[d.res]}`);
}

export function formatCostDeltaText(deltas: readonly CostDelta[]): string {
  return formatCostDeltaParts(deltas).join(' / ');
}

/** 从 .dat 费用效果动态推导玩家可读规则胶囊，不暴露属性号或资源槽号。 */
function buildRulePills(costEffects: readonly DatEco[], isLargeMilitarySet: boolean, techRowCount: number): string[] {
  const byKey = new Map<string, { target: UnitCostResource | 'all'; op: string; values: number[] }>();
  for (const e of costEffects) {
    const target = COST_ATTR_RES[e.a!];
    if (!target) continue;
    const key = `${target}:${e.op}`;
    const bucket = byKey.get(key) ?? { target, op: e.op, values: [] };
    if (!bucket.values.some((v) => Math.abs(v - e.v) < 1e-9)) bucket.values.push(e.v);
    byKey.set(key, bucket);
  }

  const addBuckets = [...byKey.values()].filter((b) => b.op === 'add');
  const hasMultiValueSwap =
    addBuckets.length === 2 &&
    byKey.size === 2 &&
    addBuckets.some((b) => b.values.length > 1) &&
    addBuckets.some((b) => b.values.every((v) => v < 0)) &&
    addBuckets.some((b) => b.values.every((v) => v > 0));

  const pills: string[] = [];
  if (hasMultiValueSwap) {
    const dec = addBuckets.find((b) => b.values.every((v) => v < 0))!;
    const inc = addBuckets.find((b) => b.values.every((v) => v > 0))!;
    const fromLabel = dec.target === 'all' ? '费用' : RES_LABEL_ZH[dec.target];
    const toLabel = inc.target === 'all' ? '费用' : RES_LABEL_ZH[inc.target];
    pills.push(`部分${fromLabel}改为${toLabel}`);
  } else {
    for (const bucket of byKey.values()) {
      const name = bucket.target === 'all' ? '总费用' : RES_LABEL_ZH[bucket.target];
      const prefix = isLargeMilitarySet && bucket.target !== 'all' ? `军事单位${name}` : name;
      if (bucket.op === 'set' && bucket.values.length === 1) {
        pills.push(`${prefix}改为 ${formatNumber(bucket.values[0]!)}`);
      } else if (bucket.op === 'mul' && bucket.values.length === 1) {
        const pct = Math.round(bucket.values[0]! * 1000) / 10;
        pills.push(`${prefix} ×${formatNumber(pct)}%`);
      } else if (bucket.op === 'add' && bucket.values.length === 1) {
        const v = bucket.values[0]!;
        pills.push(`${prefix} ${v > 0 ? '+' : '-'}${formatNumber(Math.abs(v))}`);
      } else if (bucket.op === 'add') {
        const allNeg = bucket.values.every((v) => v < 0);
        const allPos = bucket.values.every((v) => v > 0);
        pills.push(allNeg ? `减少${prefix}` : allPos ? `增加${prefix}` : `调整${prefix}`);
      } else if (bucket.op === 'mul') {
        pills.push(`按比例调整${prefix}`);
      } else {
        pills.push(`改写${prefix}`);
      }
    }
  }

  if (techRowCount > 0) pills.push(`同步改费 ${techRowCount} 项科技`);
  return pills;
}

function buildTechSubCostRows(
  datEco: readonly DatEco[],
  core: Pick<Core, 'techById'>,
  ownerCivEn: string | null,
  techCivs: readonly string[],
): TechSubCostRow[] {
  const byTid = new Map<number, { res: UnitCostResource; op: string; v: number }[]>();
  for (const e of datEco) {
    if (e.tid === undefined || !e.what || !TECH_COST_OPS.has(e.op)) continue;
    const res = WHAT_TO_RES[e.what];
    if (!res) continue;
    const list = byTid.get(e.tid) ?? [];
    list.push({ res, op: e.op, v: e.v });
    byTid.set(e.tid, list);
  }

  const out: TechSubCostRow[] = [];
  for (const [tid, mods] of byTid) {
    const target = core.techById[tid];
    if (!target) continue;
    const owned = ownerCivEn ? target.civs.includes(ownerCivEn) : target.civs.some((c) => techCivs.includes(c));
    if (!owned) continue;

    const exact: Cost = { ...target.cost };
    for (const mod of mods) {
      if (exact[mod.res] === undefined && (mod.op === 'mul' || (mod.op === 'add' && mod.v <= 0))) continue;
      exact[mod.res] = Math.max(0, applyEffectValue(exact[mod.res] ?? 0, mod.op, mod.v));
    }
    const after: Cost = {};
    for (const [res, val] of Object.entries(exact)) after[res] = finalizeUnitPrice(val!);
    const deltas = diffEntityCost(target.cost, after);
    if (!deltas.length) continue;

    out.push({
      id: target.id,
      zh: target.zh,
      href: entityCivLink('tech', target.id, ownerCivEn ?? undefined),
      base: target.cost,
      after,
      deltas,
      deltaText: formatCostDeltaText(deltas),
    });
  }
  return out;
}

function resolveProductionBuilding(unit: Unit, civ: string, age: number, techId: number, core: Core, trees: Trees | null, ecoData: EcoDataView): number | null {
  if (trees) {
    const blds = productionBuildings({ core, trees }, { ...DEFAULT_PRODUCTION, civ, age, techs: [techId], rows: [] }, unit);
    return blds.length > 0 ? blds[0]! : null;
  }
  for (const bid of ecoData.units[unit.id]?.at ?? []) {
    const b = core.buildingById[bid];
    if (b && b.civs.includes(civ) && b.age <= age) return bid;
  }
  return null;
}

function buildActionsAndBoundary(params: {
  tech: Tech;
  core: Core;
  trees: Trees | null;
  ecoData: EcoDataView;
  ownerCivEn: string | null;
  scopeKind: TechCostChangeView['scopeKind'];
  hasUndecoded: boolean;
  matchedCount: number;
  unchangedCount: number;
  rows: readonly TechCostRow[];
  techRowsCount: number;
}): { actions: TechCostAction[]; boundaryNote: string } {
  const { tech, core, trees, ecoData, ownerCivEn, scopeKind, hasUndecoded, matchedCount, unchangedCount, rows, techRowsCount } = params;
  const actions: TechCostAction[] = [];

  if (scopeKind === 'building') {
    const featured = [...rows].sort((a, b) => (b.base.Stone ?? 0) - (a.base.Stone ?? 0) || b.age - a.age).slice(0, 2);
    for (const row of featured) actions.push({ kind: 'building', label: `查看${row.zh}详情`, to: row.href });
    return {
      actions,
      boundaryNote: '建筑费用不跳转面向单位训练的持续生产；每行名称与入口均链到对应建筑详情。',
    };
  }

  const unitRows = rows.filter((r) => r.entityKind === 'unit');
  let repRow: TechCostRow | null = null;
  let repBuilding: number | null = null;
  if (ownerCivEn && !hasUndecoded) {
    const orderedCandidates = [...unitRows.filter((r) => r.age <= tech.age), ...unitRows.filter((r) => r.age > tech.age)];
    for (const row of orderedCandidates) {
      const u = core.unitById[row.id];
      if (!u) continue;
      const bid = resolveProductionBuilding(u, ownerCivEn, Math.max(tech.age, u.age), tech.id, core, trees, ecoData);
      if (bid !== null) {
        repRow = row;
        repBuilding = bid;
        break;
      }
    }
  }

  if (ownerCivEn && repRow && repBuilding !== null) {
    const probeAge = Math.max(tech.age, repRow.age);
    actions.push(
      {
        kind: 'army-cost',
        label: '在阵容账本中试算',
        to:
          '/production?' +
          encodeArmyCost({
            civ: ownerCivEn,
            age: String(probeAge),
            rows: [{ unit: repRow.id, qty: '1' }],
            done: [],
            targets: [`t:${tech.id}`],
          }),
      },
      {
        kind: 'production',
        label: '打开持续生产',
        to:
          '/production?' +
          encodeProduction({
            ...DEFAULT_PRODUCTION,
            civ: ownerCivEn,
            age: probeAge,
            techs: [tech.id],
            rows: [{ unit: repRow.id, building: repBuilding, count: '1' }],
          }),
      },
    );
    const parts: string[] = [];
    if (unchangedCount > 0) {
      parts.push(
        `规则命中 ${matchedCount} 个可训练单位，其中 ${unchangedCount} 个无对应资源费用、价格不变，不列入明细；大集合默认只显示代表样例，展开后可查看全部。`,
      );
    }
    if (techRowsCount > 0) parts.push(`同步改费的 ${techRowsCount} 项科技费用变化可在上方折叠区核对。`);
    parts.push('入口自动带入文明与代表单位；是否研究仍由玩家结合研究费、资源供给与队列判断，本站不推荐研究数量或时代。');
    return { actions, boundaryNote: parts.join('') };
  }

  for (const row of unitRows.slice(0, 2)) actions.push({ kind: 'unit', label: `查看${row.zh}详情`, to: row.href });
  return {
    actions,
    boundaryNote: hasUndecoded
      ? '本科技除上述已解码费用变化外，还包含未解码效果，其余效果以游戏说明为准；阵容账本与持续生产暂不直接套用该项折扣，可前往单位详情核对已解码部分。'
      : '当前受影响单位暂未接入持续生产与阵容账本；每行名称与入口均链回对应单位详情。',
  };
}

/** 为无模拟规则的费用编码科技构建正文「费用变化」数据视图。 */
export function buildTechCostChangeView(
  tech: Tech,
  hasSimEntries: boolean,
  core: Core,
  trees: Trees | null = null,
  deps: { dat?: DatFile; eco?: EcoDataView } = {},
): TechCostChangeView | null {
  if (hasSimEntries) return null;
  const dat = deps.dat ?? DAT;
  const ecoData = deps.eco ?? ECO;
  const datEco = dat.techs[tech.en]?.eco ?? [];
  const costEffects = validCostEffectsOf(datEco);
  if (!costEffects.length) return null;

  const ownerCivEn = tech.civs.length === 1 ? tech.civs[0]! : null;
  const ownerCivZh = ownerCivEn ? (civByEn(ownerCivEn)?.zh ?? ownerCivEn) : null;
  const targetIds = [...new Set(costEffects.flatMap((e) => e.t ?? []))];

  const rows: TechCostRow[] = [];
  let matchedCount = 0;
  let unchangedCount = 0;
  let hasUndecoded = datEco.some((e) => e.res !== undefined) || datEco.some((e) => isUnitCostAttribute(e.a) && !TECH_COST_OPS.has(e.op));
  const techInput = { id: tech.id, en: tech.en, zh: tech.zh, effects: datEco };

  const collectEntity = (entityKind: 'unit' | 'building', entity: { id: number; zh: string; age: number; cost: Cost; civs: string[] }) => {
    const owned = ownerCivEn ? entity.civs.includes(ownerCivEn) : entity.civs.some((c) => tech.civs.includes(c));
    if (!owned) return;
    matchedCount++;
    const priced = unitCost(entity, '', Math.max(tech.age, entity.age), [techInput]);
    if (priced.undecoded.length > 0) hasUndecoded = true;
    const deltas = diffEntityCost(entity.cost, priced.cost);
    if (!deltas.length) {
      unchangedCount++;
      return;
    }
    rows.push({
      entityKind,
      id: entity.id,
      zh: entity.zh,
      age: entity.age,
      href: entityCivLink(entityKind, entity.id, ownerCivEn ?? undefined),
      base: entity.cost,
      after: priced.cost,
      deltas,
      deltaText: formatCostDeltaText(deltas),
    });
  };

  for (const id of targetIds) {
    const u = core.unitById[id];
    if (u) collectEntity('unit', u);
    else {
      const b = core.buildingById[id];
      if (b) collectEntity('building', b);
    }
  }
  if (!rows.length) return null;

  const hasUnits = rows.some((r) => r.entityKind === 'unit');
  const hasBuildings = rows.some((r) => r.entityKind === 'building');
  const scopeKind: TechCostChangeView['scopeKind'] = hasUnits && hasBuildings ? 'mixed' : hasBuildings ? 'building' : 'unit';
  const isLargeSet = rows.length > TECH_COST_COLLAPSE_THRESHOLD;
  const previewRows = isLargeSet ? rows.slice(0, TECH_COST_PREVIEW_COUNT) : rows;
  const extraRows = isLargeSet ? rows.slice(TECH_COST_PREVIEW_COUNT) : [];
  const techRows = buildTechSubCostRows(datEco, core, ownerCivEn, tech.civs);

  const countPill =
    scopeKind === 'building'
      ? `${rows.length} 座受影响建筑`
      : isLargeSet
        ? `${rows.length} 个费用变化单位`
        : scopeKind === 'unit'
          ? `${rows.length} 个受影响单位`
          : `${rows.length} 项费用变化`;

  const rulePills = buildRulePills(costEffects, isLargeSet && scopeKind === 'unit', techRows.length);
  if (hasUndecoded) rulePills.push('含未解码效果');
  if (scopeKind === 'building') rulePills.push('链到建筑详情');

  const civPrefix = ownerCivZh ?? '可用文明';
  const introText =
    scopeKind === 'building'
      ? `固定数据已编码；以下按${civPrefix}可建造建筑显示目录基础价与研究后费用，不含文明折扣。`
      : isLargeSet
        ? `固定数据已编码；以下规则摘要按${civPrefix}当前可训练单位过滤，不列他国专属或不可用单位。`
        : `固定数据已编码；以下按${civPrefix}可用单位显示目录基础价与研究后费用，不含文明折扣。`;

  const { actions, boundaryNote } = buildActionsAndBoundary({
    tech,
    core,
    trees,
    ecoData,
    ownerCivEn,
    scopeKind,
    hasUndecoded,
    matchedCount,
    unchangedCount,
    rows,
    techRowsCount: techRows.length,
  });

  return {
    ownerCivEn,
    ownerCivZh,
    scopeKind,
    introText,
    countPill,
    rulePills,
    hasUndecoded,
    matchedCount,
    unchangedCount,
    rows,
    previewRows,
    extraRows,
    techRows,
    actions,
    boundaryNote,
  };
}

/** 将 Cost 按固定资源顺位转成展示数组，过滤 0 与空值。 */
export function orderedCostEntries(cost: Cost): { key: UnitCostResource; value: number }[] {
  const out: { key: UnitCostResource; value: number }[] = [];
  for (const key of UNIT_COST_RESOURCES) {
    const value = cost[key];
    if (value !== undefined && value > 0) out.push({ key, value });
  }
  return out;
}
