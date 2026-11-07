/** v2 phase evidence: GitHub-owned provenance, exact executed sets and a strict final gate. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const TEST_FILE = /^tests\/(?:unit\/[A-Za-z0-9_.-]+\.test|e2e\/[A-Za-z0-9_.-]+\.spec)\.ts$/;
const EVENTS = new Set(['push', 'pull_request', 'schedule', 'workflow_dispatch']);
const STAGES = new Set(['static', 'static-main', 'unit', 'data', 'build', 'browser-1', 'browser-2', 'browser-3', 'browser-4']);
const CURRENT_ONLY = new Set(['build', 'static-main']);
const BUILD_CHECKS = ['build', 'fresh-build-smoke', 'snapshot'];
const LIMIT_MS = 30 * 60 * 1000;
const ARTIFACT_LIMIT = 1_048_576;
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const digest = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const milliseconds = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
// GitHub omits fractional seconds on several metadata fields. Such a timestamp
// denotes a second bucket; explicitly fractional metadata keeps exact ordering.
function apiTime(value) {
  const min = milliseconds(value);
  const exact = typeof value === 'string' && /\.\d+(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return { min, max: min + (exact ? 0 : 999) };
}
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nowValue = (now) => (typeof now === 'function' ? now() : (now ?? Date.now()));

export const EVIDENCE_VERSION = 2;
export const POLICY_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/ci-timing.yml',
  '.github/workflows/ci-probe.yml',
  'scripts/ci-budget.mjs',
  'scripts/ci-stage-evidence.mjs',
  'scripts/ci-stage.mjs',
  'scripts/ci-worker.mjs',
  'scripts/ci-api.mjs',
  'scripts/ci-commands.mjs',
  'scripts/ci-plan.mjs',
  'scripts/ci-release.mjs',
  'scripts/ci-deploy.mjs',
  'scripts/ci-timing.mjs',
  'scripts/ci-report.mjs',
  'scripts/ci-browser-weights.json',
  'scripts/ci-evidence.mjs',
  'scripts/ci-scope.mjs',
  'scripts/ci-run.mjs',
  'scripts/ci-shards.mjs',
  'scripts/ci-browser-reporter.mjs',
  'scripts/site-artifact.mjs',
  'scripts/deployment-smoke.mjs',
  'scripts/historical-ui.mjs',
  'scripts/prepare-release.mjs',
  'scripts/release.mjs',
  'scripts/page_metadata.mjs',
  'scripts/static_pages.mjs',
  'playwright.config.ts',
  'vite.config.ts',
  'tsconfig.json',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  '.npmrc',
];

const readPolicyFile = (path) => readFileSync(path);
export function policyDigest(read = readPolicyFile, executionPaths) {
  const discovered =
    executionPaths ??
    (read === readPolicyFile
      ? readdirSync('scripts')
          .filter((name) => /^ci-.*\.(?:mjs|cjs|js|py|json)$/.test(name))
          .map((name) => 'scripts/' + name)
      : []);
  if (!Array.isArray(discovered) || discovered.some((path) => !POLICY_FILES.includes(path))) throw new Error('Unfingerprinted CI execution file');
  return digest(POLICY_FILES.map((path) => [path, createHash('sha256').update(read(path)).digest('hex')]));
}

function canonicalValue(value) {
  if (typeof value === 'string' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  throw new Error('Invalid fingerprint value');
}

export function toolchainDigest(toolchain) {
  if (!object(toolchain) || !Object.keys(toolchain).length) throw new Error('Missing toolchain');
  return digest(canonicalValue(toolchain));
}

function strings(value, label, file = false) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry || entry.length > 1000 || (file && !TEST_FILE.test(entry))))
    throw new Error('Invalid ' + label);
  if (new Set(value).size !== value.length) throw new Error('Duplicate ' + label);
  return [...value].sort();
}

export function canonicalSelection(selection) {
  if (!object(selection)) throw new Error('Invalid stage selection');
  const checks = strings(selection.checks ?? [], 'checks');
  const files = strings(selection.files ?? [], 'test files', true);
  if (!Array.isArray(selection.cases ?? [])) throw new Error('Invalid cases');
  const cases = (selection.cases ?? [])
    .map((entry) => {
      if (!object(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 1000 || !['passed', 'skipped'].includes(entry.expectedStatus))
        throw new Error('Invalid case');
      return { id: entry.id, expectedStatus: entry.expectedStatus };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length) throw new Error('Duplicate case');
  return { checks, files, cases };
}

export const selectionDigest = (selection) => digest(canonicalSelection(selection));

function requirement(required) {
  if (
    !object(required) ||
    !STAGES.has(required.stage_id) ||
    required.job_name !== required.stage_id ||
    typeof required.reusable !== 'boolean' ||
    !DIGEST.test(required.toolchain_digest ?? '')
  )
    throw new Error('Invalid stage requirement');
  const selection = canonicalSelection(required.selection);
  if (!selection.checks.length && !selection.files.length && !selection.cases.length) throw new Error('Empty stage selection');
  if (CURRENT_ONLY.has(required.stage_id) && required.reusable) throw new Error('Current-only stage cannot be reused');
  if (required.stage_id === 'build' && !BUILD_CHECKS.every((id) => selection.checks.includes(id))) throw new Error('Missing fresh build checks');
  if (required.stage_id.startsWith('browser-') && !selection.cases.length) throw new Error('Browser shard must contain cases');
  return { stage_id: required.stage_id, job_name: required.job_name, reusable: required.reusable, selection, toolchain_digest: required.toolchain_digest };
}

function validEpoch(epoch, runId, attempt) {
  return (
    object(epoch) &&
    epoch.version === 1 &&
    epoch.kind === 'validation' &&
    epoch.source === 'github.run.created_at' &&
    Number.isSafeInteger(epoch.origin_ms) &&
    epoch.deadline_ms === epoch.origin_ms + LIMIT_MS &&
    epoch.run_id === runId &&
    epoch.run_attempt === attempt
  );
}

function validEvent(event, repository, commit) {
  return (
    object(event) &&
    EVENTS.has(event.name) &&
    event.sha === commit &&
    REPOSITORY.test(event.head_repository ?? '') &&
    (event.name === 'pull_request' ? SHA.test(event.base_sha ?? '') && SHA.test(event.head_sha ?? '') : event.head_repository === repository)
  );
}

function validateCurrent(current, now) {
  if (
    !object(current) ||
    !REPOSITORY.test(current.repository ?? '') ||
    !positive(current.repository_id) ||
    !positive(current.run_id) ||
    !positive(current.run_attempt) ||
    !SHA.test(current.commit ?? '') ||
    !SHA.test(current.tree ?? '') ||
    !DIGEST.test(current.policy_digest ?? '') ||
    !validEvent(current.event, current.repository, current.commit) ||
    !validEpoch(current.epoch, current.run_id, current.run_attempt)
  )
    throw new Error('Invalid current CI context');
  if (!Number.isFinite(now) || now < current.epoch.origin_ms || now >= current.epoch.deadline_ms) {
    throw Object.assign(new Error('CI validation deadline exceeded'), { code: 'CI_DEADLINE_EXCEEDED' });
  }
}

export function snapshotIdentity(snapshot) {
  if (
    !object(snapshot) ||
    !SHA.test(snapshot.commit ?? '') ||
    !SHA.test(snapshot.tree ?? '') ||
    !positive(snapshot.run_id) ||
    !positive(snapshot.run_attempt) ||
    !positive(snapshot.build_job_id) ||
    !DIGEST.test(snapshot.manifest_digest ?? '') ||
    typeof snapshot.gate_ref !== 'string' ||
    !snapshot.gate_ref ||
    snapshot.gate_ref.length > 500
  )
    throw new Error('Invalid source build identity');
  return Object.fromEntries(['commit', 'tree', 'run_id', 'run_attempt', 'build_job_id', 'manifest_digest', 'gate_ref'].map((key) => [key, snapshot[key]]));
}

function executionResult(execution, selection) {
  if (!object(execution)) throw new Error('Missing actual execution summary');
  const checks = strings(execution.checks ?? [], 'executed checks');
  const files = strings(execution.files ?? [], 'executed files', true);
  if (!Array.isArray(execution.cases ?? [])) throw new Error('Missing executed cases');
  const cases = (execution.cases ?? [])
    .map((entry) => {
      if (
        !object(entry) ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        !['passed', 'failed', 'skipped'].includes(entry.status) ||
        (entry.retry !== undefined && entry.retry !== 0) ||
        (entry.outcome !== undefined && entry.outcome !== 'expected' && !(entry.outcome === 'skipped' && entry.status === 'skipped'))
      )
        throw new Error('Unexpected case outcome');
      return { id: entry.id, status: entry.status };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    new Set(cases.map((entry) => entry.id)).size !== cases.length ||
    !isDeepStrictEqual(checks, selection.checks) ||
    !isDeepStrictEqual(files, selection.files) ||
    !isDeepStrictEqual(
      cases,
      selection.cases.map((entry) => ({ id: entry.id, status: entry.expectedStatus })),
    )
  )
    throw new Error('Actual execution does not match requested selection');
  return { checks, files, cases };
}

/** Must be called only with runner/reporter actual results after successful commands. */
export function createExecutedReceipt({ current, required, job_id, finished_at, execution, source_build = null, now }) {
  validateCurrent(current, nowValue(now));
  const stage = requirement(required);
  if (!positive(job_id)) throw new Error('Expected actual numeric GitHub job ID');
  const finished = milliseconds(finished_at);
  if (!Number.isFinite(finished) || finished < current.epoch.origin_ms || finished >= current.epoch.deadline_ms || finished > nowValue(now))
    throw new Error('Stage finished outside its run deadline');
  const snapshot = source_build === null ? null : snapshotIdentity(source_build);
  if (stage.stage_id === 'build' || stage.stage_id.startsWith('browser-')) {
    if (
      !snapshot ||
      snapshot.commit !== current.commit ||
      snapshot.tree !== current.tree ||
      snapshot.run_id !== current.run_id ||
      snapshot.run_attempt !== current.run_attempt ||
      (stage.stage_id === 'build' && snapshot.build_job_id !== job_id)
    )
      throw new Error('Wrong source build');
  } else if (snapshot) throw new Error('Unexpected source build');
  const result = {
    version: EVIDENCE_VERSION,
    repository: current.repository,
    repository_id: current.repository_id,
    run_id: current.run_id,
    run_attempt: current.run_attempt,
    job_id,
    stage_id: stage.stage_id,
    job_name: stage.job_name,
    tested_commit: current.commit,
    tested_tree: current.tree,
    event: structuredClone(current.event),
    policy_digest: current.policy_digest,
    toolchain_digest: stage.toolchain_digest,
    selection: stage.selection,
    selection_digest: selectionDigest(stage.selection),
    execution: executionResult(execution, stage.selection),
    executed: true,
    source_build: snapshot,
    epoch: structuredClone(current.epoch),
    finished_at,
  };
  validateCurrent(current, nowValue(now));
  return result;
}

