#!/usr/bin/env node
/**
 * 零冲突发布变更片段校验、PR 防重与汇总递增脚本（#1528）。
 *
 * 仅使用 Node 内置模块与 scripts/changelog.mjs（零第三方依赖），使 CI prepare 阶段无需 npm ci 即可执行。
 * 约定：功能 PR 在根目录 release-notes/<issue>.json（或 <issue>-<slug>.json）提交变更片段，
 * 不再手工修改 package.json / package-lock.json / CHANGELOG.md；合入 main 后统一汇总递增并删除已消费片段。
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changelogOrderErrors, insertVersionSection } from './changelog.mjs';

export const RELEASE_NOTES_DIR = 'release-notes';
export const FRAGMENT_FILE_RE = /^([1-9]\d*)(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\.json$/;
export const BUMP_LEVELS = Object.freeze(['patch', 'minor', 'major']);
const BUMP_RANK = Object.freeze({ patch: 0, minor: 1, major: 2 });
const ALLOWED_KEYS = new Set(['bump', 'issue', 'summary']);
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export function bumpVersion(current, level) {
  const match = SEMVER_RE.exec(String(current ?? ''));
  if (!match) throw new Error(`当前版本号必须是三段 X.Y.Z，收到「${current}」`);
  if (!BUMP_LEVELS.includes(level)) throw new Error(`未知版本递增级别「${level}」，仅允许 ${BUMP_LEVELS.join('/')}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function highestBump(fragments) {
  let best = null;
  for (const item of fragments) {
    const level = item.bump ?? 'patch';
    if (!BUMP_LEVELS.includes(level)) throw new Error(`未知版本递增级别「${level}」`);
    if (best === null || BUMP_RANK[level] > BUMP_RANK[best]) best = level;
  }
  return best;
}

export function formatShanghaiDate(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) throw new Error(`无法格式化上海日期：${formatted}`);
  return formatted;
}

export function validateFragment(filename, data) {
  const errors = [];
  const label = `${RELEASE_NOTES_DIR}/${filename}`;
  const fileMatch = FRAGMENT_FILE_RE.exec(filename);
  if (!fileMatch) {
    return { fragment: null, errors: [`${label}：文件名不合法，应为 <issue>.json 或 <issue>-<slug>.json`] };
  }
  const fileIssue = Number(fileMatch[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { fragment: null, errors: [`${label}：顶层必须是 JSON 对象`] };
  }
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`${label}：不允许未知字段「${key}」`);
  }
  if (!Number.isSafeInteger(data.issue) || data.issue < 1) {
    errors.push(`${label}：issue 必须是正整数`);
  } else if (data.issue !== fileIssue) {
    errors.push(`${label}：issue（${data.issue}）与文件名前缀编号（${fileIssue}）不一致`);
  }
  const bump = data.bump === undefined ? 'patch' : data.bump;
  if (typeof bump !== 'string' || !BUMP_LEVELS.includes(bump)) {
    errors.push(`${label}：bump 必须是 ${BUMP_LEVELS.join(' / ')}（缺省默认 patch）`);
  }
  if (typeof data.summary !== 'string') {
    errors.push(`${label}：summary 必须是字符串`);
  } else {
    if (/[\r\n]/.test(data.summary)) errors.push(`${label}：summary 必须是单行文本，不能包含换行`);
    const trimmed = data.summary.trim();
    if (trimmed.length < 5 || trimmed.length > 2000) errors.push(`${label}：summary 去除首尾空白后长度需在 5–2000 字符之间`);
    if (/^(?:[-*+]\s|#)/.test(trimmed)) errors.push(`${label}：summary 不要以列表符号（- / *）或 Markdown 标题（#）开头`);
    if (Number.isSafeInteger(data.issue) && data.issue >= 1 && !new RegExp(`#${data.issue}(?!\\d)`).test(trimmed)) {
      errors.push(`${label}：summary 须包含对应 Issue 编号 #${data.issue}`);
    }
  }
  if (errors.length) return { fragment: null, errors };
  return {
    fragment: { file: filename, issue: data.issue, bump, summary: data.summary.trim() },
    errors: [],
  };
}

export function collectReleaseNotes(root = process.cwd()) {
  const dir = join(root, RELEASE_NOTES_DIR);
  if (!existsSync(dir)) return { files: [], fragments: [], errors: [] };
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    return { files: [], fragments: [], errors: [`${RELEASE_NOTES_DIR} 必须是普通目录，不能是符号链接或文件`] };
  }
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const fragments = [];
  const errors = [];
  const seenKey = new Map();
  for (const entry of entries) {
    const rel = `${RELEASE_NOTES_DIR}/${entry.name}`;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`${rel}：禁止使用符号链接`);
      continue;
    }
    if (!entry.isFile()) {
      errors.push(`${rel}：release-notes/ 下禁止子目录或非常规文件`);
      continue;
    }
    if (entry.name === '.gitkeep') {
      const keepText = readFileSync(full, 'utf8');
      if (keepText.trim() !== '') errors.push(`${rel}：.gitkeep 必须为空文件`);
      continue;
    }
    if (!FRAGMENT_FILE_RE.test(entry.name)) {
      errors.push(`${rel}：文件名不合法，仅允许 .gitkeep 或 <issue>.json / <issue>-<slug>.json`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      errors.push(`${rel}：JSON 语法无效（${error.message.slice(0, 120)}）`);
      continue;
    }
    const result = validateFragment(entry.name, parsed);
    if (result.errors.length) {
      errors.push(...result.errors);
      continue;
    }
    const dedupKey = `${result.fragment.issue}\n${result.fragment.summary}`;
    const prior = seenKey.get(dedupKey);
    if (prior) {
      errors.push(`${rel}：与 ${RELEASE_NOTES_DIR}/${prior} 存在重复的 Issue 与更新摘要`);
      continue;
    }
    seenKey.set(dedupKey, entry.name);
    fragments.push(result.fragment);
  }
  fragments.sort((a, b) => a.issue - b.issue || a.file.localeCompare(b.file, 'en'));
  return { files: fragments.map((f) => `${RELEASE_NOTES_DIR}/${f.file}`), fragments, errors };
}

export function checkVersionConsistency(root = process.cwd()) {
  const errors = [];
  let pkg = null;
  let lock = null;
  let changelog = null;
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch (error) {
    errors.push(`package.json 读取或解析失败：${error.message}`);
  }
  try {
    lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  } catch (error) {
    errors.push(`package-lock.json 读取或解析失败：${error.message}`);
  }
  try {
    changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  } catch (error) {
    errors.push(`CHANGELOG.md 读取失败：${error.message}`);
  }
  const version = typeof pkg?.version === 'string' ? pkg.version : '';
  if (pkg && !SEMVER_RE.test(version)) errors.push(`package.json version 必须是三段 X.Y.Z，收到「${pkg.version}」`);
  if (pkg && lock) {
    if (lock.version !== version) errors.push(`package-lock.json 顶层 version（${lock.version}）与 package.json（${version}）不一致`);
    if (lock.packages?.['']?.version !== version) {
      errors.push(`package-lock.json packages[""].version（${lock.packages?.['']?.version}）与 package.json（${version}）不一致`);
    }
  }
  if (changelog !== null) {
    for (const issue of changelogOrderErrors(changelog)) errors.push(`CHANGELOG.md 结构错误：${issue}`);
  }
  return { version, pkg, lock, changelog, errors };
}

export function checkReleaseNotes(root = process.cwd()) {
  const notes = collectReleaseNotes(root);
  const meta = checkVersionConsistency(root);
  return {
    files: notes.files,
    fragments: notes.fragments,
    version: meta.version,
    errors: [...notes.errors, ...meta.errors],
  };
}

function parseRawDiffZ(raw) {
  const fields = raw.split('\0');
  if (fields.pop() !== '' || fields.length % 2 !== 0) throw new Error('git diff --raw -z 输出不完整');
  const entries = [];
  for (let i = 0; i < fields.length; i += 2) {
    const meta = fields[i] ?? '';
    const path = fields[i + 1] ?? '';
    const status = meta.trim().split(/\s+/).at(-1) ?? '';
    entries.push({ status, path });
  }
  return entries;
}

export function checkPullRequestReleaseNotes(base, head, root = process.cwd()) {
  if (!SHA_RE.test(String(base ?? '')) || !SHA_RE.test(String(head ?? ''))) {
    return { ok: false, hasFragments: false, errors: ['缺少合法的 PR_BASE_SHA 或 GITHUB_SHA，无法核对发布片段边界'] };
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const entries = parseRawDiffZ(git('diff', '--raw', '--no-renames', '-z', base, head, '--'));
  const addedOrModifiedFragments = entries.filter(
    (entry) => (entry.status === 'A' || entry.status === 'M') && entry.path.startsWith(`${RELEASE_NOTES_DIR}/`) && entry.path.endsWith('.json'),
  );
  if (!addedOrModifiedFragments.length) return { ok: true, hasFragments: false, errors: [] };

  const errors = [];
  const changedPaths = new Set(entries.map((entry) => entry.path));
  const readJsonAt = (ref, file) => JSON.parse(git('show', `${ref}:${file}`));
  if (changedPaths.has('CHANGELOG.md')) {
    errors.push('已提交 release-notes/*.json 变更片段，请勿在功能 PR 中同时修改 CHANGELOG.md（合入 main 后自动生成）');
  }
  if (changedPaths.has('package.json')) {
    const before = readJsonAt(base, 'package.json');
    const after = readJsonAt(head, 'package.json');
    if (before.version !== after.version) {
      errors.push(`已提交 release-notes/*.json 变更片段，请勿在功能 PR 中同时修改 package.json version（${before.version} → ${after.version}）`);
    }
  }
  if (changedPaths.has('package-lock.json')) {
    const before = readJsonAt(base, 'package-lock.json');
    const after = readJsonAt(head, 'package-lock.json');
    if (before.version !== after.version || before.packages?.['']?.version !== after.packages?.['']?.version) {
      errors.push('已提交 release-notes/*.json 变更片段，请勿在功能 PR 中同时修改 package-lock.json 版本号');
    }
  }
  return { ok: errors.length === 0, hasFragments: true, errors };
}

export function applyReleaseNotes(root = process.cwd(), { dryRun = false, date } = {}) {
  const notes = collectReleaseNotes(root);
  const meta = checkVersionConsistency(root);
  const errors = [...notes.errors, ...meta.errors];
  if (errors.length) throw new Error(`发布片段校验失败（${errors.length} 项）：\n${errors.map((e) => `- ${e}`).join('\n')}`);
  if (!notes.fragments.length) {
    return {
      changed: false,
      count: 0,
      previousVersion: meta.version,
      version: meta.version,
      bump: null,
      date: null,
      issues: [],
      consumedFiles: [],
    };
  }
  const bump = highestBump(notes.fragments);
  const nextVersion = bumpVersion(meta.version, bump);
  const dateStr = date ?? formatShanghaiDate();
  const body = notes.fragments.map((item) => `- ${item.summary}`).join('\n');
  const nextChangelog = insertVersionSection(meta.changelog, nextVersion, dateStr, body);
  const orderErrors = changelogOrderErrors(nextChangelog);
  if (orderErrors.length) throw new Error(`生成的 CHANGELOG.md 顺序校验失败：${orderErrors.join('；')}`);

  const nextPkg = { ...meta.pkg, version: nextVersion };
  const nextLock = {
    ...meta.lock,
    version: nextVersion,
    packages: { ...meta.lock.packages, '': { ...meta.lock.packages[''], version: nextVersion } },
  };
  const nextPkgText = `${JSON.stringify(nextPkg, null, 2)}\n`;
  const nextLockText = `${JSON.stringify(nextLock, null, 2)}\n`;

  if (!dryRun) {
    writeFileSync(join(root, 'package.json'), nextPkgText, 'utf8');
    writeFileSync(join(root, 'package-lock.json'), nextLockText, 'utf8');
    writeFileSync(join(root, 'CHANGELOG.md'), nextChangelog, 'utf8');
    for (const file of notes.files) rmSync(join(root, file));
  }
  return {
    changed: true,
    count: notes.fragments.length,
    previousVersion: meta.version,
    version: nextVersion,
    bump,
    date: dateStr,
    issues: [...new Set(notes.fragments.map((item) => item.issue))],
    consumedFiles: notes.files,
  };
}

function writeGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(values)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function resolveCommitRef(ref, root) {
  const value = String(ref ?? '').trim();
  if (!value || SHA_RE.test(value) || value.startsWith('-')) return value;
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${value}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return value;
  }
}

export function main(argv = process.argv.slice(2)) {
  let mode = '';
  let root = process.cwd();
  let dryRun = false;
  let date;
  let jsonOut = false;
  let githubOutput = false;
  let base = process.env.PR_BASE_SHA;
  let head = process.env.GITHUB_SHA;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check' || arg === '--check-pr' || arg === '--status' || arg === '--apply') {
      if (mode) throw new Error(`只能指定一个模式，收到 ${mode} 与 ${arg}`);
      mode = arg.slice(2);
    } else if (arg === '--root' && argv[i + 1]) root = resolve(argv[++i]);
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--date' && argv[i + 1]) date = argv[++i];
    else if (arg === '--json') jsonOut = true;
    else if (arg === '--github-output') githubOutput = true;
    else if (arg === '--base' && argv[i + 1]) base = argv[++i];
    else if (arg === '--head' && argv[i + 1]) head = argv[++i];
    else throw new Error(`未知参数：${arg}`);
  }
  if (!mode) throw new Error('用法：node scripts/release-notes.mjs <--check|--check-pr|--status|--apply> [选项]');

  if (mode === 'check') {
    const result = checkReleaseNotes(root);
    if (result.errors.length) {
      console.error(`发布片段与版本一致性检查失败（${result.errors.length} 项）：`);
      for (const error of result.errors) console.error(`- ${error}`);
      return 1;
    }
    console.log(`发布片段与版本一致性通过：当前 v${result.version}，待发布片段 ${result.fragments.length} 份`);
    return 0;
  }

  if (mode === 'check-pr') {
    const result = checkPullRequestReleaseNotes(resolveCommitRef(base, root), resolveCommitRef(head, root), root);
    if (!result.ok) {
      console.error(`PR 发布片段防重检查失败（${result.errors.length} 项）：`);
      for (const error of result.errors) console.error(`- ${error}`);
      return 1;
    }
    console.log(result.hasFragments ? 'PR 发布片段防重检查通过：已提交变更片段且未手工改动版本/CHANGELOG' : 'PR 未含发布片段，放行');
    return 0;
  }

  if (mode === 'status') {
    const result = checkReleaseNotes(root);
    if (result.errors.length) {
      console.error(`发布片段校验失败（${result.errors.length} 项）：`);
      for (const error of result.errors) console.error(`- ${error}`);
      return 1;
    }
    const bump = highestBump(result.fragments);
    const nextVersion = bump ? bumpVersion(result.version, bump) : result.version;
    const payload = {
      version: result.version,
      nextVersion,
      bump,
      count: result.fragments.length,
      files: result.files,
      issues: [...new Set(result.fragments.map((f) => f.issue))],
    };
    if (githubOutput) {
      writeGithubOutput({
        count: payload.count,
        version: payload.version,
        next_version: payload.nextVersion,
        bump: payload.bump ?? '',
      });
    }
    console.log(jsonOut ? JSON.stringify(payload) : `待发布片段 ${payload.count} 份（v${payload.version} → v${payload.nextVersion}）`);
    return 0;
  }

  const applied = applyReleaseNotes(root, { dryRun, date });
  if (githubOutput) {
    writeGithubOutput({
      changed: applied.changed,
      count: applied.count,
      version: applied.version,
      tag: `v${applied.version}`,
      issues: applied.issues.join(','),
    });
  }
  console.log(
    jsonOut
      ? JSON.stringify(applied)
      : applied.changed
        ? `${dryRun ? '[dry-run] ' : ''}已汇总 ${applied.count} 份片段：v${applied.previousVersion} → v${applied.version}（${applied.date}）`
        : `无待发布片段，保持 v${applied.version} 不变`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
