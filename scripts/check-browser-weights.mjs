#!/usr/bin/env node
/**
 * 校验浏览器分片权重覆盖。
 *
 * 只读；默认 static CI 通过 `npm run lint` 调用。权重文件是历史种子，
 * 不是实测承诺；本检查只保证每个 spec 都有显式条目、正权重和合法 schema。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BROWSER_WEIGHTS_SCHEMA = 1;

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * @param {readonly string[]} specNames flat `*.spec.ts` file names
 * @param {unknown} weights parsed ci-browser-weights.json
 * @returns {string[]}
 */
export function compareBrowserWeights(specNames, weights) {
  const problems = [];
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return ['权重文件顶层必须是 object'];
  if (weights.schema !== BROWSER_WEIGHTS_SCHEMA) problems.push(`schema: 必须是 ${BROWSER_WEIGHTS_SCHEMA}`);
  if (!isPositiveSafeInteger(weights.defaultCaseMs)) problems.push('defaultCaseMs: 必须是正整数');
  if (!isPositiveSafeInteger(weights.staticSweepMs)) problems.push('staticSweepMs: 必须是正整数');
  const files = weights.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return [...problems, 'files: 必须是 object'];

  const expected = new Set(specNames.filter((name) => name.endsWith('.spec.ts')).map((name) => `tests/e2e/${name}`));
  const actual = new Set(Object.keys(files));
  for (const file of [...expected].sort()) {
    if (!actual.has(file)) problems.push(`缺失权重: ${file}`);
  }
  for (const file of [...actual].sort()) {
    if (!expected.has(file)) problems.push(`多余权重: ${file}`);
  }
  for (const [file, value] of Object.entries(files)) {
    if (!isPositiveSafeInteger(value)) problems.push(`权重必须是正整数: ${file} = ${JSON.stringify(value)}`);
  }
  return problems;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
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
  try {
    const weights = readJson(join(root, 'scripts/ci-browser-weights.json'));
    const names = readdirSync(join(root, 'tests/e2e'), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const problems = compareBrowserWeights(names, weights);
    if (problems.length) {
      console.error(`ci-browser-weights.json 校验失败（${problems.length} 项）：`);
      for (const problem of problems) console.error(`- ${problem}`);
      return 1;
    }
    console.log(`ci-browser-weights.json：${names.filter((name) => name.endsWith('.spec.ts')).length} 个 spec，覆盖完整`);
    return 0;
  } catch (error) {
    console.error(`ci-browser-weights.json 校验失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
