import { describe, expect, it } from 'vitest';
import { importsOf, staticClosure } from './importGraph';

/**
 * v0.28.0 验收 #280（首页入口包瘦身）：从 src/main.tsx 遍历静态 import 图。Kent 写，先于实现提交。
 * 动态 import()（lazy 拆包）不算入口依赖；`import type` 打包时擦除，也不算。
 * 现在应失败：入口经 Layout.tsx → CommandPalette 带进 effects.json 和 search-py.json，sections.ts 引入 domain/family.ts。
 */
const ENTRY = 'src/main.tsx';
const chain = (c: Map<string, string[]>, f: string) => c.get(f)!.join('\n  -> ');

describe('#280 入口静态依赖', () => {
  const closure = staticClosure(ENTRY);

  it('守卫：遍历确实从入口走到了 Layout 和导航配置', () => {
    expect(closure.has('src/app/Layout.tsx')).toBe(true);
    expect(closure.has('src/shared/nav/sections.ts')).toBe(true);
  });

  it.each(['effects.json', 'search-py.json', 'glossary.json'])('入口静态依赖里没有 %s', (name) => {
    const hits = [...closure.keys()].filter((f) => f.endsWith('/' + name));
    expect(
      hits.map((f) => chain(closure, f)),
      `${name} 的引用链`,
    ).toEqual([]);
  });

  it('CommandPalette 不在入口静态依赖里（改为 lazy，第一次打开搜索时才加载）', () => {
    const f = 'src/features/search/components/CommandPalette.tsx';
    expect(closure.has(f) ? chain(closure, f) : null).toBeNull();
  });

  it('sections.ts 不 import src/domain/**（单位数文案改用构建期常量 __UNIT_COUNT__）', () => {
    const bad = importsOf('src/shared/nav/sections.ts').filter((e) => e.to?.startsWith('src/domain/'));
    expect(bad.map((e) => `${e.from}:${e.line} -> ${e.to}`)).toEqual([]);
  });
});
