#!/usr/bin/env node
// 发版脚本（#108 / #134）：release/vX.Y.Z → main（merge commit）→ 等部署并核对线上页脚 → annotated tag → 起草 GitHub Release
//
// 用法：npm run release -- vX.Y.Z [--dry-run] [--site-url URL] [--footer-timeout 秒]
//
// 设计：每一步「做没做完」都看真实状态（远端分支/tag、线上页脚、gh release view），不写本地状态文件；
// 任一步失败即停（非 0 退出），打印已完成步骤与原因；重跑时已完成的步骤自动跳过。
// tag 已在本地或远端指向 main 头部时跳过创建 tag；指向别的提交则失败。
// --dry-run 只读远端状态并打印将执行的命令，不改任何分支、tag、Release。
// 调用方勿用管道吞掉退出码；需要留日志时用 `set -o pipefail` 或检查 PIPESTATUS。
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SITE = 'https://linhongcun.github.io/aoe2-analyzer/';
const REMOTE = 'origin';

function parseArgs(argv) {
  const o = { version: '', dryRun: false, siteUrl: DEFAULT_SITE, footerTimeout: 600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--site-url') o.siteUrl = argv[++i] ?? '';
    else if (a === '--footer-timeout') o.footerTimeout = Number(argv[++i]);
    else if (!a.startsWith('--') && !o.version) o.version = a;
    else fail(`未知参数：${a}`);
  }
  if (!/^v\d+\.\d+\.\d+$/.test(o.version)) fail(`版本号必须是三段 vX.Y.Z，收到「${o.version}」`);
  if (!o.siteUrl) fail('--site-url 不能为空');
  if (!(o.footerTimeout > 0)) fail('--footer-timeout 必须是正数（秒）');
  return o;
}

const done = [];
function fail(msg) {
  if (done.length) console.error(`已完成：\n${done.map((d) => `  ✓ ${d}`).join('\n')}`);
  console.error(`✗ 失败：${msg}`);
  process.exit(1);
}
const log = (m) => console.log(m);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gh = (...a) => spawnSync('gh', a, { encoding: 'utf8' });
const isAncestor = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b]).status === 0;

/**
 * 打 tag 前的纯决策（#134）：看本地/远端同名 tag 是否已指向 main 头部。
 * @param {{ version: string, localCommit: string | null, remoteCommit: string | null, mainHead: string }} p
 * @returns {{ action: 'create' } | { action: 'skip', where: string } | { action: 'fail', message: string }}
 */
export function decideTagAction({ version, localCommit, remoteCommit, mainHead }) {
  const existing = [];
  if (localCommit) existing.push({ where: '本地', commit: localCommit });
  if (remoteCommit) existing.push({ where: '远端', commit: remoteCommit });
  if (!existing.length) return { action: 'create' };
  const bad = existing.find((e) => e.commit !== mainHead);
  if (bad) {
    return {
      action: 'fail',
      message: `${version} 指向 ${bad.commit.slice(0, 7)}，main 已经到 ${mainHead.slice(0, 7)}；请人工核对后再跑`,
    };
  }
  return { action: 'skip', where: existing.map((e) => e.where).join('和') };
}

