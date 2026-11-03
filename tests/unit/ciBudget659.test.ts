import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error scripts/*.mjs have no type declarations
import * as budgets from '../../scripts/ci-budget.mjs';

const {
  VALIDATION_BUDGET_MS,
  DIAGNOSTIC_BUDGET_MS,
  createBudget,
  budgetFromRun,
  budgetFromEnv,
  initializeBudget,
  createDiagnosticBudget,
  writeBudgetEnvironment,
} = budgets;
const origin = Date.parse('2026-11-03T01:00:00Z');
const repository = 'linhongcun/aoe2-analyzer';
const env = { GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: repository, GH_TOKEN: 'private-test-token' };
const runMetadata = () => ({
  id: 100,
  run_attempt: 2,
  created_at: new Date(origin).toISOString(),
  run_started_at: new Date(origin + 3000000).toISOString(),
  repository: { full_name: repository },
});
const directories: string[] = [];
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), 'ci-budget-659-'));
  directories.push(path);
  return path;
};
const childProcess = () => Object.assign(new EventEmitter(), { pid: 4321, stdout: new PassThrough(), stderr: new PassThrough() });

afterEach(() => {
  vi.useRealTimers();
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe('#659 immutable workflow epoch', () => {
  it('uses created_at for every attempt and never freshens an expired rerun', () => {
    const budget = budgetFromRun(runMetadata(), { now: () => origin + 60000 });
    expect(budget.toJSON()).toEqual({
      version: 1,
      kind: 'validation',
      origin_ms: origin,
      deadline_ms: origin + VALIDATION_BUDGET_MS,
      source: 'github.run.created_at',
      run_id: 100,
      run_attempt: 2,
    });
    const rerun = budgetFromRun({ ...runMetadata(), run_attempt: 3 }, { now: () => origin + VALIDATION_BUDGET_MS });
    expect(rerun.deadlineMs).toBe(budget.deadlineMs);
    expect(() => rerun.assertRemaining('Rerun')).toThrow(/expired/);
  });

  it('does not accept a missing official epoch or an extended deadline', () => {
    expect(() => budgetFromRun({ ...runMetadata(), created_at: undefined })).toThrow(/run.created_at/);
    expect(() => createBudget({ originMs: origin, deadlineMs: origin + VALIDATION_BUDGET_MS + 1 })).toThrow(/30 minutes/);
    expect(() => budgetFromEnv({ ...env, CI_RUN_EPOCH_MS: String(origin), CI_DEADLINE_MS: String(origin + VALIDATION_BUDGET_MS + 1) })).toThrow(/30 minutes/);
  });

  it('loads the fixed plan epoch and rejects aggregate/deploy after their queue', () => {
    const fixed = { ...env, CI_RUN_EPOCH_MS: String(origin), CI_DEADLINE_MS: String(origin + VALIDATION_BUDGET_MS) };
    const budget = budgetFromEnv(fixed, { now: () => origin + 100 });
    expect(budget.remainingMs()).toBe(VALIDATION_BUDGET_MS - 100);
    expect(() => budgetFromEnv(fixed, { now: () => origin + VALIDATION_BUDGET_MS })).toThrow(/Stage start/);
    expect(() => budgetFromEnv({ ...fixed, CI_RUN_EPOCH_MS: '1e12' })).toThrow(/CI_RUN_EPOCH_MS/);
    expect(() => budgetFromEnv({ ...fixed, CI_BUDGET_KIND: 'diagnostic' })).toThrow(/diagnostic/);
  });

  it('initializes only from authenticated, matching GitHub-owned run metadata', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => runMetadata() }));
    const budget = await initializeBudget({ env, fetchImpl, now: () => origin + 500 });
    expect(budget.originMs).toBe(origin);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/' + repository + '/actions/runs/100',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer private-test-token' }), signal: expect.any(AbortSignal) }),
    );
    for (const bad of [
      { ...runMetadata(), id: 99 },
      { ...runMetadata(), run_attempt: 1 },
      { ...runMetadata(), repository: { full_name: 'other/repo' } },
    ]) {
      await expect(initializeBudget({ env, now: () => origin + 500, fetchImpl: async () => ({ ok: true, json: async () => bad }) })).rejects.toThrow(
        /does not match/,
      );
    }
    await expect(initializeBudget({ env, now: () => origin + VALIDATION_BUDGET_MS, fetchImpl })).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
  });

  it('fails closed on missing credentials/HTTP failure and bounds a stalled metadata body', async () => {
    await expect(initializeBudget({ env: { ...env, GH_TOKEN: '' } })).rejects.toThrow(/token/);
    await expect(initializeBudget({ env, fetchImpl: async () => ({ ok: false, status: 403 }) })).rejects.toMatchObject({ code: 'CI_HTTP_ERROR' });
    vi.useFakeTimers();
    const failed = expect(initializeBudget({ env, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) })).rejects.toMatchObject({
      code: 'CI_OPERATION_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(10000);
    await failed;
  });

  it('verifies a pre-checkout bootstrap epoch instead of accepting a reset clock', async () => {
    const fixed = { ...env, CI_RUN_EPOCH_MS: String(origin), CI_DEADLINE_MS: String(origin + VALIDATION_BUDGET_MS) };
    const fetchImpl = async () => ({ ok: true, json: async () => runMetadata() });
    expect((await initializeBudget({ env: fixed, fetchImpl, now: () => origin + 100 })).originMs).toBe(origin);
    await expect(
      initializeBudget({
        env: { ...fixed, CI_RUN_EPOCH_MS: String(origin + 1), CI_DEADLINE_MS: String(origin + 1 + VALIDATION_BUDGET_MS) },
        fetchImpl,
        now: () => origin + 100,
      }),
    ).rejects.toThrow(/Previously initialized/);
    await expect(initializeBudget({ env: { ...env, CI_RUN_EPOCH_MS: String(origin) }, fetchImpl, now: () => origin + 100 })).rejects.toThrow(/CI_DEADLINE_MS/);
  });

  it('publishes only stable numeric budget/identity fields and never credentials', () => {
    const dir = temp();
    const paths = { envFile: join(dir, 'env'), outputFile: join(dir, 'output'), jsonFile: join(dir, 'budget.json') };
    const budget = budgetFromRun(runMetadata(), { now: () => origin });
    const wire = writeBudgetEnvironment(budget, paths);
    expect(JSON.parse(readFileSync(paths.jsonFile, 'utf8'))).toEqual(wire);
    expect(readFileSync(paths.envFile, 'utf8')).toBe(
      'CI_RUN_EPOCH_MS=' + origin + '\nCI_DEADLINE_MS=' + (origin + VALIDATION_BUDGET_MS) + '\nCI_BUDGET_KIND=validation\n',
    );
    expect(readFileSync(paths.outputFile, 'utf8')).toContain('budget_json=' + JSON.stringify(wire));
    expect(readFileSync(paths.outputFile, 'utf8')).not.toContain(env.GH_TOKEN);
  });

  it('has a separate, non-publishable diagnostic window bounded to the original expiry plus 90 seconds', () => {
    const validation = budgetFromRun(runMetadata(), { now: () => origin });
    const failure = origin + VALIDATION_BUDGET_MS + 1000;
    const diagnostic = createDiagnosticBudget(validation, { now: () => failure });
    expect(diagnostic.kind).toBe('diagnostic');
    expect(diagnostic.remainingMs()).toBe(DIAGNOSTIC_BUDGET_MS - 1000);
    expect(diagnostic.toJSON().source).toBe('validation-failure-diagnostics');
    expect(() => writeBudgetEnvironment(diagnostic)).toThrow(/Diagnostic/);
    expect(() => createDiagnosticBudget(validation, { now: () => origin + VALIDATION_BUDGET_MS + DIAGNOSTIC_BUDGET_MS })).toThrow(/expired/);
    expect(() => createDiagnosticBudget(diagnostic)).toThrow(/validation/);
  });
});

describe('#659 continuous I/O deadline', () => {
  it('distinguishes lookup-cap expiry from the shared deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(origin);
    const budget = createBudget({ originMs: origin, now: Date.now });
    const capped = budget.signal(10);
    const full = budget.signal();
    await vi.advanceTimersByTimeAsync(10);
    expect(capped.reason.code).toBe('CI_OPERATION_TIMEOUT');
    expect(full.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(VALIDATION_BUDGET_MS - 10);
    expect(full.reason.code).toBe('CI_DEADLINE_EXCEEDED');
    expect(() => budget.signal()).toThrow(/expired/);
  });

  it('bounds fetches even if a fetch implementation ignores the abort signal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(origin + VALIDATION_BUDGET_MS - 20);
    const budget = createBudget({ originMs: origin, fetchImpl: () => new Promise(() => {}) });
    const failed = expect(budget.fetchJson('https://example.invalid')).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
    await vi.advanceTimersByTimeAsync(20);
    await failed;
  });

  it('keeps the original lookup timeout through headers and stalled body consumption', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(origin);
    const budget = createBudget({ originMs: origin, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
    const response = await budget.fetch('https://example.invalid', {}, { maxMs: 50 });
    await vi.advanceTimersByTimeAsync(30);
    const failed = expect(response.json()).rejects.toMatchObject({ code: 'CI_OPERATION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20);
    await failed;
  });

  it('does not accept body data that resolves after the shared deadline', async () => {
    let time = origin;
    const budget = createBudget({
      originMs: origin,
      now: () => time,
      fetchImpl: async () => ({
        ok: true,
        json: async () => {
          time += VALIDATION_BUDGET_MS;
          return { success: true };
        },
      }),
    });
    await expect(budget.fetchJson('https://example.invalid')).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
  });

  it('returns successful JSON/bytes and rejects non-OK HTTP without logging request secrets', async () => {
    const budget = createBudget({ originMs: origin, now: () => origin, fetchImpl: async () => new Response('{"ok":true}') });
    expect(await budget.fetchJson('https://example.invalid')).toEqual({ ok: true });
    expect(Buffer.from(await budget.fetchBytes('https://example.invalid')).toString()).toBe('{"ok":true}');
    const denied = createBudget({ originMs: origin, now: () => origin, fetchImpl: async () => new Response('', { status: 403 }) });
    await expect(denied.fetchJson('https://example.invalid?secret=private-token')).rejects.toThrow('CI HTTP request failed with status 403');
  });
});

describe('#659 command execution', () => {
  it('kills a real long command when its remaining workflow budget expires', async () => {
    const start = Date.now();
    const budget = createBudget({ originMs: start - VALIDATION_BUDGET_MS + 120, killGraceMs: 20 });
    await expect(budget.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { capture: true })).rejects.toMatchObject({
      code: 'CI_DEADLINE_EXCEEDED',
    });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('escalates TERM to KILL against the process group if the child ignores termination', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(origin);
    const child = childProcess(),
      killImpl = vi.fn();
    const budget = createBudget({ originMs: origin, spawnImpl: () => child, killImpl, killGraceMs: 15 });
    const failed = expect(budget.run('fake', [], { maxMs: 10 })).rejects.toMatchObject({ code: 'CI_OPERATION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25);
    await failed;
    expect(killImpl.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4321, 'SIGKILL'],
    ]);
    expect(process.listenerCount('SIGTERM')).toBe(0);
  });

  it('still kills descendants when the direct child exits on TERM', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(origin);
    const child = childProcess(),
      killImpl = vi.fn();
    const budget = createBudget({ originMs: origin, spawnImpl: () => child, killImpl, killGraceMs: 15 });
    const failed = expect(budget.run('fake', [], { maxMs: 10 })).rejects.toMatchObject({ code: 'CI_OPERATION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    child.emit('close', 0, null);
    await failed;
    expect(killImpl.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4321, 'SIGKILL'],
    ]);
  });

  it('rejects a zero exit that arrives after the deadline and does not retry business failures', async () => {
    let time = origin;
    const child = childProcess(),
      spawnImpl = vi.fn(() => child);
    const budget = createBudget({ originMs: origin, now: () => time, spawnImpl });
    const result = budget.run('fake');
    time += VALIDATION_BUDGET_MS;
    child.emit('close', 0, null);
    await expect(result).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
    time = origin;
    const failure = budget.run('fake');
    child.emit('close', 7, null);
    await expect(failure).rejects.toMatchObject({ code: 'CI_COMMAND_FAILED', exitCode: 7 });
    expect(spawnImpl).toHaveBeenCalledTimes(2);
  });

  it('captures real successful output and preserves nonzero exit codes through the CLI', async () => {
    const budget = createBudget({ originMs: Date.now() });
    expect(await budget.run(process.execPath, ['-e', 'process.stdout.write("checked")'], { capture: true })).toMatchObject({
      status: 0,
      stdout: 'checked',
      stderr: '',
    });
    const now = Date.now();
    try {
      execFileSync(process.execPath, [resolve('scripts/ci-budget.mjs'), '--run', '--', process.execPath, '-e', 'process.exit(9)'], {
        env: { ...process.env, ...env, CI_RUN_EPOCH_MS: String(now), CI_DEADLINE_MS: String(now + VALIDATION_BUDGET_MS) },
        stdio: 'pipe',
      });
      expect.fail('The child failure must fail the CLI');
    } catch (error) {
      expect(error).toMatchObject({ status: 9 });
    }
  });

  it('bounds output capture and handles external cancellation as failure', async () => {
    const child = childProcess(),
      killImpl = vi.fn();
    const budget = createBudget({ originMs: origin, now: () => origin, spawnImpl: () => child, killImpl, killGraceMs: 0 });
    const output = expect(budget.run('fake', [], { capture: true, maxBuffer: 2 })).rejects.toMatchObject({ code: 'CI_OUTPUT_LIMIT' });
    child.stdout.write('oversized');
    await output;
    const controller = new AbortController();
    controller.abort();
    await expect(budget.run('fake', [], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(killImpl.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4321, 'SIGKILL'],
    ]);
  });
});
