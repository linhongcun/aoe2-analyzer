import type { HistoryTarget, PatchEntry } from './patches';

export interface ArchivedTarget extends HistoryTarget {
  targetNameZh: string;
  nameEn?: string;
  status: 'retired' | 'upgrade';
}

export interface PatchArchive {
  id: string;
  date: string;
  source: string;
  note: string;
  title?: string;
  announcedAt?: string;
  branch: 'DE';
  releaseType: 'release';
  coverage: string;
  verifiedAt?: string;
  archivedTargets?: ArchivedTarget[];
  entries: PatchEntry[];
}

export interface HistoryRecord {
  patch: PatchArchive;
  entry: PatchEntry;
  relation: 'direct' | 'related';
  relationNote?: string;
}

const sameTarget = (a: { targetType: string; targetId: number | string }, b: Pick<HistoryTarget, 'targetType' | 'targetId'>) =>
  a.targetType === b.targetType && String(a.targetId) === String(b.targetId);

/** Relationships are historical evidence, never inferred from today's technology tree. */
export function historyFor(archives: readonly PatchArchive[], target: HistoryTarget): HistoryRecord[] {
  const records: HistoryRecord[] = [];
  const seen = new Set<string>();
  for (const patch of archives) {
    for (const entry of patch.entries) {
      const direct = sameTarget(entry, target);
      const explicit = entry.relatedTargets?.find((related) => sameTarget(related, target));
      const civRelated = target.targetType === 'civ' && [...entry.civIds, ...(entry.affectedCivIds ?? [])].includes(String(target.targetId));
      const key = `${patch.id}:${entry.id}`;
      if ((!direct && !explicit && !civRelated) || seen.has(key)) continue;
      seen.add(key);
      records.push({
        patch,
        entry,
        relation: direct ? 'direct' : 'related',
        relationNote: direct ? undefined : (explicit?.relation ?? (civRelated ? '该文明在本次改动的明确适用范围内' : undefined)),
      });
    }
  }
  return records.sort((a, b) => b.patch.date.localeCompare(a.patch.date));
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function historyRangeError(query: URLSearchParams): string | undefined {
  const from = query.get('histFrom') ?? '';
  const to = query.get('histTo') ?? '';
  if ((from && !validDate(from)) || (to && !validDate(to))) return '请输入有效的开始日期和结束日期';
  if (from && to && from > to) return '开始日期不能晚于结束日期';
  return undefined;
}

export function filterHistory(records: readonly HistoryRecord[], query: URLSearchParams): HistoryRecord[] {
  if (historyRangeError(query)) return [];
  const kind = query.get('histKind');
  const relation = query.get('histRelation');
  const from = query.get('histFrom');
  const to = query.get('histTo');
  const text = (query.get('histQuery') ?? '').trim().toLowerCase();
  const filtered = records.filter(
    ({ patch, entry, relation: actualRelation }) =>
      (!kind || kind === 'all' || kind === entry.kind) &&
      (!relation || relation === 'all' || relation === actualRelation) &&
      (!from || patch.date >= from) &&
      (!to || patch.date <= to) &&
      (!text ||
        `${entry.targetNameZh} ${entry.summaryZh} ${entry.originalText ?? ''} ${entry.before ?? ''} ${entry.after ?? ''} ${patch.id}`
          .toLowerCase()
          .includes(text)),
  );
  return filtered.sort((a, b) => (query.get('histOrder') === 'oldest' ? 1 : -1) * a.patch.date.localeCompare(b.patch.date));
}

export function archivedTarget(archives: readonly PatchArchive[], target: HistoryTarget) {
  return archives.flatMap((patch) => patch.archivedTargets ?? []).find((entry) => sameTarget(entry, target));
}

export function historyCoverage(archive: PatchArchive) {
  return archive.coverage === 'balance-section' ? '文明平衡栏目' : archive.coverage;
}
