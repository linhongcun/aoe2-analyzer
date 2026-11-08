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
const installIf = "needs.plan.outputs.unit_chromium == 'true'";

function jobBody(name: string) {
  const body = workflow.match(new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}[a-z-]+:|$(?![\\s\\S]))`, 'm'))?.[1];
  if (!body) throw new Error(`Missing workflow job: ${name}`);
  return body;
}

function stepBody(job: string, name: string) {
  const body = jobBody(job).match(new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n {6}- |$(?![\\s\\S]))`))?.[1];
  if (!body) throw new Error(`Missing workflow step: ${job}/${name}`);
  return body;
}

it('#659 a docs pull request requires site smoke and Chromium from its actual release unit tests', () => {
  const plan = applyBrowserPolicy(planChanges([change('docs/design/README.md')]), pr);
  expect(plan).toMatchObject({ scope: 'maintenance', full: false, browser: 'capped', e2e: ['tests/e2e/smoke.spec.ts'], data: false });
  expect(plan.unit).toEqual(['tests/unit/release*.test.ts']);
  expect(unitLaunchesChromium(plan)).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/release108.test.ts'] })).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/releaseSmoke.test.ts'] })).toBe(true);
  expect(unitLaunchesChromium({ full: false, unit: ['tests/unit/release134.test.ts'] })).toBe(false);
  const unit = testCommand(plan, 'unit');
  expect(unit?.args.slice(0, 2)).toEqual(['vitest', 'run']);
  expect(unit?.args).toContain('tests/unit/release108.test.ts');
  expect(unit?.args).toContain('tests/unit/releaseSmoke.test.ts');
  expect(testCommand(plan, 'e2e').args).toEqual(['playwright', 'test', 'tests/e2e/smoke.spec.ts', '--reporter=line']);
});

it('#659 a unit-only targeted plan keeps site smoke while its unit suite stays unmarked', () => {
  const plan = applyBrowserPolicy(planChanges([change('tests/unit/buildSim.test.ts')]), pr);
  expect(plan).toMatchObject({ scope: 'targeted', browser: 'capped', e2e: ['tests/e2e/smoke.spec.ts'] });
  expect(plan.unit).toEqual(['tests/unit/buildSim.test.ts']);
  expect(unitLaunchesChromium(plan)).toBe(false);
  expect(testCommand(plan, 'unit').args).not.toContain('tests/unit/release108.test.ts');
});

it('#659 CI policy itself needs full unit and browser validation on a PR', () => {
  const plan = applyBrowserPolicy(planChanges([change('scripts/ci-scope.mjs'), change('tests/unit/buildSim.test.ts')]), pr);
  expect(plan).toMatchObject({ scope: 'full', full: true, browser: 'full', data: false });
  expect(testCommand(plan, 'unit').args).toEqual(['vitest', 'run']);
  expect(testCommand(plan, 'e2e').args).toEqual(['playwright', 'test', '--reporter=line']);
  expect(unitLaunchesChromium(plan)).toBe(true);
});

it('full and feature plans launch chromium through the unit suite without using this flag as the e2e switch', () => {
  const full = applyBrowserPolicy(planChanges([change('src/domain/realCost.ts')]), pr);
  expect(full).toMatchObject({ scope: 'full', full: true, browser: 'full' });
  expect(full.unit).toEqual([]);
  expect(unitLaunchesChromium(full)).toBe(true);
  expect(testCommand(full, 'unit').args).toEqual(['vitest', 'run']);
  const home = applyBrowserPolicy(planChanges([change('src/domain/startGame.ts')]), pr);
  expect(home.browser).toBe('capped');
  expect(unitLaunchesChromium(home)).toBe(false);
});

it('#659 only the unit install uses unit_chromium; build smoke and browser workers install independently', () => {
  for (const name of ['Cache Playwright browsers', 'Install Playwright chromium under shared deadline'])
    expect(stepBody('unit', name)).toContain(`if: ${installIf}`);
  expect(stepBody('unit', 'Install Playwright chromium under shared deadline')).toContain('run: node scripts/ci-stage.mjs install-browser');
  for (const job of ['build', 'browser']) {
    expect(jobBody(job)).not.toContain('unit_chromium');
    expect(stepBody(job, 'Cache Playwright browsers')).not.toContain('if:');
    expect(stepBody(job, 'Install Playwright chromium under shared deadline')).toContain('run: node scripts/ci-stage.mjs install-browser');
    expect(stepBody(job, 'Install Playwright chromium under shared deadline')).not.toContain('if:');
  }
  expect(jobBody('build')).not.toContain('if: needs.plan.outputs');
  expect(jobBody('browser')).toContain("if: needs.plan.outputs.browser != '[]'");
  expect(workflow).not.toContain('CI_SKIP_PLAYWRIGHT');
});

it('#749 the scope CLI does not schedule unit chromium for an ordinary docs or unit-only change', () => {
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
    expect(docs.plan).toMatchObject({ scope: 'gate', browser: 'gate', full: false, data: false, unit: [] });
    expect(docs.output).toContain('browser=true');
    expect(docs.output).toContain('unit_chromium=false');
    expect(docs.output).toContain('e2e_full=false');
    const unitHead = commit('tests/unit/buildSim.test.ts', 'unit only');
    const unitOnly = inspect(unitHead, 'pull_request', docsHead);
    expect(unitOnly.plan).toMatchObject({ scope: 'gate', browser: 'gate', unit: [] });
    expect(unitOnly.output).toContain('browser=true');
    expect(unitOnly.output).toContain('unit_chromium=false');
    const pushed = inspect(docsHead, 'push');
    expect(pushed.plan).toMatchObject({ scope: 'gate', browser: 'gate' });
    expect(pushed.output).toContain('browser=true');
    expect(pushed.output).toContain('unit_chromium=false');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
