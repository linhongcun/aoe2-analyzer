/**
 * v0.28.0 验收（#280 / #281）用的静态 import 扫描。Kent 写。
 * 用 TypeScript 语法树读 import / export ... from，不用正则，避免注释和字符串误判。
 * - 静态边：import x from、import 'x.css'、export ... from、import.meta.glob(..., { eager: true })
 * - 动态边：import('x')（lazy 拆包的正是这种）记为 dynamic，入口遍历跳过，分层规则照算
 * - `import type` / `export type` 记为 typeOnly：打包时会被擦掉，不进入入口包，但仍算分层依赖。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export const ROOT = resolve(__dirname, '../..');
export const SRC = join(ROOT, 'src');

export interface ImportEdge {
  /** 相对仓库根的源文件，如 src/app/Layout.tsx */
  from: string;
  /** 1 起的行号 */
  line: number;
  /** 原样的模块说明符 */
  spec: string;
  /** 解析后的仓库内文件（相对仓库根）；外部包为 null */
  to: string | null;
  typeOnly: boolean;
  /** import('x') 动态加载：不进入入口包（staticClosure 跳过），但仍算分层依赖 */
  dynamic?: boolean;
}

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  // Vite 的 '/src/...' 从仓库根算；TypeScript 允许写 './x.js' 指向 x.ts
  const raw = spec.split('?')[0]!;
  const base = raw.startsWith('/') ? join(ROOT, raw) : resolve(dirname(fromFile), raw);
  const noJs = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => join(base, 'index' + e)), noJs + '.ts', noJs + '.tsx'];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
  throw new Error(`无法解析 ${spec}（${relative(ROOT, fromFile)}）`);
}

