/** Reuse successful validation of the exact Git tree, while keeping each deployment's build SHA real. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
export const EVIDENCE_ARTIFACT = 'ci-validation-evidence';
export const POLICY_FILES = [
  '.github/workflows/ci.yml',
  'scripts/ci-evidence.mjs',
  'scripts/ci-scope.mjs',
  'scripts/ci-run.mjs',
  'scripts/site-artifact.mjs',
  'scripts/deployment-smoke.mjs',
  'scripts/historical-ui.mjs',
  'playwright.config.ts',
  'package-lock.json',
];

export function policyDigest(read = (path) => readFileSync(path)) {
  const entries = POLICY_FILES.map((path) => {
    try {
      return [path, createHash('sha256').update(read(path)).digest('hex')];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [path, null];
    }
  });
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

function normalizePlan(plan) {
  if (!plan || !['maintenance', 'civ-ui', 'targeted', 'full'].includes(plan.scope) || typeof plan.full !== 'boolean' || typeof plan.data !== 'boolean')
    return null;
  if ((plan.scope === 'full') !== plan.full) return null;
  if (plan.data && !plan.full) return null;
  const list = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length < 300);
  if (!['features', 'unit', 'e2e'].every((key) => list(plan[key]))) return null;
  return Object.fromEntries([
    ['scope', plan.scope],
    ['full', plan.full],
    ['data', plan.data],
    ...['features', 'unit', 'e2e'].map((key) => [key, [...new Set(plan[key])].sort()]),
  ]);
}

function containsPattern(patterns, requested) {
  if (patterns.includes(requested)) return true;
  if (requested.includes('*')) return false;
  return patterns.some((pattern) =>
    new RegExp(
      '^' +
        pattern
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*') +
        '$',
    ).test(requested),
  );
}

export function planCovers(available, required) {
  const a = normalizePlan(available),
    b = normalizePlan(required);
  if (!a || !b || (b.data && !a.data)) return false;
  if (a.full) return true;
  if (b.full) return false;
  return (
    b.features.every((feature) => a.features.includes(feature)) &&
    b.unit.every((path) => containsPattern(a.unit, path)) &&
    b.e2e.every((path) => containsPattern(a.e2e, path))
  );
}

function trustedRun(run, repository) {
  return (
    run &&
    positive(run.id) &&
    positive(run.run_attempt) &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.name === 'CI / Deploy' &&
    run.path === '.github/workflows/ci.yml' &&
    ['push', 'pull_request', 'schedule', 'workflow_dispatch'].includes(run.event) &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    positive(run.repository.id) &&
    run.head_repository.id === run.repository.id &&
    SHA.test(run.head_sha)
  );
}

/** Pure boundary: the manifest is useful only together with GitHub-owned run, job, artifact and Git metadata. */
export function validateEvidence({ manifest, run, jobs, artifact, commit, current }) {
  const reject = (reason) => ({ ok: false, reason });
  if (
    !current ||
    !repositoryPattern.test(current.repository ?? '') ||
    !SHA.test(current.tree ?? '') ||
    !DIGEST.test(current.policy ?? '') ||
    !normalizePlan(current.plan)
  )
    return reject('invalid-current-context');
  if (!trustedRun(run, current.repository)) return reject('untrusted-run');
  const tests = Array.isArray(jobs) ? jobs.filter((job) => job.name === 'test') : null;
  if (!tests?.length || tests.some((job) => job.status !== 'completed' || job.conclusion !== 'success')) return reject('test-did-not-succeed');
  if (
    !artifact ||
    artifact.name !== EVIDENCE_ARTIFACT ||
    artifact.expired !== false ||
    !positive(artifact.id) ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run?.head_sha !== run.head_sha ||
    artifact.workflow_run?.repository_id !== run.repository.id ||
    artifact.workflow_run?.head_repository_id !== run.repository.id ||
    !(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 1_048_576)
  )
    return reject('artifact-does-not-belong-to-run');
  const created = Date.parse(artifact.created_at),
    started = Date.parse(run.run_started_at);
  if (!Number.isFinite(created) || !Number.isFinite(started) || created < started) return reject('artifact-from-another-attempt');
  if (
    !manifest ||
    manifest.version !== 1 ||
    manifest.repository !== current.repository ||
    manifest.run_id !== run.id ||
    manifest.run_attempt !== run.run_attempt ||
    !SHA.test(manifest.tested_commit ?? '') ||
    manifest.tested_tree !== current.tree ||
    manifest.policy_digest !== current.policy ||
    !positive(manifest.source_run_id) ||
    !positive(manifest.source_run_attempt)
  )
    return reject('manifest-mismatch');
  if (
    typeof manifest.executed !== 'boolean' ||
    (manifest.source_run_id === run.id) !== manifest.executed ||
    (manifest.executed && manifest.source_run_attempt !== run.run_attempt)
  )
    return reject('invalid-validation-source');
  if (manifest.event?.name !== run.event || manifest.event?.head_repository !== current.repository || manifest.event?.sha !== manifest.tested_commit)
    return reject('event-mismatch');
  if (!commit || commit.sha !== manifest.tested_commit || commit.tree?.sha !== current.tree) return reject('tested-tree-not-proven');
  if (run.event === 'pull_request') {
    if (manifest.event.head_sha !== run.head_sha || !SHA.test(manifest.event.base_sha ?? '')) return reject('pr-head-mismatch');
    const parents = Array.isArray(commit.parents) ? commit.parents.map((parent) => parent.sha) : null;
    if (manifest.tested_commit !== run.head_sha && !(parents?.length === 2 && parents[0] === manifest.event.base_sha && parents[1] === run.head_sha))
      return reject('pr-merge-not-proven');
  } else if (manifest.tested_commit !== run.head_sha) return reject('checkout-does-not-match-run');
  if (!planCovers(manifest.plan, current.plan)) return reject('validation-range-not-covered');
  return { ok: true };
}

