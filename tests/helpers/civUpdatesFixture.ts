import payload from '../../data/content/civ-updates.json' with { type: 'json' };
import type { CivUpdateEvent, CivUpdatesData } from '../../src/domain/civUpdates';

export function historyFixture(): CivUpdatesData {
  return structuredClone(payload) as unknown as CivUpdatesData;
}

/** Synthetic renderer fixtures are visibly labelled; never enter production. */
export function conflictHistoryFixture() {
  const data = historyFixture();
  const id = 'fixture-conflict';
  const scope = {
    scopeKind: 'civ' as const,
    providerCivIds: [],
    affectedCivIds: ['Cumans'],
    beneficiary: 'self' as const,
    conditions: ['测试夹具，不是游戏事实'],
  };
  const event: CivUpdateEvent = {
    id,
    versionId: 'de-34055',
    summary: '测试夹具：来源范围冲突',
    verification: 'conflict',
    verificationNote: '仅测试并列展示，不代表真实来源争议。',
    scope,
    civRelations: [{ civId: 'Cumans', relation: 'direct', note: '仅测试' }],
    candidates: [],
    claims: [0, 1].map((number) => {
      const sourceId = `fixture-source-${number}`;
      const sourceEntryId = `fixture-entry-${number}`;
      data.sources.push({ id: sourceId, title: `测试来源${number}`, url: null, category: 'other', capturedAt: null, sourcePublishedAt: null });
      data.sourceEntries.push({
        id: sourceEntryId,
        sourceId,
        sectionId: null,
        group: '测试夹具',
        locator: 'fixture',
        originalText: number === 0 ? '<img src=x onerror=alert(1)> 测试原文A' : '测试原文B',
        rawVersionLabels: [],
        sourceBullet: null,
        legacyKeys: [],
        processing: 'mapped',
        eventIds: [id],
        reason: '仅测试',
        supersedesEntryIds: [],
      });
      return {
        id: `fixture-claim-${number}`,
        verification: 'unverified' as const,
        verificationNote: '仅测试，未核实',
        sourceEntryIds: [sourceEntryId],
        legacyKeys: [],
        effects: [
          {
            id: `fixture-effect-${number}`,
            type: 'numeric' as const,
            entityRefs: [{ unresolvedName: '测试未识别实体', type: 'unit' as const }],
            text: '测试数值',
            conditions: [],
            scope: null,
            attribute: '测试属性',
            before: null,
            after: number,
            delta: null,
            unit: null,
            operation: 'set' as const,
          },
        ],
      };
    }),
  };
  data.events.push(event);
  const civ = data.civilizations.find((row) => row.civId === 'Cumans')!;
  civ.eventIds.push(id);
  civ.eventCount = civ.eventIds.length;
  return data;
}

export function emptyHistoryFixture() {
  const data = historyFixture();
  data.events = [];
  data.legacyMap = [];
  data.meta.legacyBaseline = [];
  data.meta.coverageNote = '测试夹具：空记录状态，不代表生产覆盖。';
  for (const entry of data.sourceEntries) {
    entry.processing = 'pending';
    entry.eventIds = [];
    entry.legacyKeys = [];
    entry.reason = '仅测试空记录状态';
  }
  for (const section of data.sections) if (section.observedEntryCount) section.sourceState = 'pending';
  for (const civ of data.civilizations) {
    civ.historyCoverage = 'none';
    civ.eventIds = [];
    civ.eventCount = 0;
    civ.versionCount = 0;
    civ.unknownVersionEventCount = 0;
    if (civ.sourceState !== 'no-log') civ.sourceState = 'pending';
  }
  return data;
}
