#!/usr/bin/env node
/**
 * CI / Deploy prepare 与 Release 工作流纯决策和执行辅助脚本（#1528）。
 *
 * 仅依赖 Node 内置模块与 scripts/release-notes.mjs（零第三方依赖），供 .github/workflows/ci.yml
 * 的 prepare job 与 .github/workflows/release.yml 的上游 run 校验调用。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyReleaseNotes, checkReleaseNotes } from './release-notes.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_ID_RE = /^[1-9]\d*$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA_RE.test(value)) throw new Error(`${label} 必须是 40 位提交 SHA，收到「${value}」`);
}

/**
 * 校验 Release 工作流的上游 CI / Deploy run 与 check/deploy 作业状态。
 * - 自动 workflow_run：仅当 check 或 deploy 被跳过（如 bump-only / superseded / deploy=false）时优雅返回 eligible=false；
 * - 手工 workflow_dispatch：传入任何无效或未完成部署的 ci_run_id 一律报错。
 */
export function resolveReleaseSourceRun({ eventName, ciRunId, repository, run, jobs }) {
  const idText = String(ciRunId ?? '').trim();
  if (!RUN_ID_RE.test(idText)) throw new Error(`CI_RUN_ID 必须是正整数，收到「${idText}」`);
  if (!REPO_RE.test(String(repository ?? ''))) throw new Error(`仓库标识非法：${repository}`);
  if (!run || typeof run !== 'object') throw new Error('缺少上游 CI / Deploy run 数据');
  if (
    run.name !== 'CI / Deploy' ||
    run.path !== '.github/workflows/ci.yml' ||
    !['push', 'workflow_dispatch'].includes(run.event) ||
    run.head_branch !== 'main' ||
    run.head_repository?.full_name !== repository ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !SHA_RE.test(String(run.head_sha ?? ''))
  ) {
    throw new Error(
      `上游运行 #${idText} 不是同仓库 main 成功完成的 CI / Deploy（name=${run.name}, path=${run.path}, event=${run.event}, branch=${run.head_branch}, status=${run.status}, conclusion=${run.conclusion}）`,
    );
  }
  if (!Array.isArray(jobs)) throw new Error(`上游运行 #${idText} 缺少 jobs 列表`);
  const checkJobs = jobs.filter((job) => job?.name === 'check');
  const deployJobs = jobs.filter((job) => job?.name === 'deploy');
  const allSucceeded = (list) => list.length > 0 && list.every((job) => job.status === 'completed' && job.conclusion === 'success');
  const checkOk = allSucceeded(checkJobs);
  const deployOk = allSucceeded(deployJobs);
  if (checkOk && deployOk) {
    return { eligible: true, sha: run.head_sha, reason: '上游 CI / Deploy 的 check 与 deploy 均成功' };
  }
  const hasBadOutcome = [...checkJobs, ...deployJobs].some((job) => job.status !== 'completed' || !['success', 'skipped'].includes(job.conclusion));
  if (eventName === 'workflow_run' && !hasBadOutcome) {
    return {
      eligible: false,
      sha: run.head_sha,
      reason: '上游 CI / Deploy 未执行 Pages 部署（check 或 deploy 为 skipped，如仅版本汇总、被新提交取代或只读手动运行），跳过 Release',
    };
  }
  throw new Error(
    `上游运行 #${idText} 未同时完成成功的 check 与 deploy（check=${checkJobs.map((j) => j.conclusion ?? j.status).join(',') || 'missing'}，deploy=${deployJobs.map((j) => j.conclusion ?? j.status).join(',') || 'missing'}）`,
  );
}

/**
 * 决定 ci.yml prepare 作业在 main 分支上的动作，闭合并发队列双向取消与假绿防呆。
 */
