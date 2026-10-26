import { expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { planChanges } from '../../scripts/ci-scope.mjs';

it('#450 区域单位只读投影覆盖文明验证，未知领域与核心计算仍完整验证', () => {
  const plan = planChanges([{ path: 'src/domain/civUnits.ts' }, { path: 'scripts/ci-scope.mjs' }]);
  expect(plan).toMatchObject({ scope: 'civ-ui', features: ['civs'], full: false, data: false });
  expect(plan.unit).toContain('tests/unit/civRegionalUnits450.test.ts');
  expect(plan.unit).toContain('tests/unit/release*.test.ts');
  expect(plan.e2e).toContain('tests/e2e/civRegionalUnits450.spec.ts');
  for (const path of ['src/domain/unknown.ts', 'src/domain/simulator.ts'])
    expect(planChanges([{ path }])).toMatchObject({ scope: 'full', full: true, data: false });
});
