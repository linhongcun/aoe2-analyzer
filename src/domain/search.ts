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
  /** 文明小字（#44 完全重名单位）：结果里同名单位同时出现时才显示 */
  civNote?: string;
  /** 同分时排在其他结果之后（开局：搜单位名时不压过单位） */
  late?: boolean;
  /** issue 123 全拼（无声调，ü 写 v），构建时由 scripts/pinyin_build.mjs 生成 */
  py?: string;
  /** issue 123 每个字的首字母 */
  pyi?: string;
  /** issue 123 合并进来的精锐版等的拼音（与 alt 对应） */
  altPy?: { py?: string; pyi?: string }[];
}

/** 归一化：不分大小写、忽略所有空白（「Fast Castle」=「fastcastle」） */
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 分档：名称完全匹配 > 名称前缀 > 别名完全匹配 > 名称包含 > 别名包含 > 拼音前缀（issue 123） */
export const TIER = { exact: 100, prefix: 80, word: 75, alias: 70, sub: 40, aliasSub: 30, py: 20 } as const;

export function score(it: SearchItem, raw: string): number {
  const q = norm(raw);
  if (!q) return 0;
  const main = score1(it.zh, it.en, q);
  const a = (it.alt ?? []).map((x) => score1(x, x, q) - 5);
  const al = (it.aliases ?? []).map((x) => {
    const n = norm(x);
    return n === q ? TIER.alias : n.includes(q) ? TIER.aliasSub : 0;
  });
  return Math.max(main, ...a, ...al, pyMatch(it, q) || (it.altPy ?? []).some((x) => pyMatch(x, q)) ? TIER.py : 0, 0);
}
/** issue 123 拼音只认前缀，ü 写 v 和写 u 都算；排在所有中英文命中之后 */
export const pyMatch = (it: { py?: string; pyi?: string }, q: string) => {
  if (!/^[a-z]+$/.test(q)) return false;
  const u = q.replace(/v/g, 'u');
  return [it.py, it.pyi].some((p) => !!p && p.replace(/v/g, 'u').startsWith(u));
};
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
/** issue 145 E：中英文命中占满前 limit 条时，末尾给只靠拼音命中的结果留这么多位（短拼音如「ba」不再被挤掉） */
export const PY_RESERVE = 5;
export function search(items: SearchItem[], raw: string, limit = 30): SearchItem[] {
  const q = norm(raw);
  if (!q) return [];
  const ranked = items
    .map((it) => [score(it, q), it] as const)
    .filter(([s]) => s > 0)
    .sort(
      (a, b) => b[0] - a[0] || Number(!!a[1].late) - Number(!!b[1].late) || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind] || a[1].zh.length - b[1].zh.length,
    )
    .map(([s, it]) => ({ s, it }));
  if (ranked.length <= limit) return ranked.map((x) => x.it);
  // 拼音档已排在最后；只有拼音命中被截掉时，才让出末尾几位给它们（仍排在所有中英文命中之后）
  const py = ranked.filter((x) => x.s === TIER.py);
  const keepPy = Math.min(py.length, PY_RESERVE);
  const head = ranked.filter((x) => x.s !== TIER.py).slice(0, limit - keepPy);
  return [...head, ...py.slice(0, limit - head.length)].map((x) => x.it);
}
