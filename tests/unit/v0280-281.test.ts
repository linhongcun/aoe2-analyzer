import { describe, expect, it } from 'vitest';
import { CORE_JSON_LOADERS, ROOT, classify, layerViolations, parseImports, type LayerRule } from './importGraph';

/**
 * v0.28.0 验收 #281（分层边界）。Kent 写，先于实现提交。规则逐条照抄 #281 验收标准：
 * 1. features/X 不能 import features/Y
 * 2. shared/ 不能 import features/、app/
 * 3. domain/ 不能 import react、features/、app/、shared/ui
 * 4. src/{domain,features} 不能直接 import src/data/{civs,units,techs,buildings,trees,eco,effects}.json（src/data/index.ts 和专门的 loader 除外）
 * `import type` 和动态 `import()` 也算（分层依赖与是否打包无关）。
 *
 * 现在应失败。main @ 6a54c18 按上面字面规则扫出 39 处：feature 互引 17、shared 反向 3、直接 import 核心 JSON 19。
 * #281 正文写 35 处，差的 4 处是 domain 里直接 import eco.json：ecoPayoff.ts:2、production.ts:2、realCost.ts:12、simSupport.ts:2
 * （#281 列的 domain 9 处没有它们，但规则 4 明确包含 eco）。datEffects.ts 读 effects.json 视为「专门的 loader」。
 */
const fmt = (v: { rule: string; from: string; line: number; to: string | null; spec: string }) => `${v.rule}  ${v.from}:${v.line} -> ${v.to ?? v.spec}`;

describe('#281 分层规则', () => {
  const all = layerViolations();

  it('守卫：规则分类自检（合成的 import 边）', () => {
    const e = (from: string, to: string | null, spec = to ?? '') => ({ from, line: 1, spec, to, typeOnly: false });
    expect(classify(e('src/features/a/A.tsx', 'src/features/b/B.tsx'))).toBe('feature-to-feature');
    expect(classify(e('src/features/a/A.tsx', 'src/features/a/x/Y.ts'))).toBeNull();
    expect(classify(e('src/shared/ui/X.tsx', 'src/features/a/A.tsx'))).toBe('shared-upward');
    expect(classify(e('src/shared/ui/X.tsx', 'src/app/nav/sections.ts'))).toBe('shared-upward');
    expect(classify(e('src/domain/x.ts', null, 'react'))).toBe('domain-upward');
    expect(classify(e('src/domain/x.ts', null, 'react-dom/client'))).toBe('domain-upward');
    expect(classify(e('src/domain/x.ts', null, 'react-router-dom'))).toBeNull();
    expect(classify(e('src/domain/x.ts', 'src/shared/ui/Icon.tsx'))).toBe('domain-upward');
    expect(classify(e('src/domain/x.ts', 'src/shared/lib/y.ts'))).toBeNull();
    expect(classify(e('src/domain/x.ts', 'src/data/eco.json'))).toBe('core-json-direct');
    expect(classify(e('src/features/a/A.tsx', 'src/data/units.json'))).toBe('core-json-direct');
    expect(classify(e('src/features/a/A.tsx', 'src/data/index.ts'))).toBeNull();
    expect(classify(e('src/data/index.ts', 'src/data/units.json'))).toBeNull();
    expect(classify(e('src/domain/datEffects.ts', 'src/data/effects.json'))).toBeNull();
    expect(classify(e('src/app/Layout.tsx', 'src/features/search/components/CommandPalette.tsx'))).toBeNull();
  });

  it('守卫：解析器区分静态、type-only、动态 import', () => {
    const src = [
      "import a from './a';",
      "import type { B } from './b';",
      "import { type C, type D } from './c';",
      "import { type E, f } from './e';",
      "export { g } from './g';",
      "export type { H } from './h';",
      "export { type I } from './i';",
      "import './style.css';",
      "const L = lazy(() => import('./lazy'));",
      '// import x from "./comment";',
    ].join('\n');
    const edges = parseImports(`${ROOT}/src/features/z/Z.tsx`, src, (spec) => spec);
    expect(edges.map((x) => [x.spec, x.typeOnly, !!x.dynamic])).toEqual([
      ['./a', false, false],
      ['./b', true, false],
      ['./c', true, false],
      ['./e', false, false],
      ['./g', false, false],
      ['./h', true, false],
      ['./i', true, false],
      ['./style.css', false, false],
      ['./lazy', false, true],
    ]);
    // 真实解析：TypeScript 允许 './x.js' 指向 x.ts
    expect(parseImports(`${ROOT}/src/app/nav/sections.ts`, "import { f } from '../../domain/family.js';")[0]!.to).toBe('src/domain/family.ts');
    expect(() => parseImports(`${ROOT}/src/domain/x.ts`, "const r = require('react');", (s) => s)).toThrow(/require/);
    expect(CORE_JSON_LOADERS.has('src/domain/datEffects.ts')).toBe(true);
  });

  it('守卫：动态 import 也受分层规则约束', () => {
    expect(classify({ from: 'src/domain/x.ts', line: 1, spec: 'react', to: null, typeOnly: false, dynamic: true })).toBe('domain-upward');
    expect(classify({ from: 'src/features/a/A.tsx', line: 1, spec: '', to: 'src/features/b/B.tsx', typeOnly: false, dynamic: true })).toBe(
      'feature-to-feature',
    );
  });

  for (const rule of ['feature-to-feature', 'shared-upward', 'domain-upward', 'core-json-direct'] as LayerRule[])
    it(`${rule}：0 处`, () => {
      expect(all.filter((v) => v.rule === rule).map(fmt)).toEqual([]);
    });

  it('越层引用合计 0 处（v0.27.0 为 39）', () => {
    expect(all.length, all.map(fmt).join('\n')).toBe(0);
  });
});
