// CSS 语法检查（#87）；#288 超过 800 物理行只告警，任一语法失败仍退出 1。
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
  const text = readFileSync(f, 'utf8');
  const sourceLines = text.split(/\r\n|\r|\n/u);
  const lines = sourceLines.length - (sourceLines.at(-1) === '' ? 1 : 0);
  if (lines > 800) console.warn(`${f}: ${lines} 行，超过 800 行，建议按职责拆分（只报告）。`);
  try {
    postcss.parse(text, { from: f });
  } catch (e) {
    bad++;
    console.error(`${f}:${e.line ?? '?'}:${e.column ?? '?'} ${e.reason ?? e.message}`);
  }
}
console.log(`CSS 语法检查：${files.length} 个文件，${bad} 个错误`);
process.exit(bad ? 1 : 0);
