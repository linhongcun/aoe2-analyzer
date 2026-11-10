/**
 * 科技详情的呈现单位：一条源码规则（或一条组合触发）对应一条摘要。
 * 不改 TECH_EFFECTS / BUILDING_EFFECTS / GENERIC_FX，也不改 techAffects 的模拟器分组。
 */
import { effectParts, unitGroup, type EffectPart } from './affects';
import { BUILDING_EFFECTS, GENERIC_FX, TECH_EFFECTS } from './effects';
import { groupLines, type Families, type LineEntry } from './family';
import type { Building, Effect, Tech, Unit } from './types';

export type TechTypeKind = 'research' | 'unique' | 'regional' | 'unknown';

/** 目录 type 的显式映射。缺失或其它值不当成通用科技。 */
export function techTypeMark(type: string | null | undefined): { kind: TechTypeKind; label: string } {
  if (type === 'Research') return { kind: 'research', label: '通用科技' };
  if (type === 'UniqueTech') return { kind: 'unique', label: '独特科技' };
  if (type === 'RegionalTech') return { kind: 'regional', label: '区域科技' };
  return { kind: 'unknown', label: '类型未标注' };
}

/** 「生命值 +20」读成「+20 生命值」。带空格的加成句保持原文，避免拆错对象。 */
export function leadEffectText(text: string): string {
  const matched = text.match(/^(\S+) ([+-]\d+(?:\.\d+)?%?)$/);
  if (!matched) return text;
  return `${matched[2]} ${matched[1]}`;
}

export function effectSummary(parts: readonly EffectPart[], mapText: (text: string) => string = (text) => text): string {
  const body = parts.map((part) => leadEffectText(mapText(part.text))).join('，');
  return `${body}（作用于下方完整名单）`;
}

function partsFor(techId: number, fx: readonly Effect[]): EffectPart[] {
  if (techId === 437)
    return fx.map((effect) =>
      effect.s === 'rof' ? { icon: 'rof', text: `攻击间隔约 ×${Number((1 / (1 + effect.v)).toFixed(5))}（v:${effect.v}）` } : effectParts([effect])[0]!,
    );
  return effectParts(fx);
}

export interface TechEffectEntry {
  id: string;
  kind: 'base' | 'combo';
  /** 组合触发的完整 req；基础规则为空。 */
  req: readonly string[];
  parts: EffectPart[];
  units: Unit[];
  buildings: Building[];
}

/** 按源码规则逐条收集。相同数值的另一条规则或另一组 req 不并入。 */
export function techEffectEntries(tech: Tech, units: readonly Unit[], buildings: readonly Building[]): TechEffectEntry[] {
  const out: TechEffectEntry[] = [];
  (TECH_EFFECTS[tech.en] ?? []).forEach((rule, index) => {
    const [pred, fx] = rule;
    const parts = partsFor(tech.id, fx);
    const matched = units.filter((unit) => pred(unit));
    if (!parts.length || !matched.length) return;
    out.push({ id: `unit-${index}`, kind: 'base', req: [], parts, units: matched, buildings: [] });
  });
  (BUILDING_EFFECTS[tech.en] ?? []).forEach((rule, index) => {
    const [pred, fx] = rule;
    const parts = partsFor(tech.id, fx);
    const matched = buildings.filter((building) => pred(building));
    if (!parts.length || !matched.length) return;
    out.push({ id: `building-${index}`, kind: 'base', req: [], parts, units: [], buildings: matched });
  });
  GENERIC_FX.forEach((item, index) => {
    if (!item.req.length || !item.req.includes(tech.en)) return;
    const parts = partsFor(tech.id, item.fx);
    const matchedUnits = item.b ? [] : units.filter((unit) => item.pred(unit));
    const matchedBuildings = item.b ? buildings.filter((building) => item.pred(building)) : [];
    if (!parts.length || (!matchedUnits.length && !matchedBuildings.length)) return;
    out.push({
      id: `combo-${index}`,
      kind: 'combo',
      req: [...item.req],
      parts,
      units: matchedUnits,
      buildings: matchedBuildings,
    });
  });
  return out;
}

export interface TechBrowseGroup {
  name: string;
  lines: LineEntry[];
}

/** 查阅分组。它不是另一套效果，也不把一条规则拆成多张效果卡。 */
export function browseAffected(
  units: readonly Unit[],
  buildings: readonly Building[],
  all: Unit[],
  byId: Record<number, Unit>,
  fam: Families,
): { groups: TechBrowseGroup[]; buildings: Building[] } {
  const buckets = new Map<string, Unit[]>();
  for (const unit of units) {
    const name = unitGroup(unit);
    const list = buckets.get(name) ?? [];
    list.push(unit);
    buckets.set(name, list);
  }
  const order = ['步兵', '骑兵', '弓兵', '攻城', '船只', '其他'];
  const groups = order.flatMap((name) => {
    const list = buckets.get(name);
    if (!list?.length) return [];
    return [{ name, lines: groupLines(list, all, byId, fam) }];
  });
  return { groups, buildings: [...buildings] };
}

export function browseGroupCount(view: { groups: readonly { lines: readonly unknown[] }[]; buildings: readonly unknown[] }): number {
  return view.groups.reduce((sum, group) => sum + group.lines.length, 0) + view.buildings.length;
}

export function listedGroupCount(entries: readonly TechEffectEntry[], all: Unit[], byId: Record<number, Unit>, fam: Families): number {
  return entries.reduce((sum, entry) => sum + browseGroupCount(browseAffected(entry.units, entry.buildings, all, byId, fam)), 0);
}

export type TechCivFilterKind = 'all' | 'unknown' | 'unavailable' | 'pending' | 'empty' | 'narrowed';

export interface TechCivFilter {
  kind: TechCivFilterKind;
  entries: TechEffectEntry[];
}

function ownsUnit(unit: Unit, civ: string, status: Record<string, number>): boolean {
  return status['u' + unit.id] === 1 || unit.civs.includes(civ);
}

/** 筛选只决定名单。空选择才是全量；未知、无法研究和没有对象都不退回全量。 */
export function applyTechCivFilter(
  selected: string,
  techCivs: readonly string[],
  knownCivs: readonly string[],
  entries: readonly TechEffectEntry[],
  status: Record<string, number> | null,
): TechCivFilter {
  if (!selected) return { kind: 'all', entries: [...entries] };
  if (!knownCivs.includes(selected)) return { kind: 'unknown', entries: [] };
  if (!techCivs.includes(selected)) return { kind: 'unavailable', entries: [] };
  if (!status) return { kind: 'pending', entries: [] };
  const narrowed = entries
    .map((entry) => ({
      ...entry,
      units: entry.units.filter((unit) => ownsUnit(unit, selected, status)),
      buildings: entry.buildings.filter((building) => building.civs.includes(selected)),
    }))
    .filter((entry) => entry.units.length + entry.buildings.length > 0);
  if (!narrowed.length) return { kind: 'empty', entries: [] };
  return { kind: 'narrowed', entries: narrowed };
}
