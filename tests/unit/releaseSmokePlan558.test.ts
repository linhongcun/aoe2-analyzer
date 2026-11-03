import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Release infrastructure is a plain Node module.
import { validateSmokeBaselineRelease } from '../../scripts/prepare-release.mjs';

const repository = 'linhongcun/aoe2-analyzer';
const targetVersion = 'v0.74.14';
const script = resolve('scripts/prepare-release.mjs');
const scopeScript = resolve('scripts/ci-scope.mjs');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const formal = (tag = 'v0.74.13', id = 13, published = '2026-11-02T01:00:00Z') => ({
  id,
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: published,
  url: `https://api.github.com/repos/${repository}/releases/${id}`,
  html_url: `https://github.com/${repository}/releases/tag/${tag}`,
});

function fixture(annotated = false, featureChanges = true) {
  const root = mkdtempSync(join(tmpdir(), 'release-smoke-558-'));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (path: string, value: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = (message: string) => {
    git('add', '.');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  git('config', 'user.name', 'Release Fixture');
  git('config', 'user.email', 'fixture@example.test');
  put('package.json', JSON.stringify({ version: '0.74.13' }));
  put('src/features/compare/components/Compare.tsx', 'old compare');
  const base = commit('formal .13');
  if (annotated) git('tag', '-a', 'v0.74.13', '-m', 'formal .13');
  else git('tag', 'v0.74.13');
  put('package.json', JSON.stringify({ version: '0.74.14' }));
  if (featureChanges) {
    put('src/features/teamFit/TeamFit.tsx', 'new team fit');
    put('src/shared/nav/pageRegistry.ts', 'new route');
  }
  const pending = commit('unpublished .14 feature');
  if (featureChanges) put('src/features/compare/components/Compare.tsx', 'guarded compare');
  else put('docs/release.md', 'maintenance release');
  const head = commit('incremental compare repair');
  const run = {
    id: 777,
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: head,
    head_repository: { full_name: repository },
  };
  const prefix = `repos/${repository}`;
  const api: Record<string, unknown> = {
    [`${prefix}/git/ref/heads/main`]: { object: { sha: head } },
    [`${prefix}/actions/runs/777`]: run,
    [`${prefix}/actions/runs/777/jobs?filter=latest&per_page=100`]: [
      { jobs: ['test', 'deploy'].map((name) => ({ name, status: 'completed', conclusion: 'success' })) },
    ],
    [`${prefix}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=${head}&per_page=100`]: [{ workflow_runs: [run] }],
    [`${prefix}/releases/latest`]: formal(),
    [`${prefix}/git/ref/tags/v0.74.13`]: {
      ref: 'refs/tags/v0.74.13',
      object: { type: annotated ? 'tag' : 'commit', sha: git('rev-parse', 'refs/tags/v0.74.13') },
    },
  };
  const bin = join(root, 'bin'),
    runner = join(root, 'runner');
  mkdirSync(bin);
  mkdirSync(runner);
  const fakeGh = join(bin, 'gh');
  writeFileSync(
    fakeGh,
    `#!/usr/bin/env node\nconst fs=require('node:fs');const data=JSON.parse(fs.readFileSync(process.env.FAKE_GH_DATA,'utf8'));const key=process.argv[3];if(process.argv[2]!=='api'||!Object.hasOwn(data,key)){console.error('gh: not found (HTTP 404)');process.exit(1);}process.stdout.write(JSON.stringify(data[key]));\n`,
  );
  chmodSync(fakeGh, 0o755);
  const incremental = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { planRange } from ${JSON.stringify('file://' + scopeScript)};console.log(JSON.stringify(planRange(${JSON.stringify(pending)},${JSON.stringify(head)})));`,
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  put('dist/build-evidence.json', JSON.stringify({ head, plan: incremental }));
  const manifest = readFileSync(join(root, 'dist/build-evidence.json'), 'utf8');
  const eventPath = join(root, 'event.json'),
    dataPath = join(root, 'api.json'),
    output = join(root, 'outputs');
  const event = { repository: { full_name: repository }, workflow_run: run };
  const env = {
    ...process.env,
    PATH: bin + ':' + process.env.PATH,
    FAKE_GH_DATA: dataPath,
    RUNNER_TEMP: runner,
    GITHUB_OUTPUT: output,
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: head,
    EXPECTED_DEPLOYED_SHA: head,
    EXPECTED_RELEASE_SHA: head,
  };
  const invoke = (manual = false, smokePlan = true) => {
    writeFileSync(dataPath, JSON.stringify(api));
    writeFileSync(eventPath, JSON.stringify(manual ? { repository: event.repository, inputs: { version: targetVersion } } : event));
    writeFileSync(output, '');
    return spawnSync(process.execPath, smokePlan ? [script, '--smoke-plan'] : [script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...env, GITHUB_EVENT_NAME: manual ? 'workflow_dispatch' : env.GITHUB_EVENT_NAME },
    });
  };
  return { root, git, put, api, event, env, invoke, base, head, prefix, manifest, planPath: join(runner, 'release-smoke-plan.json') };
}
function expectClosed(f: ReturnType<typeof fixture>, manual = false) {
  const result = f.invoke(manual);
  expect(result.status, result.stderr).not.toBe(0);
  expect(existsSync(f.planPath)).toBe(false);
  expect(readFileSync(join(f.root, 'dist/build-evidence.json'), 'utf8')).toBe(f.manifest);
}

describe('#558 cumulative release feature smoke from a real formal baseline', () => {
  it.each([false, true])('actual CLI peels the trusted tag and accumulates unpublished Team Fit plus Compare (annotated=%s)', (annotated) => {
    const f = fixture(annotated);
    const result = f.invoke();
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(f.planPath), 'Cumulative plan must be written separately from incremental deployment evidence').toBe(true);
    const output = JSON.parse(readFileSync(f.planPath, 'utf8'));
    expect(output).toMatchObject({
      purpose: 'cumulative-release-feature-smoke-only',
      repository,
      version: targetVersion,
      base: f.base,
      head: f.head,
      source_ci_run_id: 777,
    });
    expect(output.plan.features).toEqual(['all', 'compare', 'teamFit']);
    expect(JSON.parse(f.manifest).plan.features).toEqual(['compare']);
    expect(readFileSync(join(f.root, 'dist/build-evidence.json'), 'utf8')).toBe(f.manifest);
    expect(output.base_release.tag_object).toBe(f.git('rev-parse', 'refs/tags/v0.74.13'));
  });
  it('maintenance-only version/docs changes still produce a valid empty-feature smoke plan', () => {
    const f = fixture(false, false);
    const result = f.invoke();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(f.planPath, 'utf8')).plan).toMatchObject({ scope: 'maintenance', features: [], data: false });
    expect(readFileSync(join(f.root, 'dist/build-evidence.json'), 'utf8')).toBe(f.manifest);
  });
  it('ordinary prepare without the flag never accesses the extra release baseline', () => {
    const f = fixture();
    delete f.api[`${f.prefix}/releases/latest`];
    const result = f.invoke(false, false);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(f.planPath)).toBe(false);
  });
  it('manual resume of an already formal current version selects a strictly older most recently published formal release', () => {
    const f = fixture();
    const current = formal(targetVersion, 14, '2026-11-02T04:00:00Z');
    f.api[`${f.prefix}/releases/latest`] = current;
    f.api[`${f.prefix}/releases/tags/${targetVersion}`] = current;
    f.api[`${f.prefix}/releases?per_page=100`] = [[{ ...formal('v0.74.12', 12), draft: true }, { ...formal('v0.74.12', 11), prerelease: true }, formal()]];
    const result = f.invoke(true);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(f.planPath, 'utf8')).base).toBe(f.base);
  });
  it('manual same-version recovery with no older formal baseline fails instead of emitting head..head', () => {
    const f = fixture();
    const current = formal(targetVersion, 14);
    f.api[`${f.prefix}/releases/latest`] = current;
    f.api[`${f.prefix}/releases/tags/${targetVersion}`] = current;
    f.api[`${f.prefix}/releases?per_page=100`] = [[current]];
    expectClosed(f, true);
  });
  it.each(['draft', 'prerelease', 'published_at', 'id', 'tag_name', 'url', 'html_url'])('actual CLI rejects malformed or cross-repository latest.%s', (key) => {
    const f = fixture();
    const invalid: Record<string, unknown> = {
      draft: true,
      prerelease: true,
      published_at: null,
      id: 0,
      tag_name: 'vbad',
      url: 'https://api.github.com/repos/other/repo/releases/13',
      html_url: 'https://github.com/other/repo/releases/tag/v0.74.13',
    };
    f.api[`${f.prefix}/releases/latest`] = { ...formal(), [key]: invalid[key] };
    expectClosed(f);
  });
  it('actual CLI rejects a moved remote tag even when the replacement is another valid commit', () => {
    const f = fixture();
    f.api[`${f.prefix}/git/ref/tags/v0.74.13`] = { ref: 'refs/tags/v0.74.13', object: { type: 'commit', sha: f.head } };
    expectClosed(f);
  });
  it('actual CLI rejects a missing local tag', () => {
    const f = fixture();
    f.git('tag', '-d', 'v0.74.13');
    expectClosed(f);
  });
  it('actual CLI rejects a tag whose package version differs', () => {
    const f = fixture();
    f.git('tag', 'v0.74.12', f.base);
    f.api[`${f.prefix}/releases/latest`] = formal('v0.74.12', 12);
    f.api[`${f.prefix}/git/ref/tags/v0.74.12`] = { ref: 'refs/tags/v0.74.12', object: { type: 'commit', sha: f.base } };
    expectClosed(f);
  });
  it('actual CLI rejects a non-ancestor formal tag', () => {
    const f = fixture();
    f.git('checkout', '--orphan', 'unrelated');
    f.git('rm', '-rf', '.');
    f.put('package.json', JSON.stringify({ version: '0.74.13' }));
    f.git('add', 'package.json');
    f.git('commit', '-qm', 'unrelated baseline');
    const other = f.git('rev-parse', 'HEAD');
    f.git('tag', '-f', 'v0.74.13', other);
    f.git('checkout', '--detach', f.head);
    f.api[`${f.prefix}/git/ref/tags/v0.74.13`] = { ref: 'refs/tags/v0.74.13', object: { type: 'commit', sha: other } };
    expectClosed(f);
  });
  it('source/main/deployment checks still precede any smoke output', () => {
    const f = fixture();
    f.api[`${f.prefix}/actions/runs/777/jobs?filter=latest&per_page=100`] = [
      {
        jobs: [
          { name: 'test', status: 'completed', conclusion: 'success' },
          { name: 'deploy', status: 'completed', conclusion: 'skipped' },
        ],
      },
    ];
    expectClosed(f);
  });
  it('stale main cannot silently leave a successful smoke-plan invocation', () => {
    const f = fixture();
    f.api[`${f.prefix}/git/ref/heads/main`] = { object: { sha: f.base } };
    expectClosed(f);
  });
});

describe('#558 release smoke baseline trust and workflow contract', () => {
  it('baseline validation accepts only strict formal release metadata', () => {
    expect(validateSmokeBaselineRelease(formal(), repository)).toEqual(formal());
    expect(() => validateSmokeBaselineRelease({ ...formal(), published_at: 'not-a-date' }, repository)).toThrow();
  });
  it('plans only after npm ci and artifact verification and before tag/draft; original artifact packaging still verifies the same bytes', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    const install = workflow.indexOf('run: node scripts/ci-budget.mjs --run -- npm ci --legacy-peer-deps'),
      verify = workflow.indexOf('name: Verify deployed artifact identity and bytes'),
      plan = workflow.indexOf('name: Plan feature smoke from the previous formal release'),
      tag = workflow.indexOf('name: Verify deployment, tag and draft Release');
    expect(install).toBeLessThan(verify);
    expect(verify).toBeLessThan(plan);
    expect(plan).toBeLessThan(tag);
    expect(workflow.slice(plan, tag)).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('node scripts/prepare-release.mjs --smoke-plan');
    expect(workflow).toContain('node scripts/deployment-smoke.mjs --plan "$RUNNER_TEMP/release-smoke-plan.json"');
    expect(workflow).not.toContain('node scripts/deployment-smoke.mjs --plan dist/build-evidence.json');
    expect(workflow.match(/node scripts\/site-artifact.mjs --verify/g)).toHaveLength(2);
  });
});
