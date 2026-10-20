import { describe, expect, it } from 'vitest';
import {
  SCOUTING_CONTENT,
  SCOUTING_OBSERVATIONS,
  SCOUTING_URL_LIMIT,
  analyseScouting,
  decodeScouting,
  defaultScoutingConfig,
  encodeScouting,
  isScoutingConfig,
  scoutingInputErrors,
  scoutingTimeError,
  type ScoutingConfig,
  type ScoutingObservationId,
} from '../../src/domain/scouting';

function withObservation(id: ScoutingObservationId, patch: Partial<ScoutingConfig['observations'][ScoutingObservationId]>, config = defaultScoutingConfig()) {
  return { ...config, observations: { ...config.observations, [id]: { ...config.observations[id], ...patch } } };
}
const current = { state: 'seen' as const, at: '12:30', area: 'enemy-front' as const, stale: false };
const rawQuery = (value: unknown) => new URLSearchParams({ sv: '1', data: JSON.stringify(value) }).toString();

describe('#258 finite evidence and hypotheses', () => {
  it('freezes exactly two scenarios with distinct compatible explanations and reviewed sources', () => {
    expect(SCOUTING_CONTENT.scenarios.map((row) => row.id)).toEqual(['early', 'walled']);
    expect(SCOUTING_CONTENT.scenarios.map((row) => row.hypotheses.length)).toEqual([2, 2]);
    for (const scenario of SCOUTING_CONTENT.scenarios) {
      expect(scenario.notEnough.length).toBeGreaterThan(1);
      for (const card of scenario.hypotheses) {
        for (const text of [card.need, card.next, card.condition, card.cost, card.counterexample, card.alternative]) expect(text.length).toBeGreaterThan(12);
        expect(card.sourceIds.every((id) => SCOUTING_CONTENT.sources.some((source) => source.id === id))).toBe(true);
      }
    }
    expect(SCOUTING_CONTENT.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
  });
  it('all unknown preserves competing explanations and lists shared gaps without choosing an action', () => {
    const result = analyseScouting(defaultScoutingConfig());
    expect(result.status).toBe('covered');
    expect(result.gaps).toHaveLength(3);
    expect(result.hypotheses.map((row) => row.status)).toEqual(['needs-evidence', 'needs-evidence']);
    expect(result.hypotheses.every((row) => !row.support.length && !row.counter.length)).toBe(true);
    expect(result.planNote).toContain('不从并列解释中自动替你选择');
  });
  it('a production building alone does not authenticate military production', () => {
    const result = analyseScouting(withObservation('military-building', current));
    expect(result.hypotheses[0]!.support).toEqual([]);
    expect(result.hypotheses[0]!.status).toBe('needs-evidence');
    expect(result.hypotheses[1]!.support).toEqual(['military-building']);
    expect(result.hypotheses[1]!.hypothesis.evidenceMeaning).toContain('还不能说明暂停生产或已经安全');
    expect(result.hypotheses).toHaveLength(2);
  });
  it('observed army updates local support and a competing explanation without proving intent', () => {
    const result = analyseScouting(withObservation('field-army', current));
    expect(result.hypotheses[0]!.status).toBe('local-support');
    expect(result.hypotheses[1]!.status).toBe('recheck');
    expect(result.hypotheses).toHaveLength(2);
  });
  it.each(['unseen', 'unknown'] as const)('%s never becomes scoped absence or current counterevidence', (state) => {
    const result = analyseScouting(withObservation('field-army', { ...current, state }));
    expect(result.hypotheses.every((row) => !row.support.length && !row.counter.length)).toBe(true);
    expect(result.gaps.join(' ')).toContain(state === 'unseen' ? '不等于不存在' : '未知');
  });
  it('stale observations lose their current evidential role without being changed to absence', () => {
    const config = withObservation('field-army', { ...current, stale: true });
    const result = analyseScouting(config);
    expect(result.gaps.join(' ')).toContain('已标记陈旧');
    expect(result.hypotheses.every((row) => !row.support.length && !row.counter.length)).toBe(true);
    expect(config.observations['field-army'].state).toBe('seen');
  });
  it('does not invent a fixed elapsed-time rule for staleness', () => {
    const result = analyseScouting(withObservation('field-army', { ...current, at: '00:00' }));
    expect(result.hypotheses[0]!.support).toEqual(['field-army']);
    expect(result.gaps.join(' ')).not.toContain('已标记陈旧');
  });
  it.each([
    { at: '', area: 'enemy-front' },
    { at: '10:00', area: 'unknown' },
    { at: '', area: 'unknown' },
  ] as const)('requires both time and scope for absence: %j', (patch) => {
    const config = withObservation('field-army', { state: 'absent', ...patch });
    expect(analyseScouting(config).status).toBe('invalid');
    expect(analyseScouting(config).hypotheses).toEqual([]);
    expect(scoutingInputErrors(config).join(' ')).toContain('不能代表全图');
    expect(decodeScouting('?' + encodeScouting(config)).config).toEqual(config);
  });
  it('scoped absence only provides a local counter, retaining all explanations', () => {
    const result = analyseScouting(withObservation('field-army', { ...current, state: 'absent' }));
    expect(result.status).toBe('covered');
    expect(result.hypotheses).toHaveLength(2);
    expect(result.hypotheses[0]!.counter).toEqual(['field-army']);
    expect(result.hypotheses[0]!.hypothesis.counterMeaning).toContain('在别处仍有可能');
  });
  it('a seen record without time or area is retained but not treated as current evidence', () => {
    const config = withObservation('field-army', { state: 'seen' });
    const result = analyseScouting(config);
    expect(result.hypotheses[0]!.support).toEqual([]);
    expect(result.gaps.join(' ')).toContain('时刻或可见范围未记录');
  });
  it('new TC and side production can coexist; economic and military explanations are not exclusive', () => {
    let config: ScoutingConfig = { ...defaultScoutingConfig(), scenario: 'walled', stage: 'castle' };
    config = withObservation('new-town-center', { ...current, area: 'enemy-edge' }, config);
    config = withObservation('forward-production', { ...current, area: 'own-approach' }, config);
    const result = analyseScouting(config);
    expect(result.hypotheses).toHaveLength(2);
    expect(result.hypotheses[0]!.support).toEqual(['new-town-center']);
    expect(result.hypotheses[0]!.counter).toEqual(['forward-production']);
    expect(result.hypotheses[1]!.support).toEqual(['forward-production']);
  });
  it('withdrawing a key observation updates support and missing information', () => {
    const seen = withObservation('field-army', current);
    const withdrawn = withObservation('field-army', { state: 'unknown' }, seen);
    expect(analyseScouting(seen).hypotheses[0]!.support).toHaveLength(1);
    expect(analyseScouting(withdrawn).hypotheses[0]!.support).toHaveLength(0);
    expect(analyseScouting(withdrawn).gaps.join(' ')).toContain('实际军队：未知');
  });
  it('ignores other-scenario evidence but preserves it for full sharing', () => {
    const config = withObservation('new-town-center', current);
    expect(analyseScouting(config).hypotheses.every((row) => !row.support.length)).toBe(true);
    expect(decodeScouting('?' + encodeScouting(config)).config.observations['new-town-center']).toEqual(current);
  });
  it.each(['press', 'hold', 'develop'] as const)('plan %s changes prompts, never automatically selects a hypothesis', (plan) => {
    const result = analyseScouting({ ...defaultScoutingConfig(), plan });
    expect(result.planNote).not.toBe(analyseScouting(defaultScoutingConfig()).planNote);
    expect(result.hypotheses.map((row) => row.status)).toEqual(['needs-evidence', 'needs-evidence']);
  });
  it.each([{ map: 'arena' }, { map: 'nomad' }, { map: 'water' }, { mode: 'team' }, { stage: 'castle' }, { stage: 'unknown' }] as const)(
    'separates valid unmodelled context from damaged input: %j',
    (patch) => {
      const config = { ...defaultScoutingConfig(), ...patch };
      const decoded = decodeScouting('?' + encodeScouting(config));
      expect(decoded.locked).toBe(false);
      expect(decoded.config).toEqual(config);
      expect(analyseScouting(config).status).toBe('not-covered');
      expect(analyseScouting(config).hypotheses).toEqual([]);
    },
  );
});

describe('#258 time and lossless strict URL state', () => {
  it.each(['', '0:00', '12:59', '999:59', '1:00:00', '12:59:59'])('accepts the documented game-time forms: %s', (value) =>
    expect(scoutingTimeError(value)).toBeNull(),
  );
  it.each(['12', '12:60', '1:60:00', '-1:00', '1.5:00', ' 12:00', '12:00 ', '0:1', '2026-10-20'])(
    'keeps invalid time as an editable semantic error: %s',
    (at) => {
      const config = withObservation('field-army', { ...current, at });
      expect(scoutingTimeError(at)).not.toBeNull();
      const decoded = decodeScouting('?' + encodeScouting(config));
      expect(decoded.locked).toBe(false);
      expect(decoded.config.observations['field-army'].at).toBe(at);
      expect(analyseScouting(decoded.config).status).toBe('invalid');
    },
  );
  it('round-trips both scenarios, all observations and independent time/range/staleness', () => {
    let config: ScoutingConfig = { ...defaultScoutingConfig(), scenario: 'walled', stage: 'castle', plan: 'develop' };
    for (const [index, id] of SCOUTING_OBSERVATIONS.entries())
      config = withObservation(id, { ...current, at: `${index + 1}:23`, area: index % 2 ? 'own-approach' : 'enemy-edge', stale: index % 2 === 0 }, config);
    expect(decodeScouting('?' + encodeScouting(config))).toEqual({ config, locked: false, errors: [] });
    expect(encodeScouting(config).length).toBeLessThan(SCOUTING_URL_LIMIT);
  });
  it('empty initial access is the only implicit default', () => {
    expect(decodeScouting('').locked).toBe(false);
    expect(decodeScouting('?').locked).toBe(false);
    expect(decodeScouting('?sv=1').locked).toBe(true);
  });
  it.each(['&sv=1', '&x=1', '&data=%7B%7D', '&broken=%FF', '&x=%', '&x=%E0%A4%A'])('suspends duplicate/unknown/malformed query parameters: %s', (suffix) => {
    expect(decodeScouting('?' + encodeScouting(defaultScoutingConfig()) + suffix).locked).toBe(true);
  });
  it.each(['2', '01', '0', ''])('requires exact schema version: %s', (sv) => {
    const params = new URLSearchParams(encodeScouting(defaultScoutingConfig()));
    params.set('sv', sv);
    expect(decodeScouting('?' + params).locked).toBe(true);
  });
  it('rejects overlong links and never truncates', () => expect(decodeScouting('?' + 'a'.repeat(SCOUTING_URL_LIMIT + 1)).locked).toBe(true));
  it.each([
    null,
    [],
    {},
    { ...defaultScoutingConfig(), extra: true },
    { ...defaultScoutingConfig(), plan: 'win' },
    { ...defaultScoutingConfig(), observations: {} },
  ])('rejects malformed config records: %j', (value) => {
    expect(isScoutingConfig(value)).toBe(false);
    expect(decodeScouting('?' + rawQuery(value)).locked).toBe(true);
  });
  it('rejects unsafe/extra observation fields and invalid field types', () => {
    for (const patch of [
      { extra: true },
      { state: 'none' },
      { stale: 'false' },
      { at: 0 },
      { at: 'x'.repeat(33) },
      { at: '\u202e12:30' },
      { at: '\ud800' },
      { area: 'global' },
    ]) {
      const config = defaultScoutingConfig();
      const value = { ...config, observations: { ...config.observations, 'field-army': { ...config.observations['field-army'], ...patch } } };
      expect(decodeScouting('?' + rawQuery(value)).locked).toBe(true);
    }
  });
});
