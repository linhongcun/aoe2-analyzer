import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../../src/content/events.json';

afterEach(() => {
  vi.doUnmock('../../src/content/events.json');
  vi.doUnmock('../../src/data/players');
  vi.resetModules();
});

describe('actual event data reader fails closed', () => {
  it.each(['unknown-profile', 'unsafe-url', 'impossible-date', 'missing-source'])('returns unavailable without module failure for %s', async (kind) => {
    const data = structuredClone(raw);
    if (kind === 'unknown-profile') data.events[0]!.participants[0]!.playerId = 'not-collected';
    if (kind === 'unsafe-url') data.sources[0]!.url = 'javascript:alert(1)';
    if (kind === 'impossible-date') data.events[0]!.startDate = '2026-02-30';
    if (kind === 'missing-source') data.events[0]!.participants[0]!.roles[0]!.evidence[0]!.sourceId = 'not-collected';
    vi.doMock('../../src/content/events.json', () => ({ default: data }));
    await expect(import('../../src/data/events')).resolves.toMatchObject({ EVENT_CATALOG: { status: 'unavailable' } });
  });

  it('does not publish even valid-looking references when player validation failed', async () => {
    vi.doMock('../../src/data/players', () => ({ PLAYER_CATALOG: { status: 'unavailable' } }));
    const actual = await import('../../src/data/events');
    expect(actual.EVENT_CATALOG).toEqual({ status: 'unavailable' });
  });

  it('does not obtain known IDs from unvalidated raw profiles or invent a default event', async () => {
    vi.doMock('../../src/data/players', () => ({ PLAYER_CATALOG: { status: 'empty', catalog: { checkedAt: '2026-10-29', sources: [], players: [] } } }));
    const actual = await import('../../src/data/events');
    expect(actual.EVENT_CATALOG).toEqual({ status: 'unavailable' });
  });

  it('preserves a valid empty event list as its own accessible UI state input', async () => {
    const empty = { schemaVersion: 1, checkedAt: '2026-10-29', sources: [], events: [] };
    vi.doMock('../../src/content/events.json', () => ({ default: empty }));
    const actual = await import('../../src/data/events');
    expect(actual.EVENT_CATALOG).toEqual({ status: 'empty', catalog: empty });
  });
});
