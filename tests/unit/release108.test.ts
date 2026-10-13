// v0.6.0 #108 发版脚本 失败用例 — Kent
// 被测：scripts/release.mjs（路径与参数为本用例假定的接口，待 Linus 确认，见 #108 评论）
//   node scripts/release.mjs <vX.Y.Z> [--dry-run] --site-url <url> [--footer-timeout <秒>]
// 环境：每个用例新建临时仓库（带 bare origin），PATH 前插一个假的 gh（记录调用、按 FAKE_CI 回答 CI 状态），
//       --site-url 指向本机 127.0.0.1:4792 的静态页（页脚 data-t=footer-app-version / footer-build，另给 version.json）。
// --site-url 默认 https://linhongcun.github.io/aoe2-analyzer/；tag 已存在且指向合并后 main 头 → 跳过，指向别的提交 → 报错（前置检查同口径）。
// 完成判定看仓库状态，不允许状态文件：每次跑完 `git status --porcelain --ignored` 必须为空。
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/release.mjs');
// 端口用 0 由系统分配空闲端口（原固定 4792 被残留进程占用时 beforeAll 失败 → 12 条被静默跳过）
let SITE = '';

let repo = '', origin = '', bin = '', ghLog = '';
let site: { mode: 'match' | 'stale' | 'wrong-version'; version: string } = { mode: 'match', version: 'v0.6.0' };
let server: Server;

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const originMain = () => git(origin, 'rev-parse', 'main');
const short = (s: string) => s.slice(0, 7);

