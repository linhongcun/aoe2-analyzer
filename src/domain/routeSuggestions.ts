export interface RouteSuggestion {
  path: string;
  label: string;
}

function normalize(path: string) {
  return path
    .replace(/^#/, '')
    .split(/[?#]/)[0]!
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

/** 只从已登记的入口中选择：前缀优先，其次包含，再次匹配完整路径词。 */
export function suggestRoutes(pathname: string, routes: readonly RouteSuggestion[]): RouteSuggestion[] {
  const path = normalize(pathname);
  if (!path || routes.some((route) => normalize(route.path) === path)) return [];
  const words = path.split(/[-/]+/).filter((word) => word.length >= 3);
  const seen = new Set<string>();
  return routes
    .map((route) => {
      const candidate = normalize(route.path);
      let score = 0;
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        if (candidate.startsWith(path) || path.startsWith(candidate)) score = 3;
        else if (candidate.includes(path) || path.includes(candidate)) score = 2;
        else if (candidate.split(/[-/]+/).some((word) => words.includes(word))) score = 1;
      }
      return { route, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ route }) => route);
}
