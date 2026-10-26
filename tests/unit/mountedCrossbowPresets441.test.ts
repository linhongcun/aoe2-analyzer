import { describe, expect, it } from 'vitest';
import { MOUNTED_CROSSBOW_PRESETS, duelPresetPath, duelPresetShareUrl, mountedCrossbowPresetsFor } from '../../src/features/patches/mountedCrossbowPresets';
import { parseSide } from '../../src/domain/duelState';
import { canonDuelParams, decodeDuelParams } from '../../src/domain/duelParams';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { ctx, units } from './helpers';

const CASES = [
  { key: 'castle-britons-byzantines', a: '2700.Britons.3..', b: '39.Byzantines.3..', hpA: 45 },
  { key: 'castle-franks-byzantines', a: '2700.Franks.3..', b: '39.Byzantines.3..', hpA: 54 },
  { key: 'imperial-britons-byzantines', a: '2701.Britons.4..', b: '474.Byzantines.4..', hpA: 55 },
] as const;
const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));

describe('#441 patch-context Mounted Crossbow presets', () => {
  it.each([
    { patchId: '185872', currentBuild: 185872, count: 3 },
    { patchId: '185872', currentBuild: 185873, count: 0 },
    { patchId: '125283', currentBuild: 185872, count: 0 },
    { patchId: undefined, currentBuild: 185872, count: 0 },
  ])('only the reviewed archive/current-data pair shows presets: $patchId/$currentBuild', ({ patchId, currentBuild, count }) => {
    expect(mountedCrossbowPresetsFor(patchId, currentBuild)).toHaveLength(count);
  });

  it('has exactly the three reviewed real-civilization configurations', () => {
    expect(MOUNTED_CROSSBOW_PRESETS.map((preset) => preset.key)).toEqual(CASES.map((preset) => preset.key));
  });

  it.each(CASES)('$key has exact native unit/civilization/age/empty-technology parameters', ({ key, a, b, hpA }) => {
    const preset = MOUNTED_CROSSBOW_PRESETS.find((candidate) => candidate.key === key)!;
    const path = duelPresetPath(preset);
    expect(path).toBe(`/duel?a=${a}&b=${b}&m=1`);
    const query = new URLSearchParams(path.split('?')[1]);
    expect([...query.keys()]).toEqual(['a', 'b', 'm']);
    expect(decodeDuelParams(query).mode).toBe('1');
    expect(canonDuelParams(query, decodeDuelParams(query)).toString()).toBe(query.toString());
    for (const [side, encoded] of [
      ['a', a],
      ['b', b],
    ] as const) {
      const parsed = parseSide(query.get(side), preset[side]);
      expect(parsed.uid).toBe(Number(encoded.split('.')[0]));
      expect(parsed.civ).toBe(encoded.split('.')[1]);
      expect(parsed.age).toBe(Number(encoded.split('.')[2]));
      expect(parsed.ageSet).toBe(true);
      expect(parsed.techs).toEqual([]);
      expect(parsed.team).toEqual([]);
      expect(byId[parsed.uid]!.civs).toContain(parsed.civ);
      expect(parsed.age).toBeGreaterThanOrEqual(byId[parsed.uid]!.age);
      const resolved = resolve(ctx, byId, parsed, 569);
      expect(isUnavail(resolved)).toBe(false);
      if (isUnavail(resolved)) throw new Error('Preset unexpectedly needs a regional-unit replacement.');
      expect([resolved.u.id, resolved.civ, resolved.age]).toEqual([parsed.uid, parsed.civ, parsed.age]);
      expect([...resolved.sel]).toEqual([]);
      if (side === 'a') expect(resolved.S.hp).toBe(hpA);
    }
  });

  it('uses Heavy Mounted Crossbowman2701 and Heavy Cavalry Archer474 at imperial age', () => {
    const preset = MOUNTED_CROSSBOW_PRESETS.find((candidate) => candidate.key === 'imperial-britons-byzantines')!;
    expect([preset.a.uid, preset.b.uid, preset.a.age, preset.b.age]).toEqual([2701, 474, 4, 4]);
    expect(byId[2701]!.zh).toBe('重装骑马弩兵');
    expect(byId[2701]!.from_).toBe(2700);
    expect(byId[474]!.from_).toBe(39);
  });

  it.each(['https://linhongcun.github.io/aoe2-analyzer/', 'http://localhost:4411/'])('copies a stable static entry from project base%s', (base) => {
    const preset = MOUNTED_CROSSBOW_PRESETS[0]!;
    const copied = new URL(duelPresetShareUrl(preset, base));
    expect(copied.origin).toBe(new URL(base).origin);
    expect(copied.pathname).toBe(new URL('duel/', base).pathname);
    expect(copied.hash).toBe('');
    expect(copied.searchParams.toString()).toBe('a=2700.Britons.3..&b=39.Byzantines.3..&m=1');
    expect([...copied.searchParams.keys()]).toEqual(['a', 'b', 'm']);
  });
});
