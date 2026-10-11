#!/usr/bin/env node
// 禁止 src 中直接写颜色值（#hex、rgb()、hsl()）；原始颜色只允许出现在 tokens.css。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED = new Set(['shared/styles/tokens.css']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.svg', '.json']);
const PATTERNS = [
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/,
  /\b(?:rgb|rgba|hsl|hsla)\(/i,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (ALLOWED.has(rel)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (PATTERNS.some((re) => re.test(line))) hits.push(`src/${rel}:${i + 1}: ${line.trim()}`);
    });
}

if (hits.length) {
  console.error(`颜色检查失败：以下位置直接写了颜色值，请改用 src/shared/styles/tokens.css 中的令牌：\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('颜色检查通过：src 中只有 tokens.css 含原始颜色值。');