/** 本地 tag 剥到 commit；不存在则 null */
function localTagCommit(version) {
  const r = spawnSync('git', ['rev-parse', '--verify', `${version}^{commit}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** 从 ls-remote 快照取 tag 指向的 commit（annotated 优先剥 ^{}） */
function remoteTagCommit(refs, version) {
  return refs.get(`refs/tags/${version}^{}`) ?? refs.get(`refs/tags/${version}`) ?? null;
}

/** 远端 refs 快照（ls-remote，只读，不动本地 ref） */
function remoteRefs() {
  const m = new Map();
  for (const line of git('ls-remote', REMOTE).split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t');
    m.set(ref, sha);
  }
  return m;
}

function ciGreen(sha) {
  const r = gh('api', `repos/{owner}/{repo}/commits/${sha}/check-runs`);
  if (r.status !== 0) return { ok: false, why: `查询 CI 失败：${(r.stderr || '').trim()}` };
  let runs;
  try {
    runs = JSON.parse(r.stdout).check_runs ?? [];
  } catch {
    return { ok: false, why: 'CI 查询结果无法解析' };
  }
  if (!runs.length) return { ok: false, why: '该提交没有 CI 记录' };
  const bad = runs.filter((c) => c.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(c.conclusion));
  return bad.length ? { ok: false, why: bad.map((c) => `${c.name}=${c.conclusion ?? c.status}`).join(', ') } : { ok: true };
}

/** 用 Playwright 读渲染后的页脚（页脚由前端渲染，curl 读源码拿不到） */
async function readFooter(browser, siteUrl) {
  const page = await browser.newPage();
  try {
    const u = new URL(siteUrl);
    u.searchParams.set('_release_check', String(Date.now())); // 绕过 CDN 缓存
    await page.goto(u.toString(), { waitUntil: 'load', timeout: 30_000 });
    const ver = page.locator('[data-t="footer-app-version"]').first();
    const build = page.locator('[data-t="footer-build"]').first();
    await build.waitFor({ timeout: 15_000 });
    return { version: ((await ver.textContent()) ?? '').trim(), build: ((await build.textContent()) ?? '').trim() };
  } finally {
    await page.close();
  }
}

function changelogSection(ref, version) {
  const text = git('show', `${ref}:CHANGELOG.md`);
  const v = version.slice(1).replace(/\./g, '\\.');
  const m = text.match(new RegExp(`^## \\[v?${v}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'm'));
  if (!m || !m[1].trim()) fail(`CHANGELOG.md 里找不到 [${version.slice(1)}] 小节或内容为空`);
  return m[1].trim() + '\n';
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { version, dryRun, siteUrl } = o;
  const branch = `release/${version}`;
  const DRY = dryRun ? '[dry-run] ' : '';
  log(`${DRY}发版 ${version}：${branch} → main，站点 ${siteUrl}`);

  // ── 前置检查（只读）──
  let refs = remoteRefs();
  const relHead = refs.get(`refs/heads/${branch}`);
  const mainHead0 = refs.get('refs/heads/main');
  if (!relHead) fail(`远端没有分支 ${branch}`);
  if (!mainHead0) fail('远端没有 main 分支');
  if (!dryRun) git('fetch', '-q', REMOTE, `refs/heads/${branch}:refs/remotes/${REMOTE}/${branch}`, `refs/heads/main:refs/remotes/${REMOTE}/main`);
  const merged = isAncestor(relHead, mainHead0);
  const tagCommit = remoteTagCommit(refs, version);
  const tagObj = tagCommit; // 远端是否已有该 tag（剥到 commit）
  if (tagCommit && !(merged && tagCommit === mainHead0))
    fail(`${version} 指向 ${tagCommit.slice(0, 7)}，main 已经到 ${mainHead0.slice(0, 7)}；请人工核对后再跑`);
  const ci = ciGreen(relHead);
  log(`${DRY}检查 CI：gh api repos/{owner}/{repo}/commits/${relHead.slice(0, 7)}/check-runs`);
  if (!ci.ok) fail(`${branch} 头部 ${relHead.slice(0, 7)} 的 CI 不是绿的：${ci.why}`);
  done.push(`前置检查：CI 绿（${relHead.slice(0, 7)}）`);

  // ── 第 1 步：合并 release → main（merge commit）──
  let mainHead = mainHead0;
  if (merged) {
    log(`跳过合并：${branch} 已在 main 里（main 头部 ${mainHead.slice(0, 7)}）`);
  } else if (dryRun) {
    log(`[dry-run] merge：git merge-tree --write-tree main ${branch} → git commit-tree（父提交 main、${branch}）→ git push ${REMOTE} <merge>:refs/heads/main`);
  } else {
    const tree = spawnSync('git', ['merge-tree', '--write-tree', mainHead0, relHead], { encoding: 'utf8' });
    if (tree.status !== 0) fail(`merge 有冲突，先把 main 同步回 ${branch}：\n${tree.stdout}`);
    const msg = `Merge branch '${branch}'\n\n发版 ${version}（scripts/release.mjs）`;
    const c = execFileSync('git', ['commit-tree', tree.stdout.split('\n')[0], '-p', mainHead0, '-p', relHead, '-m', msg], { encoding: 'utf8' }).trim();
    // --force-with-lease：main 在此期间被别人推过就失败，不覆盖
    git('push', '-q', `--force-with-lease=refs/heads/main:${mainHead0}`, REMOTE, `${c}:refs/heads/main`);
    mainHead = c;
    log(`merge：已推送 merge commit ${c.slice(0, 7)} 到 main`);
  }
  done.push(`合并：main 头部 ${dryRun && !merged ? '<merge commit>' : mainHead.slice(0, 7)}`);

  // ── 第 2 步：等部署，读线上页脚 ──
  const tagDone = !!tagObj; // 前置检查已保证此时 tag 指向 main 头部
  if (dryRun) {
    log(
      `[dry-run] 页脚 footer：用 Playwright 打开 ${siteUrl}，最多等 ${o.footerTimeout}s，要求 [data-t=footer-app-version] = ${version}、[data-t=footer-build] 构建号 = 合并后 main 头部`,
    );
  } else if (tagDone) {
    log(`跳过页脚核对：tag ${version} 已指向 main 头部，说明之前已核对通过`);
  } else {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const deadline = Date.now() + o.footerTimeout * 1000;
    let last = null;
    try {
      for (;;) {
        try {
          last = await readFooter(browser, siteUrl);
        } catch (e) {
          last = { error: String(e?.message ?? e).split('\n')[0] };
        }
        const b = last.build?.match(/[0-9a-f]{7,40}/)?.[0];
        const vOk = last.version?.replace(/^v/, '') === version.slice(1);
        if (b && mainHead.startsWith(b) && vOk) break;
        if (Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, Math.min(10_000, Math.max(500, deadline - Date.now()))));
      }
    } finally {
      await browser.close();
    }
    const b = last?.build?.match(/[0-9a-f]{7,40}/)?.[0];
    if (!(b && mainHead.startsWith(b) && last.version?.replace(/^v/, '') === version.slice(1)))
      fail(
        `线上页脚核对超时（${o.footerTimeout}s）：期望版本 ${version}、构建 ${mainHead.slice(0, 7)}；` +
          (last?.error ? `读取出错 ${last.error}` : `实际版本「${last?.version}」、「${last?.build}」`) +
          '。未打 tag；部署完成后重跑即可（合并会自动跳过）',
      );
    log(`页脚 footer：${last.version} · ${last.build}，与 main 头部一致`);
  }
  done.push('页脚核对');

  // ── 第 3 步：annotated tag（#134：本地/远端分别解析，再 decideTagAction）──
  if (dryRun) {
    log(`[dry-run] tag：用 ls-remote / 本地 rev-parse 看 ${version}；已指向 main 头部则跳过，否则 git tag -a ${version} -m ${version} <main 头部> && git push ${REMOTE} refs/tags/${version}`);
  } else {
    // 先读本地；fetch --tags 在本地/远端同名指向不同提交时会撞车，不能让它抛原始堆栈
    const localCommit = localTagCommit(version);
    const fetchTags = spawnSync('git', ['fetch', '-q', REMOTE, '--tags'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // 远端一律用 ls-remote，不依赖 fetch 是否成功
    refs = remoteRefs();
    const remoteCommit = remoteTagCommit(refs, version);
    const decision = decideTagAction({ version, localCommit, remoteCommit, mainHead });
    if (decision.action === 'fail') fail(decision.message);
    // fetch 失败且两端都没有可用 tag 信息时，才把拉取错误顶上来（分歧情况已由上面 fail）
    if (fetchTags.status !== 0 && decision.action === 'create') {
      const err = (fetchTags.stderr || fetchTags.stdout || '').trim() || `exit ${fetchTags.status}`;
      fail(`拉取 tags 失败：${err.split('\n')[0]}`);
    }
    if (decision.action === 'skip') {
      log(`跳过打 tag：${version} 已在${decision.where}指向 main 头部 ${mainHead.slice(0, 7)}`);
      // 仅本地有、远端还没有时补推，避免跳过创建 tag 却漏推远端
      if (!remoteCommit) {
        git('push', '-q', REMOTE, `refs/tags/${version}`);
        log(`tag：已推送已有本地 tag ${version} → ${mainHead.slice(0, 7)}`);
      }
    } else {
      git('tag', '-a', version, '-m', version, mainHead);
      git('push', '-q', REMOTE, `refs/tags/${version}`);
      log(`tag：已推送 annotated tag ${version} → ${mainHead.slice(0, 7)}`);
    }
  }
  done.push(`tag ${version}`);

  // ── 第 4 步：起草 GitHub Release（draft）──
  const exists = gh('release', 'view', version, '--json', 'tagName').status === 0;
  if (exists) log(`跳过 Release：${version} 已存在（draft 或已发布）`);
  else if (dryRun) {
    const notes = changelogSection(merged ? mainHead : relHead, version);
    log(`[dry-run] release：gh release create ${version} --draft --verify-tag --title ${version} --notes-file <CHANGELOG [${version.slice(1)}] 小节>`);
    log(notes.replace(/^/gm, '  | '));
  } else {
    const notes = changelogSection(mainHead, version);
    const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
    const f = join(dir, 'notes.md');
    writeFileSync(f, notes);
    const r = gh('release', 'create', version, '--draft', '--verify-tag', '--title', version, '--notes-file', f);
    rmSync(dir, { recursive: true, force: true });
    if (r.status !== 0) fail(`gh release create 失败：${(r.stderr || '').trim()}`);
    log(`release：已起草 draft Release ${version}${r.stdout.trim() ? ` ${r.stdout.trim()}` : ''}`);
  }
  done.push(`Release ${version}（draft）`);
  log(`${DRY}完成：${done.join(' → ')}`);
}

const isDirectRun = import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href;
if (isDirectRun) {
  main().catch((e) => fail(String(e?.stack ?? e)));
}
