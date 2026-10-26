import { expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { planChanges } from '../../scripts/ci-scope.mjs';

it('#456 区域建筑只读投影覆盖文明与相关发布验证，未知核心仍完整', () => {
  const plan = planChanges([{ path: 'src/domain/civBuildings.ts' }, { path: 'scripts/ci-scope.mjs' }]);
  expect(plan).toMatchObject({ scope: 'civ-ui', features: ['civs'], full: false, data: false });
  expect(plan.unit).toContain('tests/unit/civRegionalBuildings456.test.ts');
  expect(plan.unit).toContain('tests/unit/release*.test.ts');
  expect(plan.e2e).toContain('tests/e2e/civRegionalBuildings456.spec.ts');
  for (const path of ['src/domain/unknown.ts', 'src/domain/buildingSim.ts', 'src/domain/buildings.ts'])
    expect(planChanges([{ path }])).toMatchObject({ scope: 'full', full: true, data: false });
});
