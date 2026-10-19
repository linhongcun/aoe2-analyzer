import { describe, expect, it } from 'vitest';
import {
  TEAM_BONUS_DATA,
  decodeTeamBonuses,
  defaultTeamBonusConfig,
  encodeTeamBonuses,
  setTeamResearched,
  teamBonusErrors,
  teamBonusSources,
  teamTargetMatch,
  teamTechnologyStatus,
  updateTeamRoster,
  type TeamBonusConfig,
  type TeamTargetSource,
} from '../../src/domain/teamBonuses';

const config = (changes: Partial<TeamBonusConfig> = {}): TeamBonusConfig => ({ ...defaultTeamBonusConfig(), ...changes });
const query = (changes: Record<string, string> = {}) => {
  const params = new URLSearchParams(encodeTeamBonuses(config()));
  for (const [key, value] of Object.entries(changes)) params.set(key, value);
  return '?' + params.toString();
};
const target: TeamTargetSource = {
  effectId: 1,
  targetUnits: [4],
  targetBuildings: [87],
  productionUnits: [24],
  kinds: ['production'],
  effectTypes: ['production'],
  targetCoverage: 'complete',
  notes: [],
};

describe('#228 roster and source identity', () => {
  it('includes the sole player’s own team bonus', () => {
    const sources = teamBonusSources(config());
    expect(sources.permanent.map((row) => row.source.civ)).toEqual(['Franks']);
    expect(sources.permanent[0]!.providers).toEqual([{ player: 1, civ: 'Franks' }]);
  });
  it('merges a repeated source and retains every ordered player slot', () => {
    const rows = teamBonusSources(config({ players: ['Berbers', 'Berbers', 'Franks', 'Berbers'] }));
    expect(rows.permanent).toHaveLength(2);
    const berbers = rows.permanent.find((row) => row.source.civ === 'Berbers')!;
    expect(berbers.providers.map((provider) => provider.player)).toEqual([1, 2, 4]);
    const kasbah = rows.technologies.find((row) => row.source.id === 578)!;
    expect(kasbah.providers.map((provider) => provider.player)).toEqual([1, 2, 4]);
  });
  it('keeps distinct sources even when they could affect a similar object', () => {
    const rows = teamBonusSources(config({ players: ['Britons', 'Saracens', 'Vietnamese', 'Berbers'] }));
    expect(new Set(rows.permanent.map((row) => row.source.id)).size).toBe(4);
  });
  it('exports all fixed-version civilization sources exactly once', () => {
    expect(TEAM_BONUS_DATA.permanent).toHaveLength(56);
    expect(new Set(TEAM_BONUS_DATA.permanent.map((row) => row.civ)).size).toBe(56);
    expect(TEAM_BONUS_DATA.meta.engineVerifiedInPinnedBuild).toBe(false);
  });
  it('recognizes raw team technologies without treating Silk Road as a team effect', () => {
    expect(TEAM_BONUS_DATA.technologies.map((row) => row.id)).toEqual([578, 690, 1380]);
    expect(teamBonusSources(config({ players: ['Italians'] })).technologies).toEqual([]);
  });
  it.each([{ players: [] }, { players: ['Franks', 'Franks', 'Franks', 'Franks', 'Franks'] }, { players: ['unknown'] }, { players: [''] }])(
    'rejects invalid roster %j',
    ({ players }) => {
      expect(teamBonusErrors(config({ players })).length).toBeGreaterThan(0);
    },
  );
});

describe('#228 team research is explicit viewer state', () => {
  const kasbah = TEAM_BONUS_DATA.technologies.find((row) => row.id === 578)!;
  it('defaults to unresearched, with an unavailable state before the source age', () => {
    expect(teamTechnologyStatus(kasbah, config({ players: ['Berbers'] }))).toBe('unresearched');
    expect(teamTechnologyStatus(kasbah, config({ age: 2, researched: [578] }))).toBe('unavailable');
  });
  it('records and removes a source without duplicating it', () => {
    const start = config({ players: ['Berbers', 'Berbers'] });
    const selected = setTeamResearched(start, 578, true);
    expect(start.researched).toEqual([]);
    expect(setTeamResearched(selected, 578, true).researched).toEqual([578]);
    expect(teamTechnologyStatus(kasbah, selected)).toBe('researched');
    expect(setTeamResearched(selected, 578, false).researched).toEqual([]);
  });
  it('does not enable an absent source or a future technology', () => {
    expect(setTeamResearched(config(), 578, true).researched).toEqual([]);
    expect(setTeamResearched(config({ players: ['Berbers'], age: 2 }), 578, true).researched).toEqual([]);
  });
  it('retains the research source while a duplicate provider remains', () => {
    const start = config({ players: ['Berbers', 'Berbers'], researched: [578] });
    expect(updateTeamRoster(start, ['Berbers']).researched).toEqual([578]);
    expect(updateTeamRoster(start, ['Franks']).researched).toEqual([]);
    expect(updateTeamRoster(start, ['Berbers'], 2).researched).toEqual([]);
  });
  it.each([
    { researched: [578] },
    { players: ['Berbers'], researched: [578, 578] },
    { players: ['Berbers'], age: 2, researched: [578] },
    { players: ['Cumans'], researched: [690, 999999] },
  ])('rejects invalid research state %j', (changes) => {
    expect(teamBonusErrors(config(changes)).length).toBeGreaterThan(0);
  });
});