/** 把 Vite glob（* ** ? {a,b}）转成匹配绝对路径的正则 */
function globToRegExp(absPattern: string): RegExp {
  let re = '';
  for (let i = 0; i < absPattern.length; i++) {
    const ch = absPattern[i]!;
    if (ch === '*' && absPattern[i + 1] === '*') {
      // '**/' 可匹配零层或多层目录；结尾的 '**' 匹配任意
      if (absPattern[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      const close = absPattern.indexOf('}', i);
      if (close < 0) throw new Error(`不支持的 glob ${absPattern}`);
      re +=
        '(?:' +
        absPattern
          .slice(i + 1, close)
          .split(',')
          .map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
          .join('|') +
        ')';
      i = close;
    } else re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === '.git') continue;
    const abs = join(dir, f);
    if (statSync(abs).isDirectory()) walkFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

/**
 * eager 的 import.meta.glob 匹配到的仓库内文件（相对仓库根，已排序）。
 * 支持字面路径（如 '../../data/units.json'）、* ** ? {a,b}、数组和 '!' 排除；'/' 开头从仓库根算。
 */
function globEager(fromFile: string, patterns: string | string[]): string[] {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const abs = (p: string) => (p.startsWith('/') ? join(ROOT, p) : resolve(dirname(fromFile), p));
  const hits = new Set<string>();
  for (const p of list.filter((x) => !x.startsWith('!'))) {
    const a = abs(p);
    if (!/[*?{]/.test(p)) {
      // 字面路径：文件不存在时 Vite 也只给空对象，这里报错避免静默漏扫
      if (!existsSync(a) || !statSync(a).isFile()) throw new Error(`glob 字面路径不存在 ${p}（${relative(ROOT, fromFile)}）`);
      hits.add(a);
      continue;
    }
    const base = a.slice(0, a.search(/[*?{]/)).replace(/[^/]*$/, '');
    const re = globToRegExp(a);
    for (const f of walkFiles(base)) if (re.test(f)) hits.add(f);
  }
  for (const p of list.filter((x) => x.startsWith('!'))) {
    const re = globToRegExp(abs(p.slice(1)));
    for (const f of [...hits]) if (re.test(f)) hits.delete(f);
  }
  return [...hits].map((f) => relative(ROOT, f)).sort();
}

/** import.meta.glob 的第二个参数里是否写了 eager: true（按语法树判断，注释不算） */
function isEagerOption(arg: ts.Expression | undefined): boolean {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'eager' &&
      p.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );
}

/** 解析一段源码里的 import；absFile 用于解析相对路径（文件须真实存在才能解析到仓库内路径） */
export function parseImports(absFile: string, text: string, resolveTo: (spec: string) => string | null = (spec) => resolveSpec(absFile, spec)): ImportEdge[] {
  const key = relative(ROOT, absFile);
  const edges: ImportEdge[] = [];
  const sf = ts.createSourceFile(absFile, text, ts.ScriptTarget.Latest, true, absFile.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const c = node.importClause;
      // import { type A, type B } from 'x' 也会被擦掉
      const allTypeSpecifiers =
        !!c &&
        !c.name &&
        !!c.namedBindings &&
        ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 &&
        c.namedBindings.elements.every((e) => e.isTypeOnly);
      const spec = node.moduleSpecifier.text;
      edges.push({ from: key, line: lineOf(node), spec, to: resolveTo(spec), typeOnly: !!c?.isTypeOnly || allTypeSpecifiers });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const c = node.exportClause;
      // export { type A } from 'x' 也会被擦掉
      const allType = !!c && ts.isNamedExports(c) && c.elements.length > 0 && c.elements.every((e) => e.isTypeOnly);
      edges.push({ from: key, line: lineOf(node), spec, to: resolveTo(spec), typeOnly: node.isTypeOnly || allType });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const spec = node.arguments[0].text;
      edges.push({ from: key, line: lineOf(node), spec, to: resolveTo(spec), typeOnly: false, dynamic: true });
    } else if (ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      throw new Error(`${key}:${lineOf(node)} 用了 require / import =，扫描器不支持，请改成 ESM import`);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'glob' &&
      node.expression.expression.getText(sf) === 'import.meta' &&
      node.arguments[0] &&
      isEagerOption(node.arguments[1])
    ) {
      const a0 = node.arguments[0];
      let patterns: string | string[];
      if (ts.isStringLiteralLike(a0)) patterns = a0.text;
      else if (ts.isArrayLiteralExpression(a0) && a0.elements.every((x) => ts.isStringLiteralLike(x)))
        patterns = a0.elements.map((x) => (x as ts.StringLiteralLike).text);
      else throw new Error(`${key}:${lineOf(node)} import.meta.glob 的第一个参数不是字面量，扫描器无法核对`);
      const spec = Array.isArray(patterns) ? patterns.join(',') : patterns;
      for (const to of globEager(absFile, patterns)) edges.push({ from: key, line: lineOf(node), spec, to, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edges;
}

const cache = new Map<string, ImportEdge[]>();
export function importsOf(file: string): ImportEdge[] {
  const abs = resolve(ROOT, file);
  const key = relative(ROOT, abs);
  const hit = cache.get(key);
  if (hit) return hit;
  const edges = /\.(ts|tsx|mts|cts|js|jsx)$/.test(abs) ? parseImports(abs, readFileSync(abs, 'utf8')) : [];
  cache.set(key, edges);
  return edges;
}

/** 从 entry 出发沿静态（非 type-only）import 能到达的全部仓库内文件 */
export function staticClosure(entry: string): Map<string, string[]> {
  /** 文件 → 一条从入口到它的引用链（便于失败时定位） */
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of importsOf(cur)) {
      if (e.typeOnly || e.dynamic || !e.to || seen.has(e.to)) continue;
      seen.set(e.to, [...seen.get(cur)!, `${e.to}（${e.from}:${e.line}）`]);
      queue.push(e.to);
    }
  }
  return seen;
}

/** src 下全部 ts/tsx 源文件（相对仓库根） */
export function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(relative(ROOT, p));
  }
  return out.sort();
}

// ---------- #281 分层规则（逐条照抄 #281 验收标准） ----------
export type LayerRule = 'feature-to-feature' | 'shared-upward' | 'domain-upward' | 'core-json-direct';
export interface Violation extends ImportEdge {
  rule: LayerRule;
}
/** #281：src/{domain,features} 不能直接 import 这些 JSON；src/data/index.ts 和专门的 loader 除外 */
export const CORE_JSON = ['civs', 'units', 'techs', 'buildings', 'trees', 'eco', 'effects'].map((n) => `src/data/${n}.json`);
/**
 * 「专门的 loader」：#281 没点名。#281 列出的 domain 9 处里没有 datEffects.ts，
 * 说明 datEffects.ts（effects.json 的唯一读取入口）被当作 loader。新增 loader 要在这里登记并在 PR 里说明。
 */
export const CORE_JSON_LOADERS = new Set(['src/domain/datEffects.ts']);

const featureOf = (f: string) => /^src\/features\/([^/]+)\//.exec(f)?.[1] ?? null;

/** 一条 import 违反了哪条规则（不违反为 null） */
export function classify(e: ImportEdge): LayerRule | null {
  const file = e.from;
  const to = e.to;
  const fx = featureOf(file);
  if (fx && to) {
    const fy = featureOf(to);
    if (fy && fy !== fx) return 'feature-to-feature';
  }
  if (file.startsWith('src/shared/') && to && (to.startsWith('src/features/') || to.startsWith('src/app/'))) return 'shared-upward';
  if (file.startsWith('src/domain/')) {
    const react = to === null && /^react(-dom)?(\/|$)/.test(e.spec);
    const upward = to !== null && (to.startsWith('src/features/') || to.startsWith('src/app/') || to.startsWith('src/shared/ui/'));
    if (react || upward) return 'domain-upward';
  }
  if ((file.startsWith('src/domain/') || file.startsWith('src/features/')) && to && CORE_JSON.includes(to) && !CORE_JSON_LOADERS.has(file))
    return 'core-json-direct';
  return null;
}

export function layerViolations(files = sourceFiles()): Violation[] {
  const out: Violation[] = [];
  for (const file of files)
    for (const e of importsOf(file)) {
      const rule = classify(e);
      if (rule) out.push({ ...e, rule });
    }
  return out;
}
