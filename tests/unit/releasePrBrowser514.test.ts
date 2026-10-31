import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { PR_CORE_SMOKE_E2E, allowFullBrowser, applyBrowserPolicy, planChanges } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { testCommand, validatePlan } from '../../scripts/ci-run.mjs';

const change = (path: string) => ({ path });
const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const mainPush = { GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'true', GITHUB_REF: 'refs/heads/main' };
const suite = readdirSync('tests/e2e').filter((name) => name.endsWith('.spec.ts')).length;

it('#514 display files stay targeted, while calculation and unaudited UI stay full', () => {
  const clock = planChanges([change('src/domain/formatTime.ts')]);
  expect(clock).toMatchObject({ scope: 'targeted', features: ['clock'], full: false, data: false });
  expect(clock.e2e).toEqual(['tests/e2e/timeFormat.spec.ts']);
  expect(planChanges([change('src/domain/dupNames.ts')])).toMatchObject({ features: ['names'], full: false });
  expect(planChanges([change('src/domain/linker.ts')])).toMatchObject({ features: ['links'], full: false });
  expect(planChanges([change('src/domain/sharePage.ts'), change('src/shared/ui/ShareImage.tsx')])).toMatchObject({
    features: ['share'],
    full: false,
  });
  expect(planChanges([change('src/features/share/PageMeta.tsx'), change('src/features/glossary/Glossary.tsx')])).toMatchObject({
    features: ['glossary', 'share'],
    full: false,
  });
  expect(planChanges([change('src/shared/ui/layout.tsx')])).toMatchObject({ scope: 'full', full: true, data: false });
  const feedback = planChanges([change('src/shared/ui/FeedbackLink.tsx'), change('src/shared/utils/feedback.ts')]);
  expect(feedback).toMatchObject({ scope: 'targeted', features: ['shell'], full: false });
  expect(feedback.unit).toContain('tests/unit/feedback.test.ts');
  expect(feedback.e2e).toContain('tests/e2e/feedbackTap295.spec.ts');
  for (const path of ['src/domain/realCost.ts', 'src/domain/gameClock.ts', 'src/shared/ui/widgets.tsx', 'src/features/home/components/Home.tsx'])
    expect(planChanges([change(path)])).toMatchObject({ scope: 'full', full: true, data: false });
});

it('#514 a pull request never launches the full Playwright suite, including when scope stays full', () => {
  expect(allowFullBrowser(pr)).toBe(false);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'true' })).toBe(false);
  expect(allowFullBrowser(mainPush)).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'schedule', CI_E2E_FULL: 'true' })).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'workflow_dispatch', CI_E2E_FULL: 'true' })).toBe(true);
  expect(allowFullBrowser({ GITHUB_EVENT_NAME: 'push', CI_E2E_FULL: 'false' })).toBe(false);
  const full = planChanges([change('src/domain/realCost.ts')]);
  const capped = applyBrowserPolicy(full, pr);
  expect(capped).toMatchObject({ scope: 'full', full: true, data: false, browser: 'capped' });
  expect(capped.e2e).toEqual(PR_CORE_SMOKE_E2E);
  expect(capped.e2e.length).toBeLessThan(10);
  expect(testCommand(capped, 'unit').args).toEqual(['vitest', 'run']);
  expect(testCommand(capped, 'e2e').args).toEqual(['playwright', 'test', ...capped.e2e, '--reporter=line']);
  expect(testCommand(capped, 'e2e').args).not.toEqual(['playwright', 'test', '--reporter=line']);
  const mixed = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts'), change('src/domain/formatTime.ts'), change('src/app/Layout.tsx')]), pr);
  expect(mixed.full).toBe(true);
  expect(mixed.browser).toBe('capped');
  expect(mixed.e2e).toContain('tests/e2e/smoke.spec.ts');
  expect(mixed.e2e).toContain('tests/e2e/timeFormat.spec.ts');
  expect(mixed.e2e).toContain('tests/e2e/navigation272.spec.ts');
  expect(mixed.e2e.length).toBeLessThan(suite / 2);
  expect(testCommand(applyBrowserPolicy(full, mainPush), 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(applyBrowserPolicy(capped, pr)).toEqual(capped);
  expect(() => validatePlan({ ...capped, e2e: [] })).toThrow(/Invalid CI validation plan/);
});

it('#514 real CLI caps pull_request browser and leaves main, nightly, and manual full on the complete suite', () => {
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
    expect(pull.plan).toMatchObject({ scope: 'full', full: true, data: false, browser: 'capped', features: ['all'] });
    expect(pull.plan.e2e).toEqual(['tests/e2e/smoke.spec.ts']);
    expect(pull.output).toContain('browser=true');
    expect(pull.output).toContain('e2e_full=false');
    expect(testCommand(pull.plan, 'e2e').args).toEqual(['playwright', 'test', 'tests/e2e/smoke.spec.ts', '--reporter=line']);
    const forced = inspect('pull_request', 'refs/pull/514/merge', 'true');
    expect(forced.plan).toMatchObject({ scope: 'full', full: true, data: true, browser: 'capped' });
    expect(forced.plan.e2e).toEqual(['tests/e2e/smoke.spec.ts']);
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
