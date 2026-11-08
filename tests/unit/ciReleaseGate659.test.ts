import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { verifyReleaseGate } from '../../scripts/ci-stage.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { createBudget } from '../../scripts/ci-budget.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { policyDigest, selectionDigest } from '../../scripts/ci-stage-evidence.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { artifactSnapshot, createArtifactManifest } from '../../scripts/site-artifact.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { narrowSmokeTitles } from '../../scripts/ci-scope.mjs';

const repository = 'linhongcun/aoe2-analyzer';
const folders: string[] = [];
const iso = (time: number) => new Date(time).toISOString();
const second = (time: number) => iso(time).replace('.000Z', 'Z');
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
afterEach(() => {
  vi.unstubAllEnvs();
  folders.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

function fixture(options: { omitStaticMain?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ci659-release-gate-'));
  folders.push(directory);
  const dist = join(directory, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Immutable deployed site</title>');
  const [commit, tree] = execFileSync('git', ['show', '--no-patch', '--format=%H%n%T', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  const origin = Math.floor((Date.now() - 600_000) / 1000) * 1000;
  const id = 659_100,
    attempt = 2,
    buildJobId = 659_403,
    aggregateJobId = 659_410;
  const plan_digest = 'a'.repeat(64),
    gate_ref = `ci-v2:${repository}:${id}:${attempt}:${plan_digest}:test`;
  const toolchain_digest = 'b'.repeat(64);
  createArtifactManifest({
    directory: dist,
    commit,
    tree,
    version: 'v0.77.1',
    repository,
    runId: id,
    plan: { features: [], scope: 'maintenance', full: false, data: false },
    gate_ref,
    runAttempt: attempt,
    buildJobId,
    toolchainDigest: toolchain_digest,
  });
  const snapshot = artifactSnapshot(dist);
  const smokeCases = ['smoke-calc', 'smoke-civs', 'smoke-franks', 'smoke-home', 'smoke-query', 'smoke-unit'].map((id) => ({
    id,
    expectedStatus: 'passed',
  }));
  const requirements = ['static', 'static-main', 'build', 'browser-1'].map((stage_id) => ({
    stage_id,
    job_name: stage_id,
    reusable: !['static-main', 'build', 'browser-1'].includes(stage_id),
    selection: {
      checks: stage_id === 'build' ? ['build', 'fresh-build-smoke', 'snapshot'] : stage_id.startsWith('browser-') ? ['playwright'] : [stage_id],
      files: stage_id.startsWith('browser-') ? ['tests/e2e/smoke.spec.ts'] : [],
      cases: stage_id.startsWith('browser-') ? smokeCases : [],
    },
    toolchain_digest,
  }));
  const gate = {
    version: 2,
    repository,
    repository_id: 5,
    run_id: id,
    run_attempt: attempt,
    tested_commit: commit,
    tested_tree: tree,
    policy_digest: policyDigest(),
    plan_digest,
    requirements,
    requirements_digest: hash(Buffer.from(JSON.stringify(requirements))),
    aggregate_job_id: aggregateJobId,
    issued_at: iso(origin + 54_600),
    gate_ref,
    snapshot,
    epoch: {
      version: 1,
      kind: 'validation',
      source: 'github.run.created_at',
      origin_ms: origin,
      deadline_ms: origin + 1_800_000,
      run_id: id,
      run_attempt: attempt,
    },
    required_stage_ids: requirements.map((entry) => entry.stage_id),
    smoke: { titles: narrowSmokeTitles(), case_ids: smokeCases.map((entry) => entry.id) },
    stages: requirements.map((entry, index) => ({
      stage_id: entry.stage_id,
      executed: true,
      requested_selection_digest: selectionDigest(entry.selection),
      source_selection_digest: selectionDigest(entry.selection),
      source: {
        run_id: id,
        run_attempt: attempt,
        job_id: entry.stage_id === 'build' ? buildJobId : 659_401 + index,
        artifact_id: 659_501 + index,
        artifact_digest: 'sha256:' + 'd'.repeat(64),
        tested_commit: commit,
        tested_tree: tree,
      },
    })),
  };
  const run = {
    id,
    run_attempt: attempt,
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    head_sha: commit,
    created_at: second(origin),
    repository: { id: 5, full_name: repository },
    head_repository: { id: 5, full_name: repository },
  };
  const jobs = [
    ['static-main', 659_402, 20_000, 28_000],
    ['build', buildJobId, 30_000, 40_000],
    ['browser-1', 659_404, 41_000, 48_000],
    ['test', aggregateJobId, 50_000, 55_000],
    ['deploy', 659_411, 56_000, 60_000],
  ].map(([name, jobId, start, end]) => ({
    id: Number(jobId),
    name: String(name),
    run_id: id,
    run_attempt: attempt,
    head_sha: commit,
    status: 'completed',
    conclusion: 'success',
    started_at: second(origin + Number(start)),
    completed_at: second(origin + Number(end)),
  }));
  const artifact = {
    id: 659_600,
    name: 'ci-validation-evidence',
    expired: false,
    size_in_bytes: 1,
    digest: '',
    created_at: second(origin + 54_000),
    updated_at: second(origin + 54_000),
    expires_at: iso(Date.now() + 86_400_000),
    workflow_run: { id, head_sha: commit, repository_id: 5, head_repository_id: 5 },
  };
  let bytes = Buffer.alloc(0);
  const pack = () => {
    const receipt = join(directory, 'gate.json'),
      archive = join(directory, 'gate.zip');
    writeFileSync(receipt, JSON.stringify(gate));
    execFileSync('python3', [
      '-c',
      "import sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as z:z.write(sys.argv[1],'receipt.json')",
      receipt,
      archive,
    ]);
    bytes = readFileSync(archive);
    artifact.size_in_bytes = bytes.length;
    artifact.digest = 'sha256:' + hash(bytes);
  };
  for (const [name, value] of Object.entries({
    GITHUB_REPOSITORY: repository,
    SOURCE_CI_RUN_ID: String(id),
    EXPECTED_DEPLOYED_SHA: commit,
    RUNNER_TEMP: directory,
    SITE_ARTIFACT_DIR: dist,
    GH_TOKEN: 'local-test-token',
  }))
    vi.stubEnv(name, value);
  const fetched: string[] = [],
    called: string[] = [];
  const budget = createBudget({
    originMs: Date.now(),
    runId: 659_200,
    runAttempt: 1,
    fetchImpl: async (url: string) => {
      fetched.push(url);
      expect(url).toBe(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`);
      return new Response(bytes);
    },
  });
  const api = async (endpoint: string) => {
    called.push(endpoint);
    if (endpoint === `repos/${repository}/actions/runs/${id}`) return run;
    if (endpoint === `repos/${repository}/actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100&page=1`) return { jobs, total_count: jobs.length };
    if (endpoint === `repos/${repository}/actions/runs/${id}/artifacts?per_page=100&page=1`) return { artifacts: [artifact], total_count: 1 };
    throw new Error('Unexpected authoritative API endpoint: ' + endpoint);
  };
  const verify = () => verifyReleaseGate({ budget, api });
  if (options.omitStaticMain) {
    gate.requirements = gate.requirements.filter((entry) => entry.stage_id !== 'static-main');
    gate.required_stage_ids = gate.requirements.map((entry) => entry.stage_id);
    gate.stages = gate.stages.filter((stage) => stage.stage_id !== 'static-main');
    gate.requirements_digest = hash(Buffer.from(JSON.stringify(gate.requirements)));
    jobs.splice(
      jobs.findIndex((job) => job.name === 'static-main'),
      1,
    );
  }
  pack();
  return { directory, dist, origin, run, gate, jobs, artifact, budget, pack, verify, fetched, called };
}

describe('#659 Release bridge authenticates actual source artifacts', () => {
  it('accepts exact current HEAD/tree and immutable schema1 bytes through real ZIP extraction', async () => {
    const f = fixture();
    expect(await f.verify()).toEqual(f.gate);
    expect(f.fetched).toHaveLength(1);
    expect(f.called).toContain(`repos/${repository}/actions/runs/${f.run.id}/attempts/2/jobs?per_page=100&page=1`);
  });

  it('accepts a default main gate that executed the narrow smoke and did not run static-main', async () => {
    const f = fixture({ omitStaticMain: true });
    expect(f.gate.required_stage_ids).toEqual(['static', 'build', 'browser-1']);
    expect(await f.verify()).toEqual(f.gate);
  });

  const mutations: [string, (f: ReturnType<typeof fixture>) => void][] = [
    ['latest run attempt changed', (f) => f.run.run_attempt++],
    ['gate attempt differs', (f) => f.gate.run_attempt++],
    ['aggregate numeric job ID differs', (f) => f.gate.aggregate_job_id++],
    ['build numeric job ID differs', (f) => f.gate.stages.find((stage) => stage.stage_id === 'build')!.source.job_id++],
    ['build snapshot job ID differs', (f) => f.gate.snapshot.build_job_id++],
    ['job belongs to another attempt', (f) => f.jobs.find((job) => job.name === 'test')!.run_attempt++],
    ['job belongs to another SHA', (f) => (f.jobs.find((job) => job.name === 'deploy')!.head_sha = 'f'.repeat(40))],
    ['source head SHA differs', (f) => (f.run.head_sha = 'f'.repeat(40))],
    ['source repository differs', (f) => (f.run.repository.full_name = 'other/repo')],
    ['source is a fork', (f) => (f.run.head_repository.id = 8)],
    ['artifact belongs to another repository', (f) => f.artifact.workflow_run.repository_id++],
    ['artifact belongs to another run', (f) => f.artifact.workflow_run.id++],
    ['artifact expired', (f) => (f.artifact.expired = true)],
    ['artifact expiration elapsed', (f) => (f.artifact.expires_at = iso(Date.now() - 1000))],
    ['legacy v1 gate', (f) => (f.gate.version = 1)],
    ['policy changed', (f) => (f.gate.policy_digest = 'f'.repeat(64))],
    ['aggregate completed at deadline', (f) => (f.jobs.find((job) => job.name === 'test')!.completed_at = second(f.origin + 1_800_000))],
    ['deploy completed at deadline', (f) => (f.jobs.find((job) => job.name === 'deploy')!.completed_at = second(f.origin + 1_800_000))],
    ['gate issued before aggregate job', (f) => (f.gate.issued_at = iso(f.origin + 49_999))],
    ['gate artifact updated after aggregate job', (f) => (f.artifact.updated_at = second(f.origin + 56_000))],
    ['missing fresh build', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'build')!.executed = false)],
    ['authoritative build failed', (f) => (f.jobs.find((job) => job.name === 'build')!.conclusion = 'failure')],
    ['authoritative narrow smoke failed', (f) => (f.jobs.find((job) => job.name === 'browser-1')!.conclusion = 'failure')],
    ['narrow smoke was not executed on this run', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'browser-1')!.executed = false)],
    ['narrow smoke drops the home route', (f) => (f.gate.smoke.titles = f.gate.smoke.titles.filter((title: string) => !title.startsWith('route (home)')))],
    ['narrow smoke case ids do not match the shard', (f) => (f.gate.smoke.case_ids = ['other-case'])],
    ['release source adds a second browser shard', (f) => f.gate.required_stage_ids.push('browser-2')],
    ['authoritative static-main failed', (f) => (f.jobs.find((job) => job.name === 'static-main')!.conclusion = 'failure')],
    ['static-main claims reused execution', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'static-main')!.executed = false)],
    ['static-main source job differs', (f) => f.gate.stages.find((stage) => stage.stage_id === 'static-main')!.source.job_id++],
    ['static-main source attempt differs', (f) => f.gate.stages.find((stage) => stage.stage_id === 'static-main')!.source.run_attempt++],
    ['static-main source tree differs', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'static-main')!.source.tested_tree = 'f'.repeat(40))],
    [
      'static-main reuses a historical PR result',
      (f) => {
        const source = f.gate.stages.find((stage) => stage.stage_id === 'static-main')!.source;
        Object.assign(source, { run_id: f.run.id - 1, run_attempt: 1, job_id: 659_001, tested_commit: 'f'.repeat(40) });
      },
    ],
    [
      'self-consistent requirement marks static-main reusable',
      (f) => {
        f.gate.requirements.find((required) => required.stage_id === 'static-main')!.reusable = true;
        f.gate.requirements_digest = hash(Buffer.from(JSON.stringify(f.gate.requirements)));
      },
    ],
    ['build source run differs', (f) => f.gate.stages.find((stage) => stage.stage_id === 'build')!.source.run_id++],
    ['build source attempt differs', (f) => f.gate.stages.find((stage) => stage.stage_id === 'build')!.source.run_attempt++],
    ['build source commit differs', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'build')!.source.tested_commit = 'f'.repeat(40))],
    ['build source tree differs', (f) => (f.gate.stages.find((stage) => stage.stage_id === 'build')!.source.tested_tree = 'f'.repeat(40))],
    [
      'manifest changed',
      (f) => {
        const path = join(f.dist, 'build-evidence.json'),
          manifest = JSON.parse(readFileSync(path, 'utf8'));
        manifest.plan.features.push('changed-after-snapshot');
        writeFileSync(path, JSON.stringify(manifest));
      },
    ],
    ['immutable gate reference changed', (f) => (f.gate.gate_ref += '-changed')],
    ['missing fresh-build smoke selection', (f) => (f.gate.requirements.find((r) => r.stage_id === 'build')!.selection.checks = ['build', 'snapshot'])],
    [
      'self-consistent gate omits fresh-build smoke',
      (f) => {
        const build = f.gate.requirements.find((r) => r.stage_id === 'build')!,
          stage = f.gate.stages.find((s) => s.stage_id === 'build')!;
        build.selection.checks = ['build', 'snapshot'];
        stage.requested_selection_digest = stage.source_selection_digest = selectionDigest(build.selection);
        f.gate.requirements_digest = hash(Buffer.from(JSON.stringify(f.gate.requirements)));
      },
    ],
  ];
  it.each(mutations)('rejects %s', async (_label, mutate) => {
    const f = fixture();
    mutate(f);
    f.pack();
    await expect(f.verify()).rejects.toThrow();
  });

  it('rejects ZIP bytes differing from the independently reported GitHub artifact digest', async () => {
    const f = fixture();
    f.artifact.digest = 'sha256:' + '0'.repeat(64);
    await expect(f.verify()).rejects.toThrow(/digest mismatch/);
  });

  it('rejects a locally downloaded gate that differs from the authenticated source ZIP', async () => {
    const f = fixture(),
      downloaded = join(f.directory, 'source-ci-gate');
    mkdirSync(downloaded);
    writeFileSync(join(downloaded, 'receipt.json'), JSON.stringify({ ...f.gate, version: 1 }));
    await expect(f.verify()).rejects.toThrow(/differs from authenticated/);
  });
});
