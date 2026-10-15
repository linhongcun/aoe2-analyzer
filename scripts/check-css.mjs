// CSS 语法检查（#87）：用 postcss 解析 src 下全部 .css，任一解析失败则退出码 1
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [];
  });

const files = walk(process.argv[2] ?? 'src');
let bad = 0;
for (const f of files) {
  try {
    postcss.parse(readFileSync(f, 'utf8'), { from: f });
  } catch (e) {
    bad++;
    console.error(`${f}:${e.line ?? '?'}:${e.column ?? '?'} ${e.reason ?? e.message}`);
  }
}
console.log(`CSS 语法检查：${files.length} 个文件，${bad} 个错误`);
process.exit(bad ? 1 : 0);
