/** One GitHub-owned deadline for the complete workflow run, including reruns and queues. */
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VALIDATION_BUDGET_MS = 30 * 60 * 1000;
export const DIAGNOSTIC_BUDGET_MS = 90 * 1000;
const LOOKUP_BUDGET_MS = 10 * 1000;
const POSITIVE = /^[1-9]\d*$/;

export class BudgetError extends Error {
  constructor(message, code = 'CI_DEADLINE_EXCEEDED', details = {}) {
    super(message);
    this.name = 'BudgetError';
    this.code = code;
    Object.assign(this, details);
  }
}

function integer(value, label, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error('Invalid ' + label);
  return value;
}

function envInteger(value, label) {
  if (typeof value !== 'string' || !POSITIVE.test(value)) throw new Error('Missing or invalid ' + label);
  return integer(Number(value), label);
}

function optionalId(value, label) {
  return value === undefined || value === null ? null : integer(Number(value), label);
}

function iso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new Error('Invalid ' + label);
  return integer(Date.parse(value), label);
}

function raceSignal(operation, signal) {
  return new Promise((resolvePromise, reject) => {
    const aborted = () => reject(signal.reason ?? new BudgetError('CI operation cancelled', 'CI_CANCELLED'));
    if (signal.aborted) return aborted();
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(operation).then(
      (result) => {
        signal.removeEventListener('abort', aborted);
        resolvePromise(result);
      },
      (error) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      },
    );
  });
}

function combineSignals(first, second) {
  return first ? AbortSignal.any([first, second]) : second;
}