/** At most two records: a reused build points directly at the original execution, never at an arbitrary chain. */
export async function findReusableEvidence({ runs, current, api, download }) {
  const load = async (run) => {
    if (!trustedRun(run, current.repository) || run.id === current.run_id) return null;
    const prefix = `repos/${current.repository}/actions/runs/${run.id}`;
    const artifacts = (await api(`${prefix}/artifacts?per_page=100`)).artifacts ?? [];
    const matching = artifacts.filter((item) => item.name === EVIDENCE_ARTIFACT && !item.expired);
    if (!matching.length) return null;
    const jobs = (await api(`${prefix}/attempts/${run.run_attempt}/jobs?per_page=100`)).jobs;
    if (!jobs?.some((job) => job.name === 'test' && job.status === 'completed' && job.conclusion === 'success')) return null;
    for (const artifact of matching.sort((a, b) => b.id - a.id)) {
      try {
        const manifest = await download(artifact);
        if (!SHA.test(manifest?.tested_commit ?? '')) continue;
        const commit = await api(`repos/${current.repository}/git/commits/${manifest.tested_commit}`);
        if (validateEvidence({ manifest, run, jobs, artifact, commit, current }).ok) return manifest;
      } catch {
        // Missing or malformed evidence means current relevant validation, not a fabricated green result.
      }
    }
    return null;
  };
  for (const run of runs) {
    try {
      const manifest = await load(run);
      if (!manifest) continue;
      if (manifest.executed) return { run_id: run.id, source_run_id: run.id, source_run_attempt: run.run_attempt, plan: normalizePlan(manifest.plan) };
      if (manifest.source_run_id === current.run_id) continue;
      const sourceRun = await api(`repos/${current.repository}/actions/runs/${manifest.source_run_id}`);
      const source = await load(sourceRun);
      if (
        !source?.executed ||
        source.source_run_id !== source.run_id ||
        source.run_attempt !== manifest.source_run_attempt ||
        !isDeepStrictEqual(normalizePlan(source.plan), normalizePlan(manifest.plan))
      )
        continue;
      return { run_id: run.id, source_run_id: source.run_id, source_run_attempt: source.run_attempt, plan: normalizePlan(source.plan) };
    } catch {
      // Another successful candidate may still be available; otherwise the caller runs its own plan.
    }
  }
  return null;
}

export function createEvidence(current, event, reuse = null) {
  if (
    !positive(current.run_id) ||
    !positive(current.run_attempt) ||
    !SHA.test(current.commit) ||
    !SHA.test(current.tree) ||
    !DIGEST.test(current.policy) ||
    !repositoryPattern.test(current.repository) ||
    !normalizePlan(current.plan)
  )
    throw new Error('Invalid CI context');
  if (
    reuse &&
    (!positive(reuse.run_id) ||
      !positive(reuse.source_run_id) ||
      !positive(reuse.source_run_attempt) ||
      reuse.run_id === current.run_id ||
      reuse.source_run_id === current.run_id ||
      !planCovers(reuse.plan, current.plan))
  )
    throw new Error('Invalid reused validation');
  return {
    version: 1,
    repository: current.repository,
    run_id: current.run_id,
    run_attempt: current.run_attempt,
    tested_commit: current.commit,
    tested_tree: current.tree,
    policy_digest: current.policy,
    event,
    plan: normalizePlan(reuse?.plan ?? current.plan),
    requested_plan: normalizePlan(current.plan),
    source_run_id: reuse?.source_run_id ?? current.run_id,
    source_run_attempt: reuse?.source_run_attempt ?? current.run_attempt,
    reused_from_run_id: reuse?.run_id ?? null,
    executed: !reuse,
  };
}

