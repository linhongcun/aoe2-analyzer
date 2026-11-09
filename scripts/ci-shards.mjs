/** Exact, deterministic browser partitions. File-level serial semantics remain intact. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const BROWSER_SCHEMA = 1;
const statuses = new Set(['passed', 'skipped']);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));
const screenshotIds = new Map([
  ['screenshot unit-paladin-sim @1280', '677a4938ef65bfc6a6e5-004783845ccb0ff7e576'],
  ['screenshot home @390', '677a4938ef65bfc6a6e5-1d903b0a6b57b871c62a'],
  ['screenshot units @390', '677a4938ef65bfc6a6e5-2658765986479210b4cc'],
  ['screenshot civ-franks @1280', '677a4938ef65bfc6a6e5-2f8ed34afaf31e3ad6ca'],
  ['screenshot home @1280', '677a4938ef65bfc6a6e5-34964fc5fe090c9eb570'],
  ['screenshot units @1280', '677a4938ef65bfc6a6e5-379fabf147314dcca31b'],
  ['screenshot unit-paladin @390', '677a4938ef65bfc6a6e5-380e4f208e388a070334'],
  ['screenshot civ-franks @390', '677a4938ef65bfc6a6e5-49fe86c67f67e9ee1d93'],
  ['screenshot simulator-hub @1280', '677a4938ef65bfc6a6e5-57edfa8750f44ea47661'],
  ['screenshot unit-paladin @1280', '677a4938ef65bfc6a6e5-5d4a52684c721ef3f94f'],
  ['screenshot simulator-hub @390', '677a4938ef65bfc6a6e5-914e7a6e7e4e5f0509f7'],
  ['screenshot unit-paladin-sim @390', '677a4938ef65bfc6a6e5-b186ddf91b8fe928ddeb'],
]);
export const SCREENSHOT_SKIP_REASON = '设置 SHOT_DIR 后再运行';
const timelineFixme = '15. 超时状态（按目标时代写「60 分钟内到不了{时代}」）';

export function caseKey(value) {
  return JSON.stringify([value.project, value.file, value.titlePath, value.repeatEachIndex]);
}

/** Public Playwright enumeration does not evaluate body-level test.skip. */
export function approvedCaseStatus(value, env = process.env) {
  if (
    value.file === 'tests/e2e/screenshots.spec.ts' &&
    !env.SHOT_DIR &&
    value.project === '' &&
    value.repeatEachIndex === 0 &&
    value.titlePath.length === 1 &&
    screenshotIds.get(value.titlePath[0]) === value.id
  ) {
    return { expectedStatus: 'skipped', allowedSkip: { type: 'skip', reason: SCREENSHOT_SKIP_REASON, file: value.file, condition: 'SHOT_DIR absent' } };
  }
  if (
    value.file === 'tests/e2e/timeline.spec.ts' &&
    value.id === 'b06e59072d3cdab898f7-3e60ede489d6c40ac586' &&
    value.project === '' &&
    value.repeatEachIndex === 0 &&
    value.titlePath.length === 2 &&
    value.titlePath[0] === '#3 开局时间线' &&
    value.titlePath[1] === timelineFixme &&
    value.expectedStatus === 'skipped'
  ) {
    return { expectedStatus: 'skipped', allowedSkip: { type: 'fixme', reason: null, file: value.file, condition: 'declared fixme' } };
  }
  assert.equal(value.expectedStatus, 'passed', 'Unapproved browser expected status: ' + value.file + ' / ' + value.titlePath.join(' / '));
  return { expectedStatus: value.expectedStatus, allowedSkip: null };
}

