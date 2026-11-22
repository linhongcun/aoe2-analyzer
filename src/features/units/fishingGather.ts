export * from '../../domain/fishingGatherFacts';
export { formatGatherNumber } from './villagerGather';

/** 速率展示统一四舍五入至四位小数，规避 -0。 */
export function formatGatherRate(value: number): string {
  const rounded = Math.round(value * 1e4 + Number.EPSILON) / 1e4;
  return (rounded === 0 ? 0 : rounded).toFixed(4);
}

/** 携带量保留整数并规避 -0。 */
export function formatCarryValue(value: number): string {
  const rounded = Math.round(value);
  return String(rounded === 0 ? 0 : rounded);
}

/** 将 meta.patch 尾部半角/全角日期规范为全角并拆成版本与日期两段，供 360px 在日期前稳定断行。 */
export function splitPatchSource(patch: string): { label: string; date: string | null } {
  const trimmed = patch.trim();
  const match = /^(.*?)\s*[（(](\d{4}-\d{2}-\d{2})[）)]$/.exec(trimmed);
  if (!match || !match[1]?.trim() || !match[2]) return { label: trimmed, date: null };
  return { label: match[1].trim(), date: `（${match[2]}）` };
}
