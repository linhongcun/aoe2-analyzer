import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs 没有类型声明
import * as releaseAutomation from '../../scripts/prepare-release.mjs';

const { decideRelease, releaseGitCommandAllowed, releaseSource, releaseVersionForSource, validateSuccessfulDeployment } = releaseAutomation;

const repository = 'linhongcun/aoe2-analyzer';
const version = 'v0.31.0';
const deployedSha = '1234567890abcdef1234567890abcdef12345678';
const otherSha = 'abcdef1234567890abcdef1234567890abcdef12';
const releaseSha = '0123456789abcdef0123456789abcdef01234567';

describe('发布版本来自已部署 main 的 package', () => {
  it('自动发布读取已部署 package，手动同版本允许恢复', () => {
    expect(releaseVersionForSource('0.31.0')).toBe(version);
    expect(releaseVersionForSource('0.31.0', version)).toBe(version);
  });

  it('写 tag 或 draft 前拒绝在新部署上补发旧版本', () => {
    expect(() => releaseVersionForSource('0.32.0', version)).toThrow();
    expect(() => releaseVersionForSource('0.31.0', 'v0.32.0')).toThrow();
  });

  it.each(['0.31', '0.31.0-rc.1', '0.31.0\n'])('拒绝不合法的 deployed package 版本 %j', (packageVersion) => {
    expect(() => releaseVersionForSource(packageVersion)).toThrow();
  });
});

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345,
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: deployedSha,
    head_repository: { full_name: repository },
    ...overrides,
  };
}

function successfulJobs() {
  return [
    { name: 'test', status: 'completed', conclusion: 'success' },
    { name: 'deploy', status: 'completed', conclusion: 'success' },
  ];
}

const expectedDeployment = { repository, sha: deployedSha };

function automaticSource(run = deployment()) {
  return {
    eventName: 'workflow_run',
    event: { repository: { full_name: repository }, workflow_run: run },
    repository,
    ref: 'refs/heads/main',
    sha: deployedSha,
  };
}

function manualSource() {
  return {
    eventName: 'workflow_dispatch',
    event: { repository: { full_name: repository }, inputs: { version } },
    repository,
    ref: 'refs/heads/main',
    sha: deployedSha,
  };
}

describe('自动发版的部署来源', () => {
  it('只从成功的本仓库 main 部署事件提取待发布提交和运行 ID', () => {
    expect(releaseSource(automaticSource())).toEqual({ automatic: true, deployedSha, runId: 12345, requestedVersion: null });
  });

  it('workflow_run 的默认分支上下文 SHA 不能替代实际完成部署的提交', () => {
    expect(releaseSource({ ...automaticSource(), sha: otherSha })).toMatchObject({ deployedSha, runId: 12345 });
  });

  it('保留 main 手动调度时显式指定的版本和提交', () => {
    expect(releaseSource(manualSource())).toEqual({ automatic: false, deployedSha, runId: null, requestedVersion: version });
  });

  it.each(['push', 'pull_request', 'pull_request_target', 'repository_dispatch', 'schedule'])('拒绝未经支持的事件 %s', (eventName) => {
    expect(() => releaseSource({ ...automaticSource(), eventName })).toThrow();
  });

  it.each([
    ['其他工作流名称', { name: 'Release' }],
    ['其他工作流文件', { path: '.github/workflows/release.yml' }],
    ['PR 的工作流运行', { event: 'pull_request' }],
    ['非 main 分支', { head_branch: 'release/v0.31.0' }],
    ['运行尚未结束', { status: 'in_progress' }],
    ['失败的运行', { conclusion: 'failure' }],
    ['取消的运行', { conclusion: 'cancelled' }],
    ['跳过的运行', { conclusion: 'skipped' }],
    ['fork 的同名 main', { head_repository: { full_name: 'someone/aoe2-analyzer' } }],
    ['缺少源仓库', { head_repository: null }],
    ['无效提交', { head_sha: 'not-a-commit' }],
  ] as const)('自动来源拒绝%s', (_label, changes) => {
    expect(() => releaseSource(automaticSource(deployment(changes)))).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '12345', null])('运行 ID 必须为正安全整数：%s', (id) => {
    expect(() => releaseSource(automaticSource(deployment({ id })))).toThrow();
  });

  it.each(['workflow_run', 'workflow_dispatch'])('%s 事件必须属于预期仓库', (eventName) => {
    const source = eventName === 'workflow_run' ? automaticSource() : manualSource();
    const event = { ...source.event, repository: { full_name: 'someone/aoe2-analyzer' } };
    expect(() => releaseSource({ ...source, event })).toThrow();
    expect(() => releaseSource({ ...source, event: { ...event, repository: null } })).toThrow();
  });

  it('缺少 workflow_run 的载荷不能当作成功部署', () => {
    expect(() => releaseSource({ ...automaticSource(), event: { repository: { full_name: repository } } })).toThrow();
  });

  it.each(['refs/heads/release/v0.31.0', 'refs/tags/v0.31.0', 'main', ''])('手动发版拒绝非 main 的 ref：%s', (ref) => {
    expect(() => releaseSource({ ...manualSource(), ref })).toThrow();
  });

  it.each(['', deployedSha.slice(0, 7), 'g'.repeat(40), deployedSha + '\n'])('手动发版拒绝无效 SHA：%s', (sha) => {
    expect(() => releaseSource({ ...manualSource(), sha })).toThrow();
  });
});

