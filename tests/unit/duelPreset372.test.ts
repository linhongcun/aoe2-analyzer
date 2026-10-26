import { describe, expect, it } from 'vitest';
import { BOHEMIAN_DUEL_PRESETS, bohemianPresetPath, bohemianPresetShareUrl, bohemianPresetsFor } from '../../src/features/duel/logic/bohemianPresets';
import { canonDuelParams, decodeDuelParams } from '../../src/domain/duelParams';
import { fmtSide, parseSide } from '../../src/domain/duelState';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { ctx, techById, units } from './helpers';
// @ts-expect-error CI policy is a native Node module without a declaration.
import { planChanges } from '../../scripts/ci-scope.mjs';

const CASES = [
  { key: 'castle-hussite-mangonel', title: '城堡时代：胡斯派战车对轻型投石车', a: '1704.Bohemians.3.c.', b: '280.Franks.3.c.', selA: [784], selB: [] },
  {
    key: 'imperial-hussite-onager',
    title: '帝王时代：精锐胡斯派战车对中型投石车',
    a: '1706.Bohemians.4.c.',
    b: '550.Franks.4.c.',
    selA: [377, 784],
    selB: [47, 377],
  },
] as const;
const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));

describe('#372 exact Bohemian Duel presets', () => {
  it.each([185872, 185873, 125283, 0])('only reviewed current data185872 exposes cards: %s', (build) => {
    expect(bohemianPresetsFor(build)).toHaveLength(build === 185872 ? 2 : 0);
  });

  it('keeps exactly the two authorized titles and native units', () => {
    expect(BOHEMIAN_DUEL_PRESETS.map((preset) => ({ key: preset.key, title: preset.title }))).toEqual(CASES.map(({ key, title }) => ({ key, title })));
    expect(byId[1704]!.zh).toBe('胡斯派战车');
    expect(byId[1706]!.zh).toBe('精锐胡斯派战车');
    expect(byId[280]!.zh).toBe('轻型投石车');
    expect(byId[550]!.zh).toBe('中型投石车');
  });

  it.each(CASES)('$key creates a fresh canonical 1v1 with real civilizations, current-age technologies and empty teams', (item) => {
    const preset = BOHEMIAN_DUEL_PRESETS.find((candidate) => candidate.key === item.key)!;
    const path = bohemianPresetPath(preset);
    expect(path).toBe('/duel?a=' + item.a + '&b=' + item.b + '&m=1');
    const query = new URLSearchParams(path.split('?')[1]);
    expect([...query.keys()]).toEqual(['a', 'b', 'm']);
    expect(decodeDuelParams(query).mode).toBe('1');
    expect(canonDuelParams(query, decodeDuelParams(query)).toString()).toBe(query.toString());
    for (const side of ['a', 'b'] as const) {
      const parsed = parseSide(query.get(side), preset[side]);
      expect(fmtSide(parsed)).toBe(item[side]);
      expect(parsed.ageSet).toBe(true);
      expect(parsed.techs).toBe('c');
      expect(parsed.team).toEqual([]);
      expect(byId[parsed.uid]!.civs).toContain(parsed.civ);
      expect(parsed.age).toBeGreaterThanOrEqual(byId[parsed.uid]!.age);
      const actual = resolve(ctx, byId, parsed, 569);
      expect(isUnavail(actual)).toBe(false);
      if (isUnavail(actual)) throw new Error('Preset unexpectedly requires a unit/civilization fallback');
      expect([actual.u.id, actual.civ, actual.age]).toEqual([parsed.uid, parsed.civ, parsed.age]);
      expect([...actual.sel].sort((a, b) => a - b)).toEqual(side === 'a' ? item.selA : item.selB);
      for (const id of actual.sel) expect(techById[id]!.age).toBeLessThanOrEqual(parsed.age);
    }
  });

  it.each(['https://linhongcun.github.io/aoe2-analyzer/', 'http://localhost:3721/'])('both copy links preserve project subpath and only a/b/m: %s', (base) => {
    for (const [index, preset] of BOHEMIAN_DUEL_PRESETS.entries()) {
      const copied = new URL(bohemianPresetShareUrl(preset, base));
      expect(copied.origin).toBe(new URL(base).origin);
      expect(copied.pathname).toBe(new URL('duel/', base).pathname);
      expect(copied.hash).toBe('');
      expect(copied.searchParams.toString()).toBe('a=' + CASES[index]!.a + '&b=' + CASES[index]!.b + '&m=1');
      expect([...copied.searchParams.keys()]).toEqual(['a', 'b', 'm']);
    }
  });

  it('future local UI/helper changes retain both exact372 test suites without weakening core coverage', () => {
    for (const path of ['src/features/duel/components/BohemianPresetCards.tsx', 'src/features/duel/logic/bohemianPresets.ts']) {
      const plan = planChanges([{ path }]);
      expect(plan).toMatchObject({ scope: 'targeted', features: ['duel'], full: false, data: false });
      expect(plan.unit).toContain('tests/unit/duelPreset372.test.ts');
      expect(plan.e2e).toContain('tests/e2e/duelPreset372.spec.ts');
      expect(plan.e2e).toContain('tests/e2e/v0280-duel-url.spec.ts');
      expect(plan.e2e).toContain('tests/e2e/v0290-322-golden.spec.ts');
    }
    expect(planChanges([{ path: 'src/domain/duel.ts' }])).toMatchObject({ full: true, data: false });
  });
});