export function decidePrepareAction({ eventName, ref, headSha, remoteSha, expectedSha = '', pendingCount, deployInput = false }) {
  if (ref !== 'refs/heads/main') throw new Error(`prepare 仅允许在 refs/heads/main 运行，收到 ${ref}`);
  requireSha(headSha, 'GITHUB_SHA');
  requireSha(remoteSha, 'origin/main');
  if (!Number.isSafeInteger(pendingCount) || pendingCount < 0) throw new Error(`pendingCount 非法：${pendingCount}`);

  const isDispatch = eventName === 'workflow_dispatch';
  if (isDispatch && !deployInput) throw new Error('只读 workflow_dispatch（deploy!=true）不应进入 prepare');
  const expected = String(expectedSha ?? '').trim();
  if (expected && !SHA_RE.test(expected)) throw new Error(`expected_sha 必须是 40 位提交 SHA，收到「${expected}」`);

  if (isDispatch && expected) {
    if (headSha === expected) {
      if (pendingCount > 0) {
        throw new Error(`不变量破坏：已递增提交 ${headSha.slice(0, 7)} 仍残留 ${pendingCount} 份待消费发布片段，拒绝循环触发`);
      }
      if (remoteSha !== headSha) {
        return { action: 'superseded', checkRemoteRun: true, reason: `origin/main（${remoteSha.slice(0, 7)}）已领先预期发布提交 ${headSha.slice(0, 7)}` };
      }
      return { action: 'direct', checkRemoteRun: false, reason: '预期发布提交与 origin/main 一致且无待消费片段，直接构建部署' };
    }
    if (remoteSha === expected) {
      throw new Error(`Git/API 同步延迟：workflow_dispatch 检出旧提交 ${headSha.slice(0, 7)}，而 origin/main 已是 ${expected.slice(0, 7)}，请重试派发`);
    }
    if (remoteSha === headSha) {
      if (pendingCount > 0) {
        return { action: 'bump', checkRemoteRun: false, reason: '命中并发反向接管：当前尖端含新待发布片段，直接消费并递增' };
      }
      return { action: 'direct', checkRemoteRun: false, reason: '命中并发反向接管：当前尖端无待发布片段，直接构建部署自愈发版' };
    }
    return { action: 'superseded', checkRemoteRun: true, reason: `origin/main（${remoteSha.slice(0, 7)}）已进一步领先，交由最新尖端处理` };
  }

  if (remoteSha !== headSha) {
    if (isDispatch) {
      throw new Error(`手动部署检出 ${headSha.slice(0, 7)} 落后于 origin/main（${remoteSha.slice(0, 7)}），请在最新 main 重试`);
    }
    return {
      action: 'superseded',
      checkRemoteRun: false,
      reason: `origin/main（${remoteSha.slice(0, 7)}）已领先当前 push（${headSha.slice(0, 7)}），退让合并处理`,
    };
  }
  if (pendingCount > 0) return { action: 'bump', checkRemoteRun: false, reason: `发现 ${pendingCount} 份待发布片段，执行统一版本递增` };
  return { action: 'direct', checkRemoteRun: false, reason: '无待发布片段，直接进入 check 与 deploy' };
}

export function classifyPushFailure({ baseSha, bumpSha, newRemoteSha }) {
  requireSha(baseSha, 'baseSha');
  requireSha(bumpSha, 'bumpSha');
  requireSha(newRemoteSha, 'newRemoteSha');
  if (newRemoteSha === bumpSha) return 'already-pushed';
  if (newRemoteSha !== baseSha) return 'superseded';
  return 'failed';
}

export function classifyApiMainSha({ baseSha, bumpSha, apiSha }) {
  requireSha(baseSha, 'baseSha');
  requireSha(bumpSha, 'bumpSha');
  requireSha(apiSha, 'apiSha');
  if (apiSha === bumpSha) return 'ready';
  if (apiSha !== baseSha) return 'moved';
  return 'stale';
}

export function hasActiveOrSucceededRun(runs) {
  if (!Array.isArray(runs)) return false;
  return runs.some((run) => run && (run.status !== 'completed' || run.conclusion === 'success'));
}

function writeGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(values)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function ghApiJson(endpoint, { paginate = false } = {}) {
  const args = ['api', endpoint];
  if (paginate) args.push('--paginate', '--slurp');
  const res = spawnSync('gh', args, { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`gh api ${endpoint} 失败：${(res.stderr || res.stdout || '').trim()}`);
  return JSON.parse(res.stdout);
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function sleepMs(ms) {
  const arr = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(arr, 0, 0, ms);
}

function dispatchCiDeploy(expectedSha) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = spawnSync('gh', ['workflow', 'run', 'ci.yml', '--ref', 'main', '-f', 'deploy=true', '-f', `expected_sha=${expectedSha}`], {
      encoding: 'utf8',
    });
    if (res.status === 0) return;
    const msg = (res.stderr || res.stdout || '').trim();
    if (attempt < 2) {
      console.warn(`gh workflow run 第 ${attempt} 次失败，5 秒后重试：${msg}`);
      sleepMs(5000);
      continue;
    }
    throw new Error(`派发 CI / Deploy 失败（可手工恢复：gh workflow run ci.yml --ref main -f deploy=true -f expected_sha=${expectedSha}）：${msg}`);
  }
}

function runResolveRelease() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const ciRunId = process.env.CI_RUN_ID ?? '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const run = ghApiJson(`repos/${repository}/actions/runs/${ciRunId}`);
  const jobPages = ghApiJson(`repos/${repository}/actions/runs/${ciRunId}/jobs?filter=latest&per_page=100`, { paginate: true });
  const jobs = Array.isArray(jobPages) ? jobPages.flatMap((page) => page?.jobs ?? []) : [];
  const result = resolveReleaseSourceRun({ eventName, ciRunId, repository, run, jobs });
  console.log(result.reason);
  writeGithubOutput({ eligible: result.eligible, sha: result.sha });
  return 0;
}

