import { describe, expect, it } from 'vitest';
import {
  GAME_CLOCK_DURATION_LIMIT,
  GAME_CLOCK_QUERY_LIMIT,
  calculateGameClock,
  changeGameClockUnit,
  decodeGameClock,
  defaultGameClockConfig,
  encodeGameClock,
  gameClockHref,
  gameClockMinutes,
  gameClockSeconds,
  parseGameClockDuration,
  type GameClockConfig,
} from '../../src/domain/gameClock';

const config = (patch: Partial<GameClockConfig> = {}): GameClockConfig => ({ ...defaultGameClockConfig(), ...patch });

describe('#237 explicit clock arithmetic', () => {
  it('converts the two directions from the same original duration, without applying the ratio twice', () => {
    const forward = calculateGameClock(config({ ratio: '1.7' }));
    const reverse = calculateGameClock(config({ direction: 'real-to-game', ratio: '1.7' }));
    expect(forward.ok).toBe(true);
    expect(reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) throw new Error('valid arithmetic rejected');
    expect(forward.inputSeconds).toBe(600);
    expect(forward.outputSeconds).toBeCloseTo(352.94117647058823, 10);
    expect(gameClockMinutes(forward.outputSeconds)).toBe('5:53');
    expect(reverse.outputSeconds).toBe(1020);
    expect(gameClockMinutes(reverse.outputSeconds)).toBe('17:00');
    expect(forward.gameSeconds).toBe(600);
    expect(reverse.realSeconds).toBe(600);
  });

  it.each(['0', '1', '37.125', '100000000'])('keeps duration %s unchanged at ratio one and supports zero', (duration) => {
    const result = calculateGameClock(config({ unit: 'seconds', duration, ratio: '1' }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('valid duration rejected');
    expect(result.inputSeconds).toBe(Number(duration));
    expect(result.outputSeconds).toBe(Number(duration));
  });

  it('has inverse directions and linear duration scaling for explicit fixed ratios', () => {
    for (const ratio of ['0.25', '1.7', '2.5', '1000']) {
      const a = calculateGameClock(config({ unit: 'seconds', duration: '123.75', ratio }));
      const doubled = calculateGameClock(config({ unit: 'seconds', duration: '247.5', ratio }));
      if (!a.ok || !doubled.ok) throw new Error('valid ratio rejected');
      expect(doubled.outputSeconds).toBeCloseTo(a.outputSeconds * 2, 8);
      const back = calculateGameClock(config({ unit: 'seconds', duration: String(a.outputSeconds), direction: 'real-to-game', ratio }));
      if (!back.ok) throw new Error('inverse rejected');
      expect(back.outputSeconds).toBeCloseTo(a.inputSeconds, 8);
    }
  });

  it.each(['', '-1', 'NaN', 'Infinity', '1e3', '1,000', '.5', '+1', '10:60', '1:2', '1:00:00', ' 1:00', '100000000.000000000000001'])(
    'rejects invalid or over-limit second duration %j instead of coercing it',
    (duration) => {
      expect(calculateGameClock(config({ unit: 'seconds', duration })).ok).toBe(false);
    },
  );

  it.each(['', '0', '-1', 'Infinity', 'NaN', '1e-3', '.5', '1000.0001', '1,7', ' 1.7'])('rejects invalid ratio %j', (ratio) => {
    expect(calculateGameClock(config({ ratio })).ok).toBe(false);
  });

  it('rejects unsafe output, while retaining a visible nonzero value for a tiny valid duration', () => {
    expect(calculateGameClock(config({ ratio: '0.0000000000000000001' })).ok).toBe(false);
    const result = calculateGameClock(config({ unit: 'seconds', duration: '0.00000001', ratio: '2' }));
    if (!result.ok) throw new Error('tiny positive duration rejected');
    expect(gameClockSeconds(result.outputSeconds)).toBe('5.00000e-9');
    expect(gameClockMinutes(59.6)).toBe('1:00');
  });
});

describe('#237 duration unit changes', () => {
  it('preserves decimal text across repeated seconds and minutes conversions', () => {
    let value = config({ unit: 'seconds', duration: '600.123456789012345' });
    for (let i = 0; i < 10; i++) {
      const minutes = changeGameClockUnit(value, 'minutes');
      expect(minutes.error).toBeNull();
      expect(minutes.config.duration).toBe('10:00.123456789012345');
      value = changeGameClockUnit(minutes.config, 'seconds').config;
      expect(value.duration).toBe('600.123456789012345');
      expect(value.ratio).toBe('1.7');
      expect(value.direction).toBe('game-to-real');
    }
  });

  it.each(['0:00', '00:05', '01:30', '0:05.5', '1:59.25', '1666666:40'])('accepts strict minute input %s', (duration) => {
    expect(parseGameClockDuration(duration, 'minutes').ok).toBe(true);
  });

  it.each(['1:60', '1:3', '1:03.', '1:03e2', '-1:30', '+1:30', '1666666:40.000001'])('rejects invalid minute input %j', (duration) => {
    expect(parseGameClockDuration(duration, 'minutes').ok).toBe(false);
  });

  it('keeps an invalid raw draft untouched when switching units', () => {
    const draft = config({ duration: '10:' });
    const changed = changeGameClockUnit(draft, 'seconds');
    expect(changed.config).toBe(draft);
    expect(changed.error).toContain('原输入已保留');
  });

  it('does not create a broken URL when a maximum-length fraction grows after unit conversion', () => {
    const draft = config({ unit: 'seconds', duration: '1.' + '2'.repeat(62) });
    expect(parseGameClockDuration(draft.duration, draft.unit).ok).toBe(true);
    const changed = changeGameClockUnit(draft, 'minutes');
    expect(changed.config).toBe(draft);
    expect(changed.error).toContain('原输入已保留');
  });
});

describe('#237 route codec and context links', () => {
  it('has an independent default on every call and round-trips all input meanings', () => {
    const value = config({ duration: '35.125', unit: 'seconds', direction: 'real-to-game', ratio: '0.75' });
    expect(decodeGameClock('?' + encodeGameClock(value))).toEqual({ config: value, errors: [] });
    const a = decodeGameClock('').config;
    a.ratio = '9';
    expect(decodeGameClock('').config.ratio).toBe('1.7');
  });

  it('preserves editable numeric drafts but never calculates or shares them as valid', () => {
    const value = config({ duration: '', ratio: '1e3' });
    const decoded = decodeGameClock(encodeGameClock(value));
    expect(decoded.errors).toEqual([]);
    expect(decoded.config).toEqual(value);
    expect(calculateGameClock(decoded.config).ok).toBe(false);
  });

  it.each([
    'v=2&direction=game-to-real&unit=seconds&duration=10&ratio=1',
    'v=1&direction=game-to-real&unit=seconds&duration=10&ratio=1&ratio=2',
    'v=1&direction=game-to-real&unit=seconds&duration=10&ratio=1&extra=1',
    'v=1&direction=game-to-real&unit=seconds',
    'v=1&direction=other&unit=seconds&duration=10&ratio=1',
    'v=1&direction=game-to-real&unit=other&duration=10&ratio=1',
    'v=1&direction=game-to-real&unit=seconds&duration=%GG&ratio=1',
    'v=1&direction=game-to-real&unit=seconds&duration=%C0%AF&ratio=1',
    'v=1&direction=game-to-real&unit=seconds&duration=' + '0'.repeat(65) + '&ratio=1',
    'x'.repeat(GAME_CLOCK_QUERY_LIMIT + 1),
  ])('locks a malformed URL until reset: %s', (search) => {
    const decoded = decodeGameClock(search);
    expect(decoded.errors.length).toBeGreaterThan(0);
  });

  it('takes game seconds from another model without applying a speed or rounding the number', () => {
    for (const seconds of [0, 600, 59.123456789, 0.0000001, GAME_CLOCK_DURATION_LIMIT]) {
      const href = gameClockHref(seconds);
      expect(href).toMatch(/^\/game-clock\?/);
      expect(new URLSearchParams(href!.split('?')[1]!).get('ratio')).toBe('1.7');
      const decoded = decodeGameClock(href!.split('?')[1]!);
      expect(decoded.errors).toEqual([]);
      expect(decoded.config.direction).toBe('game-to-real');
      expect(decoded.config.unit).toBe('seconds');
      expect(decoded.config.ratio).toBe('1.7');
      const result = calculateGameClock(decoded.config);
      if (!result.ok) throw new Error('valid context rejected');
      expect(result.inputSeconds).toBe(seconds);
      expect(result.outputSeconds).toBe(seconds / 1.7);
    }
    expect(gameClockHref(-1)).toBeNull();
    expect(gameClockHref(Number.POSITIVE_INFINITY)).toBeNull();
    expect(gameClockHref(Number.NaN)).toBeNull();
    expect(gameClockHref(GAME_CLOCK_DURATION_LIMIT + 1)).toBeNull();
    expect(gameClockHref(1e-100)).toBeNull();
  });
});
