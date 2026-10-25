import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^v\d+\.\d+\.\d+$/;

function requireSha(value, label) {
  if (typeof value !== 'string' || value.length !== 40 || !shaPattern.test(value)) throw new Error(`${label} must be a full commit SHA`);
}

const validVersion = (value) => typeof value === 'string' && value === value.trim() && versionPattern.test(value);

export function releaseVersionForSource(packageVersion, requestedVersion = null) {
  const version = `v${packageVersion}`;
  if (!validVersion(version)) throw new Error('Deployed package version must have three numeric parts');
  if (requestedVersion !== null && requestedVersion !== version) throw new Error('Manual version does not match the deployed main package');
  return version;
}

/** Direct-main releases and optional integrated release branches share the same guards. */
export function releaseReference(branchSha, deployedSha) {
  requireSha(deployedSha, 'Deployed main');
  const selected = branchSha ?? deployedSha;
  requireSha(selected, 'Release source');
  return selected;
}

/** Only a successful push deployment from this repository's main can start an automatic release. */
export function releaseSource({ eventName, event, repository, ref, sha }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || event?.repository?.full_name !== repository || ref !== 'refs/heads/main')
    throw new Error('Release must originate from this repository on main');
  if (eventName === 'workflow_dispatch') {
    requireSha(sha, 'Manual source');
    const version = event.inputs?.version;
    if (!validVersion(version)) throw new Error('Manual version must be vX.Y.Z');
    return { automatic: false, deployedSha: sha, runId: null, requestedVersion: version };
  }
  const run = event.workflow_run;
  if (
    eventName !== 'workflow_run' ||
    run?.name !== 'CI / Deploy' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.event !== 'push' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.head_branch !== 'main' ||
    run.head_repository?.full_name !== repository ||
    !Number.isSafeInteger(run.id) ||
    run.id <= 0
  )
    throw new Error('Automatic release requires a trusted successful main push CI run');
  requireSha(run.head_sha, 'CI source');
  return { automatic: true, deployedSha: run.head_sha, runId: run.id, requestedVersion: null };
}

export function validateSuccessfulDeployment(run, jobs, { repository, sha }) {
  const source = releaseSource({
    eventName: 'workflow_run',
    event: { repository: { full_name: repository }, workflow_run: run },
    repository,
    ref: 'refs/heads/main',
  });
  if (source.deployedSha !== sha) throw new Error('CI run does not cover the deployed source');
  for (const name of ['test', 'deploy']) {
    const matching = jobs.filter((job) => job.name === name);
    if (!matching.length || matching.some((job) => job.status !== 'completed' || job.conclusion !== 'success'))
      throw new Error(`Required ${name} job did not succeed`);
  }
}

/** No release is written for an older deployment or a version that is already published. */
export function decideRelease({ automatic, version, deployedSha, mainSha, releaseSha, releaseIsAncestor, release }) {
  if (!validVersion(version)) throw new Error('Release version must be vX.Y.Z');
  requireSha(deployedSha, 'Deployed main');
  requireSha(mainSha, 'Current main');
  if (mainSha !== deployedSha) {
    if (automatic) return { version, shouldRelease: false, reason: 'A newer main commit superseded this deployment' };
    throw new Error('Main changed after dispatch; retry from its successful deployment');
  }
  requireSha(releaseSha, 'Release branch');
  if (!releaseIsAncestor) throw new Error('Release branch is not contained in the deployed main commit');
  if (release && release.tag_name !== version) throw new Error('Release tag does not match the requested version');
  if (automatic && release?.draft === false && typeof release.published_at === 'string' && release.published_at)
    return { version, shouldRelease: false, reason: 'This version is already published' };
  return { version, shouldRelease: true, reason: release ? 'Resume the existing release' : 'Prepare a new release' };
}

/** The runner can push the version tag, but can never perform release.mjs's first merge into main. */
export function releaseGitCommandAllowed(args, version) {
  if (!args.includes('push')) return true;
  return args.length === 4 && args[0] === 'push' && args[1] === '-q' && args[2] === 'origin' && args[3] === `refs/tags/${version}`;
}

