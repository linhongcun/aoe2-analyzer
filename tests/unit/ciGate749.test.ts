import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { GATE_NARROW_SMOKE, browserShardCount, minimalGatePlan, narrowSmokeGate } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { planChanges, selectBuildSmokeCases, selectCiPlan, selectNarrowSmokeCases } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { frozenRequirements } from '../../scripts/ci-plan.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { validatePlan } from '../../scripts/ci-run.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { BROWSER_SCHEMA, buildShardManifest, canonicalCases, validateShardReport } from '../../scripts/ci-shards.mjs';

const toolchain = { node: 'v20', lock: 'a' };
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const release = readFileSync('.github/workflows/release.yml', 'utf8');
const smokeSource = readFileSync('tests/e2e/smoke.spec.ts', 'utf8');

function collected(title: string, id = title, file = 'tests/e2e/smoke.spec.ts') {
  return { id, file, titlePath: [title], expectedStatus: 'passed' };
}

function narrowCollection(extra = true) {
  const cases = GATE_NARROW_SMOKE.map((entry: { title: string }, index: number) => collected(entry.title, 'narrow-' + index));
  return extra ? [...cases, collected('route #builds renders without console errors', 'matrix-route')] : cases;
}

function identityCase() {
  return collected('fresh build identity matches the actual checked-out commit and package version', 'identity', 'tests/e2e/ciBuild659.spec.ts');
}

function routeMatrix() {
  return Array.from({ length: 24 }, (_, index) => collected('route #r' + index + ' renders without console errors', 'route-' + index));
}

