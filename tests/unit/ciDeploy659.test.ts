import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI modules are plain Node JavaScript.
import { createBudget, createDiagnosticBudget } from '../../scripts/ci-budget.mjs';
// @ts-expect-error CI modules are plain Node JavaScript.
import { deployPages, loadExpectedPublished, validateExpectedPublished } from '../../scripts/ci-deploy.mjs';

const ORIGIN = Date.parse('2026-11-03T00:00:00Z');
const DEADLINE = ORIGIN + 30 * 60_000;
const SHA = 'a'.repeat(40);
const iso = (offset: number) => new Date(ORIGIN + offset).toISOString();
const env = {
  GITHUB_REPOSITORY: 'owner/site',
  GITHUB_REPOSITORY_ID: '7',
  GITHUB_RUN_ID: '51',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: SHA,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GH_TOKEN: 'configured-github-secret',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runtime-oidc-secret',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run-actions-1.actions.githubusercontent.com/idtoken?api-version=2.0',
};

function publishedFixture(overrides: Record<string, unknown> = {}) {
  const manifest = {
    schema: 1,
    commit: SHA,
    tree: 'c'.repeat(40),
    version: 'v0.77.1',
    repository: 'owner/site',
    runId: 51,
    runAttempt: 2,
    buildJobId: 70,
    toolchainDigest: 'd'.repeat(64),
    gate_ref: `ci-v2:owner/site:51:2:${'e'.repeat(64)}:test`,
    files: { 'index.html': 'f'.repeat(64) },
    ...overrides,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  return {
    manifestBytes,
    snapshot: {
      commit: manifest.commit,
      tree: manifest.tree,
      run_id: manifest.runId,
      run_attempt: manifest.runAttempt,
      build_job_id: manifest.buildJobId,
      gate_ref: manifest.gate_ref,
      manifest_digest: createHash('sha256').update(manifestBytes).digest('hex'),
    },
  };
}

function fixture(options: Record<string, unknown> = {}) {
  let clock = ORIGIN + 5 * 60_000;
  const calls: { url: string; method: string; body?: Record<string, unknown>; authorization?: string }[] = [];
  const logs: string[] = [];
  const diagnosticBudgets: { kind: string; originMs: number; deadlineMs: number }[] = [];
  const run = {
    id: 51,
    run_attempt: 2,
    repository: { id: 7, full_name: 'owner/site' },
    head_sha: SHA,
    head_branch: 'main',
    event: 'push',
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    status: 'in_progress',
    conclusion: null,
    created_at: iso(0),
    run_started_at: iso(1000),
  };
  const job = {
    id: 71,
    name: 'test',
    run_id: 51,
    run_attempt: 2,
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    started_at: iso(2000),
    completed_at: iso(4 * 60_000),
  };
  const artifact = {
    id: 81,
    name: 'github-pages',
    expired: false,
    size_in_bytes: 1000,
    digest: 'sha256:' + 'b'.repeat(64),
    created_at: iso(3 * 60_000),
    updated_at: iso(3.5 * 60_000),
    expires_at: iso(24 * 60 * 60_000),
    workflow_run: { id: 51, repository_id: 7, head_repository_id: 7, head_sha: SHA, head_branch: 'main' },
  };
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    repository: 'owner/site',
    repository_id: '7',
    run_id: '51',
    run_attempt: '2',
    sha: SHA,
    ref: 'refs/heads/main',
    event_name: 'push',
    exp: Math.floor((ORIGIN + 60 * 60_000) / 1000),
  };
  if (options.staleArtifact) artifact.created_at = iso(500);
  if (options.wrongArtifactRun) artifact.workflow_run.id = 50;
  if (options.wrongArtifactSHA) artifact.workflow_run.head_sha = 'c'.repeat(40);
  if (options.expiredArtifact) artifact.expired = true;
  if (options.badDigest) artifact.digest = 'sha256:bad';
  if (options.failedGate) job.conclusion = 'failure';
  if (options.oldGateAttempt) job.run_attempt = 1;
  if (options.wrongOIDC) claims.run_attempt = '1';
  if (options.resetEpoch) run.created_at = iso(1000);
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  let polls = 0;
  let publicChecks = 0;
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input),
      parsed = new URL(url),
      method = init.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: (init.headers as Record<string, string>)?.Authorization,
    });
    if (parsed.origin === 'https://owner.github.io' && parsed.pathname.endsWith('/build-evidence.json')) {
      publicChecks++;
      if (options.public404Once && publicChecks === 1) return respond({}, 404);
      const overrides =
        options.publicWrongSHA || (options.publicStaleOnce && publicChecks === 1) ? { commit: '0'.repeat(40) } : options.publicWrongRun ? { runId: 50 } : {};
      const response = new Response(publishedFixture(overrides).manifestBytes);
      if (options.publicLateBody || options.publicBodyAfterWindow) {
        const read = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          const result = await read();
          clock = options.publicLateBody ? DEADLINE + 1 : clock + 61_000;
          return result;
        };
      }
      return response;
    }
    if (parsed.pathname.endsWith('/cancel')) {
      if (options.cancelFailure) return respond({}, 500);
      return new Response(null, { status: 204 });
    }
    if (url === env.ACTIONS_ID_TOKEN_REQUEST_URL) return respond({ value: token });
    if (parsed.pathname === '/repos/owner/site/actions/runs/51') return respond(run);
    if (parsed.pathname === '/repos/owner/site/actions/runs/51/attempts/2') return respond(run);
    if (parsed.pathname.endsWith('/jobs')) return respond({ total_count: 1, jobs: [job] });
    if (parsed.pathname.endsWith('/artifacts'))
      return respond({
        total_count: options.duplicateArtifact ? 2 : 1,
        artifacts: options.duplicateArtifact ? [artifact, { ...artifact, id: 82 }] : [artifact],
      });
    if (parsed.pathname === '/repos/owner/site/pages/deployments' && method === 'POST') {
      if (options.lateCreate) clock = DEADLINE + 1;
      return respond({ id: 91, page_url: 'https://owner.github.io/site/' });
    }
    if (parsed.pathname === '/repos/owner/site/pages/deployments/91') {
      polls++;
      if (options.pollFailure) throw new Error('Network failure with a secret detail that must not be logged');
      if (options.lateSuccess) clock = DEADLINE + 1;
      return respond({ status: options.terminalStatus ?? (options.pending || polls === 1 ? 'queued' : 'succeed') });
    }
    throw new Error('Unexpected fixture request ' + parsed.pathname);
  };
  const budget = createBudget({ originMs: ORIGIN, runId: 51, runAttempt: 2, now: () => clock, fetchImpl });
  const diagnostic = (validation: unknown) => {
    const result = createDiagnosticBudget(validation, { now: () => clock, fetchImpl });
    diagnosticBudgets.push(result);
    return result;
  };
  const pause = async () => {
    clock += options.expireDuringPoll ? 26 * 60_000 : 1;
  };
  return {
    args: { env, budget, now: () => clock, pause, createDiagnosticBudgetImpl: diagnostic, log: (message: string) => logs.push(message), pollIntervalMs: 1 },
    calls,
    logs,
    token,
    diagnosticBudgets,
    expire: () => {
      clock = DEADLINE;
    },
    publishCalls: () => calls.filter((call) => call.method === 'POST' && call.url.endsWith('/pages/deployments')),
    cancelCalls: () => calls.filter((call) => call.url.endsWith('/cancel')),
    publicCalls: () => calls.filter((call) => call.url.startsWith('https://owner.github.io/')),
  };
}

