import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import * as browserShards from '../../scripts/ci-shards.mjs';
const {
  aggregateShardReports,
  approvedCaseStatus,
  assertSelectedCases,
  atomicUnits,
  buildShardManifest,
  canonicalCases,
  caseSelector,
  validateShardManifest,
  validateShardReport,
} = browserShards;

const snapshot = {
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  run_id: 101,
  run_attempt: 1,
  build_job_id: 202,
  manifest_digest: 'c'.repeat(64),
  gate_ref: 'github-run-101-attempt-1-gate',
};
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function testCase(id: string, file = 'smoke.spec.ts', title = id) {
  return canonicalCases([
    { id, project: '', file: 'tests/e2e/' + file, selectorFile: file, titlePath: [title], repeatEachIndex: 0, expectedStatus: 'passed', allowedSkip: null },
  ])[0];
}
function fixture() {
  const cases = [
    testCase('serial-a'),
    testCase('serial-b'),
    testCase('other', 'timeline.spec.ts'),
    ...[360, 1280].flatMap((width) =>
      Array.from({ length: 8 }, (_, group) => testCase(`sweep-${width}-${group}`, 'v0300-338.spec.ts', `@${width} 全部静态页（第 ${group + 1}/8 组）：表格`)),
    ),
  ];
  return buildShardManifest({ cases, sourceBuild: snapshot, shardCount: 4 });
}
function reportsFor(manifest: ReturnType<typeof fixture>) {
  return manifest.shards.map((shard: { index: number; caseDigest: string; cases: ReturnType<typeof testCase>[] }) => ({
    schema: 1,
    kind: 'browser-execution',
    shardIndex: shard.index,
    sourceBuild: snapshot,
    caseDigest: shard.caseDigest,
    selectedCases: shard.cases,
    status: 'passed',
    errors: [],
    startedAt: '2026-11-03T01:00:00.000Z',
    finishedAt: '2026-11-03T01:00:01.000Z',
    cases: shard.cases.map((c) => ({
      id: c.id,
      key: c.key,
      status: c.expectedStatus,
      expectedStatus: c.expectedStatus,
      retry: 0,
      outcome: c.expectedStatus === 'skipped' ? 'skipped' : 'expected',
      duration: 1,
      annotations: c.allowedSkip ? [{ type: c.allowedSkip.type, description: c.allowedSkip.reason }] : [],
    })),
  }));
}

it('#659 uses stable weighted partitions, keeps serial files atomic, and isolates only the 16 approved sweeps', () => {
  const first = fixture();
  expect(atomicUnits(first.allCases)).toHaveLength(18);
  expect(buildShardManifest({ cases: [...first.allCases].reverse(), sourceBuild: snapshot, shardCount: 4 })).toEqual(first);
  expect(first.shards.map((shard: { cases: unknown[] }) => shard.cases.length).every(Boolean)).toBe(true);
  const owners = first.shards.filter((shard: { cases: { id: string }[] }) => shard.cases.some((c) => c.id.startsWith('serial-')));
  expect(owners).toHaveLength(1);
  expect(aggregateShardReports(first, reportsFor(first)).cases).toHaveLength(first.allCases.length);
});

it('#659 keeps planning snapshots explicit and rejects them as execution evidence', () => {
  const planned = buildShardManifest({ cases: [testCase('one')], sourceBuild: null, shardCount: 1 });
  expect(validateShardManifest(planned)).toBe(planned);
  expect(() => validateShardReport(planned, 1, reportsFor(planned)[0])).toThrow(/Planning manifest/);
  expect(() => buildShardManifest({ cases: [], sourceBuild: null, shardCount: 4 })).toThrow(/Empty global/);
  expect(() => buildShardManifest({ cases: [testCase('one')], sourceBuild: { ...snapshot, tree: '' } })).toThrow(/snapshot/);
});

it('#659 rejects test.fail() declarations and otherwise expected failing outcomes without an explicit exception', () => {
  const failed = { ...testCase('inverted-regression'), expectedStatus: 'failed' };
  expect(() => approvedCaseStatus(failed, {})).toThrow(/Unapproved browser expected status/);
  expect(() => canonicalCases([failed])).toThrow(/expected status/);
  const manifest = fixture(),
    report = reportsFor(manifest)[0]!;
  report.cases[0]!.expectedStatus = 'failed';
  report.cases[0]!.status = 'failed';
  report.cases[0]!.outcome = 'expected';
  expect(() => validateShardReport(manifest, 1, report)).toThrow();
  const forged = structuredClone(manifest);
  forged.shards[0].cases[0].expectedStatus = 'failed';
  forged.allCases.find((c: { id: string }) => c.id === forged.shards[0].cases[0].id).expectedStatus = 'failed';
  expect(() => validateShardManifest(forged)).toThrow(/expected status/);
});