export function createBudget({
  originMs,
  deadlineMs = originMs + VALIDATION_BUDGET_MS,
  kind = 'validation',
  runId,
  runAttempt,
  now = Date.now,
  spawnImpl = spawn,
  fetchImpl = globalThis.fetch,
  killImpl = process.kill,
  killGraceMs = 5000,
} = {}) {
  integer(originMs, 'run origin');
  integer(deadlineMs, 'deadline');
  if (!['validation', 'diagnostic'].includes(kind)) throw new Error('Invalid CI budget kind');
  if (kind === 'validation' && deadlineMs !== originMs + VALIDATION_BUDGET_MS) throw new Error('CI deadline must be run origin plus 30 minutes');
  if (kind === 'diagnostic' && (deadlineMs <= originMs || deadlineMs > originMs + DIAGNOSTIC_BUDGET_MS))
    throw new Error('Diagnostic budget must not exceed 90 seconds');
  integer(killGraceMs, 'kill grace', true);
  if (killGraceMs > 5000) throw new Error('Kill grace must not exceed 5 seconds');
  const run_id = optionalId(runId, 'run id'),
    run_attempt = optionalId(runAttempt, 'run attempt');
  const remainingMs = () => Math.max(0, deadlineMs - integer(now(), 'current time'));
  const assertRemaining = (label = 'CI validation') => {
    const remaining = remainingMs();
    if (!remaining) throw new BudgetError(label + ': the shared workflow deadline has expired', 'CI_DEADLINE_EXCEEDED', { deadlineMs });
    return remaining;
  };
  const signal = (maxMs) => {
    const remaining = assertRemaining();
    if (maxMs !== undefined) integer(maxMs, 'operation cap');
    const wait = Math.min(remaining, maxMs ?? remaining);
    const controller = new AbortController();
    const deadline = wait === remaining;
    const timer = setTimeout(
      () =>
        controller.abort(
          new BudgetError(
            deadline ? 'The shared workflow deadline expired' : 'The CI operation exceeded its bounded lookup budget',
            deadline ? 'CI_DEADLINE_EXCEEDED' : 'CI_OPERATION_TIMEOUT',
            { deadlineMs },
          ),
        ),
      wait,
    );
    timer.unref?.();
    return controller.signal;
  };
  const fetchWithinBudget = async (url, init = {}, { maxMs } = {}) => {
    const active = combineSignals(init.signal, signal(maxMs));
    const response = await raceSignal(
      Promise.resolve().then(() => fetchImpl(url, { ...init, signal: active })),
      active,
    );
    assertRemaining('HTTP response');
    const wrap = (value) =>
      new Proxy(value, {
        get(target, key) {
          if (['arrayBuffer', 'json', 'text', 'blob', 'formData'].includes(key))
            return async (...args) => {
              assertRemaining('HTTP body');
              const body = await raceSignal(
                Promise.resolve().then(() => target[key](...args)),
                active,
              );
              assertRemaining('HTTP body');
              return body;
            };
          if (key === 'clone') return () => wrap(target.clone());
          const property = Reflect.get(target, key, target);
          return typeof property === 'function' ? property.bind(target) : property;
        },
      });
    return wrap(response);
  };
  const read = async (url, init, options, method) => {
    const response = await fetchWithinBudget(url, init, options);
    if (!response.ok) throw new BudgetError('CI HTTP request failed with status ' + response.status, 'CI_HTTP_ERROR', { status: response.status });
    return response[method]();
  };
  const run = (command, args = [], options = {}) => {
    const remaining = assertRemaining('Command');
    if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) throw new Error('Invalid CI command');
    if (options.maxMs !== undefined) integer(options.maxMs, 'command cap');
    const timeoutMs = Math.min(remaining, options.maxMs ?? remaining);
    const deadlineTimeout = timeoutMs === remaining;
    const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
    integer(maxBuffer, 'capture limit');
    const startedAt = now();
    return new Promise((resolvePromise, reject) => {
      let child,
        timer,
        killer,
        settled = false,
        termination;
      const captured = { stdout: [], stderr: [] };
      let capturedBytes = 0;
      const finish = (error, status, exitSignal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(killer);
        process.removeListener('SIGTERM', parentTerminated);
        process.removeListener('SIGINT', parentInterrupted);
        options.signal?.removeEventListener('abort', externalAbort);
        if (!error) {
          try {
            assertRemaining('Command completion');
          } catch (expired) {
            error = expired;
          }
        }
        if (error) reject(error);
        else
          resolvePromise({
            status,
            signal: exitSignal,
            startedAt,
            finishedAt: now(),
            durationMs: now() - startedAt,
            stdout: options.capture ? Buffer.concat(captured.stdout).toString('utf8') : undefined,
            stderr: options.capture ? Buffer.concat(captured.stderr).toString('utf8') : undefined,
          });
      };
      const killGroup = (exitSignal) => {
        if (!child?.pid) return;
        try {
          killImpl(process.platform === 'win32' ? child.pid : -child.pid, exitSignal);
        } catch (error) {
          if (error.code !== 'ESRCH') finish(error);
        }
      };
      const terminate = (error) => {
        if (settled || termination) return;
        termination = error;
        killGroup('SIGTERM');
        killer = setTimeout(() => {
          killGroup('SIGKILL');
          finish(error);
        }, killGraceMs);
      };
      const parentTerminated = () => terminate(new BudgetError('Parent CI process was terminated', 'CI_CANCELLED'));
      const parentInterrupted = () => terminate(new BudgetError('Parent CI process was interrupted', 'CI_CANCELLED'));
      const externalAbort = () => terminate(options.signal.reason ?? new BudgetError('CI command cancelled', 'CI_CANCELLED'));
      if (options.signal?.aborted) return finish(options.signal.reason ?? new BudgetError('CI command cancelled', 'CI_CANCELLED'));
      try {
        child = spawnImpl(command, args, {
          cwd: options.cwd,
          env: options.env ?? process.env,
          detached: process.platform !== 'win32',
          stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : (options.stdio ?? 'inherit'),
          shell: false,
        });
      } catch (error) {
        finish(error);
        return;
      }
      child.once('error', (error) => finish(error));
      child.once('close', (status, exitSignal) => {
        // The direct child can exit on TERM while its descendants still run.
        // Kill the group before clearing the escalation timer in that case.
        if (termination) killGroup('SIGKILL');
        const error =
          termination ??
          (status === 0
            ? null
            : new BudgetError('CI command failed' + (Number.isInteger(status) ? ' with exit ' + status : ' after signal ' + exitSignal), 'CI_COMMAND_FAILED', {
                exitCode: status,
                signal: exitSignal,
              }));
        finish(error, status, exitSignal);
      });
      if (options.capture)
        for (const channel of ['stdout', 'stderr'])
          child[channel]?.on('data', (chunk) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            capturedBytes += data.length;
            if (capturedBytes > maxBuffer) terminate(new BudgetError('CI command capture exceeded its byte limit', 'CI_OUTPUT_LIMIT'));
            else captured[channel].push(data);
          });
      process.once('SIGTERM', parentTerminated);
      process.once('SIGINT', parentInterrupted);
      options.signal?.addEventListener('abort', externalAbort, { once: true });
      timer = setTimeout(
        () =>
          terminate(
            new BudgetError(
              deadlineTimeout ? 'Command exceeded the shared workflow deadline' : 'Command exceeded its bounded operation budget',
              deadlineTimeout ? 'CI_DEADLINE_EXCEEDED' : 'CI_OPERATION_TIMEOUT',
              { deadlineMs },
            ),
          ),
        timeoutMs,
      );
    });
  };
  return Object.freeze({
    originMs,
    deadlineMs,
    kind,
    remainingMs,
    assertRemaining,
    signal,
    run,
    fetch: fetchWithinBudget,
    fetchJson: (url, init, options) => read(url, init, options, 'json'),
    fetchBytes: (url, init, options) => read(url, init, options, 'arrayBuffer'),
    toJSON: () => ({
      version: 1,
      kind,
      origin_ms: originMs,
      deadline_ms: deadlineMs,
      source: kind === 'validation' ? 'github.run.created_at' : 'validation-failure-diagnostics',
      run_id,
      run_attempt,
    }),
  });
}

export function budgetFromRun(run, options = {}) {
  const originMs = iso(run?.created_at, 'GitHub run.created_at');
  return createBudget({
    ...options,
    originMs,
    deadlineMs: originMs + VALIDATION_BUDGET_MS,
    kind: 'validation',
    runId: integer(run?.id, 'run id'),
    runAttempt: integer(run?.run_attempt, 'run attempt'),
  });
}

