import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { PROFILES, planChanges, planRange } from '../../scripts/ci-scope.mjs';
// @ts-expect-error scripts/*.mjs has no declaration
import { executePlan, resolveTestFiles, testCommand, validatePlan } from '../../scripts/ci-run.mjs';

const change = (path: string, before: string | null = '', after: string | null = '') => ({ path, before, after });
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ci-plan-'));
  directories.push(directory);
  mkdirSync(join(directory, 'tests/unit'), { recursive: true });
  mkdirSync(join(directory, 'tests/e2e'), { recursive: true });
  writeFileSync(join(directory, 'tests/unit/releaseA.test.ts'), 'fixture');
  writeFileSync(join(directory, 'tests/unit/releaseB.test.ts'), 'fixture');
  writeFileSync(join(directory, 'tests/e2e/route.spec.ts'), 'fixture');
  return directory;
}
const minimal = (overrides = {}) => ({ scope: 'targeted', features: [], unit: [], e2e: [], data: false, full: false, ...overrides });

describe('#431 affected feature plans', () => {
  it('patch summary and route helpers select their actual regressions without data generation', () => {
    const patch = planChanges([change('src/features/patches/Patches.tsx'), change('src/domain/patches.ts')]);
    expect(patch).toMatchObject({ scope: 'targeted', features: ['patches'], full: false, data: false });
    expect(patch.unit).toContain('tests/unit/patchTree417.test.ts');
    expect(patch.e2e).toEqual(['tests/e2e/patchTree417.spec.ts', 'tests/e2e/patches16.spec.ts']);
    const route = planChanges([change('src/domain/simRoute.ts')]);
    expect(route).toMatchObject({ scope: 'targeted', features: ['matchup', 'simulator', 'units'], full: false, data: false });
    expect(route.unit).toContain('tests/unit/simulator.test.ts');
    expect(route.unit).toContain('tests/unit/simRoute424.test.ts');
    expect(route.e2e).toContain('tests/e2e/matchupSim424.spec.ts');
    expect(route.e2e).toContain('tests/e2e/upgradeLine10.spec.ts');
    expect(patch.unit).not.toContain('tests/unit/release*.test.ts');
  });

  it('known UI modules and their helpers have a bounded plan; unknown modules remain full once', () => {
    for (const feature of ['civs', 'units', 'techs', 'buildings', 'maps', 'compare', 'patches', 'matchup', 'siege']) {
      const plan = planChanges([change(`src/features/${feature}/logic/helper.ts`)]);
      expect(plan.full).toBe(false);
      expect(plan.data).toBe(false);
      expect(plan.features).toEqual([feature]);
      expect(plan.e2e.length).toBeGreaterThan(0);
    }
    expect(planChanges([change('src/features/newUnmapped/View.tsx')])).toMatchObject({ scope: 'full', data: false, full: true });
  });

  it('#533 siege UI and the unit detail entry own siege533 without the site-wide matrix', () => {
    const siege = planChanges([change('src/features/siege/Siege.tsx')]);
    expect(siege).toMatchObject({ scope: 'targeted', features: ['siege'], full: false, data: false });
    expect(siege.unit).toEqual(['tests/unit/siege308.test.ts']);
    expect(siege.e2e).toEqual(['tests/e2e/siege308.spec.ts', 'tests/e2e/siege533.spec.ts']);
    expect(siege.e2e).not.toContain('tests/e2e/v0300-338.spec.ts');
    const detail = planChanges([change('src/features/units/components/UnitDetail.tsx')]);
    expect(detail).toMatchObject({ scope: 'targeted', features: ['units'], full: false, data: false });
    expect(detail.e2e).toContain('tests/e2e/siege533.spec.ts');
    expect(detail.e2e).toContain('tests/e2e/unitCards6.spec.ts');
    expect(detail.e2e).not.toContain('tests/e2e/siege308.spec.ts');
    expect(detail.e2e).not.toContain('tests/e2e/v0300-338.spec.ts');
  });

  it('shared card styles cover both matchup and same-DLC civilization details, with union and deduplication', () => {
    const plan = planChanges([change('src/shared/styles/issue62-cards.css'), change('src/features/matchup/components/Matchup.tsx')]);
    expect(plan.features).toEqual(['civs', 'matchup']);
    expect(plan.e2e).toContain('tests/e2e/layout62.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/matchupSim424.spec.ts');
    expect(plan.unit).toEqual([...new Set(plan.unit)].sort());
    expect(plan.e2e).toEqual([...new Set(plan.e2e)].sort());
    const current = readFileSync('src/shared/styles/issue62-cards.css', 'utf8');
    expect(planChanges([change('src/shared/styles/issue62-cards.css', current, current + '\n.same-dlc-toggle { padding: 1rem }')])).toMatchObject({
      features: ['civs', 'matchup'],
      full: false,
    });
    for (const addition of ['body { display:none }', '@import "global.css";', '.same-dlc-civs ~ * { display:none }'])
      expect(planChanges([change('src/shared/styles/issue62-cards.css', current, current + '\n' + addition)])).toMatchObject({ full: true, data: false });
  });

  it('core logic and shared infrastructure retain full tests without regenerating unchanged data', () => {
    for (const path of [
      'src/domain/simulator.ts',
      'src/domain/buildSim.ts',
      'src/shared/hooks/useSimState.ts',
      'src/shared/ui/CivPicker.tsx',
      'src/shared/styles/tokens.css',
      'src/shared/nav/pageRegistry.ts',
      'vite.config.ts',
    ])
      expect(planChanges([change(path)])).toMatchObject({ scope: 'full', full: true, data: false });
  });

  it('data generation is required only for actual data/generator/dependency changes, even in mixed ranges', () => {
    for (const path of [
      'src/data/civs.json',
      'public/img/civs/Franks.webp',
      'scripts/build_data.py',
      'scripts/data_sources.json',
      'scripts/pinyin_build.mjs',
      'docs/PATCH-NOTES/185872.md',
      '.npmrc',
    ]) {
      expect(planChanges([change('src/features/units/components/UnitList.tsx'), change(path)])).toMatchObject({ scope: 'full', data: true });
    }
    const before = JSON.stringify({ version: '0.34.0', dependencies: { react: '18' } });
    const version = JSON.stringify({ version: '0.34.1', dependencies: { react: '18' } });
    const dependencies = JSON.stringify({ version: '0.34.1', dependencies: { react: '19' } });
    expect(planChanges([change('package.json', before, version)])).toMatchObject({ scope: 'maintenance', data: false });
    expect(planChanges([change('package.json', before, dependencies)])).toMatchObject({ scope: 'full', data: true });
  });

  it('policy changes add policy unit tests to the affected UI rather than running the site', () => {
    const plan = planChanges([
      change('scripts/ci-evidence.mjs'),
      change('scripts/ci-run.mjs'),
      change('scripts/site-artifact.mjs'),
      change('scripts/deployment-smoke.mjs'),
      change('src/features/patches/Patches.tsx'),
    ]);
    expect(plan).toMatchObject({ scope: 'targeted', data: false, full: false });
    expect(plan.unit).toContain('tests/unit/release*.test.ts');
    expect(plan.unit).toContain('tests/unit/patchTree417.test.ts');
    expect(plan.e2e).toEqual(['tests/e2e/patchTree417.spec.ts', 'tests/e2e/patches16.spec.ts']);
  });

  it('an added test runs explicitly; an unmapped test name is not an excuse to run the whole product', () => {
    const plan = planChanges([change('tests/e2e/newBehavior.spec.ts'), change('tests/unit/newBehavior.test.ts')]);
    expect(plan).toEqual(
      minimal({
        unit: ['tests/unit/newBehavior.test.ts'],
        e2e: ['tests/e2e/newBehavior.spec.ts'],
        paths: ['tests/e2e/newBehavior.spec.ts', 'tests/unit/newBehavior.test.ts'],
      }),
    );
    expect(planChanges([change('tests/unit/buildSim.test.ts')])).toEqual(
      minimal({ unit: ['tests/unit/buildSim.test.ts'], paths: ['tests/unit/buildSim.test.ts'] }),
    );
    expect(planChanges([change('tests/e2e/catalogLayout187.spec.ts')])).toEqual(
      minimal({ e2e: ['tests/e2e/catalogLayout187.spec.ts'], paths: ['tests/e2e/catalogLayout187.spec.ts'] }),
    );
  });

  it('every shipped profile selects real files, so stale test names cannot produce an empty success', () => {
    for (const tests of Object.values(PROFILES) as { unit: string[]; e2e: string[] }[]) {
      expect(resolveTestFiles(tests.unit, 'unit')).toHaveLength(new Set(tests.unit).size);
      expect(resolveTestFiles(tests.e2e, 'e2e')).toHaveLength(new Set(tests.e2e).size);
    }
  });

  it.each([null, [], [null], [{}], [change('../src/features/maps/Maps.tsx')]])('missing/malformed evidence %j stays conservative', (changes) => {
    expect(planChanges(changes)).toMatchObject({ scope: 'full', data: true, full: true });
  });
});

