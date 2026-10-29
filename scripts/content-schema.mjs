import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { _ } from 'ajv/dist/compile/codegen/index.js';
import { publicFormats, constructionReferenceProblems } from '../src/content/schema/policy.mjs';
import { LEGACY_SOURCE_BASELINE } from './content-baseline.mjs';
import { schemaFileFor } from './content-schema-catalog.mjs';
import { playerCatalogProblems, readPlayerCatalog } from '../src/domain/playerCatalog.mjs';
import { eventCatalogProblems } from '../src/domain/eventCatalog.mjs';

export const SCHEMA_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/schema');
export const SCHEMA_ID_BASE = 'https://linhongcun.github.io/aoe2-analyzer/schema/';
export { LEGACY_SOURCE_BASELINE, schemaFileFor };

/** Synchronous validators never coerce, remove, default or otherwise mutate data. */
export function createSchemaCompiler({ standalone = false, schemaFiles } = {}) {
  const ajv = new Ajv2020({
    strict: true,
    allowUnionTypes: true,
    inlineRefs: false,
    allErrors: !standalone,
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
    ...(standalone ? { code: { source: true, esm: true, lines: true, formats: _`publicFormats` } } : {}),
  });
  for (const [name, format] of Object.entries(publicFormats)) ajv.addFormat(name, format);
  const files =
    schemaFiles ??
    readdirSync(SCHEMA_DIRECTORY)
      .filter((file) => file.endsWith('.json'))
      .sort();
  for (const file of files) {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, file), 'utf8'));
    if (schema.$async) throw new Error(`Async JSON schema is not supported: ${file}`);
    ajv.addSchema(schema);
  }
  return ajv;
}

let compiler;
const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');
const pathValue = (data, path) =>
  path
    .split('/')
    .slice(1)
    .reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], data);
const problem = (file, code, message, path = '') => ({ file, path, code, keyword: code, message });

export function validateDocument(file, data) {
  const schemaFile = schemaFileFor(file);
  if (!schemaFile) return { valid: false, problems: [problem(file, 'coverage', 'JSON 未登记对应 schema')] };
  compiler ??= createSchemaCompiler();
  const validate = compiler.getSchema(SCHEMA_ID_BASE + schemaFile);
  if (!validate) throw new Error(`Schema not registered: ${schemaFile}`);
  const valid = validate(data);
  const problems = valid
    ? []
    : (validate.errors ?? []).map((error) => ({
        file,
        path: error.instancePath,
        code: 'schema',
        keyword: error.keyword,
        schemaPath: error.schemaPath,
        params: { ...error.params },
        message: error.message ?? 'JSON 结构无效',
        ...(error.keyword === 'format' && error.params.format === 'source-text' ? { valueSha256: fingerprint(pathValue(data, error.instancePath)) } : {}),
      }));
  if (valid && file === 'src/data/construction.json')
    problems.push(...constructionReferenceProblems(data).map((entry) => problem(file, 'reference', entry.message, entry.path)));
  if (valid && file === 'src/content/players.json') {
    const civs = JSON.parse(readFileSync(new URL('../src/data/civs.json', import.meta.url), 'utf8'));
    problems.push(
      ...playerCatalogProblems(
        data,
        civs.map((civ) => civ.en),
      ).map((entry) => problem(file, 'reference', entry.message, entry.path)),
    );
  }
  if (valid && file === 'src/content/events.json') {
    try {
      const civs = JSON.parse(readFileSync(new URL('../src/data/civs.json', import.meta.url), 'utf8'));
      const players = readPlayerCatalog(
        JSON.parse(readFileSync(new URL('../src/content/players.json', import.meta.url), 'utf8')),
        civs.map((civ) => civ.en),
      );
      if (players.status === 'unavailable') problems.push(problem(file, 'reference', '赛事依赖的选手目录未通过校验'));
      else
        problems.push(
          ...eventCatalogProblems(
            data,
            players.catalog.players.map((player) => player.id),
          ).map((entry) => problem(file, 'reference', entry.message, entry.path)),
        );
    } catch {
      problems.push(problem(file, 'reference', '赛事依赖的选手目录暂不可读取'));
    }
  }
  return { valid: problems.length === 0, problems };
}

/** The filesystem, rather than the registry, determines what must be validated. */
export function checkDirectory(root = process.cwd()) {
  const files = [],
    problems = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const file = relative(root, path).split(sep).join('/');
      if (file === 'src/content/schema') continue;
      if (entry.isDirectory()) walk(path);
      else if (file.endsWith('.json')) {
        files.push(file);
        if (entry.isSymbolicLink()) {
          problems.push(problem(file, 'file', 'JSON 输入不能使用符号链接'));
          continue;
        }
        let data;
        try {
          data = JSON.parse(readFileSync(path, 'utf8'));
        } catch (error) {
          problems.push(problem(file, 'syntax', `JSON 语法无效：${error.message.slice(0, 160)}`));
          continue;
        }
        problems.push(...validateDocument(file, data).problems);
      }
    }
  };
  for (const directory of ['src/content', 'src/data']) walk(join(root, directory));
  if (!files.length) problems.push(problem('src/content + src/data', 'coverage', '未发现任何 JSON 输入'));
  return { files: files.sort(), problems };
}

const entryKey = (entry) => `${entry.file}\n${entry.path}\n${entry.format}\n${entry.valueSha256}`;
const frozenEntries = new Set(LEGACY_SOURCE_BASELINE.map(entryKey));

/** Migration accepts a subset of the frozen debt, never arbitrary exemptions. */
export function ratchetProblems(problems, baseline = LEGACY_SOURCE_BASELINE) {
  const warnings = [],
    errors = [],
    allowed = new Map(),
    seen = new Set();
  for (const entry of baseline) {
    const key = entryKey(entry);
    const keys = Object.keys(entry).sort().join(',');
    if (keys !== 'file,format,path,valueSha256' || entry.format !== 'source-text' || !frozenEntries.has(key) || seen.has(key)) {
      errors.push(problem('scripts/content-baseline.mjs', 'baseline', 'baseline 不得新增路径、修改指纹、使用泛匹配或重复条目'));
      continue;
    }
    seen.add(key);
    allowed.set(`${entry.file}\n${entry.path}`, { entry, matched: false });
  }
  for (const item of problems) {
    const legacy = allowed.get(`${item.file}\n${item.path}`);
    if (
      legacy &&
      item.code === 'schema' &&
      item.keyword === 'format' &&
      item.params?.format === 'source-text' &&
      item.valueSha256 === legacy.entry.valueSha256
    ) {
      legacy.matched = true;
      warnings.push(item);
    } else errors.push(item);
  }
  for (const { entry, matched } of allowed.values())
    if (!matched) errors.push(problem(entry.file, 'baseline-stale', '存量问题已不存在，必须删除对应 baseline 条目', entry.path));
  return { warnings, errors };
}
