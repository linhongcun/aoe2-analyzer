/**
 * 科技触发型文明加成（b.techFx / CIV_TECH_EXTRAS）的作用对象与数值示例推导（纯领域函数）。
 * 严格复用 core.techs 的 t.civs 判定本文明可研究性，不引入 trees.json；零硬编码文明/单位/科技 ID。
 */
import { effectKey, effectParts, unitGroup, type AffectRow } from './affects';
import { BUILDING_TYPE_ZH } from './buildings';
import { TECH_EFFECTS, type TechExtra } from './effects';
import { applyEffects, baseStats } from './simulator';
import type { Effect, NumStat, StatSet, Tech, Unit } from './types';
import { hasCls } from './unitClass';
import type { CivBonusEnt, Example } from './civBonus';

interface TechTriggerItem {
  tech: Tech;
  delayAge: number | null;
}
interface TechAgeCount {
  age: number;
  count: number;
}
export interface TechTriggerMeta {
  techs: TechTriggerItem[];
  enhances: boolean;
  ageCounts: TechAgeCount[];
  totalAddText: string | null;
}
export interface BonusAffectRow extends AffectRow {
  techTrigger?: TechTriggerMeta;
}
export interface BonusAffectGroup {
  group: string;
  rows: BonusAffectRow[];
}
export type TechExampleKind = 'enhance' | 'chain' | 'independent' | 'stack';
interface TechExampleRow {
  label: string;
  techs: Tech[];
  isBase: boolean;
  delayAge: number | null;
  stats: NumStat[];
  baseValues: number[];
  normalValues?: number[];
  civValues: number[];
  isMul: boolean;
}
interface TechExampleSelfOverlap {
  buildingZh: string | null;
  perTechAdd: number;
  selfTechs: { tech: Tech; delta: number }[];
  combinedTotal: number;
  stat: NumStat;
}
export interface TechExampleBlock {
  kind: TechExampleKind;
  unit: Unit;
  stats: NumStat[];
  delayAge: number | null;
  rows: TechExampleRow[];
  selfOverlap?: TechExampleSelfOverlap;
}

const NUM_STATS: readonly NumStat[] = ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'los', 'rof', 'gar', 'bt', 'minr'];
const NUM_STAT_SET = new Set<string>(NUM_STATS);
const GROUP_ORDER = ['步兵', '骑兵', '弓兵', '攻城', '船只', '其他', ...Object.values(BUILDING_TYPE_ZH).map((x) => x + '建筑')];

export function buildTechByEn(techs: readonly Tech[]): Map<string, Tech> {
  const map = new Map<string, Tech>();
  for (const t of techs) if (!map.has(t.en)) map.set(t.en, t);
  return map;
}

const sortTechs = (list: Tech[]) => list.sort((a, z) => a.age - z.age || a.id - z.id);
const cloneStats = (base: StatSet): StatSet => ({ ...base, bonus: { ...base.bonus }, armc: { ...base.armc } });
const normalTechFx = (techEn: string, u: Unit): Effect[] => (TECH_EFFECTS[techEn] ?? []).filter(([p]) => p(u)).flatMap(([, fx]) => fx);
const isSimpleAddStat = (e: Effect): e is { s: Exclude<NumStat, 'rof'>; op?: 'add'; v: number } =>
  NUM_STAT_SET.has(e.s) && e.s !== 'rof' && (!('op' in e) || e.op === undefined || e.op === 'add');
const effectNumStats = (fx: readonly Effect[]): NumStat[] => {
  const seen = new Set<NumStat>();
  for (const e of fx) if (NUM_STAT_SET.has(e.s)) seen.add(e.s as NumStat);
  return NUM_STATS.filter((s) => seen.has(s));
};
const isAllMulForStats = (fx: readonly Effect[], stats: readonly NumStat[]): boolean => {
  const rel = fx.filter((e) => stats.includes(e.s as NumStat));
  return rel.length > 0 && rel.every((e) => 'op' in e && e.op === 'mul');
};
const readStatValues = (s: StatSet, stats: readonly NumStat[]): number[] =>
  stats.map((k) => {
    const raw = k === 'rof' ? s.rof / s.rofx : s[k];
    return k === 'hp' || k === 'spd' ? raw : Math.round(raw * 100) / 100;
  });
const isTechAvailable = (b: Pick<CivBonusEnt, 'civ' | 'team'>, t: Tech): boolean => b.team || t.civs.includes(b.civ);

