import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error scripts/*.mjs have no type declarations
import { collectRun, resolveObservedDependencies } from '../../scripts/ci-report.mjs';
// @ts-expect-error scripts/*.mjs have no type declarations
import { summarizeRunTiming } from '../../scripts/ci-timing.mjs';

type Job = {
  id: number;
  name: string;
  run_id: number;
  run_attempt: number;
  started_at: string | null;
  completed_at: string | null;
  runner_id: number | null | undefined;
  status: string;
  conclusion: string | null;
  steps?: unknown[];
};
const epoch = Date.parse('2026-11-03T14:00:00Z');
const iso = (seconds: number) => new Date(epoch + seconds * 1000).toISOString();
const job = (id: number, name: string, start: number, end: number, attempt = 1): Job => ({
  id,
  name,
  run_id: 100,
  run_attempt: attempt,
  started_at: iso(start),
  completed_at: iso(end),
  runner_id: id,
  status: 'completed',
  conclusion: 'success',
});
const skipped = (id = 2, attempt = 1): Job => ({ ...job(id, 'data', 21, 20, attempt), runner_id: null, conclusion: 'skipped', steps: [] });
const declared = { plan: [], data: ['plan'], build: ['plan'], test: ['data', 'build'] };
const jobs = () => [job(1, 'plan', 10, 20), skipped(), job(3, 'build', 21, 100), job(4, 'test', 103, 110)];

describe('#659 observed dependency ready-time proof', () => {
  it('removes only a dominated no-op edge and does not mutate jobs or the declared graph', () => {
    const rows = jobs(),
      beforeJobs = structuredClone(rows),
      beforeGraph = structuredClone(declared);
    const resolved = resolveObservedDependencies(rows, declared);
    expect(resolved).toEqual({ ...declared, test: ['build'] });
    expect(resolved).not.toBe(declared);
    expect(resolved.plan).not.toBe(declared.plan);
    expect(rows).toEqual(beforeJobs);
    expect(declared).toEqual(beforeGraph);
  });

  it.each([
    ['late skip', { completed_at: iso(104) }],
    ['skip determines the maximum', { completed_at: iso(101) }],
    ['unknown completion', { completed_at: null }],
    ['invalid completion', { completed_at: '2026-02-30T14:00:20Z' }],
    ['unfinished skip', { status: 'in_progress' }],
    ['not skipped', { conclusion: 'cancelled' }],
    ['allocated skip', { runner_id: 20 }],
    ['stepped skip', { steps: [{ name: 'actually executed' }] }],
    ['unknown allocation', { runner_id: undefined }],
    ['unknown steps', { steps: undefined }],
  ])('retains an uncertain or non-dominated parent: %s', (_label, patch) => {
    const rows = jobs();
    rows[1] = { ...rows[1]!, ...patch };
    expect(resolveObservedDependencies(rows, declared)).toEqual(declared);
  });

  it('does not infer readiness from missing or ambiguous parent metadata', () => {
    const rows = jobs();
    expect(
      resolveObservedDependencies(
        rows.filter((row) => row.name !== 'data'),
        declared,
      ),
    ).toEqual(declared);
    expect(resolveObservedDependencies([...rows, { ...skipped(), id: 20 }], declared)).toEqual(declared);
    expect(
      resolveObservedDependencies(
        rows.map((row) => (row.name === 'data' ? { ...row, run_id: 999 } : row)),
        declared,
      ),
    ).toEqual(declared);
  });

  it('requires an observed allocated child and an independently retained real witness', () => {
    expect(
      resolveObservedDependencies(
        jobs().filter((row) => row.name !== 'test'),
        declared,
      ),
    ).toEqual(declared);
    const rows = jobs();
    rows[3] = { ...rows[3]!, started_at: null };
    expect(resolveObservedDependencies(rows, declared)).toEqual(declared);
    for (const patch of [
      { runner_id: null, steps: [], conclusion: 'skipped' },
      { completed_at: null },
      { completed_at: iso(104) },
      { started_at: iso(101), completed_at: iso(100) },
      { status: 'in_progress' },
    ]) {
      const candidates = jobs();
      candidates[2] = { ...candidates[2]!, ...patch };
      expect(resolveObservedDependencies(candidates, declared)).toEqual(declared);
    }
    expect(resolveObservedDependencies(jobs(), { ...declared, test: ['data'] }).test).toEqual(['data']);
  });

  it('never allows skipped parents to justify pruning one another', () => {
    const rows = jobs();
    rows[2] = { ...skipped(3), name: 'build' };
    expect(resolveObservedDependencies(rows, declared)).toEqual(declared);
  });

  it('checks every allocated child attempt and retains cross-attempt counterexamples', () => {
    const rows = [...jobs(), skipped(12, 2), job(13, 'build', 121, 200, 2), job(14, 'test', 203, 210, 2)];
    expect(resolveObservedDependencies(rows, declared).test).toEqual(['build']);
    for (const patch of [{ completed_at: iso(201) }, { runner_id: 22 }, { status: 'in_progress' }]) {
      const candidates = structuredClone(rows);
      candidates[4] = { ...candidates[4]!, ...patch };
      expect(resolveObservedDependencies(candidates, declared).test).toEqual(declared.test);
    }
    // A newer skipped attempt must not hide an older allocated parent whose
    // completion generic timing would still consider after the witness.
    const olderExecuted = { ...job(2, 'data', 20, 202), run_attempt: 1 };
    const laterOnlyChild = [olderExecuted, skipped(12, 2), job(13, 'build', 121, 200, 2), job(14, 'test', 203, 210, 2)];
    expect(resolveObservedDependencies(laterOnlyChild, declared).test).toEqual(declared.test);
    const latestIncompleteWitness = [...jobs(), { ...job(13, 'build', 121, 200, 2), completed_at: null, status: 'in_progress' }, job(14, 'test', 203, 210, 2)];
    expect(resolveObservedDependencies(latestIncompleteWitness, declared).test).toEqual(declared.test);
  });

  it('does not hide invalid declarations from strict generic timing', () => {
    const duplicate = { ...declared, test: ['data', 'data', 'build'] };
    const cyclic = { ...declared, data: ['test'] };
    for (const graph of [duplicate, cyclic]) {
      const resolved = resolveObservedDependencies(jobs(), graph);
      expect(resolved).toEqual(graph);
      expect(() =>
        summarizeRunTiming({
          run: { id: 100, run_attempt: 1, created_at: iso(0), updated_at: iso(300), status: 'completed' },
          jobs: jobs(),
          dependencies: resolved,
        }),
      ).toThrow();
    }
  });
});

type Row = readonly [number, string, string, string, number | null];
function snapshot(id: number, created: string, completed: string, rows: readonly Row[]) {
  const stamp = (value: string) => '2026-11-03T' + value + 'Z';
  return {
    run: { id, name: 'CI / Deploy', run_attempt: 1, created_at: stamp(created), updated_at: stamp(completed), status: 'completed', conclusion: 'success' },
    jobs: rows.map(([jobId, name, start, end, runner]): Job => ({
      id: jobId,
      name,
      run_id: id,
      run_attempt: 1,
      started_at: stamp(start),
      completed_at: stamp(end),
      runner_id: runner,
      status: 'completed',
      conclusion: runner === null ? 'skipped' : 'success',
      ...(runner === null ? { steps: [] } : {}),
    })),
  };
}

// Minimal projections of official API run and all-attempt job responses. Allocated
// rows omit steps because their positive runner_id already proves allocation.
// https://api.github.com/repos/linhongcun/aoe2-analyzer/actions/runs/41650808477
// https://api.github.com/repos/linhongcun/aoe2-analyzer/actions/runs/41650808477/attempts/1/jobs
const actualPr = () =>
  snapshot(41650808477, '14:08:47', '14:26:58', [
    [125968187080, 'plan', '14:08:59', '14:10:35', 1000002362],
    [125969146439, 'build', '14:10:38', '14:12:44', 1000002365],
    [125969146563, 'static', '14:10:38', '14:11:56', 1000002366],
    [125969146767, 'unit', '14:10:38', '14:16:22', 1000002367],
    [125969148492, 'static-main', '14:10:36', '14:10:35', null],
    [125969149785, 'data', '14:10:36', '14:10:35', null],
    [125970378925, 'browser-2', '14:12:47', '14:25:51', 1000002368],
    [125970379019, 'browser-3', '14:12:47', '14:23:32', 1000002369],
    [125970379137, 'browser-1', '14:12:47', '14:24:09', 1000002370],
    [125970379275, 'browser-4', '14:12:47', '14:26:04', 1000002371],
    [125978052671, 'test', '14:26:07', '14:26:57', 1000002375],
    [125978561979, 'deploy', '14:26:58', '14:26:57', null],
  ]);
// https://api.github.com/repos/linhongcun/aoe2-analyzer/actions/runs/41653950732
// https://api.github.com/repos/linhongcun/aoe2-analyzer/actions/runs/41653950732/attempts/1/jobs
const actualMain = () =>
  snapshot(41653950732, '14:28:01', '14:33:14', [
    [125979171043, 'plan', '14:28:03', '14:29:25', 1000002376],
    [125979968710, 'static-main', '14:29:27', '14:30:44', 1000002379],
    [125979968872, 'build', '14:29:28', '14:31:30', 1000002380],
    [125979971915, 'data', '14:29:25', '14:29:25', null],
    [125979971995, 'unit', '14:29:25', '14:29:25', null],
    [125979972331, 'static', '14:29:25', '14:29:25', null],
    [125981188113, 'browser-${{ matrix.shard }}', '14:31:31', '14:31:30', null],
    [125981188592, 'test', '14:31:32', '14:32:13', 1000002388],
    [125981603380, 'deploy', '14:32:17', '14:33:13', 1000002389],
  ]);
const ciGraph = (rows: Job[]) => {
  const browserNames = rows.filter((row) => /^browser-[1-4]$/.test(row.name)).map((row) => row.name);
  return {
    plan: [],
    static: ['plan'],
    'static-main': ['plan'],
    unit: ['plan'],
    data: ['plan'],
    build: ['plan'],
    ...Object.fromEntries(browserNames.map((name) => [name, ['plan', 'build']])),
    test: ['plan', 'static', 'static-main', 'unit', 'data', 'build', ...browserNames],
    deploy: ['test'],
  };
};

describe('#659 real completed PR/main observation regression', () => {
  it.each([
    {
      fixture: actualPr,
      queueMs: 3000,
      wallMs: 1091000,
      runnerMs: 3602000,
      path: [125968187080, 125969146439, 125970379275, 125978052671],
      witness: 125970379275,
    },
    {
      fixture: actualMain,
      queueMs: 2000,
      wallMs: 313000,
      runnerMs: 378000,
      path: [125979171043, 125979968872, 125981188592, 125981603380],
      witness: 125979968872,
    },
  ])(
    'recovers the observed queue and critical path for $fixture without changing wall or runner time',
    ({ fixture, queueMs, wallMs, runnerMs, path, witness }) => {
      const data = fixture(),
        graph = ciGraph(data.jobs);
      const before = summarizeRunTiming({ ...data, dependencies: graph });
      expect(before.complete).toBe(false);
      expect(before.jobs.find((row: Job) => row.name === 'test').dependencyQueueMs).toBeNull();
      const resolved = resolveObservedDependencies(data.jobs, graph);
      const after = summarizeRunTiming({ ...data, dependencies: resolved });
      expect(after).toMatchObject({ complete: true, criticalPathComplete: true, wallMs, runnerMs, criticalPathJobIds: path });
      expect(after.wallMs).toBe(before.wallMs);
      expect(after.runnerMs).toBe(before.runnerMs);
      expect(after.jobs.find((row: Job) => row.name === 'test')).toMatchObject({
        dependencyQueueMs: queueMs,
        dependencyJobIds: expect.arrayContaining([witness]),
      });
      for (const row of after.jobs.filter((row: { runnerAllocated: boolean }) => row.runnerAllocated === false)) {
        expect(row.durationMs).toBeNull();
        expect(row.dependencyQueueMs).toBeNull();
      }
    },
  );

  it('uses the resolver in the actual read-only collector with every attempt endpoint', async () => {
    const data = actualMain(),
      calls: string[] = [];
    const api = async (endpoint: string) => {
      calls.push(endpoint);
      if (endpoint === 'repos/linhongcun/aoe2-analyzer/actions/runs/' + data.run.id) return data.run;
      if (endpoint.endsWith('/attempts/1/jobs?per_page=100&page=1')) return { jobs: data.jobs };
      throw new Error('Unexpected API endpoint');
    };
    const budget = { assertRemaining: vi.fn() };
    const result = await collectRun({ budget, api, repository: 'linhongcun/aoe2-analyzer', runId: data.run.id });
    expect(result.report.complete).toBe(true);
    expect(result.report.criticalPathComplete).toBe(true);
    expect(result.report.dependencyResolution.declared.test).toEqual(expect.arrayContaining(['data', 'unit', 'static']));
    expect(result.report.dependencyResolution.observed.test).toEqual(['plan', 'static-main', 'build']);
    expect(calls).toHaveLength(2);
    expect(budget.assertRemaining).toHaveBeenCalledWith('collected timing');
  });
});
