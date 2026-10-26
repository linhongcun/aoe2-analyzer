import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI policy is a native Node module without a declaration.
import { planChanges, removesSourceBaseline, sourceSchemaOnly } from '../../scripts/ci-scope.mjs';
// @ts-expect-error Delivery helpers are native Node modules without declarations.
import { smokeFeatures } from '../../scripts/deployment-smoke.mjs';

const change = (path: string, before: string | null = '', after: string | null = '') => ({ path, before, after });
const emptyBaseline = 'export const LEGACY_SOURCE_BASELINE = Object.freeze([]);';
const existingBaseline = 'export const LEGACY_SOURCE_BASELINE = Object.freeze([{ file: "old-source" }]);';
const buildPath = 'src/content/schema/data-build-order.json';
const guidePath = 'src/content/schema/content-game-guide.json';

describe('#442 bounded source-presentation CI plan', () => {
  it('a full fallback retains the changed source pages in the deployment smoke', () => {
    expect(smokeFeatures(['all', 'builds', 'gameGuide'])).toEqual(['builds', 'gameGuide', 'simulator', 'units']);
  });

  it('exact public helpers and DTOs cover both real consumers and five JSON-boundary suites', () => {
    const plan = planChanges([change('src/domain/sourcePresentation.mjs')]);
    expect(plan).toMatchObject({ scope: 'targeted', features: ['builds', 'gameGuide'], data: false, full: false });
    for (const name of ['contentSchema285', 'contentSources285', 'generatedSchemas285', 'jsonBoundary285', 'sourcePolicy285']) {
      expect(plan.unit).toContain(`tests/unit/${name}.test.ts`);
    }
    expect(plan.unit).toContain('tests/unit/buildOrders.test.ts');
    expect(plan.unit).toContain('tests/unit/v0300-335.test.ts');
    expect(plan.unit).toContain('tests/unit/gameGuide256.test.ts');
    expect(plan.e2e).toContain('tests/e2e/practice216.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/gameGuide256.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/sourcePresentation442.spec.ts');
  });

  it('only the whole canonical empty baseline module can use deletion scope', () => {
    expect(removesSourceBaseline(existingBaseline, emptyBaseline + '\n')).toBe(true);
    expect(planChanges([change('scripts/content-baseline.mjs', existingBaseline, emptyBaseline)])).toMatchObject({ scope: 'targeted', data: false });
    for (const after of [
      existingBaseline,
      'export const LEGACY_SOURCE_BASELINE = Object.freeze([ { file: "new" } ]);',
      emptyBaseline + '\nglobalThis.anyCode = true;',
      `const hidden = ${JSON.stringify(emptyBaseline)};`,
      'export const LEGACY_SOURCE_BASELINE = Object.freeze([ ]);',
    ])
      expect(planChanges([change('scripts/content-baseline.mjs', existingBaseline, after)])).toMatchObject({ scope: 'full', data: false });
    expect(planChanges([change('scripts/content-baseline.mjs', null, emptyBaseline)])).toMatchObject({ scope: 'full' });
  });

  it.each([buildPath, guidePath])('%s permits citation-only edits but no step/card/unknown structural edits', (path) => {
    const before = readFileSync(path, 'utf8');
    const source = JSON.parse(before);
    source.properties.sources.description = 'Public citation structure';
    expect(sourceSchemaOnly(path, before, JSON.stringify(source))).toBe(true);
    expect(planChanges([change(path, before, JSON.stringify(source))])).toMatchObject({ scope: 'targeted', full: false, data: false });
    for (const mutate of [
      (schema: typeof source) => {
        schema.$defs[path === buildPath ? 'step' : 'card'].required = [];
      },
      (schema: typeof source) => {
        schema.$defs.privateCore = { type: 'object' };
      },
      (schema: typeof source) => {
        schema.required = [];
      },
      (schema: typeof source) => {
        schema.allOf = [{ properties: { steps: { maxItems: 0 } } }];
      },
    ]) {
      const bad = JSON.parse(before);
      mutate(bad);
      expect(planChanges([change(path, before, JSON.stringify(bad))])).toMatchObject({ scope: 'full', full: true, data: false });
    }
    expect(sourceSchemaOnly(path, before, '{invalid')).toBe(false);
  });

  it('generic schema engine, policy, runtime validators and unmapped paths remain full', () => {
    for (const path of [
      'scripts/content-schema.mjs',
      'scripts/content-schema-catalog.mjs',
      'scripts/compile-json-validators.mjs',
      'src/content/schema/common.defs.json',
      'src/content/schema/policy.mjs',
      'src/content/schema/compiled/scouting.mjs',
      'src/content/schema/data-other.json',
      'src/domain/sourcePresentationOther.mjs',
      'scripts/check-source-presentation-extra.mjs',
      'src/domain/buildSim.ts',
    ])
      expect(planChanges([change(path)])).toMatchObject({ scope: 'full', full: true, data: false });
    expect(planChanges([change('src/data/build-orders/scouts-18.json')])).toMatchObject({ scope: 'full', data: true });
    expect(planChanges([change('package.json', '{"version":"0.40.0"}', '{"version":"0.40.1","dependencies":{"other":"1"}}')])).toMatchObject({
      scope: 'full',
      data: true,
    });
  });
});
