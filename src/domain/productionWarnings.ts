import type { DatEco, DatEntry } from './datEffects';
import { VILLAGER_CLASS } from './gameIds';
import type { CivGatherSource } from './realCost';

const GATHER_ATTR_CODE: Record<string, number> = { speed: 5, workRate: 13, carry: 14 };
const GATHER_TASK_UNITS: Record<string, readonly number[]> = {
  farm: [214, 259],
  wood: [123, 218],
  gold: [579, 581],
  stone: [124, 220],
};

function matchesGatherSourceKey(e: DatEco, key: string): boolean {
  if (key.startsWith('res:')) return e.res === Number(key.slice(4));
  const parts = key.split(':');
  const attr = GATHER_ATTR_CODE[parts[parts.length - 1] ?? ''];
  if (attr === undefined || e.a !== attr) return false;
  if (key.startsWith(`class:${VILLAGER_CLASS}:`)) return e.cls === VILLAGER_CLASS;
  if (parts[0] === 'task') {
    const units = GATHER_TASK_UNITS[parts[1] ?? ''];
    return !!units && ((e.unit !== undefined && e.unit !== null && units.includes(e.unit)) || (e.t?.some((id) => units.includes(id)) ?? false));
  }
  return false;
}

/** 解析未计入采集来源在 DAT.civs[civ].bonus 中对应的唯一 civ.bon 序号；来源混合、缺失、含 null 或多值一律返回 null。 */
export function resolveGatherBonusIdx(source: CivGatherSource, entries: readonly DatEntry[]): number | null {
  if (source.techs.length > 0 && source.fromTree) return null;
  const indices = new Set<number>();
  if (source.techs.length > 0) {
    for (const tid of source.techs) {
      const matched = entries.filter((entry) => entry.tech === tid);
      if (!matched.length || matched.some((entry) => typeof entry.idx !== 'number')) return null;
      for (const entry of matched) indices.add(entry.idx!);
    }
  } else if (source.fromTree) {
    const matched = entries.filter((entry) => entry.tech < 0 && entry.eco.some((e) => matchesGatherSourceKey(e, source.key)));
    if (!matched.length || matched.some((entry) => typeof entry.idx !== 'number')) return null;
    for (const entry of matched) indices.add(entry.idx!);
  } else {
    return null;
  }
  return indices.size === 1 ? [...indices][0]! : null;
}

export const isEconomicBonusText = (s: string) => /采集|农民|农田|伐木|采金|采石|矿工|携带|存放/.test(s) && !/免费|费用|成本/.test(s);

const normalizeForMatch = (s: string) => s.replace(/\u2212/g, '-').replace(/\s+/g, '');

/** 合并同源的采集未计入告警与文明加成经济文本告警；首条匹配来源原位输出合并行，避免移动行序或重复原文已有数值。 */
export function mergeProductionEcoWarnings(
  unsupportedSources: readonly CivGatherSource[],
  bonuses: readonly string[],
  appliedSources: ReadonlySet<string>,
  datEntries: readonly DatEntry[],
): string[] {
  const eligible = new Set<number>();
  bonuses.forEach((text, idx) => {
    if (isEconomicBonusText(text) && !appliedSources.has(text)) eligible.add(idx);
  });
  const resolvedIndices: (number | null)[] = [];
  const pairedLabels = new Map<number, string[]>();
  for (const source of unsupportedSources) {
    const idx = resolveGatherBonusIdx(source, datEntries);
    if (idx !== null && eligible.has(idx)) {
      resolvedIndices.push(idx);
      const list = pairedLabels.get(idx) ?? [];
      if (!list.includes(source.label)) list.push(source.label);
      pairedLabels.set(idx, list);
    } else {
      resolvedIndices.push(null);
    }
  }
  const out: string[] = [];
  const emitted = new Set<number>();
  unsupportedSources.forEach((source, i) => {
    const idx = resolvedIndices[i]!;
    if (idx === null) {
      out.push(`${source.label}：采集加成未计入，使用已支持的基础采集模型。`);
      return;
    }
    if (emitted.has(idx)) return;
    emitted.add(idx);
    const text = bonuses[idx]!;
    const normText = normalizeForMatch(text);
    const paired = pairedLabels.get(idx) ?? [];
    const extraNumeric = paired.filter((label) => /[+\u2212-]\d+/.test(label) && !normText.includes(normalizeForMatch(label)));
    const suffix = extraNumeric.length ? `（该加成另含${extraNumeric.join('、')}）` : '';
    out.push(`${text}${suffix}：该文明经济机制未计入，使用已支持的基础采集模型。`);
  });
  bonuses.forEach((text, idx) => {
    if (!eligible.has(idx) || emitted.has(idx)) return;
    out.push(`${text}：该文明经济机制未计入（已单独列明的基础属性加成除外）。`);
  });
  return out;
}
