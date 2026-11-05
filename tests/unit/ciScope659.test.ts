import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules.
import { PROFILES, applyBrowserPolicy, planChanges, prCappedExcludes } from '../../scripts/ci-scope.mjs';
import baseline from './fixtures/ci-scope-659-baseline.json';

const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const main = { GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'true' };
const change = (path: string, before: string | null = '', after: string | null = 'changed') => ({ path, before, after });
const browser = (changes: unknown, env = pr) => applyBrowserPolicy(planChanges(changes), env);

describe('#659 frozen coverage and actual v1 to v2 shadow comparison', () => {
  it('retains the exact audited source identity for the v1 snapshot', () => {
    expect(baseline.sourceCommit).toBe('407b1ea5a54c098dd6e6fd5a6bfcb60ed4cd125d');
    expect(baseline.scopeSha256).toBe('6ad39a970a1b2e9b683a8144a77750b07484ec235bd90857684ea9e00b99ec92');
    expect(baseline.cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(baseline.cases)('$name: freezes the new risk/data contract for PR and main', (row) => {
    for (const env of [pr, main]) {
      const selected = browser(row.changes, env);
      expect(selected).toMatchObject(row.expected);
      expect(selected.browser).toBe(row.expected.full ? 'full' : 'capped');
      if (!row.expected.full) expect(selected.e2e).toContain('tests/e2e/smoke.spec.ts');
    }
    // Every bounded v1 assertion remains, except unrelated tours explicitly assigned to nightly.
    // A broad v2 browser plan resolves the entire suite rather than claiming its empty list is coverage.
    const selected = browser(row.changes);
    for (const old of [row.old.pr, row.old.main]) {
      expect(selected.data).toBe(old.data);
      if (!selected.full) {
        expect(selected.unit).toEqual(expect.arrayContaining(old.unit));
        expect(selected.e2e).toEqual(expect.arrayContaining(old.e2e.filter((path) => !prCappedExcludes(path, selected.paths))));
      }
    }
  });

  it('all six incompletely bounded shared helper changes stay broad until separately audited', () => {
    for (const name of ['formatTime', 'dupNames', 'glossary', 'linker', 'sharePage', 'simRoute'])
      expect(browser([change('src/domain/' + name + '.ts')])).toMatchObject({ full: true, data: false, browser: 'full' });
  });

  it('PageMeta has application-wide consumers despite living inside a feature directory', () => {
    expect(browser([change('src/features/share/PageMeta.tsx')])).toMatchObject({ full: true, data: false, browser: 'full' });
  });

  it('a civ source edit retains actual history/background regressions, not only the initial importing diff', () => {
    const selected = browser([change('src/features/civs/components/CivDetail.tsx')]);
    for (const name of ['civHistory', 'civBackgrounds']) {
      expect(PROFILES.civs.unit).toContain('tests/unit/' + name + '.test.ts');
      expect(PROFILES.civs.e2e).toContain('tests/e2e/' + name + '.spec.ts');
      expect(selected.e2e).toContain('tests/e2e/' + name + '.spec.ts');
    }
    expect(selected.e2e).toContain('tests/e2e/civDlcFilters.spec.ts');
  });

  it.each([
    ['src/features/buildings/components/BuildingList.tsx', ['ageBuildings704', 'automaticAge705']],
    ['src/features/buildings/components/BuildingDetail.tsx', ['ageBuildings704', 'automaticAge705']],
    ['src/features/units/components/UnitDetail.tsx', ['automaticAge705', 'armorValues706', 'negativeBonus707']],
    ['src/features/duel/components/DuelSelection.tsx', ['armorValues706', 'negativeBonus707']],
    ['src/shared/ui/sim/SimPanel.tsx', ['ageBuildings704', 'automaticAge705', 'armorValues706', 'negativeBonus707']],
  ] as const)('%s alone retains the mechanics regressions without test-file changes', (path, names) => {
    for (const env of [pr, main]) {
      const selected = browser([change(path)], env);
      expect(selected).toMatchObject({ full: false, data: false });
      for (const name of names) {
        expect(selected.unit).toContain(`tests/unit/${name}.test.ts`);
        expect(selected.e2e).toContain(`tests/e2e/${name}.spec.ts`);
      }
    }
  });

  it('building simulation alone does not select an armor display it never passes', () => {
    const selected = browser([change('src/features/buildings/components/BuildingSimulator.tsx')]);
    expect(selected.unit).not.toContain('tests/unit/armorValues706.test.ts');
    expect(selected.e2e).not.toContain('tests/e2e/armorValues706.spec.ts');
  });

  it.each([
    'src/features/techs/components/TechDetail.tsx',
    'src/features/techs/components/TechAffects.tsx',
    'src/features/techs/components/ThumbRingEffectText.tsx',
    'src/features/units/components/UnitDetail.tsx',
    'src/features/duel/components/DuelSelection.tsx',
    'src/shared/ui/sim/SimPanel.tsx',
  ])('%s alone retains the Thumb Ring display regression', (path) => {
    const selected = browser([change(path)]);
    expect(selected).toMatchObject({ full: false, data: false });
    expect(selected.unit).toContain('tests/unit/thumbRing709.test.ts');
    expect(selected.e2e).toContain('tests/e2e/thumbRing709.spec.ts');
  });

  it.each(['src/features/units/components/UnitDetail.tsx', 'src/features/units/components/TrebuchetStates.tsx', 'src/features/siege/Siege.tsx'])(
    '%s alone retains the Trebuchet state regression',
    (path) => {
      for (const env of [pr, main]) {
        const selected = browser([change(path)], env);
        expect(selected).toMatchObject({ full: false, data: false });
        expect(selected.unit).toContain('tests/unit/trebuchet711.test.ts');
        expect(selected.e2e).toContain('tests/e2e/trebuchet711.spec.ts');
      }
    },
  );

  it.each(['src/features/units/components/UnitDetail.tsx', 'src/features/units/components/AgeCounterBonuses.tsx'])(
    '%s alone retains the age counter display regression',
    (path) => {
      for (const env of [pr, main]) {
        const selected = browser([change(path)], env);
        expect(selected).toMatchObject({ full: false, data: false });
        expect(selected.unit).toContain('tests/unit/ageCounter708.test.ts');
        expect(selected.e2e).toContain('tests/e2e/ageCounter708.spec.ts');
      }
    },
  );

  it('the affected home and ladder keep their exact important negative paths', () => {
    const home = browser([change('src/domain/startGame.ts')]);
    for (const name of ['startGame592', 'startGame632', 'mechanism652', 'routes652']) expect(home.e2e).toContain('tests/e2e/' + name + '.spec.ts');
    expect(browser([change('src/domain/ladderQuery.ts')]).e2e).toContain('tests/e2e/ladder625.spec.ts');
  });

  it.each([
    'src/features/civs/backgrounds.source.json',
    'src/features/civs/backgrounds.json',
    'src/features/civs/import_backgrounds.py',
    'src/features/civs/assets/backgrounds/chinese.webp',
  ])('%s requires actual generation verification', (path) => {
    expect(planChanges([change(path)])).toMatchObject({ full: true, data: true });
  });
});

describe('#659 source-evidenced CSS ownership, not directory-name guessing', () => {
  it.each([
    'src/features/civs/components/civ-background.css',
    'src/features/civs/components/civ-history.css',
    'src/features/civs/components/civOverview.css',
    'src/features/civs/components/civRelatedTools.css',
    'src/features/civs/components/civ-list-links.css',
    'src/features/civs/components/civ-professional-view.css',
    'src/features/civs/components/civ-requirements.css',
    'src/features/civs/components/civ-not-found.css',
    'src/features/civs/components/civ-regional-units.css',
    'src/features/civs/components/civ-regional-buildings.css',
    'src/features/civs/components/civ-unique-buildings.css',
    'src/features/civs/openingBuildChoices.css',
    'src/features/home/home.css',
    'src/features/home/start-game.css',
    'src/features/ladder/ladder.css',
    'src/features/ladder/ladderMeta.css',
    'src/features/ladder/stat-methods.css',
  ])('%s keeps only its actually audited local selector space', (path) => {
    const before = readFileSync(path, 'utf8');
    expect(planChanges([change(path, before, before + '\n/* unchanged declarations */')]).full).toBe(false);
    expect(planChanges([change(path, before, before + '\nbody { display: none; }')]).full).toBe(true);
    expect(planChanges([change(path, before + '\nbody { display: none; }', before)]).full).toBe(true);
  });

  it.each([
    'body { display:none }',
    '.civ-detail-background, body { display:none }',
    '.civ-detail-background + body { display:none }',
    '.civ-detail-background ~ footer { display:none }',
    '@import "global.css";',
    '@font-face { font-family: global; src: url(font.woff2); }',
    '@page { margin:0; }',
    '.civ-detail-background {',
  ])('global, escaping, unknown-at-rule or malformed CSS stays broad: %s', (addition) => {
    const path = 'src/features/civs/components/civ-background.css';
    const before = readFileSync(path, 'utf8');
    expect(planChanges([change(path, before, before + '\n' + addition)])).toMatchObject({ full: true, data: false });
  });

  it('unknown feature CSS does not inherit a private-looking class namespace', () => {
    expect(planChanges([change('src/features/civs/components/not-audited.css', null, '.civ-detail-background { padding:1px }')])).toMatchObject({ full: true });
    const hotkeys = 'src/features/hotkeys/hotkeys.css';
    const source = readFileSync(hotkeys, 'utf8');
    expect(planChanges([change(hotkeys, source, source)])).toMatchObject({ full: true, data: false });
  });
});
