/** Timing derived from GitHub run/job metadata, with missing observations kept explicit. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VALIDATION_BUDGET_MS } from './ci-budget.mjs';

export const TIMING_SCHEMA_VERSION = 1;

function timestamp(value, label, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Invalid ' + label);
  return parsed;
}

function positive(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid ' + label);
  return value;
}

function checkDependencies(dependencies) {
  const visiting = new Set(),
    visited = new Set();
  const visit = (name) => {
    if (visiting.has(name)) throw new Error('Cyclic job dependency: ' + name);
    if (visited.has(name)) return;
    const parents = dependencies[name] ?? [];
    if (!Array.isArray(parents) || parents.some((parent) => typeof parent !== 'string' || !parent) || new Set(parents).size !== parents.length)
      throw new Error('Invalid job dependencies: ' + name);
    visiting.add(name);
    parents.forEach(visit);
    visiting.delete(name);
    visited.add(name);
  };
  Object.keys(dependencies).forEach(visit);
}

/** Pass jobs from every attempt, not only /runs/{id}/jobs' default latest attempt. */
export function summarizeRunTiming({ run, jobs, dependencies = {} }) {
  const runId = positive(run?.id, 'run id'),
    runAttempt = positive(run?.run_attempt, 'run attempt');
  const originMs = timestamp(run.created_at, 'run.created_at');
  const completedAtMs = run.status === 'completed' ? timestamp(run.updated_at, 'completed run.updated_at') : null;
  if (completedAtMs !== null && completedAtMs < originMs) throw new Error('Run completion precedes creation');
  if (!Array.isArray(jobs)) throw new Error('All-attempt jobs must be an array');
  checkDependencies(dependencies);
  const ids = new Set(),
    issues = [];
  const observed = jobs.map((job) => {
    const id = positive(job.id, 'job id'),
      attempt = positive(job.run_attempt, 'job run attempt');
    if (ids.has(id)) throw new Error('Duplicate job id across attempts: ' + id);
    ids.add(id);
    if (attempt > runAttempt || (job.run_id !== undefined && job.run_id !== runId)) throw new Error('Job belongs to a different run or attempt');
    if (typeof job.name !== 'string' || !job.name) throw new Error('Invalid job name');
    const allocated = job.runner_id > 0 || (Array.isArray(job.steps) && job.steps.length > 0);
    const unallocated = !allocated && (job.conclusion === 'skipped' || job.runner_id === 0 || job.runner_id === null);
    const reportedStartedAtMs = timestamp(job.started_at, 'job.started_at', true);
    const reportedFinishedAtMs = timestamp(job.completed_at, 'job.completed_at', true);
    // GitHub can report reversed synthetic timestamps for jobs that never ran.
    // Preserve those observations without treating them as execution or readiness.
    const startedAtMs = unallocated ? null : reportedStartedAtMs;
    const finishedAtMs = unallocated ? null : reportedFinishedAtMs;
    if ((startedAtMs !== null && startedAtMs < originMs) || (finishedAtMs !== null && (startedAtMs === null || finishedAtMs < startedAtMs)))
      throw new Error('Invalid job chronology: ' + id);
    if (completedAtMs !== null && finishedAtMs !== null && finishedAtMs > completedAtMs) throw new Error('Job finishes after run completion: ' + id);
    const durationMs = startedAtMs !== null && finishedAtMs !== null ? finishedAtMs - startedAtMs : null;
    const runnerMs = allocated ? durationMs : unallocated ? 0 : null;
    if (runnerMs === null) issues.push('Missing runner allocation or completed duration for job ' + id);
    if (job.status !== 'completed') issues.push('Job ' + id + ' is ' + (job.status ?? 'unknown'));
    return {
      id,
      name: job.name,
      attempt,
      status: job.status ?? null,
      conclusion: job.conclusion ?? null,
      runnerId: job.runner_id ?? null,
      runnerAllocated: allocated ? true : unallocated ? false : null,
      reportedStartedAtMs,
      reportedFinishedAtMs,
      startedAtMs,
      finishedAtMs,
      durationMs,
      runnerMs,
      dependencyReadyAtMs: null,
      dependencyQueueMs: null,
      dependencyJobIds: [],
      queueReason: null,
    };
  });
  const parentFor = (name, job) =>
    observed
      .filter((parent) => parent.name === name && parent.attempt <= job.attempt && parent.finishedAtMs !== null && parent.finishedAtMs <= job.startedAtMs)
      .sort((a, b) => b.finishedAtMs - a.finishedAtMs || b.attempt - a.attempt)[0];
  for (const job of observed) {
    if (job.runnerAllocated === false) {
      job.queueReason = 'Job had no allocated runner; execution and dependency queue were not observed';
      continue;
    }
    if (job.startedAtMs === null) {
      job.queueReason = 'Job has no observed start';
      continue;
    }
    const parents = dependencies[job.name];
    if (parents === undefined) {
      job.queueReason = 'Dependency metadata was not supplied';
      continue;
    }
    const found = parents.map((name) => parentFor(name, job));
    if (found.some((parent) => !parent)) {
      job.queueReason = 'A completed dependency was not observed before this job started';
      continue;
    }
    job.dependencyJobIds = found.map((parent) => parent.id);
    job.dependencyReadyAtMs = Math.max(originMs, ...found.map((parent) => parent.finishedAtMs));
    job.dependencyQueueMs = job.startedAtMs - job.dependencyReadyAtMs;
  }
  for (const job of observed)
    if (job.queueReason !== null && job.runnerAllocated !== false) issues.push('Unknown dependency queue for job ' + job.id + ': ' + job.queueReason);
  const started = observed.filter((job) => job.startedAtMs !== null && job.runnerAllocated !== false);
  const finished = observed.filter((job) => job.finishedAtMs !== null);
  const last = [...finished].sort((a, b) => b.finishedAtMs - a.finishedAtMs)[0];
  const path = [];
  let cursor = last;
  while (cursor) {
    path.unshift(cursor.id);
    cursor = cursor.dependencyJobIds.map((id) => observed.find((job) => job.id === id)).sort((a, b) => b.finishedAtMs - a.finishedAtMs)[0];
  }
  const attemptsObserved = [...new Set(observed.map((job) => job.attempt))].sort((a, b) => a - b);
  const missingAttempts = Array.from({ length: runAttempt }, (_, i) => i + 1).filter((attempt) => !attemptsObserved.includes(attempt));
  if (missingAttempts.length) issues.push('Missing jobs from run attempts: ' + missingAttempts.join(', '));
  if (completedAtMs === null) issues.push('Run has no completed timestamp');
  const knownRunnerMs = observed.reduce((sum, job) => sum + (job.runnerMs ?? 0), 0);
  const runnerMs = missingAttempts.length || observed.some((job) => job.runnerMs === null) ? null : knownRunnerMs;
  const slowestShard = observed.filter((job) => /browser/i.test(job.name) && job.durationMs !== null).sort((a, b) => b.durationMs - a.durationMs)[0];
  const wallMs = completedAtMs === null ? null : completedAtMs - originMs;
  return {
    version: TIMING_SCHEMA_VERSION,
    kind: 'run',
    runId,
    runAttempt,
    url: run.html_url ?? null,
    event: run.event ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    originMs,
    completedAtMs,
    deadlineMs: originMs + VALIDATION_BUDGET_MS,
    wallMs,
    withinValidationBudget: wallMs === null ? null : wallMs <= VALIDATION_BUDGET_MS,
    initialQueueMs: started.length ? Math.min(...started.map((job) => job.startedAtMs)) - originMs : null,
    jobsSpanMs: last ? last.finishedAtMs - originMs : null,
    attemptsObserved,
    missingAttempts,
    runnerMs,
    runnerMinutes: runnerMs === null ? null : runnerMs / 60000,
    knownRunnerMs,
    slowestShard: slowestShard ? { jobId: slowestShard.id, name: slowestShard.name, attempt: slowestShard.attempt, durationMs: slowestShard.durationMs } : null,
    criticalPathJobIds: path,
    criticalPathComplete: path.length > 0 && path.every((id) => observed.find((job) => job.id === id).queueReason === null),
    jobs: observed,
    complete: issues.length === 0,
    issues,
    sources: {
      origin: 'github.run.created_at',
      completion: 'github.run.updated_at (completed runs only)',
      runner: 'sum of allocated GitHub job started_at→completed_at across all attempts; not billed minutes',
      queue: 'job.started_at minus latest completed declared dependency; roots use run.created_at',
    },
  };
}

