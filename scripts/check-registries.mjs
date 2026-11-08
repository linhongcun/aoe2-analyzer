#!/usr/bin/env node
/**
 * #794 机制注册表一致性静态检查。
 *
 * 只读：不 import React、不加载运行时模块、不写文件。用 TypeScript AST 读取五组登记：
 *   CIV_MECHANISMS          src/domain/buildSimMechanisms.ts
 *   CIV_NOTES               src/domain/buildSimNotes.ts
 *   simSupport 显式分支      src/domain/buildSimCoverage.ts
 *   parity special 列表      scripts/build_mechanisms_parity.ts
 *   bonusUsage currentScope  src/domain/bonusUsage.ts
 *
 * 允许的缺口必须逐条出现在 ALLOW 中并写明原因；新增/删除登记或缺口变化都会失败。
 * 用法：node scripts/check-registries.mjs [--root <dir>]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const FILES = {
  mechanisms: 'src/domain/buildSimMechanisms.ts',
  notes: 'src/domain/buildSimNotes.ts',
  coverage: 'src/domain/buildSimCoverage.ts',
  parity: 'scripts/build_mechanisms_parity.ts',
  bonusUsage: 'src/domain/bonusUsage.ts',
};

const EXPECTED = { mechanisms: 20, notes: 18, simSupport: 14, parity: 13, bonusUsage: 11 };

/** 允许的缺口：每条都写明为什么可以暂不登记。新增缺口必须在这里补原因。 */
const ALLOW = {
  notes: {
    Portuguese: '通用行披露（FORAGER_WOOD_NOTE）留在 civSimNotes，不重复进 CIV_NOTES',
    Franks: '只有 freeResearchOnce，没有专属假设/附注',
  },
  simSupport: {
    Portuguese: '没有逐文明分支；由通用 classifyCivEffect 分类，无来源原因',
    Shu: '没有逐文明分支；只有 assumptions，由通用分类处理',
    Malians: '没有逐文明分支；只有 assumptions，由通用分类处理',
    Varangians: '没有逐文明分支；只有 assumptions，由通用分类处理',
    Tatars: '没有逐文明分支；atomicGather/assumptions 由通用分类处理',
    Franks: '没有逐文明分支；只有 freeResearchOnce，由通用分类处理',
  },
  parity: {
    Romans: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Poles: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Gurjaras: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Mapuche: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Chinese: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Jurchens: 'parity special 列表只覆盖 #197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
    Franks: 'parity special 列表不单列；freeResearchOnce 由通用快照覆盖',
  },
  bonusUsage: {
    Gurjaras: '当前模板未驻畜，eco/text 行由通用 scope 分类，未进逐条科技清单',
    Jurchens: '尸体腐烂/攻城折扣不在当前模板，eco/text 行由通用 scope 分类',
    Portuguese: '采果兼产木材走 assumptions，未进逐条科技清单',
    Shu: '伐木兼产食物走 assumptions，未进逐条科技清单',
    Malians: '采金交仓/建筑木费走 assumptions，未进逐条科技清单',
    Varangians: '牧羊/狩猎/捕鱼兼产黄金走 assumptions，未进逐条科技清单',
    Tatars: '牧羊配对走 assumptions，未进逐条科技清单',
    Mayans: '资源配对/骑兵模板走 assumptions，未进逐条科技清单',
    Franks: 'freeResearchOnce 没有逐条科技解释，未进清单',
  },
};

function parse(root, rel) {
  const file = resolve(root, rel);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`无法读取 ${rel}：${error.message}`);
  }
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function findVariable(sf, name) {
  let found = null;
  visit(sf, (node) => {
    if (!found && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node;
  });
  if (!found) throw new Error(`找不到变量 ${name}`);
  return found;
}

function findFunction(sf, name) {
  let found = null;
  visit(sf, (node) => {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
  });
  if (!found) throw new Error(`找不到函数 ${name}`);
  return found;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function objectKeys(sf, name) {
  const init = findVariable(sf, name).initializer;
  if (!init || !ts.isObjectLiteralExpression(init)) throw new Error(`${name} 不是对象字面量`);
  const out = [];
  for (const prop of init.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyName(prop.name);
      if (key !== null) out.push(key);
    }
  }
  return [...new Set(out)];
}

function mapKeys(sf, name) {
  const init = findVariable(sf, name).initializer;
  if (!init || !ts.isNewExpression(init) || init.expression.getText(sf) !== 'Map') throw new Error(`${name} 不是 new Map([...])`);
  const arg = init.arguments?.[0];
  if (!arg || !ts.isArrayLiteralExpression(arg)) throw new Error(`${name} 的 Map 参数不是数组`);
  const out = [];
  for (const entry of arg.elements) {
    if (!ts.isArrayLiteralExpression(entry)) continue;
    const first = entry.elements[0];
    if (first && ts.isStringLiteral(first)) out.push(first.text);
  }
  return [...new Set(out)];
}

function arrayStrings(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return null;
  const out = [];
  for (const element of node.elements) {
    if (ts.isStringLiteral(element)) out.push(element.text);
    else return null;
  }
  return out;
}

function variableArray(sf, name) {
  const init = findVariable(sf, name).initializer;
  const values = arrayStrings(init);
  if (!values) throw new Error(`${name} 不是纯字符串数组`);
  return [...new Set(values)];
}

function simSupportCivs(sf) {
  const fn = findFunction(sf, 'simSupport');
  const out = [];
  visit(fn.body, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return;
    const left = node.left;
    const right = node.right;
    if (ts.isIdentifier(left) && left.text === 'civ' && ts.isStringLiteral(right)) out.push(right.text);
  });
  return [...new Set(out)];
}

