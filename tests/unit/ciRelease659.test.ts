import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error CI infrastructure is a plain Node module.
import { createBudget, VALIDATION_BUDGET_MS } from '../../scripts/ci-budget.mjs';
// @ts-expect-error CI infrastructure is a plain Node module.
import { assertReleaseDiagnostic, recordReleaseDiagnostics, recordReleaseSource, runReleaseAction } from '../../scripts/ci-release.mjs';

const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const origin = Date.parse('2026-11-03T00:00:00Z');
const deadline = origin + 30 * 60 * 1000;
const repository = 'linhongcun/aoe2-analyzer';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));
const identity = () => ({
  RELEASE_VERSION: 'v0.77.1',
  EXPECTED_RELEASE_SHA: 'a'.repeat(40),
  EXPECTED_DEPLOYED_SHA: 'a'.repeat(40),
  RUNNER_TEMP: '/tmp/release-659-fixture',
  CI_RUN_EPOCH_MS: String(origin),
  CI_DEADLINE_MS: String(deadline),
  GITHUB_RUN_ID: '659',
  GITHUB_RUN_ATTEMPT: '2',
});

async function bootstrap(now: number, changes: Record<string, unknown> = {}, responseOK = true) {
  const script = workflow.match(/node <<'CLOCK'\n([\s\S]*?)\n {10}CLOCK/)?.[1];
  if (!script) throw new Error('Missing executable Release clock bootstrap');
  const writes: { path: string; value: string }[] = [];
  const errors: string[] = [];
  const urls: string[] = [];
  const processFixture: { env: Record<string, string>; exitCode?: number } = {
    env: { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '659', GITHUB_RUN_ATTEMPT: '2', GH_TOKEN: 'fixture', GITHUB_OUTPUT: '/output', GITHUB_ENV: '/env' },
  };
  await runInNewContext(
    script,
    {
      process: processFixture,
      Date: { now: () => now, parse: Date.parse },
      Number,
      AbortSignal,
      console: { error: (message: string) => errors.push(message) },
      require: (name: string) => {
        if (name !== 'node:fs') throw new Error('Unexpected bootstrap dependency');
        return { appendFileSync: (path: string, value: string) => writes.push({ path, value }) };
      },
      fetch: async (url: string) => {
        urls.push(url);
        return {
          ok: responseOK,
          status: responseOK ? 200 : 403,
          json: async () => ({ id: 659, run_attempt: 2, repository: { full_name: repository }, created_at: '2026-11-03T00:00:00Z', ...changes }),
        };
      },
    },
    { timeout: 1000 },
  );
  return { writes, errors, urls, exitCode: processFixture.exitCode };
}

describe('#659 one absolute Release workflow clock', () => {
  it('uses this Release run.created_at, not the preceding CI run or runner start', async () => {
    const result = await bootstrap(origin + 29 * 60 * 1000);
    expect(result.urls).toEqual(['https://api.github.com/repos/' + repository + '/actions/runs/659']);
    expect(result.exitCode).toBeUndefined();
    expect(result.writes).toEqual([
      { path: '/output', value: 'origin_ms=' + origin + '\ndeadline_ms=' + deadline + '\n' },
      { path: '/env', value: 'CI_RUN_EPOCH_MS=' + origin + '\nCI_DEADLINE_MS=' + deadline + '\nCI_BUDGET_KIND=validation\n' },
    ]);
    expect(VALIDATION_BUDGET_MS).toBe(30 * 60 * 1000);
  });

  it('an initial queue reaching the deadline cannot publish a new clock or checkout source', async () => {
    const result = await bootstrap(deadline);
    expect(result.exitCode).toBe(1);
    expect(result.writes).toEqual([]);
    expect(result.errors.join(' ')).toContain('expired before checkout');
    expect(workflow.indexOf('name: Establish absolute Release deadline')).toBeLessThan(workflow.indexOf('uses: actions/checkout@'));
  });

  it.each([{ id: 777 }, { run_attempt: 1 }, { repository: { full_name: 'fork/repo' } }, { created_at: null }])(
    'rejects mismatched GitHub-owned metadata %j',
    async (changes) => {
      const result = await bootstrap(origin + 1000, changes);
      expect(result.exitCode).toBe(1);
      expect(result.writes).toEqual([]);
    },
  );

  it('metadata failure never falls back to Date.now()', async () => {
    const result = await bootstrap(origin + 1000, {}, false);
    expect(result.exitCode).toBe(1);
    expect(result.writes).toEqual([]);
  });

  it('release job queue inherits prepare outputs and rejects an expired clock before checkout', () => {
    const queued = workflow.match(/node <<'QUEUED'\n([\s\S]*?)\n {10}QUEUED/)?.[1];
    expect(queued).toBeTruthy();
    expect(() => runInNewContext(queued!, { process: { env: identity() }, Number, Date: { now: () => deadline } })).toThrow(/expired in the job queue/);
    expect(workflow).toContain('CI_RUN_EPOCH_MS: ${{ needs.prepare.outputs.origin_ms }}');
    expect(workflow).toContain('CI_DEADLINE_MS: ${{ needs.prepare.outputs.deadline_ms }}');
    expect(workflow.match(/node scripts\/ci-budget.mjs --init/g)).toHaveLength(2);
  });
});

