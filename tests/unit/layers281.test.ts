import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 脚本，没有类型声明
import { classify, LOADERS, parseImports, ROOT, RULES } from '../../scripts/check-layers.mjs';

interface Edge {
  from: string;
  line: number;
  spec: string;
  to: string | null;
  typeOnly: boolean;
  dynamic?: boolean;
}
const e = (from: string, to: string | null, spec = to ?? '', dynamic = false): Edge => ({ from, line: 1, spec, to, typeOnly: false, dynamic });
const rule = (edge: Edge) => (classify as (x: Edge) => string | null)(edge);

/** #281 ①：分层规则脚本本身的行为。违规清零的断言在 ⑤ 改为 --strict 时由 CI 负责。 */
describe('#281 分层边界检查脚本', () => {
  it('四条规则按 #281 验收标准分类', () => {
    expect(Object.keys(RULES)).toEqual(['feature-to-feature', 'shared-upward', 'domain-upward', 'core-json-direct']);
    expect(rule(e('src/features/a/A.tsx', 'src/features/b/B.tsx'))).toBe('feature-to-feature');
    expect(rule(e('src/features/a/A.tsx', 'src/features/a/x/Y.ts'))).toBeNull();
    expect(rule(e('src/features/a/A.tsx', 'src/features/b/B.tsx', './B', true))).toBe('feature-to-feature');
    expect(rule(e('src/shared/ui/X.tsx', 'src/features/a/A.tsx'))).toBe('shared-upward');
    expect(rule(e('src/shared/ui/X.tsx', 'src/app/nav/sections.ts'))).toBe('shared-upward');
    expect(rule(e('src/domain/x.ts', null, 'react'))).toBe('domain-upward');
    expect(rule(e('src/domain/x.ts', null, 'react-dom/client'))).toBe('domain-upward');
    expect(rule(e('src/domain/x.ts', null, 'react-router-dom'))).toBeNull();
    expect(rule(e('src/domain/x.ts', 'src/shared/ui/Icon.tsx'))).toBe('domain-upward');
    expect(rule(e('src/domain/x.ts', 'src/shared/utils/unitCountLabel.ts'))).toBeNull();
    expect(rule(e('src/domain/x.ts', 'src/data/eco.json'))).toBe('core-json-direct');
    expect(rule(e('src/features/a/A.tsx', 'src/data/units.json'))).toBe('core-json-direct');
    expect(rule(e('src/features/a/A.tsx', 'src/data/index.ts'))).toBeNull();
    expect(rule(e('src/data/index.ts', 'src/data/units.json'))).toBeNull();
    expect(rule(e('src/domain/datEffects.ts', 'src/data/effects.json'))).toBeNull();
    expect(rule(e('src/app/Layout.tsx', 'src/features/search/components/CommandPalette.tsx'))).toBeNull();
    expect([...(LOADERS as Set<string>)]).toEqual(['src/domain/datEffects.ts']);
  });

  it('解析 import type、export from 与动态 import()，注释不算', () => {
    const src = [
      "import { unitCountLabel } from '../../shared/utils/unitCountLabel';",
      "import type { IconName } from '../../shared/ui/Icon';",
      "export { unitCountLabel as label } from '../../shared/utils/unitCountLabel';",
      "const Lazy = () => import('../../domain/family');",
      "// import x from '../../domain/units';",
    ].join('\n');
    const edges = (parseImports as (f: string, t: string) => Edge[])(`${ROOT}/src/app/nav/sections.ts`, src);
    expect(edges.map((x) => [x.to, x.typeOnly, x.dynamic])).toEqual([
      ['src/shared/utils/unitCountLabel.ts', false, false],
      ['src/shared/ui/Icon.tsx', true, false],
      ['src/shared/utils/unitCountLabel.ts', false, false],
      ['src/domain/family.ts', false, true],
    ]);
  });

  it('eager 的 import.meta.glob 按匹配到的每个文件计边，非 eager 不计', () => {
    const parse = parseImports as (f: string, t: string) => Edge[];
    const eager = parse(`${ROOT}/src/data/buildOrders.ts`, "const m = import.meta.glob('./build-orders/*.json', { eager: true });");
    expect(eager.length).toBeGreaterThan(0);
    expect(eager.every((x) => x.to?.startsWith('src/data/build-orders/') && x.to.endsWith('.json') && !x.dynamic && !x.typeOnly)).toBe(true);
    expect(parse(`${ROOT}/src/data/buildOrders.ts`, "const m = import.meta.glob('./build-orders/*.json');")).toEqual([]);
    // 真实文件：只有 src/data/buildOrders.ts 用到，它不在 domain/features 下，不改变违规口径
    const real = parse(`${ROOT}/src/data/buildOrders.ts`, readFileSync(`${ROOT}/src/data/buildOrders.ts`, 'utf8'));
    expect(real.filter((x) => x.spec === './build-orders/*.json').length).toBe(eager.length);
    expect(real.map((x) => rule(x)).filter(Boolean)).toEqual([]);
  });

  it('require() 与 import x = require() 直接报错，不静默漏扫', () => {
    const parse = parseImports as (f: string, t: string) => Edge[];
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "const r = require('react');")).toThrow(/require/);
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "import r = require('react');")).toThrow(/require/);
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "// const r = require('react');")).not.toThrow();
  });

  it('默认模式只报警（退出码 0），--strict 在有违规时退出码 1', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/check-layers.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const warn = run();
    expect(warn.status).toBe(0);
    expect(warn.stdout).toMatch(/^分层边界检查（#281）：\d+ 处越层引用/);
    const report = JSON.parse(run('--json').stdout) as Edge[];
    expect(run('--strict').status).toBe(report.length ? 1 : 0);
  });
});
