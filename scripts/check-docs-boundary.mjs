#!/usr/bin/env node
/**
 * 文档与数据的边界（#1077）：Markdown 只给人看，机器读 JSON。
 *
 * 1. 位置：跟踪的 *.md 只能在 docs/、role/、.github/，或是根目录的 README / AGENTS / CONTRIBUTING / CHANGELOG；
 *    data/ 下只放 .json。
 * 2. 读取：scripts/、tests/、src/ 和根目录配置里的代码不读 Markdown 正文。需要的字段由生成器写进 data/ 的 JSON，
 *    Markdown 是那份 JSON 的排版。例外逐条登记在 READERS（检查文档本身的脚本、核对自己排版的生成器）和
 *    READABLE（CHANGELOG.md，发版脚本按 Keep a Changelog 解析）。
 *
 * 读取检查按行匹配源码，能拦住直接写出路径的读法和「先赋值再读」的写法，不解析语法树。
 * 只读；`npm run lint` 调用。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKDOWN_HOMES = Object.freeze(['docs/', 'role/', '.github/']);
export const ROOT_MARKDOWN = Object.freeze(['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md']);
/** 任何代码都可以读的 Markdown。 */
export const READABLE = Object.freeze(['CHANGELOG.md']);
/** 可以读 Markdown 的代码文件，以及理由。 */
export const READERS = Object.freeze({
  'scripts/check-design-index.mjs': '检查 docs/design/README.md 自身的死链和必需条目',
  'scripts/check-docs-boundary.mjs': '本检查',
  'scripts/effects_audit.ts': '--check 把重新排版的结果与 docs/reports/EFFECTS-AUDIT.md 整份比对',
  'scripts/history_build.py': '--check 把重新排版的结果与 docs/reports/HISTORY-DATA.md 整份比对',
  'scripts/patch_notes.py': '--check 把重新排版的结果与 docs/patch-notes/<补丁号>.md 比对',
  'tests/unit/docsBoundary1077.test.ts': '本检查的测试样例',
});

const CODE = /\.(?:ts|tsx|mts|mjs|cjs|js|py)$/;
const CODE_ROOTS = ['scripts/', 'tests/', 'src/'];
const READ_CALL = /\b(?:readFileSync|readFile|read_text|read_bytes|open|read|text|load)\s*\(|git\(\s*['"]show['"]/;
const LITERAL = /(['"`])((?:(?!\1)[^\\\n])*?\.md)\1/g;
/** 路径直接赋给一个名字：`const DOC = 'docs/X.md'`、`DOC = 'docs/X.md'`。 */
const HOLDER = /(?:^|\s)([A-Za-z_$][\w$]*)\s*(?::\s*[\w.[\]<>| ]+)?=\s*['"`][^'"`]*\.md['"`]/;
/** 路径列表被逐个取出：`for (const file of ['README.md'])`、`for file in ('README.md',)`。 */
const LOOP = /\bfor\s*\(?\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\s*[[(]\s*['"`]/;
const isUrl = (value) => /^[a-z]+:\/\//i.test(value) || value.includes('/blob/');
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isCode = (path) => CODE.test(path) && (CODE_ROOTS.some((root) => path.startsWith(root)) || !path.includes('/'));

/** @param {readonly string[]} files @returns {string[]} */
export function misplaced(files) {
  const problems = [];
  for (const path of files) {
    if (path.endsWith('.md') && !ROOT_MARKDOWN.includes(path) && !MARKDOWN_HOMES.some((home) => path.startsWith(home)))
      problems.push(`${path}：Markdown 只能放在 docs/（或 role/、.github/、根目录四份约定文件）`);
    else if (path.startsWith('data/') && !path.endsWith('.json')) problems.push(`${path}：data/ 只放 .json`);
  }
  return problems;
}

/** @param {string} path @param {string} source @returns {string[]} */
export function markdownReads(path, source) {
  if (path in READERS) return [];
  const lines = source.split('\n');
  const problems = [];
  const held = new Map();
  lines.forEach((line, index) => {
    const targets = [...line.matchAll(LITERAL)]
      .map((match) => match[2] ?? '')
      .filter((value) => !isUrl(value) && !READABLE.some((file) => value === file || (/[/:]$/.test(value.slice(0, -file.length)) && value.endsWith(file))));
    if (!targets.length) return;
    if (READ_CALL.test(line)) problems.push(`${path}:${index + 1} 读取 ${targets[0]}`);
    const holder = HOLDER.exec(line)?.[1] ?? LOOP.exec(line)?.[1];
    if (holder) held.set(holder, { target: targets[0], line: index + 1 });
  });
  for (const [holder, { target, line }] of held) {
    const use = new RegExp(`(?:${READ_CALL.source})[^\\n]*\\b${escape(holder)}\\b|\\b${escape(holder)}\\b[^\\n]*\\.read_(?:text|bytes)\\(`);
    const at = lines.findIndex((text, index) => index + 1 !== line && use.test(text));
    if (at >= 0) problems.push(`${path}:${at + 1} 读取 ${target}（经第 ${line} 行的 ${holder}）`);
  }
  return problems;
}

/** @param {{root?: string, files?: readonly string[], read?: (path: string) => string}} [options] @returns {string[]} */
export function checkDocsBoundary(options = {}) {
  const root = options.root ?? process.cwd();
  const files =
    options.files ??
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const read = options.read ?? ((path) => readFileSync(join(root, path), 'utf8'));
  const problems = misplaced(files);
  for (const path of files) {
    if (!isCode(path)) continue;
    let source;
    try {
      source = read(path);
    } catch {
      continue; // 已删除但尚未暂存
    }
    problems.push(...markdownReads(path, source));
  }
  return problems;
}

function main(argv = process.argv.slice(2)) {
  const root = argv[0] === '--root' && argv[1] ? resolve(argv[1]) : process.cwd();
  const problems = checkDocsBoundary({ root });
  if (problems.length) {
    console.error(`文档与数据边界检查失败（${problems.length} 项）。Markdown 只给人看；代码要用的内容写进 data/ 下的 JSON：`);
    for (const problem of problems) console.error(`- ${problem}`);
    return 1;
  }
  console.log('文档与数据边界：Markdown 位置与代码读取通过');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main();
}
