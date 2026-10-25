import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs have no type declarations
import { createEvidence, EVIDENCE_ARTIFACT, findReusableEvidence, planCovers, policyDigest, validateEvidence } from '../../scripts/ci-evidence.mjs';

const repository = 'linhongcun/aoe2-analyzer';
const hash = (letter: string) => letter.repeat(40);
const targeted = {
  scope: 'targeted',
  full: false,
  data: false,
  features: ['matchup'],
  unit: ['tests/unit/simulator.test.ts'],
  e2e: ['tests/e2e/matchupSim424.spec.ts'],
};
const full = { scope: 'full', full: true, data: true, features: ['all'], unit: [], e2e: [] };

function fixture(id = 100, sha = hash('a')) {
  const current = { repository, run_id: 200, run_attempt: 1, commit: hash('b'), tree: hash('c'), policy: 'd'.repeat(64), plan: structuredClone(targeted) };
  const run = {
    id,
    run_attempt: 1,
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    head_branch: 'release/v0.34.1',
    repository: { id: 5, full_name: repository },
    head_repository: { id: 5, full_name: repository },
    run_started_at: '2026-10-25T12:00:00Z',
  };
  const event = { name: 'push', sha, head_repository: repository };
  const manifest = createEvidence({ ...current, run_id: id, commit: sha }, event);
  const artifact = {
    id: 1000 + id,
    name: EVIDENCE_ARTIFACT,
    expired: false,
    size_in_bytes: 1000,
    created_at: '2026-10-25T12:01:00Z',
    workflow_run: { id, head_sha: sha, repository_id: 5, head_repository_id: 5 },
  };
  const jobs = [{ name: 'test', status: 'completed', conclusion: 'success' }];
  const commit = { sha, tree: { sha: current.tree }, parents: [] as { sha: string }[] };
  return { current, run, manifest, artifact, jobs, commit };
}

function fakeServer(fixtures: ReturnType<typeof fixture>[]) {
  const calls: string[] = [];
  return {
    calls,
    async api(endpoint: string) {
      calls.push(endpoint);
      for (const f of fixtures) {
        const prefix = `repos/${repository}/actions/runs/${f.run.id}`;
        if (endpoint === prefix) return f.run;
        if (endpoint === `${prefix}/attempts/${f.run.run_attempt}/jobs?per_page=100`) return { jobs: f.jobs };
        if (endpoint === `${prefix}/artifacts?per_page=100`) return { artifacts: [f.artifact] };
        if (endpoint === `repos/${repository}/git/commits/${f.manifest.tested_commit}`) return f.commit;
      }
      throw new Error('Unknown API fixture');
    },
    async download(artifact: { id: number }) {
      const found = fixtures.find((f) => f.artifact.id === artifact.id);
      if (!found) throw new Error('Unknown artifact');
      return found.manifest;
    },
  };
}

