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
export const AXIS_NAMES = Object.freeze(['骑兵', '弓手', '步兵', '经济', '防御', '攻城', '僧侣', '海军']);
export const META_KEYS = Object.freeze(['_doc', 'verifiedAt', 'schemaVersion', 'basis']);

const META = new Set(META_KEYS);
const TYPES = new Set(CIV_TYPES);
const FIELDS = ['fl', 'op', 'pk', 's', 'ty'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BASIS_KEYS = [
  'axes',
  'scale',
  'nature',
  'reviewableEvidence',
  'axisRule',
  'axisGap',
  'alignedPatch',
  'alignedPatchStatus',
  'verifiedAtMeans',
  'communityClaim',
  'communityClaimNote',
  'highlight',
  'uncertainty',
  'positions',
];
const POSITION_KEYS = ['fields', 'labels', 'independentOfAxes', 'nature', 'alignedPatch', 'alignedPatchStatus', 'source'];
const BANNED_BASIS = ['188329', 'DE Update', '已对齐', '赢面'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100) date.setUTCFullYear(year);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function sameKeys(actual, expected) {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((key, index) => key === right[index]);
}

function requirePhrase(problems, where, value, phrases) {
  if (typeof value !== 'string' || !value.trim()) {
    problems.push(`${where}: 必须是非空字符串`);
    return;
  }
  for (const phrase of phrases) {
    if (!value.includes(phrase)) problems.push(`${where}: 必须写明「${phrase}」`);
  }
}

function rejectStamp(problems, where, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const banned of BANNED_BASIS) {
    if (text.includes(banned)) problems.push(`${where}: 不能写入 ${banned}`);
  }
}

function requireUnknownPatch(problems, where, value) {
  if (!isPlainObject(value)) return;
  if (value.alignedPatch !== null) problems.push(`${where}.alignedPatch: 必须是 null，不能填写游戏补丁`);
  if (value.alignedPatchStatus !== 'unknown') problems.push(`${where}.alignedPatchStatus: 必须是 unknown`);
}

/**
 * @param {string[]} problems
 * @param {unknown} basis
 */
function validateBasis(problems, basis) {
  if (!isPlainObject(basis)) {
    problems.push('basis: 必须是 object，写明轴、依据性质和未知项');
    return;
  }
  if (!sameKeys(Object.keys(basis), BASIS_KEYS)) {
    problems.push(`basis: 字段必须恰好是 ${BASIS_KEYS.join('/')}`);
  }
  rejectStamp(problems, 'basis', basis);
  if (!Array.isArray(basis.axes) || basis.axes.length !== AXIS_NAMES.length || basis.axes.some((name, index) => name !== AXIS_NAMES[index])) {
    problems.push(`basis.axes: 必须依次是 ${AXIS_NAMES.join('、')}`);
  }
  if (basis.scale !== '1-10-integer') problems.push('basis.scale: 必须是 1-10-integer');
  if (basis.nature !== 'maintainer-subjective') problems.push('basis.nature: 必须是 maintainer-subjective');
  requirePhrase(problems, 'basis.reviewableEvidence', basis.reviewableEvidence, ['维护者主观', '待核']);
  requirePhrase(problems, 'basis.axisRule', basis.axisRule, ['主观', '待核']);
  requirePhrase(problems, 'basis.axisGap', basis.axisGap, ['主观', '待核']);
  requireUnknownPatch(problems, 'basis', basis);
  requirePhrase(problems, 'basis.verifiedAtMeans', basis.verifiedAtMeans, ['复核', '未知']);
  if (basis.communityClaim !== 'unverified') problems.push('basis.communityClaim: 必须是 unverified，不能把没有出处的社区看法写成已证实');
  requirePhrase(problems, 'basis.communityClaimNote', basis.communityClaimNote, ['待核']);
  requirePhrase(problems, 'basis.highlight', basis.highlight, ['不是胜率']);
  requirePhrase(problems, 'basis.uncertainty', basis.uncertainty, ['未知']);

  const positions = basis.positions;
  if (!isPlainObject(positions)) {
    problems.push('basis.positions: 必须是 object');
  } else {
    if (!sameKeys(Object.keys(positions), POSITION_KEYS)) {
      problems.push(`basis.positions: 字段必须恰好是 ${POSITION_KEYS.join('/')}`);
    }
    if (!Array.isArray(positions.fields) || positions.fields.length !== 2 || positions.fields[0] !== 'fl' || positions.fields[1] !== 'pk') {
      problems.push('basis.positions.fields: 必须依次是 fl、pk');
    }
    if (!Array.isArray(positions.labels) || positions.labels.length !== 2 || positions.labels[0] !== '边位' || positions.labels[1] !== '口袋') {
      problems.push('basis.positions.labels: 必须依次是边位、口袋');
    }
    if (positions.independentOfAxes !== true) problems.push('basis.positions.independentOfAxes: 必须是 true');
    if (positions.nature !== 'maintainer-subjective') problems.push('basis.positions.nature: 必须是 maintainer-subjective');
    requireUnknownPatch(problems, 'basis.positions', positions);
    requirePhrase(problems, 'basis.positions.source', positions.source, ['fl', 'pk', '未知', '待核']);
  }
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
  } else {
    requirePhrase(problems, '_doc', ratings._doc, ['由维护者主观判断', '不是胜率', '待核', '未知']);
  }
  if (!isValidDate(ratings.verifiedAt)) {
    problems.push('verifiedAt: 必须是 YYYY-MM-DD 的真实日期');
  }
  if (Object.hasOwn(ratings, 'schemaVersion') && ratings.schemaVersion !== 1) {
    problems.push('schemaVersion: 存在时必须是 1');
  }
  validateBasis(problems, ratings.basis);

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