describe('#659 budgeted native Pages publication', () => {
  it('uses exact current artifact, actual Pages REST payload and runtime OIDC, then reports only succeed', async () => {
    const test = fixture();
    await expect(deployPages(test.args)).resolves.toEqual({ id: '91', page_url: 'https://owner.github.io/site/', status: 'succeed', artifact_id: 81 });
    expect(test.publishCalls()).toHaveLength(1);
    expect(test.publishCalls()[0]!.body).toEqual({ artifact_id: 81, pages_build_version: SHA, oidc_token: test.token });
    expect(test.calls.find((call) => call.url === env.ACTIONS_ID_TOKEN_REQUEST_URL)?.authorization).toBe('Bearer runtime-oidc-secret');
    expect(test.cancelCalls()).toHaveLength(0);
    expect(test.logs.join('\n')).not.toContain(test.token);
    expect(test.logs.join('\n')).not.toContain(env.GH_TOKEN);
    expect(test.logs.join('\n')).not.toContain(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
  });

  it.each([
    'staleArtifact',
    'wrongArtifactRun',
    'wrongArtifactSHA',
    'expiredArtifact',
    'badDigest',
    'duplicateArtifact',
    'failedGate',
    'oldGateAttempt',
    'resetEpoch',
  ])('%s cannot publish', async (option) => {
    const test = fixture({ [option]: true });
    await expect(deployPages(test.args)).rejects.toThrow();
    expect(test.publishCalls()).toHaveLength(0);
    expect(test.cancelCalls()).toHaveLength(0);
  });

  it('rejects the wrong OIDC attempt before POST and never prints token values', async () => {
    const test = fixture({ wrongOIDC: true });
    await expect(deployPages(test.args)).rejects.toThrow('Runtime OIDC token belongs to another');
    expect(test.publishCalls()).toHaveLength(0);
    expect(test.logs.join('\n')).not.toContain(test.token);
  });

  it.each(['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'GH_TOKEN'])('missing %s fails before API calls', async (key) => {
    const test = fixture();
    await expect(deployPages({ ...test.args, env: { ...env, [key]: '' } })).rejects.toThrow();
    expect(test.calls).toHaveLength(0);
  });

  it.each([
    { GITHUB_API_URL: 'https://example.com' },
    { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com/idtoken' },
    { GITHUB_REF: 'refs/pull/12/merge', GITHUB_EVENT_NAME: 'pull_request' },
  ])('does not send credentials to an untrusted origin or deploy a pull request', async (override) => {
    const test = fixture();
    await expect(deployPages({ ...test.args, env: { ...env, ...override } })).rejects.toThrow();
    expect(test.calls).toHaveLength(0);
  });

  it('deployment queued past the original deadline cannot create a new publication', async () => {
    const test = fixture();
    test.expire();
    await expect(deployPages(test.args)).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
    expect(test.calls).toHaveLength(0);
  });

  it.each(['lateSuccess', 'expireDuringPoll'])('%s fails instead of accepting a late success and cancels with diagnostic time only', async (option) => {
    const test = fixture({ [option]: true });
    await expect(deployPages(test.args)).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED', deploymentCancellation: { attempted: true, confirmed: true } });
    expect(test.cancelCalls()[0]?.url).toContain('/91/cancel');
    expect(test.diagnosticBudgets).toHaveLength(1);
    const diagnostic = test.diagnosticBudgets[0]!;
    expect(diagnostic.kind).toBe('diagnostic');
    expect(diagnostic.deadlineMs).toBeLessThanOrEqual(DEADLINE + 90_000);
    expect(diagnostic.deadlineMs - diagnostic.originMs).toBeLessThanOrEqual(90_000);
    expect(test.logs.join('\n')).not.toContain('completed within');
  });

  it('a POST accepted after expiry still fails and requests cancellation using official build-version fallback', async () => {
    const test = fixture({ lateCreate: true });
    await expect(deployPages(test.args)).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
    expect(test.cancelCalls()[0]?.url).toContain('/' + SHA + '/cancel');
  });

  it.each(['pollFailure', 'terminalStatus'])('%s cannot turn cleanup into a successful publish', async (option) => {
    const test = fixture({ [option]: option === 'terminalStatus' ? 'deployment_content_failed' : true });
    await expect(deployPages(test.args)).rejects.toThrow();
    expect(test.cancelCalls()).toHaveLength(1);
    expect(test.logs.join('\n')).not.toContain('secret detail');
    expect(test.logs.join('\n')).not.toContain('completed within');
  });

  it('failed diagnostic cancellation preserves the deployment failure', async () => {
    const test = fixture({ pollFailure: true, cancelFailure: true });
    await expect(deployPages(test.args)).rejects.toMatchObject({ deploymentCancellation: { attempted: true, confirmed: false } });
    expect(test.logs.join('\n')).toContain('validation remains failed');
  });

  it.each(['publicStaleOnce', 'public404Once'])('%s polls the cache-busted public manifest then verifies exact bytes before success', async (option) => {
    const test = fixture({ [option]: true });
    await expect(deployPages({ ...test.args, expectedPublished: publishedFixture(), identityWaitMs: 10 })).resolves.toMatchObject({ status: 'succeed' });
    expect(test.publicCalls()).toHaveLength(2);
    expect(test.publicCalls()[0]!.url).not.toBe(test.publicCalls()[1]!.url);
    expect(test.publicCalls().every((call) => call.authorization === undefined)).toBe(true);
    expect(test.logs.indexOf('Published build identity matches the exact current snapshot bytes')).toBeLessThan(
      test.logs.indexOf('Pages deployment completed within the shared workflow deadline'),
    );
  });

  it.each(['publicWrongSHA', 'publicWrongRun'])('%s cannot turn a native Pages succeed into a green deploy', async (option) => {
    const test = fixture({ [option]: true });
    await expect(deployPages({ ...test.args, expectedPublished: publishedFixture(), identityWaitMs: 5 })).rejects.toMatchObject({
      code: 'CI_PAGES_IDENTITY_TIMEOUT',
      deploymentCancellation: { attempted: true },
    });
    expect(test.publicCalls().length).toBeGreaterThan(0);
    expect(test.cancelCalls()).toHaveLength(1);
    expect(test.logs).not.toContain('Pages deployment completed within the shared workflow deadline');
  });

  it.each(['publicLateBody', 'publicBodyAfterWindow'])('%s fails the final published-identity deadline check and cancels', async (option) => {
    const test = fixture({ [option]: true });
    await expect(deployPages({ ...test.args, expectedPublished: publishedFixture() })).rejects.toMatchObject({
      code: option === 'publicLateBody' ? 'CI_DEADLINE_EXCEEDED' : 'CI_PAGES_IDENTITY_TIMEOUT',
      deploymentCancellation: { attempted: true },
    });
    expect(test.logs).not.toContain('Pages deployment completed within the shared workflow deadline');
  });

  it.each([{ commit: '0'.repeat(40) }, { runId: 50 }, { runAttempt: 1 }, { repository: 'other/site' }, { gate_ref: 'ci-v2:stale' }])(
    'invalid local snapshot/manifest identity cannot publish',
    async (overrides) => {
      const test = fixture();
      await expect(deployPages({ ...test.args, expectedPublished: publishedFixture(overrides) })).rejects.toThrow();
      expect(test.publishCalls()).toHaveLength(0);
    },
  );

  it('requires the local manifest byte digest to equal the frozen snapshot', () => {
    const expected = publishedFixture();
    expected.manifestBytes = Buffer.concat([expected.manifestBytes, Buffer.from(' ')]);
    expect(() => validateExpectedPublished(expected, env)).toThrow('Expected snapshot');
  });

  it('production snapshot loader requires downloaded regular files and validates their current identity', () => {
    const test = fixture(),
      folder = mkdtempSync(join(tmpdir(), 'ci-deploy-659-'));
    const build = join(folder, 'ci-build'),
      dist = join(build, 'dist');
    try {
      expect(() => loadExpectedPublished({ ...env, RUNNER_TEMP: folder }, test.args.budget)).toThrow('snapshot');
      mkdirSync(dist, { recursive: true });
      const expected = publishedFixture();
      writeFileSync(join(build, 'snapshot.json'), JSON.stringify(expected.snapshot));
      writeFileSync(join(dist, 'build-evidence.json'), expected.manifestBytes);
      expect(loadExpectedPublished({ ...env, RUNNER_TEMP: folder }, test.args.budget).digest).toBe(expected.snapshot.manifest_digest);
      rmSync(join(dist, 'build-evidence.json'));
      writeFileSync(join(folder, 'outside.json'), expected.manifestBytes);
      symlinkSync(join(folder, 'outside.json'), join(dist, 'build-evidence.json'));
      expect(() => loadExpectedPublished({ ...env, RUNNER_TEMP: folder }, test.args.budget)).toThrow('bounded regular file');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
