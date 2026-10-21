#!/usr/bin/env node
/**
 * #281 分层边界检查。用 TypeScript 语法树读 src/ 下每个文件的 import / export ... from / import()，
 * 按 #281 验收标准的四条规则报告越层引用：
 *   feature-to-feature  features/X 不能 import features/Y（需要共享的挪到 shared/ 或 domain/）
 *   shared-upward       shared/ 不能 import features/、app/
 *   domain-upward       domain/ 不能 import react、features/、app/、shared/ui
 *   core-json-direct    src/{domain,features} 不能直接 import src/data/{civs,units,techs,buildings,trees,eco,effects}.json
 *                       （src/data/index.ts 和 LOADERS 里登记的专门 loader 除外）
 * `import type` 和动态 import() 也算：分层依赖与是否打包无关。
 *
 * 用法：
 *   node scripts/check-layers.mjs            报告并以 0 退出（当前阶段：CI 只报警）
 *   node scripts/check-layers.mjs --strict   有违规时以 1 退出（#281 ⑤ 清零后改用这个）
 *   node scripts/check-layers.mjs --json     输出 JSON（供测试和 PR 报告使用）
 * 在 GitHub Actions 里会额外输出 ::warning 注解，违规会显示在 PR 的 Files changed 里。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const posix = (p) => p.split(sep).join('/');

export const RULES = {
  'feature-to-feature': 'features/X 不能 import features/Y',
  'shared-upward': 'shared/ 不能 import features/、app/',
  'domain-upward': 'domain/ 不能 import react、features/、app/、shared/ui',
  'core-json-direct': 'src/{domain,features} 不能直接 import 核心数据 JSON',
};
export const CORE_JSON = ['civs', 'units', 'techs', 'buildings', 'trees', 'eco', 'effects'].map((n) => `src/data/${n}.json`);
/** 专门的 loader：effects.json 的唯一读取入口。新增 loader 要在这里登记并在 PR 里说明理由。 */
export const LOADERS = new Set(['src/domain/datEffects.ts']);

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
function resolveSpec(fromAbs, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const raw = spec.split('?')[0];
  const base = raw.startsWith('/') ? join(ROOT, raw) : resolve(dirname(fromAbs), raw);
  const noJs = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => join(base, 'index' + e)), noJs + '.ts', noJs + '.tsx'];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return posix(relative(ROOT, c));
  throw new Error(`无法解析 ${spec}（${posix(relative(ROOT, fromAbs))}）`);
}

/** 解析一个文件的 import 边 */
export function parseImports(absFile, text = readFileSync(absFile, 'utf8')) {
  const from = posix(relative(ROOT, absFile));
  const sf = ts.createSourceFile(absFile, text, ts.ScriptTarget.Latest, true, absFile.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edges = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (node, spec, typeOnly, dynamic = false) => edges.push({ from, line: line(node), spec, to: resolveSpec(absFile, spec), typeOnly, dynamic });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const c = node.importClause;
      const allType =
        !!c &&
        !c.name &&
        !!c.namedBindings &&
        ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 &&
        c.namedBindings.elements.every((e) => e.isTypeOnly);
      add(node, node.moduleSpecifier.text, !!c?.isTypeOnly || allType);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const c = node.exportClause;
      const allType = !!c && ts.isNamedExports(c) && c.elements.length > 0 && c.elements.every((e) => e.isTypeOnly);
      add(node, node.moduleSpecifier.text, node.isTypeOnly || allType);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node, node.arguments[0].text, false, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edges;
}

const featureOf = (f) => /^src\/features\/([^/]+)\//.exec(f)?.[1] ?? null;

/** 一条 import 边违反了哪条规则；不违反返回 null */
export function classify(e) {
  const { from, to } = e;
  const fx = featureOf(from);
  if (fx && to) {
    const fy = featureOf(to);
    if (fy && fy !== fx) return 'feature-to-feature';
  }
  if (from.startsWith('src/shared/') && to && (to.startsWith('src/features/') || to.startsWith('src/app/'))) return 'shared-upward';
  if (from.startsWith('src/domain/')) {
    const react = to === null && /^react(-dom)?(\/|$)/.test(e.spec);
    const upward = to !== null && (to.startsWith('src/features/') || to.startsWith('src/app/') || to.startsWith('src/shared/ui/'));
    if (react || upward) return 'domain-upward';
  }
  if ((from.startsWith('src/domain/') || from.startsWith('src/features/')) && to && CORE_JSON.includes(to) && !LOADERS.has(from)) return 'core-json-direct';
  return null;
}

export function sourceFiles(dir = SRC) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out.sort();
}

export function layerViolations(files = sourceFiles()) {
  const out = [];
  for (const file of files)
    for (const e of parseImports(file)) {
      const rule = classify(e);
      if (rule) out.push({ ...e, rule });
    }
  return out;
}

function main(argv) {
  const strict = argv.includes('--strict');
  const all = layerViolations();
  if (argv.includes('--json')) {
    console.log(JSON.stringify(all, null, 2));
    return strict && all.length ? 1 : 0;
  }
  const gha = process.env.GITHUB_ACTIONS === 'true';
  console.log(`分层边界检查（#281）：${all.length} 处越层引用${strict ? '' : '（当前只报警，不阻塞 CI）'}`);
  for (const [rule, desc] of Object.entries(RULES)) {
    const hits = all.filter((v) => v.rule === rule);
    console.log(`\n${rule}（${desc}）：${hits.length} 处`);
    for (const v of hits) {
      console.log(`  ${v.from}:${v.line} -> ${v.to ?? v.spec}${v.typeOnly ? '（type）' : ''}${v.dynamic ? '（动态）' : ''}`);
      if (gha) console.log(`::${strict ? 'error' : 'warning'} file=${v.from},line=${v.line},title=分层边界 ${rule}::${desc}：${v.to ?? v.spec}`);
    }
  }
  return strict && all.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
