/**
 * issue 1393：建筑详情「各文明满科技对照」纯领域计算引擎（无 React / UI / core.ts / garrisonGeneral.ts 静态依赖）。
 * 100% 复用建筑科技模拟器、有效造价与多人施工领域函数；A 类驻军箭数由调用方按需懒加载后注入。
 */
import { civByEn, type Core } from '../data';
import { buildingAge, militaryTechAge } from './availabilityAge';
import {
  BUILDING_RANK_COL_META_BY_KEY,
  BUILDING_RANK_METRIC_COLS,
  buildingRankAgeBounds,
  buildingRankCategory,
  buildingRankVisibleCols,
  buildBuildingRankConstructionHref,
  buildBuildingRankGarrisonHref,
  buildBuildingRankSimHref,
  filterBuildingCivRankRows,
  formatBuildingRankMetric,
  GARRISON_HOST_SET,
  isBuildingRankBestCell,
  quantizeBuildingRankMetric,
  sortBuildingCivRankRows,
  supportsBuildingCivRank,
  type BuildingOpenSlot,
  type BuildingRankCategory,
  type BuildingRankColMeta,
  type BuildingRankMetricCol,
  type BuildingRankSortCol,
  type SortDir,
} from './buildingCivRankMeta';
import { buildingSimTechs, simulateBuilding } from './buildingSim';
import { finiteOr, fmtTrim, RANK_EPS } from './civRankShared';
import { civStatus } from './civStatus';
import { calculateConstruction, constructionTechs, DEFAULT_CONSTRUCTION } from './construction';
import { DAT } from './datEffects';
import { costSum } from './duel';
import { BUILDING_EFFECTS } from './effects';
import { applicableSimCostTechs, buildSimEffectiveCost, presetCostTechIds } from './simEffectiveCost';
import { makeSimContext, type SimContext } from './simulator';
import type { Building, StatSet, Tech, Trees } from './types';

export {
  BUILDING_RANK_COL_META_BY_KEY,
  BUILDING_RANK_METRIC_COLS,
  buildingRankAgeBounds,
  buildingRankCategory,
  buildingRankVisibleCols,
  buildBuildingRankConstructionHref,
  buildBuildingRankGarrisonHref,
  buildBuildingRankSimHref,
  filterBuildingCivRankRows,
  formatBuildingRankMetric,
  isBuildingRankBestCell,
  quantizeBuildingRankMetric,
  sortBuildingCivRankRows,
  supportsBuildingCivRank,
  type BuildingOpenSlot,
  type BuildingRankCategory,
  type BuildingRankColMeta,
  type BuildingRankMetricCol,
  type BuildingRankSortCol,
  type SortDir,
};

export interface BuildingGarrisonArrowEntry {
  baseProjectiles: number;
  maxProjectiles: number;
  /** 已剔除免费科技（含二次依赖剔除）的手动满驻军科技 ID，直接传给 ?tab=garrison 零报错。 */
  garrisonTechIds: number[];
}

export interface BuildingGarrisonArrowsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  byCiv?: Readonly<Record<string, BuildingGarrisonArrowEntry>>;
}

export interface BuildingCivRankMissingTech {
  id: number;
  zh: string;
  age: number;
}

export interface BuildingCivRankRow {
  civ: string;
  civZh: string;
  earlyUnlock: boolean;
  hp: number;
  atk: number | null;
  rof: number | null;
  rng: number | null;
  ma: number;
  pa: number;
  barm: number;
  gar: number | null;
  baseProj: number | null;
  maxProj: number | null;
  totalCost: number;
  stone: number | null;
  gold: number | null;
  bt: number | null;
  btReason: string | null;
  estimatedCost: boolean;
  missingTechs: BuildingCivRankMissingTech[];
  tags: string[];
  simTechIds: number[];
  garrisonTechIds: number[];
  constructionTechIds: number[];
}

export interface BuildingCivRankChampion {
  col: BuildingRankMetricCol;
  label: string;
  bestDir: SortDir;
  value: number;
  formattedValue: string;
  civs: { civ: string; civZh: string }[];
}

