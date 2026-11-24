/**
 * issue 1383：圣物驻守件数 URL 查询参数纯函数（零数据依赖，守住 issue 280 拆包与主包体积）。
 * 严格按原始查询串分段处理，不重编码非 relics 参数、保留顺序、重复键与 %23 编码。
 */
export const DEFAULT_MAX_RELICS = 4;

/** 仅严格接受规范非负整数字符串（0..max），其余含负数、小数、前导零、空白、正号、科学计数、越界、非字符串一律回退 0。 */
export function parseRelicCount(raw: unknown, max = DEFAULT_MAX_RELICS): number {
  if (typeof raw !== 'string' || !Number.isInteger(max) || max < 0) return 0;
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : 0;
}

function splitRawSearch(search: string): string[] {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return raw ? raw.split('&') : [];
}

function isRelicsSegment(segment: string): boolean {
  const eq = segment.indexOf('=');
  const rawKey = eq === -1 ? segment : segment.slice(0, eq);
  if (rawKey === 'relics') return true;
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, ' ')) === 'relics';
  } catch {
    return false;
  }
}

/**
 * 解析查询串中的 relics：
 * - 缺失时返回 { value: 0, dirty: false }；
 * - 重复键、值非法、值为 0、含非规范编码或超 max 一律返回 { value: 0, dirty: true }；
 * - 仅单键且严格等于 `relics=<1..max>` 时返回 { value: n, dirty: false }。
 */
export function readQueryRelics(search: string, max = DEFAULT_MAX_RELICS): { value: number; dirty: boolean } {
  const matches = splitRawSearch(search).filter(isRelicsSegment);
  if (matches.length === 0) return { value: 0, dirty: false };
  if (matches.length > 1) return { value: 0, dirty: true };
  const seg = matches[0]!;
  const eq = seg.indexOf('=');
  if (eq === -1) return { value: 0, dirty: true };
  const rawVal = seg.slice(eq + 1);
  const parsed = parseRelicCount(rawVal, max);
  if (parsed >= 1 && seg === `relics=${parsed}`) return { value: parsed, dirty: false };
  return { value: 0, dirty: true };
}

/** 仅移除查询串中的 relics 键，保留其余参数顺序、重复键与原始编码。 */
export function stripQueryRelics(search: string): string {
  const kept = splitRawSearch(search).filter((seg) => !isRelicsSegment(seg));
  return kept.length ? `?${kept.join('&')}` : '';
}

/** 仅更新查询串中的 relics 键（0 省略；正整数就地替换首个或追加至末尾并去重），不动其余参数。 */
export function withQueryRelics(search: string, relics: number): string {
  const n = Number.isInteger(relics) && relics > 0 ? relics : 0;
  if (n === 0) return stripQueryRelics(search);
  const segments = splitRawSearch(search);
  const out: string[] = [];
  let replaced = false;
  for (const seg of segments) {
    if (isRelicsSegment(seg)) {
      if (!replaced) {
        out.push(`relics=${n}`);
        replaced = true;
      }
      continue;
    }
    out.push(seg);
  }
  if (!replaced) out.push(`relics=${n}`);
  return `?${out.join('&')}`;
}

/** 忽略 relics 键后比较两个查询串是否逐字一致（保留顺序、重复键与原始编码）。 */
export function sameSearchIgnoringRelics(a: string, b: string): boolean {
  return stripQueryRelics(a) === stripQueryRelics(b);
}