describe('#228 audited target associations', () => {
  it('keeps all sources without a target filter', () => expect(teamTargetMatch(target, config())).toBe('match'));
  it('recognizes direct and production-directory unit associations separately from no match', () => {
    expect(teamTargetMatch(target, config({ target: 'units', unit: 4 }))).toBe('match');
    expect(teamTargetMatch(target, config({ target: 'units', unit: 24 }))).toBe('match');
    expect(teamTargetMatch(target, config({ target: 'units', unit: 38 }))).toBe('none');
    expect(teamTargetMatch(target, config({ target: 'buildings' }))).toBe('match');
    expect(teamTargetMatch(target, config({ target: 'production' }))).toBe('match');
    expect(teamTargetMatch(target, config({ target: 'unlock' }))).toBe('none');
    expect(teamTargetMatch({ ...target, effectTypes: ['attack'] }, config({ target: 'attack' }))).toBe('match');
    expect(teamTargetMatch(target, config({ target: 'attack' }))).toBe('none');
  });
  it('preserves unmatched partial and unknown associations for a separate uncertainty list', () => {
    expect(teamTargetMatch({ ...target, targetCoverage: 'partial' }, config({ target: 'units', unit: 38 }))).toBe('unknown');
    expect(teamTargetMatch({ ...target, targetCoverage: 'unknown' }, config({ target: 'economy' }))).toBe('unknown');
    expect(teamTargetMatch({ ...target, targetCoverage: 'partial' }, config({ target: 'units', unit: 4 }))).toBe('match');
  });
});

describe('#228 strict URL contract', () => {
  it('opens the plain page with a valid default', () => {
    expect(decodeTeamBonuses('')).toEqual({ config: defaultTeamBonusConfig(), errors: [], locked: false });
  });
  it('round-trips ordered duplicate civilizations, filters and viewer research', () => {
    const source = config({ players: ['Mapuche', 'Berbers', 'Berbers', 'Cumans'], target: 'units', unit: 4, researched: [1380, 578, 690] });
    const decoded = decodeTeamBonuses('?' + encodeTeamBonuses(source));
    expect(decoded.locked).toBe(false);
    expect(decoded.config).toEqual({ ...source, researched: [578, 690, 1380] });
  });
  it.each([
    '?tv=1',
    query({ tv: '2' }),
    query({ players: '' }),
    query({ players: 'unknown' }),
    query({ players: 'Franks,Franks,Franks,Franks,Franks' }),
    query({ age: '2.0' }),
    query({ age: '01' }),
    query({ age: '5' }),
    query({ age: '-1' }),
    query({ age: 'Infinity' }),
    query({ target: 'military' }),
    query({ unit: '4' }),
    query({ target: 'units', unit: '999999' }),
    query({ target: 'units', unit: '4.0' }),
    query({ researched: '578' }),
    query({ players: 'Berbers', researched: '578,578' }),
    query({ players: 'Berbers', researched: '0578' }),
    query({ players: 'Berbers', age: '2', researched: '578' }),
    query() + '&age=4',
    query() + '&sim=1',
    query() + '&players=%ZZ',
    query() + '&bad=%E0%A4%A',
    '?' + 'x'.repeat(4097),
  ])('locks damaged or ambiguous links instead of silently defaulting: %s', (search) => {
    const decoded = decodeTeamBonuses(search);
    expect(decoded.locked).toBe(true);
    expect(decoded.errors.length).toBeGreaterThan(0);
  });
});