it.each(['missing', 'duplicate', 'cancelled', 'failed', 'skipped', 'retry', 'flaky', 'wrong-build', 'wrong-key', 'missing-selection', 'enumeration', 'error'])(
  '#659 rejects %s execution evidence',
  (fault) => {
    const manifest = fixture(),
      reports = reportsFor(manifest),
      report = reports[0]!;
    if (fault === 'missing') report.cases.pop();
    if (fault === 'duplicate') report.cases[1] = { ...report.cases[0]! };
    if (fault === 'cancelled') report.status = 'interrupted';
    if (fault === 'failed') report.cases[0]!.status = 'failed';
    if (fault === 'skipped') {
      report.cases[0]!.status = 'skipped';
      report.cases[0]!.expectedStatus = 'skipped';
    }
    if (fault === 'retry') report.cases[0]!.retry = 1;
    if (fault === 'flaky') report.cases[0]!.outcome = 'flaky';
    if (fault === 'wrong-build') report.sourceBuild = { ...snapshot, run_attempt: 2 };
    if (fault === 'wrong-key') report.cases[0]!.key = 'other';
    if (fault === 'missing-selection') report.selectedCases = [];
    if (fault === 'enumeration') report.kind = 'browser-enumeration';
    if (fault === 'error') (report.errors as string[]).push('worker error');
    expect(() => validateShardReport(manifest, 1, report)).toThrow();
  },
);

it('#659 rejects missing, duplicate and foreign shards plus split serial groups', () => {
  const manifest = fixture(),
    reports = reportsFor(manifest);
  expect(() => aggregateShardReports(manifest, reports.slice(1))).toThrow(/Missing/);
  expect(() => aggregateShardReports(manifest, [reports[0], reports[0], ...reports.slice(2)])).toThrow(/Duplicate/);
  expect(() => assertSelectedCases(manifest, 1, manifest.shards[1].cases)).toThrow(/selection/);
  const corrupt = structuredClone(manifest);
  corrupt.shards[0].units.push(corrupt.shards[1].units[0]);
  expect(() => validateShardManifest(corrupt)).toThrow();
});

it('#659 approves only the exact existing screenshot skip identities and declared timeline fixme', () => {
  const c = testCase('677a4938ef65bfc6a6e5-34964fc5fe090c9eb570', 'screenshots.spec.ts', 'screenshot home @1280');
  const allowed = { ...c, ...approvedCaseStatus(c, {}) };
  const manifest = buildShardManifest({ cases: [allowed], sourceBuild: snapshot, shardCount: 1 });
  const report = reportsFor(manifest)[0];
  expect(validateShardReport(manifest, 1, report)).toBe(report);
  report.cases[0].annotations[0].description = 'different reason';
  expect(() => validateShardReport(manifest, 1, report)).toThrow(/exact approved/);
  expect(approvedCaseStatus(c, { SHOT_DIR: 'artifacts' }).expectedStatus).toBe('passed');
  expect(() => approvedCaseStatus({ ...c, titlePath: ['new skipped screenshot'], expectedStatus: 'skipped' }, {})).toThrow(/Unapproved/);
  expect(() => approvedCaseStatus({ ...c, file: 'tests/e2e/smoke.spec.ts', expectedStatus: 'skipped' }, {})).toThrow(/Unapproved/);
});

it('#659 public test-list enumeration reproduces every frozen case exactly once across four partitions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci659-browser-'));
  directories.push(directory);
  const enumerate = (name: string, extra: string[] = []) => {
    const output = join(directory, name + '.json');
    execFileSync(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', ...extra, '--list', '--reporter=./scripts/ci-browser-reporter.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, CI_BROWSER_MODE: 'list', CI_BROWSER_REPORT: output, BASE_URL: 'http://127.0.0.1:4173/' },
      stdio: 'pipe',
      timeout: 30_000,
    });
    const report = JSON.parse(readFileSync(output, 'utf8'));
    expect(report.errors).toEqual([]);
    return report.cases;
  };
  const cases = enumerate('all'),
    manifest = buildShardManifest({ cases, sourceBuild: snapshot, shardCount: 4 });
  expect(cases.length).toBeGreaterThan(2900);
  expect(
    manifest.allCases.filter((c: { file: string; titlePath: string[] }) => c.file.endsWith('v0300-338.spec.ts') && c.titlePath.at(-1)!.startsWith('@')),
  ).toHaveLength(16);
  for (const shard of manifest.shards) {
    const list = join(directory, `shard-${shard.index}.txt`);
    writeFileSync(list, shard.cases.map(caseSelector).join('\n') + '\n');
    assertSelectedCases(manifest, shard.index, enumerate('selected-' + shard.index, ['--test-list=' + list]));
  }
}, 60_000);
