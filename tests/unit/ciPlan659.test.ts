import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { collectedUnitCases, actualUnitExecution, frozenRequirements } from '../../scripts/ci-plan.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { planChanges } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { createArtifactManifest, artifactSnapshot, artifactManifestDigest, verifyGateLink, verifyArtifactManifest } from '../../scripts/site-artifact.mjs';

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const root = '/repo';
const a = { file: root + '/tests/unit/example.test.ts', name: 'suite > first' };
const b = { file: root + '/tests/unit/example.test.ts', name: 'suite > second' };
const result = (status = 'passed') => ({
  success: true,
  testResults: [
    {
      name: a.file,
      assertionResults: [
        { ancestorTitles: ['suite'], title: 'first', status },
        { ancestorTitles: ['suite'], title: 'second', status: 'passed' },
      ],
    },
  ],
});

it('unit public collection and actual report agree on stable names without treating requested files as execution', () => {
  const frozen = collectedUnitCases([a, b], root);
  const actual = actualUnitExecution(result(), root);
  expect(actual.files).toEqual(['tests/unit/example.test.ts']);
  expect(actual.cases.slice().sort((x: { id: string }, y: { id: string }) => x.id.localeCompare(y.id))).toEqual(
    frozen.map((c: { id: string }) => ({ id: c.id, status: 'passed' })),
  );
  const omitted = result();
  omitted.testResults[0]!.assertionResults.pop();
  expect(actualUnitExecution(omitted, root).cases).not.toHaveLength(frozen.length);
  expect(actualUnitExecution(result('skipped'), root).cases).toContainEqual({ id: collectedUnitCases([a], root)[0].id, status: 'skipped' });
  expect(() => actualUnitExecution({ ...result(), success: false }, root)).toThrow(/succeed/);
});

it('freezing rejects empty, duplicate and escaped unit collections', () => {
  expect(() => collectedUnitCases([], root)).toThrow(/Empty/);
  expect(() => collectedUnitCases([a, a], root)).toThrow(/Duplicate/);
  expect(() => collectedUnitCases([{ ...a, file: '/outside/evil.test.ts' }], root)).toThrow();
});
it('CI duration weights change broad validation without regenerating unchanged game data', () => {
  expect(planChanges([{ path: 'scripts/ci-browser-weights.json' }])).toMatchObject({ full: true, data: false });
  expect(planChanges([{ path: 'scripts/unmapped-source.json' }])).toMatchObject({ full: true, data: true });
});
it('freezes only the three existing disabled unit identities that public Vitest list omits', () => {
  const entries = ['buildSim', 'bonusUsage317', 'v0300-289'].map((file) => ({ file: `${root}/tests/unit/${file}.test.ts`, name: 'ordinary case' }));
  const cases = collectedUnitCases(entries, root);
  expect(cases.filter((c: { expectedStatus: string }) => c.expectedStatus === 'skipped')).toHaveLength(3);
  const nested = collectedUnitCases(
    [
      {
        file: `${root}/tests/unit/buildSim.test.ts`,
        name: 'nested > #42 P0 buildSim 文明加成不得静默忽略 > 高棉：农田为瓶颈的开局里，去掉 654 必须让结果变慢（证明后再把高棉放出来）',
      },
    ],
    root,
  );
  expect(nested.find((c: { name: string }) => c.name.startsWith('nested'))?.expectedStatus).toBe('passed');
});

it('a non-PR plan always requires fresh build and separate current main checks', () => {
  const plan = { scope: 'maintenance', full: false, data: false, browser: 'capped', features: [], unit: [], e2e: ['tests/e2e/smoke.spec.ts'] };
  const shards = [{ index: 1, cases: [{ id: 'browser-a', file: 'tests/e2e/smoke.spec.ts', expectedStatus: 'passed' }] }];
  const requirements = frozenRequirements(plan, { node: 'v20', lock: 'a' }, [], shards, 'push');
  expect(requirements.map((r: { stage_id: string }) => r.stage_id)).toEqual(['static', 'static-main', 'build', 'browser-1']);
  expect(requirements.find((r: { stage_id: string }) => r.stage_id === 'build')).toMatchObject({
    reusable: false,
    selection: { checks: ['build', 'fresh-build-smoke', 'snapshot'] },
  });
  expect(requirements.find((r: { stage_id: string }) => r.stage_id === 'static-main')).toMatchObject({ reusable: false });
});

function artifact() {
  const directory = mkdtempSync(join(tmpdir(), 'ci659-artifact-'));
  folders.push(directory);
  writeFileSync(join(directory, 'index.html'), '<main>built bytes</main>');
  const options = { directory, commit: 'a'.repeat(40), tree: 'b'.repeat(40), version: 'v0.77.2', repository: 'owner/repo', runId: 659, plan: { features: [] } };
  const manifest = createArtifactManifest({
    ...options,
    gate_ref: 'ci-v2:owner/repo:659:1:plan:test',
    runAttempt: 1,
    buildJobId: 77,
    toolchainDigest: 'c'.repeat(64),
  });
  return { directory, options, manifest };
}
it('immutable build manifest binds the separate completed gate to exact bytes and source build', () => {
  const { directory, options } = artifact();
  const snapshot = artifactSnapshot(directory);
  expect(verifyGateLink(directory, { version: 2, snapshot })).toBe(true);
  expect(verifyArtifactManifest(options).runAttempt).toBe(1);
  expect(() => verifyGateLink(directory, { version: 1, snapshot })).toThrow(/v2/);
  expect(() => verifyGateLink(directory, { version: 2, snapshot: { ...snapshot, build_job_id: 78 } })).toThrow(/immutable bytes/);
  writeFileSync(join(directory, 'index.html'), 'changed after browser checks');
  expect(() => verifyArtifactManifest(options)).toThrow(/bytes changed/);
});
it('even a correlated manifest rewrite invalidates the external gate link', () => {
  const { directory } = artifact();
  const snapshot = artifactSnapshot(directory),
    before = artifactManifestDigest(directory);
  const path = join(directory, 'build-evidence.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.plan.features = ['different'];
  writeFileSync(path, JSON.stringify(manifest));
  expect(artifactManifestDigest(directory)).not.toBe(before);
  expect(() => verifyGateLink(directory, { version: 2, snapshot })).toThrow(/immutable bytes/);
});