/** 收集 b.techFx 中本文明无法研究的前置科技（去重，按 t.age ASC, t.id ASC 排序）。 */
export function bonusUnavailableTechs(b: Pick<CivBonusEnt, 'civ' | 'team' | 'techFx'>, techs?: readonly Tech[]): Tech[] {
  if (!techs?.length || !b.techFx.length || b.team) return [];
  const techByEn = buildTechByEn(techs);
  const seen = new Map<number, Tech>();
  for (const [techEn, extra] of b.techFx) {
    if (extra.b) continue;
    const t = techByEn.get(techEn);
    if (t && !t.civs.includes(b.civ) && !seen.has(t.id)) seen.set(t.id, t);
  }
  return sortTechs([...seen.values()]);
}

/** 检查单条 .dat 记录的 req 中是否存在本文明无法研究的前置科技（去重，按 t.age ASC, t.id ASC 排序）。 */
export function datEntryUnavailableTechs(req: readonly string[], b: Pick<CivBonusEnt, 'civ' | 'team'>, techByEn: ReadonlyMap<string, Tech>): Tech[] {
  if (b.team || !req.length) return [];
  const seen = new Map<number, Tech>();
  for (const name of req) {
    const t = techByEn.get(name);
    if (t && !t.civs.includes(b.civ) && !seen.has(t.id)) seen.set(t.id, t);
  }
  return sortTechs([...seen.values()]);
}

interface ResolvedTechEntry {
  tech: Tech;
  extras: TechExtra[];
}
function collectAvailableTechEntries(b: CivBonusEnt, techs: readonly Tech[]): ResolvedTechEntry[] {
  const techByEn = buildTechByEn(techs);
  const byId = new Map<number, ResolvedTechEntry>();
  for (const [techEn, extra] of b.techFx) {
    if (extra.b) continue;
    const t = techByEn.get(techEn);
    if (!t || !isTechAvailable(b, t)) continue;
    const prev = byId.get(t.id);
    if (prev) prev.extras.push(extra);
    else byId.set(t.id, { tech: t, extras: [extra] });
  }
  return [...byId.values()];
}

function techEnhancesUnits(tech: Tech, units: readonly Unit[], fx: readonly Effect[]): boolean {
  const keys = new Set(fx.map((e) => e.s));
  return keys.size > 0 && units.some((u) => normalTechFx(tech.en, u).some((e) => keys.has(e.s)));
}

/** 按兵种分组、按 (effectKey, orderedUnitIds) 合并科技触发型作用对象。 */
export function buildTechFxAffects(b: CivBonusEnt, units: readonly Unit[], techs: readonly Tech[], civOnly: boolean): BonusAffectGroup[] {
  const entries = collectAvailableTechEntries(b, techs);
  if (!entries.length) return [];
  const own = (civs: string[]) => !civOnly || b.team || civs.includes(b.civ);
  type Bucket = { effect: string; fx: Effect[]; units: Unit[]; techs: Map<number, TechTriggerItem> };
  const groups = new Map<string, Map<string, Bucket>>();

  for (const { tech, extras } of entries) {
    const local = new Map<string, { group: string; efKey: string; fx: Effect[]; units: Unit[]; delayAge: number | null }>();
    for (const u of units) {
      if (!own(u.civs)) continue;
      const matched = extras.filter((x) => x.pred(u));
      if (!matched.length) continue;
      const ef = matched.flatMap((x) => x.fx);
      if (!ef.length) continue;
      const group = unitGroup(u);
      const efKey = effectKey(ef);
      const maxAge = Math.max(...matched.map((x) => x.age));
      const delayAge = maxAge > tech.age ? maxAge : null;
      const k = `${group}\0${efKey}`;
      const hit = local.get(k);
      if (hit) {
        hit.units.push(u);
        if (delayAge !== null && (hit.delayAge === null || delayAge > hit.delayAge)) hit.delayAge = delayAge;
      } else local.set(k, { group, efKey, fx: ef, units: [u], delayAge });
    }
    for (const item of local.values()) {
      const mergeKey = `${item.efKey}\0${item.units.map((u) => u.id).join(',')}`;
      const gMap = groups.get(item.group) ?? new Map<string, Bucket>();
      groups.set(item.group, gMap);
      const prev = gMap.get(mergeKey);
      if (prev) prev.techs.set(tech.id, { tech, delayAge: item.delayAge });
      else gMap.set(mergeKey, { effect: item.efKey, fx: item.fx, units: item.units, techs: new Map([[tech.id, { tech, delayAge: item.delayAge }]]) });
    }
  }

  return [...groups.entries()]
    .sort((a, z) => (GROUP_ORDER.indexOf(a[0]) + 1 || 999) - (GROUP_ORDER.indexOf(z[0]) + 1 || 999))
    .map(([group, map]) => ({
      group,
      rows: [...map.values()].map((bucket): BonusAffectRow => {
        const sortedItems = [...bucket.techs.values()].sort((a, z) => a.tech.age - z.tech.age || a.tech.id - z.tech.id);
        const enhances = sortedItems.every((item) => techEnhancesUnits(item.tech, bucket.units, bucket.fx));
        const ageMap = new Map<number, number>();
        for (const item of sortedItems) ageMap.set(item.tech.age, (ageMap.get(item.tech.age) ?? 0) + 1);
        const ageCounts = [...ageMap.entries()].sort((a, z) => a[0] - z[0]).map(([age, count]) => ({ age, count }));
        let totalAddText: string | null = null;
        if (sortedItems.length > 1 && bucket.fx.length === 1 && isSimpleAddStat(bucket.fx[0]!)) {
          const total = Math.round(bucket.fx[0]!.v * sortedItems.length * 100) / 100;
          totalAddText = total > 0 ? `+${total}` : String(total);
        }
        return {
          effect: bucket.effect,
          parts: effectParts(bucket.fx),
          units: bucket.units,
          buildings: [],
          techTrigger: { techs: sortedItems, enhances, ageCounts, totalAddText },
        };
      }),
    }));
}

