/** Budgeted Pages publisher. REST payload/statuses follow actions/deploy-pages@v4. */
import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetFromEnv, createDiagnosticBudget } from './ci-budget.mjs';

const API = 'https://api.github.com';
const LIMIT = 30 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const POSITIVE = /^[1-9]\d*$/;
const FAILURE_STATUSES = new Set(['deployment_failed', 'deployment_perms_error', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost']);

function fail(message, code = 'CI_PAGES_FAILED') {
  return Object.assign(new Error(message), { code });
}

function positive(value, label) {
  if (!POSITIVE.test(String(value ?? '')) || !Number.isSafeInteger(Number(value))) throw fail('Invalid ' + label);
  return Number(value);
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw fail('Invalid ' + label);
  const time = Date.parse(value);
  if (!Number.isSafeInteger(time) || time <= 0) throw fail('Invalid ' + label);
  return time;
}

function context(env) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw fail('Invalid Pages repository');
  if (!SHA.test(env.GITHUB_SHA ?? '')) throw fail('Invalid Pages build SHA');
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'push') throw fail('Pages deployment requires a main push');
  if (env.GITHUB_API_URL && env.GITHUB_API_URL !== API) throw fail('Unexpected GitHub API origin');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw fail('Pages deployment requires the configured GitHub token');
  if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || !env.ACTIONS_ID_TOKEN_REQUEST_URL) throw fail('Pages deployment requires runtime OIDC credentials');
  let oidcURL;
  try {
    oidcURL = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  } catch {
    throw fail('Invalid runtime OIDC URL');
  }
  if (oidcURL.protocol !== 'https:' || !oidcURL.hostname.endsWith('.actions.githubusercontent.com') || oidcURL.username || oidcURL.password || oidcURL.hash)
    throw fail('Unexpected runtime OIDC origin');
  return {
    repo: env.GITHUB_REPOSITORY,
    repositoryId: positive(env.GITHUB_REPOSITORY_ID, 'repository ID'),
    runId: positive(env.GITHUB_RUN_ID, 'run ID'),
    attempt: positive(env.GITHUB_RUN_ATTEMPT, 'run attempt'),
    sha: env.GITHUB_SHA,
    token,
    oidcURL: oidcURL.href,
    oidcRequestToken: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  };
}

function checkBudget(budget, signal, label) {
  if (signal?.aborted) throw fail('Pages deployment was cancelled', 'CI_CANCELLED');
  return budget.assertRemaining(label);
}

async function pauseWithinBudget(ms, budget, signal) {
  checkBudget(budget, signal, 'Pages polling wait');
  const active = signal ? AbortSignal.any([signal, budget.signal()]) : budget.signal();
  await new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      active.removeEventListener('abort', aborted);
    };
    const aborted = () => {
      cleanup();
      reject(active.reason ?? fail('Pages polling cancelled', 'CI_CANCELLED'));
    };
    const timer = setTimeout(
      () => {
        cleanup();
        resolvePromise();
      },
      Math.min(ms, budget.remainingMs()),
    );
    if (active.aborted) aborted();
    else active.addEventListener('abort', aborted, { once: true });
  });
  checkBudget(budget, signal, 'Pages polling wait completed');
}

async function request(budget, url, init, signal) {
  checkBudget(budget, signal, 'Pages API request');
  const result = await budget.fetchJson(url, { ...init, redirect: 'error', ...(signal ? { signal } : {}) }, { maxMs: 10_000 });
  checkBudget(budget, signal, 'Pages API response');
  return result;
}

async function collect(budget, url, key, headers, signal) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const result = await request(budget, `${url}?per_page=100&page=${page}`, { headers }, signal);
    if (!Array.isArray(result?.[key]) || !Number.isSafeInteger(result.total_count) || result.total_count < 0) throw fail('Invalid Pages ' + key + ' metadata');
    items.push(...result[key]);
    if (items.length >= result.total_count) return items;
    if (result[key].length === 0) throw fail('Incomplete Pages ' + key + ' metadata');
  }
  throw fail('Pages ' + key + ' metadata exceeds the bounded page count');
}

