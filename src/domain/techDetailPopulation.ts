/**
 * Issue 1499：科技详情正文「人口空间变化」结构化视图模型（纯函数，零硬编码科技 ID）。
 * 按固定 effects.json 中属性 110 的设定值与目录单位归属动态推导，供 TechPopulationChanges 与 SSR 共用。
 */
import { civByEn, type Core } from '../data';
import { ECO, type EcoDataView } from '../data/eco';
import { encodeArmyCost } from './armyCostConfig';
import { entityCivLink } from './civRoute';
import { DAT, type DatFile } from './datEffects';
import { DEFAULT_PRODUCTION, productionBuildings } from './production';
import { validPopulationEffectsOf } from './techDataConsumption';
import type { Tech, Trees, Unit } from './types';

export const TECH_POP_COLLAPSE_THRESHOLD = 12;
export const TECH_POP_PREVIEW_FLAT_COUNT = 6;
const TECH_POP_GROUP_MIN_UNITS = 5;

export interface TechPopulationUnitItem {
  id: number;
  zh: string;
  age: number;
  buildingId: number;
  buildingZh: string;
  href: string;
}

export interface TechPopulationBuildingGroup {
  buildingId: number;
  buildingZh: string;
  units: TechPopulationUnitItem[];
}

export interface TechPopulationRuleGroup {
  value: number;
  pop: number;
  popText: string;
  deltaText: string;
  layout: 'flat' | 'grouped';
  units: TechPopulationUnitItem[];
  previewUnits: TechPopulationUnitItem[];
  extraUnits: TechPopulationUnitItem[];
  subgroups: TechPopulationBuildingGroup[];
  previewSubgroups: TechPopulationBuildingGroup[];
  extraSubgroups: TechPopulationBuildingGroup[];
}

export interface TechPopulationAction {
  kind: 'army-cost';
  label: string;
  to: string;
}

