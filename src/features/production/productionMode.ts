/** Dispatch before the permissive legacy decoder; its URL contract stays unchanged. */
export function productionMode(search: string): { kind: 'legacy' | 'compare' | 'error'; errors: string[] } {
  const params = new URLSearchParams(search);
  const modes = params.getAll('mode');
  const reserved = ['v', 'unit', 'n', 'civs'];
  if (!modes.length && !reserved.some((key) => params.has(key))) return { kind: 'legacy', errors: [] };
  const errors: string[] = [];
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    errors.push('对照链接编码损坏。');
  }
  if (modes.length !== 1 || modes[0] !== 'train-compare') errors.push('对照模式缺失、重复或不支持。');
  return { kind: errors.length ? 'error' : 'compare', errors };
}
