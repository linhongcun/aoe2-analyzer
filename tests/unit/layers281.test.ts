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
    expect(rule(e('src/domain/datEffects.ts', 'src/data/effects.json'))).toBeNull();
    expect(rule(e('src/app/Layout.tsx', 'src/features/search/components/CommandPalette.tsx'))).toBeNull();
  });

  it('核心 JSON 只能由 LOADERS 逐个登记的 7 个文件直接 import，src 下其他文件一律报错', () => {
    const loaders = [
      'src/data/index.ts',
      'src/data/raw/civs.ts',
      'src/data/raw/units.ts',
      'src/data/raw/techs.ts',
      'src/data/raw/buildings.ts',
      'src/data/raw/eco.ts',
      'src/domain/datEffects.ts',
    ];
    expect([...(LOADERS as Set<string>)]).toEqual(loaders);
    // 逐个列名、不用通配：每个登记项都是真实存在的文件
    for (const f of loaders) expect(readFileSync(`${ROOT}/${f}`, 'utf8').length).toBeGreaterThan(0);
    // 白名单文件不报（静态与动态）
    expect(rule(e('src/data/index.ts', 'src/data/civs.json'))).toBeNull();
    expect(rule(e('src/data/index.ts', 'src/data/units.json', './units.json', true))).toBeNull();
    expect(rule(e('src/data/raw/eco.ts', 'src/data/eco.json'))).toBeNull();
    expect(rule(e('src/domain/datEffects.ts', 'src/data/effects.json'))).toBeNull();
    // 违规探针：domain、data 层其他文件、shared、app 各一条
    expect(rule(e('src/domain/x.ts', 'src/data/eco.json'))).toBe('core-json-direct');
    expect(rule(e('src/data/hooks.ts', 'src/data/civs.json'))).toBe('core-json-direct');
    expect(rule(e('src/data/raw/extra.ts', 'src/data/trees.json', './trees.json', true))).toBe('core-json-direct');
    expect(rule(e('src/shared/ui/X.tsx', 'src/data/units.json'))).toBe('core-json-direct');
    expect(rule(e('src/app/Layout.tsx', 'src/data/effects.json'))).toBe('core-json-direct');
    // 非核心 JSON 不受限
    expect(rule(e('src/data/hooks.ts', 'src/data/search-py.json'))).toBeNull();
    // 真实解析：未登记文件里的直接 import 会被扫出来，经登记入口读取不报
    const parse = parseImports as (f: string, t: string) => Edge[];
    const edges = parse(`${ROOT}/src/data/hooks.ts`, "import c from './civs.json';\nconst t = () => import('./trees.json');\nimport r from './raw/civs';");
    expect(edges.map((x) => rule(x))).toEqual(['core-json-direct', 'core-json-direct', null]);
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

  it('eager glob 的数组写法逐项处理：字面路径、通配、{a,b}、** 与 ! 排除', () => {
    const parse = parseImports as (f: string, t: string) => Edge[];
    const at = `${ROOT}/src/features/z/Z.tsx`;
    const tos = (code: string) => parse(at, code).map((x) => x.to);
    expect(tos("import.meta.glob(['../../data/units.json'], { eager: true });")).toEqual(['src/data/units.json']);
    expect(tos("import.meta.glob(['../../data/{units,techs}.json', '../../data/eco.json'], { eager: true });")).toEqual([
      'src/data/eco.json',
      'src/data/techs.json',
      'src/data/units.json',
    ]);
    const excl = tos("import.meta.glob(['../../data/*.json', '!../../data/{civs,techs}.json'], { eager: true });");
    expect(excl).toContain('src/data/units.json');
    expect(excl).not.toContain('src/data/civs.json');
    expect(excl).not.toContain('src/data/techs.json');
    expect(tos("import.meta.glob('/src/data/build-orders/**/*.json', { eager: true });").length).toBeGreaterThan(0);
    // 数组写法照样落进规则：features 直接 eager glob 核心 JSON 算 core-json-direct
    const edges = parse(at, "import.meta.glob(['../../data/units.json', '../../data/eco.json'], { eager: true });");
    expect(edges.map((x) => rule(x))).toEqual(['core-json-direct', 'core-json-direct']);
    // 非 eager 的数组也不计（同动态 import 口径）
    expect(tos("import.meta.glob(['../../data/units.json']);")).toEqual([]);
  });

  it('eager glob 的参数不是字面量就报错，不静默跳过', () => {
    const parse = parseImports as (f: string, t: string) => Edge[];
    const at = `${ROOT}/src/features/z/Z.tsx`;
    expect(() => parse(at, "const p = '../../data/units.json'; import.meta.glob(p, { eager: true });")).toThrow(/字面量/);
    expect(() => parse(at, "const p = 'units'; import.meta.glob(['../../data/eco.json', `../../data/${p}.json`], { eager: true });")).toThrow(/字面量/);
    expect(() => parse(at, "const p = '../../data/units.json'; import.meta.glob([p], { eager: true });")).toThrow(/字面量/);
    expect(() => parse(at, 'import.meta.glob([], { eager: true });')).toThrow(/字面量/);
    expect(() => parse(at, "import.meta.glob('../../data/nope.json', { eager: true });")).toThrow(/不存在/);
  });

  it('require() 与 import x = require() 直接报错，不静默漏扫', () => {
    const parse = parseImports as (f: string, t: string) => Edge[];
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "const r = require('react');")).toThrow(/require/);
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "import r = require('react');")).toThrow(/require/);
    expect(() => parse(`${ROOT}/src/domain/x.ts`, "// const r = require('react');")).not.toThrow();
  });

  it('CI 以 --strict 运行分层检查（#281 ⑤）', () => {
    const ci = readFileSync(`${ROOT}/.github/workflows/ci.yml`, 'utf8');
    expect(ci).toMatch(/- name: Layer boundaries \(strict, #281\)\n\s+run: npm run lint:layers -- --strict\n/);
    expect(ci).not.toMatch(/warn only/i);
  });

  it('默认模式只报警（退出码 0），--strict 在有违规时退出码 1', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/check-layers.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const warn = run();
    expect(warn.status).toBe(0);
    expect(warn.stdout).toMatch(/^分层边界检查（#281）：\d+ 处越层引用/);
    const report = JSON.parse(run('--json').stdout) as Edge[];
    expect(run('--strict').status).toBe(report.length ? 1 : 0);
    // 连续起 3 个 node 子进程各扫一遍 src，CI 满载时会超过默认 5s（3e3b8b1 上实测超时），单独放宽
  }, 30_000);
});