export interface TechPopulationChangeView {
  ownerCivEn: string | null;
  ownerCivZh: string | null;
  introText: string;
  totalUnits: number;
  groups: TechPopulationRuleGroup[];
  action: TechPopulationAction | null;
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** 解析单位在指定文明与时代下可训练的首个建筑 ID，兼顾客户端（trees 已加载）与 SSR（trees 为 null）。 */
export function resolveProductionBuilding(
  unit: Unit,
  civ: string,
  age: number,
  techId: number,
  core: Core,
  trees: Trees | null,
  ecoData: EcoDataView,
): number | null {
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

function lineageMeta(unit: Unit, unitById: Readonly<Record<number, Unit>>): { rootAge: number; rootId: number; depth: number } {
  let cur = unit;
  let depth = 0;
  const seen = new Set<number>([cur.id]);
  while (cur.from_ != null) {
    const parent = unitById[cur.from_];
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cur = parent;
    depth++;
  }
  return { rootAge: cur.age, rootId: cur.id, depth };
}

function sortByLineage(units: readonly Unit[], unitById: Readonly<Record<number, Unit>>): Unit[] {
  const meta = new Map(units.map((u) => [u.id, lineageMeta(u, unitById)]));
  return [...units].sort((a, b) => {
    const ma = meta.get(a.id)!;
    const mb = meta.get(b.id)!;
    return ma.rootAge - mb.rootAge || ma.rootId - mb.rootId || ma.depth - mb.depth || a.age - b.age || a.id - b.id;
  });
}

function cleanBuildingName(unit: Unit, core: Pick<Core, 'buildingById'>): string {
  return core.buildingById[unit.b]?.zh ?? unit.bz.replace(/\s+/g, '');
}

function formatDeltaPercent(pop: number): string {
  const delta = Math.round((pop - 1) * 1000) / 10;
  if (delta < 0) return `-${formatNumber(Math.abs(delta))}%`;
  if (delta > 0) return `+${formatNumber(delta)}%`;
  return '0%';
}

function pickRepresentativeUnit(
  sortedUnits: readonly Unit[],
  tech: Tech,
  ownerCivEn: string,
  core: Core,
  trees: Trees | null,
  ecoData: EcoDataView,
): Unit | null {
  const tiers: readonly Unit[][] = [
    sortedUnits.filter((u) => u.from_ == null && u.age <= tech.age),
    sortedUnits.filter((u) => u.from_ == null && u.age > tech.age),
    sortedUnits.filter((u) => u.from_ != null),
  ];
  for (const tier of tiers) {
    for (const u of tier) {
      if (resolveProductionBuilding(u, ownerCivEn, Math.max(tech.age, u.age), tech.id, core, trees, ecoData) !== null) {
        return u;
      }
    }
  }
  return null;
}

/** 为无模拟规则且含合法人口空间规则的科技构建正文「人口空间变化」数据视图。 */
export function buildTechPopulationChangeView(
  tech: Tech,
  hasSimEntries: boolean,
  core: Core,
  trees: Trees | null = null,
  deps: { dat?: DatFile; eco?: EcoDataView } = {},
): TechPopulationChangeView | null {
  if (hasSimEntries) return null;
  const dat = deps.dat ?? DAT;
  const ecoData = deps.eco ?? ECO;
  const datEco = dat.techs[tech.en]?.eco ?? [];
  const popEffects = validPopulationEffectsOf(datEco);
  if (!popEffects.length) return null;

  const ownerCivEn = tech.civs.length === 1 ? tech.civs[0]! : null;
  const ownerCivZh = ownerCivEn ? (civByEn(ownerCivEn)?.zh ?? ownerCivEn) : null;

  // 按 .dat 顺序确定每个受影响目录单位的最终设定值，确保单单位不跨组重复计数。
  const finalValueByUnit = new Map<number, number>();
  const valueOrder: number[] = [];
  for (const e of popEffects) {
    const vNorm = Math.round(e.v * 1e6) / 1e6;
    if (!valueOrder.includes(vNorm)) valueOrder.push(vNorm);
    for (const uid of e.t ?? []) {
      const u = core.unitById[uid];
      if (!u) continue;
      const owned = ownerCivEn ? u.civs.includes(ownerCivEn) : u.civs.some((c) => tech.civs.includes(c));
      if (!owned) continue;
      finalValueByUnit.set(uid, vNorm);
    }
  }
  if (!finalValueByUnit.size) return null;

  const groups: TechPopulationRuleGroup[] = [];
  const allUnits: Unit[] = [];

  for (const vNorm of valueOrder) {
    const matchedUnits: Unit[] = [];
    for (const [uid, val] of finalValueByUnit) {
      if (val === vNorm) matchedUnits.push(core.unitById[uid]!);
    }
    if (!matchedUnits.length) continue;

    const sorted = sortByLineage(matchedUnits, core.unitById);
    allUnits.push(...sorted);

    const items: TechPopulationUnitItem[] = sorted.map((u) => ({
      id: u.id,
      zh: u.zh,
      age: u.age,
      buildingId: u.b,
      buildingZh: cleanBuildingName(u, core),
      href: entityCivLink('unit', u.id, ownerCivEn ?? undefined),
    }));

    const byBuilding = new Map<number, TechPopulationBuildingGroup>();
    for (const item of items) {
      const existing = byBuilding.get(item.buildingId);
      if (existing) existing.units.push(item);
      else byBuilding.set(item.buildingId, { buildingId: item.buildingId, buildingZh: item.buildingZh, units: [item] });
    }
    const subgroups = [...byBuilding.values()];
    const layout: TechPopulationRuleGroup['layout'] = items.length >= TECH_POP_GROUP_MIN_UNITS && subgroups.length > 1 ? 'grouped' : 'flat';
    const shouldCollapse = items.length > TECH_POP_COLLAPSE_THRESHOLD;

    const pop = Math.round(Math.abs(vNorm) * 1e6) / 1e6;
    groups.push({
      value: vNorm,
      pop,
      popText: `${formatNumber(pop)} 人口`,
      deltaText: formatDeltaPercent(pop),
      layout,
      units: items,
      previewUnits: layout === 'flat' && shouldCollapse ? items.slice(0, TECH_POP_PREVIEW_FLAT_COUNT) : items,
      extraUnits: layout === 'flat' && shouldCollapse ? items.slice(TECH_POP_PREVIEW_FLAT_COUNT) : [],
      subgroups,
      previewSubgroups: layout === 'grouped' && shouldCollapse ? subgroups.slice(0, 1) : subgroups,
      extraSubgroups: layout === 'grouped' && shouldCollapse ? subgroups.slice(1) : [],
    });
  }

  if (!groups.length) return null;

  const sortedAll = sortByLineage(allUnits, core.unitById);
  let action: TechPopulationAction | null = null;
  if (ownerCivEn) {
    const rep = pickRepresentativeUnit(sortedAll, tech, ownerCivEn, core, trees, ecoData);
    if (rep) {
      const probeAge = Math.max(tech.age, rep.age);
      action = {
        kind: 'army-cost',
        label: '在阵容账本中试算',
        to:
          '/production?' +
          encodeArmyCost({
            civ: ownerCivEn,
            age: String(probeAge),
            rows: [{ unit: rep.id, qty: '1' }],
            done: [],
            targets: [`t:${tech.id}`],
          }),
      };
    }
  }

  const introText = ownerCivZh
    ? `固定数据已编码；以下按${ownerCivZh}可用单位过滤，不列他国专属或不可用单位。`
    : '固定数据已编码；以下按可用文明过滤可训练单位，不列他国专属或不可用单位。';

  return {
    ownerCivEn,
    ownerCivZh,
    introText,
    totalUnits: allUnits.length,
    groups,
    action,
  };
}