beforeAll(async () => {
  server = createServer((_req, res) => {
    const head = repo ? short(originMain()) : '0000000';
    const build = site.mode === 'stale' ? '1111111' : head;
    const ver = site.mode === 'wrong-version' ? 'v0.5.0' : site.version;
    // 页脚只由 JS 渲染：源码里没有版本号/构建号，curl 读源码必然失败，必须用浏览器（Playwright）读渲染后页面
    const enc = Buffer.from(JSON.stringify({ v: ver, b: build })).toString('base64');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><body><footer id="f"></footer><script>
const d = JSON.parse(atob('${enc}'));
document.getElementById('f').innerHTML = '<span data-t="footer-meta"><span data-t="footer-app-version">' + d.v + '</span> · <span data-t="footer-build">构建 ' + d.b + '</span></span>';
</script></body></html>`);
  });
  await new Promise<void>((ok, bad) => {
    server.once('error', bad);
    server.listen(0, '127.0.0.1', () => ok());
  });
  SITE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}, 30_000);
afterAll(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

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

// 必须非阻塞：假页脚服务器跑在本进程里，spawnSync 会阻塞事件循环，脚本永远读不到页面
type RunResult = { status: number | null; stdout: string; stderr: string };
const run = (args: string[], env: Record<string, string> = {}): Promise<RunResult> =>
  new Promise((resolveRun) => {
    const c = spawn('node', [SCRIPT, ...args], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GH_LOG: ghLog, FAKE_CI: 'success', ...env },
    });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    const t = setTimeout(() => c.kill('SIGKILL'), 90_000);
    c.on('close', (status) => {
      clearTimeout(t);
      resolveRun({ status, stdout, stderr });
    });
  });
const ghCalls = () => readFileSync(ghLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; notes: string });
const releaseCreates = () => ghCalls().filter((c) => c.args[0] === 'release' && c.args[1] === 'create');
const snapshot = () => ({
  origin: git(origin, 'for-each-ref', '--format=%(refname) %(objectname)'),
  local: git(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
  releases: releaseCreates().length,
});
const noStateFile = () => expect(git(repo, 'status', '--porcelain', '--ignored'), '工作区不得留下状态文件或其它改动').toBe('');
const out = (r: RunResult) => `${r.stdout}\n${r.stderr}`;
const opts = () => ['--site-url', SITE, '--footer-timeout', '3'];

beforeEach(() => {
  site = { mode: 'match', version: 'v0.6.0' };
  setup();
});

describe('#108 测试夹具自检（必须为绿，证明红是功能缺失而不是夹具错）', { timeout: 60_000 }, () => {
  it('临时仓库、假 gh、本地站点都可用', async () => {
    expect(git(origin, 'rev-parse', 'release/v0.6.0')).toMatch(/^[0-9a-f]{40}$/);
    const html = await (await fetch(SITE)).text();
    expect(html, '源码里不能直接出现构建号（防止脚本用 curl 读源码蒙混过关）').not.toContain(short(originMain()));
    expect(html).not.toContain('v0.6.0');
    const { chromium } = await import('@playwright/test');
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto(SITE);
    expect(await p.locator('[data-t="footer-build"]').textContent()).toBe(`构建 ${short(originMain())}`);
    await b.close();
    execFileSync(join(bin, 'gh'), ['api', 'repos/x/y/commits/abc/check-runs'], { env: { ...process.env, FAKE_GH_LOG: ghLog } });
    expect(ghCalls()).toHaveLength(1);
  });
});

describe('#108 发版脚本', { timeout: 120_000 }, () => {
  it('scripts/release.mjs 存在', async () => expect(existsSync(SCRIPT)).toBe(true));

  it('第 2 条：版本号不是三段 vX.Y.Z 时报错退出、什么都不改', async () => {
    const before = snapshot();
    for (const v of ['v0.6', '0.6.0', 'v0.6.0.1', 'v0.6.x']) {
      const r = await run([v, ...opts()]);
      expect(r.status, v).not.toBe(0);
      expect(out(r), v).toMatch(/vX\.Y\.Z|版本号/);
    }
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 1 条：--dry-run 走完所有步骤只打印，分支/tag/Release 与跑之前完全一致', async () => {
    const before = snapshot();
    const r = await run(['v0.6.0', '--dry-run', ...opts()]);
    expect(r.status, out(r)).toBe(0);
    for (const step of [/merge/i, /页脚|footer/i, /tag/i, /release/i]) expect(out(r)).toMatch(step);
    expect(snapshot()).toEqual(before);
    expect(git(origin, 'tag', '-l')).toBe('');
    noStateFile();
  });

  it('第 3 条：release 头部 CI 不是绿的 → 报错退出，什么都不改', async () => {
    const before = snapshot();
    const r = await run(['v0.6.0', ...opts()], { FAKE_CI: 'failure' });
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/CI/);
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 3 条：tag 已存在且指向别的提交（不是合并后 main 头）→ 报错退出，什么都不改', async () => {
    git(repo, 'tag', '-a', 'v0.6.0', '-m', 'pre-existing', 'main');
    git(repo, 'push', '-q', 'origin', 'v0.6.0');
    const before = snapshot();
    const r = await run(['v0.6.0', ...opts()]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/tag/i);
    expect(snapshot()).toEqual(before);
    noStateFile();
  });

  it('第 4 条：线上页脚构建号与合并后 main 头部不一致 → 超时报错，不打 tag、不建 Release', async () => {
    site.mode = 'stale';
    const r = await run(['v0.6.0', ...opts()]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/页脚|footer/i);
    expect(git(origin, 'tag', '-l')).toBe('');
    expect(releaseCreates()).toHaveLength(0);
    noStateFile();
  });

  it('第 4 条：页脚版本号不一致（构建号一致）同样不打 tag', async () => {
    site.mode = 'wrong-version';
    const r = await run(['v0.6.0', ...opts()]);
    expect(r.status).not.toBe(0);
    expect(out(r)).toMatch(/页脚|footer/i);
    expect(out(r)).toMatch(/v0\.5\.0/);
    expect(git(origin, 'tag', '-l')).toBe('');
    expect(releaseCreates()).toHaveLength(0);
  });

  it('第 5 条：页脚失败后重跑，跳过已完成的合并（看仓库状态判定），不产生第二个合并提交', async () => {
    site.mode = 'stale';
    const r1 = await run(['v0.6.0', ...opts()]);
    expect(r1.status).not.toBe(0);
    const mergedHead = originMain();
    expect(spawnSync('git', ['merge-base', '--is-ancestor', 'release/v0.6.0', 'main'], { cwd: origin }).status, '第一次失败前已把 release 合入 main').toBe(0);
    site.mode = 'match';
    const r2 = await run(['v0.6.0', ...opts()]);
    expect(r2.status, out(r2)).toBe(0);
    expect(originMain(), '重跑不得再合并一次').toBe(mergedHead);
    expect(out(r2)).toMatch(/跳过|skip/i);
    noStateFile();
  });

  it('--site-url 缺省时用线上地址 https://linhongcun.github.io/aoe2-analyzer/（dry-run 打印出来）', async () => {
    const r = await run(['v0.6.0', '--dry-run', '--footer-timeout', '3']);
    expect(r.status, out(r)).toBe(0);
    expect(out(r)).toContain('https://linhongcun.github.io/aoe2-analyzer/');
  });

  it('tag 已存在且指向合并后 main 头 → 跳过打 tag，继续起草 Release', async () => {
    git(repo, 'fetch', '-q', 'origin');
    git(repo, 'merge', '-q', '--no-ff', '-m', 'Merge release/v0.6.0', 'origin/release/v0.6.0');
    git(repo, 'push', '-q', 'origin', 'main');
    git(repo, 'tag', '-a', 'v0.6.0', '-m', 'v0.6.0', 'main');
    git(repo, 'push', '-q', 'origin', 'v0.6.0');
    const head = originMain(), tagObj = git(origin, 'rev-parse', 'v0.6.0');
    const r = await run(['v0.6.0', ...opts()]);
    expect(r.status, out(r)).toBe(0);
    expect(out(r)).toMatch(/跳过|skip/i);
    expect(originMain(), '不得再合并').toBe(head);
    expect(git(origin, 'rev-parse', 'v0.6.0'), '不得重打 tag').toBe(tagObj);
    expect(releaseCreates()).toHaveLength(1);
    expect(releaseCreates()[0]!.args).toContain('--draft');
    noStateFile();
  });

  it('真实模式全流程：merge commit 合入、annotated tag 指向 main 头、Release 为 draft 且正文取自 CHANGELOG [0.6.0] 小节', async () => {
    const r = await run(['v0.6.0', ...opts()]);
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
