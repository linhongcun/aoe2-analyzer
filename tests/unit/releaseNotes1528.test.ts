import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs are plain Node modules
import { changelogOrderErrors } from '../../scripts/changelog.mjs';
// @ts-expect-error scripts/*.mjs are plain Node modules
import { versionOnly } from '../../scripts/ci-scope.mjs';
// @ts-expect-error scripts/*.mjs are plain Node modules
import * as releaseNotes from '../../scripts/release-notes.mjs';
// @ts-expect-error scripts/*.mjs are plain Node modules
import * as releaseWorkflow from '../../scripts/release-workflow.mjs';

const {
  applyReleaseNotes,
  bumpVersion,
  checkPullRequestReleaseNotes,
  checkReleaseNotes,
  collectReleaseNotes,
  formatShanghaiDate,
  highestBump,
  validateFragment,
} = releaseNotes;
const { classifyApiMainSha, classifyPushFailure, decidePrepareAction, hasActiveOrSucceededRun, resolveReleaseSourceRun } = releaseWorkflow;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeFixtureRepo(version = '0.99.72') {
  const dir = mkdtempSync(join(tmpdir(), 'aoe2-rn-1528-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'release-notes'), { recursive: true });
  writeFileSync(join(dir, 'release-notes', '.gitkeep'), '', 'utf8');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'aoe2-analyzer', version }, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(dir, 'package-lock.json'),
    `${JSON.stringify({ name: 'aoe2-analyzer', version, lockfileVersion: 3, packages: { '': { name: 'aoe2-analyzer', version } } }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(dir, 'CHANGELOG.md'),
    '# 更新日志\n\n## 版本号规则\n\n说明。\n\n## [Unreleased]\n\n## [0.99.72] - 2026-11-27\n\n- 上一版本变更（#1527）。\n',
    'utf8',
  );
  return dir;
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const SHA_D = 'd'.repeat(40);

describe('#1528 release-notes 纯函数与片段校验', () => {
  it('按 semver 递增 patch / minor / major，合并按最高级别取胜', () => {
    expect(bumpVersion('0.99.72', 'patch')).toBe('0.99.73');
    expect(bumpVersion('0.99.72', 'minor')).toBe('0.100.0');
    expect(bumpVersion('0.99.72', 'major')).toBe('1.0.0');
    expect(() => bumpVersion('v0.99.72', 'patch')).toThrow();
    expect(() => bumpVersion('0.99.72', 'hotfix')).toThrow();
    expect(highestBump([])).toBeNull();
    expect(highestBump([{ bump: 'patch' }, { bump: 'minor' }])).toBe('minor');
    expect(highestBump([{ bump: 'minor' }, { bump: 'major' }, { bump: 'patch' }])).toBe('major');
    expect(highestBump([{}])).toBe('patch');
  });

  it('按 Asia/Shanghai 格式化日期（跨 UTC 零点仍取北京时间日期）', () => {
    expect(formatShanghaiDate(new Date('2026-11-27T17:30:00Z'))).toBe('2026-11-28');
    expect(formatShanghaiDate(new Date('2026-11-27T15:30:00Z'))).toBe('2026-11-27');
  });

  it('合法片段（显式 bump 与缺省 patch、带 slug）通过校验', () => {
    const a = validateFragment('1528.json', { issue: 1528, summary: '解耦版本号递增流程（#1528）。' });
    expect(a.errors).toEqual([]);
    expect(a.fragment).toEqual({ file: '1528.json', issue: 1528, bump: 'patch', summary: '解耦版本号递增流程（#1528）。' });
    const b = validateFragment('1530-eco-fix.json', { bump: 'minor', issue: 1530, summary: '新增经济回本指标（#1530）。' });
    expect(b.errors).toEqual([]);
    expect(b.fragment?.bump).toBe('minor');
  });

  it.each([
    ['文件名无编号', 'notes.json', { issue: 1, summary: '说明（#1）' }],
    ['文件名编号前导零', '01528.json', { issue: 1528, summary: '说明（#1528）' }],
    ['文件名编号与 issue 不符', '1528.json', { issue: 1529, summary: '说明（#1529）' }],
    ['顶层非对象', '1528.json', ['bad']],
    ['未知额外字段', '1528.json', { issue: 1528, bump: 'patch', summary: '说明（#1528）', extra: true }],
    ['非法 bump 级别', '1528.json', { issue: 1528, bump: 'prepatch', summary: '说明（#1528）' }],
    ['summary 含换行', '1528.json', { issue: 1528, summary: '第一行（#1528）\n第二行' }],
    ['summary 以列表符开头', '1528.json', { issue: 1528, summary: '- 不要带前导短横（#1528）' }],
    ['summary 以标题符开头', '1528.json', { issue: 1528, summary: '## 注入标题（#1528）' }],
    ['summary 缺对应 Issue 编号', '152.json', { issue: 152, summary: '这里只有 #1528 不算匹配 152' }],
    ['summary 过短', '1.json', { issue: 1, summary: '#1' }],
  ])('坏片段 fail-closed：%s', (_name, file, payload) => {
    const res = validateFragment(file, payload);
    expect(res.fragment).toBeNull();
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('目录扫描拦截坏 JSON、非 JSON 文件、子目录、符号链接与重复摘要', () => {
    const dir = makeFixtureRepo();
    writeFileSync(join(dir, 'release-notes', '1528.json'), '{bad json', 'utf8');
    writeFileSync(join(dir, 'release-notes', 'readme.txt'), 'nope', 'utf8');
    mkdirSync(join(dir, 'release-notes', 'nested'));
    symlinkSync(join(dir, 'package.json'), join(dir, 'release-notes', '1529.json'));
    const res = collectReleaseNotes(dir);
    expect(res.errors.length).toBeGreaterThanOrEqual(4);

    const dupDir = makeFixtureRepo();
    const same = JSON.stringify({ issue: 1600, summary: '重复内容测试（#1600）。' });
    writeFileSync(join(dupDir, 'release-notes', '1600.json'), same, 'utf8');
    writeFileSync(join(dupDir, 'release-notes', '1600-b.json'), same, 'utf8');
    expect(collectReleaseNotes(dupDir).errors.some((e: string) => e.includes('重复'))).toBe(true);
  });

  it('校验当前仓库实际状态通过（含 release-notes/1528.json）', () => {
    const res = checkReleaseNotes(process.cwd());
    expect(res.errors).toEqual([]);
  });
});

describe('#1528 applyReleaseNotes 合并、幂等、原子性与并行无冲突 git 集成', () => {
  it('无片段时 100% 幂等无修改；多片段按 issue 升序汇总且可幂等重跑', () => {
    const dir = makeFixtureRepo('0.99.72');
    const noop = applyReleaseNotes(dir, { date: '2026-11-27' });
    expect(noop).toMatchObject({ changed: false, count: 0, version: '0.99.72' });

    writeFileSync(join(dir, 'release-notes', '1535.json'), JSON.stringify({ bump: 'minor', issue: 1535, summary: '新增第二项功能（#1535）。' }));
    writeFileSync(join(dir, 'release-notes', '1528.json'), JSON.stringify({ bump: 'patch', issue: 1528, summary: '修复第一项流程（#1528）。' }));

    const pkgBefore = readFileSync(join(dir, 'package.json'), 'utf8');
    const lockBefore = readFileSync(join(dir, 'package-lock.json'), 'utf8');
    const dry = applyReleaseNotes(dir, { dryRun: true, date: '2026-11-27' });
    expect(dry).toMatchObject({ changed: true, previousVersion: '0.99.72', version: '0.100.0', bump: 'minor', count: 2, issues: [1528, 1535] });
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(pkgBefore);
    expect(existsSync(join(dir, 'release-notes', '1528.json'))).toBe(true);

    const applied = applyReleaseNotes(dir, { date: '2026-11-27' });
    expect(applied).toMatchObject({ changed: true, version: '0.100.0', count: 2, issues: [1528, 1535] });
    const pkgAfter = readFileSync(join(dir, 'package.json'), 'utf8');
    const lockAfter = readFileSync(join(dir, 'package-lock.json'), 'utf8');
    const changelogAfter = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
    expect(versionOnly('package.json', pkgBefore, pkgAfter)).toBe(true);
    expect(versionOnly('package-lock.json', lockBefore, lockAfter)).toBe(true);
    expect(changelogOrderErrors(changelogAfter)).toEqual([]);
    expect(changelogAfter).toContain('## [0.100.0] - 2026-11-27');
    expect(changelogAfter.indexOf('#1528')).toBeLessThan(changelogAfter.indexOf('#1535'));
    expect(existsSync(join(dir, 'release-notes', '1528.json'))).toBe(false);
    expect(existsSync(join(dir, 'release-notes', '1535.json'))).toBe(false);
    expect(existsSync(join(dir, 'release-notes', '.gitkeep'))).toBe(true);

    const second = applyReleaseNotes(dir, { date: '2026-11-27' });
    expect(second).toMatchObject({ changed: false, count: 0, version: '0.100.0' });
  });

  it('坏片段或损坏锁文件在写入前 fail-closed，不留下半改工作区', () => {
    const dir = makeFixtureRepo('0.99.72');
    writeFileSync(join(dir, 'release-notes', '1528.json'), JSON.stringify({ issue: 1528, summary: '合法条目（#1528）。' }));
    writeFileSync(join(dir, 'release-notes', '1529.json'), JSON.stringify({ issue: 1529, summary: '缺编号' }));
    const pkgBefore = readFileSync(join(dir, 'package.json'), 'utf8');
    expect(() => applyReleaseNotes(dir, { date: '2026-11-27' })).toThrow(/校验失败/);
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(pkgBefore);
    expect(existsSync(join(dir, 'release-notes', '1528.json'))).toBe(true);
  });

  it('两个互不重叠的功能分支并行开发、零冲突合并并统一汇总为单一版本 + PR 防重检查', () => {
    const dir = makeFixtureRepo('0.99.72');
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init', '-b', 'main');
    git('add', '.');
    git('commit', '-m', 'init');
    const base = git('rev-parse', 'HEAD');

    git('switch', '-c', 'feat-a');
    writeFileSync(join(dir, 'a.txt'), 'feature a\n');
    writeFileSync(join(dir, 'release-notes', '2001.json'), JSON.stringify({ bump: 'patch', issue: 2001, summary: '功能 A 上线（#2001）。' }));
    git('add', '.');
    git('commit', '-m', 'feat(#2001): feature a');
    const headA = git('rev-parse', 'HEAD');
    expect(checkPullRequestReleaseNotes(base, headA, dir)).toEqual({ ok: true, hasFragments: true, errors: [] });

    git('switch', 'main');
    git('switch', '-c', 'feat-b');
    writeFileSync(join(dir, 'b.txt'), 'feature b\n');
    writeFileSync(join(dir, 'release-notes', '2002.json'), JSON.stringify({ bump: 'patch', issue: 2002, summary: '功能 B 上线（#2002）。' }));
    git('add', '.');
    git('commit', '-m', 'feat(#2002): feature b');
    const headB = git('rev-parse', 'HEAD');
    expect(checkPullRequestReleaseNotes(base, headB, dir)).toEqual({ ok: true, hasFragments: true, errors: [] });

    // 并行合并到 main：零合并冲突，汇总后提交保持工作区洁净
    git('switch', 'main');
    git('merge', '--no-ff', 'feat-a', '-m', 'merge a');
    git('merge', '--no-ff', 'feat-b', '-m', 'merge b');
    const applied = applyReleaseNotes(dir, { date: '2026-11-27' });
    expect(applied).toMatchObject({ changed: true, version: '0.99.73', count: 2, issues: [2001, 2002] });
    git('add', '-A');
    git('commit', '-m', 'chore(release): v0.99.73');

    // --check-pr 拦截同时带片段与手工改 package.json / package-lock.json / CHANGELOG.md 的 PR，但允许仅改 scripts
    git('switch', '-c', 'bad-pr', base);
    writeFileSync(join(dir, 'release-notes', '2003.json'), JSON.stringify({ issue: 2003, summary: '双重递增（#2003）。' }));
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'aoe2-analyzer', version: '0.99.73' }, null, 2)}\n`);
    writeFileSync(
      join(dir, 'package-lock.json'),
      `${JSON.stringify({ name: 'aoe2-analyzer', version: '0.99.73', lockfileVersion: 3, packages: { '': { name: 'aoe2-analyzer', version: '0.99.73' } } }, null, 2)}\n`,
    );
    writeFileSync(join(dir, 'CHANGELOG.md'), `${readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')}\n`);
    git('add', '.');
    git('commit', '-m', 'bad');
    const badCheck = checkPullRequestReleaseNotes(base, git('rev-parse', 'HEAD'), dir);
    expect(badCheck.ok).toBe(false);
    expect(badCheck.errors).toHaveLength(3);

    git('switch', '-c', 'script-pr', base);
    writeFileSync(join(dir, 'release-notes', '2004.json'), JSON.stringify({ issue: 2004, summary: '加脚本不改版本（#2004）。' }));
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'aoe2-analyzer', version: '0.99.72', scripts: { a: '1' } }, null, 2)}\n`);
    git('add', '.');
    git('commit', '-m', 'scripts');
    expect(checkPullRequestReleaseNotes(base, git('rev-parse', 'HEAD'), dir)).toEqual({ ok: true, hasFragments: true, errors: [] });
  });
});

describe('#1528 release-workflow 纯决策逻辑（prepare 与 release.yml）', () => {
  const baseRun = {
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_repository: { full_name: 'linhongcun/aoe2-analyzer' },
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA_B,
  };
  const okJobs = [
    { name: 'prepare', status: 'completed', conclusion: 'success' },
    { name: 'check', status: 'completed', conclusion: 'success' },
    { name: 'deploy', status: 'completed', conclusion: 'success' },
  ];

  it('resolveReleaseSourceRun 放行 push 与 workflow_dispatch 的双绿运行，拦截跳过部署或伪造运行', () => {
    expect(
      resolveReleaseSourceRun({
        eventName: 'workflow_run',
        ciRunId: '45956929125',
        repository: 'linhongcun/aoe2-analyzer',
        run: baseRun,
        jobs: okJobs,
      }),
    ).toMatchObject({ eligible: true, sha: SHA_B });

    expect(
      resolveReleaseSourceRun({
        eventName: 'workflow_run',
        ciRunId: '45956929125',
        repository: 'linhongcun/aoe2-analyzer',
        run: { ...baseRun, event: 'push' },
        jobs: [
          { name: 'prepare', status: 'completed', conclusion: 'success' },
          { name: 'check', status: 'completed', conclusion: 'skipped' },
          { name: 'deploy', status: 'completed', conclusion: 'skipped' },
        ],
      }),
    ).toMatchObject({ eligible: false, sha: SHA_B });

    // 手工恢复传入未部署 run 必须报错
    expect(() =>
      resolveReleaseSourceRun({
        eventName: 'workflow_dispatch',
        ciRunId: '45956929125',
        repository: 'linhongcun/aoe2-analyzer',
        run: baseRun,
        jobs: [
          { name: 'check', status: 'completed', conclusion: 'success' },
          { name: 'deploy', status: 'completed', conclusion: 'skipped' },
        ],
      }),
    ).toThrow(/未同时完成成功的 check 与 deploy/);

    // 非法 CI_RUN_ID / PR 事件 / 异仓 / 非 main 均报错
    expect(() =>
      resolveReleaseSourceRun({ eventName: 'workflow_dispatch', ciRunId: '123/evil', repository: 'linhongcun/aoe2-analyzer', run: baseRun, jobs: okJobs }),
    ).toThrow(/正整数/);
    expect(() =>
      resolveReleaseSourceRun({
        eventName: 'workflow_run',
        ciRunId: '1',
        repository: 'linhongcun/aoe2-analyzer',
        run: { ...baseRun, event: 'pull_request' },
        jobs: okJobs,
      }),
    ).toThrow();
    expect(() =>
      resolveReleaseSourceRun({
        eventName: 'workflow_run',
        ciRunId: '1',
        repository: 'linhongcun/aoe2-analyzer',
        run: { ...baseRun, head_repository: { full_name: 'fork/aoe2-analyzer' } },
        jobs: okJobs,
      }),
    ).toThrow();
  });

  it('decidePrepareAction 覆盖 push、常规 bump 派发、反向并发接管、不变量防递归与同步延迟', () => {
    // 常规 push：有片段 bump、无片段 direct、落后 superseded
    expect(decidePrepareAction({ eventName: 'push', ref: 'refs/heads/main', headSha: SHA_A, remoteSha: SHA_A, pendingCount: 2 })).toMatchObject({
      action: 'bump',
    });
    expect(decidePrepareAction({ eventName: 'push', ref: 'refs/heads/main', headSha: SHA_A, remoteSha: SHA_A, pendingCount: 0 })).toMatchObject({
      action: 'direct',
    });
    expect(decidePrepareAction({ eventName: 'push', ref: 'refs/heads/main', headSha: SHA_A, remoteSha: SHA_B, pendingCount: 1 })).toMatchObject({
      action: 'superseded',
      checkRemoteRun: false,
    });

    // 常规 workflow_dispatch(expected_sha = B1) 命中尖端且 0 片段 → direct；若残留片段必报错杜绝循环
    expect(
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_B,
        remoteSha: SHA_B,
        expectedSha: SHA_B,
        pendingCount: 0,
        deployInput: true,
      }),
    ).toMatchObject({ action: 'direct' });
    expect(() =>
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_B,
        remoteSha: SHA_B,
        expectedSha: SHA_B,
        pendingCount: 1,
        deployInput: true,
      }),
    ).toThrow(/不变量破坏/);

    // P1-1 反向并发竞态：workflow_dispatch(expected=B) 实际检出最新尖端 C（顶掉了 pending push(C)）
    expect(
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_C,
        remoteSha: SHA_C,
        expectedSha: SHA_B,
        pendingCount: 0,
        deployInput: true,
      }),
    ).toMatchObject({ action: 'direct' });
    expect(
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_C,
        remoteSha: SHA_C,
        expectedSha: SHA_B,
        pendingCount: 1,
        deployInput: true,
      }),
    ).toMatchObject({ action: 'bump' });

    // Git/API 延迟（检出旧 A 而 origin/main 已是 expected B）→ 报错不静默漏部署
    expect(() =>
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_A,
        remoteSha: SHA_B,
        expectedSha: SHA_B,
        pendingCount: 0,
        deployInput: true,
      }),
    ).toThrow(/同步延迟/);

    // 已被更远提交 D 超越 → superseded 且检查远端是否需补派
    expect(
      decidePrepareAction({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        headSha: SHA_C,
        remoteSha: SHA_D,
        expectedSha: SHA_B,
        pendingCount: 0,
        deployInput: true,
      }),
    ).toMatchObject({ action: 'superseded', checkRemoteRun: true });
  });

  it('classifyPushFailure / classifyApiMainSha / hasActiveOrSucceededRun 覆盖全部断连与并发状态', () => {
    expect(classifyPushFailure({ baseSha: SHA_A, bumpSha: SHA_B, newRemoteSha: SHA_B })).toBe('already-pushed');
    expect(classifyPushFailure({ baseSha: SHA_A, bumpSha: SHA_B, newRemoteSha: SHA_C })).toBe('superseded');
    expect(classifyPushFailure({ baseSha: SHA_A, bumpSha: SHA_B, newRemoteSha: SHA_A })).toBe('failed');
    expect(classifyApiMainSha({ baseSha: SHA_A, bumpSha: SHA_B, apiSha: SHA_B })).toBe('ready');
    expect(classifyApiMainSha({ baseSha: SHA_A, bumpSha: SHA_B, apiSha: SHA_C })).toBe('moved');
    expect(classifyApiMainSha({ baseSha: SHA_A, bumpSha: SHA_B, apiSha: SHA_A })).toBe('stale');
    expect(hasActiveOrSucceededRun([{ status: 'completed', conclusion: 'cancelled' }])).toBe(false);
    expect(hasActiveOrSucceededRun([{ status: 'queued', conclusion: null }])).toBe(true);
    expect(hasActiveOrSucceededRun([{ status: 'completed', conclusion: 'success' }])).toBe(true);
  });
});