describe('#659 Release writes cannot cross or refresh the shared deadline', () => {
  it('a queued/expired release cannot start a command or publish', () => {
    const calls: unknown[] = [];
    const budget = createBudget({ originMs: origin, now: () => deadline });
    expect(() => runReleaseAction('publish', { env: identity(), budget, run: (...args: unknown[]) => calls.push(args) })).toThrow(/deadline/);
    expect(calls).toEqual([]);
  });

  it('checks between upload and publish, so upload finishing late cannot make the release formal', () => {
    let current = deadline - 20;
    const calls: string[][] = [];
    const budget = createBudget({ originMs: origin, now: () => current });
    expect(() =>
      runReleaseAction('publish', {
        env: identity(),
        budget,
        run: (_command: string, args: string[]) => {
          calls.push(args);
          current = deadline;
        },
      }),
    ).toThrow(/deadline/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.slice(0, 2)).toEqual(['release', 'upload']);
  });

  it('even publication completing after the cutoff exits as a failure instead of green', () => {
    let current = deadline - 20;
    const budget = createBudget({ originMs: origin, now: () => current });
    expect(() =>
      runReleaseAction('publish', {
        env: identity(),
        budget,
        run: (_command: string, args: string[]) => {
          if (args[1] === 'edit') current = deadline;
        },
      }),
    ).toThrow(/deadline/);
  });

  it('each nested command gets only the current remaining time and the unchanged workflow clock', () => {
    let current = origin + 1000;
    const observed: { timeout: number; env: unknown }[] = [];
    const env = identity();
    runReleaseAction('tag-draft', {
      env,
      budget: createBudget({ originMs: origin, now: () => current }),
      run: (_command: string, _args: string[], options: { timeout: number; env: unknown }) => {
        observed.push(options);
        current += 1000;
      },
    });
    expect(observed.map((item) => item.timeout)).toEqual([deadline - origin - 1000, deadline - origin - 2000, deadline - origin - 3000]);
    expect(observed.every((item) => item.env === env)).toBe(true);
  });

  it('diagnostic time cannot execute validation or publication', () => {
    expect(() => runReleaseAction('publish', { env: identity(), budget: { kind: 'diagnostic' } })).toThrow(/Diagnostics/);
  });

  it('real budget wrapper kills a blocked Release child and its nested process group before a late write', async () => {
    const root = mkdtempSync(join(tmpdir(), 'release-budget-659-'));
    roots.push(root);
    const marker = join(root, 'late-publication');
    const entered = join(root, 'entered-upload');
    const gh = join(root, 'gh');
    writeFileSync(
      gh,
      '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(' +
        JSON.stringify(entered) +
        ',"entered");const {spawn}=require("node:child_process");spawn(process.execPath,["-e",' +
        JSON.stringify('setTimeout(()=>require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"late"),1500);setInterval(()=>{},1000)') +
        '],{stdio:"ignore"});setInterval(()=>{},1000);\n',
    );
    chmodSync(gh, 0o755);
    const initial = Date.now();
    const env = {
      ...process.env,
      ...identity(),
      CI_RUN_EPOCH_MS: String(initial - VALIDATION_BUDGET_MS + 1000),
      CI_DEADLINE_MS: String(initial + 1000),
      RUNNER_TEMP: root,
      PATH: root + ':' + process.env.PATH,
    };
    const child = spawn(process.execPath, [resolve('scripts/ci-budget.mjs'), '--run', '--', process.execPath, resolve('scripts/ci-release.mjs'), 'publish'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const status = await new Promise<number | null>((resolveStatus, reject) => {
      child.once('error', reject);
      child.once('close', resolveStatus);
    });
    expect(status).not.toBe(0);
    expect(existsSync(entered)).toBe(true);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1600));
    expect(existsSync(marker)).toBe(false);
  });
});

