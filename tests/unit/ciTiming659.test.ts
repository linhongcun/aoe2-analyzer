import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs have no type declarations
import { summarizeRunTiming, summarizeChainTiming, formatTimingMarkdown } from '../../scripts/ci-timing.mjs';

const origin = Date.parse('2026-11-03T01:00:00Z');
const iso = (seconds: number) => new Date(origin + seconds * 1000).toISOString();
const run = (id = 100, start = 0, end = 600, attempt = 1) => ({
  id,
  run_attempt: attempt,
  created_at: iso(start),
  run_started_at: iso(start + 20),
  updated_at: iso(end),
  status: 'completed',
  conclusion: 'success',
  event: 'push',
});
const job = (id: number, name: string, start: number, end: number, attempt = 1) => ({
  id,
  name,
  run_attempt: attempt,
  started_at: iso(start),
  completed_at: iso(end),
  runner_id: 10 + id,
  status: 'completed',
  conclusion: 'success',
});

function fixture() {
  return {
    run: run(),
    jobs: [
      job(1, 'plan', 20, 30),
      job(2, 'static', 40, 100),
      job(3, 'unit', 50, 180),
      job(4, 'build', 35, 200),
      job(5, 'browser (1)', 220, 440),
      job(6, 'browser (2)', 230, 430),
      job(7, 'test', 450, 460),
      job(8, 'deploy', 480, 550),
    ],
    dependencies: {
      plan: [],
      static: ['plan'],
      unit: ['plan'],
      build: ['plan'],
      'browser (1)': ['build'],
      'browser (2)': ['build'],
      test: ['static', 'unit', 'browser (1)', 'browser (2)'],
      deploy: ['test'],
    },
  };
}

