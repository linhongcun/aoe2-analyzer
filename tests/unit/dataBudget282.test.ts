import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import historicalPins from '../../scripts/patch_inputs/185872.json';
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
const patchLabel = (patch: { name: string; date: string }) => `${patch.name} (${patch.date})`;
const datSource = (dat: { repo: string; commit: string; path: string }) => `${dat.repo}@${dat.commit}/${dat.path}`;

describe('#282 compact calculation inputs', () => {
  it('deduplicates construction inputs instead of repeating all objects per civilization', () => {
    expect(readFileSync('src/data/construction.json').length).toBeLessThan(60_000);
  });
  it('keeps every expanded construction payload from main cca7e56 unchanged under historical provenance', async () => {
    const { CONSTRUCTION_DATA } = await import('../../src/domain/construction');
    expect(Object.keys(CONSTRUCTION_DATA.civs)).toHaveLength(56);
    // Normalize only approved provenance fields; every runtime value retains the original digest.
    const projected = {
      ...CONSTRUCTION_DATA,
      meta: {
        ...CONSTRUCTION_DATA.meta,
        patch: patchLabel(historicalPins.patch),
        sha256: historicalPins.sources.dat.sha256,
        source: datSource(historicalPins.sources.dat),
      },
    };
    expect(digest(projected)).toBe('4a5811a1a28c59e921ff14fc93ac703d2d815dd9499499dac4734d60bdf2b579');
  });
  it('ships only consumed garrison unit/catalog fields', () => {
    for (const unit of Object.values(garrison.units)) {
      for (const key of ['name', 'languageId', 'minRange', 'resourceCapacity']) expect(unit).not.toHaveProperty(key);
      expect(unit.catalog).not.toHaveProperty('en');
      expect(unit.catalog).not.toHaveProperty('zh');
    }
  });
  it('preserves every runtime garrison payload from main cca7e56 under historical provenance', () => {
    const projected = JSON.parse(JSON.stringify(garrison));
    for (const unit of Object.values(projected.units) as Record<string, unknown>[]) {
      for (const key of ['name', 'languageId', 'minRange', 'resourceCapacity']) delete unit[key];
      for (const key of ['en', 'zh']) delete (unit.catalog as Record<string, unknown>)[key];
    }
    for (const building of Object.values(projected.buildings) as Record<string, unknown>[]) delete building.civs;
    delete projected.unitUnlockTechs;
    projected.meta = {
      ...projected.meta,
      commit: historicalPins.sources.dat.commit,
      sha256: historicalPins.sources.dat.sha256,
      labelsCommit: historicalPins.sources.aoe2techtree.commit,
      patch: patchLabel(historicalPins.patch),
    };
    expect(digest(projected)).toBe('78be4c676fea8f4e0e5a3c6e1d4d711ec91969bdadd7d215c9c41ebf05c721b2');
  });
  it('records the exact current provenance separately from historical numerical projections', () => {
    expect(construction.meta).toEqual({
      generatedBy: 'scripts/construction_build.py',
      patch: patchLabel(pins.patch),
      sha256: pins.sources.dat.sha256,
      source: datSource(pins.sources.dat),
      engineVerifiedInPinnedBuild: false,
    });
    expect(garrison.meta).toEqual({
      generatedBy: 'scripts/garrison_general_build.py',
      commit: pins.sources.dat.commit,
      repo: pins.sources.dat.repo,
      sha256: pins.sources.dat.sha256,
      labelsCommit: pins.sources.aoe2techtree.commit,
      patch: patchLabel(pins.patch),
      engineVerifiedInPinnedBuild: false,
    });
  });
  it('records shared construction dictionaries', () => {
    expect(construction).toHaveProperty('unitSets');
    expect(construction).toHaveProperty('automaticSets');
  });
});