export interface BuildingCivRankResult {
  buildingId: number;
  buildingZh: string;
  category: BuildingRankCategory;
  isGarrisonHost: boolean;
  age: number;
  minAge: number;
  standardAge: number;
  availableAges: number[];
  totalCivCount: number;
  defaultSortCol: BuildingRankMetricCol;
  visibleCols: readonly BuildingRankMetricCol[];
  sortableCols: readonly BuildingRankMetricCol[];
  openSlots: readonly BuildingOpenSlot[];
  desktopMinWidthPx: number;
  garrisonStatus: BuildingGarrisonArrowsState['status'];
  rows: BuildingCivRankRow[];
  bestValues: Partial<Record<BuildingRankMetricCol, number>>;
  champions: BuildingCivRankChampion[];
  commonTags: string[];
  hasEstimatedCost: boolean;
  hasValidConstruction: boolean;
  moveSpeedTechNames: string[];
}

export interface BuildingCivRankContext {
  core: Core;
  trees: Trees;
}

const MIN_CIV_COL_PX = 200;
const OPEN_SLOT_PX = 44;

function displayedStatsDiffer(a: StatSet, b: StatSet, cat: BuildingRankCategory, includeBt: boolean): boolean {
  const diff = (x: number, y: number) => Math.abs(x - y) > RANK_EPS;
  if (diff(a.hp, b.hp) || diff(a.ma, b.ma) || diff(a.pa, b.pa) || diff(a.barm, b.barm)) return true;
  if (cat !== 'D' && diff(a.gar, b.gar)) return true;
  if (includeBt && diff(a.bt, b.bt)) return true;
  if (cat === 'A' || cat === 'B') {
    if (diff(a.atk, b.atk) || diff(a.rng, b.rng) || diff(a.minr, b.minr)) return true;
    if (cat === 'B' && diff(a.rof, b.rof)) return true;
    const keys = new Set([...Object.keys(a.bonus), ...Object.keys(b.bonus)]);
    for (const key of keys) if (diff(a.bonus[key] ?? 0, b.bonus[key] ?? 0)) return true;
  }
  return false;
}

function findGenericBuildingCandidates(simCtx: SimContext, b: Building): Tech[] {
  const out: Tech[] = [];
  for (const [en, rules] of Object.entries(BUILDING_EFFECTS)) {
    const t = simCtx.techByEn[en];
    if (!t || t.type === 'UniqueTech') continue;
    if (rules.some(([pred]) => pred(b))) out.push(t);
  }
  return out;
}

function findMoveSpeedTechNames(simCtx: SimContext, b: Building): string[] {
  const out: string[] = [];
  for (const [en, rules] of Object.entries(BUILDING_EFFECTS)) {
    const t = simCtx.techByEn[en];
    if (!t) continue;
    if (rules.some(([pred, fx]) => pred(b) && fx.some((e) => e.s === 'spd'))) out.push(t.zh);
  }
  return out;
}