const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
const inlineGate = releaseWorkflow.match(/^([ \t]*)node <<'NODE'\r?\n([\s\S]*?)^\1NODE[ \t]*$/m)?.[2] ?? '';
if (!inlineGate) throw new Error('Release workflow must validate the source in a Node heredoc before checkout');

function workflowGate(source: { eventName: string; event: unknown; repository: string; ref: string; sha: string }) {
  const output: string[] = [];
  const env = {
    GITHUB_EVENT_NAME: source.eventName,
    GITHUB_EVENT_PATH: '/release-event.json',
    GITHUB_REPOSITORY: source.repository,
    GITHUB_REF: source.ref,
    GITHUB_SHA: source.sha,
    GITHUB_OUTPUT: '/release-output',
  };
  const fs = {
    readFileSync(path: string, encoding: string) {
      if (path !== env.GITHUB_EVENT_PATH || encoding !== 'utf8') throw new Error('Unexpected event read');
      return JSON.stringify(source.event);
    },
    appendFileSync(path: string, value: string) {
      if (path !== env.GITHUB_OUTPUT) throw new Error('Unexpected output write');
      output.push(value);
    },
  };
  const run = () =>
    runInNewContext(
      inlineGate,
      {
        process: { env },
        require(name: string) {
          if (name !== 'node:fs') throw new Error('Unexpected workflow gate dependency');
          return fs;
        },
      },
      { timeout: 1000 },
    );
  return { run, output };
}

describe('checkout 前执行 workflow 内的真实来源门禁', () => {
  it('实际执行的来源门禁位于第一个 checkout 之前，拒绝不能被忽略', () => {
    const gate = releaseWorkflow.indexOf('name: Validate release source');
    const firstCheckout = releaseWorkflow.indexOf('uses: actions/checkout@');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(firstCheckout).toBeGreaterThan(gate);
    expect(releaseWorkflow.slice(gate, firstCheckout)).not.toMatch(/continue-on-error\s*:/);
  });

  it('自动事件成功时只输出实际部署的 head_sha，而不是工作流默认上下文 SHA', () => {
    const gate = workflowGate({ ...automaticSource(), sha: otherSha });
    gate.run();
    expect(gate.output).toEqual([`sha=${deployedSha}\n`]);
  });

  it('合法 main 手动调度输出当前上下文提交', () => {
    const gate = workflowGate({ ...manualSource(), sha: otherSha });
    gate.run();
    expect(gate.output).toEqual([`sha=${otherSha}\n`]);
  });

  it.each([
    ['fork', { head_repository: { full_name: 'someone/aoe2-analyzer' } }],
    ['PR', { event: 'pull_request' }],
    ['失败的运行', { conclusion: 'failure' }],
    ['非 main 部署', { head_branch: 'release/v0.31.0' }],
    ['尚未完成的运行', { status: 'in_progress' }],
    ['同名但不同文件的工作流', { path: '.github/workflows/untrusted.yml' }],
    ['无效运行 ID', { id: 0 }],
    ['短 SHA', { head_sha: deployedSha.slice(0, 7) }],
    ['非十六进制 SHA', { head_sha: 'g'.repeat(40) }],
    ['SHA 后附输出注入换行', { head_sha: deployedSha + '\n' }],
  ] as const)('实际门禁在%s时失败且不输出 checkout SHA', (_label, changes) => {
    const gate = workflowGate(automaticSource(deployment(changes)));
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });

  it.each(['workflow_run', 'workflow_dispatch'])('实际门禁拒绝 %s 的仓库不匹配', (eventName) => {
    const source = eventName === 'workflow_run' ? automaticSource() : manualSource();
    const gate = workflowGate({ ...source, event: { ...source.event, repository: { full_name: 'someone/aoe2-analyzer' } } });
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });

  it.each(['refs/heads/release/v0.31.0', 'refs/tags/v0.31.0'])('实际门禁拒绝手动非 main ref %s', (ref) => {
    const gate = workflowGate({ ...manualSource(), ref });
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });

  it('实际门禁拒绝手动版本号中的换行', () => {
    const source = manualSource();
    const gate = workflowGate({ ...source, event: { ...source.event, inputs: { version: version + '\n' } } });
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });

  it('实际门禁拒绝手动 SHA 中的换行', () => {
    const gate = workflowGate({ ...manualSource(), sha: deployedSha + '\n' });
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });

  it('实际门禁不把其他事件当成手动调度', () => {
    const gate = workflowGate({ ...manualSource(), eventName: 'pull_request_target' });
    expect(gate.run).toThrow();
    expect(gate.output).toEqual([]);
  });
});

