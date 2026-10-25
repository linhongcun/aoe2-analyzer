import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import construction from '../../src/data/construction.json';
import garrison from '../../src/data/garrison_general.json';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

describe('#282 compact calculation inputs', () => {
  it('deduplicates construction inputs instead of repeating all objects per civilization', () => {
    expect(readFileSync('src/data/construction.json').length).toBeLessThan(60_000);
  });
  it('keeps every expanded construction input from main cca7e56 unchanged', async () => {
    const { CONSTRUCTION_DATA } = await import('../../src/domain/construction');
    expect(Object.keys(CONSTRUCTION_DATA.civs)).toHaveLength(56);
    expect(digest(CONSTRUCTION_DATA)).toBe('4a5811a1a28c59e921ff14fc93ac703d2d815dd9499499dac4734d60bdf2b579');
  });
  it('ships only consumed garrison unit/catalog fields', () => {
    for (const unit of Object.values(garrison.units)) {
      for (const key of ['name', 'languageId', 'minRange', 'resourceCapacity']) expect(unit).not.toHaveProperty(key);
      expect(unit.catalog).not.toHaveProperty('en');
      expect(unit.catalog).not.toHaveProperty('zh');
    }
  });
  it('preserves every runtime garrison input from main cca7e56', () => {
    const projected = JSON.parse(JSON.stringify(garrison));
    for (const unit of Object.values(projected.units) as Record<string, unknown>[]) {
      for (const key of ['name', 'languageId', 'minRange', 'resourceCapacity']) delete unit[key];
      for (const key of ['en', 'zh']) delete (unit.catalog as Record<string, unknown>)[key];
    }
    for (const building of Object.values(projected.buildings) as Record<string, unknown>[]) delete building.civs;
    delete projected.unitUnlockTechs;
    expect(digest(projected)).toBe('78be4c676fea8f4e0e5a3c6e1d4d711ec91969bdadd7d215c9c41ebf05c721b2');
  });
  it('records shared construction dictionaries', () => {
    expect(construction).toHaveProperty('unitSets');
    expect(construction).toHaveProperty('automaticSets');
  });
});