export function stageArtifactName(tree, stageId) {
  if (!SHA.test(tree ?? '') || !STAGES.has(stageId)) throw new Error('Invalid stage artifact identity');
  return 'ci-v2-' + tree + '-' + stageId;
}

function covers(available, requested) {
  return (
    ['checks', 'files'].every((key) => requested[key].every((entry) => available[key].includes(entry))) &&
    requested.cases.every((entry) => available.cases.some((candidate) => candidate.id === entry.id && candidate.expectedStatus === entry.expectedStatus))
  );
}

function trustedRun(run, current, mode) {
  if (
    !object(run) ||
    !positive(run.id) ||
    !positive(run.run_attempt) ||
    run.name !== 'CI / Deploy' ||
    run.path !== '.github/workflows/ci.yml' ||
    !EVENTS.has(run.event) ||
    !SHA.test(run.head_sha ?? '') ||
    run.repository?.full_name !== current.repository ||
    run.repository.id !== current.repository_id ||
    !positive(run.head_repository?.id) ||
    !REPOSITORY.test(run.head_repository?.full_name ?? '')
  )
    return false;
  if (mode === 'current')
    return (
      run.id === current.run_id &&
      run.run_attempt === current.run_attempt &&
      ['in_progress', 'completed'].includes(run.status) &&
      (run.status !== 'completed' || run.conclusion === 'success') &&
      run.event === current.event.name &&
      run.head_repository.full_name === current.event.head_repository
    );
  return (
    run.id !== current.run_id &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.head_repository.full_name === current.repository &&
    run.head_repository.id === current.repository_id
  );
}