/** Cross-run chronology is separate from each run's 30-minute validation deadline. */
export function summarizeChainTiming({ pr = [], main, release = null, commit = {}, deploymentJobName = 'deploy' }) {
  if (
    !Array.isArray(pr) ||
    !main ||
    [main, ...pr, ...(release ? [release] : [])].some((report) => report?.kind !== 'run' || report.version !== TIMING_SCHEMA_VERSION)
  )
    throw new Error('Chain timing requires run timing reports');
  const reports = [...pr, main, ...(release ? [release] : [])];
  if (new Set(reports.map((report) => report.runId)).size !== reports.length) throw new Error('Duplicate run in delivery chain');
  const firstPrOriginMs = pr.length ? Math.min(...pr.map((report) => report.originMs)) : null;
  const lastPrCompletionMs = pr.length && pr.every((report) => report.completedAtMs !== null) ? Math.max(...pr.map((report) => report.completedAtMs)) : null;
  const deploys = main.jobs.filter((job) => job.name === deploymentJobName && job.finishedAtMs !== null);
  const deployment = deploys.sort((a, b) => b.attempt - a.attempt || b.finishedAtMs - a.finishedAtMs)[0];
  const deployedAtMs = deployment?.conclusion === 'success' ? deployment.finishedAtMs : null;
  const serverPushedAtMs = timestamp(commit.serverPushedAt, 'server push receipt timestamp', true);
  if (serverPushedAtMs !== null && !commit.serverPushSource) throw new Error('Server push receipt requires an explicit authoritative source');
  const authoredAtMs = timestamp(commit.authoredAt, 'commit authored timestamp', true);
  const committedAtMs = timestamp(commit.committedAt, 'commit committed timestamp', true);
  const interval = (end, start, label) => {
    if (end === null || start === null) return null;
    if (end < start) throw new Error('Invalid chain chronology: ' + label);
    return end - start;
  };
  const runnerMs = reports.every((report) => report.runnerMs !== null) ? reports.reduce((sum, report) => sum + report.runnerMs, 0) : null;
  return {
    version: TIMING_SCHEMA_VERSION,
    kind: 'chain',
    runIds: { pr: pr.map((report) => report.runId), main: main.runId, release: release?.runId ?? null },
    firstPrOriginMs,
    mainOriginMs: main.originMs,
    deployedAtMs,
    releaseOriginMs: release?.originMs ?? null,
    releasedAtMs: release?.completedAtMs ?? null,
    prToMainMs: interval(main.originMs, lastPrCompletionMs, 'PR completion to main creation (includes review/merge)'),
    mainToDeployMs: interval(deployedAtMs, main.originMs, 'main to deployment'),
    deployToReleaseMs: interval(release?.originMs ?? null, deployedAtMs, 'deployment to Release start'),
    prToDeployMs: interval(deployedAtMs, firstPrOriginMs, 'PR to deployment'),
    prToReleaseMs: interval(release?.completedAtMs ?? null, firstPrOriginMs, 'PR to Release completion'),
    commitToDeployMs: interval(deployedAtMs, serverPushedAtMs, 'server push receipt to deployment'),
    commit: {
      sha: commit.sha ?? null,
      serverPushedAtMs,
      serverPushSource: commit.serverPushSource ?? null,
      authoredAtMs,
      committedAtMs,
      latencyOrigin: serverPushedAtMs === null ? 'Unknown: Git commit authored/committed timestamps are not server push receipts' : commit.serverPushSource,
    },
    runnerMs,
    runnerMinutes: runnerMs === null ? null : runnerMs / 60000,
    complete: reports.every((report) => report.complete) && deployedAtMs !== null && release !== null && release.completedAtMs !== null,
    sources: {
      chronology: 'GitHub run.created_at / completed run.updated_at and successful deploy job.completed_at',
      commit: 'Git timestamps retained as metadata only unless an authoritative server push receipt is explicitly supplied',
      prToMain: 'Includes review, merge and scheduling between the latest observed PR completion and main run creation',
    },
  };
}