function runPrepare(root = process.cwd()) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const ref = process.env.GITHUB_REF ?? '';
  const headSha = process.env.GITHUB_SHA ?? git(root, 'rev-parse', 'HEAD');
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const expectedSha = process.env.EXPECTED_SHA ?? '';
  const deployInput = process.env.DEPLOY_INPUT === 'true';

  git(root, 'fetch', '-q', 'origin', 'main');
  const remoteSha = git(root, 'rev-parse', 'origin/main');
  const checked = checkReleaseNotes(root);
  if (checked.errors.length) {
    throw new Error(`发布片段或版本一致性校验失败（${checked.errors.length} 项）：\n${checked.errors.map((e) => `- ${e}`).join('\n')}`);
  }

  const decision = decidePrepareAction({
    eventName,
    ref,
    headSha,
    remoteSha,
    expectedSha,
    pendingCount: checked.fragments.length,
    deployInput,
  });
  console.log(`prepare 决策：${decision.action}（${decision.reason}）`);

  if (decision.action === 'superseded') {
    if (decision.checkRemoteRun && repository) {
      const data = ghApiJson(`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&head_sha=${remoteSha}&per_page=20`);
      if (!hasActiveOrSucceededRun(data?.workflow_runs)) {
        console.log(`检测到最新尖端 ${remoteSha.slice(0, 7)} 缺少未取消的 CI / Deploy 运行，自动补派发`);
        dispatchCiDeploy(remoteSha);
      }
    }
    writeGithubOutput({ action: 'superseded', bump_sha: '', version: `v${checked.version}` });
    return 0;
  }

  if (decision.action === 'direct') {
    writeGithubOutput({ action: 'direct', bump_sha: '', version: `v${checked.version}` });
    return 0;
  }

  const applied = applyReleaseNotes(root);
  if (!applied.changed) throw new Error('内部错误：待消费片段非空但未产生变更');

  git(root, 'add', '-A', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'release-notes');
  git(root, '-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, 'commit', '-m', `chore(release): v${applied.version}`);
  const bumpSha = git(root, 'rev-parse', 'HEAD');

  const pushRes = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { cwd: root, encoding: 'utf8' });
  if (pushRes.status !== 0) {
    git(root, 'fetch', '-q', 'origin', 'main');
    const newRemoteSha = git(root, 'rev-parse', 'origin/main');
    const outcome = classifyPushFailure({ baseSha: headSha, bumpSha, newRemoteSha });
    if (outcome === 'superseded') {
      console.log(`推送期间检测到并发合入领先（origin/main=${newRemoteSha.slice(0, 7)}），退让交由新提交统一消费`);
      writeGithubOutput({ action: 'superseded', bump_sha: '', version: `v${applied.version}` });
      return 0;
    }
    if (outcome === 'failed') {
      throw new Error(`推送版本递增提交失败：${(pushRes.stderr || pushRes.stdout || '').trim()}`);
    }
    console.log(`推送断连但远端已落盘 ${bumpSha.slice(0, 7)}，继续派发 CI / Deploy`);
  }

  let apiOutcome = 'stale';
  let lastApiSha = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const refObj = ghApiJson(`repos/${repository}/git/ref/heads/main`);
    lastApiSha = String(refObj?.object?.sha ?? '');
    if (SHA_RE.test(lastApiSha)) {
      apiOutcome = classifyApiMainSha({ baseSha: headSha, bumpSha, apiSha: lastApiSha });
      if (apiOutcome !== 'stale') break;
    }
    if (attempt < 3) sleepMs(2000);
  }
  if (apiOutcome === 'stale') {
    throw new Error(
      `远端 API 尚未同步 ${bumpSha.slice(0, 7)}（当前仍见 ${lastApiSha.slice(0, 7)}）；请手工恢复：gh workflow run ci.yml --ref main -f deploy=true -f expected_sha=${bumpSha}`,
    );
  }
  if (apiOutcome === 'moved') {
    console.log(`推送后已有新提交 ${lastApiSha.slice(0, 7)} 落盘 main，跳过冗余派发，由新提交的 push 运行接管`);
  } else {
    dispatchCiDeploy(bumpSha);
    console.log(`已派发 CI / Deploy（deploy=true, expected_sha=${bumpSha.slice(0, 7)}）`);
  }
  writeGithubOutput({ action: 'bumped', bump_sha: bumpSha, version: `v${applied.version}` });
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--resolve-run') return runResolveRelease();
  if (argv[0] === '--prepare') return runPrepare();
  throw new Error('用法：node scripts/release-workflow.mjs <--resolve-run|--prepare>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
