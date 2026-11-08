import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { planChanges } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { testCommand } from '../../scripts/ci-run.mjs';

const shellPaths = ['src/app/Layout.tsx', 'src/shared/ui/Icon.tsx', 'src/shared/styles/editorial-shell.css'];
const change = (path: string) => ({ path });

it.each(shellPaths)('#659 %s retains full consumer coverage with docs and version-only updates', (path) => {
  const plan = planChanges([
    change(path),
    change('docs/TESTING.md'),
    change('CHANGELOG.md'),
    { path: 'package.json', before: '{"version":"0.71.0"}', after: '{"version":"0.71.1"}' },
    {
      path: 'package-lock.json',
      before: '{"version":"0.71.0","packages":{"":{"version":"0.71.0"}}}',
      after: '{"version":"0.71.1","packages":{"":{"version":"0.71.1"}}}',
    },
  ]);
  expect(plan).toMatchObject({ scope: 'full', features: ['all'], full: true, data: false });
  expect(testCommand(plan, 'unit').args).toEqual(['vitest', 'run']);
  expect(testCommand(plan, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
});

it('#659 shell or policy edits retain full coverage when mixed with a known feature', () => {
  const plan = planChanges([...shellPaths, 'src/features/civs/CivDetail.tsx', 'scripts/ci-scope.mjs'].map(change));
  expect(plan).toMatchObject({ scope: 'full', features: ['all', 'civs'], full: true, data: false });
  expect(testCommand(plan, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(plan.e2e).toEqual([...new Set(plan.e2e)].sort());
});

it.each([
  'src/app/routes.tsx',
  'src/app/Unknown.tsx',
  'src/shared/ui/widgets.tsx',
  'src/shared/styles/tokens.css',
  'src/shared/nav/pageRegistry.ts',
  'src/domain/realCost.ts',
  'src/domain/buildSim.ts',
  'public/licenses/octicons.txt',
])('#513 shell mixed with unaudited %s retains full tests', (path) => {
  expect(planChanges([...shellPaths, path].map(change))).toMatchObject({ scope: 'full', full: true, data: false });
});

it.each(['src/data/civs.json', 'scripts/build_data.py', 'scripts/data_sources.json', 'package.json', 'package-lock.json'])(
  '#513 shell mixed with data/dependency changes in %s retains full+data',
  (path) => expect(planChanges([...shellPaths, path].map(change))).toMatchObject({ scope: 'full', full: true, data: true }),
);

it('#659 real CLI keeps shell PRs and protected pushes full, and forced/background runs full+data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shell-plan-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const commit = (path: string, content: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
    git('add', '.');
    git('-c', 'user.name=Shell test', '-c', 'user.email=shell@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    const base = commit('docs/readme.md', 'initial');
    const head = commit('src/app/Layout.tsx', 'shell');
    const entry = join(process.cwd(), 'scripts/ci-scope.mjs');
    const inspect = (eventName: string, ref: string, force = 'false') => {
      writeFileSync(join(directory, 'event.json'), JSON.stringify({ before: base, pull_request: { base: { sha: base } } }));
      writeFileSync(join(directory, 'outputs'), '');
      execFileSync(process.execPath, [entry], {
        cwd: directory,
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_EVENT_PATH: join(directory, 'event.json'),
          GITHUB_EVENT_NAME: eventName,
          GITHUB_REF: ref,
          GITHUB_OUTPUT: join(directory, 'outputs'),
          CI_FULL: force,
          // Legacy CI_E2E_FULL=false must not weaken a high-risk PR's required coverage.
          CI_E2E_FULL: eventName === 'pull_request' ? 'false' : 'true',
        },
      });
      const plan = JSON.parse(readFileSync(join(directory, 'ci-plan.json'), 'utf8'));
      expect(readFileSync(join(directory, 'outputs'), 'utf8')).toContain('browser=true');
      expect(JSON.parse(readFileSync(join(directory, 'ci-scope.json'), 'utf8'))).toEqual({
        base: ['push', 'pull_request'].includes(eventName) ? base : null,
        head,
        scope: plan.scope,
      });
      return plan;
    };
    const gate = { scope: 'gate', full: false, data: false, browser: 'gate', features: [], unit: [], e2e: ['tests/e2e/smoke.spec.ts'] };
    const pr = inspect('pull_request', 'refs/pull/513/merge');
    expect(pr).toMatchObject(gate);
    for (const ref of ['refs/heads/main', 'refs/heads/release/v0.71.1']) {
      const push = inspect('push', ref);
      expect(push).toMatchObject(gate);
      expect(testCommand(push, 'e2e').args).toEqual(['playwright', 'test', 'tests/e2e/smoke.spec.ts', '--reporter=line']);
      expect(testCommand(push, 'unit')).toBeNull();
    }
    expect(inspect('schedule', 'refs/heads/main')).toMatchObject({ scope: 'full', full: true, data: true });
    expect(inspect('pull_request', 'refs/pull/513/merge', 'true')).toMatchObject({ scope: 'full', full: true, data: true });
    expect(inspect('workflow_dispatch', 'refs/heads/main', 'true')).toMatchObject({ scope: 'full', full: true, data: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
