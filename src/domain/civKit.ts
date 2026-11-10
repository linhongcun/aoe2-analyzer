/**
 * 文明详情套件的装配。只决定哪些区域单位跟本文明加成或独特科技有关。
 * 不改效果、费用或模拟。无法可靠关联的区域单位省略，不靠新的文案猜测补上。
 */
import { DAT } from './datEffects';
import { regionalUnitLines } from './civUnits';
import { collapse, type Families } from './family';
import { buildLinker, findUniqueTech, linkify } from './linker';
import type { Civ, Tech, Unit } from './types';

/** 一份目标里，本文明可用单位的升级线多过这个数，就当成整类效果，不拿来点名区域单位。 */
const SPECIFIC_LINE_LIMIT = 3;

export function civUniqueUnits(civ: string, units: readonly Unit[], fam: Families) {
  return collapse(
    units.filter((unit) => unit.type === 'UniqueUnit' && unit.civs.includes(civ)),
    fam,
  );
}

export function civUniqueTechs(civ: Civ, techs: readonly Tech[]) {
  return [civ.ct, civ.it].flatMap((text) => {
    const found = findUniqueTech(text, civ.en, [...techs]);
    return found ? [found] : [];
  });
}

/** 与本文明加成或独特科技有关的区域单位线。没有则空数组。 */
export function relatedRegionalLines(civ: Civ, units: readonly Unit[], techs: readonly Tech[]): Unit[][] {
  const lines = regionalUnitLines(civ.en, units);
  if (!lines.length) return [];
  const cited = textRegionalIds(civ, units, techs);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const ids of targetGroups(civ)) {
    const counted = countAvailable(ids, byId, civ.en);
    if (counted.lines > 0 && counted.lines <= SPECIFIC_LINE_LIMIT) {
      for (const id of counted.regional) cited.add(id);
    }
  }
  return lines.filter((line) => line.some((unit) => cited.has(unit.id)));
}

function textRegionalIds(civ: Civ, units: readonly Unit[], techs: readonly Tech[]): Set<number> {
  const linker = buildLinker([...units], [], []);
  const chunks = [civ.bon.join('\n'), civ.tb, civ.ct, civ.it];
  for (const text of [civ.ct, civ.it]) {
    const en = text.split('｜')[1];
    if (!en) continue;
    const tech = techs.find((item) => item.en === en && item.civs.includes(civ.en));
    if (tech?.desc) chunks.push(tech.desc);
  }
  const ids = new Set<number>();
  for (const segment of linkify(chunks.join('\n'), linker)) {
    if (!segment.href?.startsWith('unit/')) continue;
    const id = Number(segment.href.slice('unit/'.length));
    const unit = byIdOf(units, id);
    if (unit?.type === 'RegionalUnit' && unit.civs.includes(civ.en)) ids.add(unit.id);
  }
  return ids;
}

function byIdOf(units: readonly Unit[], id: number): Unit | undefined {
  return units.find((unit) => unit.id === id);
}

function targetGroups(civ: Civ): number[][] {
  const groups: number[][] = [];
  const entry = DAT.civs[civ.en];
  if (entry) {
    const byIdx = new Map<string, number[]>();
    for (const bonus of entry.bonus) {
      const key = String(bonus.idx);
      const ids = byIdx.get(key) ?? [];
      for (const rule of bonus.rules) ids.push(...rule.t);
      for (const eco of bonus.eco) {
        if (eco.t) ids.push(...eco.t);
        if (typeof eco.unit === 'number') ids.push(eco.unit);
      }
      byIdx.set(key, ids);
    }
    groups.push(...byIdx.values());
    const team: number[] = [];
    for (const rule of entry.team.rules) team.push(...rule.t);
    for (const eco of entry.team.eco) {
      if (eco.t) team.push(...eco.t);
      if (typeof eco.unit === 'number') team.push(eco.unit);
    }
    if (team.length) groups.push(team);
  }
  for (const discount of DAT.costDiscounts[civ.en] ?? []) {
    const ids = discount.groups.flatMap((group) => group.units);
    if (ids.length) groups.push(ids);
  }
  for (const text of [civ.ct, civ.it]) {
    const en = text.split('｜')[1];
    const tech = en ? DAT.techs[en] : undefined;
    if (!tech) continue;
    const ids = tech.rules.flatMap((rule) => rule.t);
    if (ids.length) groups.push(ids);
  }
  return groups;
}

function countAvailable(ids: readonly number[], byId: ReadonlyMap<number, Unit>, civ: string) {
  const available: Unit[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const unit = byId.get(id);
    if (!unit || !unit.civs.includes(civ)) continue;
    seen.add(id);
    available.push(unit);
  }
  const have = new Set(available.map((unit) => unit.id));
  const roots = new Set<number>();
  for (const unit of available) {
    let root = unit;
    const walked = new Set<number>([unit.id]);
    while (root.from_ != null && have.has(root.from_) && !walked.has(root.from_)) {
      const next = byId.get(root.from_);
      if (!next) break;
      walked.add(next.id);
      root = next;
    }
    roots.add(root.id);
  }
  return {
    lines: roots.size,
    regional: available.filter((unit) => unit.type === 'RegionalUnit').map((unit) => unit.id),
  };
}
