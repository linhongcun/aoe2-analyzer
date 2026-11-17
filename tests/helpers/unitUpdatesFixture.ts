import { conflictHistoryFixture } from './civUpdatesFixture';
import { historyFixture } from './civUpdatesFixture';
import type { UnitSourceState } from '../../src/domain/unitUpdates';

export function unitConflictFixture() {
  const data = conflictHistoryFixture();
  const event = data.events.find((row) => row.id === 'fixture-conflict')!;
  event.summary = '测试夹具：单位来源冲突（非真实游戏事实）';
  for (const claim of event.claims) for (const effect of claim.effects) effect.entityRefs = [{ entityId: 'unit/1231' }];
  data.units!.relations.push({
    entityId: 'unit/1231',
    eventId: event.id,
    effectIds: event.claims.flatMap((c) => c.effects.map((f) => f.id)),
    relation: 'direct',
    note: '测试夹具，不代表真实历史。',
  });
  data.units!.rows.find((row) => row.entityId === 'unit/1231')!.eventIds.push(event.id);
  return data;
}

export function unitSourceStateFixture(state: UnitSourceState) {
  const data = historyFixture();
  const row = data.units!.rows.find((r) => r.entityId === 'unit/1372')!;
  row.reason = '测试夹具：' + state + '，不是已完成的真实来源检查。';
  row.sourceState = state;
  row.searchState = state === 'pending' || state === 'processed' ? 'found' : state;
  row.checkedAt = state === 'not-checked' ? null : '2026-11-17T00:00:00Z';
  if (state === 'pending' || state === 'no-log') {
    const sourceId = 'fixture-unit-source';
    const revisionId = 'fixture-unit-' + state;
    const id = sourceId + ':' + revisionId;
    const pending = state === 'pending';
    const entryId = 'fixture-unit-pending-entry';
    data.sources.push({ id: sourceId, title: '测试夹具 · 单位章节状态', category: 'other', url: null, sourcePublishedAt: null, capturedAt: row.checkedAt });
    data.sections.push({
      id,
      sourceId,
      revisionId,
      civId: null,
      entityIds: [row.entityId],
      title: '测试夹具 · 非真实单位来源',
      documentSha256: 'a'.repeat(64),
      sectionTextSha256: 'b'.repeat(64),
      capturedAt: row.checkedAt!,
      sourcePublishedAt: null,
      anchor: '#fixture',
      observedEntryCount: pending ? 1 : 0,
      entryIds: pending ? [entryId] : [],
      sourceState: state,
      reason: row.reason,
      supersedesRevisionId: null,
    });
    if (pending)
      data.sourceEntries.push({
        id: entryId,
        sourceId,
        sectionId: id,
        group: '测试夹具',
        locator: 'fixture-1',
        originalText: '测试夹具：尚未归并的单位原文。',
        rawVersionLabels: ['未登记测试版本'],
        processing: 'pending',
        eventIds: [],
        legacyKeys: [],
        sourceBullet: null,
        reason: row.reason,
        supersedesEntryIds: [],
      });
    row.sectionIds = [id];
    row.sourceEntryCount = pending ? 1 : 0;
  }
  return data;
}
