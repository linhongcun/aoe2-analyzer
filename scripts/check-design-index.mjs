#!/usr/bin/env node
/**
 * 校验 docs/design/README.md 的索引没有死链、必需条目缺失或过期状态词。
 *
 * 只读；默认 static CI 通过 `npm run lint` 调用。索引是策展清单，不要求
 * 覆盖 docs/design 下全部文件。
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_ENTRIES = Object.freeze([
  'chinese197.md',
  'gurjaras197.md',
  'mapuche197.md',
  'mayans197.md',
  'final-civs197.md',
  'mechanism-652/SPEC.md',
  'routes-652/SPEC.md',
  'mockups/issue3-summary-2x2/range-390/',
]);
export const FORBIDDEN_PHRASES = Object.freeze(['实现未做', '仍 OPEN', '不关 #584', '尚未出新稿']);

const isExternal = (target) => /^(https?:|mailto:|#)/i.test(target);
const isInlinePath = (value) =>
  (value.startsWith('src/') || value.startsWith('scripts/') || value.startsWith('docs/') || value.startsWith('mockups/')) &&
  !value.includes('<') &&
  !value.includes('*') &&
  !value.includes(' ') &&
  (/[./]$/.test(value) || /\.(md|json|css|ts|tsx|mjs|png)$/.test(value));

/**
 * @param {{root?: string, readmePath?: string, requiredEntries?: readonly string[], forbidden?: readonly string[]}} [options]
 * @returns {string[]}
 */
export function checkDesignIndex(options = {}) {
  const root = options.root ?? process.cwd();
  const readmePath = options.readmePath ?? 'docs/design/README.md';
  const requiredEntries = options.requiredEntries ?? REQUIRED_ENTRIES;
  const forbidden = options.forbidden ?? FORBIDDEN_PHRASES;
  const absoluteReadme = join(root, readmePath);
  let readme;
  try {
    readme = readFileSync(absoluteReadme, 'utf8');
  } catch {
    return [`无法读取索引: ${readmePath}`];
  }
  const problems = [];
  const base = dirname(absoluteReadme);

  for (const match of readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = (match[1] ?? '').trim();
    if (!target || isExternal(target)) continue;
    const clean = target.split('#')[0]?.split('?')[0] ?? '';
    if (!clean) continue;
    if (!existsSync(resolve(base, clean))) problems.push(`死链: ${target}`);
  }

  for (const match of readme.matchAll(/`([^`]+)`/g)) {
    const value = (match[1] ?? '').trim();
    if (!value || !isInlinePath(value)) continue;
    const inlineBase = value.startsWith('src/') || value.startsWith('scripts/') || value.startsWith('docs/') ? root : base;
    if (!existsSync(resolve(inlineBase, value))) problems.push(`内联路径不存在: ${value}`);
  }

  for (const entry of requiredEntries) {
    if (!readme.includes(entry)) problems.push(`缺少必需条目: ${entry}`);
  }
  for (const phrase of forbidden) {
    if (readme.includes(phrase)) problems.push(`过期状态词: ${phrase}`);
  }
  return problems;
}

function main(argv = process.argv.slice(2)) {
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root' && argv[index + 1]) {
      root = resolve(argv[index + 1]);
      index += 1;
    } else {
      console.error(`未知参数：${argv[index]}`);
      return 2;
    }
  }
  const problems = checkDesignIndex({ root });
  if (problems.length) {
    console.error(`docs/design/README.md 索引校验失败（${problems.length} 项）：`);
    for (const problem of problems) console.error(`- ${problem}`);
    return 1;
  }
  console.log('docs/design/README.md：链接、内联路径与必需条目通过');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main();
}