describe('#431 safe selected-test runner', () => {
  it('expands basename globs, deduplicates and selects exactly the requested files', () => {
    const directory = fixture();
    expect(resolveTestFiles(['tests/unit/release*.test.ts', 'tests/unit/releaseA.test.ts'], 'unit', directory)).toEqual([
      'tests/unit/releaseA.test.ts',
      'tests/unit/releaseB.test.ts',
    ]);
    expect(testCommand(minimal({ e2e: ['tests/e2e/route.spec.ts'] }), 'e2e', directory)).toEqual({
      command: 'npx',
      args: ['playwright', 'test', 'tests/e2e/route.spec.ts', '--reporter=line'],
    });
  });

  it.each([
    'tests/unit/missing*.test.ts',
    '../tests/unit/releaseA.test.ts',
    '/tmp/releaseA.test.ts',
    'tests/unit/../../releaseA.test.ts',
    'tests/unit/releaseA.test.ts;exit 0',
    'tests/e2e/route.spec.ts',
    '--passWithNoTests',
  ])('rejects missing/unsafe unit selection %s', (path) => {
    expect(() => resolveTestFiles([path], 'unit', fixture())).toThrow();
  });

  it('rejects symlink tests and non-regular files instead of following them outside the test directory', () => {
    const directory = fixture();
    writeFileSync(join(directory, 'outside.test.ts'), 'outside');
    symlinkSync(join(directory, 'outside.test.ts'), join(directory, 'tests/unit/linked.test.ts'));
    expect(() => resolveTestFiles(['tests/unit/linked.test.ts'], 'unit', directory)).toThrow(/regular file/);
    const elsewhere = fixture();
    rmSync(join(elsewhere, 'tests/unit'), { recursive: true });
    symlinkSync(join(directory, 'tests/unit'), join(elsewhere, 'tests/unit'));
    expect(() => resolveTestFiles(['tests/unit/releaseA.test.ts'], 'unit', elsewhere)).toThrow(/directory must not be a symlink/);
  });

  it('only an explicitly empty selection is skipped; test failure exits remain failures', () => {
    const directory = fixture();
    let calls = 0;
    const run = () => {
      calls++;
      return { status: 3 };
    };
    expect(executePlan(minimal(), 'unit', { directory, run, log: () => {} })).toBe(0);
    expect(calls).toBe(0);
    expect(executePlan(minimal({ unit: ['tests/unit/releaseA.test.ts'] }), 'unit', { directory, run, log: () => {} })).toBe(3);
    expect(calls).toBe(1);
    expect(() => executePlan(minimal({ unit: ['tests/unit/releaseA.test.ts'] }), 'unit', { directory, run: () => ({ status: null }), log: () => {} })).toThrow(
      /exit status/,
    );
    expect(() =>
      executePlan(minimal({ unit: ['tests/unit/releaseA.test.ts'] }), 'unit', { directory, run: () => ({ error: new Error('cannot launch') }), log: () => {} }),
    ).toThrow(/cannot launch/);
  });

  it('full runs preserve the existing complete suites without shell command construction', () => {
    const full = planChanges([change('src/domain/buildSim.ts')]);
    expect(testCommand(full, 'unit')).toEqual({ command: 'npx', args: ['vitest', 'run'] });
    expect(testCommand(full, 'e2e')).toEqual({ command: 'npx', args: ['playwright', 'test', '--reporter=line'] });
    expect(() => validatePlan(minimal({ full: true }))).toThrow();
    expect(() => validatePlan(minimal({ data: true }))).toThrow();
  });
});