function validateProof(input, allowHistoricalBuild = false) {
  const { receipt, run, jobs, artifact, commit, current, required, archive_sha256, mode = 'reuse' } = input;
  const reject = (reason) => ({ ok: false, reason });
  let wanted, selected;
  try {
    validateCurrent(current, nowValue(input.now));
    wanted = requirement(required);
    if (!['current', 'reuse'].includes(mode) || !trustedRun(run, current, mode)) return reject('untrusted-run');
    if (mode === 'reuse' && !allowHistoricalBuild && (!wanted.reusable || CURRENT_ONLY.has(wanted.stage_id))) return reject('current-only-stage');
    if (
      !object(receipt) ||
      receipt.version !== 2 ||
      receipt.executed !== true ||
      receipt.repository !== current.repository ||
      receipt.repository_id !== current.repository_id ||
      receipt.run_id !== run.id ||
      receipt.run_attempt !== run.run_attempt ||
      !positive(receipt.job_id) ||
      receipt.stage_id !== wanted.stage_id ||
      receipt.job_name !== wanted.job_name ||
      !SHA.test(receipt.tested_commit ?? '') ||
      receipt.tested_tree !== current.tree ||
      receipt.policy_digest !== current.policy_digest ||
      receipt.toolchain_digest !== wanted.toolchain_digest
    )
      return reject('receipt-mismatch');
    if (!validEpoch(receipt.epoch, run.id, run.run_attempt) || milliseconds(run.created_at) !== receipt.epoch.origin_ms) return reject('invalid-source-epoch');
    selected = canonicalSelection(receipt.selection);
    if (receipt.selection_digest !== selectionDigest(selected)) return reject('selection-digest-mismatch');
    executionResult(receipt.execution, selected);
    if (!covers(selected, wanted.selection)) return reject('selection-not-covered');
  } catch (error) {
    if (error.code === 'CI_DEADLINE_EXCEEDED') return reject('deadline-exceeded');
    return reject('malformed-evidence');
  }
  const matching = Array.isArray(jobs) ? jobs.filter((job) => job.name === wanted.job_name) : [];
  const job = matching.find((candidate) => candidate.id === receipt.job_id);
  if (
    matching.length !== 1 ||
    !job ||
    !positive(job.id) ||
    job.run_id !== run.id ||
    job.run_attempt !== run.run_attempt ||
    job.head_sha !== run.head_sha ||
    job.status !== 'completed' ||
    job.conclusion !== 'success'
  )
    return reject('stage-job-did-not-succeed');
  const start = apiTime(job.started_at),
    end = apiTime(job.completed_at),
    finished = milliseconds(receipt.finished_at);
  if (
    ![start.min, end.min, finished].every(Number.isFinite) ||
    start.min > finished ||
    finished > end.max ||
    finished > nowValue(input.now) ||
    end.min > nowValue(input.now) ||
    start.min < receipt.epoch.origin_ms ||
    finished >= receipt.epoch.deadline_ms ||
    end.max >= receipt.epoch.deadline_ms
  )
    return reject('invalid-stage-time');
  const created = apiTime(artifact?.created_at),
    expires = milliseconds(artifact?.expires_at);
  if (
    !object(artifact) ||
    artifact.name !== stageArtifactName(current.tree, wanted.stage_id) ||
    !positive(artifact.id) ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes <= 0 ||
    artifact.size_in_bytes > ARTIFACT_LIMIT ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run.head_sha !== run.head_sha ||
    artifact.workflow_run.repository_id !== current.repository_id ||
    artifact.workflow_run.head_repository_id !== run.head_repository.id ||
    !Number.isFinite(created.min) ||
    created.min > end.max ||
    created.max < finished ||
    created.min > nowValue(input.now) ||
    !Number.isFinite(expires) ||
    expires <= nowValue(input.now) ||
    !DIGEST.test(archive_sha256 ?? '') ||
    artifact.digest !== 'sha256:' + archive_sha256
  )
    return reject('artifact-ownership-or-digest');
  if (
    !validEvent(receipt.event, current.repository, receipt.tested_commit) ||
    receipt.event.name !== run.event ||
    receipt.event.head_repository !== run.head_repository.full_name ||
    !commit ||
    commit.sha !== receipt.tested_commit ||
    commit.tree?.sha !== current.tree
  )
    return reject('checkout-not-proven');
  if (run.event === 'pull_request') {
    const parents = Array.isArray(commit.parents) ? commit.parents.map((parent) => parent.sha) : [];
    const headMerged = parents.length === 2 && parents[1] === run.head_sha;
    const recordedBase = headMerged && parents[0] === receipt.event.base_sha;
    // pull_request.base.sha stays at the SHA recorded on the PR. refs/pull/N/merge is built
    // from the base tip at workflow time. base_advanced is set only after compare proves that
    // recorded base fast-forwards to that tip (ahead, behind_by 0).
    const advancedBase = headMerged && commit.base_advanced === true;
    if (receipt.event.head_sha !== run.head_sha || !(recordedBase || advancedBase)) return reject('pr-merge-not-proven');
  } else if (receipt.tested_commit !== run.head_sha) return reject('checkout-does-not-match-run');
  if (
    mode === 'current' &&
    (receipt.tested_commit !== current.commit || !isDeepStrictEqual(receipt.event, current.event) || !isDeepStrictEqual(receipt.epoch, current.epoch))
  )
    return reject('current-run-impersonation');
  if (wanted.stage_id === 'build' || wanted.stage_id.startsWith('browser-')) {
    let snapshot;
    try {
      snapshot = snapshotIdentity(receipt.source_build);
    } catch {
      return reject('invalid-source-build');
    }
    if (snapshot.commit !== receipt.tested_commit || snapshot.tree !== current.tree || snapshot.run_id !== run.id || snapshot.run_attempt !== run.run_attempt)
      return reject('source-build-identity');
    if (wanted.stage_id === 'build') {
      if (snapshot.build_job_id !== job.id || !BUILD_CHECKS.every((id) => selected.checks.includes(id)) || input.source_build_proof !== undefined)
        return reject('build-not-fresh');
    } else {
      const build = input.source_build_proof;
      if (
        !object(build) ||
        build.run?.id !== run.id ||
        build.run?.run_attempt !== run.run_attempt ||
        build.receipt?.tested_commit !== receipt.tested_commit ||
        build.receipt?.job_id !== snapshot.build_job_id ||
        !isDeepStrictEqual(build.receipt?.source_build, snapshot)
      )
        return reject('source-build-proof-missing');
      const result = validateProof(
        {
          ...build,
          current,
          mode,
          now: input.now,
          required: {
            stage_id: 'build',
            job_name: 'build',
            reusable: false,
            selection: { checks: BUILD_CHECKS, files: [], cases: [] },
            toolchain_digest: wanted.toolchain_digest,
          },
        },
        true,
      );
      if (!result.ok) return reject('source-build-proof-invalid:' + result.reason);
    }
  } else if (receipt.source_build !== null) return reject('unexpected-source-build');
  return { ok: true };
}

