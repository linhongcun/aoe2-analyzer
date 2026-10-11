/** 全局搜索：文明/单位/科技统一索引与打分（纯函数） */
export interface SearchItem {
  kind: 'civ' | 'unit' | 'tech' | 'building' | 'bonus' | 'page';
  id: string;
  zh: string;
  en: string;
  href: string;
  sub: string;
  img?: string;
  /** 额外可匹配的名称（如合并进来的精锐版），按名称计分 */
  alt?: string[];
  /** 玩家俗称（src/data/aliases.ts），排在名称前缀之后、名称包含之前 */
  aliases?: string[];
  /** 同分时排在其他结果之后（开局：搜单位名时不压过单位） */
  late?: boolean;
}

/** 归一化：不分大小写、忽略所有空白（「Fast Castle」=「fastcastle」） */
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 分档：名称完全匹配 > 名称前缀 > 别名完全匹配 > 名称包含 > 别名包含 */
export const TIER = { exact: 100, prefix: 80, word: 75, alias: 70, sub: 40, aliasSub: 30 } as const;

export function score(it: SearchItem, raw: string): number {
  const q = norm(raw);
  if (!q) return 0;
  const main = score1(it.zh, it.en, q);
  const a = (it.alt ?? []).map((x) => score1(x, x, q) - 5);
  const al = (it.aliases ?? []).map((x) => {
    const n = norm(x);
    return n === q ? TIER.alias : n.includes(q) ? TIER.aliasSub : 0;
  });
  return Math.max(main, ...a, ...al, 0);
}
function score1(zh: string, en: string, q: string): number {
  const z = norm(zh),
    e = norm(en);
  if (z === q || e === q) return TIER.exact;
  if (z.startsWith(q) || e.startsWith(q)) return TIER.prefix;
  if (
    en
      .toLowerCase()
      .split(/[\s-]+/)
      .some((w) => w && w.startsWith(q))
  )
    return TIER.word;
  if (z.includes(q) || e.includes(q)) return TIER.sub;
  return 0;
}
const KIND_ORDER = { page: 0, civ: 1, unit: 2, building: 3, tech: 4, bonus: 5 } as const;
export function search(items: SearchItem[], raw: string, limit = 30): SearchItem[] {
  const q = norm(raw);
  if (!q) return [];
  return items
    .map((it) => [score(it, q), it] as const)
    .filter(([s]) => s > 0)
    .sort(
      (a, b) => b[0] - a[0] || Number(!!a[1].late) - Number(!!b[1].late) || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind] || a[1].zh.length - b[1].zh.length,
    )
    .slice(0, limit)
    .map(([, it]) => it);
}
