import { describe, expect, it } from 'vitest';
// @ts-expect-error CI policy scripts are plain Node modules
import { applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';

const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const plan = (...paths: string[]) => applyBrowserPolicy(planChanges(paths.map((path) => ({ path }))), pr);

describe('#584 insight presentation CI scope', () => {
  it('the exact content path selects its real unit and civilization consumers', () => {
    const selected = plan('src/domain/insights.ts');
    expect(selected).toMatchObject({ full: false, data: false, scope: 'targeted', features: ['civs', 'units'], browser: 'capped' });
    expect(selected.unit.filter((path: string) => path === 'tests/unit/insights584.test.ts')).toHaveLength(1);
    expect(selected.e2e).toEqual(expect.arrayContaining(['tests/e2e/insights584.spec.ts', 'tests/e2e/civ603.spec.ts']));
    expect(selected.e2e.filter((path: string) => path === 'tests/e2e/insights584.spec.ts')).toHaveLength(1);
    expect(selected.features).not.toContain('insights');
  });

  it.each([
    'src/domain/insightsExtra.ts',
    'src/domain/insights.tsx',
    'src/domain/insights/registry.ts',
    'src/domain/simulator.ts',
    'src/shared/ui/InsightSlot.tsx',
  ])('%s stays full instead of inheriting the exact display exemption', (path) => {
    expect(plan(path)).toMatchObject({ scope: 'full', full: true, data: false });
  });

  it('a mixed calculation or generated-data change retains the conservative plan', () => {
    const mixed = plan('src/domain/insights.ts', 'src/domain/realCost.ts');
    expect(mixed).toMatchObject({ scope: 'full', full: true, data: false });
    expect(mixed.browser).toBe('full');
    expect(plan('src/domain/insights.ts', 'src/data/units.json')).toMatchObject({ scope: 'full', full: true, data: true });
  });

  it('#659 CI policy or a global guard edit cannot reduce its own verification', () => {
    const maintenance = plan('scripts/ci-scope.mjs');
    expect(maintenance).toMatchObject({ full: true, browser: 'full', data: false });
    const selected = plan('src/domain/insights.ts', 'tests/e2e/v0300-338.spec.ts', 'tests/e2e/screenshots.spec.ts');
    expect(selected).toMatchObject({ full: true, browser: 'full', data: false });
  });
});
