import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #280：从 src/main.tsx 出发遍历「静态」import 图（跳过 import type 与动态 import()），
 * 断言首页入口包不会同步带上大体积数据 JSON。
 */
const ROOT = resolve(__dirname, '../..');
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx'];

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function staticImports(file: string): string[] {
  if (!/\.(tsx?|m?js)$/.test(file)) return [];
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    if (m[2]) continue; // import type / export type
    if (m[1] === 'export' && !m[3]) continue;
    specs.push(m[4]!);
  }
  return specs;
}

/** 返回每个可达文件及其第一条引用链 */
function walk(entry: string): Map<string, string[]> {
  const chains = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of staticImports(file)) {
      const target = resolveImport(file, spec);
      if (!target || chains.has(target)) continue;
      chains.set(target, [...chains.get(file)!, target]);
      queue.push(target);
    }
  }
  return chains;
}

const rel = (p: string) => relative(ROOT, p);
const graph = walk(join(ROOT, 'src/main.tsx'));

describe('#280 首页入口静态依赖', () => {
  it('遍历到了入口的主要模块', () => {
    expect(graph.has(join(ROOT, 'src/app/Layout.tsx'))).toBe(true);
    expect(graph.has(join(ROOT, 'src/app/nav/sections.ts'))).toBe(true);
  });

  for (const json of ['src/data/effects.json', 'src/data/search-py.json', 'src/content/glossary.json']) {
    it(`入口不同步引入 ${json}`, () => {
      const chain = graph.get(join(ROOT, json));
      expect(chain?.map(rel).join(' > ') ?? null).toBeNull();
    });
  }

  it('CommandPalette 不在入口静态依赖里（改为懒加载）', () => {
    const chain = graph.get(join(ROOT, 'src/features/search/components/CommandPalette.tsx'));
    expect(chain?.map(rel).join(' > ') ?? null).toBeNull();
  });

  it('sections.ts 不引入 src/domain', () => {
    const domain = staticImports(join(ROOT, 'src/app/nav/sections.ts'))
      .map((spec) => resolveImport(join(ROOT, 'src/app/nav/sections.ts'), spec))
      .filter((p): p is string => !!p && rel(p).startsWith('src/domain/'));
    expect(domain.map(rel)).toEqual([]);
  });
});