/** A proof contains receipt + GitHub run/attempt jobs/artifact/commit + independently computed ZIP archive_sha256. */
export function validateStageEvidence(input) {
  return validateProof(input);
}

/** Record that the PR base moved forward under the merge commit GitHub actually checked out. */
export async function noteAdvancedBase(commit, event, repository, query) {
  if (!commit || event?.name !== 'pull_request') return commit;
  const parents = Array.isArray(commit.parents) ? commit.parents.map((parent) => parent.sha) : [];
  if (!(parents.length === 2 && parents[1] === event.head_sha && SHA.test(parents[0] ?? '') && SHA.test(event.base_sha ?? '') && parents[0] !== event.base_sha))
    return commit;
  const compared = await query('repos/' + repository + '/compare/' + event.base_sha + '...' + parents[0]);
  if (compared?.status === 'ahead' && compared.behind_by === 0) commit.base_advanced = true;
  return commit;
}

/** All network adapters receive the SAME budget and a bounded lookup signal/timeout. No successful result after expiry. */
export async function findReusableStages({ current, requirements, api, download, budget, now = Date.now, lookupMs = 10_000 }) {
  validateCurrent(current, now());
  const wanted = requirements.map(requirement);
  if (new Set(wanted.map((entry) => entry.stage_id)).size !== wanted.length) throw new Error('Duplicate stage requirement');
  budget.assertRemaining('stage reuse lookup');
  const reused = {},
    reasons = [],
    stop = Math.min(budget.deadlineMs, now() + Math.max(0, lookupMs));
  const requests = new Map(),
    downloads = new Map();
  const options = () => {
    budget.assertRemaining('stage reuse lookup');
    const ms = Math.floor(Math.min(stop - now(), budget.remainingMs()));
    if (!(ms > 0)) throw Object.assign(new Error('Evidence lookup exhausted'), { code: 'CI_LOOKUP_EXHAUSTED' });
    return { budget, signal: budget.signal(ms), timeoutMs: ms, timeout: ms };
  };
  const query = async (endpoint) => {
    options();
    if (!requests.has(endpoint))
      requests.set(
        endpoint,
        Promise.resolve().then(() => api(endpoint, options())),
      );
    const result = await requests.get(endpoint);
    options();
    return result;
  };
  const read = async (artifact) => {
    options();
    if (!downloads.has(artifact.id))
      downloads.set(
        artifact.id,
        Promise.resolve().then(() => download(artifact, options())),
      );
    const result = await downloads.get(artifact.id);
    options();
    return result;
  };
  const load = async (artifact, needed, historicalBuild = false) => {
    const reject = (reason) => {
      reasons.push({ stage_id: needed.stage_id, artifact_id: artifact?.id ?? null, reason });
      return null;
    };
    if (
      !positive(artifact?.workflow_run?.id) ||
      artifact.workflow_run.id === current.run_id ||
      artifact.expired !== false ||
      !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes <= 0 ||
      artifact.size_in_bytes > ARTIFACT_LIMIT ||
      !/^sha256:[0-9a-f]{64}$/.test(artifact.digest ?? '')
    )
      return reject('artifact-unavailable-or-invalid');
    const prefix = 'repos/' + current.repository + '/actions/runs/' + artifact.workflow_run.id;
    const run = await query(prefix);
    if (!trustedRun(run, current, 'reuse')) return reject('untrusted-run');
    const downloaded = await read(artifact);
    if (!object(downloaded) || !SHA.test(downloaded.receipt?.tested_commit ?? '')) return reject('malformed-download');
    const [jobData, commit] = await Promise.all([
      query(prefix + '/attempts/' + run.run_attempt + '/jobs?per_page=100'),
      query('repos/' + current.repository + '/git/commits/' + downloaded.receipt.tested_commit),
    ]);
    if (jobData?.total_count > 100) return reject('source-jobs-truncated');
    await noteAdvancedBase(commit, downloaded.receipt?.event, current.repository, query);
    const proof = { receipt: downloaded.receipt, archive_sha256: downloaded.archive_sha256, run, jobs: jobData?.jobs, artifact, commit };
    if (needed.stage_id.startsWith('browser-')) {
      const list = await query(prefix + '/artifacts?per_page=100');
      const buildArtifacts = (list.artifacts ?? []).filter((item) => item.name === stageArtifactName(current.tree, 'build') && !item.expired);
      for (const candidate of buildArtifacts.sort((a, b) => b.id - a.id)) {
        const build = await load(
          candidate,
          {
            stage_id: 'build',
            job_name: 'build',
            reusable: false,
            selection: { checks: BUILD_CHECKS, files: [], cases: [] },
            toolchain_digest: needed.toolchain_digest,
          },
          true,
        );
        if (build && isDeepStrictEqual(build.receipt.source_build, proof.receipt.source_build)) {
          proof.source_build_proof = build;
          break;
        }
      }
    }
    const checked = validateProof({ ...proof, current, required: needed, mode: 'reuse', now }, historicalBuild);
    return checked.ok ? proof : reject(checked.reason);
  };
  for (const needed of wanted) {
    if (
      !needed.reusable ||
      CURRENT_ONLY.has(needed.stage_id) ||
      current.reuse_disabled ||
      current.force_full ||
      current.event.name === 'schedule' ||
      current.event.head_repository !== current.repository
    )
      continue;
    try {
      const name = stageArtifactName(current.tree, needed.stage_id);
      const list = await query('repos/' + current.repository + '/actions/artifacts?name=' + encodeURIComponent(name) + '&per_page=100');
      const candidates = (list.artifacts ?? []).filter((item) => item.name === name);
      for (const artifact of candidates.sort((a, b) => b.id - a.id)) {
        try {
          const proof = await load(artifact, needed);
          if (proof) {
            options();
            reused[needed.stage_id] = proof;
            break;
          }
        } catch (error) {
          if (['CI_DEADLINE_EXCEEDED', 'CI_LOOKUP_EXHAUSTED'].includes(error.code)) throw error;
          reasons.push({ stage_id: needed.stage_id, artifact_id: artifact.id, reason: error.code ?? 'artifact-fetch-or-parse-failed' });
        }
      }
    } catch (error) {
      if (error.code === 'CI_DEADLINE_EXCEEDED') throw error;
      reasons.push({ stage_id: needed.stage_id, reason: error.code ?? 'evidence-unavailable' });
    }
  }
  budget.assertRemaining('stage reuse lookup complete');
  return { reused, missing: wanted.filter((entry) => !reused[entry.stage_id]).map((entry) => entry.stage_id), reasons };
}

