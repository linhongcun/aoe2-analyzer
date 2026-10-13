// v0.6.0 #108 发版脚本 失败用例 — Kent
// 被测：scripts/release.mjs（路径与参数为本用例假定的接口，待 Linus 确认，见 #108 评论）
//   node scripts/release.mjs <vX.Y.Z> [--dry-run] --site-url <url> [--footer-timeout <秒>]
// 环境：每个用例新建临时仓库（带 bare origin），PATH 前插一个假的 gh（记录调用、按 FAKE_CI 回答 CI 状态），
//       --site-url 指向本机 127.0.0.1:4792 的静态页（页脚 data-t=footer-app-version / footer-build，另给 version.json）。
// 完成判定看仓库状态，不允许状态文件：每次跑完 `git status --porcelain --ignored` 必须为空。
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/release.mjs');
const PORT = 4792;
const SITE = `http://127.0.0.1:${PORT}/`;

let repo = '', origin = '', bin = '', ghLog = '';
let site: { mode: 'match' | 'stale' | 'wrong-version'; version: string } = { mode: 'match', version: 'v0.6.0' };
let server: Server;

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const originMain = () => git(origin, 'rev-parse', 'main');
const short = (s: string) => s.slice(0, 7);

beforeAll(async () => {
  server = createServer((req, res) => {
    const head = repo ? short(originMain()) : '0000000';
    const build = site.mode === 'stale' ? '1111111' : head;
    const ver = site.mode === 'wrong-version' ? 'v0.5.0' : site.version;
    if (req.url?.endsWith('version.json')) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ version: ver, build }));
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><footer><span data-t="footer-meta"><span data-t="footer-app-version">${ver}</span> · <span data-t="footer-build">构建 ${build}</span></span></footer>`);
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const CHANGELOG = `# 更新日志

## [Unreleased]

## [0.6.0] - 2026-10-20

### 更新说明

- KENT-MARKER-060：时间线补齐文明加成。

## [0.5.0] - 2026-10-12

- KENT-MARKER-050：旧版本，不应进入 v0.6.0 Release。
`;

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'kent108-'));
  origin = join(root, 'origin.git');
  repo = join(root, 'work');
  bin = join(root, 'bin');
  ghLog = join(root, 'gh.log');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', '-q', origin, repo]);
  git(repo, 'config', 'user.email', 'kent@test');
  git(repo, 'config', 'user.name', 'kent');
  git(repo, 'checkout', '-q', '-b', 'main');
  writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG.replace(/## \[0\.6\.0\][\s\S]*?(?=## \[0\.5\.0\])/, ''));
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'tmp', version: '0.5.0' }));
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'checkout', '-q', '-b', 'release/v0.6.0');
  writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'tmp', version: '0.6.0' }));
  git(repo, 'commit', '-qam', 'release 0.6.0');
  git(repo, 'push', '-q', 'origin', 'release/v0.6.0');
  git(repo, 'checkout', '-q', 'main');
  // 假 gh：记录所有调用；CI 相关查询按 FAKE_CI 返回；release create 记录参数和 notes 文件内容
  execFileSync('mkdir', ['-p', bin]);
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
let notes = '';
const nf = a.indexOf('--notes-file'); if (nf >= 0) notes = fs.readFileSync(a[nf + 1], 'utf8');
const n = a.indexOf('--notes'); if (n >= 0) notes = a[n + 1];
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args: a, notes }) + '\\n');
const ci = process.env.FAKE_CI || 'success';
const s = a.join(' ');
if (/check-runs|run list|run view|\\bstatus\\b|checks/.test(s)) {
  const conclusion = ci, state = ci === 'success' ? 'success' : 'failure';
  process.stdout.write(JSON.stringify({ state, total_count: 1, check_runs: [{ name: 'test', status: 'completed', conclusion }], statuses: [{ state }], workflow_runs: [{ status: 'completed', conclusion }] }));
  if (/run list/.test(s)) process.stdout.write('');
}
if (/release (view)/.test(s)) process.exit(1);
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(ghLog, '');
}

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('node', [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GH_LOG: ghLog, FAKE_CI: 'success', ...env },
  });
const ghCalls = () => readFileSync(ghLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; notes: string });
const releaseCreates = () => ghCalls().filter((c) => c.args[0] === 'release' && c.args[1] === 'create');
const snapshot = () => ({
  origin: git(origin, 'for-each-ref', '--format=%(refname) %(objectname)'),
  local: git(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
  releases: releaseCreates().length,
});
const noStateFile = () => expect(git(repo, 'status', '--porcelain', '--ignored'), '工作区不得留下状态文件或其它改动').toBe('');
const out = (r: ReturnType<typeof run>) => `${r.stdout}\n${r.stderr}`;
const OPTS = ['--site-url', SITE, '--footer-timeout', '3'];

beforeEach(() => {
  site = { mode: 'match', version: 'v0.6.0' };
  setup();
});

describe('#108 测试夹具自检（必须为绿，证明红是功能缺失而不是夹具错）', () => {
  it('临时仓库、假 gh、本地站点都可用', async () => {
    expect(git(origin, 'rev-parse', 'release/v0.6.0')).toMatch(/^[0-9a-f]{40}$/);
    const html = await (await fetch(SITE)).text();
    expect(html).toContain(`构建 ${short(originMain())}`);
    execFileSync(join(bin, 'gh'), ['api', 'repos/x/y/commits/abc/check-runs'], { env: { ...process.env, FAKE_GH_LOG: ghLog } });
    expect(ghCalls()).toHaveLength(1);
  });
});

describe('#108 发版脚本', () => {
  it('scripts/release.mjs 存在', () => expect(existsSync(SCRIPT)).toBe(true));

  it('第 2 条：版本号不是三段 vX.Y.Z 时报错退出、什么都不改', () => {
    const before = snapshot();
    for (const v of ['v0.6', '0.6.0', 'v0.6.0.1', 'v0.6.x']) {
      const r = run([v, ...OPTS]);
      expect(r.status, v).not.toBe(0);
      expect(out(r), v).toMatch(/vX\.Y\.Z|版本号/);
    }
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 1 条：--dry-run 走完所有步骤只打印，分支/tag/Release 与跑之前完全一致', () => {
    const before = snapshot();
    const r = run(['v0.6.0', '--dry-run', ...OPTS]);
    expect(r.status, out(r)).toBe(0);
    for (const step of [/merge/i, /页脚|footer/i, /tag/i, /release/i]) expect(out(r)).toMatch(step);
    expect(snapshot()).toEqual(before);
    expect(git(origin, 'tag', '-l')).toBe('');
    noStateFile();
  });

  it('第 3 条：release 头部 CI 不是绿的 → 报错退出，什么都不改', () => {
    const before = snapshot();
    const r = run(['v0.6.0', ...OPTS], { FAKE_CI: 'failure' });
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/CI/);
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 3 条：tag 已存在 → 报错退出，什么都不改', () => {
    git(repo, 'tag', '-a', 'v0.6.0', '-m', 'pre-existing', 'main');
    git(repo, 'push', '-q', 'origin', 'v0.6.0');
    const before = snapshot();
    const r = run(['v0.6.0', ...OPTS]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/tag/i);
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 4 条：线上页脚构建号与合并后 main 头部不一致 → 超时报错，不打 tag、不建 Release', () => {
    site.mode = 'stale';
    const r = run(['v0.6.0', ...OPTS]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/页脚|footer/i);
    expect(git(origin, 'tag', '-l')).toBe('');
    expect(releaseCreates()).toHaveLength(0);
    noStateFile();
  });

  it('第 4 条：页脚版本号不一致（构建号一致）同样不打 tag', () => {
    site.mode = 'wrong-version';
    const r = run(['v0.6.0', ...OPTS]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/页脚|footer/i);
    expect(out(r)).toMatch(/v0\.5\.0/);
    expect(git(origin, 'tag', '-l')).toBe('');
    expect(releaseCreates()).toHaveLength(0);
  });

  it('第 5 条：页脚失败后重跑，跳过已完成的合并（看仓库状态判定），不产生第二个合并提交', () => {
    site.mode = 'stale';
    const r1 = run(['v0.6.0', ...OPTS]);
    expect(r1.status).not.toBe(0);
    const mergedHead = originMain();
    expect(spawnSync('git', ['merge-base', '--is-ancestor', 'release/v0.6.0', 'main'], { cwd: origin }).status, '第一次失败前已把 release 合入 main').toBe(0);
    site.mode = 'match';
    const r2 = run(['v0.6.0', ...OPTS]);
    expect(r2.status, out(r2)).toBe(0);
    expect(originMain(), '重跑不得再合并一次').toBe(mergedHead);
    expect(out(r2)).toMatch(/跳过|skip/i);
    noStateFile();
  });

  it('真实模式全流程：merge commit 合入、annotated tag 指向 main 头、Release 为 draft 且正文取自 CHANGELOG [0.6.0] 小节', () => {
    const r = run(['v0.6.0', ...OPTS]);
    expect(r.status, out(r)).toBe(0);
    const head = originMain();
    expect(git(origin, 'rev-list', '--parents', '-n', '1', head).split(' '), '是 merge commit').toHaveLength(3);
    expect(git(origin, 'cat-file', '-t', 'v0.6.0'), 'annotated tag').toBe('tag');
    expect(git(origin, 'rev-parse', 'v0.6.0^{commit}')).toBe(head);
    const rc = releaseCreates();
    expect(rc).toHaveLength(1);
    expect(rc[0]!.args).toContain('v0.6.0');
    expect(rc[0]!.args).toContain('--draft');
    expect(rc[0]!.notes).toContain('KENT-MARKER-060');
    expect(rc[0]!.notes).not.toContain('KENT-MARKER-050');
    noStateFile();
  });
});
