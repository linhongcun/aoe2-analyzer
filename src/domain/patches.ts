export type PatchKind = 'new' | 'buff' | 'nerf' | 'adjust' | 'fix';
export interface HistoryTarget {
  targetType: 'unit' | 'tech' | 'building' | 'civ';
  targetId: number | string;
  targetNameZh?: string;
  relation?: string;
}
export interface PatchEntry {
  id: string;
  kind: PatchKind;
  targetType: string;
  targetId: number | string;
  targetNameZh: string;
  civIds: string[];
  summaryZh: string;
  before?: string;
  after?: string;
  source: string;
  provenance: string;
  originalText?: string;
  verification?: 'official' | 'conflict' | 'unverified';
  changeType?: 'stats' | 'upgrade' | 'tree' | 'bonus' | 'mechanic' | 'fix';
  relatedTargets?: HistoryTarget[];
  affectedCivIds?: string[];
  scopeNote?: string;
  sourceBullet?: string;
}
export const PATCH_KINDS: Record<PatchKind, string> = { new: '新内容', buff: '加强', nerf: '削弱', adjust: '调整', fix: '数据修正' };
/** 玩家可见的档案标记。游戏修复只看 changeType，不占用 kind。 */
export const ARCHIVE_KINDS = ['new', 'buff', 'nerf', 'adjust'] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];
export const ARCHIVE_KIND_LABEL: Record<ArchiveKind, string> = { new: '新内容', buff: '加强', nerf: '削弱', adjust: '调整' };
export const PATCH_TYPES: Record<string, string> = { unit: '单位', tech: '科技', building: '建筑', civ: '文明加成' };
export const PATCH_FILTER_KEYS = ['q', 'kind', 'type', 'civ', 'ctype'] as const;
export const OBJECT_TYPES = ['unit', 'building', 'tech', 'civ'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export function statedCivIds(entry: Pick<PatchEntry, 'civIds' | 'affectedCivIds'>): string[] {
  return [...new Set([...entry.civIds, ...(entry.affectedCivIds ?? [])])];
}

export function civSelection(query: URLSearchParams, knownCivs: readonly string[]) {
  const requested = (query.get('civ') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const known = new Set(knownCivs);
  const recognized = requested.filter((id) => known.has(id));
  const unknown = requested.filter((id) => !known.has(id));
  return { requested, recognized, unknown, allUnknown: requested.length > 0 && recognized.length === 0 };
}

export function filterPatch(entries: readonly PatchEntry[], query: URLSearchParams, knownCivs: readonly string[] = []) {
  const { requested, recognized, allUnknown } = civSelection(query, knownCivs);
  if (allUnknown) return [];
  const kinds = (query.get('kind') ?? '').split(',').filter(Boolean);
  const types = (query.get('type') ?? '').split(',').filter(Boolean);
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const fixOnly = query.get('ctype') === 'fix';
  const recognizedSet = new Set(recognized);
  return entries.filter((entry) => {
    if (fixOnly && entry.changeType !== 'fix') return false;
    if (kinds.length && !kinds.includes(entry.kind)) return false;
    if (types.length && !types.includes(entry.targetType)) return false;
    if (q && !`${entry.targetNameZh} ${entry.summaryZh}`.toLowerCase().includes(q)) return false;
    if (!requested.length) return true;
    const stated = statedCivIds(entry);
    return !stated.length || stated.some((id) => recognizedSet.has(id));
  });
}

export function partitionByStatedCiv<T extends Pick<PatchEntry, 'civIds' | 'affectedCivIds'>>(entries: readonly T[], recognized: readonly string[]) {
  const want = new Set(recognized);
  const stated: T[] = [];
  const unstated: T[] = [];
  for (const entry of entries) {
    const ids = statedCivIds(entry);
    if (!ids.length) unstated.push(entry);
    else if (ids.some((id) => want.has(id))) stated.push(entry);
  }
  return { stated, unstated };
}

export function parseObjectParam(raw: string | null): { type: ObjectType; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const type = raw.slice(0, sep);
  let id = raw.slice(sep + 1).trim();
  try {
    id = decodeURIComponent(id).trim();
  } catch {
    return null;
  }
  if (!id || !(OBJECT_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as ObjectType, id };
}

export interface ObjectCandidate {
  type: ObjectType;
  id: string;
  zh: string;
  en: string;
}

export function searchObjects(query: string, items: readonly ObjectCandidate[], limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return { shown: [] as ObjectCandidate[], total: 0 };
  const matched = items.filter((item) => `${item.zh} ${item.en} ${item.id}`.toLowerCase().includes(q));
  return { shown: matched.slice(0, limit), total: matched.length };
}
export function patchTarget(e: Pick<PatchEntry, 'targetType' | 'targetId'>) {
  return `/${e.targetType}/${encodeURIComponent(String(e.targetId))}`;
}

const TREE_ARROW = String.fromCodePoint(0x2192);

/** 科技树条目的玩家文案。箭头是规定文案，不是界面图标。 */
export function treeChangeLabel(entry: Pick<PatchEntry, 'before' | 'after'>) {
  return entry.before === '未开放' && entry.after === '已开放' ? `未开放 ${TREE_ARROW} 已开放` : `已开放 ${TREE_ARROW} 未开放（移除）`;
}

/** 科技树得失由明确的开放状态判定，不能把普通数值加强/削弱当作得失。 */
export function groupTreeChanges(entries: readonly PatchEntry[]) {
  const groups = new Map<string, PatchEntry[]>();
  for (const entry of entries) {
    if (entry.targetType !== 'tech' && entry.targetType !== 'unit') continue;
    const changed = (entry.before === '未开放' && entry.after === '已开放') || (entry.before === '已开放' && entry.after === '未开放');
    if (!changed) continue;
    for (const civ of new Set(entry.civIds)) {
      const group = groups.get(civ) ?? [];
      group.push(entry);
      groups.set(civ, group);
    }
  }
  return groups;
}
