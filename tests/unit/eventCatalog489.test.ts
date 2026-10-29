import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from '../../src/content/events.json';
import { PLAYER_CATALOG } from '../../src/data/players';
import { eventCatalogProblems, readEventCatalog, type EventCatalog } from '../../src/domain/eventCatalog.mjs';
import { validateDocument } from '../../scripts/content-schema.mjs';

if (PLAYER_CATALOG.status !== 'ready') throw new Error('Verified profiles are required for event evidence');
const playerIds = PLAYER_CATALOG.catalog.players.map((player) => player.id);
function catalog(): EventCatalog {
  const state = readEventCatalog(raw, playerIds);
  if (state.status === 'unavailable') throw new Error('The source-announced event fixture must be valid');
  return structuredClone(state.catalog);
}

describe('source-announced manual event catalog', () => {
  it('retains only the exact calendar range, formats and role-local partial roster', () => {
    const data = catalog();
    expect(data.schemaVersion).toBe(1);
    expect(data.checkedAt).toBe('2026-10-29');
    expect(data.events).toHaveLength(1);
    const event = data.events[0]!;
    expect([event.id, event.title, event.game, event.startDate, event.endDate, event.formats]).toEqual([
      'the-garrison-2026',
      'The Garrison 2026',
      '帝国时代 II：决定版',
      '2026-11-25',
      '2026-11-29',
      ['1v1', '3v3-final'],
    ]);
    expect(event.participants.map((participant) => [participant.playerId, participant.roles.map(({ format, team }) => [format, team])])).toEqual([
      [
        'hera',
        [
          ['1v1', null],
          ['3v3-final', 'Team Vitality'],
        ],
      ],
      [
        'liereyy',
        [
          ['1v1', null],
          ['3v3-final', 'Team Vitality'],
        ],
      ],
      ['theviper', [['3v3-final', 'Onimaru Capybaras']]],
    ]);
    expect(data.sources.map(({ id, url, sourcePublishedAt, publishedAt, checkedAt }) => [id, url, sourcePublishedAt, publishedAt, checkedAt])).toEqual([
      ['e1', 'https://www.ageofempires.com/events/the-garrison-2026/', null, null, '2026-10-29'],
      ['e2', 'https://beingesports.com/en/aoe2/news/thegarrison2026', null, null, '2026-10-29'],
      ['e3', 'https://beingesports.com/en/aoe2/news/everyone-attending-the-garrison-2026', null, null, '2026-10-29'],
    ]);
    expect(event.evidence.map(({ sourceId }) => sourceId)).toEqual(['e1', 'e2']);
    for (const participant of event.participants) {
      expect(playerIds).toContain(participant.playerId);
      for (const role of participant.roles) {
        expect(role.evidence.map(({ sourceId }) => sourceId)).toEqual(['e3']);
        expect(role.evidence.every(({ locator }) => locator.trim().length > 0)).toBe(true);
      }
    }
  });

  it('preserves input and distinguishes intentionally empty data from unavailable data', () => {
    const before = JSON.stringify(raw);
    expect(readEventCatalog(raw, playerIds).status).toBe('ready');
    expect(JSON.stringify(raw)).toBe(before);
    const empty = { schemaVersion: 1, checkedAt: '2026-10-29', sources: [], events: [] };
    expect(readEventCatalog(empty, playerIds)).toEqual({ status: 'empty', catalog: empty });
    expect(validateDocument('src/content/events.json', empty).valid).toBe(true);
    for (const invalid of [null, undefined, {}, [], '[]', 0, true]) expect(readEventCatalog(invalid, playerIds)).toEqual({ status: 'unavailable' });
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error('unreadable input');
        },
      },
    );
    expect(readEventCatalog(throwing, playerIds)).toEqual({ status: 'unavailable' });
  });

  it('accepts real leap days and verified cross-midnight publication pairs without converting event dates', () => {
    const data = catalog();
    data.events[0]!.startDate = '2024-02-29';
    data.events[0]!.endDate = '2024-03-01';
    data.sources[0]!.sourcePublishedAt = '2024-02-29T16:00:00Z';
    data.sources[0]!.publishedAt = '2024-03-01';
    expect(eventCatalogProblems(data, playerIds)).toEqual([]);
    expect(validateDocument('src/content/events.json', data).valid).toBe(true);
    expect(data.events[0]!.startDate).toBe('2024-02-29');
  });
});

