export type PatchKind = 'new' | 'buff' | 'nerf' | 'adjust' | 'fix';
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
}
export const PATCH_KINDS: Record<PatchKind, string> = { new: '新内容', buff: '加强', nerf: '削弱', adjust: '调整', fix: '数据修正' };
export const PATCH_TYPES: Record<string, string> = { unit: '单位', tech: '科技', building: '建筑', civ: '文明加成' };
export function filterPatch(entries: readonly PatchEntry[], query: URLSearchParams) {
  const selected = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean);
  const civs = selected('civ'),
    kinds = selected('kind'),
    types = selected('type');
  const q = (query.get('q') ?? '').trim().toLowerCase();
  return entries.filter(
    (e) =>
      (!civs.length || !e.civIds.length || e.civIds.some((c) => civs.includes(c))) &&
      (!kinds.length || kinds.includes(e.kind)) &&
      (!types.length || types.includes(e.targetType)) &&
      (!q || `${e.targetNameZh} ${e.summaryZh}`.toLowerCase().includes(q)),
  );
}
export function patchTarget(e: PatchEntry) {
  return `/${e.targetType}/${encodeURIComponent(String(e.targetId))}`;
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
