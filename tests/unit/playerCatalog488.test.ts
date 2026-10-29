import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../../src/content/players.json';
import civs from '../../src/data/raw/civs';
import {
  isCalendarDate,
  playerById,
  playerPath,
  playerRoutes,
  readPlayerCatalog,
  sourceBeijingDate,
  type PlayerCatalog,
} from '../../src/domain/playerCatalog.mjs';
import { validateDocument } from '../../scripts/content-schema.mjs';

const civIds = civs.map((civ) => civ.en);
function catalog(): PlayerCatalog {
  const state = readPlayerCatalog(raw, civIds);
  if (state.status === 'unavailable') throw new Error('The original player fixture must be valid');
  return structuredClone(state.catalog);
}

afterEach(() => {
  vi.doUnmock('../../src/content/players.json');
  vi.resetModules();
});

describe('#488 one verified player catalog', () => {
  it('retains exact public identities, annual achievements and single-match context', () => {
    const data = catalog();
    expect(data.checkedAt).toBe('2026-10-29');
    expect(
      data.players.map((player) => [player.id, player.handle, player.fullName, player.country, player.achievement.year, player.achievement.event]),
    ).toEqual([
      ['hera', 'Hera', 'Hamzah El-Baher', '加拿大', 2026, 'Red Bull Wololo: Londinium'],
      ['liereyy', 'Liereyy', 'Kai Kallinger', '奥地利', 2021, 'Red Bull Wololo IV'],
      ['theviper', 'TheViper', 'Ørjan Larsen', '挪威', 2021, 'Red Bull Wololo V'],
    ]);
    expect(
      data.players.map((player) => [
        player.match.year,
        player.match.game,
        player.match.map,
        player.match.civId,
        player.match.opponentId,
        player.match.opponentCivId,
      ]),
    ).toEqual([
      [2026, '第八局', null, 'Armenians', 'liereyy', 'Wu'],
      [2021, '最后一局', 'Ring Fortress', 'Franks', 'hera', 'Chinese'],
      [2021, '首局', 'Runestones', 'Vikings', 'liereyy', 'Ethiopians'],
    ]);
    for (const player of data.players) {
      expect(player.achievement.result).toBe('冠军');
      for (const evidence of [...player.identityEvidence, ...player.achievement.evidence, ...player.match.evidence]) {
        expect(data.sources.some((source) => source.id === evidence.sourceId)).toBe(true);
        expect(evidence.locator.trim()).not.toBe('');
      }
    }
  });

  it('derives exact member paths without substituting a default for unknown or malformed IDs', () => {
    const data = catalog();
    expect(playerRoutes(data)).toEqual(data.players.map(playerPath));
    for (const player of data.players) expect(playerById(data, player.id)).toBe(player);
    for (const id of ['unknown', 'Hera', 'hera/', 'hera/extra', 'hera?tab=pro', ':id', '%68era', '', null, undefined, 1]) {
      expect(playerById(data, id), String(id)).toBeUndefined();
    }
  });

  it('does not alter trusted input and distinguishes valid empty data from unavailable data', () => {
    const before = JSON.stringify(raw);
    expect(readPlayerCatalog(raw, civIds).status).toBe('ready');
    expect(JSON.stringify(raw)).toBe(before);
    const empty = { checkedAt: raw.checkedAt, sources: [], players: [] };
    expect(readPlayerCatalog(empty, civIds)).toEqual({ status: 'empty', catalog: empty });
    expect(validateDocument('src/content/players.json', empty).valid).toBe(true);
    for (const value of [null, undefined, {}, [], '', '[]', 0, true]) expect(readPlayerCatalog(value, civIds)).toEqual({ status: 'unavailable' });
  });

  it('keeps exact article instants separate from annual achievements and converts cross-midnight Beijing dates', () => {
    expect(catalog().sources.map((source) => [source.sourcePublishedAt, source.publishedAt])).toEqual([
      ['2026-01-26T12:00:27-08:00', '2026-01-27'],
      ['2026-04-07T10:29:54Z', '2026-04-07'],
      ['2021-06-28T17:03:58Z', '2021-06-29'],
      ['2021-07-13T14:12:05Z', '2021-07-13'],
      ['2021-09-21T07:00:06Z', '2021-09-21'],
    ]);
    for (const source of catalog().sources) expect(sourceBeijingDate(source.sourcePublishedAt)).toBe(source.publishedAt);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(sourceBeijingDate('2024-02-29T16:00:00Z')).toBe('2024-03-01');
    expect(sourceBeijingDate('2026-10-29T00:00:00+08:00')).toBe('2026-10-29');
    const data = catalog();
    data.sources[0]!.sourcePublishedAt = null;
    data.sources[0]!.publishedAt = null;
    expect(readPlayerCatalog(data, civIds).status).toBe('ready');
  });
});

