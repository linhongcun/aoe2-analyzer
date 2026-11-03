/** Read-only timing collection runs independently after the source workflow has actually completed. */
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetFromEnv } from './ci-budget.mjs';
import { githubApi, runJobs, pages, artifactDownloader } from './ci-api.mjs';
import { summarizeRunTiming, summarizeChainTiming, formatTimingMarkdown } from './ci-timing.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export async function collectRun({ budget, api, repository, runId }) {
  assert.match(String(runId), /^[1-9]\d*$/, 'Expected an exact timing run ID');
  const run = await api(`repos/${repository}/actions/runs/${runId}`);
  const jobs = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) jobs.push(...(await runJobs(api, repository, run.id, attempt)));
  const browserNames = [...new Set(jobs.filter((j) => /^browser-[1-4]$/.test(j.name)).map((j) => j.name))];
  const dependencies =
    run.name === 'CI / Deploy'
      ? {
          plan: [],
          static: ['plan'],
          'static-main': ['plan'],
          unit: ['plan'],
          data: ['plan'],
          build: ['plan'],
          'browser-1': ['plan', 'build'],
          'browser-2': ['plan', 'build'],
          'browser-3': ['plan', 'build'],
          'browser-4': ['plan', 'build'],
          test: ['plan', 'static', 'static-main', 'unit', 'data', 'build', ...browserNames],
          deploy: ['test'],
        }
      : { prepare: [], release: ['prepare'] };
  const report = summarizeRunTiming({ run, jobs, dependencies });
  budget.assertRemaining('collected timing');
  return { run, jobs, report };
}
export async function reportRun({ budget, api, repository, runId, output }) {
  const { run, report } = await collectRun({ budget, api, repository, runId });
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n[${run.name} #${run.run_number}, attempt ${run.run_attempt}](${run.html_url})\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
    );
  console.log(JSON.stringify(report));
  budget.assertRemaining('timing report');
  return report;
}
function ownedArtifact(artifact, run, jobs, jobName) {
  const job = jobs.find((j) => j.name === jobName && j.run_attempt === run.run_attempt && j.status === 'completed' && j.conclusion === 'success');
  assert.ok(job, 'Missing trusted source job');
  assert.equal(artifact.workflow_run?.id, run.id);
  assert.equal(artifact.workflow_run?.head_sha, run.head_sha);
  assert.equal(artifact.expired, false);
  assert.ok(Date.parse(artifact.expires_at) > Date.now());
  assert.ok(
    Date.parse(artifact.created_at) >= Date.parse(job.started_at) && Date.parse(artifact.created_at) <= Date.parse(job.completed_at) + 999,
    'Stale source artifact',
  );
  assert.ok(Date.parse(artifact.updated_at) <= Date.parse(job.completed_at) + 999, 'Source artifact changed after job');
}
export async function reportDelivery({ budget, api, repository, runId, output, download = artifactDownloader(budget) }) {
  const release = await collectRun({ budget, api, repository, runId });
  if (release.run.name !== 'Release') return reportRun({ budget, api, repository, runId, output });
  const bundle = { version: 1, kind: 'delivery-observation', release: release.report, main: null, pr: [], chain: null, sourceReason: null };
  try {
    assert.equal(release.run.repository.full_name, repository);
    assert.equal(release.run.path, '.github/workflows/release.yml');
    const artifacts = await pages(api, `repos/${repository}/actions/runs/${runId}/artifacts`, 'artifacts');
    const sources = artifacts.filter((a) => a.name === 'release-source' && !a.expired);
    assert.equal(sources.length, 1, 'No exact Release source receipt');
    ownedArtifact(sources[0], release.run, release.jobs, 'prepare');
    const { receipt: source } = await download(sources[0]);
    assert.equal(source.schema, 1);
    assert.equal(source.release_run_id, release.run.id);
    assert.equal(source.release_run_attempt, release.run.run_attempt);
    assert.ok(source.source_ci_run_id, source.reason || 'Exact source CI unknown');
    const main = await collectRun({ budget, api, repository, runId: source.source_ci_run_id });
    assert.equal(main.run.run_attempt, source.source_ci_run_attempt);
    assert.equal(main.run.head_sha, source.source_commit);
    assert.equal(main.run.name, 'CI / Deploy');
    assert.equal(main.run.path, '.github/workflows/ci.yml');
    assert.equal(main.run.event, 'push');
    assert.equal(main.run.head_branch, 'main');
    assert.equal(main.run.repository.full_name, repository);
    bundle.main = main.report;
    const mainArtifacts = await pages(api, `repos/${repository}/actions/runs/${main.run.id}/artifacts`, 'artifacts');
    const gates = mainArtifacts.filter((a) => a.name === 'ci-validation-evidence' && !a.expired);
    assert.equal(gates.length, 1, 'Missing exact main gate');
    ownedArtifact(gates[0], main.run, main.jobs, 'test');
    const { receipt: gate } = await download(gates[0]);
    assert.equal(gate.version, 2);
    assert.equal(gate.run_id, main.run.id);
    assert.equal(gate.run_attempt, main.run.run_attempt);
    assert.equal(gate.tested_commit, source.source_commit);
    const ids = [...new Set(gate.stages.map((s) => s.source.run_id))].filter((id) => id !== main.run.id);
    for (const id of ids) {
      const candidate = await collectRun({ budget, api, repository, runId: id });
      if (candidate.run.event === 'pull_request') bundle.pr.push(candidate.report);
    }
    const commit = await api(`repos/${repository}/git/commits/${source.source_commit}`);
    bundle.chain = summarizeChainTiming({
      pr: bundle.pr,
      main: bundle.main,
      release: release.report,
      commit: { sha: source.source_commit, authoredAt: commit.author?.date, committedAt: commit.committer?.date },
    });
  } catch (error) {
    budget.assertRemaining('delivery observation source lookup');
    bundle.sourceReason = error.message;
  }
  if (output) writeFileSync(output, JSON.stringify(bundle, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const reports = [...bundle.pr, ...(bundle.main ? [bundle.main] : []), bundle.release];
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      reports.map(formatTimingMarkdown).join('\n') +
        (bundle.chain ? formatTimingMarkdown(bundle.chain) : `\nExact delivery chain unavailable: ${bundle.sourceReason}\n`),
    );
  }
  console.log(JSON.stringify(bundle));
  budget.assertRemaining('delivery timing report');
  return bundle;
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const budget = budgetFromEnv();
  reportDelivery({
    budget,
    api: githubApi(budget),
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.SOURCE_TIMING_RUN_ID || process.env.GITHUB_RUN_ID,
    output: process.env.CI_TIMING_OUTPUT,
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