describe('#431 exact tree evidence boundary', () => {
  it('accepts another successful commit with the identical tree and the required validation coverage', () => {
    const f = fixture();
    expect(f.current.commit).not.toBe(f.manifest.tested_commit);
    expect(validateEvidence(f)).toEqual({ ok: true });
  });

  it.each(['failure', 'cancelled', 'skipped', 'neutral'])('rejects run conclusion %s', (conclusion) => {
    const f = fixture();
    f.run.conclusion = conclusion;
    expect(validateEvidence(f).ok).toBe(false);
  });

  it.each([
    [
      'different repository',
      (f: ReturnType<typeof fixture>) => {
        f.run.repository.full_name = 'other/site';
      },
    ],
    [
      'fork',
      (f: ReturnType<typeof fixture>) => {
        f.run.head_repository.full_name = 'fork/site';
      },
    ],
    [
      'different repository id',
      (f: ReturnType<typeof fixture>) => {
        f.run.head_repository.id = 6;
      },
    ],
    [
      'different workflow',
      (f: ReturnType<typeof fixture>) => {
        f.run.path = '.github/workflows/other.yml';
      },
    ],
    [
      'same name but other workflow name',
      (f: ReturnType<typeof fixture>) => {
        f.run.name = 'Other';
      },
    ],
    [
      'unapproved event',
      (f: ReturnType<typeof fixture>) => {
        f.run.event = 'pull_request_target';
      },
    ],
    [
      'pending run',
      (f: ReturnType<typeof fixture>) => {
        f.run.status = 'in_progress';
      },
    ],
    [
      'failed test job',
      (f: ReturnType<typeof fixture>) => {
        f.jobs[0]!.conclusion = 'failure';
      },
    ],
    [
      'missing test',
      (f: ReturnType<typeof fixture>) => {
        f.jobs.length = 0;
      },
    ],
    [
      'artifact other run',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.workflow_run.id = 99;
      },
    ],
    [
      'artifact other repo',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.workflow_run.repository_id = 6;
      },
    ],
    [
      'artifact other head',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.workflow_run.head_sha = hash('f');
      },
    ],
    [
      'expired artifact',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.expired = true;
      },
    ],
    [
      'other artifact name',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.name = 'other';
      },
    ],
    [
      'oversized evidence',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.size_in_bytes = 2_000_000;
      },
    ],
    [
      'prior attempt artifact',
      (f: ReturnType<typeof fixture>) => {
        f.artifact.created_at = '2026-10-25T11:59:00Z';
      },
    ],
    [
      'forged run id',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.run_id = 99;
      },
    ],
    [
      'old attempt',
      (f: ReturnType<typeof fixture>) => {
        f.run.run_attempt = 2;
      },
    ],
    [
      'changed tree',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.tested_tree = hash('f');
      },
    ],
    [
      'changed policy',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.policy_digest = 'f'.repeat(64);
      },
    ],
    [
      'unproven remote tree',
      (f: ReturnType<typeof fixture>) => {
        f.commit.tree.sha = hash('f');
      },
    ],
    [
      'unproven checkout commit',
      (f: ReturnType<typeof fixture>) => {
        f.commit.sha = hash('f');
      },
    ],
    [
      'event checkout mismatch',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.event.sha = hash('f');
      },
    ],
    [
      'event repo mismatch',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.event.head_repository = 'fork/site';
      },
    ],
    [
      'claimed extra coverage',
      (f: ReturnType<typeof fixture>) => {
        f.current.plan.features = ['matchup', 'patches'];
      },
    ],
    [
      'cycle to self',
      (f: ReturnType<typeof fixture>) => {
        f.manifest.executed = false;
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const f = fixture();
    mutate(f);
    expect(validateEvidence(f).ok).toBe(false);
  });

  it('requires every matching test attempt job to succeed', () => {
    const f = fixture();
    f.jobs.push({ name: 'test', status: 'completed', conclusion: 'cancelled' });
    expect(validateEvidence(f).ok).toBe(false);
  });

  it('distinguishes the PR head from its actual merge checkout, even when closed PR metadata is empty', () => {
    const f = fixture();
    f.run.event = 'pull_request';
    f.manifest.event = { name: 'pull_request', sha: hash('e'), head_repository: repository, base_sha: hash('f'), head_sha: f.run.head_sha };
    f.manifest.tested_commit = hash('e');
    f.commit = { sha: hash('e'), tree: { sha: f.current.tree }, parents: [{ sha: hash('f') }, { sha: f.run.head_sha }] };
    expect(validateEvidence(f)).toEqual({ ok: true });
    f.commit.parents[1]!.sha = hash('b');
    expect(validateEvidence(f).ok).toBe(false);
    f.commit.parents = [{ sha: f.run.head_sha }];
    expect(validateEvidence(f).ok).toBe(false);
  });
});