function deriveUniqueTechTags(
  ctx: BuildingCivRankContext,
  simCtx: SimContext,
  b: Building,
  civ: string,
  age: number,
  category: BuildingRankCategory,
  hasValidConstruction: boolean,
  garrisonReady: boolean,
  st: Record<string, number>,
  sel: ReadonlySet<number>,
  costPresetIds: ReadonlySet<number>,
  fullStats: StatSet,
): string[] {
  const tags: string[] = [];
  for (const t of ctx.core.techs) {
    if (t.type !== 'UniqueTech' || !t.civs.includes(civ) || !st['t' + t.id] || militaryTechAge(civ, t.id, t.age) > age) continue;
    const dt = DAT.techs[t.en];
    if (!dt) continue;
    const matchingRules = dt.rules.filter((r) => r.b && r.t.includes(b.id));
    const ecoHits = dt.eco.filter((e) => e.t?.includes(b.id));
    const hasPoison = DAT.projectilePoison?.[t.en]?.buildings.includes(b.id) ?? false;
    if (!matchingRules.length && !ecoHits.length && !hasPoison) continue;

    if (matchingRules.length && sel.has(t.id)) {
      const without = new Set(sel);
      without.delete(t.id);
      const baseWithout = simulateBuilding(simCtx, b, civ, age, without);
      if (displayedStatsDiffer(fullStats, baseWithout, category, hasValidConstruction)) {
        tags.push(`${t.zh}（已计入）`);
      } else if (matchingRules.some((r) => r.fx.some((f) => f.s === 'rof'))) {
        tags.push(`未计入：攻速加快 · ${t.zh}`);
      }
    }

    const extraProj = ecoHits.find((e) => e.a === 102 && e.op === 'add' && e.v > 0);
    if (extraProj) {
      tags.push(garrisonReady ? `额外箭矢 +${fmtTrim(extraProj.v, 2)} · ${t.zh}（已计入箭数）` : `额外箭矢 +${fmtTrim(extraProj.v, 2)} · ${t.zh}`);
    }

    const stoneToWood = ecoHits.some((e) => e.a === 104 && e.v > 0) && ecoHits.some((e) => e.a === 106 && e.v < 0);
    if (stoneToWood && costPresetIds.has(t.id)) {
      tags.push(`${t.zh} · 石料改木材（已计入造价）`);
    }

    const regen = ecoHits.find((e) => e.a === 109 && e.v > 0);
    if (regen) tags.push(`未计入：每分钟回复 ${fmtTrim(regen.v, 2)} 生命 · ${t.zh}`);

    const blast = ecoHits.find((e) => e.a === 22 && e.v > 0);
    if (blast) tags.push(`未计入：爆炸半径 +${fmtTrim(blast.v, 2)} · ${t.zh}`);

    if (ecoHits.some((e) => e.a === 24)) tags.push(`未计入：受额外伤害减少 · ${t.zh}`);

    const workRate = ecoHits.find((e) => e.a === 13 && e.op === 'mul' && e.v > 0);
    if (workRate) tags.push(`未计入：训练速度 ×${fmtTrim(workRate.v, 2)} · ${t.zh}`);

    if (hasPoison) tags.push(`未计入：命中后持续伤害 · ${t.zh}`);
  }
  return [...new Set(tags)];
}