export function budgetFromEnv(env = process.env, options = {}) {
  if (env.CI_BUDGET_KIND && env.CI_BUDGET_KIND !== 'validation') throw new Error('A validation stage cannot use a diagnostic budget');
  const budget = createBudget({
    ...options,
    originMs: envInteger(env.CI_RUN_EPOCH_MS, 'CI_RUN_EPOCH_MS'),
    deadlineMs: envInteger(env.CI_DEADLINE_MS, 'CI_DEADLINE_MS'),
    kind: 'validation',
    runId: envInteger(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
    runAttempt: envInteger(env.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT'),
  });
  budget.assertRemaining('Stage start');
  return budget;
}

export function createDiagnosticBudget(validation, { now = Date.now, ...options } = {}) {
  if (validation?.kind !== 'validation') throw new Error('Diagnostics must derive from a validation budget');
  const originMs = integer(now(), 'diagnostic start');
  const deadlineMs = Math.min(originMs + DIAGNOSTIC_BUDGET_MS, validation.deadlineMs + DIAGNOSTIC_BUDGET_MS);
  if (deadlineMs <= originMs) throw new BudgetError('The bounded diagnostic window has expired', 'CI_DIAGNOSTIC_EXPIRED');
  const wire = validation.toJSON();
  return createBudget({ ...options, originMs, deadlineMs, kind: 'diagnostic', now, runId: wire.run_id, runAttempt: wire.run_attempt });
}

export async function initializeBudget({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, ...options } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw new Error('Missing or invalid GITHUB_REPOSITORY');
  const id = envInteger(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
    attempt = envInteger(env.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub run metadata requires the configured GitHub token');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new BudgetError('GitHub run epoch lookup exceeded 10 seconds', 'CI_OPERATION_TIMEOUT')), LOOKUP_BUDGET_MS);
  try {
    const run = await raceSignal(
      (async () => {
        const response = await fetchImpl('https://api.github.com/repos/' + env.GITHUB_REPOSITORY + '/actions/runs/' + id, {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          signal: controller.signal,
        });
        if (!response.ok) throw new BudgetError('GitHub run metadata request failed with status ' + response.status, 'CI_HTTP_ERROR');
        return response.json();
      })(),
      controller.signal,
    );
    if (run.id !== id || run.run_attempt !== attempt || run.repository?.full_name !== env.GITHUB_REPOSITORY)
      throw new Error('GitHub run metadata does not match this run and attempt');
    const budget = budgetFromRun(run, { ...options, fetchImpl, now });
    if (env.CI_RUN_EPOCH_MS !== undefined || env.CI_DEADLINE_MS !== undefined || env.CI_BUDGET_KIND !== undefined) {
      const prior = budgetFromEnv(env, { ...options, fetchImpl, now });
      if (prior.originMs !== budget.originMs || prior.deadlineMs !== budget.deadlineMs)
        throw new Error('Previously initialized CI clock does not match GitHub run.created_at');
    }
    budget.assertRemaining('Workflow start');
    return budget;
  } finally {
    clearTimeout(timer);
  }
}

export function writeBudgetEnvironment(budget, { envFile, outputFile, jsonFile } = {}) {
  if (budget?.kind !== 'validation') throw new Error('Diagnostic budgets cannot initialize validation stages');
  budget.assertRemaining('Budget publication');
  const wire = budget.toJSON();
  if (!wire.run_id || !wire.run_attempt) throw new Error('A workflow budget must identify its run and attempt');
  if (envFile) appendFileSync(envFile, 'CI_RUN_EPOCH_MS=' + wire.origin_ms + '\nCI_DEADLINE_MS=' + wire.deadline_ms + '\nCI_BUDGET_KIND=validation\n');
  if (outputFile)
    appendFileSync(outputFile, 'origin_ms=' + wire.origin_ms + '\ndeadline_ms=' + wire.deadline_ms + '\nbudget_json=' + JSON.stringify(wire) + '\n');
  if (jsonFile) writeFileSync(jsonFile, JSON.stringify(wire) + '\n');
  return wire;
}

async function main(args = process.argv.slice(2), env = process.env) {
  if (args[0] === '--init' && (args.length === 1 || (args.length === 3 && args[1] === '--out'))) {
    const budget = await initializeBudget({ env });
    const wire = writeBudgetEnvironment(budget, { envFile: env.GITHUB_ENV, outputFile: env.GITHUB_OUTPUT, jsonFile: args[2] });
    console.log(JSON.stringify(wire));
    return;
  }
  if (args.length === 1 && args[0] === '--assert') {
    budgetFromEnv(env).assertRemaining();
    return;
  }
  if (args[0] === '--run' && args[1] === '--' && args.length >= 3) {
    await budgetFromEnv(env).run(args[2], args.slice(3));
    return;
  }
  throw new Error('Usage: ci-budget.mjs --init [--out file] | --assert | --run -- command [args]');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.code === 'CI_DEADLINE_EXCEEDED' ? 124 : Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
  });
