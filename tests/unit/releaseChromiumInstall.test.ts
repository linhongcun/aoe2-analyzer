import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules
import { applyBrowserPolicy, planChanges, unitLaunchesChromium } from '../../scripts/ci-scope.mjs';
// @ts-expect-error CI scripts are plain Node modules
import { testCommand } from '../../scripts/ci-run.mjs';

const pr = { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' };
const change = (path: string) => ({ path });
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const installIf =
  "github.event_name != 'pull_request' || steps.scope.outputs.browser == 'true' || (steps.reuse.outputs.reused != 'true' && steps.scope.outputs.unit_chromium == 'true')";

function stepBody(name: string) {
  const body = workflow.match(new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n {6}- )`))?.[1];
  if (!body) throw new Error(`Missing workflow step: ${name}`);
  return body;
}

it('a docs pull request keeps browser none but still launches chromium from release unit tests', () => {
  const plan = applyBrowserPolicy(planChanges([change('docs/design/README.md')]), pr);
  expect(plan).toMatchObject({ scope: 'maintenance', full: false, browser: 'none', e2e: [], data: false });
  expect(plan.unit).toEqual(['tests/unit/release*.test.ts']);
  expect(unitLaunchesChromium(plan)).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/release108.test.ts'] })).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/releaseSmoke.test.ts'] })).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/release134.test.ts'] })).toBe(false);
  const unit = testCommand(plan, 'unit');
  expect(unit?.args.slice(0, 2)).toEqual(['vitest', 'run']);
  expect(unit?.args).toContain('tests/unit/release108.test.ts');
  expect(unit?.args).toContain('tests/unit/releaseSmoke.test.ts');
  expect(testCommand(plan, 'e2e')).toBeNull();
});

it('a unit-only targeted plan that never launches chromium stays unmarked', () => {
  const plan = applyBrowserPolicy(planChanges([change('tests/unit/buildSim.test.ts')]), pr);
  expect(plan).toMatchObject({ scope: 'targeted', browser: 'none', e2e: [] });
  expect(plan.unit).toEqual(['tests/unit/buildSim.test.ts']);
  expect(unitLaunchesChromium(plan)).toBe(false);
  expect(testCommand(plan, 'unit').args).not.toContain('tests/unit/release108.test.ts');
});

it('policy plus a non-release unit test still needs chromium and does not open e2e', () => {
  const plan = applyBrowserPolicy(planChanges([change('scripts/ci-scope.mjs'), change('tests/unit/buildSim.test.ts')]), pr);
  expect(plan.scope).toBe('targeted');
  expect(plan.browser).toBe('none');
  expect(plan.e2e).toEqual([]);
  expect(plan.unit).toContain('tests/unit/release*.test.ts');
  expect(plan.unit).toContain('tests/unit/buildSim.test.ts');
  expect(unitLaunchesChromium(plan)).toBe(true);
});

it('full and feature plans launch chromium through the unit suite without using this flag as the e2e switch', () => {
  const full = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts')]), pr);
  expect(full).toMatchObject({ scope: 'full', full: true, browser: 'capped' });
  expect(full.unit).toEqual([]);
  expect(unitLaunchesChromium(full)).toBe(true);
  expect(testCommand(full, 'unit').args).toEqual(['vitest', 'run']);
  const clock = applyBrowserPolicy(planChanges([change('src/domain/formatTime.ts')]), pr);
  expect(clock.browser).toBe('capped');
  expect(unitLaunchesChromium(clock)).toBe(false);
});

it('the unit install reuses the e2e chromium command and does not turn OG, e2e, or short smoke back on', () => {
  for (const name of ['Use Ubuntu public package mirror', 'Cache Playwright browsers', 'Install Playwright chromium'])
    expect(stepBody(name)).toContain(`if: ${installIf}`);
  expect(stepBody('Install Playwright chromium')).toContain('run: npx playwright install --with-deps chromium');
  expect(stepBody('Affected browser checks')).toContain("if: steps.reuse.outputs.reused != 'true' && steps.scope.outputs.browser == 'true'");
  expect(stepBody('Affected browser checks')).not.toContain('unit_chromium');
  expect(workflow).toContain("CI_SKIP_PLAYWRIGHT: ${{ github.event_name == 'pull_request' && steps.scope.outputs.browser != 'true' && '1' || '0' }}");
  expect(stepBody('Short check of the actual build')).toContain("(github.event_name != 'pull_request' || steps.scope.outputs.browser == 'true')");
  expect(stepBody('Short check of the actual build')).not.toContain('unit_chromium');
});

it('the scope CLI reports unit_chromium for a docs pull request and not for a unit-only plan', () => {
  const directory = mkdtempSync(join(tmpdir(), 'unit-chromium-'));
  const repo = join(directory, 'repo');
  mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = (path: string, content: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
    git('add', path);
    git('-c', 'user.name=Unit chromium', '-c', 'user.email=unit-chromium@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    const base = commit('docs/guide.md', 'guide');
    const docsHead = commit('docs/guide.md', 'guide changed');
    const entry = join(process.cwd(), 'scripts/ci-scope.mjs');
    const inspect = (head: string, eventName: string, baseSha = base) => {
      writeFileSync(join(directory, 'event.json'), JSON.stringify({ before: baseSha, pull_request: { base: { sha: baseSha } } }));
      writeFileSync(join(directory, 'outputs'), '');
      git('checkout', '-q', head);
      execFileSync(process.execPath, [entry], {
        cwd: repo,
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_EVENT_PATH: join(directory, 'event.json'),
          GITHUB_EVENT_NAME: eventName,
          GITHUB_REF: eventName === 'pull_request' ? 'refs/pull/608/merge' : 'refs/heads/main',
          GITHUB_OUTPUT: join(directory, 'outputs'),
          CI_FULL: 'false',
          CI_E2E_FULL: eventName === 'pull_request' ? 'false' : 'true',
        },
      });
      return { plan: JSON.parse(readFileSync(join(directory, 'ci-plan.json'), 'utf8')), output: readFileSync(join(directory, 'outputs'), 'utf8') };
    };
    const docs = inspect(docsHead, 'pull_request');
    expect(docs.plan).toMatchObject({ scope: 'maintenance', browser: 'none', full: false });
    expect(docs.output).toContain('browser=false');
    expect(docs.output).toContain('unit_chromium=true');
    expect(docs.output).toContain('e2e_full=false');
    const unitHead = commit('tests/unit/buildSim.test.ts', 'unit only');
    const unitOnly = inspect(unitHead, 'pull_request', docsHead);
    expect(unitOnly.plan).toMatchObject({ scope: 'targeted', browser: 'none' });
    expect(unitOnly.plan.unit).toEqual(['tests/unit/buildSim.test.ts']);
    expect(unitOnly.output).toContain('browser=false');
    expect(unitOnly.output).toContain('unit_chromium=false');
    const pushed = inspect(docsHead, 'push');
    expect(pushed.plan).toMatchObject({ scope: 'maintenance', browser: 'none' });
    expect(pushed.output).toContain('browser=false');
    expect(pushed.output).toContain('unit_chromium=true');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