/** 计算指定建筑与时代下的全部可建造文明满科技对照数据。 */
export function buildBuildingCivRank(
  ctx: BuildingCivRankContext,
  b: Building,
  requestedAge = 4,
  garrisonArrows: BuildingGarrisonArrowsState = { status: 'idle' },
): BuildingCivRankResult {
  const simCtx = makeSimContext(ctx.core.techs, ctx.trees);
  const { minAge, standardAge, availableAges } = buildingRankAgeBounds(b, ctx.trees);
  const age = Math.max(minAge, Math.min(4, Math.floor(Number.isFinite(requestedAge) ? requestedAge : 4)));
  const category = buildingRankCategory(b);
  const isGarrisonHost = GARRISON_HOST_SET.has(b.id);
  const visibleCols = buildingRankVisibleCols(b);
  const garrisonStatus: BuildingGarrisonArrowsState['status'] = category === 'A' ? garrisonArrows.status : 'idle';
  const garrisonReady = category === 'A' && garrisonStatus === 'ready';

  const buildableCivs = b.civs.filter((c) => buildingAge(b, c, ctx.trees) <= age);
  const genericCandidates = findGenericBuildingCandidates(simCtx, b);
  const unionGenericTechs = new Map<number, Tech>();

  interface PendingRow {
    civ: string;
    civZh: string;
    st: Record<string, number>;
    sel: Set<number>;
    costPresetIds: Set<number>;
    fullStats: StatSet;
    row: BuildingCivRankRow;
    rawTags: string[];
  }

  const pending: PendingRow[] = [];
  let hasValidConstruction = false;

  for (const civ of buildableCivs) {
    const civZh = civByEn(civ)?.zh ?? civ;
    const st = civStatus(ctx.trees, civ);
    const avail = buildingSimTechs(simCtx, b, civ);
    const costTechs = applicableSimCostTechs(simCtx, b, civ);
    const costPresetIds = presetCostTechIds(costTechs, age);
    const sel = new Set<number>([...avail.filter((x) => x.ef && militaryTechAge(civ, x.t.id, x.t.age) <= age).map((x) => x.t.id), ...costPresetIds]);
    const S = simulateBuilding(simCtx, b, civ, age, sel);
    const eff = buildSimEffectiveCost(b, 'building', civ, age, sel, costTechs);
    const totalCost = finiteOr(costSum(eff.cost));
    const estimatedCost = costTechs.some((c) => c.partial || !c.supported) || eff.undecodedTechNames.length > 0 || eff.unsupportedDiscountLabels.length > 0;

    const baseConstructionCfg = { ...DEFAULT_CONSTRUCTION, buildingId: b.id, civ, age, builders: '1', techs: [] as number[] };
    const constructionTechIds = constructionTechs(ctx, baseConstructionCfg)
      .map((t) => t.id)
      .sort((a, c) => a - c);
    const constructionRes = calculateConstruction(ctx, { ...baseConstructionCfg, techs: constructionTechIds });
    const bt = constructionRes.single !== null && Number.isFinite(constructionRes.single) ? constructionRes.single : null;
    if (bt !== null) hasValidConstruction = true;

    const arrowEntry = garrisonReady ? garrisonArrows.byCiv?.[civ] : undefined;
    const baseProj = arrowEntry ? arrowEntry.baseProjectiles : null;
    const maxProj = arrowEntry ? arrowEntry.maxProjectiles : null;
    const garrisonTechIds = arrowEntry ? [...arrowEntry.garrisonTechIds] : [];

    for (const item of costTechs) {
      if (
        item.tech.type !== 'UniqueTech' &&
        item.supported &&
        !item.partial &&
        st['t' + item.tech.id] &&
        militaryTechAge(civ, item.tech.id, item.tech.age) <= age
      ) {
        unionGenericTechs.set(item.tech.id, item.tech);
      }
    }

    pending.push({
      civ,
      civZh,
      st,
      sel,
      costPresetIds,
      fullStats: S,
      rawTags: [],
      row: {
        civ,
        civZh,
        earlyUnlock: buildingAge(b, civ, ctx.trees) < standardAge,
        hp: finiteOr(S.hp),
        atk: category === 'A' || category === 'B' ? finiteOr(S.atk) : null,
        rof: category === 'B' && Number.isFinite(S.rof) && S.rof > 0 ? S.rof : null,
        rng: category === 'A' || category === 'B' ? finiteOr(S.rng) : null,
        ma: finiteOr(S.ma),
        pa: finiteOr(S.pa),
        barm: finiteOr(S.barm),
        gar: category !== 'D' ? finiteOr(S.gar) : null,
        baseProj,
        maxProj,
        totalCost,
        stone: (b.cost.Stone ?? 0) > 0 ? finiteOr(eff.cost.Stone ?? 0) : null,
        gold: (b.cost.Gold ?? 0) > 0 ? finiteOr(eff.cost.Gold ?? 0) : null,
        bt,
        btReason: bt === null ? (constructionRes.errors[0] ?? '当前条件暂不支持施工计算。') : null,
        estimatedCost,
        missingTechs: [],
        tags: [],
        simTechIds: [...sel].sort((a, c) => a - c),
        garrisonTechIds,
        constructionTechIds,
      },
    });
  }

  for (const t of genericCandidates) {
    if (unionGenericTechs.has(t.id)) continue;
    for (const entry of pending) {
      if (!entry.st['t' + t.id] || militaryTechAge(entry.civ, t.id, t.age) > age || !entry.sel.has(t.id)) continue;
      const without = new Set(entry.sel);
      without.delete(t.id);
      const baseWithout = simulateBuilding(simCtx, b, entry.civ, age, without);
      if (displayedStatsDiffer(entry.fullStats, baseWithout, category, hasValidConstruction)) {
        unionGenericTechs.set(t.id, t);
        break;
      }
    }
  }
  const unionList = [...unionGenericTechs.values()].sort((a, c) => a.age - c.age || a.id - c.id);

  for (const entry of pending) {
    entry.row.missingTechs = unionList
      .filter((t) => !(entry.st['t' + t.id] && militaryTechAge(entry.civ, t.id, t.age) <= age))
      .map((t) => ({ id: t.id, zh: t.zh, age: t.age }));
    entry.rawTags = deriveUniqueTechTags(
      ctx,
      simCtx,
      b,
      entry.civ,
      age,
      category,
      hasValidConstruction,
      garrisonReady,
      entry.st,
      entry.sel,
      entry.costPresetIds,
      entry.fullStats,
    );
    entry.row.tags = entry.rawTags;
  }

  let commonTags: string[] = [];
  if (pending.length >= 2) {
    const first = pending[0]!.rawTags;
    commonTags = first.filter((tag) => pending.every((p) => p.rawTags.includes(tag)));
    if (commonTags.length > 0) {
      const commonSet = new Set(commonTags);
      for (const entry of pending) {
        entry.row.tags = entry.rawTags.filter((tag) => !commonSet.has(tag));
      }
    }
  }

  const defaultSortCol: BuildingRankMetricCol = 'hp';
  const rows = sortBuildingCivRankRows(
    pending.map((p) => p.row),
    defaultSortCol,
    BUILDING_RANK_COL_META_BY_KEY[defaultSortCol].bestDir,
  );

  const sortableCols = visibleCols.filter((col) => {
    if ((col === 'baseProj' || col === 'maxProj') && !garrisonReady) return false;
    return rows.some((r) => r[col] !== null);
  });

  const bestValues: Partial<Record<BuildingRankMetricCol, number>> = {};
  const champions: BuildingCivRankChampion[] = [];
  if (rows.length >= 2) {
    for (const col of sortableCols) {
      const meta = BUILDING_RANK_COL_META_BY_KEY[col];
      const valid = rows.filter((r) => r[col] !== null);
      if (valid.length < 2) continue;
      let best = quantizeBuildingRankMetric(col, valid[0]![col]!);
      for (let i = 1; i < valid.length; i++) {
        const v = quantizeBuildingRankMetric(col, valid[i]![col]!);
        if (meta.bestDir === 'desc' ? v > best : v < best) best = v;
      }
      const leaders = valid.filter((r) => Math.abs(quantizeBuildingRankMetric(col, r[col]!) - best) <= RANK_EPS);
      const qualifies = leaders.length < valid.length / 2 || (valid.length === 2 && leaders.length === 1);
      if (!qualifies) continue;
      bestValues[col] = best;
      champions.push({
        col,
        label: meta.championLabel,
        bestDir: meta.bestDir,
        value: best,
        formattedValue: formatBuildingRankMetric(col, best),
        civs: leaders.map((r) => ({ civ: r.civ, civZh: r.civZh })),
      });
    }
  }

  const openSlots: BuildingOpenSlot[] = ['sim'];
  if (isGarrisonHost) openSlots.push('garrison');
  if (hasValidConstruction) openSlots.push('construction');

  const fixedColsWidth = visibleCols.reduce((sum, col) => sum + BUILDING_RANK_COL_META_BY_KEY[col].widthPx, 0) + openSlots.length * OPEN_SLOT_PX;

  return {
    buildingId: b.id,
    buildingZh: b.zh,
    category,
    isGarrisonHost,
    age,
    minAge,
    standardAge,
    availableAges,
    totalCivCount: b.civs.length,
    defaultSortCol,
    visibleCols,
    sortableCols,
    openSlots,
    desktopMinWidthPx: fixedColsWidth + MIN_CIV_COL_PX,
    garrisonStatus,
    rows,
    bestValues,
    champions,
    commonTags,
    hasEstimatedCost: rows.some((r) => r.estimatedCost),
    hasValidConstruction,
    moveSpeedTechNames: findMoveSpeedTechNames(simCtx, b),
  };
}