describe('#749 default gate', () => {
  it('keeps a risky diff on one narrow shard instead of restoring the full matrix', () => {
    const classified = planChanges([{ path: 'src/domain/duel.ts', before: 'a', after: 'b' }]);
    expect(classified.full).toBe(true);
    const plan = selectCiPlan(classified, {});
    expect(plan).toMatchObject({
      scope: 'gate',
      browser: 'gate',
      full: false,
      data: false,
      unit: [],
      e2e: ['tests/e2e/smoke.spec.ts'],
    });
    expect(validatePlan(plan)).toMatchObject({ browser: 'gate' });
    expect(browserShardCount(plan, 4)).toBe(1);
    expect(browserShardCount(selectCiPlan({}, { CI_FULL: 'true' }), 1)).toBe(4);
    expect(minimalGatePlan().e2e).toEqual(['tests/e2e/smoke.spec.ts']);
  });

  it('manual full still requires static-main, unit, data and four browser shards', () => {
    const plan = selectCiPlan({ features: ['civs'], e2e: ['tests/e2e/civText402.spec.ts'] }, { CI_FULL: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch' });
    expect(plan).toMatchObject({ scope: 'full', full: true, data: true, browser: 'full' });
    const shards = [1, 2, 3, 4].map((index) => ({
      index,
      cases: [{ id: 'full-' + index, file: 'tests/e2e/smoke.spec.ts', expectedStatus: 'passed' }],
    }));
    const requirements = frozenRequirements(
      plan,
      toolchain,
      [{ id: 'unit-1', file: 'tests/unit/duel.test.ts', expectedStatus: 'passed' }],
      shards,
      'workflow_dispatch',
    );
    expect(requirements.map((entry: { stage_id: string }) => entry.stage_id)).toEqual([
      'static',
      'static-main',
      'unit',
      'data',
      'build',
      'browser-1',
      'browser-2',
      'browser-3',
      'browser-4',
    ]);
    expect(narrowSmokeGate(plan, [], requirements)).toBeNull();
  });

  it('selects homepage, key routes, search and the Paladin calculation, and drops the rest of the matrix', () => {
    const kinds = GATE_NARROW_SMOKE.map((entry: { kind: string }) => entry.kind);
    expect(kinds.filter((kind: string) => kind === 'route').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('query');
    expect(kinds).toContain('calculation');
    const selected = selectNarrowSmokeCases(narrowCollection());
    expect(selected.map((entry: { titlePath: string[] }) => entry.titlePath[0])).toEqual(GATE_NARROW_SMOKE.map((entry: { title: string }) => entry.title));
    expect(selected.some((entry: { id: string }) => entry.id === 'matrix-route')).toBe(false);
    expect(() => selectNarrowSmokeCases(narrowCollection(false).slice(1))).toThrow(/route \(home\)/);
    const gatePlan = selectCiPlan(planChanges([{ path: 'docs/TESTING.md', before: 'a', after: 'b' }]), { GITHUB_EVENT_NAME: 'pull_request' });
    const requirements = frozenRequirements(gatePlan, toolchain, [], [{ index: 1, cases: selected }], 'push');
    expect(requirements.map((entry: { stage_id: string }) => entry.stage_id)).toEqual(['static', 'build', 'browser-1']);
    expect(requirements.find((entry: { stage_id: string }) => entry.stage_id === 'browser-1')).toMatchObject({ reusable: false });
    expect(narrowSmokeGate(gatePlan, selected, requirements).titles).toEqual(GATE_NARROW_SMOKE.map((entry: { title: string }) => entry.title));
    expect(() => narrowSmokeGate(gatePlan, [...selected, collected('route #tree renders without console errors', 'extra')], requirements)).toThrow(
      /outside the narrow smoke/,
    );
  });

  it('keeps the 24-route build matrix off the default gate and on the full plan', () => {
    const cases = [identityCase(), ...routeMatrix()];
    expect(selectBuildSmokeCases(cases, 'gate').map((entry: { id: string }) => entry.id)).toEqual(['identity']);
    expect(selectBuildSmokeCases(cases, 'matrix')).toHaveLength(25);
    expect(() => selectBuildSmokeCases(routeMatrix(), 'gate')).toThrow(/build identity smoke missing/);
  });

  it('rejects a failed narrow smoke report before that report can authorize a deploy', () => {
    const smoke = canonicalCases([
      {
        id: 'home',
        project: '',
        file: 'tests/e2e/smoke.spec.ts',
        selectorFile: 'smoke.spec.ts',
        titlePath: ['route (home) renders without console errors'],
        repeatEachIndex: 0,
        expectedStatus: 'passed',
        allowedSkip: null,
      },
    ])[0];
    const snapshot = {
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      run_id: 749,
      run_attempt: 1,
      build_job_id: 750,
      manifest_digest: 'c'.repeat(64),
      gate_ref: 'ci-v2:owner/repo:749:1:plan:test',
    };
    const manifest = buildShardManifest({ cases: [smoke], sourceBuild: snapshot, shardCount: 1 });
    const report = {
      schema: BROWSER_SCHEMA,
      kind: 'browser-execution',
      shardIndex: 1,
      sourceBuild: snapshot,
      caseDigest: manifest.shards[0].caseDigest,
      selectedCases: manifest.shards[0].cases,
      status: 'failed',
      errors: ['homepage did not render'],
      startedAt: '2026-11-08T00:00:00.000Z',
      finishedAt: '2026-11-08T00:00:01.000Z',
      cases: [],
    };
    expect(() => validateShardReport(manifest, 1, report)).toThrow(/did not pass/);
    expect(manifest.shards).toHaveLength(1);
  });

  it('locks the smoke spec to the homepage, key routes, search and Paladin total', () => {
    expect(smokeSource).toContain("test(`route ${hash || '(home)'} renders without console errors`");
    expect(smokeSource).toContain("['', '#home .hcard']");
    expect(smokeSource).toContain("['#civs', '#grid .card']");
    expect(smokeSource).toContain("['#/civ/Franks', '#detail h1']");
    expect(smokeSource).toContain("['#unit/569', '#unit .dtabs']");
    expect(smokeSource).toContain('expect(errors).toEqual([])');
    expect(smokeSource).toContain("test('Ctrl+K command palette searches across civs/units/techs'");
    expect(smokeSource).toContain("fill('paladin')");
    expect(smokeSource).toContain("test('Franks Paladin full tech = 192 HP'");
    expect(smokeSource).toContain("toHaveText('192')");
  });

  it('requires static-main only when validation is forced or scheduled', () => {
    const source = readFileSync('scripts/ci-stage-evidence.mjs', 'utf8');
    expect(source).toContain("const fullValidation = current.force_full === true || current.event.name === 'schedule'");
    expect(source).toContain("fullValidation && current.event.name !== 'pull_request' && !ids.includes('static-main')");
  });

  it('keeps deploy behind the aggregate and the deployed-site artifact on the same dist', () => {
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).not.toContain('17 20 * * *');
    expect(workflow).toContain("if: needs.plan.outputs.unit == 'true'");
    expect(workflow).toContain("if: needs.plan.outputs.data == 'true'");
    expect(workflow).toContain("if: needs.plan.outputs.browser != '[]'");
    expect(workflow).toContain("matrix: { shard: '${{ fromJSON(needs.plan.outputs.browser) }}' }");
    expect(workflow).not.toContain('if: false');
    const aggregateAt = workflow.indexOf('node scripts/ci-stage.mjs aggregate');
    const deployedAt = workflow.indexOf('name: deployed-site');
    const pagesAt = workflow.indexOf('actions/upload-pages-artifact@v3');
    expect(aggregateAt).toBeGreaterThan(0);
    expect(deployedAt).toBeGreaterThan(aggregateAt);
    expect(pagesAt).toBeGreaterThan(aggregateAt);
    expect(workflow).toContain('path: ${{ runner.temp }}/ci-build/dist');
    expect(workflow).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(workflow.slice(workflow.indexOf('\n  deploy:\n'))).toContain("needs.test.result == 'success'");
    expect(release).toContain('name: deployed-site');
    expect(release).toContain('path: dist');
    expect(release).toContain('run-id: ${{ steps.verify.outputs.ci_run_id }}');
    expect(release).toContain('name: ci-validation-evidence');
  });
});
