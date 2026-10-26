/** Page-specific public DTO checks; the generic raw JSON validator stays unchanged. */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSchemaCompiler, SCHEMA_ID_BASE, validateDocument } from './content-schema.mjs';
import { publicBuildPresentation, publicGameGuideSources } from '../src/domain/sourcePresentation.mjs';

let compiler;
const problem = (file, code, message, path = '') => ({ file, path, code, keyword: code, message });

export function validateSourcePresentation(file, data) {
  const build = /^src\/data\/build-orders\/[a-z0-9-]+\.json$/u.test(file);
  if (!build && file !== 'src/content/game-guide.json') return { valid: false, problems: [problem(file, 'coverage', '不属于来源展示输入')] };
  const raw = validateDocument(file, data);
  if (!raw.valid) return raw;
  const presentation = build ? publicBuildPresentation(data) : publicGameGuideSources(data.sources);
  compiler ??= createSchemaCompiler();
  const validate = compiler.getSchema(SCHEMA_ID_BASE + (build ? 'public-build-sources.json' : 'public-game-guide-sources.json'));
  if (!validate) throw new Error('公开来源 schema 未登记');
  const valid = validate(presentation);
  const problems = valid
    ? []
    : (validate.errors ?? []).map((error) => ({
        file,
        path: `/public${error.instancePath}`,
        code: 'presentation',
        keyword: error.keyword,
        params: { ...error.params },
        message: `公开来源${error.message ?? '无效'}`,
      }));
  return { valid: problems.length === 0, problems };
}

export function checkSourcePresentation(root = process.cwd()) {
  const files = [],
    problems = [];
  const read = (path) => {
    const file = relative(root, path).split(sep).join('/');
    files.push(file);
    if (lstatSync(path).isSymbolicLink()) {
      problems.push(problem(file, 'file', '来源输入不能使用符号链接'));
      return;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      problems.push(problem(file, 'syntax', `JSON 语法无效：${error.message.slice(0, 160)}`));
      return;
    }
    problems.push(...validateSourcePresentation(file, data).problems);
  };
  const buildDirectory = join(root, 'src/data/build-orders');
  const walk = (directory) => {
    if (lstatSync(directory).isSymbolicLink()) {
      problems.push(problem(relative(root, directory), 'file', '来源目录不能使用符号链接'));
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.json')) read(path);
    }
  };
  if (existsSync(buildDirectory)) walk(buildDirectory);
  if (!files.length) problems.push(problem('src/data/build-orders', 'coverage', '缺少开局来源输入'));
  const guide = join(root, 'src/content/game-guide.json');
  if (existsSync(guide)) read(guide);
  else problems.push(problem('src/content/game-guide.json', 'coverage', '缺少入门来源输入'));
  return { files: files.sort(), problems };
}

export function main(args = process.argv.slice(2)) {
  let root = process.cwd();
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--root' || !args[1]) throw new Error('Usage: check-source-presentation.mjs [--root directory]');
    root = resolve(args[1]);
  }
  const result = checkSourcePresentation(root);
  for (const item of result.problems) {
    const detail = item.params?.additionalProperty ?? item.params?.missingProperty ?? item.params?.format ?? '';
    console.error(`[error] ${item.file}${item.path || '/'}: ${item.message}${detail ? ` (${detail})` : ''}`);
  }
  console.log(`公开来源校验：${result.files.length} 份输入，${result.problems.length} 个错误`);
  return result.problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
