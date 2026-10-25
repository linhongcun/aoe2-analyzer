import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { PROFILES, planChanges } from '../../scripts/ci-scope.mjs';

const change = (path: string) => ({ path, before: '', after: '' });
const history = 'src/shared/ui/PatchHistory.tsx';
const features = ['buildings', 'civs', 'patches', 'techs', 'units'];

describe('#437 建筑历史展示的 CI 影响范围', () => {
  it('the one shared history view covers every consumer and existing history behavior', () => {
    const plan = planChanges([change(history)]);
    expect(plan).toMatchObject({ scope: 'targeted', features, full: false, data: false });
    for (const feature of features) {
      for (const path of PROFILES[feature].unit) expect(plan.unit).toContain(path);
      for (const path of PROFILES[feature].e2e) expect(plan.e2e).toContain(path);
    }
    expect(plan.unit).toContain('tests/unit/entityHistory435.test.ts');
    expect(plan.e2e).toContain('tests/e2e/entityHistory435.spec.ts');
    for (const path of [...plan.unit, ...plan.e2e]) expect(existsSync(path), path).toBe(true);
    expect(new Set(plan.unit).size).toBe(plan.unit.length);
    expect(new Set(plan.e2e).size).toBe(plan.e2e.length);
  });

  it('combines building and patch entrypoints, changed tests, and policy checks without losing history coverage', () => {
    const plan = planChanges([
      change(history),
      change('src/features/buildings/components/BuildingDetail.tsx'),
      change('src/features/patches/Patches.tsx'),
      change('tests/e2e/buildingHistory.spec.ts'),
      change('tests/unit/buildingHistoryCiScope.test.ts'),
      change('scripts/ci-scope.mjs'),
    ]);
    expect(plan).toMatchObject({ scope: 'targeted', features, full: false, data: false });
    expect(plan.e2e).toContain('tests/e2e/buildingHistory.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/entityHistory435.spec.ts');
    expect(plan.unit).toContain('tests/unit/buildingHistoryCiScope.test.ts');
    expect(plan.unit).toContain('tests/unit/entityHistory435.test.ts');
    expect(plan.unit).toContain('tests/unit/release*.test.ts');
  });

  it.each(['src/shared/ui/PatchHistoryOther.tsx', 'src/shared/ui/patchHistory.css', 'src/shared/ui/layout.tsx', 'src/domain/patchHistory.ts'])(
    'keeps unmapped shared or domain changes full: %s',
    (path) => {
      expect(planChanges([change(history), change(path)])).toMatchObject({ scope: 'full', full: true, data: false });
    },
  );

  it.each(['src/data/patchHistory.ts', 'src/data/patches/81058.json', 'scripts/history_inputs/81058.json', 'scripts/history_build.py'])(
    'keeps history data and generation changes full with data validation: %s',
    (path) => {
      expect(planChanges([change(history), change(path)])).toMatchObject({ scope: 'full', full: true, data: true });
    },
  );
});
