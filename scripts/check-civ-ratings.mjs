#!/usr/bin/env node
/**
 * 校验手工维护的文明主观评分文件。
 *
 * 只读；不生成 src/data/civs.json，不联网。默认 static CI 通过 `npm run lint`
 * 调用，Vitest 负例复用同一纯函数。
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CIV_TYPES = Object.freeze(['cav', 'arch', 'inf', 'naval', 'monk', 'siege', 'def', 'eco']);
export const META_KEYS = Object.freeze(['_doc', 'verifiedAt', 'schemaVersion']);

const META = new Set(META_KEYS);
const TYPES = new Set(CIV_TYPES);
const FIELDS = ['fl', 'op', 'pk', 's', 'ty'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function sameKeys(actual, expected) {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((key, index) => key === right[index]);
}

/**
 * @param {unknown} ratings
 * @param {readonly string[]} civNames
 * @returns {string[]}
 */
export function validateCivRatings(ratings, civNames) {
  const problems = [];
  if (!isPlainObject(ratings)) return ['顶层必须是 JSON object'];
  if (!Array.isArray(civNames)) return ['civs.json 必须是文明数组'];

  if (typeof ratings._doc !== 'string' || !ratings._doc.trim()) {
    problems.push('_doc: 必须是非空字符串，写明 8 轴顺序、1–10 分与主观口径');
  }
  if (!isValidDate(ratings.verifiedAt)) {
    problems.push('verifiedAt: 必须是 YYYY-MM-DD 的真实日期');
  }
  if (!Number.isInteger(ratings.schemaVersion) || ratings.schemaVersion < 1) {
    problems.push('schemaVersion: 必须是 >= 1 的整数');
  }

  const keys = Object.keys(ratings).filter((key) => !META.has(key));
  const expected = new Set(civNames);
  for (const civ of civNames) {
    if (!Object.hasOwn(ratings, civ)) problems.push(`${civ}: 评分文件缺少该文明`);
  }
  for (const key of keys) {
    if (!expected.has(key)) problems.push(`${key}: 评分文件包含 civs.json 中不存在的文明`);
  }
  if (keys.length !== civNames.length) {
    problems.push(`文明数量: 评分文件 ${keys.length} 个，civs.json ${civNames.length} 个`);
  }

  for (const civ of keys) {
    if (!expected.has(civ)) continue;
    const row = ratings[civ];
    const where = civ;
    if (!isPlainObject(row)) {
      problems.push(`${where}: 必须是 object`);
      continue;
    }
    if (!sameKeys(Object.keys(row), FIELDS)) {
      problems.push(`${where}: 字段必须恰好是 ${FIELDS.join('/')}`);
    }

    const ty = row.ty;
    if (!Array.isArray(ty) || ty.length < 1 || ty.length > 3) {
      problems.push(`${where}.ty: 必须是 1–3 项数组`);
    } else {
      if (new Set(ty).size !== ty.length) problems.push(`${where}.ty: 不能重复`);
      for (const value of ty) {
        if (!TYPES.has(value)) problems.push(`${where}.ty: 未知类型 ${JSON.stringify(value)}`);
      }
    }

    const s = row.s;
    if (!Array.isArray(s) || s.length !== 8) {
      problems.push(`${where}.s: 必须恰好 8 项`);
    } else {
      s.forEach((value, index) => {
        if (!Number.isInteger(value) || value < 1 || value > 10) {
          problems.push(`${where}.s[${index}]: 必须是 1–10 的整数，实际 ${JSON.stringify(value)}`);
        }
      });
    }

    for (const field of ['fl', 'pk']) {
      const value = row[field];
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        problems.push(`${where}.${field}: 必须是 1–10 的整数，实际 ${JSON.stringify(value)}`);
      }
    }

    if (typeof row.op !== 'string' || !row.op.trim()) {
      problems.push(`${where}.op: 必须是非空字符串`);
    }
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
    const ratings = readJson(join(root, 'scripts/civ_ratings.json'));
    const civs = readJson(join(root, 'src/data/civs.json'));
    const names = civs.map((civ) => civ.en);
    const problems = validateCivRatings(ratings, names);
    if (problems.length) {
      console.error(`civ_ratings.json 校验失败（${problems.length} 项）：`);
      for (const problem of problems) console.error(`- ${problem}`);
      return 1;
    }
    console.log(`civ_ratings.json：${names.length} 个文明，结构校验通过`);
    return 0;
  } catch (error) {
    console.error(`civ_ratings.json 校验失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