describe('发布前再次核实实际部署运行与 jobs', () => {
  it('test、deploy 均实际成功才建立部署证据', () => {
    expect(() => validateSuccessfulDeployment(deployment(), successfulJobs(), expectedDeployment)).not.toThrow();
  });

  it('允许其他成功 job，但不能以它们替代 test 或 deploy', () => {
    const unrelated = { name: 'release', status: 'completed', conclusion: 'success' };
    expect(() => validateSuccessfulDeployment(deployment(), [...successfulJobs(), unrelated], expectedDeployment)).not.toThrow();
    expect(() => validateSuccessfulDeployment(deployment(), [unrelated], expectedDeployment)).toThrow();
  });

  it.each([
    ['name', 'Release'],
    ['path', '.github/workflows/release.yml'],
    ['event', 'pull_request'],
    ['status', 'in_progress'],
    ['conclusion', 'failure'],
    ['head_branch', 'release/v0.31.0'],
    ['head_sha', otherSha],
    ['head_repository', { full_name: 'someone/aoe2-analyzer' }],
    ['head_repository', null],
  ] as const)('成功 jobs 也不能掩盖错误的 run.%s', (key, value) => {
    expect(() => validateSuccessfulDeployment(deployment({ [key]: value }), successfulJobs(), expectedDeployment)).toThrow();
  });

  it.each(['test', 'deploy'])('缺少 %s job 时拒绝发布', (name) => {
    expect(() =>
      validateSuccessfulDeployment(
        deployment(),
        successfulJobs().filter((job) => job.name !== name),
        expectedDeployment,
      ),
    ).toThrow();
  });

  it.each([
    ['test', 'completed', 'failure'],
    ['test', 'completed', 'skipped'],
    ['deploy', 'completed', 'cancelled'],
    ['deploy', 'completed', 'skipped'],
    ['deploy', 'in_progress', null],
  ])('%s 的 %s/%s 不算实际成功', (name, status, conclusion) => {
    const jobs = successfulJobs().map((job) => (job.name === name ? { ...job, status, conclusion } : job));
    expect(() => validateSuccessfulDeployment(deployment(), jobs, expectedDeployment)).toThrow();
  });

  it('空 job 列表不能仅凭运行总体 success 放行', () => {
    expect(() => validateSuccessfulDeployment(deployment(), [], expectedDeployment)).toThrow();
  });
});

function releaseDecision(overrides: Record<string, unknown> = {}) {
  return {
    automatic: true,
    version,
    deployedSha,
    mainSha: deployedSha,
    releaseSha,
    releaseIsAncestor: true,
    release: null,
    ...overrides,
  };
}

