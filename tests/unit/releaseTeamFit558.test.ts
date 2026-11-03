import { describe, expect, it } from 'vitest';
// @ts-expect-error CI policy is a plain Node module.
import { applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI runner is a plain Node module.
import { testCommand } from '../../scripts/ci-run.mjs';
const change = (path: string) => ({ path, before: '', after: '' });
describe('#558 exact feature profile without routing/domain exemptions', () => {
  it.each(['src/features/teamFit/TeamFit.tsx', 'src/features/teamFit/TeamFitResults.tsx'])('%s preserves real acceptance and label regressions', (path) => {
    const plan = planChanges([change(path)]);
    expect(plan).toMatchObject({ full: false, data: false, features: ['teamFit'] });
    expect(plan.unit).toContain('tests/unit/teamFit558.test.ts');
    expect(plan.unit).toContain('tests/unit/teamChainNote273.test.ts');
    expect(applyBrowserPolicy(plan, { GITHUB_EVENT_NAME: 'pull_request' }).e2e).toEqual([
      'tests/e2e/smoke.spec.ts',
      'tests/e2e/teamBonuses228.spec.ts',
      'tests/e2e/teamFit558.spec.ts',
      'tests/e2e/v0300-273.spec.ts',
    ]);
  });
  it('#659 CSS without an audited selector closure retains full coverage', () => {
    expect(planChanges([change('src/features/teamFit/teamFit.css')])).toMatchObject({ full: true, data: false });
  });
  it.each([
    'src/shared/nav/pageRegistry.ts',
    'src/app/pageRegistry.tsx',
    'src/domain/teamFit.ts',
    'src/domain/teamFitQuery.ts',
    'src/domain/teamSourceLabels.ts',
    'src/domain/unknown.ts',
  ])('%s stays conservative full with actual feature checks', (path) => {
    const plan = planChanges([change('src/features/teamFit/TeamFit.tsx'), change(path)]);
    expect(plan).toMatchObject({ full: true, data: false });
    const browser = applyBrowserPolicy(plan, { GITHUB_EVENT_NAME: 'pull_request' });
    expect(browser.browser).toBe('full');
    expect(testCommand(browser, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  });
  it('keeps exact derived page metadata full without regenerating unchanged game data', () => {
    expect(planChanges([change('src/data/page-metadata.json')])).toMatchObject({ full: true, data: false });
    const plan = planChanges([change('src/data/page-metadata.json'), change('src/shared/nav/pageRegistry.ts'), change('src/features/teamFit/TeamFit.tsx')]);
    expect(plan).toMatchObject({ full: true, data: false });
    expect(applyBrowserPolicy(plan, { GITHUB_EVENT_NAME: 'pull_request' }).browser).toBe('full');
  });
  it.each([
    'src/data/page-metadata-extra.json',
    'src/data/page_metadata.json',
    'src/data/meta/page-metadata.json',
    'src/data/page-metadata.json/subpath',
    'src/data/units.json',
    'scripts/pinyin_build.mjs',
    'scripts/build_data.py',
    'scripts/data_sources.json',
  ])('metadata does not exempt %s or reset mixed data validation', (path) => {
    for (const paths of [
      ['src/data/page-metadata.json', path],
      [path, 'src/data/page-metadata.json'],
    ])
      expect(planChanges(paths.map(change))).toMatchObject({ full: true, data: true });
  });
  it('never exempts generated game data', () =>
    expect(planChanges([change('src/features/teamFit/TeamFit.tsx'), change('src/data/units.json')])).toMatchObject({ full: true, data: true }));
});
