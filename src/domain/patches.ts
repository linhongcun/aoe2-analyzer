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