function currentScopeCivs(sf) {
  const init = findVariable(sf, 'currentScope').initializer;
  let found = null;
  visit(init, (node) => {
    if (found || !ts.isArrayLiteralExpression(node)) return;
    const values = arrayStrings(node);
    if (values && values.length >= 5) found = values;
  });
  if (!found) throw new Error('bonusUsage 的 currentScope 里找不到文明数组');
  return [...new Set(found)];
}

const setsOf = (values) => new Set(values);

function diff(left, right) {
  return [...left].filter((value) => !right.has(value));
}

function checkGap(label, mechanisms, actual, allow) {
  const errors = [];
  const missing = diff(mechanisms, actual);
  const extra = diff(actual, mechanisms);
  const allowed = new Set(Object.keys(allow));
  for (const civ of missing) if (!allowed.has(civ)) errors.push(`${label} 缺少未允许的登记：${civ}`);
  for (const civ of allowed) if (!missing.includes(civ)) errors.push(`${label} 的允许缺口已不存在：${civ}（请更新 ALLOW）`);
  for (const civ of extra) errors.push(`${label} 有不在 CIV_MECHANISMS 的登记：${civ}`);
  return errors;
}

export function checkRegistries(root = process.cwd()) {
  const mechanisms = objectKeys(parse(root, FILES.mechanisms), 'CIV_MECHANISMS');
  const notes = mapKeys(parse(root, FILES.notes), 'CIV_NOTES');
  const simSupport = simSupportCivs(parse(root, FILES.coverage));
  const parity = variableArray(parse(root, FILES.parity), 'special');
  const bonusUsage = currentScopeCivs(parse(root, FILES.bonusUsage));
  const actual = { mechanisms, notes, simSupport, parity, bonusUsage };
  const errors = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (actual[key].length !== expected) errors.push(`${key} 数量为 ${actual[key].length}，期望 ${expected}`);
  }
  const mechanismsSet = setsOf(mechanisms);
  errors.push(...checkGap('CIV_NOTES', mechanismsSet, setsOf(notes), ALLOW.notes));
  errors.push(...checkGap('simSupport', mechanismsSet, setsOf(simSupport), ALLOW.simSupport));
  errors.push(...checkGap('parity', mechanismsSet, setsOf(parity), ALLOW.parity));
  errors.push(...checkGap('bonusUsage', mechanismsSet, setsOf(bonusUsage), ALLOW.bonusUsage));
  return { actual, allow: ALLOW, errors };
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg.startsWith('--root=')) root = resolve(arg.slice('--root='.length));
    else if (arg === '--root') {
      const value = args[++index];
      if (!value) {
        console.error('✗ --root 需要目录参数');
        process.exit(2);
      }
      root = resolve(value);
    } else {
      console.error(`✗ 未知参数：${arg}`);
      process.exit(2);
    }
  }
  let result;
  try {
    result = checkRegistries(root);
  } catch (error) {
    console.error(`✗ 机制注册表检查失败：${error.message}`);
    process.exit(1);
  }
  const { actual, allow, errors } = result;
  console.log('机制注册表一致性检查（#794）');
  console.log(`  CIV_MECHANISMS: ${actual.mechanisms.length}`);
  console.log(`  CIV_NOTES: ${actual.notes.length}（允许缺口：${Object.keys(allow.notes).join('、')}）`);
  console.log(`  simSupport 显式分支: ${actual.simSupport.length}（允许缺口：${Object.keys(allow.simSupport).join('、')}）`);
  console.log(`  parity: ${actual.parity.length}（允许缺口：${Object.keys(allow.parity).join('、')}）`);
  console.log(`  bonusUsage: ${actual.bonusUsage.length}（允许缺口：${Object.keys(allow.bonusUsage).join('、')}）`);
  if (errors.length) {
    console.error('\n✗ 发现登记漂移：');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('\n✓ 五组登记一致；允许缺口均有原因。');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();