/** Every required phase has an executed, successful original proof. No dist mutation is performed. */
export function aggregateStageEvidence({ current, requirements, proofs, snapshot, browserManifest, now = Date.now }) {
  const time = nowValue(now);
  validateCurrent(current, time);
  const wanted = requirements.map(requirement),
    ids = wanted.map((entry) => entry.stage_id);
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes('static') ||
    !ids.includes('build') ||
    (current.event.name !== 'pull_request' && !ids.includes('static-main'))
  )
    throw new Error('Missing or duplicate mandatory phases');
  if (!object(proofs) || Object.keys(proofs).length !== ids.length || Object.keys(proofs).some((id) => !ids.includes(id)))
    throw new Error('Missing or unexpected phase proofs');
  const actualSnapshot = snapshotIdentity(snapshot);
  if (
    actualSnapshot.commit !== current.commit ||
    actualSnapshot.tree !== current.tree ||
    actualSnapshot.run_id !== current.run_id ||
    actualSnapshot.run_attempt !== current.run_attempt
  )
    throw new Error('Wrong current snapshot');
  const browsers = wanted.filter((entry) => entry.stage_id.startsWith('browser-'));
  if (!browsers.length || browsers.length > 4 || !browsers.every((_entry, index) => ids.includes('browser-' + (index + 1))))
    throw new Error('Missing planned browser shards');
  if ((current.force_full || current.event.name === 'schedule') && browsers.length !== 4) throw new Error('Full browser validation needs four shards');
  const allCases = browsers.flatMap((entry) => entry.selection.cases);
  if (!allCases.length || new Set(allCases.map((entry) => entry.id)).size !== allCases.length) throw new Error('Duplicate or empty browser case union');
  if (browserManifest) {
    const expected = canonicalSelection({ cases: browserManifest.allCases, files: [], checks: [] }).cases;
    if (!isDeepStrictEqual(canonicalSelection({ cases: allCases }).cases, expected)) throw new Error('Browser manifest case union mismatch');
    if (browserManifest.shards?.length !== undefined && browserManifest.shards.length !== browsers.length) throw new Error('Browser shard count mismatch');
    if (browserManifest.shards)
      for (const browser of browsers) {
        const index = Number(browser.stage_id.slice('browser-'.length));
        const shard = browserManifest.shards[index - 1];
        if (!shard || shard.index !== index || !isDeepStrictEqual(canonicalSelection({ cases: shard.cases }).cases, browser.selection.cases))
          throw new Error('Browser planned shard selection mismatch');
      }
  }
  const stages = wanted.map((needed) => {
    const proof = proofs[needed.stage_id];
    const mode = proof?.run?.id === current.run_id ? 'current' : 'reuse';
    const result = validateStageEvidence({ ...proof, current, required: needed, mode, now: time });
    if (!result.ok) throw new Error(needed.stage_id + ': ' + result.reason);
    if (
      (needed.stage_id === 'build' || (needed.stage_id.startsWith('browser-') && mode === 'current')) &&
      !isDeepStrictEqual(proof.receipt.source_build, actualSnapshot)
    )
      throw new Error('Current phase used a different snapshot');
    return {
      stage_id: needed.stage_id,
      requested_selection_digest: selectionDigest(needed.selection),
      source_selection_digest: proof.receipt.selection_digest,
      executed: mode === 'current',
      source: {
        run_id: proof.run.id,
        run_attempt: proof.run.run_attempt,
        job_id: proof.receipt.job_id,
        artifact_id: proof.artifact.id,
        artifact_digest: proof.artifact.digest,
        tested_commit: proof.receipt.tested_commit,
        tested_tree: proof.receipt.tested_tree,
      },
    };
  });
  validateCurrent(current, nowValue(now));
  return {
    version: 2,
    repository: current.repository,
    repository_id: current.repository_id,
    run_id: current.run_id,
    run_attempt: current.run_attempt,
    tested_commit: current.commit,
    tested_tree: current.tree,
    policy_digest: current.policy_digest,
    epoch: structuredClone(current.epoch),
    issued_at: new Date(time).toISOString(),
    gate_ref: actualSnapshot.gate_ref,
    snapshot: actualSnapshot,
    required_stage_ids: ids,
    requirements_digest: digest(wanted),
    stages,
  };
}