function validateRun(run, attempt, current, budget, now) {
  if (budget.kind !== 'validation' || budget.deadlineMs !== budget.originMs + LIMIT) throw fail('Pages requires the shared validation budget');
  const wire = budget.toJSON();
  if (wire.run_id !== current.runId || wire.run_attempt !== current.attempt) throw fail('Pages budget belongs to another run or attempt');
  if (
    run?.id !== current.runId ||
    run.run_attempt !== current.attempt ||
    run.repository?.id !== current.repositoryId ||
    run.repository.full_name !== current.repo ||
    run.head_sha !== current.sha ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.name !== 'CI / Deploy' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.status !== 'in_progress' ||
    run.conclusion !== null
  )
    throw fail('Pages run metadata does not identify the current main workflow');
  if (timestamp(run.created_at, 'run epoch') !== budget.originMs) throw fail('Pages deadline was reset from the GitHub run epoch');
  // GitHub timestamps each attempt independently; the run epoch remains the budget anchor.
  const attemptCreated = timestamp(attempt?.created_at, 'attempt epoch');
  if (
    attempt?.id !== run.id ||
    attempt.run_attempt !== current.attempt ||
    attempt.head_sha !== current.sha ||
    attemptCreated < budget.originMs ||
    attemptCreated > now()
  )
    throw fail('Pages attempt metadata is stale');
  const started = timestamp(attempt.run_started_at, 'attempt start');
  if (started < budget.originMs || started > now()) throw fail('Invalid Pages attempt window');
  return started;
}

function selectArtifact(artifacts, jobs, current, attemptStarted, budget, now) {
  const tests = jobs.filter((job) => job.name === 'test');
  if (tests.length !== 1) throw fail('Pages requires exactly one current test gate');
  const gate = tests[0];
  const gateStarted = timestamp(gate.started_at, 'test gate start'),
    gateFinished = timestamp(gate.completed_at, 'test gate completion');
  if (
    !Number.isSafeInteger(gate.id) ||
    gate.id <= 0 ||
    gate.run_id !== current.runId ||
    gate.run_attempt !== current.attempt ||
    gate.head_sha !== current.sha ||
    gate.status !== 'completed' ||
    gate.conclusion !== 'success' ||
    gateStarted < attemptStarted ||
    gateFinished < gateStarted ||
    gateFinished >= budget.deadlineMs ||
    gateFinished > now()
  )
    throw fail('Pages test gate is unsuccessful, stale, or outside the shared deadline');
  const currentArtifacts = artifacts.filter((artifact) => {
    if (artifact.name !== 'github-pages' || artifact.expired !== false) return false;
    try {
      const created = timestamp(artifact.created_at, 'artifact creation');
      return created >= gateStarted && created <= gateFinished;
    } catch {
      return false;
    }
  });
  if (currentArtifacts.length !== 1) throw fail('Pages requires exactly one artifact from the current run attempt');
  const artifact = currentArtifacts[0],
    source = artifact.workflow_run;
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id <= 0 ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes <= 0 ||
    artifact.size_in_bytes > 1024 ** 3 ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') ||
    timestamp(artifact.expires_at, 'artifact expiry') <= now() ||
    timestamp(artifact.updated_at, 'artifact update') > gateFinished ||
    source?.id !== current.runId ||
    source.repository_id !== current.repositoryId ||
    source.head_repository_id !== current.repositoryId ||
    source.head_sha !== current.sha ||
    source.head_branch !== 'main'
  )
    throw fail('Pages artifact identity, digest, or lifetime is invalid');
  return artifact;
}

function validateOIDC(value, current, now) {
  if (typeof value !== 'string' || value.length > 32_768 || value.split('.').length !== 3) throw fail('Invalid runtime OIDC token');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw fail('Invalid runtime OIDC claims');
  }
  if (
    claims.iss !== 'https://token.actions.githubusercontent.com' ||
    claims.repository !== current.repo ||
    claims.repository_id !== String(current.repositoryId) ||
    claims.run_id !== String(current.runId) ||
    claims.run_attempt !== String(current.attempt) ||
    claims.sha !== current.sha ||
    claims.ref !== 'refs/heads/main' ||
    claims.event_name !== 'push' ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp * 1000 <= now()
  )
    throw fail('Runtime OIDC token belongs to another run, attempt, or build');
  return value;
}

