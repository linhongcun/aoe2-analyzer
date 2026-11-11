/** 目录列表数字：有限值原样显示（含 0 和负数），非有限显示「—」。 */
export function formatCatalogStat(value: number): string {
  return Number.isFinite(value) ? String(value) : '—';
}
