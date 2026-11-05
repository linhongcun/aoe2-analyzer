/** A phase emits evidence from actual command/reporter results, never from requested file names alone. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executeChecks, STATIC_CHECKS, DATA_CHECKS, mainChecks } from './ci-commands.mjs';
import { actualUnitExecution, writeJson } from './ci-plan.mjs';
import { createArtifactManifest, verifyArtifactManifest, artifactSnapshot } from './site-artifact.mjs';
import { buildShardManifest, caseSelector, assertSelectedCases, validateShardReport } from './ci-shards.mjs';

export function manifestOptions(current, directory, plan) {
  return {
    directory,
    commit: current.commit,
    tree: current.tree,
    repository: current.repository,
    runId: current.run_id,
    version: `v${JSON.parse(readFileSync('package.json', 'utf8')).version}`,
    plan,
  };
}
export async function executeWorker({ stage, frozen, job, budget, folder, env = process.env }) {
  const required = frozen.requirements.find((r) => r.stage_id === stage);
  assert.ok(required, `Unplanned stage: ${stage}`);
  const current = frozen.current;
  if (stage === 'static') return { execution: { checks: await executeChecks(STATIC_CHECKS, budget), files: [], cases: [] } };
  if (stage === 'static-main') return { execution: { checks: await executeChecks(mainChecks(frozen.plan), budget), files: [], cases: [] } };
  if (stage === 'data') return { execution: { checks: await executeChecks(DATA_CHECKS, budget), files: [], cases: [] } };
  if (stage === 'unit') {
    const output = join(folder, 'unit-results.json');
    await budget.run('npx', ['vitest', 'run', ...required.selection.files, '--maxWorkers=2', '--minWorkers=1', '--reporter=json', '--reporter=default', `--outputFile=${output}`]);
    return { execution: actualUnitExecution(JSON.parse(readFileSync(output, 'utf8'))) };
  }
  const buildFolder = join(env.RUNNER_TEMP || 'work', 'ci-build');
  if (stage === 'build') {
    await budget.run('npm', ['run', 'build']);
    await budget.run('git', ['diff', '--exit-code', '--', 'src/data/page-metadata.json']);
    createArtifactManifest({
      ...manifestOptions(current, 'dist', frozen.plan),
      gate_ref: frozen.gate_ref,
      runAttempt: current.run_attempt,
      buildJobId: job.id,
      toolchainDigest: required.toolchain_digest,
    });
    const snapshot = artifactSnapshot('dist');
    // Public test-list selection avoids grep's project/file title prefixes and freezes exact route IDs.
    const smokeManifest = buildShardManifest({ cases: frozen.buildSmokeCases, sourceBuild: snapshot, shardCount: 1, weights: frozen.weights });
    const smokeManifestPath = join(folder, 'build-smoke-manifest.json'),
      smokeList = join(folder, 'build-smoke-list.txt'),
      smokeReport = join(folder, 'build-smoke-report.json');
    writeJson(smokeManifestPath, smokeManifest);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(smokeList, frozen.buildSmokeCases.map(caseSelector).join('\n') + '\n');
    await budget.run(
      'npx',
      [
        'playwright',
        'test',
        `--test-list=${smokeList}`,
        '--reporter=line,./scripts/ci-browser-reporter.mjs',
        '--workers=2',
        '--retries=0',
        '--forbid-only',
        '--fail-on-flaky-tests',
      ],
      {
        env: { ...env, CI_BROWSER_MODE: 'run', CI_BROWSER_MANIFEST: smokeManifestPath, CI_BROWSER_SHARD: '1', CI_BROWSER_REPORT: smokeReport },
      },
    );
    const build_smoke_report = JSON.parse(readFileSync(smokeReport, 'utf8'));
    validateShardReport(smokeManifest, 1, build_smoke_report);
    verifyArtifactManifest(manifestOptions(current, 'dist', frozen.plan));
    mkdirSync(buildFolder, { recursive: true });
    cpSync('dist', join(buildFolder, 'dist'), { recursive: true });
    const manifest = buildShardManifest({
      cases: frozen.browserCases,
      sourceBuild: snapshot,
      shardCount: frozen.browserManifest.shards.length,
      weights: frozen.weights,
    });
    assert.deepEqual(
      manifest.shards.map((s) => s.cases.map((c) => c.id)),
      frozen.browserManifest.shards.map((s) => s.cases.map((c) => c.id)),
      'Build changed frozen shard assignment',
    );
    writeJson(join(buildFolder, 'browser-manifest.json'), manifest);
    writeJson(join(buildFolder, 'snapshot.json'), snapshot);
    return { execution: { checks: ['build', 'snapshot', 'fresh-build-smoke'], files: [], cases: [] }, source_build: snapshot, build_smoke_report };
  }
  assert.match(stage, /^browser-[1-4]$/);
  const snapshot = JSON.parse(readFileSync(join(buildFolder, 'snapshot.json'), 'utf8'));
  const manifestPath = join(buildFolder, 'browser-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const index = Number(stage.split('-')[1]);
  const shard = manifest.shards.find((s) => s.index === index);
  assert.ok(shard?.cases.length, 'Empty or missing shard');
  cpSync(join(buildFolder, 'dist'), 'dist', { recursive: true });
  verifyArtifactManifest(manifestOptions(current, 'dist', frozen.plan));
  assert.deepEqual(artifactSnapshot('dist'), snapshot, 'Downloaded build snapshot changed');
  const listPath = join(folder, 'test-list.txt');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(listPath, shard.cases.map(caseSelector).join('\n') + '\n');
  const listOutput = join(folder, 'selected-cases.json');
  const runEnv = { ...env, CI_BROWSER_MANIFEST: manifestPath, CI_BROWSER_SHARD: String(index), CI_BROWSER_MODE: 'list', CI_BROWSER_REPORT: listOutput };
  await budget.run('npx', ['playwright', 'test', `--test-list=${listPath}`, '--list', '--reporter=./scripts/ci-browser-reporter.mjs'], { env: runEnv });
  const selected = JSON.parse(readFileSync(listOutput, 'utf8'));
  assertSelectedCases(manifest, index, selected.cases);
  const output = join(folder, 'browser-results.json');
  await budget.run(
    'npx',
    [
      'playwright',
      'test',
      `--test-list=${listPath}`,
      '--reporter=line,./scripts/ci-browser-reporter.mjs',
      '--workers=2',
      '--retries=0',
      '--forbid-only',
      '--fail-on-flaky-tests',
    ],
    {
      env: { ...runEnv, CI_BROWSER_MODE: 'run', CI_BROWSER_REPORT: output },
    },
  );
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.status, 'passed', 'Browser reporter did not certify this execution');
  verifyArtifactManifest(manifestOptions(current, 'dist', frozen.plan));
  const actualCases = report.cases;
  assert.ok(Array.isArray(actualCases) && actualCases.length, 'Missing actual browser case results');
  const selectedById = new Map(manifest.allCases.map((c) => [c.id, c]));
  const files = [
    ...new Set(
      actualCases.map((c) => {
        assert.ok(selectedById.has(c.id));
        return selectedById.get(c.id).file;
      }),
    ),
  ].sort();
  return { execution: { checks: ['playwright'], files, cases: actualCases }, source_build: snapshot, browser_report: report };
}