describe('#659 actual workflow timing', () => {
  it('separates whole-run wall, initial queue, dependency queues and concurrent runner time', () => {
    const report = summarizeRunTiming(fixture());
    expect(report).toMatchObject({
      originMs: origin,
      wallMs: 600000,
      initialQueueMs: 20000,
      jobsSpanMs: 550000,
      runnerMs: 865000,
      runnerMinutes: 865000 / 60000,
      withinValidationBudget: true,
      complete: true,
    });
    expect(report.runnerMs).toBeGreaterThan(report.wallMs);
    expect(report.slowestShard).toEqual({ jobId: 5, name: 'browser (1)', attempt: 1, durationMs: 220000 });
    expect(report.jobs.find((entry: { id: number }) => entry.id === 5)).toMatchObject({
      dependencyReadyAtMs: origin + 200000,
      dependencyQueueMs: 20000,
      dependencyJobIds: [4],
    });
    expect(report.jobs.find((entry: { id: number }) => entry.id === 7)).toMatchObject({ dependencyQueueMs: 10000 });
    expect(report.criticalPathJobIds).toEqual([1, 4, 5, 7, 8]);
    expect(report.criticalPathComplete).toBe(true);
    expect(report.sources.origin).toBe('github.run.created_at');
  });

  it('counts every runner attempt once and anchors rerun dependency queues to the same run epoch', () => {
    const input = fixture();
    input.run = run(100, 0, 1200, 2);
    input.jobs.push(job(9, 'unit', 700, 800, 2));
    const report = summarizeRunTiming(input);
    expect(report.runnerMs).toBe(965000);
    expect(report.attemptsObserved).toEqual([1, 2]);
    expect(report.originMs).toBe(origin);
    expect(report.jobs.find((entry: { id: number }) => entry.id === 9)).toMatchObject({ dependencyJobIds: [1], dependencyQueueMs: 670000 });
    expect(() => summarizeRunTiming({ ...input, jobs: [...input.jobs, input.jobs[0]] })).toThrow(/Duplicate job id/);
  });

  it('does not pretend the default latest-attempt jobs list is total runner consumption', () => {
    const report = summarizeRunTiming({ run: run(100, 0, 1200, 2), jobs: [job(9, 'unit', 700, 800, 2)], dependencies: { unit: [] } });
    expect(report.runnerMs).toBeNull();
    expect(report.runnerMinutes).toBeNull();
    expect(report.knownRunnerMs).toBe(100000);
    expect(report.missingAttempts).toEqual([1]);
    expect(report.complete).toBe(false);
  });

  it('reports unknown dependency queues instead of fabricated zero waits', () => {
    const input = fixture();
    const missingParents = summarizeRunTiming({ ...input, jobs: input.jobs.filter((entry) => entry.name !== 'build') });
    expect(missingParents.jobs.find((entry: { id: number }) => entry.id === 5)).toMatchObject({
      dependencyQueueMs: null,
      queueReason: 'A completed dependency was not observed before this job started',
    });
    expect(missingParents.criticalPathComplete).toBe(false);
    expect(missingParents.complete).toBe(false);
    const noGraph = summarizeRunTiming({ run: run(), jobs: [job(1, 'plan', 20, 30)] });
    expect(noGraph.jobs[0].dependencyQueueMs).toBeNull();
    expect(noGraph.jobs[0].queueReason).toBe('Dependency metadata was not supplied');
  });

  it('keeps unfinished durations and wall time unknown and labels incomplete metadata', () => {
    const report = summarizeRunTiming({
      run: { ...run(), status: 'in_progress', conclusion: null },
      jobs: [{ ...job(1, 'plan', 20, 30), completed_at: null, status: 'in_progress', conclusion: null }],
      dependencies: { plan: [] },
    });
    expect(report).toMatchObject({ wallMs: null, completedAtMs: null, runnerMs: null, withinValidationBudget: null, complete: false });
    expect(report.jobs[0].durationMs).toBeNull();
    expect(report.issues.join(' ')).toContain('no completed timestamp');
  });

  it('does not count unallocated skipped/cancelled jobs as runner time', () => {
    const report = summarizeRunTiming({
      run: run(),
      jobs: [
        { ...job(1, 'skipped', 1, 1), runner_id: 0, conclusion: 'skipped' },
        { ...job(2, 'cancelled', 2, 2), runner_id: 0, conclusion: 'cancelled' },
        job(3, 'plan', 20, 20),
      ],
      dependencies: { skipped: [], cancelled: [], plan: [] },
    });
    expect(report.runnerMs).toBe(0);
    expect(report.initialQueueMs).toBe(20000);
    const unknown = summarizeRunTiming({ run: run(), jobs: [{ ...job(1, 'plan', 20, 30), runner_id: undefined }], dependencies: { plan: [] } });
    expect(unknown.runnerMs).toBeNull();
    expect(unknown.knownRunnerMs).toBe(0);
  });

  it('preserves real GitHub skipped-job timestamps without inventing execution or readiness', () => {
    const skipped = {
      id: 125662802853,
      run_id: 41551266996,
      run_attempt: 1,
      name: 'deploy',
      started_at: '2026-11-03T01:14:20Z',
      completed_at: '2026-11-03T01:14:19Z',
      status: 'completed',
      conclusion: 'skipped',
      runner_id: null,
      steps: [],
    };
    const report = summarizeRunTiming({
      run: run(41551266996, 0, 900),
      jobs: [job(1, 'test', 20, 30), skipped],
      dependencies: { test: [], deploy: ['test'] },
    });
    expect(report.jobs[1]).toMatchObject({
      runnerAllocated: false,
      runnerMs: 0,
      reportedStartedAtMs: Date.parse(skipped.started_at),
      reportedFinishedAtMs: Date.parse(skipped.completed_at),
      startedAtMs: null,
      finishedAtMs: null,
      durationMs: null,
      dependencyReadyAtMs: null,
      dependencyQueueMs: null,
      dependencyJobIds: [],
      queueReason: 'Job had no allocated runner; execution and dependency queue were not observed',
    });
    expect(report.runnerMs).toBe(10000);
    expect(report.jobsSpanMs).toBe(30000);
    expect(report.criticalPathJobIds).toEqual([1]);
    expect(report.complete).toBe(true);
    const allSkipped = summarizeRunTiming({
      run: run(41551266996, 0, 900, 2),
      jobs: [skipped, { ...skipped, id: skipped.id + 1, name: 'browser (1)', run_attempt: 2 }],
      dependencies: { deploy: [], 'browser (1)': [] },
    });
    expect(allSkipped).toMatchObject({
      runnerMs: 0,
      runnerMinutes: 0,
      knownRunnerMs: 0,
      attemptsObserved: [1, 2],
      initialQueueMs: null,
      jobsSpanMs: null,
      criticalPathJobIds: [],
      slowestShard: null,
    });
  });

  it('keeps allocated chronology strict and unallocated queued jobs outside execution metrics', () => {
    const reversed = { ...job(1, 'browser (1)', 30, 20), steps: [] };
    expect(() => summarizeRunTiming({ run: run(), jobs: [reversed], dependencies: { 'browser (1)': [] } })).toThrow(/chronology/);
    expect(() =>
      summarizeRunTiming({ run: run(), jobs: [{ ...reversed, runner_id: null, steps: [{ name: 'executed' }] }], dependencies: { 'browser (1)': [] } }),
    ).toThrow(/chronology/);
    const report = summarizeRunTiming({
      run: { ...run(), status: 'in_progress' },
      jobs: [{ ...reversed, runner_id: null, started_at: null, completed_at: null, status: 'queued', conclusion: null }],
      dependencies: { 'browser (1)': [] },
    });
    expect(report).toMatchObject({ runnerMs: 0, initialQueueMs: null, criticalPathJobIds: [], slowestShard: null, complete: false });
    expect(report.jobs[0].dependencyQueueMs).toBeNull();
    expect(report.jobs[0].durationMs).toBeNull();
  });

  it('flags over-30-minute elapsed runs without changing the deadline to run_started_at', () => {
    const report = summarizeRunTiming({
      run: { ...run(100, 0, 1801, 2), run_started_at: iso(1790) },
      jobs: [job(1, 'plan', 20, 30), job(2, 'unit', 1795, 1800, 2)],
      dependencies: { plan: [], unit: ['plan'] },
    });
    expect(report.deadlineMs).toBe(origin + 1800000);
    expect(report.wallMs).toBe(1801000);
    expect(report.withinValidationBudget).toBe(false);
    expect(report.jobs[1].dependencyQueueMs).toBe(1765000);
  });

  it('rejects impossible chronology, foreign jobs and cyclic dependency declarations', () => {
    expect(() => summarizeRunTiming({ ...fixture(), run: run(100, 20, 10) })).toThrow(/precedes/);
    expect(() => summarizeRunTiming({ ...fixture(), jobs: [job(1, 'plan', 20, 10)] })).toThrow(/chronology/);
    expect(() => summarizeRunTiming({ ...fixture(), jobs: [{ ...job(1, 'plan', 20, 30), run_id: 999 }] })).toThrow(/different run/);
    expect(() => summarizeRunTiming({ ...fixture(), jobs: [job(1, 'plan', 20, 30, 2)] })).toThrow(/different run or attempt/);
    expect(() => summarizeRunTiming({ ...fixture(), dependencies: { plan: ['test'], test: ['plan'] } })).toThrow(/Cyclic/);
  });
});

