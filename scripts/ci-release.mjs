/** Release-only command groups inherit one deadline; command completion cannot turn an expired run green. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetFromEnv, createBudget, createDiagnosticBudget, DIAGNOSTIC_BUDGET_MS } from './ci-budget.mjs';
import { githubApi, runJobs } from './ci-api.mjs';

function positiveId(value, label) {
  assert.ok(Number.isSafeInteger(value) && value > 0, 'Invalid ' + label);
  return value;
}

function environmentId(value, label) {
  assert.match(value ?? '', /^[1-9]\d*$/, 'Missing or invalid ' + label);
  return positiveId(Number(value), label);
}

/** Durable attribution for the observer, including an already-published/skipped automatic Release. */
export async function recordReleaseSource({ env = process.env, budget = budgetFromEnv(env), api, event } = {}) {
  assert.equal(budget.kind, 'validation', 'Diagnostics cannot record a successful Release source');
  budget.assertRemaining('Release source receipt');
  const repository = env.GITHUB_REPOSITORY;
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/, 'Invalid Release repository');
  assert.ok(isAbsolute(env.RUNNER_TEMP ?? ''), 'Release source receipt requires an absolute temporary directory');
  const payload = event ?? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  assert.equal(payload.repository?.full_name, repository, 'Release event belongs to another repository');
  const receipt = {
    schema: 1,
    release_run_id: environmentId(env.GITHUB_RUN_ID, 'Release run ID'),
    release_run_attempt: environmentId(env.GITHUB_RUN_ATTEMPT, 'Release run attempt'),
    source_ci_run_id: null,
    source_ci_run_attempt: null,
    source_commit: null,
  };
  let sourceId, sourceAttempt, sourceCommit;
  if (env.GITHUB_EVENT_NAME === 'workflow_run') {
    sourceId = positiveId(payload.workflow_run?.id, 'source CI run ID');
    sourceAttempt = positiveId(payload.workflow_run?.run_attempt, 'source CI run attempt');
    sourceCommit = payload.workflow_run?.head_sha;
    if (env.SOURCE_CI_RUN_ID)
      assert.equal(environmentId(env.SOURCE_CI_RUN_ID, 'prepared source CI run ID'), sourceId, 'Prepared source differs from original Release event');
  } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (env.SOURCE_CI_RUN_ID) {
      sourceId = environmentId(env.SOURCE_CI_RUN_ID, 'prepared source CI run ID');
      sourceCommit = env.GITHUB_SHA;
    } else receipt.reason = 'Manual Release did not establish an exact source CI run; no latest-SHA inference is permitted';
  } else throw new Error('Unsupported Release source event');

  if (sourceId) {
    assert.match(sourceCommit ?? '', /^[a-f0-9]{40}$/, 'Invalid original source commit');
    const request = api ?? githubApi(budget, env);
    const endpoint = 'repos/' + repository + '/actions/runs/' + sourceId;
    // An automatic event names a specific attempt. A later rerun must not silently replace it.
    const run = await request(endpoint + (sourceAttempt ? '/attempts/' + sourceAttempt : ''));
    budget.assertRemaining('Release source run metadata');
    assert.equal(run.id, sourceId, 'Source CI API run ID differs');
    const actualAttempt = positiveId(run.run_attempt, 'GitHub source CI attempt');
    if (sourceAttempt) assert.equal(actualAttempt, sourceAttempt, 'Source CI API attempt differs from original event');
    assert.equal(run.name, 'CI / Deploy', 'Source CI workflow name differs');
    assert.equal(run.path, '.github/workflows/ci.yml', 'Source CI workflow path differs');
    assert.equal(run.event, 'push', 'Source CI is not a main push');
    assert.equal(run.head_branch, 'main', 'Source CI branch differs');
    assert.equal(run.repository?.full_name, repository, 'Source CI repository differs');
    assert.equal(run.head_repository?.full_name, repository, 'Source CI head is not this repository');
    assert.equal(run.head_sha, sourceCommit, 'Source CI commit differs from original Release event');
    assert.equal(run.status, 'completed', 'Source CI run is not complete');
    assert.equal(run.conclusion, 'success', 'Source CI run did not succeed');
    const jobs = await runJobs(request, repository, sourceId, actualAttempt);
    budget.assertRemaining('Release source jobs');
    for (const name of ['test', 'deploy']) {
      const matching = jobs.filter((job) => job.name === name);
      assert.equal(matching.length, 1, 'Expected exactly one successful source ' + name + ' job');
      positiveId(matching[0].id, 'source ' + name + ' job ID');
      assert.equal(matching[0].status, 'completed', 'Source ' + name + ' job is not complete');
      assert.equal(matching[0].conclusion, 'success', 'Source ' + name + ' job did not succeed');
    }
    receipt.source_ci_run_id = sourceId;
    receipt.source_ci_run_attempt = actualAttempt;
    receipt.source_commit = sourceCommit;
  }
  budget.assertRemaining('Release source receipt write');
  const directory = join(env.RUNNER_TEMP, 'release-source');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  budget.assertRemaining('Release source receipt completion');
  return receipt;
}