function api(endpoint, { missing = false, paginate = false } = {}) {
  const args = ['api', endpoint];
  if (paginate) args.push('--paginate', '--slurp');
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (missing && /\(HTTP 404\)/.test(result.stderr ?? '')) return null;
    throw new Error(`GitHub API failed for ${endpoint}: ${(result.stderr ?? '').trim()}`);
  }
  return JSON.parse(result.stdout);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function output(values) {
  for (const [key, value] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function installGitGuard(version) {
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'release-git-'));
  const wrapper = join(directory, 'git');
  writeFileSync(
    wrapper,
    `#!/usr/bin/env node\nconst { spawnSync } = require('node:child_process');\nconst allowed = ${releaseGitCommandAllowed.toString()};\n` +
      `if (!allowed(process.argv.slice(2), ${JSON.stringify(version)})) { console.error('Release runner may only push its version tag; merge main before deployment.'); process.exit(1); }\n` +
      `const result = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' });\nprocess.exit(result.status ?? 1);\n`,
  );
  chmodSync(wrapper, 0o755);
  appendFileSync(process.env.GITHUB_PATH, directory + '\n');
}

function main() {
  const source = releaseSource({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
  });
  const repository = process.env.GITHUB_REPOSITORY;
  const packageVersion = JSON.parse(git('show', `${source.deployedSha}:package.json`)).version;
  const version = releaseVersionForSource(packageVersion, source.requestedVersion);
  const mainSha = api(`repos/${repository}/git/ref/heads/main`).object.sha;
  // Ordinary approved changes deploy directly from main; a release branch is optional.
  const releaseSha = releaseReference(api(`repos/${repository}/git/ref/heads/release/${version}`, { missing: true })?.object.sha, source.deployedSha);
  if (process.env.EXPECTED_DEPLOYED_SHA && mainSha !== process.env.EXPECTED_DEPLOYED_SHA) throw new Error('Main moved after release preparation');
  if (process.env.EXPECTED_RELEASE_SHA && releaseSha !== process.env.EXPECTED_RELEASE_SHA) throw new Error('Release branch moved after preparation');
  if (mainSha !== source.deployedSha) {
    const stale = decideRelease({ ...source, version, mainSha, releaseSha });
    console.log(`${version}: ${stale.reason}`);
    output({ version, should_release: false, deployed_sha: source.deployedSha, release_sha: releaseSha ?? '' });
    return;
  }
  const ancestry = releaseSha ? spawnSync('git', ['merge-base', '--is-ancestor', releaseSha, source.deployedSha]) : null;
  if (ancestry && ancestry.status !== 0 && ancestry.status !== 1) throw new Error('Unable to verify release ancestry in the checked-out history');
  const release = api(`repos/${repository}/releases/tags/${version}`, { missing: true });
  const decision = decideRelease({ ...source, version, mainSha, releaseSha, releaseIsAncestor: ancestry?.status === 0, release });
  console.log(`${version}: ${decision.reason}`);
  if (!decision.shouldRelease) {
    output({ version, should_release: false, deployed_sha: source.deployedSha, release_sha: releaseSha ?? '' });
    return;
  }

  const releaseVersion = JSON.parse(git('show', `${releaseSha}:package.json`)).version;
  if (`v${releaseVersion}` !== version) throw new Error('Release branch package version does not match');
  let run;
  if (source.automatic) run = api(`repos/${repository}/actions/runs/${source.runId}`);
  else {
    const pages = api(`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=${source.deployedSha}&per_page=100`, {
      paginate: true,
    });
    run = pages.flatMap((page) => page.workflow_runs).find((candidate) => candidate.head_sha === source.deployedSha);
    if (!run) throw new Error('Manual release requires a successful push CI deployment for this main commit');
  }
  const pages = api(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`, { paginate: true });
  validateSuccessfulDeployment(
    run,
    pages.flatMap((page) => page.jobs),
    { repository, sha: source.deployedSha },
  );
  if (process.argv.includes('--guard-git')) installGitGuard(version);
  output({ version, should_release: true, deployed_sha: source.deployedSha, release_sha: releaseSha, ci_run_id: run.id });
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
