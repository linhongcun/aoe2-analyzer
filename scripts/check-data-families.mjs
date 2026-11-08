#!/usr/bin/env node
/**
 * issue 820 数据族索引静态检查。
 *
 * 只读：读取 scripts/data-families.json、src/data/*.json、scripts/data_sources.json，
 * 校验「文件 → 生成器 → pin → 复现命令 → 测试 → 审计状态」完整且无未登记文件。
 * 用法：node scripts/check-data-families.mjs [--root <dir>]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const AUDIT_STATUS = new Set(['reproduced-by-check', 'audit-doc-check', 'manual-input']);

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const exists = (root, rel) => existsSync(join(root, rel));

function sourceCommit(meta) {
  const source = typeof meta.source === 'string' ? meta.source : '';
  return /@([0-9a-f]{7,40})\b/u.exec(source)?.[1];
}

function metaFacts(meta = {}) {
  const dat = meta.sources?.find?.((entry) => entry.id === 'DAT');
  return {
    generatedBy: meta.generatedBy ?? meta.generated_by,
    patch: meta.patch ?? dat?.patch,
    commit: meta.commit ?? meta.datCommit ?? meta.dat?.commit ?? meta.datSource?.commit ?? dat?.commit ?? sourceCommit(meta),
    sha256: meta.sha256 ?? meta.datSha256 ?? meta.dat?.sha256 ?? dat?.sha256,
  };
}

function checkEntry(root, entry, pins, errors) {
  const label = entry.file;
  if (typeof entry.file !== 'string' || !entry.file.startsWith('src/data/')) errors.push(`${label}: file 必须是 src/data/ 下的路径`);
  else if (!exists(root, entry.file)) errors.push(`${label}: 文件不存在`);
  if (typeof entry.generator !== 'string' && entry.generator !== null) errors.push(`${label}: generator 必须是路径或 null`);
  if (typeof entry.generator === 'string' && !exists(root, entry.generator)) errors.push(`${label}: generator 不存在：${entry.generator}`);
  if (entry.pin !== 'dat' && entry.pin !== 'manual') errors.push(`${label}: pin 必须是 dat 或 manual`);
  if (!AUDIT_STATUS.has(entry.auditStatus)) errors.push(`${label}: auditStatus 未知：${entry.auditStatus}`);
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) errors.push(`${label}: tests 不能为空`);
  else for (const test of entry.tests) if (typeof test !== 'string' || !exists(root, test)) errors.push(`${label}: 测试不存在：${test}`);
  if (!Array.isArray(entry.check)) errors.push(`${label}: check 必须是数组`);
  else
    for (const command of entry.check) {
      if (typeof command !== 'string' || !command.trim()) {
        errors.push(`${label}: check 命令为空`);
        continue;
      }
      for (const match of command.matchAll(/scripts\/[\w./-]+\.(?:py|ts|mjs)/gu))
        if (!exists(root, match[0])) errors.push(`${label}: check 引用不存在的脚本：${match[0]}`);
    }
  if (entry.pin === 'manual') {
    if (entry.generator !== null) errors.push(`${label}: manual 条目的 generator 必须为 null`);
    return;
  }
  if (!exists(root, entry.file)) return;
  const data = readJson(root, entry.file);
  const facts = metaFacts(data.meta);
  if (facts.generatedBy !== entry.generator) errors.push(`${label}: meta 生成器为 ${facts.generatedBy ?? '缺失'}，索引为 ${entry.generator}`);
  const patch = facts.patch == null ? '' : String(facts.patch);
  if (!patch.includes(String(pins.patch.build))) errors.push(`${label}: meta.patch 未包含当前 build ${pins.patch.build}`);
  if (facts.commit && !(pins.sources.dat.commit.startsWith(facts.commit) || facts.commit.startsWith(pins.sources.dat.commit)))
    errors.push(`${label}: meta commit ${facts.commit} 与 data_sources.dat 不一致`);
  if (facts.sha256 && facts.sha256 !== pins.sources.dat.sha256) errors.push(`${label}: meta sha256 与 data_sources.dat 不一致`);
}

export function checkDataFamilies(root = process.cwd()) {
  const errors = [];
  const registry = readJson(root, 'scripts/data-families.json');
  const pins = readJson(root, 'scripts/data_sources.json');
  if (!Array.isArray(registry.families) || registry.families.length === 0) return { files: [], errors: ['families 不能为空'] };
  const seen = new Set();
  for (const entry of registry.families) {
    if (seen.has(entry.file)) errors.push(`${entry.file}: 重复登记`);
    seen.add(entry.file);
    checkEntry(root, entry, pins, errors);
  }
  if (!seen.has('src/data/garrison_hosts.json')) errors.push('缺少手工输入登记：src/data/garrison_hosts.json');
  const dataDir = join(root, 'src/data');
  const files = readdirSync(dataDir).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const rel = `src/data/${file}`;
    const data = readJson(root, rel);
    const generatedBy = data?.meta?.generatedBy ?? data?.meta?.generated_by;
    if (generatedBy && !seen.has(rel)) errors.push(`${rel}: 带生成器但未登记（${generatedBy}）`);
  }
  return { files: [...seen].sort(), errors };
}

export function main(args = process.argv.slice(2)) {
  let root = process.cwd();
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--root' || !args[1]) throw new Error('Usage: check-data-families.mjs [--root directory]');
    root = resolve(args[1]);
  }
  const result = checkDataFamilies(root);
  for (const error of result.errors) console.error(`[error] ${error}`);
  console.log(`数据族索引：${result.files.length} 条，${result.errors.length} 个错误`);
  return result.errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