function releaseIdentity(env) {
  assert.match(env.RELEASE_VERSION ?? '', /^v\d+\.\d+\.\d+$/, 'Release version must have three numeric parts');
  assert.match(env.EXPECTED_RELEASE_SHA ?? '', /^[a-f0-9]{40}$/, 'Release source must be an exact SHA');
  assert.match(env.EXPECTED_DEPLOYED_SHA ?? '', /^[a-f0-9]{40}$/, 'Deployment source must be an exact SHA');
  return env.RELEASE_VERSION;
}

/** Called inside ci-budget --run, so synchronous nested gh/npm/git children remain in the killed process group. */
export function runReleaseAction(action, { env = process.env, budget = budgetFromEnv(env), run = execFileSync, directory = process.cwd() } = {}) {
  assert.equal(budget.kind, 'validation', 'Diagnostics cannot execute release validation or publication');
  budget.assertRemaining('Release action');
  const version = releaseIdentity(env);
  const invoke = (command, args, options = {}) => {
    const timeout = budget.assertRemaining('Release command start');
    const result = run(command, args, { cwd: directory, env, stdio: 'inherit', timeout, killSignal: 'SIGKILL', ...options });
    budget.assertRemaining('Release command completion');
    return result;
  };
  const assetsDirectory = () => {
    assert.ok(isAbsolute(env.RUNNER_TEMP ?? ''), 'Release packaging requires an absolute runner temporary directory');
    return join(env.RUNNER_TEMP, 'aoe2-release');
  };

  if (action === 'version') {
    const raw = invoke('git', ['show', env.EXPECTED_RELEASE_SHA + ':package.json'], { encoding: 'utf8', stdio: 'pipe' });
    assert.equal('v' + JSON.parse(raw).version, version, 'Release package version differs from the prepared source');
  } else if (action === 'tag-draft') {
    invoke('git', ['config', 'user.name', 'hongcun lin']);
    invoke('git', ['config', 'user.email', 'linhongcun2021@gmail.com']);
    invoke('npm', ['run', 'release', '--', version]);
  } else if (action === 'package') {
    const target = assetsDirectory();
    mkdirSync(target, { recursive: true });
    budget.assertRemaining('Release package directory');
    const archive = join(target, 'aoe2-analyzer-' + version + '.zip');
    rmSync(archive, { force: true });
    invoke('zip', ['-q', '-r', archive, '.'], { cwd: join(directory, 'dist') });
    const digest = invoke('sha256sum', ['aoe2-analyzer-' + version + '.zip'], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
    writeFileSync(join(target, 'SHA256SUMS.txt'), digest);
  } else if (action === 'publish') {
    const target = assetsDirectory();
    invoke('gh', ['release', 'upload', version, join(target, 'aoe2-analyzer-' + version + '.zip'), join(target, 'SHA256SUMS.txt'), '--clobber']);
    // A slow upload must never be followed by publication after the same absolute deadline.
    invoke('gh', ['release', 'edit', version, '--draft=false', '--latest']);
  } else throw new Error('Unknown Release action: ' + action);
  budget.assertRemaining('Release action completion');
}

/** Failure metadata only: its separate clock cannot execute release commands or reset validation. */
function diagnosticSource(env, now) {
  return createBudget({
    originMs: Number(env.CI_RUN_EPOCH_MS),
    deadlineMs: Number(env.CI_DEADLINE_MS),
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    now,
  });
}

export async function recordReleaseDiagnostics({ env = process.env, now = Date.now, run } = {}) {
  const validation = diagnosticSource(env, now);
  const diagnostic = createDiagnosticBudget(validation, { now });
  await (run ?? diagnostic.run)(process.execPath, ['scripts/ci-stage.mjs', 'timing', '--kind', 'release'], {
    maxMs: 20000,
    env: {
      ...env,
      CI_BUDGET_KIND: 'diagnostic',
      CI_DIAGNOSTIC_ORIGIN_MS: String(diagnostic.originMs),
      CI_DIAGNOSTIC_DEADLINE_MS: String(diagnostic.deadlineMs),
    },
  });
  const remaining = diagnostic.assertRemaining('Release diagnostic completion');
  // The one-minute platform artifact action is optional; reserve extra room for step handoff.
  return { deadlineMs: diagnostic.deadlineMs, upload: remaining >= 65000 };
}

export function assertReleaseDiagnostic(deadlineMs, { env = process.env, now = Date.now } = {}) {
  const validation = diagnosticSource(env, now);
  assert.ok(Number.isSafeInteger(deadlineMs) && deadlineMs <= validation.deadlineMs + DIAGNOSTIC_BUDGET_MS, 'Invalid Release diagnostic cutoff');
  assert.ok(now() < deadlineMs, 'Release diagnostic window expired');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const action = process.argv[2];
  try {
    if (action === 'diagnostic-assert' && process.argv.length === 4) assertReleaseDiagnostic(Number(process.argv[3]));
    else if (process.argv.length !== 3) throw new Error('Use record-source, version, tag-draft, package, publish or diagnostics');
    else if (action === 'record-source') await recordReleaseSource();
    else if (action === 'diagnostics') {
      const result = await recordReleaseDiagnostics();
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'deadline_ms=' + result.deadlineMs + '\nupload=' + result.upload + '\n');
    } else runReleaseAction(action);
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.code === 'CI_DEADLINE_EXCEEDED' ? 124 : 1;
  }
}