const mutations: { name: string; change: (data: PlayerCatalog) => void }[] = [
  { name: 'duplicate player ID with different content', change: (data) => data.players.push({ ...data.players[0]!, handle: 'Different name' }) },
  { name: 'duplicate source ID with different title', change: (data) => data.sources.push({ ...data.sources[0]!, title: 'Different source' }) },
  { name: 'unknown identity source', change: (data) => (data.players[0]!.identityEvidence[0]!.sourceId = 'not-collected') },
  { name: 'unknown achievement source', change: (data) => (data.players[0]!.achievement.evidence[0]!.sourceId = 'not-collected') },
  { name: 'unknown match source', change: (data) => (data.players[0]!.match.evidence[0]!.sourceId = 'not-collected') },
  { name: 'unknown player opponent', change: (data) => (data.players[0]!.match.opponentId = 'not-collected') },
  { name: 'self opponent', change: (data) => (data.players[0]!.match.opponentId = data.players[0]!.id) },
  { name: 'unknown civilization', change: (data) => (data.players[0]!.match.civId = 'NotACivilization') },
  { name: 'unknown opponent civilization', change: (data) => (data.players[0]!.match.opponentCivId = 'NotACivilization') },
  { name: 'HTTP public source', change: (data) => (data.sources[0]!.url = data.sources[0]!.url.replace('https:', 'http:')) },
  { name: 'source URL credentials', change: (data) => (data.sources[0]!.url = 'https://reader:password@www.redbull.com/source') },
  { name: 'unverified favorite field', change: (data) => Object.assign(data.players[0]!, { favorite: 'Armenians' }) },
  { name: 'inferred rating field', change: (data) => Object.assign(data.players[0]!, { rating: 10 }) },
  { name: 'missing required full name', change: (data) => Reflect.deleteProperty(data.players[0]!, 'fullName') },
  { name: 'missing fact evidence', change: (data) => (data.players[0]!.match.evidence = []) },
  { name: 'missing evidence locator', change: (data) => (data.players[0]!.identityEvidence[0]!.locator = '') },
  { name: 'impossible root calendar date', change: (data) => (data.checkedAt = '2026-02-30') },
  { name: 'impossible source calendar date', change: (data) => (data.sources[0]!.checkedAt = '2026-02-30') },
  { name: 'source check after catalog check', change: (data) => (data.sources[0]!.checkedAt = '2026-10-30') },
  { name: 'source check before publication', change: (data) => (data.sources[0]!.checkedAt = '2026-01-26') },
  { name: 'Beijing publication mismatch', change: (data) => (data.sources[0]!.publishedAt = '2026-01-26') },
  { name: 'only publication date unknown', change: (data) => (data.sources[0]!.publishedAt = null) },
  { name: 'only source instant unknown', change: (data) => (data.sources[0]!.sourcePublishedAt = null) },
  { name: 'future achievement year', change: (data) => (data.players[0]!.achievement.year = 2027) },
  { name: 'future match year', change: (data) => (data.players[0]!.match.year = 2027) },
  { name: 'sparse player array', change: (data) => (data.players.length = 4) },
];

describe('#488 malformed catalogs fail closed in both Node and the real browser reader', () => {
  it.each(mutations)('rejects $name as a whole catalog', ({ change }) => {
    const data = catalog();
    change(data);
    expect(readPlayerCatalog(data, civIds)).toEqual({ status: 'unavailable' });
    expect(validateDocument('src/content/players.json', data).valid).toBe(false);
  });

  it.each([
    '2026-02-30T12:00:00Z',
    '2026-02-29T12:00:00Z',
    '2026-01-26T24:00:00Z',
    '2026-01-26T12:60:00Z',
    '2026-01-26T12:00:60Z',
    '2026-01-26T12:00:00+24:00',
    '2026-01-26T12:00:00+08:60',
    '2026-01-26T12:00:00',
    '2026-01-26',
  ])('rejects impossible or incomplete source timestamp %s', (value) => {
    expect(sourceBeijingDate(value)).toBeNull();
    const data = catalog();
    data.sources[0]!.sourcePublishedAt = value;
    expect(readPlayerCatalog(data, civIds)).toEqual({ status: 'unavailable' });
    expect(validateDocument('src/content/players.json', data).valid).toBe(false);
  });

  it.each(
    mutations.filter(({ name }) =>
      [
        'duplicate player ID with different content',
        'unknown match source',
        'unknown civilization',
        'Beijing publication mismatch',
        'HTTP public source',
      ].includes(name),
    ),
  )('actual raw JSON boundary returns unavailable without throwing for $name', async ({ change }) => {
    const data = catalog();
    change(data);
    vi.doMock('../../src/content/players.json', () => ({ default: data }));
    const actual = await import('../../src/data/players');
    expect(actual.PLAYER_CATALOG).toEqual({ status: 'unavailable' });
  });

  it('actual raw JSON boundary keeps an intentionally empty catalog distinct', async () => {
    const empty = { checkedAt: '2026-10-29', sources: [], players: [] };
    vi.doMock('../../src/content/players.json', () => ({ default: empty }));
    const actual = await import('../../src/data/players');
    expect(actual.PLAYER_CATALOG).toEqual({ status: 'empty', catalog: empty });
  });

  it('Node ESM loads the same compiled validator and semantic reader used by the browser', () => {
    const code = `
      import { readFileSync } from 'node:fs';
      import validate from './src/content/schema/compiled/players.mjs';
      import { readPlayerCatalog } from './src/domain/playerCatalog.mjs';
      const raw = JSON.parse(readFileSync('src/content/players.json', 'utf8'));
      const civs = JSON.parse(readFileSync('src/data/civs.json', 'utf8')).map(c => c.en);
      if (!validate(raw) || readPlayerCatalog(raw, civs).status !== 'ready') throw new Error('valid catalog failed');
      raw.players[0].match.civId = 'Unknown';
      if (readPlayerCatalog(raw, civs).status !== 'unavailable') throw new Error('unknown civ escaped');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
