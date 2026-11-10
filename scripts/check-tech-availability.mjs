#!/usr/bin/env node
/**
 * #869 四套科技可用性的手写例外必须点名。
 *
 * 只读源码，不跑生成器，不下载 .dat，不做全科技×全文明。
 * 声明必须是 src/domain/techAvailability.ts 里的字面量，并且和扫到的结构键一致。
 * 只在注释、数组或说明里再写一遍文明名不算登记。
 *
 * 用法：node scripts/check-tech-availability.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'];
const SCAN_FILES = [
  'src/domain/civStatus.ts',
  'src/domain/unitAvailability.ts',
  'src/domain/production.ts',
  'src/domain/simulator.ts',
  'src/domain/availabilityAge.ts',
];
const OWNER_SET = {
  civStatus: 'civStatus',
  techAvailable: 'techAvailable',
  productionTechAge: 'productionTechs',
  productionTechs: 'productionTechs',
  simTechs: 'simTechs',
};
const WATCHED = Object.keys(OWNER_SET);
const DISPLAY_NAMES = new Set(['displayUnitAge', 'unitDisplayAge', 'projectUnitDisplayAges']);
const LIMIT_PHRASES = ['不能拦一切任意新代码', '全科技', '不比较四套', '新建文件', '字面量'];
const EXCEPTION_FIELDS = ['because', 'differs', 'role', 'site'];

const posix = (value) => value.split(sep).join('/');

function parseText(name, text) {
  const kind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function propName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function calleeName(node) {
  const expr = unwrap(node.expression);
  if (!expr) return null;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function propertyTail(node) {
  const value = unwrap(node);
  if (!value) return null;
  if (ts.isPropertyAccessExpression(value)) return value.name.text;
  if (ts.isIdentifier(value)) return value.text;
  return null;
}

function isCivExpr(node) {
  const value = unwrap(node);
  if (!value) return false;
  if (ts.isIdentifier(value)) return value.text === 'civ';
  if (ts.isPropertyAccessExpression(value)) return value.name.text === 'civ';
  return false;
}

function isIdish(node) {
  const value = unwrap(node);
  if (!value) return false;
  if (ts.isIdentifier(value)) return value.text === 'id';
  if (ts.isPropertyAccessExpression(value)) return value.name.text === 'id';
  return false;
}

function isPlainId(node) {
  const value = unwrap(node);
  return !!value && ts.isIdentifier(value) && (value.text === 'id' || value.text.endsWith('Id'));
}

function civIn(node) {
  let civ = null;
  const walk = (current) => {
    if (!current || civ) return;
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const str = [current.left, current.right].find((side) => ts.isStringLiteral(side) && /^[A-Z][A-Za-z]+$/.test(side.text));
      const other = str && (str === current.left ? current.right : current.left);
      if (str && other && isCivExpr(other)) civ = str.text;
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return civ;
}

function conditionParts(node) {
  const parts = new Set();
  const walk = (current) => {
    if (!current) return;
    const value = unwrap(current);
    if (!value) return;
    if (
      ts.isBinaryExpression(value) &&
      (value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || value.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      walk(value.left);
      walk(value.right);
      return;
    }
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const num = [value.left, value.right].find((side) => ts.isNumericLiteral(side));
      const other = num && (num === value.left ? value.right : value.left);
      if (num && other && isIdish(other)) parts.add(`id===${num.text}`);
      return;
    }
    if (ts.isCallExpression(value)) {
      const name = calleeName(value);
      if (name) parts.add(name);
      return;
    }
    if (ts.isElementAccessExpression(value)) {
      const name = propertyTail(value.expression);
      if (name) parts.add(name);
      return;
    }
    ts.forEachChild(value, walk);
  };
  walk(node);
  return parts;
}

function ageFingerprint(node) {
  const value = unwrap(node);
  if (!value) return null;
  if (ts.isNumericLiteral(value)) {
    const number = Number(value.text);
    if (Number.isInteger(number) && number >= 1 && number <= 4) return `literal:${number}`;
    return null;
  }
  if (ts.isBinaryExpression(value) && (value.operatorToken.kind === ts.SyntaxKind.MinusToken || value.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
    const age = ts.isPropertyAccessExpression(unwrap(value.left)) && unwrap(value.left).name.text === 'age';
    if (age && ts.isNumericLiteral(value.right))
      return value.operatorToken.kind === ts.SyntaxKind.MinusToken ? `age-${value.right.text}` : `age+${value.right.text}`;
    return null;
  }
  if (ts.isCallExpression(value) && (calleeName(value) === 'max' || calleeName(value) === 'min')) {
    const parts = value.arguments.map((argument) => ageFingerprint(argument));
    if (parts.length && parts.every(Boolean)) return `${calleeName(value)}(${parts.join(',')})`;
  }
  return null;
}

function literalNumber(fingerprint) {
  return fingerprint.startsWith('literal:') ? fingerprint.slice('literal:'.length) : fingerprint;
}

function unitIdToken(node) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
  for (const side of [node.left, node.right]) {
    const other = side === node.left ? node.right : node.left;
    if (!isPlainId(other)) continue;
    if (ts.isIdentifier(side) && side.text === 'SPEARMAN_UNIT_ID') return 'SPEARMAN_UNIT_ID';
    if (ts.isNumericLiteral(side) && side.text === '93') return '93';
  }
  return null;
}

function visitBody(fn, cb) {
  if (!fn.body) return;
  const walk = (node) => {
    cb(node);
    ts.forEachChild(node, walk);
  };
  walk(fn.body);
}

function moduleFunctions(sf) {
  const map = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) map.set(stmt.name.text, stmt);
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = unwrap(decl.initializer);
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) map.set(decl.name.text, init);
    }
  }
  return map;
}

function civAge(file, fnName, civ, fingerprint, parts) {
  const cond = [...parts].sort().join('+') || 'plain';
  return {
    kind: 'civ-age',
    key: `civ-age:${file}:${fnName}:${civ}:${fingerprint}:${cond}`,
    owner: fnName,
    usedBy: [],
  };
}

function ageReturns(node) {
  const out = [];
  const walk = (current, top) => {
    if (current !== top && ts.isIfStatement(current)) return;
    if (ts.isReturnStatement(current) && current.expression) {
      const fingerprint = ageFingerprint(current.expression);
      if (fingerprint) out.push(fingerprint);
    }
    ts.forEachChild(current, (child) => walk(child, top));
  };
  walk(node, node);
  return out;
}

function unitIdCompare(node) {
  if (!ts.isBinaryExpression(node)) return null;
  const negated = node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken && !negated) return null;
  for (const side of [node.left, node.right]) {
    const other = side === node.left ? node.right : node.left;
    if (!isPlainId(other)) continue;
    if (ts.isIdentifier(side) && side.text === 'SPEARMAN_UNIT_ID') return { token: 'SPEARMAN_UNIT_ID', negated };
    if (ts.isNumericLiteral(side) && side.text === '93') return { token: '93', negated };
  }
  return null;
}

function ageLiteral(node) {
  const fingerprint = ageFingerprint(node);
  return fingerprint?.startsWith('literal:') ? literalNumber(fingerprint) : null;
}

function ageLiteralReturn(node) {
  if (!node) return null;
  if (ts.isBlock(node)) return node.statements.length === 1 ? ageLiteralReturn(node.statements[0]) : null;
  if (ts.isReturnStatement(node)) return ageLiteral(node.expression);
  return null;
}

function civAgePairFromStatements(statements) {
  const first = statements[0];
  if (!first) return null;
  if (ts.isReturnStatement(first)) return civAgePair(first.expression);
  if (!ts.isIfStatement(first)) return null;
  const civ = civIn(first.expression);
  const yes = ageLiteralReturn(first.thenStatement);
  const no = ageLiteralReturn(first.elseStatement) || ageLiteralReturn(statements[1]);
  if (civ && yes && no) return { civ, yes, no };
  return null;
}

function civAgePair(node) {
  if (!node) return null;
  const value = unwrap(node);
  if (!value) return null;
  if (ts.isReturnStatement(value)) return civAgePair(value.expression);
  if (ts.isBlock(value)) return civAgePairFromStatements(value.statements);
  if (ts.isConditionalExpression(value)) {
    const civ = civIn(value.condition);
    const yes = ageLiteral(value.whenTrue);
    const no = ageLiteral(value.whenFalse);
    if (civ && yes && no) return { civ, yes, no };
  }
  if (ts.isIfStatement(value)) {
    const civ = civIn(value.expression);
    const yes = ageLiteralReturn(value.thenStatement);
    const no = ageLiteralReturn(value.elseStatement);
    if (civ && yes && no) return { civ, yes, no };
  }
  return null;
}

function displayFromExpression(expr) {
  const value = unwrap(expr);
  if (!value || !ts.isConditionalExpression(value)) return null;
  const cmp = unitIdCompare(value.condition);
  if (!cmp || cmp.negated) return null;
  const pair = civAgePair(value.whenTrue);
  return pair ? { token: cmp.token, pair } : null;
}

function displaySite(file, token, pair) {
  return {
    kind: 'display-age',
    key: `display-age:${file}:displayUnitAge:${token}:${pair.civ}=${pair.yes}:other=${pair.no}`,
    owner: 'displayUnitAge',
    usedBy: [],
  };
}

function collectDisplay(fn, file) {
  const sites = [];
  const add = (token, pair) => {
    if (token && pair) sites.push(displaySite(file, token, pair));
  };
  const body = fn.body;
  if (!body) return sites;
  if (!ts.isBlock(body)) {
    const found = displayFromExpression(body);
    if (found) add(found.token, found.pair);
    return sites;
  }
  body.statements.forEach((stmt, index) => {
    if (ts.isReturnStatement(stmt)) {
      const found = displayFromExpression(stmt.expression);
      if (found) add(found.token, found.pair);
    }
    if (!ts.isIfStatement(stmt)) return;
    const cmp = unitIdCompare(stmt.expression);
    if (!cmp) return;
    add(cmp.token, cmp.negated ? civAgePairFromStatements(body.statements.slice(index + 1)) : civAgePair(stmt.thenStatement));
  });
  const seen = new Set();
  return sites.filter((site) => (seen.has(site.key) ? false : seen.add(site.key)));
}

function collectFunctionSites(fn, file, fnName) {
  if (fnName === 'displayUnitAge') return collectDisplay(fn, file);
  const sites = [];
  visitBody(fn, (node) => {
    if (ts.isIfStatement(node)) {
      const civ = civIn(node.expression);
      if (civ) {
        const parts = conditionParts(node.expression);
        for (const fingerprint of ageReturns(node.thenStatement)) sites.push(civAge(file, fnName, civ, fingerprint, parts));
      }
    }
    if (!ts.isConditionalExpression(node)) return;
    const token = unitIdToken(node.condition);
    const thenFp = ageFingerprint(node.whenTrue);
    const elseFp = ageFingerprint(node.whenFalse);
    if (token && thenFp && elseFp) {
      sites.push({
        kind: 'unit-floor',
        key: `unit-floor:${file}:${fnName}:${token}:then=${literalNumber(thenFp)}:else=${literalNumber(elseFp)}`,
        owner: fnName,
        usedBy: [],
      });
      return;
    }
    const inner = unwrap(node.whenTrue);
    if (token && inner && ts.isConditionalExpression(inner)) {
      const civ = civIn(inner.condition);
      const yes = ageFingerprint(inner.whenTrue);
      const no = ageFingerprint(inner.whenFalse);
      if (civ && yes && no) {
        sites.push({
          kind: 'unit-civ',
          key: `unit-civ:${file}:${fnName}:${token}:${civ}=${literalNumber(yes)}:other=${literalNumber(no)}`,
          owner: fnName,
          usedBy: [],
        });
      }
    }
    const civ = civIn(node.condition);
    const fingerprint = civ ? ageFingerprint(node.whenTrue) : null;
    if (civ && fingerprint) sites.push(civAge(file, fnName, civ, fingerprint, conditionParts(node.condition)));
  });
  return sites;
}

function ageMapEntries(node) {
  const obj = unwrap(node);
  if (!obj || !ts.isObjectLiteralExpression(obj) || obj.properties.length === 0) return null;
  const entries = [];
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) return null;
    const civ = propName(prop.name);
    if (!civ || !/^[A-Z][A-Za-z]+$/.test(civ)) return null;
    const inner = unwrap(prop.initializer);
    if (!inner || !ts.isObjectLiteralExpression(inner) || inner.properties.length === 0) return null;
    for (const row of inner.properties) {
      if (!ts.isPropertyAssignment(row)) return null;
      const id = propName(row.name);
      if (!id || !/^\d+$/.test(id)) return null;
      const ageNode = unwrap(row.initializer);
      if (!ageNode || !ts.isNumericLiteral(ageNode)) return null;
      const age = Number(ageNode.text);
      if (!Number.isInteger(age) || age < 1 || age > 4) return null;
      entries.push({ civ, id, age });
    }
  }
  return entries;
}

function enclosingFunction(node, fns) {
  let current = node;
  while (current) {
    for (const [name, fn] of fns) if (fn === current) return name;
    current = current.parent;
  }
  return null;
}

function collectAgeMaps(sf, file, fns) {
  const sites = [];
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const entries = ageMapEntries(node.initializer);
      if (entries) {
        const enclosing = enclosingFunction(node, fns);
        for (const entry of entries) {
          sites.push({
            kind: 'age-map',
            key: `age-map:${file}:${node.name.text}:${entry.civ}:${entry.id}=${entry.age}`,
            owner: node.name.text,
            constName: node.name.text,
            enclosing,
            usedBy: [],
          });
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return sites;
}

function bodyReferences(fn, name) {
  let found = false;
  visitBody(fn, (node) => {
    if (found || !ts.isIdentifier(node) || node.text !== name) return;
    if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) return;
    if (ts.isFunctionDeclaration(node.parent) && node.parent.name === node) return;
    found = true;
  });
  return found;
}

function applyUsedBy(sites, scannedFns, aliases) {
  for (const site of sites) {
    const used = new Set();
    if (OWNER_SET[site.owner]) used.add(OWNER_SET[site.owner]);
    if (site.enclosing && OWNER_SET[site.enclosing]) used.add(OWNER_SET[site.enclosing]);
    const names = new Set();
    if (site.constName) {
      names.add(site.constName);
      for (const alias of aliases) if (alias.exported === site.constName) names.add(alias.local);
    }
    if (names.size) {
      for (const fn of scannedFns) {
        const set = OWNER_SET[fn.name];
        if (!set) continue;
        for (const name of names) if (bodyReferences(fn.fn, name)) used.add(set);
      }
    }
    site.usedBy = IDS.filter((id) => used.has(id));
  }
}

function resolveImport(fromFile, spec, root, files) {
  if (!spec.startsWith('.')) return null;
  const abs = resolve(root, dirname(fromFile), spec);
  const rel = posix(relative(root, abs));
  for (const candidate of [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}/index.ts`]) {
    if (files?.has(candidate) || existsSync(resolve(root, candidate))) {
      if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) return candidate;
    }
  }
  return null;
}

function importBindings(sf, file, root, files) {
  const bindings = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.importClause?.isTypeOnly || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const from = resolveImport(file, stmt.moduleSpecifier.text, root, files);
    if (!from || !from.startsWith('src/domain/') || SCAN_FILES.includes(from)) continue;
    for (const spec of named.elements) {
      if (spec.isTypeOnly) continue;
      bindings.push({ exported: spec.propertyName?.text ?? spec.name.text, local: spec.name.text, from, importer: file });
    }
  }
  return bindings;
}

function loadText(file, root, files) {
  if (files?.has(file)) return files.get(file);
  return readFileSync(resolve(root, file), 'utf8');
}

function collectFromFiles(fileMap, root) {
  const errors = [];
  const sites = [];
  const scannedFns = [];
  const aliases = [];
  for (const file of SCAN_FILES) {
    if (!fileMap.has(file)) continue;
    const sf = parseText(file, fileMap.get(file));
    const fns = moduleFunctions(sf);
    for (const [name, fn] of fns) scannedFns.push({ name, fn, file });
    for (const [name, fn] of fns) sites.push(...collectFunctionSites(fn, file, name));
    sites.push(...collectAgeMaps(sf, file, fns));
    aliases.push(...importBindings(sf, file, root, fileMap));
    errors.push(...callErrors(file, fns));
    errors.push(...nameErrors(sf, file));
    if (fns.has('displayUnitAge')) {
      const found = sites.filter((site) => site.kind === 'display-age' && site.owner === 'displayUnitAge' && site.key.includes(file));
      if (found.length === 0)
        errors.push(`${file} 的 displayUnitAge 没有扫到嵌套三元或等价 if/return 展示例外。结构没对上或文明展示分支已删除；这不是四套判定语义错误。`);
    }
  }
  for (const alias of aliases) {
    if (!alias.from.startsWith('src/domain/')) continue;
    let text;
    try {
      text = loadText(alias.from, root, fileMap);
    } catch {
      errors.push(`无法读取 ${alias.importer} 引入的 ${alias.from}`);
      continue;
    }
    const sf = parseText(alias.from, text);
    const decl = findVariable(sf, alias.exported);
    if (!decl?.initializer) continue;
    const entries = ageMapEntries(decl.initializer);
    if (!entries) continue;
    for (const entry of entries) {
      sites.push({
        kind: 'age-map',
        key: `age-map:${alias.from}:${alias.exported}:${entry.civ}:${entry.id}=${entry.age}`,
        owner: alias.exported,
        constName: alias.exported,
        usedBy: [],
      });
    }
  }
  applyUsedBy(sites, scannedFns, aliases);
  return { sites: dedupe(sites), errors };
}

function dedupe(sites) {
  const map = new Map();
  for (const site of sites) {
    const prev = map.get(site.key);
    if (!prev) map.set(site.key, { ...site, usedBy: [...site.usedBy] });
    else prev.usedBy = IDS.filter((id) => prev.usedBy.includes(id) || site.usedBy.includes(id));
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function findVariable(sf, name) {
  let found = null;
  const walk = (node) => {
    if (!found && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node;
    if (!found) ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

function forbiddenFor(name) {
  const banned = new Set([...WATCHED, 'isAvailable']);
  banned.delete(name);
  if (name === 'simTechs') banned.delete('civStatus');
  if (name === 'productionTechs') banned.delete('productionTechAge');
  return banned;
}

function callErrors(file, fns) {
  const errors = [];
  for (const name of WATCHED) {
    if (!fns.has(name)) continue;
    const banned = forbiddenFor(name);
    const seen = new Set();
    const walk = (fnName) => {
      if (seen.has(fnName) || !fns.has(fnName)) return;
      seen.add(fnName);
      const fn = fns.get(fnName);
      const locals = [];
      visitBody(fn, (node) => {
        if (!ts.isCallExpression(node)) return;
        const called = calleeName(node);
        if (!called) return;
        if (banned.has(called)) errors.push(`${file} 的 ${name} 调用了 ${called}。四套科技可用性不能互相替代。`);
        if (fns.has(called) && !banned.has(called)) locals.push(called);
      });
      for (const local of locals) walk(local);
    };
    walk(name);
  }
  return errors;
}

function nameErrors(sf, file) {
  const errors = [];
  const walk = (node) => {
    const named =
      (ts.isFunctionDeclaration(node) && node.name?.text === 'isAvailable') ||
      (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'isAvailable') ||
      (ts.isExportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === 'isAvailable');
    if (named) errors.push(`${file} 出现了 isAvailable。不要把四套收成一个布尔。`);
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return errors;
}

function stringOf(node) {
  const value = unwrap(node);
  if (!value) return null;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = stringOf(value.left);
    const right = stringOf(value.right);
    if (left === null || right === null) return null;
    return left + right;
  }
  return null;
}

function stringsOf(node) {
  const value = unwrap(node);
  if (!value || !ts.isArrayLiteralExpression(value)) return null;
  const out = [];
  for (const element of value.elements) {
    const text = stringOf(element);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

function objectFields(node) {
  const value = unwrap(node);
  if (!value || !ts.isObjectLiteralExpression(value)) return null;
  const fields = new Map();
  for (const prop of value.properties) {
    if (!ts.isPropertyAssignment(prop)) return null;
    const key = propName(prop.name);
    if (!key) return null;
    fields.set(key, prop.initializer);
  }
  return fields;
}

function varInit(sf, name) {
  const decl = findVariable(sf, name);
  return decl?.initializer ? unwrap(decl.initializer) : null;
}

function readContract(sf) {
  const errors = [];
  const limits = stringOf(varInit(sf, 'AVAILABILITY_CHECK_LIMITS'));
  if (!limits) errors.push('AVAILABILITY_CHECK_LIMITS 必须是字符串字面量。');
  else for (const phrase of LIMIT_PHRASES) if (!limits.includes(phrase)) errors.push(`检查边界说明缺少「${phrase}」。`);

  const questions = [];
  const questionObj = objectFields(varInit(sf, 'TECH_AVAILABILITY'));
  if (!questionObj) errors.push('TECH_AVAILABILITY 必须是对象字面量。');
  else {
    const keys = [...questionObj.keys()];
    if (keys.join() !== IDS.join()) errors.push(`四套问题必须恰好是 ${IDS.join('、')}。`);
    for (const id of IDS) {
      const fields = objectFields(questionObj.get(id));
      if (!fields) {
        errors.push(`${id} 的问题定义无法读取。`);
        continue;
      }
      const asks = stringOf(fields.get('asks'));
      const definedIn = stringOf(fields.get('definedIn'));
      const exportName = stringOf(fields.get('exportName'));
      const consumer = stringOf(fields.get('consumer'));
      if (!asks || !definedIn || !exportName || !consumer) errors.push(`${id} 的 asks、definedIn、exportName、consumer 都必须是字符串字面量。`);
      if (exportName && exportName !== id) errors.push(`${id} 的 exportName 必须是它自己，不能指向另一套。`);
      questions.push({ id, asks, definedIn, exportName, consumer });
    }
    const asks = questions.map((item) => item.asks).filter(Boolean);
    if (new Set(asks).size !== asks.length || asks.length !== IDS.length) errors.push('四套问题的问法不能相同。');
  }

  const exceptions = [];
  const list = varInit(sf, 'AVAILABILITY_EXCEPTIONS');
  if (!list || !ts.isArrayLiteralExpression(list)) errors.push('AVAILABILITY_EXCEPTIONS 必须是数组字面量。');
  else {
    list.elements.forEach((element, index) => {
      const fields = objectFields(element);
      if (!fields) {
        errors.push(`第 ${index + 1} 条声明必须是对象字面量，不能调用函数生成。`);
        return;
      }
      const got = [...fields.keys()].sort();
      const site = stringOf(fields.get('site'));
      if (got.join() !== EXCEPTION_FIELDS.join()) errors.push(`${site ?? `第 ${index + 1} 条`} 的字段必须是 site、role、differs、because。`);
      const role = stringOf(fields.get('role'));
      const differs = stringsOf(fields.get('differs'));
      const because = stringOf(fields.get('because'));
      if (!site || !role || !differs || because === null) {
        errors.push(`${site ?? `第 ${index + 1} 条`} 的 site、role、differs、because 都必须是字面量。引用另一张表不算登记。`);
        return;
      }
      exceptions.push({ site, role, differs, because });
    });
  }
  return { limits, questions, exceptions, errors };
}

function complement(usedBy) {
  const used = new Set(usedBy);
  return IDS.filter((id) => !used.has(id));
}

function expectedRole(site) {
  if (site.kind === 'display-age') return 'display-only';
  if (site.usedBy.length || site.kind === 'civ-age') return 'tech-age';
  return 'unit-age';
}

function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function contractErrors(text) {
  return readContract(parseText('src/domain/techAvailability.ts', text)).errors;
}

export function matchErrors(sites, declarations) {
  const errors = [];
  const bySite = new Map();
  for (const decl of declarations) {
    if (bySite.has(decl.site)) errors.push(`声明重复：${decl.site}`);
    bySite.set(decl.site, decl);
  }
  const keys = new Set(sites.map((site) => site.key));
  for (const site of sites) {
    const decl = bySite.get(site.key);
    if (!decl) {
      errors.push(`缺声明：${site.key}。只重复文明名不算登记。`);
      continue;
    }
    const role = expectedRole(site);
    if (decl.role !== role) errors.push(`${site.key} 的 role 必须是 ${role}，实际是 ${decl.role}。`);
    const want = complement(site.usedBy);
    if (!want.length) errors.push(`${site.key} 已经落在全部四套里，不能再当成差异。`);
    else if (!sameList(decl.differs, want)) errors.push(`${site.key} 的 differs 必须是 ${want.join('、')}，实际是 ${decl.differs.join('、')}。`);
    if ([...decl.because].length < 12) errors.push(`${site.key} 的说明过短。`);
  }
  for (const decl of declarations) if (!keys.has(decl.site)) errors.push(`声明没有对应的手写例外：${decl.site}`);
  return errors;
}

function exportsName(sf, name) {
  let found = false;
  const walk = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) found = true;
    if (ts.isVariableStatement(node) && node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.name.text === name) found = true;
    }
    if (ts.isExportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === name) found = true;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

function importsValue(sf, name) {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.importClause?.isTypeOnly) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const spec of named.elements) {
      if (spec.isTypeOnly) continue;
      if ((spec.propertyName?.text ?? spec.name.text) === name) return stmt.moduleSpecifier.text;
    }
  }
  return null;
}

function questionErrors(root, questions, files) {
  const errors = [];
  for (const question of questions) {
    if (!question.definedIn || !question.consumer || !question.exportName) continue;
    let defined;
    try {
      defined = parseText(question.definedIn, loadText(question.definedIn, root, files));
    } catch {
      errors.push(`${question.id} 的定义文件无法读取：${question.definedIn}`);
      continue;
    }
    if (!exportsName(defined, question.exportName)) errors.push(`${question.definedIn} 没有导出 ${question.exportName}。`);
    let consumer;
    try {
      consumer = parseText(question.consumer, loadText(question.consumer, root, files));
    } catch {
      errors.push(`${question.id} 的消费者无法读取：${question.consumer}`);
      continue;
    }
    const spec = importsValue(consumer, question.exportName);
    if (!spec) {
      errors.push(`${question.consumer} 没有以值导入 ${question.exportName}。注释或字符串里出现名字不算。`);
      continue;
    }
    if (spec.startsWith('.')) {
      const resolved = resolveImport(question.consumer, spec, root, files);
      if (!resolved) errors.push(`${question.consumer} 导入 ${question.exportName} 的路径无法解析。`);
      else if (!exportsName(parseText(resolved, loadText(resolved, root, files)), question.exportName))
        errors.push(`${resolved} 没有把 ${question.exportName} 导出给 ${question.consumer}。`);
    }
  }
  return errors;
}

export function questionFileErrors(questions, entries) {
  const files = new Map(entries.map((entry) => [entry.name, entry.text]));
  return questionErrors(ROOT, questions, files);
}

export function displayForbiddenArea(file) {
  const path = posix(file);
  if (path === 'src/domain/production.ts' || path.startsWith('src/features/production/')) return '生产';
  if (
    path === 'src/domain/simulator.ts' ||
    path === 'src/domain/damageBreakdown.ts' ||
    path.startsWith('src/domain/duel') ||
    path.startsWith('src/features/duel/')
  )
    return '战斗';
  if (['src/domain/costPolicy.ts', 'src/domain/costDiscount.ts', 'src/domain/unitCost.ts', 'src/domain/realCost.ts'].includes(path)) return '费用';
  if (path.startsWith('src/domain/buildSim')) return '开局模拟';
  return null;
}

function displayErrorsIn(sf, file) {
  const area = displayForbiddenArea(file);
  if (!area) return [];
  const errors = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.importClause?.isTypeOnly) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const spec of named.elements) {
      const imported = spec.propertyName?.text ?? spec.name.text;
      if (!spec.isTypeOnly && DISPLAY_NAMES.has(imported)) errors.push(`${file} 将 ${imported} 用于${area}。displayUnitAge 只供展示。`);
    }
  }
  return errors;
}

function walkSrc(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(posix(relative(root, abs)));
    }
  };
  walk(resolve(root, 'src'));
  return out;
}

function repoFileMap(root) {
  const files = new Map();
  for (const file of SCAN_FILES) files.set(file, readFileSync(resolve(root, file), 'utf8'));
  return files;
}

export function auditSources(entries, declarations) {
  const files = new Map(entries.map((entry) => [entry.name, entry.text]));
  const { sites, errors } = collectFromFiles(files, ROOT);
  for (const [name, text] of files) errors.push(...displayErrorsIn(parseText(name, text), name));
  errors.push(...matchErrors(sites, declarations));
  return { sites, errors };
}

export function checkRepo(root = ROOT) {
  const contractPath = 'src/domain/techAvailability.ts';
  const contract = parseText(contractPath, readFileSync(resolve(root, contractPath), 'utf8'));
  const contractErrors = nameErrors(contract, contractPath);
  const { questions, exceptions, errors: readErrors } = readContract(contract);
  const files = repoFileMap(root);
  const { sites, errors: scanErrors } = collectFromFiles(files, root);
  const errors = [...readErrors, ...contractErrors, ...questionErrors(root, questions, files), ...scanErrors, ...matchErrors(sites, exceptions)];
  for (const file of walkSrc(root)) errors.push(...displayErrorsIn(parseText(file, readFileSync(resolve(root, file), 'utf8')), file));
  return { sites, exceptions, questions, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length) {
    console.error(`✗ 未知参数：${args.join(' ')}`);
    process.exit(2);
  }
  let result;
  try {
    result = checkRepo(ROOT);
  } catch (error) {
    console.error(`✗ 科技可用性检查失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log('科技可用性边界（#869）');
  console.log(`  扫到的手写例外：${result.sites.length}`);
  console.log(`  已点名声明：${result.exceptions.length}`);
  if (result.errors.length) {
    console.error('\n✗ 发现未点名或不可互换的漂移：');
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('\n✓ 四套问题仍分开；手写例外都有字面量声明。');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();
