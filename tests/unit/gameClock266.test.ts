import { describe, expect, it } from 'vitest';
import { calculateGameClock, decodeGameClock, gameClockHref, gameClockMinutes } from '../../src/domain/gameClock';

const baseQuery = 'v=1&direction=game-to-real&unit=seconds&duration=600';

describe('#266 default speed in context links', () => {
  it('writes ratio=1.7 in context links and opens them at the default speed', () => {
    const href = gameClockHref(600)!;
    const query = href.split('?')[1]!;
    expect(new URLSearchParams(query).get('ratio')).toBe('1.7');
    const decoded = decodeGameClock(query);
    expect(decoded).toEqual({
      config: { direction: 'game-to-real', unit: 'seconds', duration: '600', ratio: '1.7' },
      errors: [],
    });
    const result = calculateGameClock(decoded.config);
    if (!result.ok) throw new Error('default context link rejected');
    expect(gameClockMinutes(result.outputSeconds)).toBe('5:53');
  });

  it('defaults to 1.7 when a link omits the ratio', () => {
    expect(decodeGameClock(baseQuery)).toEqual({
      config: { direction: 'game-to-real', unit: 'seconds', duration: '600', ratio: '1.7' },
      errors: [],
    });
  });

  it.each(['1', '1.0', '1.5', '1.7', '2.0', '2.5'])('preserves an explicitly supplied ratio %s', (ratio) => {
    const href = gameClockHref(600, ratio)!;
    const decoded = decodeGameClock(href.split('?')[1]!);
    expect(decoded.errors).toEqual([]);
    expect(decoded.config.ratio).toBe(ratio);
  });

  it('opens old explicit ratio=1 links at their original speed', () => {
    const decoded = decodeGameClock(baseQuery + '&ratio=1');
    expect(decoded.errors).toEqual([]);
    expect(decoded.config.ratio).toBe('1');
    expect(calculateGameClock(decoded.config)).toMatchObject({ ok: true, inputSeconds: 600, outputSeconds: 600 });
  });

  it.each(['v', 'direction', 'unit', 'duration'])('still requires %s when ratio is omitted', (key) => {
    const params = new URLSearchParams(baseQuery);
    params.delete(key);
    expect(decodeGameClock(params.toString()).errors).toEqual(['换算链接缺少必要参数，请重置。']);
  });

  it('keeps an explicitly empty ratio editable and rejects duplicate ratios', () => {
    const empty = decodeGameClock(baseQuery + '&ratio=');
    expect(empty.errors).toEqual([]);
    expect(empty.config.ratio).toBe('');
    expect(calculateGameClock(empty.config).ok).toBe(false);
    expect(decodeGameClock(baseQuery + '&ratio=1&ratio=1.7').errors).toEqual(['换算链接含未知或重复参数，请重置。']);
  });
});
