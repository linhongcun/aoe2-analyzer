import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { GATE_CORE_SMOKE_E2E, PR_CORE_SMOKE_E2E, allowFullBrowser, applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { testCommand, validatePlan } from '../../scripts/ci-run.mjs';

const change = (path: string) => ({ path });
const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const mainPush = { GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'true', GITHUB_REF: 'refs/heads/main' };

it('#659 replaces incomplete display profiles with full validation while retaining audited local consumers', () => {
  const clock = planChanges([change('src/domain/formatTime.ts')]);
  expect(clock).toMatchObject({ scope: 'full', features: ['all'], full: true, data: false });
  expect(planChanges([change('src/domain/dupNames.ts')])).toMatchObject({ full: true, data: false });
  expect(planChanges([change('src/domain/linker.ts')])).toMatchObject({ full: true, data: false });
  expect(planChanges([change('src/domain/sharePage.ts'), change('src/shared/ui/ShareImage.tsx')])).toMatchObject({
    features: ['all', 'share'],
    full: true,
  });
  expect(planChanges([change('src/features/share/PageMeta.tsx'), change('src/features/glossary/Glossary.tsx')])).toMatchObject({
    features: ['all', 'glossary'],
    full: true,
  });
  expect(planChanges([change('src/shared/ui/layout.tsx')])).toMatchObject({ scope: 'full', full: true, data: false });
  const feedback = planChanges([change('src/shared/ui/FeedbackLink.tsx'), change('src/shared/utils/feedback.ts')]);
  expect(feedback).toMatchObject({ scope: 'targeted', features: ['shell'], full: false });
  expect(feedback.unit).toContain('tests/unit/feedback.test.ts');
  expect(feedback.e2e).toContain('tests/e2e/feedbackTap295.spec.ts');
  for (const path of ['src/domain/realCost.ts', 'src/domain/gameClock.ts', 'src/shared/ui/widgets.tsx'])
    expect(planChanges([change(path)])).toMatchObject({ scope: 'full', full: true, data: false });
});

it('#659 a high-risk pull request launches full Playwright even when the legacy cap is false', () => {
  expect(allowFullBrowser(pr)).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'true' })).toBe(true);
  expect(allowFullBrowser(mainPush)).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'schedule', CI_E2E_FULL: 'true' })).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'workflow_dispatch', CI_E2E_FULL: 'true' })).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'false' })).toBe(true);
  const full = planChanges([change('src/domain/realCost.ts')]);
  const selected = applyBrowserPolicy(full, pr);
  expect(selected).toMatchObject({ scope: 'full', full: true, data: false, browser: 'full' });
  expect(testCommand(selected, 'unit').args).toEqual(['vitest', 'run']);
  expect(testCommand(selected, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  const mixed = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts'), change('src/domain/formatTime.ts'), change('src/app/Layout.tsx')]), pr);
  expect(mixed.full).toBe(true);
  expect(mixed.browser).toBe('full');
  expect(testCommand(mixed, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(testCommand(applyBrowserPolicy(full, mainPush), 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(applyBrowserPolicy(selected, pr)).toEqual(selected);
  const maintenance = applyBrowserPolicy(planChanges([change('docs/design/small.md')]), pr);
  expect(PR_CORE_SMOKE_E2E).toEqual(GATE_CORE_SMOKE_E2E);
  expect(maintenance.e2e).toEqual(GATE_CORE_SMOKE_E2E);
  expect(() => validatePlan({ ...maintenance, e2e: [] })).toThrow(/Invalid CI validation plan/);
});

it('#659 real CLI retains the full high-risk suite on PR, main, nightly, and manual events', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pr-browser-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const commit = (path: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), 'fixture');
    git('add', '.');
    git('-c', 'user.name=PR browser', '-c', 'user.email=pr-browser@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    const base = commit('docs/readme.md');
    commit('src/domain/buildSim.ts');
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
          CI_E2E_FULL: eventName === 'pull_request' ? 'false' : 'true',
        },
      });
      const plan = JSON.parse(readFileSync(join(directory, 'ci-plan.json'), 'utf8'));
      expect(JSON.parse(readFileSync(join(directory, 'ci-scope.json'), 'utf8')).scope).toBe(plan.scope);
      return { plan, output: readFileSync(join(directory, 'outputs'), 'utf8') };
    };
    const pull = inspect('pull_request', 'refs/pull/514/merge');
    expect(pull.plan).toMatchObject({ scope: 'full', full: true, data: false, browser: 'full', features: ['all'] });
    expect(pull.output).toContain('browser=true');
    expect(pull.output).toContain('e2e_full=true');
    expect(testCommand(pull.plan, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
    const forced = inspect('pull_request', 'refs/pull/514/merge', 'true');
    expect(forced.plan).toMatchObject({ scope: 'full', full: true, data: true, browser: 'full' });
    for (const [eventName, ref] of [
      ['push', 'refs/heads/main'],
      ['push', 'refs/heads/release/v0.74.0'],
      ['schedule', 'refs/heads/main'],
      ['workflow_dispatch', 'refs/heads/main'],
    ] as const) {
      const run = inspect(eventName, ref, eventName === 'push' ? 'false' : 'true');
      expect(run.plan).toMatchObject({ scope: 'full', full: true, browser: 'full' });
      expect(run.output).toContain('e2e_full=true');
      expect(testCommand(run.plan, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
    }
    expect(inspect('schedule', 'refs/heads/main', 'true').plan.data).toBe(true);
    expect(inspect('workflow_dispatch', 'refs/heads/main', 'true').plan.data).toBe(true);
    expect(inspect('push', 'refs/heads/main', 'false').plan.data).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