function delivery() {
  return {
    pr: [summarizeRunTiming({ run: run(10, 0, 600), jobs: [job(1, 'test', 20, 550)], dependencies: { test: [] } })],
    main: summarizeRunTiming({
      run: run(20, 3600, 4200),
      jobs: [job(2, 'test', 3620, 4100), job(3, 'deploy', 4120, 4150)],
      dependencies: { test: [], deploy: ['test'] },
    }),
    release: summarizeRunTiming({ run: run(30, 4300, 4400), jobs: [job(4, 'release', 4320, 4390)], dependencies: { release: [] } }),
    commit: { sha: 'a'.repeat(40), authoredAt: iso(-10000), committedAt: iso(-5000) },
  };
}

describe('#659 PR/main/deploy/Release chronology', () => {
  it('records review/merge gaps and Release wait independently from workflow runtime', () => {
    const report = summarizeChainTiming(delivery());
    expect(report).toMatchObject({
      kind: 'chain',
      prToMainMs: 3000000,
      mainToDeployMs: 550000,
      deployToReleaseMs: 150000,
      prToDeployMs: 4150000,
      prToReleaseMs: 4400000,
      runnerMs: 1110000,
      complete: true,
    });
    expect(report.runIds).toEqual({ pr: [10], main: 20, release: 30 });
    expect(report.prToReleaseMs).toBeGreaterThan(30 * 60 * 1000);
  });

  it('never calls author/committer timestamps a server push receipt', () => {
    const report = summarizeChainTiming(delivery());
    expect(report.commitToDeployMs).toBeNull();
    expect(report.commit).toMatchObject({ serverPushedAtMs: null, authoredAtMs: origin - 10000000, committedAtMs: origin - 5000000 });
    expect(report.commit.latencyOrigin).toContain('not server push receipts');
    const input = delivery();
    const exact = summarizeChainTiming({ ...input, commit: { ...input.commit, serverPushedAt: iso(-10), serverPushSource: 'trusted webhook received_at' } });
    expect(exact.commitToDeployMs).toBe(4160000);
    expect(exact.commit.serverPushSource).toBe('trusted webhook received_at');
    expect(() => summarizeChainTiming({ ...input, commit: { serverPushedAt: iso(-10) } })).toThrow(/authoritative source/);
  });

  it('does not invent deploy or Release completion for failed/missing stages', () => {
    const input = delivery();
    input.main.jobs[1].conclusion = 'failure';
    const report = summarizeChainTiming({ ...input, release: null });
    expect(report).toMatchObject({ deployedAtMs: null, releasedAtMs: null, prToDeployMs: null, prToReleaseMs: null, complete: false });
    expect(summarizeChainTiming({ ...delivery(), release: null }).complete).toBe(false);
    expect(() => summarizeChainTiming({ ...delivery(), release: input.main })).toThrow(/Duplicate run/);
  });

  it('produces reviewable JSON and Markdown from actual metadata through the CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-timing-659-'));
    try {
      const input = join(dir, 'metadata.json'),
        output = join(dir, 'timing.json'),
        markdown = join(dir, 'timing.md');
      writeFileSync(input, JSON.stringify(fixture()));
      execFileSync(process.execPath, [resolve('scripts/ci-timing.mjs'), '--input', input, '--out', output, '--markdown', markdown]);
      expect(JSON.parse(readFileSync(output, 'utf8')).wallMs).toBe(600000);
      expect(readFileSync(markdown, 'utf8')).toContain('600.0 s');
      expect(readFileSync(markdown, 'utf8')).toContain('865.0 s');
      expect(formatTimingMarkdown(summarizeChainTiming(delivery()))).toContain('Unknown: Git commit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
