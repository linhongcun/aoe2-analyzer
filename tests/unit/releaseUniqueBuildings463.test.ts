import { expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { planChanges } from '../../scripts/ci-scope.mjs';

it('#463 独特建筑沿用文明展示范围并保留既有区域验证', () => {
  const plan = planChanges([{ path: 'src/domain/civBuildings.ts' }, { path: 'scripts/ci-scope.mjs' }]);
  expect(plan).toMatchObject({ scope: 'civ-ui', features: ['civs'], data: false, full: false });
  expect(plan.unit).toContain('tests/unit/civUniqueBuildings463.test.ts');
  expect(plan.unit).toContain('tests/unit/civRegionalBuildings456.test.ts');
  expect(plan.unit).toContain('tests/unit/release*.test.ts');
  expect(plan.e2e).toContain('tests/e2e/civUniqueBuildings463.spec.ts');
  expect(plan.e2e).toContain('tests/e2e/civRegionalBuildings456.spec.ts');
  for (const path of ['src/domain/unknown.ts', 'src/domain/buildingSim.ts'])
    expect(planChanges([{ path }])).toMatchObject({ scope: 'full', full: true, data: false });
});
