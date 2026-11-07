/** Frozen planning, per-phase execution, strict aggregation and Release provenance bridge. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetFromEnv, createBudget } from './ci-budget.mjs';
import { githubApi, currentRun, actualJob, runJobs, pages, artifactDownloader } from './ci-api.mjs';
import {
  createExecutedReceipt,
  findReusableStages,
  aggregateStageEvidence,
  stageArtifactName,
  validateStageEvidence,
  toolchainDigest,
  selectionDigest,
  noteAdvancedBase,
} from './ci-stage-evidence.mjs';
import { hash, readToolchain, collectUnits, frozenRequirements, writeJson, policyDigest, makeRequirement, actualUnitExecution } from './ci-plan.mjs';
import { resolveTestFiles } from './ci-run.mjs';
import { planChanges, applyBrowserPolicy } from './ci-scope.mjs';
import { buildShardManifest, validateShardReport, atomicUnits } from './ci-shards.mjs';
import { executeWorker, manifestOptions } from './ci-worker.mjs';
import { verifyArtifactManifest, artifactSnapshot, verifyGateLink } from './site-artifact.mjs';
import { summarizeRunTiming } from './ci-timing.mjs';
import { installBrowser } from './ci-commands.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const timestampUpper = (value) => Date.parse(value) + (/\.\d+Z$/.test(value) ? 0 : 999);
const output = (name, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const folder = () => join(process.env.RUNNER_TEMP || 'work', 'ci-state');
const frozenPath = () => process.env.CI_FROZEN_PATH || join(folder(), 'frozen.json');
async function makeCurrent(api, budget) {
  const run = await currentRun(api);
  assert.equal(Date.parse(run.created_at), budget.originMs, 'Workflow budget was reset');
  const event = json(process.env.GITHUB_EVENT_PATH);
  const commit = git('rev-parse', 'HEAD');
  const eventContext = { name: process.env.GITHUB_EVENT_NAME, sha: commit, head_repository: run.head_repository.full_name };
  if (eventContext.name === 'pull_request') Object.assign(eventContext, { base_sha: event.pull_request.base.sha, head_sha: event.pull_request.head.sha });
  return {
    repository: process.env.GITHUB_REPOSITORY,
    repository_id: run.repository.id,
    run_id: run.id,
    run_attempt: run.run_attempt,
    commit,
    tree: git('rev-parse', 'HEAD^{tree}'),
    policy_digest: policyDigest(),
    event: eventContext,
    epoch: budget.toJSON(),
    force_full: process.env.CI_FULL === 'true',
    reuse_disabled: process.env.CI_DISABLE_REUSE === 'true',
  };
}
export async function planStage({ budget, api }) {
  mkdirSync(folder(), { recursive: true });
  await budget.run('node', ['scripts/ci-scope.mjs']);
  const plan = json(join(process.env.RUNNER_TEMP || '.', 'ci-plan.json'));
  const current = await makeCurrent(api, budget);
  const toolchain = await readToolchain(budget);
  const unitCases = await collectUnits(plan, budget, folder());
  const files = resolveTestFiles(plan.browser === 'full' ? ['tests/e2e/*.spec.ts'] : plan.e2e, 'e2e');
  assert.ok(files.length, 'Mandatory browser smoke was not selected');
  const listPath = join(folder(), 'browser-collection.json');
  await budget.run('npx', ['playwright', 'test', ...files, '--list', '--reporter=./scripts/ci-browser-reporter.mjs'], {
    env: { ...process.env, CI_BROWSER_MODE: 'list', CI_BROWSER_REPORT: listPath, CI_BROWSER_MANIFEST: '', CI_BROWSER_SHARD: '' },
  });
  const browserCases = json(listPath).cases;
  assert.deepEqual([...new Set(browserCases.map((c) => c.file))].sort(), files, 'Browser collection changed selected files');
  const weights = json('scripts/ci-browser-weights.json');
  const buildList = join(folder(), 'build-smoke-collection.json');
  await budget.run(
    'npx',
    ['playwright', 'test', 'tests/e2e/smoke.spec.ts', 'tests/e2e/ciBuild659.spec.ts', '--list', '--reporter=./scripts/ci-browser-reporter.mjs'],
    {
      env: { ...process.env, CI_BROWSER_MODE: 'list', CI_BROWSER_REPORT: buildList, CI_BROWSER_MANIFEST: '', CI_BROWSER_SHARD: '' },
    },
  );
  const buildSmokeCases = json(buildList).cases.filter(
    (c) => (c.file === 'tests/e2e/smoke.spec.ts' && c.titlePath.at(-1).startsWith('route ')) || c.file === 'tests/e2e/ciBuild659.spec.ts',
  );
  assert.equal(buildSmokeCases.length, 25, 'Mandatory build smoke must retain 24 cold routes and exact build identity');
  const count = plan.browser === 'full' ? 4 : Math.min(4, atomicUnits(browserCases, weights).length);
  const browserManifest = buildShardManifest({ cases: browserCases, sourceBuild: null, shardCount: count, weights });
  const requirements = frozenRequirements(plan, toolchain, unitCases, browserManifest.shards, current.event.name);
  const plan_digest = hash({ plan, requirements, toolchain, browserCases, buildSmokeCases, weights });
  const gate_ref = `ci-v2:${current.repository}:${current.run_id}:${current.run_attempt}:${plan_digest}:test`;
  const reuse = await findReusableStages({ current, requirements, api, download: artifactDownloader(budget), budget });
  const frozen = {
    version: 2,
    current,
    plan,
    plan_digest,
    gate_ref,
    toolchain,
    unitCases,
    browserCases,
    buildSmokeCases,
    browserManifest,
    weights,
    requirements,
    reuse,
  };
  writeJson(frozenPath(), frozen);
  for (const name of ['static', 'static-main', 'unit', 'data'])
    output(name.replace('-', '_'), requirements.some((r) => r.stage_id === name) && !reuse.reused[name]);
  const browser = requirements.filter((r) => r.stage_id.startsWith('browser-') && !reuse.reused[r.stage_id]).map((r) => Number(r.stage_id.split('-')[1]));
  output('browser', JSON.stringify(browser));
  output(
    'unit_chromium',
    plan.full || requirements.some((r) => r.stage_id === 'unit' && r.selection.files.some((f) => /release(?:108|Smoke|Diagnostics641)\.test\.ts$/.test(f))),
  );
  output('tree', current.tree);
  output('node_version', process.version.slice(1));
  output('python_version', toolchain.python.replace('Python ', ''));
  console.log(
    JSON.stringify({
      scope: plan.scope,
      full: plan.full,
      data: plan.data,
      cases: browserCases.length,
      shards: count,
      reused: Object.keys(reuse.reused),
      missing: reuse.missing,
      reasons: reuse.reasons,
    }),
  );
  budget.assertRemaining('frozen plan');
}
async function checkedFrozen(budget) {
  const frozen = json(frozenPath());
  assert.equal(frozen.version, 2);
  assert.equal(frozen.current.run_id, Number(process.env.GITHUB_RUN_ID));
  assert.equal(frozen.current.run_attempt, Number(process.env.GITHUB_RUN_ATTEMPT));
  assert.equal(frozen.current.commit, git('rev-parse', 'HEAD'));
  assert.equal(frozen.current.tree, git('rev-parse', 'HEAD^{tree}'));
  assert.equal(frozen.current.policy_digest, policyDigest(), 'Policy fingerprint changed after planning');
  assert.deepEqual(frozen.current.epoch, budget.toJSON());
  assert.equal(toolchainDigest(await readToolchain(budget)), toolchainDigest(frozen.toolchain), 'Runner toolchain differs from frozen plan');
  return frozen;
}
export async function runStage(stage, { budget, api }) {
  const frozen = await checkedFrozen(budget);
  assert.ok(!frozen.reuse.reused[stage], 'A reused stage must be skipped instead of minting new execution evidence');
  const job = await actualJob(api, stage);
  const stageFolder = join(process.env.RUNNER_TEMP || 'work', stage);
  mkdirSync(stageFolder, { recursive: true });
  const result = await executeWorker({ stage, frozen, job, budget, folder: stageFolder });
  budget.assertRemaining('phase receipt');
  const receipt = createExecutedReceipt({
    current: frozen.current,
    required: frozen.requirements.find((r) => r.stage_id === stage),
    job_id: job.id,
    finished_at: new Date().toISOString(),
    ...result,
  });
  if (result.browser_report) receipt.browser_report = result.browser_report;
  if (result.build_smoke_report) receipt.build_smoke_report = result.build_smoke_report;
  writeJson(join(stageFolder, 'receipt.json'), receipt);
  output('artifact_name', stageArtifactName(frozen.current.tree, stage));
}
async function currentProofs(frozen, api, budget) {
  const run = await currentRun(api);
  const jobs = await runJobs(api, frozen.current.repository, run.id, run.run_attempt);
  const artifacts = await pages(api, `repos/${frozen.current.repository}/actions/runs/${run.id}/artifacts`, 'artifacts');
  const commit = await noteAdvancedBase(
    await api(`repos/${frozen.current.repository}/git/commits/${frozen.current.commit}`),
    frozen.current.event,
    frozen.current.repository,
    api,
  );
  const proofs = {};
  // A source may have been rerun, expired or cancelled since planning. Refresh independent API facts.
  const queries = new Map(),
    downloads = new Map();
  const query = (endpoint) => {
    if (!queries.has(endpoint)) queries.set(endpoint, api(endpoint));
    return queries.get(endpoint);
  };
  const refresh = async (proof) => {
    const sourceRun = await query(`repos/${frozen.current.repository}/actions/runs/${proof.run.id}`);
    const [sourceJobs, artifact, sourceCommit] = await Promise.all([
      runJobs(query, frozen.current.repository, sourceRun.id, sourceRun.run_attempt),
      query(`repos/${frozen.current.repository}/actions/artifacts/${proof.artifact.id}`),
      noteAdvancedBase(
        await query(`repos/${frozen.current.repository}/git/commits/${proof.receipt.tested_commit}`),
        proof.receipt.event,
        frozen.current.repository,
        query,
      ),
    ]);
    if (!downloads.has(artifact.id)) downloads.set(artifact.id, artifactDownloader(budget)(artifact));
    const downloaded = await downloads.get(artifact.id);
    const result = { ...downloaded, run: sourceRun, jobs: sourceJobs, artifact, commit: sourceCommit };
    if (proof.source_build_proof) result.source_build_proof = await refresh(proof.source_build_proof);
    return result;
  };
  const refreshed = await Promise.all(Object.entries(frozen.reuse.reused).map(async ([id, proof]) => [id, await refresh(proof)]));
  for (const [id, proof] of refreshed) proofs[id] = proof;
  for (const needed of frozen.requirements.filter((r) => !proofs[r.stage_id])) {
    const name = stageArtifactName(frozen.current.tree, needed.stage_id);
    const matching = artifacts.filter((a) => a.name === name && !a.expired);
    assert.equal(matching.length, 1, `Missing or ambiguous phase artifact ${name}`);
    const downloaded = await artifactDownloader(budget)(matching[0]);
    proofs[needed.stage_id] = { ...downloaded, run, jobs, artifact: matching[0], commit };
  }
  for (const needed of frozen.requirements.filter((r) => r.stage_id.startsWith('browser-'))) {
    const proof = proofs[needed.stage_id];
    if (proof.run.id === run.id) proof.source_build_proof = proofs.build;
  }
  return proofs;
}
export async function aggregateStage({ budget, api }) {
  const frozen = await checkedFrozen(budget);
  const buildFolder = join(process.env.RUNNER_TEMP || 'work', 'ci-build');
  const dist = join(buildFolder, 'dist');
  verifyArtifactManifest(manifestOptions(frozen.current, dist, frozen.plan));
  const snapshot = artifactSnapshot(dist);
  const manifest = json(join(buildFolder, 'browser-manifest.json'));
  assert.deepEqual(manifest.sourceBuild, snapshot);
  const proofs = await currentProofs(frozen, api, budget);
  const buildSmoke = buildShardManifest({ cases: frozen.buildSmokeCases, sourceBuild: snapshot, shardCount: 1, weights: frozen.weights });
  validateShardReport(buildSmoke, 1, proofs.build.receipt.build_smoke_report);
  for (const required of frozen.requirements.filter((r) => r.stage_id.startsWith('browser-'))) {
    const proof = proofs[required.stage_id];
    const sourceManifest = buildShardManifest({
      cases: frozen.browserCases,
      sourceBuild: proof.receipt.source_build,
      shardCount: manifest.shards.length,
      weights: frozen.weights,
    });
    validateShardReport(sourceManifest, Number(required.stage_id.split('-')[1]), proof.receipt.browser_report);
  }
  const gate = aggregateStageEvidence({ current: frozen.current, requirements: frozen.requirements, proofs, snapshot, browserManifest: manifest });
  const job = await actualJob(api, 'test');
  Object.assign(gate, { aggregate_job_id: job.id, plan_digest: frozen.plan_digest, requirements: frozen.requirements });
  verifyArtifactManifest(manifestOptions(frozen.current, dist, frozen.plan));
  verifyGateLink(dist, gate);
  const destination = join(process.env.RUNNER_TEMP || 'work', 'ci-gate');
  mkdirSync(destination, { recursive: true });
  writeJson(join(destination, 'receipt.json'), gate);
  console.log(`Strict v2 aggregate passed: ${gate.stages.length} phases`);
  budget.assertRemaining('aggregate complete');
}
export async function verifyReleaseGate({ budget, api }) {
  const repository = process.env.GITHUB_REPOSITORY;
  const id = Number(process.env.SOURCE_CI_RUN_ID);
  const run = await api(`repos/${repository}/actions/runs/${id}`);
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.head_repository.id, run.repository.id);
  assert.equal(run.name, 'CI / Deploy');
  assert.equal(run.path, '.github/workflows/ci.yml');
  assert.equal(run.event, 'push');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.equal(run.head_sha, process.env.EXPECTED_DEPLOYED_SHA);
  const jobs = await runJobs(api, repository, id, run.run_attempt);
  for (const name of ['test', 'deploy', 'build', 'static-main']) {
    const matches = jobs.filter((j) => j.name === name);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].status, 'completed');
    assert.equal(matches[0].conclusion, 'success');
    assert.equal(matches[0].run_id, id);
    assert.equal(matches[0].run_attempt, run.run_attempt);
    assert.equal(matches[0].head_sha, run.head_sha);
  }
  const artifacts = await pages(api, `repos/${repository}/actions/runs/${id}/artifacts`, 'artifacts');
  const candidates = artifacts.filter((a) => a.name === 'ci-validation-evidence' && !a.expired);
  assert.equal(candidates.length, 1, 'Missing unique v2 aggregate artifact');
  const artifact = candidates[0];
  assert.equal(artifact.workflow_run.id, id);
  assert.equal(artifact.workflow_run.head_sha, run.head_sha);
  assert.equal(artifact.workflow_run.repository_id, run.repository.id);
  assert.equal(artifact.workflow_run.head_repository_id, run.repository.id);
  assert.ok(Date.parse(artifact.expires_at) > Date.now());
  const { receipt: gate } = await artifactDownloader(budget)(artifact);
  assert.equal(gate.version, 2, 'Legacy evidence cannot authorize a Release');
  assert.equal(gate.repository, repository);
  assert.equal(gate.repository_id, run.repository.id);
  assert.equal(gate.run_id, id);
  assert.equal(gate.run_attempt, run.run_attempt);
  assert.equal(gate.tested_commit, run.head_sha);
  assert.equal(gate.tested_tree, git('rev-parse', 'HEAD^{tree}'));
  assert.equal(gate.policy_digest, policyDigest());
  const aggregate = jobs.find((j) => j.id === gate.aggregate_job_id && j.name === 'test');
  assert.ok(aggregate);
  const origin = Date.parse(run.created_at),
    deadline = origin + 1_800_000,
    issued = Date.parse(gate.issued_at);
  assert.equal(gate.epoch.origin_ms, origin);
  assert.equal(gate.epoch.deadline_ms, deadline);
  assert.equal(gate.epoch.source, 'github.run.created_at');
  assert.equal(gate.epoch.kind, 'validation');
  assert.equal(gate.epoch.version, 1);
  assert.equal(gate.epoch.run_id, id);
  assert.equal(gate.epoch.run_attempt, run.run_attempt);
  assert.ok(
    Date.parse(aggregate.started_at) <= issued &&
      issued <= timestampUpper(artifact.created_at) &&
      Date.parse(artifact.created_at) <= timestampUpper(aggregate.completed_at),
  );
  assert.ok(timestampUpper(aggregate.completed_at) < deadline, 'Source aggregate completed after deadline');
  assert.ok(Date.parse(artifact.updated_at) <= timestampUpper(aggregate.completed_at), 'Gate artifact changed after aggregate');
  assert.ok(
    jobs.filter((j) => j.name === 'deploy').every((j) => timestampUpper(j.completed_at) < deadline),
    'Source deployment exceeded deadline',
  );
  assert.ok(gate.required_stage_ids.includes('build') && gate.required_stage_ids.includes('static') && gate.required_stage_ids.includes('static-main'));
  assert.deepEqual(
    gate.stages.map((s) => s.stage_id),
    gate.required_stage_ids,
  );
  const requirements = gate.requirements.map((r) => {
    assert.equal(r.job_name, r.stage_id);
    assert.equal(typeof r.reusable, 'boolean');
    assert.match(r.toolchain_digest, /^[a-f0-9]{64}$/);
    return makeRequirement(r.stage_id, r.selection, r.toolchain_digest, r.reusable);
  });
  assert.equal(new Set(gate.required_stage_ids).size, gate.required_stage_ids.length);
  assert.deepEqual(
    requirements.map((r) => r.stage_id),
    gate.required_stage_ids,
  );
  assert.equal(gate.requirements_digest, hash(requirements), 'Aggregate requirement digest mismatch');
  for (const required of requirements) {
    const stage = gate.stages.find((s) => s.stage_id === required.stage_id);
    assert.equal(stage.requested_selection_digest, selectionDigest(required.selection), 'Aggregate selection digest mismatch');
  }
  const buildRequired = requirements.find((r) => r.stage_id === 'build');
  assert.equal(buildRequired.reusable, false);
  for (const check of ['build', 'snapshot', 'fresh-build-smoke']) assert.ok(buildRequired.selection.checks.includes(check), 'Missing fresh build requirement');
  const mainRequired = requirements.find((r) => r.stage_id === 'static-main');
  assert.equal(mainRequired.reusable, false, 'Main-specific checks cannot be reused');
  const mainStage = gate.stages.find((s) => s.stage_id === 'static-main');
  assert.equal(mainStage.executed, true, 'Main-specific checks must execute in main');
  for (const [key, value] of Object.entries({
    run_id: id,
    run_attempt: run.run_attempt,
    tested_commit: run.head_sha,
    tested_tree: gate.tested_tree,
    job_id: jobs.find((j) => j.name === 'static-main').id,
  }))
    assert.equal(mainStage.source[key], value, 'Main-specific source mismatch');
  const build = gate.stages.find((s) => s.stage_id === 'build');
  assert.ok(build?.executed, 'Release requires a fresh main build');
  assert.equal(build.source.run_id, id);
  assert.equal(build.source.run_attempt, run.run_attempt);
  assert.equal(build.source.tested_commit, run.head_sha);
  assert.equal(build.source.tested_tree, gate.tested_tree);
  assert.equal(build.source.job_id, gate.snapshot.build_job_id);
  assert.equal(jobs.find((j) => j.name === 'build').id, gate.snapshot.build_job_id);
  assert.match(gate.plan_digest, /^[a-f0-9]{64}$/);
  assert.equal(gate.gate_ref, `ci-v2:${repository}:${id}:${run.run_attempt}:${gate.plan_digest}:test`);
  assert.equal(gate.gate_ref, gate.snapshot.gate_ref);
  const downloadedPath = join(process.env.RUNNER_TEMP || 'work', 'source-ci-gate', 'receipt.json');
  if (existsSync(downloadedPath)) assert.deepEqual(json(downloadedPath), gate, 'Downloaded gate differs from authenticated source artifact');
  verifyGateLink(resolve(process.env.SITE_ARTIFACT_DIR || 'dist'), gate);
  budget.assertRemaining('Release source gate');
  return gate;
}
export async function timingStage({ budget, api }) {
  const run = await currentRun(api),
    jobs = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) jobs.push(...(await runJobs(api, process.env.GITHUB_REPOSITORY, run.id, attempt)));
  const report = summarizeRunTiming({ run, jobs });
  writeJson(join(process.env.RUNNER_TEMP || 'work', 'ci-timing.json'), report);
  console.log(JSON.stringify(report));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\nCI timing (in progress; completed API timestamps are authoritative):\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
    );
}
/** Isolated manual acceptance lab: real API/archive positive control, one corrupted field, actual fallback.
 * It never creates a phase receipt or a reusable aggregate. The source checkout and dist stay unchanged.
 */