describe('自动发布、重跑与过期部署的决策', () => {
  it('main 仍是已部署提交且版本分支已合入时发布新版本', () => {
    const decision = decideRelease(releaseDecision());
    expect(decision).toMatchObject({ version, shouldRelease: true });
    expect(typeof decision.reason).toBe('string');
  });

  it('main 已前进时跳过旧自动事件，而不是给新主头打旧版本 tag', () => {
    expect(decideRelease(releaseDecision({ mainSha: otherSha }))).toMatchObject({ version, shouldRelease: false });
  });

  it('手动发布遇到已前进的主头须明确失败', () => {
    expect(() => decideRelease(releaseDecision({ automatic: false, mainSha: otherSha }))).toThrow();
  });

  it.each([true, false])('版本分支没有合入时拒绝发布（automatic=%s）', (automatic) => {
    expect(() => decideRelease(releaseDecision({ automatic, releaseIsAncestor: false }))).toThrow();
  });

  it.each(['0.31.0', 'v0.31', 'v0.31.0.1', 'v0.31.0-rc.1', 'v0.31.0\n', 'v0.31.0;echo unsafe', ''])('拒绝不合法的三段版本号：%s', (invalidVersion) => {
    expect(() => decideRelease(releaseDecision({ version: invalidVersion }))).toThrow();
  });

  it.each(['deployedSha', 'mainSha', 'releaseSha'])('验证 %s，而不是只验证其中一个 SHA', (key) => {
    for (const invalidSha of ['', deployedSha.slice(0, 7), 'g'.repeat(40), deployedSha + '\n']) {
      expect(() => decideRelease(releaseDecision({ [key]: invalidSha }))).toThrow();
    }
  });

  it('已经正式发布的同版本自动事件跳过，不反复上传或变更发布时间', () => {
    const release = { tag_name: version, draft: false, published_at: '2026-10-24T12:00:00Z' };
    expect(decideRelease(releaseDecision({ release }))).toMatchObject({ version, shouldRelease: false });
  });

  it.each([null, { tag_name: version, draft: true, published_at: null }, { tag_name: version, draft: false, published_at: null }])(
    '未正式发布的状态仍可继续完成发版：%j',
    (release) => {
      expect(decideRelease(releaseDecision({ release }))).toMatchObject({ version, shouldRelease: true });
    },
  );

  it('同版本正式发布后仍允许显式手动重跑修复产物', () => {
    const release = { tag_name: version, draft: false, published_at: '2026-10-24T12:00:00Z' };
    expect(decideRelease(releaseDecision({ automatic: false, release }))).toMatchObject({ version, shouldRelease: true });
  });

  it.each([true, false])('其他版本的 Release 对象不能跳过或续跑本次版本（automatic=%s）', (automatic) => {
    const release = { tag_name: 'v0.30.4', draft: false, published_at: '2026-10-24T12:00:00Z' };
    expect(() => decideRelease(releaseDecision({ automatic, release }))).toThrow();
  });
});

describe('发布进程的 git push 权限边界', () => {
  it.each([
    ['rev-parse', 'HEAD'],
    ['fetch', 'origin', '--tags'],
    ['merge-base', '--is-ancestor', releaseSha, deployedSha],
    ['tag', '-a', version, deployedSha, '-m', version],
  ])('保留 release 脚本需要的非 push 命令：%j', (...args) => {
    expect(releaseGitCommandAllowed(args, version)).toBe(true);
  });

  it('只允许推送当前版本的精确 tag ref', () => {
    expect(releaseGitCommandAllowed(['push', '-q', 'origin', `refs/tags/${version}`], version)).toBe(true);
  });

  it.each([
    ['push', 'origin', `refs/tags/${version}`],
    ['push', '-q', 'origin', 'main'],
    ['push', '-q', 'origin', 'refs/heads/main'],
    ['push', '-q', 'origin', 'HEAD:main'],
    ['push', '-q', 'origin', 'release/v0.31.0'],
    ['push', '-q', 'origin', 'refs/tags/v0.32.0'],
    ['push', '-q', 'origin', `refs/tags/${version}`, 'main'],
    ['push', '-q', 'origin', `refs/tags/${version}`, 'refs/tags/v0.32.0'],
    ['push', '-q', 'origin', `+refs/tags/${version}`],
    ['push', '-q', 'origin', `:refs/tags/${version}`],
    ['push', '--delete', 'origin', `refs/tags/${version}`],
    ['push', '--force', '-q', 'origin', `refs/tags/${version}`],
    ['push', '-q', 'origin', `refs/tags/${version}`, '--force'],
    ['push', '-q', 'origin', `HEAD:refs/tags/${version}`],
    ['push', '-q', 'other-remote', `refs/tags/${version}`],
    ['push', '-q', 'origin', '--all'],
    ['push', '-q', 'origin', '--tags'],
    ['-c', 'push.default=matching', 'push', '-q', 'origin', `refs/tags/${version}`],
  ])('拒绝超出单个 tag 的 push：%j', (...args) => {
    expect(releaseGitCommandAllowed(args, version)).toBe(false);
  });
});