describe('#431 validation coverage and lineage', () => {
  it('full tests cover targeted tests, but unchanged data must not be claimed as regenerated', () => {
    expect(planCovers(full, targeted)).toBe(true);
    expect(planCovers({ ...full, data: false }, { ...targeted, data: true })).toBe(false);
    expect(planCovers({ ...full, data: false }, targeted)).toBe(true);
    expect(planCovers(targeted, full)).toBe(false);
    expect(planCovers({ ...targeted, unit: [] }, targeted)).toBe(false);
    expect(planCovers({ ...targeted, e2e: [] }, targeted)).toBe(false);
    expect(planCovers({ ...targeted, features: [] }, targeted)).toBe(false);
    expect(planCovers({ ...targeted, data: true }, targeted)).toBe(false);
  });

  it('supports explicit files covered by an already run release test glob without assuming arbitrary glob inclusion', () => {
    const available = { ...targeted, unit: ['tests/unit/release*.test.ts'] };
    expect(planCovers(available, { ...targeted, unit: ['tests/unit/releaseAuto.test.ts'] })).toBe(true);
    expect(planCovers(available, { ...targeted, unit: ['tests/unit/release*/other.test.ts'] })).toBe(false);
    expect(planCovers(available, { ...targeted, unit: ['tests/unit/*.test.ts'] })).toBe(false);
  });

  it('finds a trusted execution and skips corrupt or failed candidates', async () => {
    const good = fixture(90, hash('e')),
      bad = fixture();
    bad.run.conclusion = 'cancelled';
    const server = fakeServer([good, bad]);
    expect(await findReusableEvidence({ runs: [bad.run, good.run], current: good.current, ...server })).toMatchObject({ run_id: 90, source_run_id: 90 });
    const broken = {
      ...server,
      download: async () => {
        throw new Error('invalid zip');
      },
    };
    expect(await findReusableEvidence({ runs: [good.run], current: good.current, ...broken })).toBeNull();
    expect(
      await findReusableEvidence({
        runs: [good.run],
        current: good.current,
        ...server,
        api: async () => {
          throw new Error('API unavailable');
        },
      }),
    ).toBeNull();
  });

  it('inherits the original executed plan and validates the source run instead of growing a reuse chain', async () => {
    const original = fixture(90, hash('e')),
      reused = fixture();
    const inherited = { run_id: original.run.id, source_run_id: original.run.id, source_run_attempt: 1, plan: targeted };
    reused.manifest = createEvidence({ ...reused.current, commit: reused.run.head_sha, run_id: reused.run.id }, reused.manifest.event, inherited);
    const server = fakeServer([reused, original]);
    const result = await findReusableEvidence({ runs: [reused.run], current: reused.current, ...server });
    expect(result).toMatchObject({ run_id: 100, source_run_id: 90, source_run_attempt: 1, plan: targeted });
    const next = createEvidence(reused.current, { ...reused.manifest.event, sha: reused.current.commit }, result);
    expect(next).toMatchObject({ run_id: 200, source_run_id: 90, source_run_attempt: 1, reused_from_run_id: 100, executed: false, plan: targeted });
    expect(server.calls.filter((path) => /\/actions\/runs\/90$/.test(path))).toHaveLength(1);
    original.run.conclusion = 'failure';
    expect(await findReusableEvidence({ runs: [reused.run], current: reused.current, ...fakeServer([reused, original]) })).toBeNull();
  });

  it('rejects source attempt replacement and cycles without recursively trusting another reused source', async () => {
    const original = fixture(90, hash('e')),
      reused = fixture();
    reused.manifest = createEvidence({ ...reused.current, commit: reused.run.head_sha, run_id: reused.run.id }, reused.manifest.event, {
      run_id: 90,
      source_run_id: 90,
      source_run_attempt: 1,
      plan: targeted,
    });
    original.run.run_attempt = 2;
    expect(await findReusableEvidence({ runs: [reused.run], current: reused.current, ...fakeServer([reused, original]) })).toBeNull();
    original.run.run_attempt = 1;
    original.manifest.source_run_id = 100;
    original.manifest.executed = false;
    expect(await findReusableEvidence({ runs: [reused.run], current: reused.current, ...fakeServer([reused, original]) })).toBeNull();
    expect(() => createEvidence(reused.current, reused.manifest.event, { run_id: 100, source_run_id: 200, source_run_attempt: 1, plan: targeted })).toThrow();
  });

  it('policy and dependency-lock bytes participate in the fingerprint, including explicit missing-file markers', () => {
    const read = (path: string) => path + ':original';
    const before = policyDigest(read);
    expect(policyDigest(read)).toBe(before);
    for (const changed of ['package-lock.json', 'scripts/ci-scope.mjs', 'scripts/site-artifact.mjs', 'scripts/deployment-smoke.mjs']) {
      expect(policyDigest((path: string) => read(path) + (path === changed ? ':changed' : ''))).not.toBe(before);
    }
    expect(
      policyDigest((path: string) => {
        if (path === 'scripts/ci-run.mjs') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return read(path);
      }),
    ).not.toBe(before);
  });
});

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it('#431 real Git commits prove equal trees across the tested PR merge and the publish merge', () => {
  const directory = mkdtempSync(join(tmpdir(), 'validation-tree-'));
  directories.push(directory);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    }).trim();
  git('init', '-q');
  git('commit', '--allow-empty', '-qm', 'base');
  const base = git('rev-parse', 'HEAD'),
    tree = git('rev-parse', 'HEAD^{tree}');
  const head = git('commit-tree', tree, '-p', base, '-m', 'PR head');
  const tested = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'GitHub PR merge');
  const published = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'Published merge');
  expect(tested).not.toBe(published);
  const f = fixture(100, head);
  f.current.commit = published;
  f.current.tree = tree;
  f.run.event = 'pull_request';
  f.manifest = createEvidence(
    { ...f.current, commit: tested, run_id: f.run.id },
    { name: 'pull_request', sha: tested, head_repository: repository, base_sha: base, head_sha: head },
  );
  f.commit = {
    sha: tested,
    tree: { sha: git('show', '-s', '--format=%T', tested) },
    parents: git('show', '-s', '--format=%P', tested)
      .split(' ')
      .map((sha) => ({ sha })),
  };
  expect(validateEvidence(f)).toEqual({ ok: true });
});

