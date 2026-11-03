import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts have no declarations
import { applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';
const change = (path: string) => ({ path, before: '', after: 'changed' });
const plan = (...paths: string[]) => planChanges(paths.map(change));
describe('minimal CI optimization coverage', () => {
  it('home-only changes retain existing entry checks and mechanism acceptance', () => {
    const p = plan('src/features/home/components/ScenarioSuggestions.tsx');
    expect(p.unit).toContain('tests/unit/mechanism652.test.ts');
    expect(p.unit).toContain('tests/unit/ageRoutes652.test.ts');
    for (const name of ['smoke', 'editorial6', 'startGame592', 'startGame632', 'mechanism652', 'routes652'])
      expect(applyBrowserPolicy(p, { GITHUB_EVENT_NAME: 'pull_request' }).e2e).toContain(`tests/e2e/${name}.spec.ts`);
  });
  it('only the audited runtime loader avoids regeneration, retaining full computation and main browser', () => {
    const p = plan('src/data/index.ts');
    expect(p).toMatchObject({ full: true, data: false });
    expect(applyBrowserPolicy(p, { GITHUB_EVENT_NAME: 'push' }).browser).toBe('full');
    expect(applyBrowserPolicy(p, { GITHUB_EVENT_NAME: 'pull_request' })).toMatchObject({ full: true, browser: 'capped' });
  });
  it.each([
    'src/data/civs.json',
    'src/data/raw/units.ts',
    'src/data/unknown.ts',
    'scripts/build_data.py',
    'scripts/data_sources.json',
    'scripts/pinyin_build.mjs',
    'package-lock.json',
    '.npmrc',
  ])('mixed loader + %s still regenerates', (path) => expect(plan('src/data/index.ts', path)).toMatchObject({ full: true, data: true }));
  it.each(['src/domain/positionScenarios.ts', 'src/shared/nav/pageRegistry.ts', 'src/shared/styles/tokens.css', 'unknown.config.ts'])(
    '%s keeps conservative full validation',
    (path) => expect(plan(path)).toMatchObject({ full: true }),
  );
  it('new specs are selected and workflow changes retain release-policy gates', () => {
    expect(plan('tests/e2e/newFeature.spec.ts').e2e).toContain('tests/e2e/newFeature.spec.ts');
    expect(plan('tests/unit/newFeature.test.ts').unit).toContain('tests/unit/newFeature.test.ts');
    expect(plan('.github/workflows/ci.yml').unit).toContain('tests/unit/release*.test.ts');
    expect(plan('.github/workflows/ci.yml', 'src/domain/unknown.ts').full).toBe(true);
  });
});