interface UnitTechItem {
  tech: Tech;
  fx: Effect[];
  stats: NumStat[];
  delayAge: number | null;
  enhances: boolean;
}
function orderPrereqChain(items: readonly UnitTechItem[], unavailIds: ReadonlySet<number>, techById: ReadonlyMap<number, Tech>): UnitTechItem[] {
  const byId = new Map(items.map((x) => [x.tech.id, x]));
  const legal = items.filter((item) => {
    let pre = item.tech.pre;
    const seen = new Set<number>();
    while (pre !== null && !seen.has(pre)) {
      seen.add(pre);
      if (unavailIds.has(pre)) return false;
      pre = techById.get(pre)?.pre ?? null;
    }
    return true;
  });
  const sorted = [...legal].sort((a, z) => a.tech.age - z.tech.age || a.tech.id - z.tech.id);
  const visited = new Set<number>();
  const ordered: UnitTechItem[] = [];
  const visit = (item: UnitTechItem) => {
    if (visited.has(item.tech.id)) return;
    if (item.tech.pre !== null) {
      const parent = byId.get(item.tech.pre);
      if (parent && !visited.has(parent.tech.id)) visit(parent);
    }
    visited.add(item.tech.id);
    ordered.push(item);
  };
  for (const item of sorted) visit(item);
  return ordered;
}

function isLinearChain(items: readonly UnitTechItem[]): boolean {
  if (items.length < 2) return false;
  const ids = new Set(items.map((x) => x.tech.id));
  return items.filter((x) => x.tech.pre === null || !ids.has(x.tech.pre)).length === 1;
}

function buildChainRows(kind: 'enhance' | 'chain', unit: Unit, stats: NumStat[], chain: readonly UnitTechItem[]): TechExampleRow[] | null {
  const base = baseStats(unit);
  const baseValues = readStatValues(base, stats);
  const rows: TechExampleRow[] = [
    {
      label: '未研究（基础）',
      techs: [],
      isBase: true,
      delayAge: null,
      stats,
      baseValues,
      ...(kind === 'enhance' ? { normalValues: baseValues } : {}),
      civValues: baseValues,
      isMul: false,
    },
  ];
  const normalState = cloneStats(base);
  const civState = cloneStats(base);
  const appliedTechs: Tech[] = [];
  const appliedEffects: Effect[] = [];
  for (const item of chain) {
    const nfx = normalTechFx(item.tech.en, unit);
    if (kind === 'enhance') {
      applyEffects(normalState, nfx);
      applyEffects(civState, [...nfx, ...item.fx]);
      appliedEffects.push(...nfx, ...item.fx);
    } else {
      applyEffects(civState, item.fx);
      appliedEffects.push(...item.fx);
    }
    appliedTechs.push(item.tech);
    const civValues = readStatValues(civState, stats);
    const normalValues = kind === 'enhance' ? readStatValues(normalState, stats) : undefined;
    if (!civValues.every(Number.isFinite) || (normalValues && !normalValues.every(Number.isFinite))) return null;
    rows.push({
      label: appliedTechs.map((t) => t.zh).join(' + '),
      techs: [...appliedTechs],
      isBase: false,
      delayAge: item.delayAge,
      stats,
      baseValues,
      ...(normalValues ? { normalValues } : {}),
      civValues,
      isMul: isAllMulForStats(appliedEffects, stats),
    });
  }
  return rows;
}