function deploymentId(deployment, current) {
  if (typeof deployment?.id === 'number' && Number.isSafeInteger(deployment.id) && deployment.id > 0) return String(deployment.id);
  if (typeof deployment?.id === 'string' && /^[\w-]{1,100}$/.test(deployment.id)) return deployment.id;
  if (typeof deployment?.status_url === 'string') {
    const prefix = `${API}/repos/${current.repo}/pages/deployments/`;
    if (deployment.status_url.startsWith(prefix) && /^[\w-]{1,100}$/.test(deployment.status_url.slice(prefix.length)))
      return deployment.status_url.slice(prefix.length);
  }
  throw fail('Pages create response has no deployment identity');
}

function pageURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw fail('Pages response has no published URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || /[\r\n]/.test(value)) throw fail('Invalid published Pages URL');
  return url.href;
}

function expectedContext(env) {
  if (!SHA.test(env.GITHUB_SHA ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw fail('Invalid published-build context');
  return {
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    runId: positive(env.GITHUB_RUN_ID, 'published run ID'),
    attempt: positive(env.GITHUB_RUN_ATTEMPT, 'published attempt'),
  };
}

/** Validate the local immutable bytes before they can authorize a publication. */
export function validateExpectedPublished(expected, env = process.env) {
  const current = expectedContext(env),
    snapshot = { ...expected?.snapshot };
  if (!Buffer.isBuffer(expected?.manifestBytes) && !(expected?.manifestBytes instanceof Uint8Array)) throw fail('Missing expected build manifest bytes');
  const bytes = Buffer.from(expected.manifestBytes);
  if (!bytes.length || bytes.length > 1_048_576) throw fail('Invalid expected build manifest size');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (
    snapshot.commit !== current.sha ||
    !SHA.test(snapshot.tree ?? '') ||
    snapshot.run_id !== current.runId ||
    snapshot.run_attempt !== current.attempt ||
    !Number.isSafeInteger(snapshot.build_job_id) ||
    snapshot.build_job_id <= 0 ||
    !DIGEST.test(snapshot.manifest_digest ?? '') ||
    snapshot.manifest_digest !== digest ||
    (snapshot.repository !== undefined && snapshot.repository !== current.repository)
  )
    throw fail('Expected snapshot does not identify the current immutable build');
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw fail('Invalid expected build manifest JSON');
  }
  const gate = typeof snapshot.gate_ref === 'string' ? snapshot.gate_ref.split(':') : [];
  if (
    manifest?.schema !== 1 ||
    manifest.commit !== snapshot.commit ||
    manifest.tree !== snapshot.tree ||
    manifest.repository !== current.repository ||
    manifest.runId !== snapshot.run_id ||
    manifest.runAttempt !== snapshot.run_attempt ||
    manifest.buildJobId !== snapshot.build_job_id ||
    manifest.gate_ref !== snapshot.gate_ref ||
    !DIGEST.test(manifest.toolchainDigest ?? '') ||
    !/^v\d+\.\d+\.\d+$/.test(manifest.version ?? '') ||
    !DIGEST.test(manifest.files?.['index.html'] ?? '') ||
    gate.length !== 6 ||
    gate[0] !== 'ci-v2' ||
    gate[1] !== current.repository ||
    gate[2] !== String(current.runId) ||
    gate[3] !== String(current.attempt) ||
    !DIGEST.test(gate[4]) ||
    gate[5] !== 'test'
  )
    throw fail('Expected manifest identity or aggregate gate link is invalid');
  return { snapshot, manifest, manifestBytes: bytes, digest };
}

/** The production CLI has no option to omit this downloaded same-run snapshot. */
export function loadExpectedPublished(env = process.env, budget) {
  budget.assertRemaining('Published-build snapshot load');
  const folder = env.CI_BUILD_DIR || (env.RUNNER_TEMP ? join(env.RUNNER_TEMP, 'ci-build') : null);
  if (!folder) throw fail('Missing downloaded current build directory');
  const snapshotPath = env.CI_SNAPSHOT_PATH || join(folder, 'snapshot.json');
  const manifestPath = env.CI_MANIFEST_PATH || join(folder, 'dist', 'build-evidence.json');
  const read = (path, maxBytes) => {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) throw fail('Expected build identity must be a bounded regular file');
    return readFileSync(path);
  };
  let snapshot;
  try {
    snapshot = JSON.parse(read(snapshotPath, 65_536).toString('utf8'));
  } catch {
    throw fail('Missing or invalid downloaded snapshot');
  }
  const expected = validateExpectedPublished({ snapshot, manifestBytes: read(manifestPath, 1_048_576) }, env);
  budget.assertRemaining('Published-build snapshot loaded');
  return expected;
}