export async function probeStage({ budget, api }) {
  assert.notEqual(process.env.GITHUB_REF, 'refs/heads/main', 'Validation probes require an isolated helper branch');
  assert.ok(
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ||
      (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/ci/659-validation-probe'),
    'Unsupported validation probe event',
  );
  const source = json(join(process.env.RUNNER_TEMP, 'probe-source', 'frozen.json'));
  const current = await makeCurrent(api, budget);
  assert.equal(current.tree, source.current.tree);
  assert.equal(current.policy_digest, source.current.policy_digest);
  assert.equal(toolchainDigest(await readToolchain(budget)), toolchainDigest(source.toolchain));
  const buildFolder = join(process.env.RUNNER_TEMP, 'ci-build'),
    dist = join(buildFolder, 'dist');
  verifyArtifactManifest(manifestOptions(source.current, dist, source.plan));
  const snapshot = artifactSnapshot(dist);
  const path = 'src/features/hotkeys/Hotkeys.tsx',
    before = readFileSync(path, 'utf8'),
    after = before + '\n/* #659 scope-only validation probe */\n';
  const narrow = applyBrowserPolicy(planChanges([{ path, before, after }]));
  assert.equal(narrow.full, false, 'Representative feature diff must stay narrow');
  const files = resolveTestFiles(narrow.unit, 'unit');
  const unitCases = source.unitCases.filter((c) => files.includes(c.file));
  assert.deepEqual([...new Set(unitCases.map((c) => c.file))].sort(), files);
  const required = makeRequirement('unit', { checks: ['vitest'], files, cases: unitCases }, toolchainDigest(source.toolchain));
  const download = artifactDownloader(budget);
  const positive = await findReusableStages({ current, requirements: [required], api, download, budget, lookupMs: 30_000 });
  assert.ok(positive.reused.unit, 'The unmodified real source proof must validate before fault injection');
  const proof = positive.reused.unit;
  const injected = await findReusableStages({
    current,
    requirements: [required],
    api,
    budget,
    lookupMs: 30_000,
    download: async (artifact, options) => {
      const actual = await download(artifact, options);
      return { ...actual, receipt: { ...actual.receipt, version: 1 } };
    },
  });
  assert.ok(!injected.reused.unit && injected.missing.includes('unit'), 'Corrupted v1 evidence must force actual execution');
  assert.ok(
    injected.reasons.some((r) => r.reason === 'receipt-mismatch'),
    'Must expose the intended field rejection',
  );
  const began = Date.now(),
    output = join(process.env.RUNNER_TEMP, 'probe-unit.json');
  await budget.run('npx', ['vitest', 'run', ...files, '--reporter=json', `--outputFile=${output}`]);
  const actual = actualUnitExecution(json(output));
  assert.deepEqual(actual.files, required.selection.files);
  assert.deepEqual(
    actual.cases.sort((a, b) => a.id.localeCompare(b.id)),
    required.selection.cases.map((c) => ({ id: c.id, status: c.expectedStatus })),
  );
  const browserFiles = resolveTestFiles(narrow.e2e, 'e2e'),
    collection = join(process.env.RUNNER_TEMP, 'probe-browser-list.json');
  await budget.run('npx', ['playwright', 'test', ...browserFiles, '--list', '--reporter=./scripts/ci-browser-reporter.mjs'], {
    env: { ...process.env, CI_BROWSER_MODE: 'list', CI_BROWSER_REPORT: collection },
  });
  const browserCases = json(collection).cases;
  const manifest = buildShardManifest({ cases: browserCases, sourceBuild: snapshot, shardCount: 1, weights: source.weights });
  const manifestPath = join(process.env.RUNNER_TEMP, 'probe-browser-manifest.json'),
    reportPath = join(process.env.RUNNER_TEMP, 'probe-browser-report.json');
  writeJson(manifestPath, manifest);
  const { cpSync } = await import('node:fs');
  cpSync(dist, 'dist', { recursive: true });
  await budget.run(
    'npx',
    [
      'playwright',
      'test',
      ...browserFiles,
      '--reporter=line,./scripts/ci-browser-reporter.mjs',
      '--workers=2',
      '--retries=0',
      '--forbid-only',
      '--fail-on-flaky-tests',
    ],
    {
      env: { ...process.env, CI_BROWSER_MODE: 'run', CI_BROWSER_MANIFEST: manifestPath, CI_BROWSER_SHARD: '1', CI_BROWSER_REPORT: reportPath },
    },
  );
  const report = json(reportPath);
  validateShardReport(manifest, 1, report);
  verifyArtifactManifest(manifestOptions(source.current, dist, source.plan));
  const result = {
    kind: 'isolated-validation-probe',
    reusable: false,
    source: {
      run_id: proof.run.id,
      run_attempt: proof.run.run_attempt,
      job_id: proof.receipt.job_id,
      artifact_id: proof.artifact.id,
      archive_sha256: proof.archive_sha256,
    },
    injected: { field: 'receipt.version', before: 2, after: 1, rejections: injected.reasons },
    narrow: {
      path,
      before_digest: hash(before),
      after_digest: hash(after),
      plan: narrow,
      unitFiles: actual.files,
      unitCases: actual.cases.length,
      browserFiles,
      browserCases: report.cases.length,
    },
    actualExecutionMs: Date.now() - began,
    epoch: budget.toJSON(),
  };
  writeJson(join(process.env.RUNNER_TEMP, 'validation-probe.json'), result);
  console.log(JSON.stringify(result));
  budget.assertRemaining('isolated acceptance probe');
}
async function main() {
  const command = process.argv[2];
  let budget;
  if (command === 'timing' && process.env.CI_BUDGET_KIND === 'diagnostic') {
    const originMs = Number(process.env.CI_DIAGNOSTIC_ORIGIN_MS),
      deadlineMs = Number(process.env.CI_DIAGNOSTIC_DEADLINE_MS);
    assert.ok(
      Number.isSafeInteger(originMs) &&
        Number.isSafeInteger(deadlineMs) &&
        deadlineMs <= originMs + 90_000 &&
        deadlineMs <= Number(process.env.CI_DEADLINE_MS) + 90_000,
      'Invalid diagnostic timing budget',
    );
    budget = createBudget({
      originMs,
      deadlineMs,
      kind: 'diagnostic',
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    });
  } else budget = budgetFromEnv();
  const api = githubApi(budget);
  if (command === 'plan') await planStage({ budget, api });
  else if (command === 'run') await runStage(process.argv[3], { budget, api });
  else if (command === 'aggregate') await aggregateStage({ budget, api });
  else if (command === 'verify-release') await verifyReleaseGate({ budget, api });
  else if (command === 'timing') await timingStage({ budget, api });
  else if (command === 'install-browser') await installBrowser(budget);
  else if (command === 'probe') await probeStage({ budget, api });
  else throw new Error('Use plan | run STAGE | aggregate | verify-release | timing');
  budget.assertRemaining('CI command exit');
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