export function canonicalCases(cases) {
  assert.ok(Array.isArray(cases), 'Browser cases must be an array');
  const ids = new Set(),
    keys = new Set();
  const result = cases.map((value) => {
    assert.ok(value && typeof value === 'object', 'Invalid browser case');
    assert.ok(typeof value.id === 'string' && value.id.length > 0, 'Missing Playwright case ID');
    assert.ok(typeof value.project === 'string' && !/[\r\n›]/u.test(value.project), 'Unsafe project');
    assert.match(value.file, /^tests\/e2e\/[A-Za-z0-9_.-]+\.spec\.ts$/, 'Unsafe browser file');
    assert.match(value.selectorFile, /^[A-Za-z0-9_.-]+\.spec\.ts$/, 'Unsafe test-list path');
    assert.equal(value.file, 'tests/e2e/' + value.selectorFile, 'Selector file does not identify the source file');
    assert.ok(
      Array.isArray(value.titlePath) &&
        value.titlePath.length &&
        value.titlePath.every((title) => typeof title === 'string' && title.length && title.trim() === title && !/[\r\n›]/u.test(title)),
      'Unsafe browser title',
    );
    assert.ok(Number.isSafeInteger(value.repeatEachIndex) && value.repeatEachIndex >= 0, 'Invalid repeat index');
    assert.ok(statuses.has(value.expectedStatus), 'Invalid browser expected status');
    const key = caseKey(value);
    if (value.key !== undefined) assert.equal(value.key, key, 'Browser case key mismatch');
    assert.ok(!ids.has(value.id), 'Duplicate browser case ID');
    assert.ok(!keys.has(key), 'Duplicate browser case identity');
    ids.add(value.id);
    keys.add(key);
    const allowedSkip = value.allowedSkip ?? null;
    if (value.expectedStatus === 'skipped') {
      assert.ok(allowedSkip && ['skip', 'fixme'].includes(allowedSkip.type), 'Missing approved skip condition');
      const approved = approvedCaseStatus({ ...value, allowedSkip: null }, allowedSkip.condition === 'SHOT_DIR absent' ? {} : { SHOT_DIR: 'declared' });
      assert.deepEqual(allowedSkip, approved.allowedSkip, 'Unapproved skip descriptor');
    } else assert.equal(allowedSkip, null, 'Passed case cannot carry a skip exception');
    return {
      id: value.id,
      key,
      project: value.project,
      file: value.file,
      selectorFile: value.selectorFile,
      titlePath: [...value.titlePath],
      repeatEachIndex: value.repeatEachIndex,
      expectedStatus: value.expectedStatus,
      allowedSkip,
    };
  });
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

export function casesDigest(cases) {
  return digest(canonicalCases(cases));
}

export function caseSelector(value) {
  const c = canonicalCases([value])[0];
  return '[' + c.project + '] › ' + c.selectorFile + ' › ' + c.titlePath.join(' › ');
}

function sweepCase(value) {
  return value.file === 'tests/e2e/v0300-338.spec.ts' && /^@(360|1280) 全部静态页（第 [1-8]\/8 组）/.test(value.titlePath.at(-1));
}

export function atomicUnits(cases, weights = {}) {
  const groups = new Map();
  for (const c of canonicalCases(cases)) {
    const key = sweepCase(c) ? c.key : JSON.stringify([c.project, c.file]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups]
    .map(([key, members]) => {
      const measured = members.map((c) => weights.cases?.[c.id]);
      const fileWeight = weights.files?.[members[0].file];
      let estimatedMs, weightSource;
      if (measured.every((value) => Number.isFinite(value) && value >= 0)) {
        estimatedMs = Math.max(
          1,
          measured.reduce((total, value) => total + value, 0),
        );
        weightSource = 'measured-cases';
      } else if (!sweepCase(members[0]) && Number.isFinite(fileWeight) && fileWeight > 0) {
        estimatedMs = fileWeight;
        weightSource = 'historical-file';
      } else if (sweepCase(members[0])) {
        estimatedMs = weights.staticSweepMs ?? 120000;
        weightSource = 'conservative-static-sweep';
      } else {
        estimatedMs = Math.max(1, members.filter((c) => c.expectedStatus !== 'skipped').length) * (weights.defaultCaseMs ?? 1500);
        weightSource = 'conservative-case';
      }
      assert.ok(Number.isFinite(estimatedMs) && estimatedMs > 0, 'Invalid browser unit weight');
      return { key, cases: members, estimatedMs, weightSource };
    })
    .sort((a, b) => b.estimatedMs - a.estimatedMs || a.key.localeCompare(b.key));
}

function validateSnapshot(snapshot) {
  assert.ok(snapshot && typeof snapshot === 'object', 'An actual browser snapshot is mandatory');
  for (const key of ['commit', 'tree']) assert.match(snapshot[key], /^[0-9a-f]{40}$/, 'Invalid browser snapshot ' + key);
  for (const key of ['run_id', 'run_attempt', 'build_job_id'])
    assert.ok(Number.isSafeInteger(snapshot[key]) && snapshot[key] > 0, 'Invalid browser snapshot ' + key);
  assert.match(snapshot.manifest_digest, /^[0-9a-f]{64}$/, 'Invalid browser snapshot digest');
  assert.ok(typeof snapshot.gate_ref === 'string' && snapshot.gate_ref.length > 0, 'Missing immutable gate reference');
  return snapshot;
}

export function missingWeightFiles(cases, weights = {}) {
  const files = new Set(canonicalCases(cases).map((value) => value.file));
  return [...files].filter((file) => !(Number.isFinite(weights.files?.[file]) && weights.files[file] > 0)).sort((a, b) => a.localeCompare(b));
}

export function buildShardManifest({ cases, sourceBuild = null, shardCount = 4, weights = {} }) {
  const allCases = canonicalCases(cases);
  assert.ok(allCases.length > 0, 'Empty global browser collection');
  assert.ok(Number.isSafeInteger(shardCount) && shardCount >= 1 && shardCount <= 4, 'Invalid browser shard count');
  if (sourceBuild !== null) validateSnapshot(sourceBuild);
  const missing = missingWeightFiles(allCases, weights);
  if (missing.length && weights.files && Object.keys(weights.files).length) {
    console.error(`Browser weights missing for ${missing.length} file(s): ${missing.join(', ')}`);
  }
  const shards = Array.from({ length: shardCount }, (_, index) => ({ index: index + 1, cases: [], units: [], estimatedMs: 0 }));
  for (const unit of atomicUnits(allCases, weights)) {
    const target = [...shards].sort((a, b) => a.estimatedMs - b.estimatedMs || a.index - b.index)[0];
    target.cases.push(...unit.cases);
    target.units.push({ key: unit.key, caseIds: unit.cases.map((c) => c.id), estimatedMs: unit.estimatedMs, weightSource: unit.weightSource });
    target.estimatedMs += unit.estimatedMs;
  }
  for (const shard of shards) {
    shard.cases = canonicalCases(shard.cases);
    shard.caseDigest = casesDigest(shard.cases);
  }
  return validateShardManifest(
    {
      schema: BROWSER_SCHEMA,
      sourceBuild,
      allCases,
      caseDigest: casesDigest(allCases),
      shards,
      missingWeightFiles: missing,
      weightSource: weights.source ?? 'explicit conservative seeds; no measured speedup claimed',
    },
    { allowPlanning: true },
  );
}

export function validateShardManifest(manifest, { allowPlanning = true } = {}) {
  assert.equal(manifest?.schema, BROWSER_SCHEMA, 'Unsupported browser manifest');
  if (manifest.sourceBuild === null) assert.ok(allowPlanning, 'Planning manifest cannot certify browser execution');
  else validateSnapshot(manifest.sourceBuild);
  const all = canonicalCases(manifest.allCases);
  assert.ok(all.length, 'Empty global browser manifest');
  assert.equal(manifest.caseDigest, casesDigest(all), 'Global browser collection digest mismatch');
  assert.deepEqual(manifest.allCases, all, 'Browser collection must be canonical');
  assert.ok(Array.isArray(manifest.shards) && manifest.shards.length >= 1 && manifest.shards.length <= 4, 'Invalid browser partitions');
  const combined = [],
    units = new Set();
  manifest.shards.forEach((shard, index) => {
    assert.equal(shard.index, index + 1, 'Missing, repeated or reordered browser shard');
    const cases = canonicalCases(shard.cases);
    assert.deepEqual(shard.cases, cases, 'Noncanonical shard cases');
    assert.equal(shard.caseDigest, casesDigest(cases), 'Shard collection digest mismatch');
    assert.ok(Number.isFinite(shard.estimatedMs) && shard.estimatedMs >= 0, 'Invalid shard weight');
    assert.ok(Array.isArray(shard.units), 'Missing atomic units');
    const memberIds = [];
    for (const unit of shard.units) {
      assert.ok(typeof unit.key === 'string' && !units.has(unit.key), 'Atomic browser unit split or duplicated');
      units.add(unit.key);
      assert.ok(Array.isArray(unit.caseIds) && unit.caseIds.length, 'Empty atomic unit');
      memberIds.push(...unit.caseIds);
    }
    assert.deepEqual(sorted(memberIds), sorted(cases.map((c) => c.id)), 'Atomic units differ from selected cases');
    combined.push(...cases);
  });
  assert.deepEqual(canonicalCases(combined), all, 'Shard union does not equal original browser collection');
  // Every ordinary file remains on exactly one runner, including serial suites and hooks.
  const ownership = new Map();
  manifest.shards.forEach((shard) =>
    shard.cases
      .filter((c) => !sweepCase(c))
      .forEach((c) => {
        const key = JSON.stringify([c.project, c.file]);
        assert.ok(!ownership.has(key) || ownership.get(key) === shard.index, 'Ordinary file split across runners');
        ownership.set(key, shard.index);
      }),
  );
  return manifest;
}

export function assertSelectedCases(manifest, index, cases) {
  validateShardManifest(manifest);
  const shard = manifest.shards.find((value) => value.index === index);
  assert.ok(shard, 'Unknown browser shard');
  assert.deepEqual(canonicalCases(cases), shard.cases, 'Actual browser selection differs from frozen shard');
  return true;
}

export function validateShardReport(manifest, index, report) {
  validateShardManifest(manifest, { allowPlanning: false });
  const shard = manifest.shards.find((value) => value.index === index);
  assert.ok(shard, 'Unknown report shard');
  assert.ok(shard.cases.length, 'An empty browser partition needs an explicit empty-stage receipt');
  assert.equal(report?.schema, BROWSER_SCHEMA, 'Unsupported browser report');
  assert.equal(report.kind, 'browser-execution', 'Enumeration cannot certify execution');
  assert.equal(report.shardIndex, index, 'Report shard mismatch');
  assert.deepEqual(report.sourceBuild, manifest.sourceBuild, 'Browser report build snapshot mismatch');
  assert.equal(report.caseDigest, shard.caseDigest, 'Report collection digest mismatch');
  assertSelectedCases(manifest, index, report.selectedCases);
  assert.equal(report.status, 'passed', 'Browser run did not pass');
  assert.deepEqual(report.errors, [], 'Browser reporter recorded errors');
  assert.ok(Array.isArray(report.cases), 'Missing actual browser case results');
  assert.equal(report.cases.length, shard.cases.length, 'Missing or repeated browser case results');
  const seen = new Set();
  for (const actual of report.cases) {
    assert.ok(!seen.has(actual.id), 'Duplicate actual browser case');
    seen.add(actual.id);
    const expected = shard.cases.find((value) => value.id === actual.id);
    assert.ok(expected, 'Unexpected executed browser case');
    assert.equal(actual.key, expected.key, 'Executed browser identity mismatch');
    assert.equal(actual.status, expected.expectedStatus, 'Unexpected browser result status');
    assert.equal(actual.expectedStatus, expected.expectedStatus, 'Runtime changed expected status');
    assert.equal(actual.retry, 0, 'Retried browser assertion is not accepted');
    assert.equal(actual.outcome, expected.expectedStatus === 'skipped' ? 'skipped' : 'expected', 'Flaky or unexpected browser outcome');
    assert.ok(Number.isFinite(actual.duration) && actual.duration >= 0, 'Missing browser duration');
    if (expected.allowedSkip?.type === 'skip') {
      assert.ok(
        actual.annotations?.some((a) => a.type === 'skip' && a.description === expected.allowedSkip.reason),
        'Missing exact approved screenshot skip reason',
      );
    }
    if (expected.allowedSkip?.type === 'fixme')
      assert.ok(
        actual.annotations?.some((a) => a.type === 'fixme'),
        'Missing declared fixme annotation',
      );
  }
  assert.deepEqual(sorted([...seen]), sorted(shard.cases.map((c) => c.id)), 'Executed browser set differs from frozen selection');
  assert.ok(
    Number.isFinite(Date.parse(report.startedAt)) &&
      Number.isFinite(Date.parse(report.finishedAt)) &&
      Date.parse(report.finishedAt) >= Date.parse(report.startedAt),
    'Invalid browser timing',
  );
  return report;
}

export function aggregateShardReports(manifest, reports) {
  validateShardManifest(manifest, { allowPlanning: false });
  assert.ok(Array.isArray(reports) && reports.length === manifest.shards.length, 'Missing browser shard reports');
  const seen = new Set(),
    cases = [];
  for (const report of reports) {
    assert.ok(!seen.has(report.shardIndex), 'Duplicate browser shard report');
    seen.add(report.shardIndex);
    validateShardReport(manifest, report.shardIndex, report);
    cases.push(...report.cases);
  }
  assert.deepEqual(
    sorted([...seen].map(String)),
    manifest.shards.map((s) => String(s.index)),
    'Missing browser shard',
  );
  assert.deepEqual(sorted(cases.map((c) => c.id)), sorted(manifest.allCases.map((c) => c.id)), 'Incomplete or duplicated global execution');
  return { status: 'passed', caseDigest: manifest.caseDigest, sourceBuild: manifest.sourceBuild, cases };
}