export function formatTimingMarkdown(report) {
  const seconds = (ms) => (ms === null || ms === undefined ? '未知' : (ms / 1000).toFixed(1) + ' s');
  if (report.kind === 'chain')
    return [
      '### PR → main → deploy → Release 实测',
      '',
      '| 指标 | 实测 |',
      '| --- | ---: |',
      '| PR → main 等待（含审阅/合并） | ' + seconds(report.prToMainMs) + ' |',
      '| main → 部署 | ' + seconds(report.mainToDeployMs) + ' |',
      '| 部署 → Release 开始 | ' + seconds(report.deployToReleaseMs) + ' |',
      '| 首次 PR → 部署 | ' + seconds(report.prToDeployMs) + ' |',
      '| 首次 PR → Release 完成 | ' + seconds(report.prToReleaseMs) + ' |',
      '| 服务端收到提交 → 部署 | ' + seconds(report.commitToDeployMs) + ' |',
      '| 全部运行及 attempt 的 runner 时间 | ' + seconds(report.runnerMs) + ' |',
      '',
      report.commit.latencyOrigin,
      '',
    ].join('\n');
  return [
    '### CI 实测（run ' + report.runId + '，attempt ' + report.runAttempt + '）',
    '',
    '| 指标 | 实测 |',
    '| --- | ---: |',
    '| 整体墙钟（含排队） | ' + seconds(report.wallMs) + ' |',
    '| 初始排队 | ' + seconds(report.initialQueueMs) + ' |',
    '| 全部 attempt 的 runner 时间 | ' + seconds(report.runnerMs) + ' |',
    '| 最慢浏览器片 | ' + seconds(report.slowestShard?.durationMs) + ' |',
    '',
    '关键路径 job ID：' + (report.criticalPathJobIds.join(' → ') || '未知'),
    '',
    '| Job ID | Attempt | 依赖就绪后的排队 | 运行时间 |',
    '| --- | ---: | ---: | ---: |',
    ...report.jobs.map((job) => '| ' + job.id + ' | ' + job.attempt + ' | ' + seconds(job.dependencyQueueMs) + ' | ' + seconds(job.durationMs) + ' |'),
    '',
    ...report.issues.map((issue) => '- ' + issue),
    '',
  ].join('\n');
}

function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--chain', '--out', '--markdown'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid timing CLI arguments');
    options[args[i]] = args[i + 1];
  }
  if ((!options['--input'] && !options['--chain']) || (options['--input'] && options['--chain']) || !options['--out'])
    throw new Error('Usage: ci-timing.mjs (--input metadata.json | --chain chain.json) --out report.json [--markdown report.md]');
  const input = JSON.parse(readFileSync(options['--input'] ?? options['--chain'], 'utf8'));
  const report = options['--chain'] ? summarizeChainTiming(input) : summarizeRunTiming(input);
  writeFileSync(options['--out'], JSON.stringify(report, null, 2) + '\n');
  if (options['--markdown']) writeFileSync(options['--markdown'], formatTimingMarkdown(report));
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
