/** 全局搜索：文明/单位/科技统一索引与打分（纯函数） */
export interface SearchItem {
  kind: 'civ' | 'unit' | 'tech' | 'building' | 'page';
  id: string;
  zh: string;
  en: string;
  href: string;
  sub: string;
  img?: string;
  /** 额外可匹配的名称（如合并进来的精锐版） */
  alt?: string[];
}

export function score(it: SearchItem, q: string): number {
  const main = score1(it, q);
  const a = (it.alt ?? []).map((x) => score1({ ...it, zh: x, en: x }, q) - 5);
  return Math.max(main, ...a, 0);
}
function score1(it: SearchItem, q: string): number {
  const z = it.zh,
    e = it.en.toLowerCase();
  if (!q) return 0;
  if (z === q || e === q) return 100;
  if (z.startsWith(q) || e.startsWith(q)) return 80;
  if (e.split(/[\s-]+/).some((w) => w.startsWith(q))) return 60;
  if (z.includes(q) || e.includes(q)) return 40;
  return 0;
}
const KIND_ORDER = { page: 0, civ: 1, unit: 2, building: 3, tech: 4 } as const;
export function search(items: SearchItem[], raw: string, limit = 30): SearchItem[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  return items
    .map((it) => [score(it, q), it] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind] || a[1].zh.length - b[1].zh.length)
    .slice(0, limit)
    .map(([, it]) => it);
}