async function verifyPublishedIdentity({ page_url, expected, env, budget, now, pause, signal, log, maxWaitMs }) {
  const until = Math.min(budget.deadlineMs, now() + maxWaitMs);
  const assertWindow = () => {
    checkBudget(budget, signal, 'Published build identity');
    if (now() >= until) throw fail('Published build identity did not reach the current immutable snapshot in time', 'CI_PAGES_IDENTITY_TIMEOUT');
  };
  const base = new URL(page_url);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  for (let attempt = 1; ; attempt++) {
    assertWindow();
    const url = new URL('build-evidence.json', base);
    url.searchParams.set('_ci_identity', `${expected.manifest.commit}-${expected.manifest.runId}-${expected.manifest.runAttempt}-${now()}-${attempt}`);
    let bytes;
    try {
      bytes = Buffer.from(
        await budget.fetchBytes(
          url.href,
          {
            cache: 'no-store',
            redirect: 'error',
            headers: { 'Cache-Control': 'no-cache' },
            ...(signal ? { signal } : {}),
          },
          { maxMs: Math.min(10_000, Math.max(1, until - now())) },
        ),
      );
    } catch (error) {
      assertWindow();
      if (!['CI_HTTP_ERROR', 'CI_OPERATION_TIMEOUT'].includes(error?.code)) throw error;
    }
    assertWindow();
    if (bytes && bytes.length <= 1_048_576 && createHash('sha256').update(bytes).digest('hex') === expected.digest) {
      // Hash equality is necessary; independently check the actual published JSON
      // identity and gate fields before this same-version deployment can be green.
      validateExpectedPublished({ snapshot: expected.snapshot, manifestBytes: bytes }, env);
      assertWindow();
      log('Published build identity matches the exact current snapshot bytes');
      return;
    }
    log('Published build identity has not reached the current snapshot');
    await pause(Math.min(5000, Math.max(1, until - now())), budget, signal);
  }
}

