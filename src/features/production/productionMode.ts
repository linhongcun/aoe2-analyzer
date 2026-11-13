/** Dispatch before the permissive legacy decoder; its URL contract stays unchanged. */
export function productionMode(search: string): { kind: 'legacy' | 'compare' | 'total' | 'error'; errors: string[]; subject?: 'total' | 'compare' } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    const subject = search.includes('train-total') ? 'total' : 'compare';
    return { kind: 'error', errors: [subject === 'total' ? '训练总价链接编码损坏。' : '对照链接编码损坏。'], subject };
  }
  const modes = params.getAll('mode');
  if (modes.includes('train-total')) {
    const errors: string[] = [];
    if (modes.length !== 1) errors.push('训练总价模式重复或不支持。');
    return errors.length ? { kind: 'error', errors, subject: 'total' } : { kind: 'total', errors: [] };
  }
  const reserved = ['v', 'unit', 'n', 'civs'];
  if (!modes.length && !reserved.some((key) => params.has(key))) return { kind: 'legacy', errors: [] };
  const errors: string[] = [];
  if (modes.length !== 1 || modes[0] !== 'train-compare') errors.push('对照模式缺失、重复或不支持。');
  if (errors.length) return { kind: 'error', errors, subject: 'compare' };
  return { kind: 'compare', errors: [] };
}