function buildStackBlock(unit: Unit, stats: NumStat[], items: readonly UnitTechItem[]): TechExampleBlock | null {
  const base = baseStats(unit);
  const baseValues = readStatValues(base, stats);
  const oneState = cloneStats(base);
  applyEffects(oneState, items[0]!.fx);
  const allState = cloneStats(base);
  for (const item of items) applyEffects(allState, item.fx);
  const oneValues = readStatValues(oneState, stats);
  const allValues = readStatValues(allState, stats);
  if (!oneValues.every(Number.isFinite) || !allValues.every(Number.isFinite)) return null;
  const isMul = isAllMulForStats(items[0]!.fx, stats);
  const rows: TechExampleRow[] = [
    { label: '未研究', techs: [], isBase: true, delayAge: null, stats, baseValues, civValues: baseValues, isMul },
    { label: '任选 1 项', techs: [items[0]!.tech], isBase: false, delayAge: null, stats, baseValues, civValues: oneValues, isMul },
    { label: `全研 ${items.length} 项`, techs: items.map((x) => x.tech), isBase: false, delayAge: null, stats, baseValues, civValues: allValues, isMul },
  ];
  let selfOverlap: TechExampleSelfOverlap | undefined;
  if (stats.length === 1 && items[0]!.fx.length === 1 && isSimpleAddStat(items[0]!.fx[0]!)) {
    const stat = stats[0]!;
    const selfTechs: { tech: Tech; delta: number }[] = [];
    const combined = cloneStats(allState);
    for (const item of items) {
      const nfx = normalTechFx(item.tech.en, unit).filter((e) => e.s === stat);
      if (!nfx.length) continue;
      const probe = cloneStats(base);
      applyEffects(probe, nfx);
      const delta = Math.round((readStatValues(probe, [stat])[0]! - baseValues[0]!) * 100) / 100;
      if (Math.abs(delta) > 1e-9) {
        selfTechs.push({ tech: item.tech, delta });
        applyEffects(combined, nfx);
      }
    }
    if (selfTechs.length) {
      const firstBz = items[0]!.tech.bz;
      selfOverlap = {
        buildingZh: firstBz && items.every((x) => x.tech.bz === firstBz) ? firstBz : null,
        perTechAdd: items[0]!.fx[0]!.v,
        selfTechs,
        combinedTotal: readStatValues(combined, [stat])[0]!,
        stat,
      };
    }
  }
  return { kind: 'stack', unit, stats, delayAge: null, rows, ...(selfOverlap ? { selfOverlap } : {}) };
}

function partitionBuckets(b: CivBonusEnt, units: readonly Unit[], entries: readonly ResolvedTechEntry[]) {
  const buckets: { unitIds: Set<number>; units: Unit[]; entries: ResolvedTechEntry[] }[] = [];
  for (const entry of entries) {
    const matched = units.filter((u) => u.civs.length && (b.team || u.civs.includes(b.civ)) && entry.extras.some((x) => x.pred(u)));
    if (!matched.length) continue;
    const hits = buckets.filter((bk) => matched.some((u) => bk.unitIds.has(u.id)));
    if (!hits.length) {
      buckets.push({ unitIds: new Set(matched.map((u) => u.id)), units: [...matched], entries: [entry] });
      continue;
    }
    const target = hits[0]!;
    for (const other of hits.slice(1)) {
      for (const u of other.units) if (!target.unitIds.has(u.id)) (target.unitIds.add(u.id), target.units.push(u));
      target.entries.push(...other.entries);
      buckets.splice(buckets.indexOf(other), 1);
    }
    for (const u of matched) if (!target.unitIds.has(u.id)) (target.unitIds.add(u.id), target.units.push(u));
    target.entries.push(entry);
  }
  return buckets;
}

const maxDelay = (items: readonly UnitTechItem[]) => {
  const ds = items.map((x) => x.delayAge).filter((a): a is number => a !== null);
  return ds.length ? Math.max(...ds) : null;
};