it('#431 scheduled and explicitly full validation cannot reuse prior results', () => {
  const directory = mkdtempSync(join(tmpdir(), 'validation-force-'));
  directories.push(directory);
  for (const extra of [
    { CI_FULL: 'true', GITHUB_EVENT_NAME: 'push' },
    { CI_FULL: 'false', GITHUB_EVENT_NAME: 'schedule' },
  ]) {
    const githubOutput = join(directory, 'outputs');
    writeFileSync(githubOutput, '');
    writeFileSync(join(directory, 'ci-reuse.json'), 'old reuse state');
    const output = execFileSync(process.execPath, ['scripts/ci-evidence.mjs', '--find'], {
      encoding: 'utf8',
      env: { ...process.env, ...extra, RUNNER_TEMP: directory, GITHUB_OUTPUT: githubOutput },
    });
    expect(output).toContain('reuse disabled');
    expect(readFileSync(githubOutput, 'utf8')).toContain('reused=false\n');
    expect(existsSync(join(directory, 'ci-reuse.json'))).toBe(false);
  }
});

function cliFixture(eventName: string, payload: unknown) {
  const directory = mkdtempSync(join(tmpdir(), 'validation-cli-'));
  directories.push(directory);
  const eventPath = join(directory, 'event.json'),
    outputPath = join(directory, 'outputs'),
    ghCalled = join(directory, 'gh-called');
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.CI_GH_CALLED, "called"); process.exit(17);\n', {
    mode: 0o755,
  });
  writeFileSync(eventPath, JSON.stringify(payload));
  writeFileSync(outputPath, '');
  writeFileSync(join(directory, 'ci-plan.json'), JSON.stringify(targeted));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const env = {
    ...process.env,
    CI_FULL: 'false',
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_SHA: commit,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: '300',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_OUTPUT: outputPath,
    RUNNER_TEMP: directory,
    PATH: bin + ':' + process.env.PATH,
    CI_GH_CALLED: ghCalled,
  };
  const run = (mode: string) => execFileSync(process.execPath, ['scripts/ci-evidence.mjs', mode], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  return { directory, outputPath, ghCalled, run };
}

it('#431 fork PR CLI runs its own checks and records them without making reusable evidence for main', () => {
  const f = cliFixture('pull_request', {
    repository: { full_name: repository },
    pull_request: {
      base: { sha: hash('f'), repo: { full_name: repository } },
      head: { sha: hash('a'), repo: { full_name: 'external/contribution' } },
    },
  });
  expect(f.run('--find')).toContain('Fork pull requests run their own validation');
  expect(readFileSync(f.outputPath, 'utf8')).toContain('reused=false\n');
  expect(existsSync(f.ghCalled)).toBe(false);
  expect(f.run('--record')).toContain('Recorded validation executed by this run');
  const recorded = JSON.parse(readFileSync(join(f.directory, 'ci-evidence.json'), 'utf8'));
  expect(recorded).toMatchObject({
    executed: true,
    run_id: 300,
    source_run_id: 300,
    event: { name: 'pull_request', head_repository: 'external/contribution' },
  });
  // Even if GitHub's run envelope names the base repo, the recorded fork source is not reusable.
  const candidate = fixture(300, recorded.event.head_sha);
  candidate.run.event = 'pull_request';
  candidate.current.tree = recorded.tested_tree;
  candidate.current.policy = recorded.policy_digest;
  candidate.manifest = recorded;
  candidate.commit = { sha: recorded.tested_commit, tree: { sha: recorded.tested_tree }, parents: [] };
  expect(validateEvidence(candidate)).toEqual({ ok: false, reason: 'event-mismatch' });
});

it.each(['push', 'schedule'])('#431 %s CLI does not accept a payload from another repository', (eventName) => {
  const f = cliFixture(eventName, { repository: { full_name: 'external/contribution' } });
  expect(() => f.run('--record')).toThrow();
  expect(existsSync(join(f.directory, 'ci-evidence.json'))).toBe(false);
});

it('#431 PR CLI cannot record a wrong base repository as a valid fork contribution', () => {
  const f = cliFixture('pull_request', {
    repository: { full_name: repository },
    pull_request: {
      base: { sha: hash('f'), repo: { full_name: 'external/target' } },
      head: { sha: hash('a'), repo: { full_name: 'external/contribution' } },
    },
  });
  expect(() => f.run('--record')).toThrow();
  expect(existsSync(join(f.directory, 'ci-evidence.json'))).toBe(false);
});
