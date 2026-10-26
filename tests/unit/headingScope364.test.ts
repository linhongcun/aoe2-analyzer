import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI policy is a native Node module without a declaration.
import { duelCssOnly, planChanges } from '../../scripts/ci-scope.mjs';

const change = (path: string, before: string | null = '', after: string | null = '') => ({ path, before, after });
const stylesheet = 'src/features/duel/duel-headings.css';
const localCss = readFileSync(stylesheet, 'utf8');

function moduleReferences(text: string, path: string) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const references = new Set<string>();
  const visit = (node: ts.Node) => {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined;
    if (specifier) {
      if (!ts.isStringLiteralLike(specifier)) throw new Error(`Nonliteral import in ${path}: consumer scope needs review`);
      references.add(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...references];
}

describe('#364 bounded Duel presentation plan', () => {
  it('Duel includes its real calculation, URL, golden and heading regressions', () => {
    const plan = planChanges([change('src/features/duel/components/Duel.tsx')]);
    expect(plan).toMatchObject({ scope: 'targeted', features: ['duel'], full: false, data: false });
    for (const name of ['duel', 'duelParams281', 'costDiscount24', 'realCost88', 'simulator', 'buildingSim', 'prereq', 'headingScope364'])
      expect(plan.unit).toContain(`tests/unit/${name}.test.ts`);
    for (const name of [
      'duelHeading364',
      'listHeadH1296',
      'v0280-duel-url',
      'v0290-322-golden',
      'damage105',
      'age106',
      'replay104',
      'upgrades205',
      'varangian350',
      'pkDiscount24',
      'v070-88',
      'pkUnavail124',
      'v080-124',
      'breakEven25',
      'breakEven.stale',
      'breakEven.colors',
      'breakEven.gaps',
      'smoke',
      'overflow64',
      'refactor288',
    ])
      expect(plan.e2e).toContain(`tests/e2e/${name}.spec.ts`);
  });

  it.each(['src/shared/ui/sim/SimPanel.tsx', 'src/shared/ui/RealCost.tsx'])('%s covers all audited presentation consumers and their defaults', (path) => {
    const plan = planChanges([change(path), change('src/features/duel/components/Duel.tsx')]);
    expect(plan).toMatchObject({ features: ['buildings', 'duel', 'units'], full: false, data: false });
    for (const name of ['duelHeading364', 'matchupSim424', 'v070-88', 'garrison218', 'garrison224', 'unitCards6', 'sidebar44'])
      expect(plan.e2e).toContain(`tests/e2e/${name}.spec.ts`);
    expect(plan.unit).toEqual([...new Set(plan.unit)].sort());
    expect(plan.e2e).toEqual([...new Set(plan.e2e)].sort());
  });

  it('the audited direct consumer sets cannot silently grow outside that plan', () => {
    const expected = {
      'src/shared/ui/sim/SimPanel.tsx': [
        'src/features/buildings/components/BuildingSimulator.tsx',
        'src/features/duel/components/DuelSelection.tsx',
        'src/features/units/components/UnitDetail.tsx',
        'src/shared/ui/sim/Simulator.tsx',
      ],
      'src/shared/ui/RealCost.tsx': ['src/features/duel/components/DuelSelection.tsx', 'src/features/units/components/UnitDetail.tsx'],
    };
    const consumers = Object.fromEntries(Object.keys(expected).map((path) => [path, new Set<string>()]));
    const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
    const options = ts.parseJsonConfigFileContent(config.config, ts.sys, '.').options;
    for (const entry of readdirSync('src', { recursive: true, encoding: 'utf8' })) {
      if (!/\.(?:tsx?|mts|mjs)$/.test(entry)) continue;
      const path = `src/${entry}`;
      for (const specifier of moduleReferences(readFileSync(path, 'utf8'), path)) {
        const module = ts.resolveModuleName(specifier, resolve(path), options, ts.sys).resolvedModule;
        if (module) {
          const target = relative(process.cwd(), module.resolvedFileName).replaceAll('\\', '/');
          consumers[target]?.add(path);
        }
      }
    }
    for (const [path, paths] of Object.entries(expected)) expect([...consumers[path]!].sort(), path).toEqual(paths);
  });

  it('consumer evidence includes static, re-export, dynamic quote/template and type imports; unresolved dynamic evidence fails', () => {
    expect(
      moduleReferences(
        "import Panel from './panel'; export { Basis } from './basis'; const a=import('./quoted'); const b=import(`./template`); type T=import('./typed').T;",
        'fixture.tsx',
      ),
    ).toEqual(['./panel', './basis', './quoted', './template', './typed']);
    expect(() => moduleReferences('const panel = import(target);', 'fixture.tsx')).toThrow(/consumer scope needs review/);
  });

  it('local CSS requires actual range evidence and every selector stays below #duel', () => {
    expect(duelCssOnly(null, localCss)).toBe(true);
    expect(planChanges([change(stylesheet, null, localCss)])).toMatchObject({ features: ['duel'], full: false, data: false });
    expect(duelCssOnly(localCss, '@media (width < 600px) { #duel .duel-side-title { margin: 0 } }')).toBe(true);
    for (const addition of [
      'body { display: none }',
      '#duelish { display:none }',
      '#duel + main { display:none }',
      '#duel ~ * { display:none }',
      '#duel .title, main h1 { display:none }',
      '@import "global.css";',
      '@font-face { font-family: global; src:url(font.woff2) }',
      '@property --global { syntax:"<color>"; initial-value:red; inherits:true }',
      '#duel { .outside { display:none } }',
      'color:red;',
    ]) {
      expect(planChanges([change(stylesheet, localCss, localCss + '\n' + addition)]), addition).toMatchObject({ full: true, data: false });
    }
    for (const [before, after] of [
      [null, null],
      ['', ''],
      [localCss, '{broken'],
    ] as const)
      expect(planChanges([change(stylesheet, before, after)])).toMatchObject({ full: true, data: false });
    expect(planChanges([change('src/features/duel/other.css', null, 'body { display:none }')])).toMatchObject({ full: true, data: false });
    // Vite natively treats pcss/postcss as CSS; alternate suffixes must not bypass the guard.
    for (const extension of ['pcss', 'postcss', 'less', 'sass', 'scss', 'styl', 'stylus', 'sss', 'CSS']) {
      for (const source of ['body { display:none }', '#duel .title { margin:0 }'])
        expect(planChanges([change(`src/features/duel/global.${extension}`, null, source)]), extension).toMatchObject({ full: true, data: false });
    }
  });

  it('core calculations, global CSS, unknown shared files, dependencies and data keep conservative checks', () => {
    for (const path of [
      'src/domain/duel.ts',
      'src/domain/duelParams.ts',
      'src/domain/duelState.ts',
      'src/domain/simulator.ts',
      'src/domain/buildSim.ts',
      'src/domain/realCost.ts',
      'src/shared/ui/sim/SimPanelExtra.tsx',
      'src/shared/ui/RealCostOther.tsx',
      'src/shared/ui/sim/useSimState.ts',
      'src/shared/ui/CivPicker.tsx',
      'src/shared/styles/base.css',
      'src/shared/styles/editorial.css',
      'src/shared/styles/layout.css',
      'src/shared/styles/tokens.css',
      'src/app/pageRegistry.ts',
      'src/features/newUnmapped/View.tsx',
      'vite.config.ts',
    ])
      expect(planChanges([change(path, '', 'body {display:none}')]), path).toMatchObject({ full: true, data: false });
    for (const path of ['src/data/units.json', 'public/img/unit.png', 'scripts/build_data.py'])
      expect(planChanges([change(path)]), path).toMatchObject({ full: true, data: true });
    expect(planChanges([change('package.json', '{"version":"0.40.1"}', '{"version":"0.40.2","scripts":{"build":"other"}}')])).toMatchObject({
      full: true,
      data: true,
    });
    expect(planChanges([change(stylesheet, null, localCss), change('src/domain/duel.ts')])).toMatchObject({
      features: ['all', 'duel'],
      full: true,
      data: false,
    });
    for (const path of ['', '../src/shared/ui/RealCost.tsx', 'src//shared/ui/RealCost.tsx', 'src\\shared\\ui\\RealCost.tsx'])
      expect(planChanges([change(path)])).toMatchObject({ full: true, data: true });
  });
});