describe('#659 exact snapshot/gate and bounded Release sequence', () => {
  it('downloads the v2 gate from the same main run outside dist before any tag or publication', () => {
    const download = workflow.indexOf('name: Download source CI v2 validation gate');
    const verify = workflow.indexOf('node scripts/ci-stage.mjs verify-release');
    const tag = workflow.indexOf('name: Verify deployment, tag and draft Release');
    expect(download).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(download);
    expect(tag).toBeGreaterThan(verify);
    const section = workflow.slice(download, verify);
    expect(section).toContain('name: ci-validation-evidence');
    expect(section).toContain('path: ${{ runner.temp }}/source-ci-gate');
    expect(section).toContain('run-id: ${{ steps.verify.outputs.ci_run_id }}');
    expect(section).toContain('SOURCE_CI_RUN_ID: ${{ steps.verify.outputs.ci_run_id }}');
    expect(workflow.match(/node scripts\/site-artifact.mjs --verify/g)).toHaveLength(2);
  });

  it('keeps cumulative smoke and packaging on the same clock, checks after publish/timing, and bounds external actions', () => {
    expect(workflow).toContain('node scripts/ci-budget.mjs --run -- node scripts/prepare-release.mjs --smoke-plan');
    expect(workflow).toContain('node scripts/ci-budget.mjs --run -- node scripts/deployment-smoke.mjs --plan "$RUNNER_TEMP/release-smoke-plan.json"');
    expect(workflow).toContain('node scripts/ci-budget.mjs --run -- npm ci --legacy-peer-deps');
    const publish = workflow.indexOf('node scripts/ci-release.mjs publish');
    const timing = workflow.indexOf('node scripts/ci-stage.mjs timing --kind release');
    expect(timing).toBeGreaterThan(publish);
    expect(workflow.slice(timing)).toContain('node scripts/ci-budget.mjs --assert');
    expect(workflow.match(/timeout-minutes: 2/g)?.length).toBeGreaterThanOrEqual(6);
    expect(workflow).not.toMatch(/continue-on-error:/);
  });

  it('failure diagnostics have at most90seconds and cannot start a fresh validation budget', async () => {
    const now = deadline + 70000;
    const observed: unknown[] = [];
    const result = await recordReleaseDiagnostics({ env: identity(), now: () => now, run: async (...args: unknown[]) => observed.push(args) });
    expect(result.deadlineMs).toBe(deadline + 90000);
    expect(result.upload).toBe(false);
    expect(observed).toHaveLength(1);
    expect(() => assertReleaseDiagnostic(result.deadlineMs, { env: identity(), now: () => deadline + 90000 })).toThrow(/expired/);
    expect(() => assertReleaseDiagnostic(deadline + 90001, { env: identity(), now: () => now })).toThrow(/cutoff/);
  });
});