function ghApi(endpoint) {
  try {
    return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4_194_304 }));
  } catch {
    throw new Error('GitHub evidence API unavailable');
  }
}

function downloadEvidence(repository, artifact) {
  if (!positive(artifact.id) || !(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 1_048_576)) throw new Error('Invalid evidence artifact');
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'ci-evidence-'));
  try {
    const archive = join(directory, 'evidence.zip');
    writeFileSync(
      archive,
      execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 2_097_152,
      }),
    );
    return JSON.parse(
      execFileSync('unzip', ['-p', archive, 'ci-evidence.json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1_048_576,
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function output(values) {
  for (const [key, value] of Object.entries(values)) if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main() {
  const mode = process.argv[2];
  if (!['--find', '--record'].includes(mode)) throw new Error('Use --find or --record');
  const directory = process.env.RUNNER_TEMP || '.';
  const reusePath = join(directory, 'ci-reuse.json');
  if (mode === '--find') rmSync(reusePath, { force: true });
  if (mode === '--find' && (process.env.CI_FULL === 'true' || process.env.GITHUB_EVENT_NAME === 'schedule')) {
    output({ reused: false, reuse_run_id: '' });
    console.log('Validation reuse disabled for an explicitly full regression');
    return;
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  let current, event;
  try {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    current = {
      repository: process.env.GITHUB_REPOSITORY,
      run_id: Number(process.env.GITHUB_RUN_ID),
      run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      commit: git('rev-parse', 'HEAD'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      policy: policyDigest(),
      plan: JSON.parse(readFileSync(join(directory, 'ci-plan.json'), 'utf8')),
    };
    event = {
      name: process.env.GITHUB_EVENT_NAME,
      sha: process.env.GITHUB_SHA,
      head_repository: payload.pull_request?.head?.repo?.full_name ?? payload.repository?.full_name,
      ...(payload.pull_request ? { base_sha: payload.pull_request.base.sha, head_sha: payload.pull_request.head.sha } : {}),
    };
    const pullRequest = event.name === 'pull_request';
    const sourceValid = pullRequest
      ? payload.pull_request?.base?.repo?.full_name === current.repository &&
        repositoryPattern.test(event.head_repository ?? '') &&
        SHA.test(event.base_sha ?? '') &&
        SHA.test(event.head_sha ?? '')
      : !payload.pull_request && event.head_repository === current.repository;
    if (
      !positive(current.run_id) ||
      !positive(current.run_attempt) ||
      !repositoryPattern.test(current.repository) ||
      payload.repository?.full_name !== current.repository ||
      !normalizePlan(current.plan) ||
      event.sha !== current.commit ||
      !sourceValid
    )
      throw new Error('Invalid CI context');
  } catch {
    if (mode === '--record') throw new Error('Cannot record validation without a valid CI context');
    output({ reused: false, reuse_run_id: '' });
    console.log('No reusable CI context; running the current validation plan');
    return;
  }
  if (mode === '--find') {
    if (event.head_repository !== current.repository) {
      output({ reused: false, reuse_run_id: '' });
      console.log('Fork pull requests run their own validation; their evidence is not reused');
      return;
    }
    let reuse = null;
    try {
      const runs = ghApi(`repos/${current.repository}/actions/workflows/ci.yml/runs?status=success&per_page=30`).workflow_runs;
      reuse = await findReusableEvidence({ runs, current, api: ghApi, download: (artifact) => downloadEvidence(current.repository, artifact) });
    } catch {
      // API/retention failures affect only reuse; they never bypass current checks.
    }
    if (reuse) writeFileSync(reusePath, JSON.stringify({ ...reuse, current_run_id: current.run_id, tree: current.tree, policy: current.policy }) + '\n');
    output({ reused: !!reuse, reuse_run_id: reuse?.run_id ?? '' });
    console.log(
      reuse
        ? `Reusing validation from run ${reuse.source_run_id} for Git tree ${current.tree}`
        : 'No matching successful evidence; running the current validation plan',
    );
  } else {
    let reuse = null;
    if (existsSync(reusePath)) {
      reuse = JSON.parse(readFileSync(reusePath, 'utf8'));
      if (reuse.current_run_id !== current.run_id || reuse.tree !== current.tree || reuse.policy !== current.policy) throw new Error('Stale reuse evidence');
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'ci-evidence.json'), JSON.stringify(createEvidence(current, event, reuse)) + '\n');
    console.log(reuse ? `Recorded inherited validation from run ${reuse.source_run_id}; tests were not repeated` : 'Recorded validation executed by this run');
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