/** This function never turns diagnostic cleanup into a successful validation. */
export async function deployPages({
  env = process.env,
  budget = budgetFromEnv(env),
  now = Date.now,
  pause = pauseWithinBudget,
  createDiagnosticBudgetImpl = createDiagnosticBudget,
  signal,
  log = () => {},
  pollIntervalMs = 10_000,
  expectedPublished,
  identityWaitMs = 60_000,
} = {}) {
  const current = context(env);
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 30_000) throw fail('Invalid Pages polling interval');
  if (!Number.isSafeInteger(identityWaitMs) || identityWaitMs < 1 || identityWaitMs > 60_000) throw fail('Invalid published identity wait bound');
  const expected = expectedPublished === undefined ? null : validateExpectedPublished(expectedPublished, env);
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${current.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const root = `${API}/repos/${current.repo}`;
  let id = null,
    createStarted = false;
  try {
    checkBudget(budget, signal, 'Pages deployment start');
    const run = await request(budget, `${root}/actions/runs/${current.runId}`, { headers }, signal);
    const attempt = await request(budget, `${root}/actions/runs/${current.runId}/attempts/${current.attempt}`, { headers }, signal);
    const started = validateRun(run, attempt, current, budget, now);
    const jobs = await collect(budget, `${root}/actions/runs/${current.runId}/attempts/${current.attempt}/jobs`, 'jobs', headers, signal);
    const artifacts = await collect(budget, `${root}/actions/runs/${current.runId}/artifacts`, 'artifacts', headers, signal);
    const artifact = selectArtifact(artifacts, jobs, current, started, budget, now);
    const tokenResult = await request(budget, current.oidcURL, { headers: { Authorization: `Bearer ${current.oidcRequestToken}` } }, signal);
    const token = validateOIDC(tokenResult?.value, current, now);
    checkBudget(budget, signal, 'Pages publication');
    createStarted = true;
    const deployment = await request(
      budget,
      `${root}/pages/deployments`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifact.id, pages_build_version: current.sha, oidc_token: token }),
      },
      signal,
    );
    id = deploymentId(deployment, current);
    const url = pageURL(deployment.page_url);
    while (true) {
      await pause(pollIntervalMs, budget, signal);
      checkBudget(budget, signal, 'Pages polling');
      const state = await request(budget, `${root}/pages/deployments/${id}`, { headers }, signal);
      if (state?.status === 'succeed') {
        checkBudget(budget, signal, 'Pages success');
        const result = { id, page_url: state.page_url ? pageURL(state.page_url) : url, status: 'succeed', artifact_id: artifact.id };
        if (expected) await verifyPublishedIdentity({ page_url: result.page_url, expected, env, budget, now, pause, signal, log, maxWaitMs: identityWaitMs });
        log('Pages deployment completed within the shared workflow deadline');
        checkBudget(budget, signal, 'Pages completion');
        return result;
      }
      if (FAILURE_STATUSES.has(state?.status)) throw fail('Pages reported ' + state.status);
      if (typeof state?.status !== 'string' || !state.status) throw fail('Invalid Pages polling response');
      log('Pages deployment remains pending');
    }
  } catch (error) {
    // The server may accept a POST whose response crosses the deadline. The official
    // action also uses the build version as its last-resort deployment identifier.
    let cancellation = { attempted: false, confirmed: false };
    if (id || createStarted) {
      cancellation = { attempted: true, confirmed: false };
      try {
        const diagnostic = createDiagnosticBudgetImpl(budget, { now });
        if (diagnostic.kind !== 'diagnostic' || diagnostic.deadlineMs > budget.deadlineMs + 90_000 || diagnostic.deadlineMs > now() + 90_000)
          throw fail('Invalid deployment cancellation budget');
        const response = await diagnostic.fetch(
          `${root}/pages/deployments/${id ?? current.sha}/cancel`,
          { method: 'POST', headers, redirect: 'error' },
          { maxMs: 10_000 },
        );
        if (!response.ok) throw fail('Pages cancellation request was rejected');
        diagnostic.assertRemaining('Pages cancellation');
        cancellation.confirmed = true;
        log('Pending Pages deployment cancellation request accepted; validation remains failed');
      } catch {
        log('Pending Pages deployment cancellation could not be confirmed; validation remains failed');
      }
    }
    const safe = error?.code && /^CI_[A-Z_]+$/.test(error.code) ? error : fail('Pages deployment request failed');
    safe.deploymentCancellation = cancellation;
    throw safe;
  }
}

export async function main(env = process.env) {
  const controller = new AbortController();
  const cancel = () => controller.abort(fail('Pages publisher cancelled', 'CI_CANCELLED'));
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  try {
    const budget = budgetFromEnv(env);
    if (!env.GITHUB_OUTPUT) throw fail('Missing GITHUB_OUTPUT');
    const expectedPublished = loadExpectedPublished(env, budget);
    const result = await deployPages({ env, budget, expectedPublished, signal: controller.signal, log: console.log });
    checkBudget(budget, controller.signal, 'Pages output');
    appendFileSync(env.GITHUB_OUTPUT, `page_url=${result.page_url}\nstatus=succeed\n`);
    checkBudget(budget, controller.signal, 'Pages output completed');
  } finally {
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((error) => {
    console.error('Pages publisher failed: ' + (/^CI_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'CI_PAGES_FAILED'));
    process.exitCode = 1;
  });
}