describe('#659 durable exact source attribution for Release timing', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'release-source-659-'));
    roots.push(root);
    const sourceCommit = 'b'.repeat(40);
    const env = {
      ...identity(),
      RUNNER_TEMP: root,
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: 'workflow_run',
      SOURCE_CI_RUN_ID: '',
      GITHUB_SHA: 'c'.repeat(40),
    };
    const event = { repository: { full_name: repository }, workflow_run: { id: 777, run_attempt: 3, head_sha: sourceCommit } };
    const metadata = {
      id: 777,
      run_attempt: 3,
      name: 'CI / Deploy',
      path: '.github/workflows/ci.yml',
      event: 'push',
      head_branch: 'main',
      repository: { full_name: repository },
      head_repository: { full_name: repository },
      head_sha: sourceCommit,
      status: 'completed',
      conclusion: 'success',
    };
    const jobs = ['test', 'deploy'].map((name, index) => ({ id: 65901 + index, name, status: 'completed', conclusion: 'success' }));
    const calls: string[] = [];
    const api = async (endpoint: string) => {
      calls.push(endpoint);
      if (endpoint === 'repos/' + repository + '/actions/runs/777/attempts/3' || endpoint === 'repos/' + repository + '/actions/runs/777') return metadata;
      if (endpoint === 'repos/' + repository + '/actions/runs/777/attempts/3/jobs?per_page=100&page=1') return { jobs };
      throw new Error('Unexpected source attribution lookup: ' + endpoint);
    };
    const budget = createBudget({ originMs: origin, now: () => origin + 1000 });
    return { root, env, event, metadata, jobs, api, calls, budget, sourceCommit, receiptPath: join(root, 'release-source/receipt.json') };
  }

  it('records the original event run/attempt/SHA even when already-published prepare has no source output', async () => {
    const f = fixture();
    const receipt = await recordReleaseSource({ ...f, env: { ...f.env, SHOULD_RELEASE: 'false' } });
    expect(receipt).toEqual({
      schema: 1,
      release_run_id: 659,
      release_run_attempt: 2,
      source_ci_run_id: 777,
      source_ci_run_attempt: 3,
      source_commit: f.sourceCommit,
    });
    expect(JSON.parse(readFileSync(f.receiptPath, 'utf8'))).toEqual(receipt);
    expect(f.calls).toEqual([
      'repos/' + repository + '/actions/runs/777/attempts/3',
      'repos/' + repository + '/actions/runs/777/attempts/3/jobs?per_page=100&page=1',
    ]);
  });

  it('manual skipped prepare records known source=null with reason, never searches latest by SHA', async () => {
    const f = fixture();
    const receipt = await recordReleaseSource({
      ...f,
      env: { ...f.env, GITHUB_EVENT_NAME: 'workflow_dispatch' },
      event: { repository: f.event.repository, inputs: { version: 'v0.77.1' } },
    });
    expect(receipt).toMatchObject({ source_ci_run_id: null, source_ci_run_attempt: null, source_commit: null });
    expect(receipt.reason).toMatch(/no latest-SHA inference/);
    expect(f.calls).toEqual([]);
    expect(existsSync(f.receiptPath)).toBe(true);
  });

  it('Node-only record-source CLI runs without a Release version or npm dependencies', () => {
    const f = fixture();
    const eventPath = join(f.root, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ repository: f.event.repository }));
    const started = Date.now();
    execFileSync(process.execPath, ['scripts/ci-release.mjs', 'record-source'], {
      env: {
        ...process.env,
        ...f.env,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_EVENT_PATH: eventPath,
        RELEASE_VERSION: '',
        EXPECTED_RELEASE_SHA: '',
        EXPECTED_DEPLOYED_SHA: '',
        CI_BUDGET_KIND: 'validation',
        CI_RUN_EPOCH_MS: String(started),
        CI_DEADLINE_MS: String(started + VALIDATION_BUDGET_MS),
      },
      timeout: 5000,
      stdio: 'pipe',
    });
    expect(JSON.parse(readFileSync(f.receiptPath, 'utf8'))).toMatchObject({
      source_ci_run_id: null,
      source_ci_run_attempt: null,
      source_commit: null,
      reason: expect.any(String),
    });
  });

  it('manual known output is checked independently at the exact CI run and current verified attempt', async () => {
    const f = fixture();
    const receipt = await recordReleaseSource({
      ...f,
      env: { ...f.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: f.sourceCommit, SOURCE_CI_RUN_ID: '777' },
      event: { repository: f.event.repository },
    });
    expect(receipt).toMatchObject({ source_ci_run_id: 777, source_ci_run_attempt: 3, source_commit: f.sourceCommit });
    expect(f.calls[0]).toBe('repos/' + repository + '/actions/runs/777');
  });

  it('a different prepared run cannot overwrite the automatic event attribution', async () => {
    const f = fixture();
    await expect(recordReleaseSource({ ...f, env: { ...f.env, SOURCE_CI_RUN_ID: '778' } })).rejects.toThrow(/differs from original/);
    expect(f.calls).toEqual([]);
    expect(existsSync(f.receiptPath)).toBe(false);
  });

  it.each([
    ['run id', { id: 778 }],
    ['attempt', { run_attempt: 4 }],
    ['SHA', { head_sha: 'd'.repeat(40) }],
    ['workflow', { path: '.github/workflows/other.yml' }],
    ['event', { event: 'pull_request' }],
    ['branch', { head_branch: 'release/old' }],
    ['repository', { repository: { full_name: 'fork/repo' } }],
    ['head repository', { head_repository: { full_name: 'fork/repo' } }],
    ['incomplete', { status: 'in_progress' }],
    ['failed', { conclusion: 'failure' }],
  ])('rejects independently fetched bad source %s without recording a false positive', async (_name, changes) => {
    const f = fixture();
    Object.assign(f.metadata, changes);
    await expect(recordReleaseSource(f)).rejects.toThrow();
    expect(existsSync(f.receiptPath)).toBe(false);
  });

  it.each(['missing test', 'failed deploy', 'duplicate test', 'no numeric job id'])(
    'rejects %s in independently fetched latest jobs for the exact attempt',
    async (kind) => {
      const f = fixture();
      if (kind === 'missing test') f.jobs.splice(0, 1);
      if (kind === 'failed deploy') f.jobs[1]!.conclusion = 'cancelled';
      if (kind === 'duplicate test') f.jobs.push({ ...f.jobs[0]!, id: 65903 });
      if (kind === 'no numeric job id') f.jobs[0]!.id = 0;
      await expect(recordReleaseSource(f)).rejects.toThrow();
      expect(existsSync(f.receiptPath)).toBe(false);
    },
  );

  it('API completion after the shared deadline cannot write a source receipt', async () => {
    const f = fixture();
    let current = deadline - 1;
    const api = async (endpoint: string) => {
      const result = await f.api(endpoint);
      current = deadline;
      return result;
    };
    await expect(recordReleaseSource({ ...f, api, budget: createBudget({ originMs: origin, now: () => current }) })).rejects.toThrow(/deadline/);
    expect(existsSync(f.receiptPath)).toBe(false);
  });

  it('workflow records and uploads on every successful prepare, outside the should_release branch', () => {
    const prepare = workflow.indexOf('name: Prepare deployed release');
    const record = workflow.indexOf('name: Record exact source CI identity for Release timing');
    const releaseJob = workflow.indexOf('\n  release:');
    expect(record).toBeGreaterThan(prepare);
    expect(record).toBeLessThan(releaseJob);
    const section = workflow.slice(record, releaseJob);
    expect(section).toContain('node scripts/ci-budget.mjs --run -- node scripts/ci-release.mjs record-source');
    expect(section).toContain('SOURCE_CI_RUN_ID: ${{ steps.release.outputs.ci_run_id }}');
    expect(section).toContain('name: release-source');
    expect(section).toContain('path: ${{ runner.temp }}/release-source');
    expect(section).toContain('overwrite: true');
    expect(section).toContain('timeout-minutes: 2');
    expect(section).toContain('node scripts/ci-budget.mjs --assert');
    expect(section).not.toContain('should_release');
    expect(workflow.match(/node scripts\/site-artifact.mjs --verify/g)).toHaveLength(2);
  });
});