it('#431 real multi-commit Git ranges preserve earlier data changes and CLI force-full is explicit', () => {
  const directory = fixture();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '-q');
  const commit = (path: string, content: string) => {
    mkdirSync(join(directory, path.slice(0, path.lastIndexOf('/'))), { recursive: true });
    writeFileSync(join(directory, path), content);
    git('add', '.');
    git('-c', 'user.name=Plan test', '-c', 'user.email=plan@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const first = commit('docs/guide.md', 'guide');
  const data = commit('src/data/civs.json', 'changed generated data');
  const head = commit('src/features/patches/Patches.tsx', 'changed UI');
  const entry = join(process.cwd(), 'scripts/ci-scope.mjs');
  const inspect = (base: string) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import {planRange} from ${JSON.stringify(entry)}; console.log(JSON.stringify(planRange(${JSON.stringify(base)},${JSON.stringify(head)})));`,
        ],
        { cwd: directory, encoding: 'utf8' },
      ),
    );
  expect(inspect(first)).toMatchObject({ full: true, data: true });
  expect(inspect(data)).toMatchObject({ full: false, data: false, features: ['patches'] });
  expect(planRange(null, head)).toMatchObject({ full: true, data: true });
  const event = join(directory, 'event.json'),
    output = join(directory, 'outputs');
  writeFileSync(event, JSON.stringify({ before: data }));
  execFileSync(process.execPath, [entry], {
    cwd: directory,
    env: {
      ...process.env,
      RUNNER_TEMP: directory,
      GITHUB_EVENT_PATH: event,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_OUTPUT: output,
      CI_FULL: 'true',
      CI_E2E_FULL: 'true',
    },
  });
  expect(JSON.parse(readFileSync(join(directory, 'ci-plan.json'), 'utf8'))).toMatchObject({
    scope: 'full',
    full: true,
    data: true,
    browser: 'full',
  });
  expect(readFileSync(output, 'utf8')).toContain('browser=true');
  expect(JSON.parse(readFileSync(join(directory, 'ci-scope.json'), 'utf8'))).toEqual({ base: data, head, scope: 'full' });
  git('-c', 'user.name=Plan test', '-c', 'user.email=plan@example.invalid', 'commit', '--allow-empty', '-qm', 'metadata only');
  const empty = git('rev-parse', 'HEAD');
  const unchanged = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {planRange} from ${JSON.stringify(entry)}; console.log(JSON.stringify(planRange(${JSON.stringify(head)},${JSON.stringify(empty)})));`,
      ],
      { cwd: directory, encoding: 'utf8' },
    ),
  );
  expect(unchanged).toMatchObject({ scope: 'maintenance', full: false, data: false, e2e: [] });
});
