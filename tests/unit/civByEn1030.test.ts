import { describe, expect, it } from 'vitest';
import { civByEn, civs } from '../../src/data';

describe('#1030 civByEn', () => {
  it('returns each civilization catalog object by its English name', () => {
    for (const civ of civs) expect(civByEn(civ.en)).toBe(civ);
  });

  it('returns undefined for unknown and empty names', () => {
    expect(civByEn('__unknown_civilization__')).toBeUndefined();
    expect(civByEn('')).toBeUndefined();
  });
});