const eventMutations: { name: string; change: (data: EventCatalog) => void }[] = [
  { name: 'duplicate event ID', change: (data) => data.events.push(structuredClone(data.events[0]!)) },
  { name: 'duplicate source ID', change: (data) => data.sources.push({ ...data.sources[0]!, title: 'Another title' }) },
  { name: 'duplicate participant ID', change: (data) => data.events[0]!.participants.push(structuredClone(data.events[0]!.participants[0]!)) },
  { name: 'duplicate role', change: (data) => data.events[0]!.participants[0]!.roles.push(structuredClone(data.events[0]!.participants[0]!.roles[0]!)) },
  { name: 'unknown profile', change: (data) => (data.events[0]!.participants[0]!.playerId = 'not-collected') },
  { name: 'unknown event source', change: (data) => (data.events[0]!.evidence[0]!.sourceId = 'not-collected') },
  { name: 'unknown role source', change: (data) => (data.events[0]!.participants[0]!.roles[0]!.evidence[0]!.sourceId = 'not-collected') },
  { name: 'missing event source evidence', change: (data) => (data.events[0]!.evidence = []) },
  { name: 'missing role source evidence', change: (data) => (data.events[0]!.participants[0]!.roles[0]!.evidence = []) },
  { name: 'empty evidence locator', change: (data) => (data.events[0]!.evidence[0]!.locator = '') },
  { name: 'role outside event formats', change: (data) => (data.events[0]!.formats = ['1v1']) },
  { name: 'unsupported format', change: (data) => Object.assign(data.events[0]!.participants[0]!.roles[0]!, { format: '2v2' }) },
  { name: '1v1 role claiming team format', change: (data) => Object.assign(data.events[0]!.participants[0]!.roles[0]!, { team: 'Team Vitality' }) },
  { name: '3v3 role without team', change: (data) => Object.assign(data.events[0]!.participants[2]!.roles[0]!, { team: null }) },
  { name: 'impossible start date', change: (data) => (data.events[0]!.startDate = '2026-02-29') },
  { name: 'impossible end date', change: (data) => (data.events[0]!.endDate = '2026-11-31') },
  { name: 'reversed calendar range', change: (data) => (data.events[0]!.endDate = '2026-11-24') },
  { name: 'impossible catalog check date', change: (data) => (data.checkedAt = '2026-02-30') },
  { name: 'impossible source check date', change: (data) => (data.sources[0]!.checkedAt = '2026-04-31') },
  { name: 'source check after catalog check', change: (data) => (data.sources[0]!.checkedAt = '2026-10-30') },
  { name: 'HTTP source', change: (data) => (data.sources[0]!.url = 'http://example.org/announcement') },
  { name: 'unsafe source credentials', change: (data) => (data.sources[0]!.url = 'https://reader:password@example.org/announcement') },
  { name: 'unsafe source scheme', change: (data) => (data.sources[0]!.url = 'javascript:alert(1)') },
  { name: 'unpaired publication date', change: (data) => (data.sources[0]!.publishedAt = '2026-10-20') },
  { name: 'unpaired publication instant', change: (data) => (data.sources[0]!.sourcePublishedAt = '2026-10-20T12:00:00Z') },
  {
    name: 'wrong Beijing publication date',
    change: (data) => Object.assign(data.sources[0]!, { sourcePublishedAt: '2026-10-20T18:00:00Z', publishedAt: '2026-10-20' }),
  },
  {
    name: 'publication after source check',
    change: (data) => Object.assign(data.sources[0]!, { sourcePublishedAt: '2026-10-30T00:00:00Z', publishedAt: '2026-10-30' }),
  },
  { name: 'unverified location field', change: (data) => Object.assign(data.events[0]!, { location: 'Hamburg' }) },
  { name: 'inferred live state field', change: (data) => Object.assign(data.events[0]!, { live: true }) },
  { name: 'unexpected schema version', change: (data) => Object.assign(data, { schemaVersion: 2 }) },
  { name: 'sparse event array', change: (data) => (data.events.length = 2) },
];

describe('invalid event catalogs fail as a whole in runtime and Node', () => {
  it.each(eventMutations)('rejects $name', ({ change }) => {
    const data = catalog();
    change(data);
    expect(readEventCatalog(data, playerIds)).toEqual({ status: 'unavailable' });
    expect(validateDocument('src/content/events.json', data).valid).toBe(false);
  });

  it.each([
    '2026-02-30T12:00:00Z',
    '2026-10-20T24:00:00Z',
    '2026-10-20T12:60:00Z',
    '2026-10-20T12:00:60Z',
    '2026-10-20T12:00:00+24:00',
    '2026-10-20T12:00:00+08:60',
    '2026-10-20T12:00:00',
    '2026-10-20',
  ])('rejects incomplete or impossible source timestamp %s', (timestamp) => {
    const data = catalog();
    data.sources[0]!.sourcePublishedAt = timestamp;
    data.sources[0]!.publishedAt = '2026-10-20';
    expect(readEventCatalog(data, playerIds)).toEqual({ status: 'unavailable' });
    expect(validateDocument('src/content/events.json', data).valid).toBe(false);
  });

  it('loads the generated validator and identical semantic reader in standalone Node ESM', () => {
    const code = `
      import { readFileSync } from 'node:fs';
      import validate from './src/content/schema/compiled/events.mjs';
      import { readEventCatalog } from './src/domain/eventCatalog.mjs';
      import { readPlayerCatalog } from './src/domain/playerCatalog.mjs';
      const players = readPlayerCatalog(JSON.parse(readFileSync('src/content/players.json', 'utf8')), JSON.parse(readFileSync('src/data/civs.json', 'utf8')).map(c => c.en));
      if (players.status !== 'ready') throw new Error('unvalidated player dependency');
      const ids = players.catalog.players.map(p => p.id);
      const raw = JSON.parse(readFileSync('src/content/events.json', 'utf8'));
      if (!validate(raw) || readEventCatalog(raw, ids).status !== 'ready') throw new Error('valid event rejected');
      raw.events[0].endDate = '2026-11-24';
      if (readEventCatalog(raw, ids).status !== 'unavailable') throw new Error('reversed dates escaped');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('the real strict content CLI rejects a schema-shaped but reversed calendar range', () => {
    const root = mkdtempSync(join(tmpdir(), 'events489-content-'));
    try {
      const directory = join(root, 'src/content');
      mkdirSync(directory, { recursive: true });
      const file = join(directory, 'events.json');
      const run = () => spawnSync(process.execPath, ['scripts/check-content.mjs', '--strict', '--root', root], { encoding: 'utf8' });
      writeFileSync(file, JSON.stringify(catalog()));
      const valid = run();
      expect(valid.stderr).toBe('');
      expect(valid.status).toBe(0);
      const bad = catalog();
      bad.events[0]!.endDate = '2026-11-24';
      writeFileSync(file, JSON.stringify(bad));
      const rejected = run();
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('src/content/events.json/events/0/endDate');
      expect(rejected.stderr).toContain('结束日期不能早于开始日期');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
