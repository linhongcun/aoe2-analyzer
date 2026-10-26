import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDirectory, ratchetProblems } from './content-schema.mjs';

export function main(args = process.argv.slice(2)) {
  let root = process.cwd(),
    mode = 'warn';
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root' && args[index + 1]) root = resolve(args[++index]);
    else if (['--strict', '--ratchet'].includes(args[index])) {
      if (mode !== 'warn') throw new Error('Choose only --strict or --ratchet');
      mode = args[index].slice(2);
    } else throw new Error(`Unknown content check argument: ${args[index]}`);
  }
  const result = checkDirectory(root);
  const classified =
    mode === 'ratchet'
      ? ratchetProblems(result.problems)
      : {
          warnings: mode === 'warn' ? result.problems : [],
          errors: mode === 'strict' ? result.problems : [],
        };
  for (const [kind, problems] of [
    ['warning', classified.warnings],
    ['error', classified.errors],
  ])
    for (const item of problems) {
      const detail = item.params?.additionalProperty ?? item.params?.missingProperty ?? item.params?.format ?? '';
      console.error(`[${kind}] ${item.file}${item.path || '/'}: ${item.message}${detail ? ` (${detail})` : ''}`);
    }
  console.log(`JSON 校验：${result.files.length} 份输入，${classified.warnings.length} 条告警，${classified.errors.length} 个错误；模式 ${mode}`);
  return classified.errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
