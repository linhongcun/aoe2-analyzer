export interface RouteSuggestion {
  path: string;
  label: string;
  /** 页面英文名，参与拼写容错（issue 315） */
  en?: string;
  /** 常见写法 / 旧路径别名，登记在 sections 或本对象上 */
  aliases?: readonly string[];
}

function normalize(path: string) {
  return path
    .replace(/^#/, '')
    .split(/[?#]/)[0]!
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function compact(path: string) {
  return path.replace(/[-/]/g, '');
}

/** 英文名压成路径形态：Build Orders → build-orders */
function normalizeEn(en: string) {
  return en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** 短词收紧：长度 ≤4 只允许 1，否则 ≤2（issue 315） */
function editLimit(a: string, b: string) {
  return Math.min(a.length, b.length) <= 4 ? 1 : 2;
}

function formsOf(route: RouteSuggestion): string[] {
  const out = [normalize(route.path)];
  if (route.en) out.push(normalizeEn(route.en));
  for (const alias of route.aliases ?? []) out.push(normalize(alias));
  return [...new Set(out.filter(Boolean))];
}

/** 只从已登记的入口中选择：前缀优先，其次包含 / 去连字符全等 / 别名，再次完整词，最后编辑距离。 */
export function suggestRoutes(pathname: string, routes: readonly RouteSuggestion[]): RouteSuggestion[] {
  const path = normalize(pathname);
  if (!path || routes.some((route) => normalize(route.path) === path)) return [];
  // 很短的乱写（如 ab）不做编辑距离，避免误伤
  const allowEdit = path.length >= 3;
  const words = path.split(/[-/]+/).filter((word) => word.length >= 3);
  const seen = new Set<string>();
  return routes
    .map((route) => {
      const candidate = normalize(route.path);
      if (!candidate || seen.has(candidate)) return { route, score: 0 };
      seen.add(candidate);
      let score = 0;
      for (const form of formsOf(route)) {
        // 路径过短时不做前缀/包含（#/ab 不应命中 about-data）
        if (path.length >= 3 && (form.startsWith(path) || path.startsWith(form))) score = Math.max(score, 3);
        else if (compact(form) === compact(path) && compact(path).length >= 3) score = Math.max(score, 3);
        else if (path.length >= 3 && (form.includes(path) || path.includes(form))) score = Math.max(score, 2);
        else if (form.split(/[-/]+/).some((word) => words.includes(word))) score = Math.max(score, 1);
        else if (allowEdit) {
          const limit = editLimit(path, form);
          const dist = levenshtein(path, form, limit);
          if (dist <= limit) score = Math.max(score, 1);
          // 也对去连字符形态做编辑距离：buildorder ↔ buildorders
          const ca = compact(path);
          const cb = compact(form);
          if (ca.length >= 3 && cb.length >= 3) {
            const cLimit = editLimit(ca, cb);
            if (levenshtein(ca, cb, cLimit) <= cLimit) score = Math.max(score, 1);
          }
        }
      }
      return { route, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ route }) => route);
}
