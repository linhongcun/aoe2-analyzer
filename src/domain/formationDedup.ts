import type { FormationView } from './civFormations';

export interface SharedFormationClause {
  text: string;
  routeTitles: string[];
  allRoutes: boolean;
}

export interface DedupedRouteText {
  reason?: string;
  limitation?: string;
}

export interface FormationDedupResult {
  shared: SharedFormationClause[];
  byRouteId: Record<string, DedupedRouteText>;
}

interface ClausePart {
  body: string;
  punct: string;
  norm: string;
}

const MIN_SHARED_CLAUSE_LEN = 10;
const SPLIT_PUNCT = new Set(['。', '；', '！', '？']);
const OPEN_NEST = new Set(['(', '（', '“']);
const CLOSE_NEST = new Set([')', '）', '”']);

function normalizeClause(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitClauses(raw: string): ClausePart[] {
  const parts: ClausePart[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (OPEN_NEST.has(ch)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (CLOSE_NEST.has(ch)) {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (depth === 0 && SPLIT_PUNCT.has(ch)) {
      let endPunct = i + 1;
      while (endPunct < raw.length && SPLIT_PUNCT.has(raw[endPunct]!)) endPunct += 1;
      const body = raw.slice(start, i).trim();
      const punct = raw.slice(i, endPunct);
      if (body) parts.push({ body, punct, norm: normalizeClause(body) });
      start = endPunct;
      i = endPunct;
      continue;
    }
    i += 1;
  }
  const tail = raw.slice(start).trim();
  if (tail) parts.push({ body: tail, punct: '', norm: normalizeClause(tail) });
  return parts;
}

function formatSharedClause(body: string, punct: string): string {
  const end = punct.endsWith('？') ? '？' : punct.endsWith('！') ? '！' : '。';
  return body.trim() + end;
}

function rebuildWithoutShared(raw: string, sharedSet: ReadonlySet<string>): string {
  const kept = splitClauses(raw).filter((part) => !sharedSet.has(part.norm));
  if (!kept.length) return '';
  let out = '';
  for (let i = 0; i < kept.length; i += 1) {
    const part = kept[i]!;
    let punct = part.punct;
    if (i === kept.length - 1 && punct.endsWith('；')) {
      punct = punct.slice(0, -1) + '。';
    }
    out += part.body + punct;
  }
  return out;
}

type CurrentFormationView = Extract<FormationView, { status: 'current' }>;

/**
 * 渲染层推荐阵容重复免责/前提子句收口（Issue 1285）：
 * 仅针对 status === 'current' 且条数 >= 2 的路线，将出现在 >= 2 条不同路线中的完全相同子句
 * 提炼至顶部共享提示块，并在各路线卡片内去除重复；age-progression 路线仅扫描已渲染的 reason。
 */
export function dedupeFormationClauses(routes: readonly FormationView[]): FormationDedupResult {
  const current = routes.filter((view): view is CurrentFormationView => view.status === 'current');
  if (current.length < 2) return { shared: [], byRouteId: {} };

  const routeTitlesByNorm = new Map<string, string[]>();
  const firstDisplay = new Map<string, string>();
  const order: string[] = [];

  for (const view of current) {
    const { route } = view;
    const fields = route.presentation === 'age-progression' ? [route.reason] : [route.reason, route.limitation];
    const seenInRoute = new Set<string>();
    for (const field of fields) {
      if (!field) continue;
      for (const part of splitClauses(field)) {
        if (part.norm.length < MIN_SHARED_CLAUSE_LEN || seenInRoute.has(part.norm)) continue;
        seenInRoute.add(part.norm);
        const titles = routeTitlesByNorm.get(part.norm) ?? [];
        titles.push(route.title);
        routeTitlesByNorm.set(part.norm, titles);
        if (!firstDisplay.has(part.norm)) {
          firstDisplay.set(part.norm, formatSharedClause(part.body, part.punct));
          order.push(part.norm);
        }
      }
    }
  }

  const sharedNorms = order.filter((norm) => (routeTitlesByNorm.get(norm)?.length ?? 0) >= 2);
  if (!sharedNorms.length) return { shared: [], byRouteId: {} };

  const sharedSet = new Set(sharedNorms);
  const shared: SharedFormationClause[] = sharedNorms.map((norm) => {
    const routeTitles = routeTitlesByNorm.get(norm) ?? [];
    return {
      text: firstDisplay.get(norm)!,
      routeTitles,
      allRoutes: routeTitles.length === current.length,
    };
  });
  const byRouteId: Record<string, DedupedRouteText> = {};

  for (const view of current) {
    const { route } = view;
    const entry: DedupedRouteText = {};
    if (route.reason !== undefined) entry.reason = rebuildWithoutShared(route.reason, sharedSet);
    if (route.presentation !== 'age-progression' && route.limitation !== undefined) {
      entry.limitation = rebuildWithoutShared(route.limitation, sharedSet);
    }
    byRouteId[route.id] = entry;
  }

  return { shared, byRouteId };
}