/** 按互不重叠的受影响单位集分块生成科技触发型数值示例。 */
export function buildTechFxExample(b: CivBonusEnt, units: readonly Unit[], techs: readonly Tech[], prefer?: string): Example | null {
  const entries = collectAvailableTechEntries(b, techs);
  if (!entries.length) return null;
  const unavailableTechs = bonusUnavailableTechs(b, techs);
  const unavailIds = new Set(unavailableTechs.map((t) => t.id));
  const techById = new Map(techs.map((t) => [t.id, t]));
  const techBlocks: TechExampleBlock[] = [];

  for (const bk of partitionBuckets(b, units, entries)) {
    const nonShip = bk.units.filter((u) => !hasCls(u, 16));
    const pool = nonShip.length ? nonShip : bk.units;
    const pick = bk.units.find((u) => u.en === prefer) ?? [...pool].sort((a, z) => z.age - a.age || z.hp - a.hp || a.id - z.id)[0];
    if (!pick) continue;

    const unitItems: UnitTechItem[] = [];
    for (const entry of bk.entries) {
      const matched = entry.extras.filter((x) => x.pred(pick));
      if (!matched.length) continue;
      const fx = matched.flatMap((x) => x.fx);
      const stats = effectNumStats(fx);
      if (!stats.length) continue;
      const maxAge = Math.max(...matched.map((x) => x.age));
      const nfx = normalTechFx(entry.tech.en, pick);
      unitItems.push({
        tech: entry.tech,
        fx,
        stats,
        delayAge: maxAge > entry.tech.age ? maxAge : null,
        enhances: stats.every((s) => nfx.some((e) => e.s === s)),
      });
    }
    if (!unitItems.length) continue;

    const byStats = new Map<string, { stats: NumStat[]; items: UnitTechItem[] }>();
    for (const item of unitItems) {
      const key = item.stats.join(',');
      const g = byStats.get(key);
      if (g) g.items.push(item);
      else byStats.set(key, { stats: item.stats, items: [item] });
    }
    const statGroups = [...byStats.values()];

    if (unitItems.every((x) => x.enhances)) {
      for (const { stats, items } of statGroups) {
        const chain = orderPrereqChain(items, unavailIds, techById);
        const rows = chain.length ? buildChainRows('enhance', pick, stats, chain) : null;
        if (rows) techBlocks.push({ kind: 'enhance', unit: pick, stats, delayAge: maxDelay(chain), rows });
      }
      continue;
    }
    if (statGroups.length === 1 && statGroups[0]!.items.length > 1 && !isLinearChain(statGroups[0]!.items)) {
      const only = statGroups[0]!;
      const ordered = [...only.items].sort((a, z) => a.tech.age - z.tech.age || a.tech.id - z.tech.id);
      if (ordered.every((x) => effectKey(x.fx) === effectKey(ordered[0]!.fx))) {
        const block = buildStackBlock(pick, only.stats, ordered);
        if (block) techBlocks.push(block);
        continue;
      }
    }
    if (statGroups.some((g) => isLinearChain(g.items))) {
      for (const { stats, items } of statGroups) {
        const chain = orderPrereqChain(items, unavailIds, techById);
        const rows = chain.length ? buildChainRows('chain', pick, stats, chain) : null;
        if (rows) techBlocks.push({ kind: 'chain', unit: pick, stats, delayAge: maxDelay(chain), rows });
      }
      continue;
    }

    const base = baseStats(pick);
    const ordered = [...unitItems].sort((a, z) => a.tech.age - z.tech.age || a.tech.id - z.tech.id);
    const rows: TechExampleRow[] = [];
    for (const item of ordered) {
      const s = cloneStats(base);
      applyEffects(s, item.fx);
      const civValues = readStatValues(s, item.stats);
      if (!civValues.every(Number.isFinite)) continue;
      rows.push({
        label: item.tech.zh,
        techs: [item.tech],
        isBase: false,
        delayAge: item.delayAge,
        stats: item.stats,
        baseValues: readStatValues(base, item.stats),
        civValues,
        isMul: isAllMulForStats(item.fx, item.stats),
      });
    }
    if (rows.length) {
      techBlocks.push({ kind: 'independent', unit: pick, stats: [...new Set(ordered.flatMap((x) => x.stats))], delayAge: maxDelay(ordered), rows });
    }
  }

  if (!techBlocks.length) return null;
  const first = techBlocks[0]!;
  return {
    name: first.unit.zh,
    kind: 'unit',
    id: first.unit.id,
    rows: [],
    techBlocks,
    techMode: first.kind,
    ...(unavailableTechs.length ? { unavailableTechs } : {}),
  };
}
