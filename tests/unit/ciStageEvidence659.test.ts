import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs have no type declarations
import * as evidence from '../../scripts/ci-stage-evidence.mjs';
const {
  aggregateStageEvidence,
  canonicalSelection,
  createExecutedReceipt,
  findReusableStages,
  POLICY_FILES,
  policyDigest,
  selectionDigest,
  snapshotIdentity,
  stageArtifactName,
  toolchainDigest,
  noteAdvancedBase,
  validateStageEvidence,
} = evidence;

const repository = 'linhongcun/aoe2-analyzer';
const sha = (letter: string) => letter.repeat(40);
const digest = (letter: string) => letter.repeat(64);
const original = Date.parse('2026-11-03T12:00:00Z');
const origin = original + 3_600_000;
const now = origin + 600_000;
const iso = (value: number) => new Date(value).toISOString();
const clone = <T>(value: T): T => structuredClone(value);

function context(id = 200) {
  const start = id === 200 ? origin : original;
  const commit = sha(id === 200 ? 'b' : 'a');
  return {
    repository,
    repository_id: 5,
    run_id: id,
    run_attempt: 1,
    commit,
    tree: sha('c'),
    policy_digest: digest('d'),
    event: { name: 'push', sha: commit, head_repository: repository },
    epoch: { version: 1, kind: 'validation', origin_ms: start, deadline_ms: start + 1_800_000, source: 'github.run.created_at', run_id: id, run_attempt: 1 },
  };
}

function required(stage = 'unit') {
  const selection =
    stage === 'build'
      ? { checks: ['build', 'snapshot', 'fresh-build-smoke'], files: [], cases: [] }
      : stage.startsWith('browser-')
        ? { checks: [], files: ['tests/e2e/smoke.spec.ts'], cases: [{ id: 'route-' + stage, expectedStatus: 'passed' }] }
        : { checks: [stage], files: stage === 'unit' ? ['tests/unit/simulator.test.ts'] : [], cases: [] };
  return { stage_id: stage, job_name: stage, reusable: !['build', 'static-main'].includes(stage), selection, toolchain_digest: digest('e') };
}

function fixture(stage = 'unit', current = false) {
  const source = context(current ? 200 : 100);
  const start = source.epoch.origin_ms;
  const wanted = required(stage);
  const jobId = source.run_id * 10 + ['static', 'static-main', 'unit', 'data', 'build', 'browser-1', 'browser-2', 'browser-3', 'browser-4'].indexOf(stage) + 1;
  const snapshot = {
    commit: source.commit,
    tree: source.tree,
    run_id: source.run_id,
    run_attempt: 1,
    build_job_id: source.run_id * 10 + 5,
    manifest_digest: digest('f'),
    gate_ref: 'ci-v2-gate-' + source.run_id + '-1',
  };
  const receipt = createExecutedReceipt({
    current: source,
    required: wanted,
    job_id: jobId,
    finished_at: iso(start + 60_000),
    now: start + 61_000,
    execution: {
      checks: wanted.selection.checks,
      files: wanted.selection.files,
      cases: wanted.selection.cases.map((entry) => ({ id: entry.id, status: entry.expectedStatus })),
    },
    source_build: stage === 'build' || stage.startsWith('browser-') ? snapshot : null,
  });
  const run = {
    id: source.run_id,
    run_attempt: 1,
    name: 'CI / Deploy',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: current ? 'in_progress' : 'completed',
    conclusion: current ? null : 'success',
    created_at: iso(start),
    head_sha: source.commit,
    repository: { id: 5, full_name: repository },
    head_repository: { id: 5, full_name: repository },
  };
  const jobs = [
    {
      id: jobId,
      run_id: run.id,
      run_attempt: 1,
      head_sha: run.head_sha,
      name: stage,
      status: 'completed',
      conclusion: 'success',
      started_at: iso(start + 1000),
      completed_at: iso(start + 70_000),
    },
  ];
  const artifact = {
    id: jobId + 10_000,
    name: stageArtifactName(source.tree, stage),
    expired: false,
    size_in_bytes: 1000,
    digest: 'sha256:' + digest('a'),
    created_at: iso(start + 65_000),
    expires_at: iso(now + 86400_000),
    workflow_run: { id: run.id, head_sha: run.head_sha, repository_id: 5, head_repository_id: 5 },
  };
  const commit = { sha: source.commit, tree: { sha: source.tree }, parents: [] as { sha: string }[] };
  return { receipt, run, jobs, artifact, commit, archive_sha256: digest('a'), current: context(), required: wanted, mode: current ? 'current' : 'reuse', now };
}

function browserFixture(current = false) {
  return { ...fixture('browser-1', current), source_build_proof: fixture('build', current) };
}

function aggregateFixture(count = 1) {
  const requirements = ['static', 'static-main', 'unit', 'build', ...Array.from({ length: count }, (_, index) => 'browser-' + (index + 1))].map(required);
  const build = fixture('build', true);
  const proofs = Object.fromEntries(
    requirements.map((entry) => {
      const proof = fixture(entry.stage_id, true);
      return [entry.stage_id, entry.stage_id.startsWith('browser-') ? { ...proof, source_build_proof: build } : proof];
    }),
  );
  return {
    current: context(),
    requirements,
    proofs,
    snapshot: build.receipt.source_build,
    now,
    browserManifest: {
      allCases: requirements.flatMap((entry) => entry.selection.cases),
      shards: Array.from({ length: count }, (_, index) => ({ index: index + 1, cases: required('browser-' + (index + 1)).selection.cases })),
    },
  };
}

function fakeServer(proofs: ReturnType<typeof fixture>[]) {
  const calls: string[] = [];
  return {
    calls,
    async api(endpoint: string, options: { signal: AbortSignal }) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      calls.push(endpoint);
      if (endpoint.startsWith(`repos/${repository}/actions/artifacts?name=`)) {
        const name = new URLSearchParams(endpoint.split('?')[1]).get('name');
        return { artifacts: proofs.filter((proof) => proof.artifact.name === name).map((proof) => proof.artifact) };
      }
      for (const proof of proofs) {
        const prefix = `repos/${repository}/actions/runs/${proof.run.id}`;
        if (endpoint === prefix) return proof.run;
        if (endpoint === prefix + '/attempts/1/jobs?per_page=100')
          return { total_count: proofs.length, jobs: proofs.filter((item) => item.run.id === proof.run.id).flatMap((item) => item.jobs) };
        if (endpoint === prefix + '/artifacts?per_page=100')
          return { artifacts: proofs.filter((item) => item.run.id === proof.run.id).map((item) => item.artifact) };
        if (endpoint === `repos/${repository}/git/commits/${proof.commit.sha}`) return proof.commit;
      }
      throw new Error('Unknown endpoint: ' + endpoint);
    },
    async download(artifact: { id: number }) {
      const proof = proofs.find((item) => item.artifact.id === artifact.id);
      if (!proof) throw new Error('Unknown artifact');
      return { receipt: proof.receipt, archive_sha256: proof.archive_sha256 };
    },
  };
}

function budget(clock = () => now) {
  return {
    deadlineMs: origin + 1_800_000,
    remainingMs: () => origin + 1_800_000 - clock(),
    assertRemaining() {
      if (clock() >= this.deadlineMs) throw Object.assign(new Error('Deadline'), { code: 'CI_DEADLINE_EXCEEDED' });
    },
    signal: () => new AbortController().signal,
  };
}

describe('#659 exact executed selections and fingerprints', () => {
  it('canonicalizes sets while retaining declared skips', () => {
    const cases = [
      { id: 'z', expectedStatus: 'skipped' },
      { id: 'a', expectedStatus: 'passed' },
    ];
    expect(canonicalSelection({ checks: ['z', 'a'], cases })).toEqual({ checks: ['a', 'z'], files: [], cases: [...cases].reverse() });
    expect(selectionDigest({ checks: ['z', 'a'] })).toBe(selectionDigest({ checks: ['a', 'z'] }));
  });

  it.each([
    { checks: ['a', 'a'] },
    { files: ['tests/unit/*.test.ts'] },
    { files: ['../tests/unit/foo.test.ts'] },
    { cases: [{ id: 'a', expectedStatus: 'flaky' }] },
    { cases: [{ id: 'a', expectedStatus: 'failed' }] },
    {
      cases: [
        { id: 'a', expectedStatus: 'passed' },
        { id: 'a', expectedStatus: 'passed' },
      ],
    },
  ])('rejects ambiguous selection %j', (selection) => {
    expect(() => canonicalSelection(selection)).toThrow();
  });

  it('fingerprints every policy file and fails closed on missing or unlisted scripts', () => {
    const read = (path: string) => path;
    expect(policyDigest(read)).toBe(policyDigest(read));
    expect(policyDigest((path: string) => path + (path === 'scripts/ci-plan.mjs' ? 'changed' : ''))).not.toBe(policyDigest(read));
    expect(() =>
      policyDigest(() => {
        throw new Error('Missing');
      }),
    ).toThrow('Missing');
    expect(() => policyDigest(read, ['scripts/ci-unknown.mjs'])).toThrow('Unfingerprinted');
    expect(POLICY_FILES).toContain('scripts/ci-stage-evidence.mjs');
  });

  it('canonicalizes complete toolchain identities and rejects unspecified values', () => {
    expect(toolchainDigest({ node: '22.1', python: '3.12' })).toBe(toolchainDigest({ python: '3.12', node: '22.1' }));
    expect(toolchainDigest({ node: '22.2' })).not.toBe(toolchainDigest({ node: '22.1' }));
    expect(toolchainDigest({ pins: { node: '22.1' } })).not.toBe(toolchainDigest({ pins: [['node', '22.1']] }));
    expect(() => toolchainDigest({})).toThrow();
    expect(() => toolchainDigest({ node: undefined })).toThrow();
  });

  it.each(['dropped file', 'extra check', 'changed case', 'retry', 'flaky', 'negative retry'])('rejects actual execution mismatch: %s', (kind) => {
    const proof = fixture();
    if (kind === 'dropped file') proof.receipt.execution.files = [];
    if (kind === 'extra check') proof.receipt.execution.checks.push('invented');
    if (kind === 'changed case') proof.receipt.execution.cases.push({ id: 'invented', status: 'passed' });
    if (['retry', 'flaky', 'negative retry'].includes(kind)) {
      proof.receipt.selection.cases = [{ id: 'case', expectedStatus: 'passed' }];
      proof.receipt.selection_digest = selectionDigest(proof.receipt.selection);
      proof.receipt.execution.cases = [
        { id: 'case', status: 'passed', retry: kind === 'retry' ? 1 : kind === 'negative retry' ? -1 : 0, outcome: kind === 'flaky' ? 'flaky' : 'expected' },
      ];
    }
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  it('requires actual numeric job IDs and a receipt finished before now and the original deadline', () => {
    const proof = fixture();
    const input = { current: context(), required: required(), execution: proof.receipt.execution, job_id: 2003, finished_at: iso(now), now };
    expect(() => createExecutedReceipt(input)).not.toThrow();
    expect(() => createExecutedReceipt({ ...input, job_id: 'unit' })).toThrow();
    expect(() => createExecutedReceipt({ ...input, finished_at: iso(now + 1) })).toThrow();
    expect(() => createExecutedReceipt({ ...input, now: origin + 1_800_000 })).toThrow('deadline');
  });
});

describe('#659 GitHub-owned stage provenance', () => {
  it('reuses a successful original execution with a different commit and identical proven tree', () => {
    const proof = fixture();
    expect(proof.receipt.tested_commit).not.toBe(proof.current.commit);
    expect(validateStageEvidence(proof)).toEqual({ ok: true });
  });

  it('accepts current successful phase jobs while their workflow is still running', () => {
    expect(validateStageEvidence(fixture('unit', true))).toEqual({ ok: true });
    const source = fixture();
    source.run.status = 'in_progress';
    expect(validateStageEvidence(source).ok).toBe(false);
  });

  const timestampCases: [string, number, number, boolean, number, boolean, boolean][] = [
    ['same-second receipt/upload/completion', 60_600, 60_000, false, 60_000, false, true],
    ['receipt beyond completion bucket', 61_000, 60_000, false, 60_000, false, false],
    ['upload bucket before receipt', 60_000, 70_000, false, 59_000, false, false],
    ['upload bucket after completion', 60_600, 60_000, false, 61_000, false, false],
    ['fractional metadata correctly ordered', 60_600, 60_800, true, 60_700, true, true],
    ['fractional completion before receipt', 60_600, 60_500, true, 60_700, true, false],
    ['fractional upload before receipt', 60_600, 60_800, true, 60_500, true, false],
    ['last permitted millisecond', 1_799_999, 1_799_000, false, 1_799_000, false, true],
    ['receipt reaches exact deadline', 1_800_000, 1_800_000, false, 1_800_000, false, false],
    ['completion reaches exact deadline', 1_799_999, 1_800_000, false, 1_799_000, false, false],
    ['upload reaches exact deadline', 1_799_999, 1_799_000, false, 1_800_000, false, false],
  ];
  it.each(timestampCases)('checks API timestamp precision: %s', (_label, finished, end, exactEnd, created, exactCreated, ok) => {
    const proof = fixture();
    const apiTimestamp = (offset: number, exact: boolean) => (exact ? iso(original + offset) : iso(original + offset).replace(/\.\d{3}Z$/, 'Z'));
    proof.receipt.finished_at = iso(original + finished);
    proof.jobs[0]!.completed_at = apiTimestamp(end, exactEnd);
    proof.artifact.created_at = apiTimestamp(created, exactCreated);
    expect(validateStageEvidence(proof).ok).toBe(ok);
  });

  it('rejects a completion bucket straddling a fractional absolute deadline', () => {
    const proof = fixture();
    proof.receipt.epoch.origin_ms += 500;
    proof.receipt.epoch.deadline_ms += 500;
    proof.run.created_at = iso(proof.receipt.epoch.origin_ms);
    proof.receipt.finished_at = iso(original + 1_800_499);
    proof.jobs[0]!.completed_at = proof.artifact.created_at = iso(original + 1_800_000).replace('.000Z', 'Z');
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  const mutations: [string, (proof: ReturnType<typeof fixture>) => void][] = [
    ['legacy schema', (p) => (p.receipt.version = 1)],
    ['unexecuted receipt', (p) => (p.receipt.executed = false)],
    ['wrong tree', (p) => (p.receipt.tested_tree = sha('f'))],
    ['changed policy', (p) => (p.receipt.policy_digest = digest('f'))],
    ['changed toolchain', (p) => (p.receipt.toolchain_digest = digest('f'))],
    ['unproven tree', (p) => (p.commit.tree.sha = sha('f'))],
    ['wrong workflow', (p) => (p.run.path = '.github/workflows/release.yml')],
    ['failed source workflow', (p) => (p.run.conclusion = 'failure')],
    ['fork source', (p) => (p.run.head_repository.full_name = 'fork/site')],
    ['other repository ID', (p) => (p.run.repository.id = 6)],
    ['receipt attempt', (p) => (p.receipt.run_attempt = 2)],
    ['job attempt', (p) => (p.jobs[0]!.run_attempt = 2)],
    ['job numeric ID', (p) => p.receipt.job_id++],
    ['job name', (p) => (p.jobs[0]!.name = 'test')],
    ['duplicate job names', (p) => p.jobs.push(clone(p.jobs[0]!))],
    ['cancelled job', (p) => (p.jobs[0]!.conclusion = 'cancelled')],
    ['wrong job SHA', (p) => (p.jobs[0]!.head_sha = sha('f'))],
    ['receipt outside job', (p) => (p.receipt.finished_at = iso(original + 500))],
    ['job outside deadline', (p) => (p.jobs[0]!.completed_at = iso(original + 1_800_000))],
    ['job in the future', (p) => (p.jobs[0]!.completed_at = iso(now + 1))],
    [
      'reset origin',
      (p) => {
        p.receipt.epoch.origin_ms++;
        p.receipt.epoch.deadline_ms++;
      },
    ],
    ['wrong artifact name', (p) => (p.artifact.name += '-spoof')],
    ['expired artifact', (p) => (p.artifact.expired = true)],
    ['artifact expiration', (p) => (p.artifact.expires_at = iso(now))],
    ['artifact wrong run', (p) => p.artifact.workflow_run.id++],
    ['artifact wrong head', (p) => (p.artifact.workflow_run.head_sha = sha('f'))],
    ['artifact before receipt', (p) => (p.artifact.created_at = iso(original + 59_999))],
    ['artifact after job', (p) => (p.artifact.created_at = iso(original + 70_001))],
    ['artifact corrupt ZIP', (p) => (p.archive_sha256 = digest('f'))],
    ['artifact no GitHub digest', (p) => (p.artifact.digest = '')],
    ['unbound selection', (p) => p.receipt.selection.checks.push('unchecked')],
    ['self-declared job policy', (p) => (p.required.job_name = 'untrusted')],
    ['unexpected source snapshot', (p) => (p.receipt.source_build = fixture('build').receipt.source_build)],
  ];
  it.each(mutations)('rejects %s', (_label, mutate) => {
    const proof = fixture();
    mutate(proof);
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  it.each(['build', 'static-main'])('never reuses the current-only %s stage', (stage) => {
    expect(validateStageEvidence(fixture(stage)).ok).toBe(false);
  });

  it('validates a PR merge against its two exact Git parents', () => {
    const proof = fixture();
    proof.run.event = 'pull_request';
    proof.run.head_sha = sha('f');
    proof.jobs[0]!.head_sha = sha('f');
    proof.artifact.workflow_run.head_sha = sha('f');
    proof.receipt.event = { name: 'pull_request', sha: proof.receipt.tested_commit, head_repository: repository, base_sha: sha('e'), head_sha: sha('f') };
    proof.commit.parents = [{ sha: sha('e') }, { sha: sha('f') }];
    expect(validateStageEvidence(proof).ok).toBe(true);
    proof.commit.parents.reverse();
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  it('accepts a fast-forward of the recorded PR base', async () => {
    const proof = fixture();
    const [recorded, tip, head] = [sha('e'), sha('d'), sha('f')];
    proof.run.event = 'pull_request';
    proof.run.head_sha = head;
    proof.jobs[0]!.head_sha = head;
    proof.artifact.workflow_run.head_sha = head;
    proof.receipt.event = { name: 'pull_request', sha: proof.receipt.tested_commit, head_repository: repository, base_sha: recorded, head_sha: head };
    const commit = proof.commit as typeof proof.commit & { base_advanced?: boolean };
    commit.parents = [{ sha: tip }, { sha: head }];
    expect(validateStageEvidence(proof).reason).toBe('pr-merge-not-proven');
    await noteAdvancedBase(commit, proof.receipt.event, repository, async () => ({ status: 'ahead', behind_by: 0 }));
    expect(commit.base_advanced).toBe(true);
    expect(validateStageEvidence(proof).ok).toBe(true);
    commit.parents = [{ sha: tip }, { sha: sha('b') }];
    expect(validateStageEvidence(proof).reason).toBe('pr-merge-not-proven');
  });

  it('prevents own-run and old-attempt receipts impersonating current execution', () => {
    const proof = fixture();
    proof.mode = 'current';
    expect(validateStageEvidence(proof).ok).toBe(false);
    const current = fixture('unit', true);
    current.receipt.epoch.run_attempt = 2;
    expect(validateStageEvidence(current).ok).toBe(false);
    current.mode = 'reuse';
    expect(validateStageEvidence(current).ok).toBe(false);
  });

  it('permits a proven superset, never a missing requested test', () => {
    const proof = fixture();
    proof.required.selection.files = [];
    expect(validateStageEvidence(proof).ok).toBe(true);
    proof.required.selection.files = ['tests/unit/other.test.ts'];
    expect(validateStageEvidence(proof).ok).toBe(false);
  });
});

describe('#659 browser source build and immutable aggregate', () => {
  it('requires the original executed build + snapshot + fresh smoke when reusing browser results', () => {
    const proof = browserFixture();
    expect(validateStageEvidence(proof)).toEqual({ ok: true });
    proof.source_build_proof.receipt.execution.checks = ['build', 'snapshot'];
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  it.each(['missing', 'different snapshot', 'wrong build job', 'failed build', 'chain'])('rejects invalid source build: %s', (kind) => {
    const proof = browserFixture();
    if (kind === 'missing') Object.assign(proof, { source_build_proof: undefined });
    if (kind === 'different snapshot') proof.receipt.source_build.manifest_digest = digest('b');
    if (kind === 'wrong build job') proof.receipt.source_build.build_job_id++;
    if (kind === 'failed build') proof.source_build_proof.jobs[0]!.conclusion = 'failure';
    if (kind === 'chain') Object.assign(proof.source_build_proof, { source_build_proof: fixture('build') });
    expect(validateStageEvidence(proof).ok).toBe(false);
  });

  it.each([1, 2, 3, 4])('aggregates the exact %i planned nonempty shards and current build', (count) => {
    const input = aggregateFixture(count);
    const gate = aggregateStageEvidence(input);
    expect(gate.version).toBe(2);
    expect(gate.stages).toHaveLength(4 + count);
    expect(gate.snapshot).toEqual(input.snapshot);
    expect(gate.gate_ref).toBe(input.snapshot.gate_ref);
  });

  it('retains original browser snapshot proofs when the current main snapshot bytes differ', () => {
    const input = aggregateFixture();
    input.snapshot.manifest_digest = digest('b');
    input.proofs.build!.receipt.source_build = clone(input.snapshot);
    input.proofs['browser-1'] = browserFixture();
    const gate = aggregateStageEvidence(input);
    expect(gate.stages.find((stage: { stage_id: string }) => stage.stage_id === 'browser-1').executed).toBe(false);
  });

  it.each([
    'missing proof',
    'extra proof',
    'missing static',
    'missing static-main',
    'failed data',
    'cancelled browser',
    'different snapshot',
    'duplicate case',
    'manifest case',
    'manifest shard count',
    'manifest shard assignment',
    'shard gap',
    'reused build',
  ])('blocks aggregate: %s', (kind) => {
    const input = aggregateFixture(2);
    if (kind === 'missing proof') delete input.proofs.unit;
    if (kind === 'extra proof') input.proofs.data = fixture('data', true);
    if (kind === 'missing static') {
      input.requirements = input.requirements.filter((entry) => entry.stage_id !== 'static');
      delete input.proofs.static;
    }
    if (kind === 'missing static-main') {
      const full = aggregateFixture(4);
      Object.assign(full.current, { force_full: true });
      full.requirements = full.requirements.filter((entry) => entry.stage_id !== 'static-main');
      delete full.proofs['static-main'];
      Object.assign(input, full);
    }
    if (kind === 'failed data') {
      input.requirements.push(required('data'));
      input.proofs.data = fixture('data', true);
      input.proofs.data.jobs[0]!.conclusion = 'failure';
    }
    if (kind === 'cancelled browser') input.proofs['browser-1']!.jobs[0]!.conclusion = 'cancelled';
    if (kind === 'different snapshot') input.snapshot = { ...input.snapshot, manifest_digest: digest('b') };
    if (kind === 'duplicate case')
      input.requirements.find((entry) => entry.stage_id === 'browser-2')!.selection.cases = clone(required('browser-1').selection.cases);
    if (kind === 'manifest case') input.browserManifest.allCases.pop();
    if (kind === 'manifest shard count') input.browserManifest.shards.pop();
    if (kind === 'manifest shard assignment') input.browserManifest.shards.reverse();
    if (kind === 'shard gap') input.requirements.find((entry) => entry.stage_id === 'browser-2')!.stage_id = 'browser-3';
    if (kind === 'reused build') input.proofs.build = fixture('build');
    expect(() => aggregateStageEvidence(input)).toThrow();
  });

  it('never emits a gate when queueing consumes the original absolute deadline', () => {
    expect(() => aggregateStageEvidence({ ...aggregateFixture(), now: origin + 1_800_000 })).toThrow('deadline');
    let calls = 0;
    expect(() => aggregateStageEvidence({ ...aggregateFixture(), now: () => (calls++ ? origin + 1_800_000 : now) })).toThrow('deadline');
  });

  it('requires four nonempty shards when full validation is forced', () => {
    const input = aggregateFixture();
    expect(() => aggregateStageEvidence({ ...input, current: { ...input.current, force_full: true } })).toThrow('four shards');
  });

  it('normalizes snapshot identity without accepting missing build ownership', () => {
    const snapshot = fixture('build', true).receipt.source_build;
    expect(snapshotIdentity({ ...snapshot, untrusted: true })).toEqual(snapshot);
    expect(() => snapshotIdentity({ ...snapshot, build_job_id: 0 })).toThrow();
  });
});

describe('#659 budgeted phase reuse discovery', () => {
  it('finds independent reusable phases and forces actual build/static-main execution', async () => {
    const server = fakeServer([fixture(), fixture('static')]);
    const result = await findReusableStages({
      current: context(),
      requirements: ['unit', 'static', 'build', 'static-main'].map(required),
      ...server,
      budget: budget(),
      now: () => now,
    });
    expect(Object.keys(result.reused).sort()).toEqual(['static', 'unit']);
    expect(result.missing).toEqual(['build', 'static-main']);
    expect(server.calls.filter((endpoint) => endpoint.endsWith('/actions/runs/100'))).toHaveLength(1);
  });

  it('automatically retrieves and verifies the original browser build receipt', async () => {
    const server = fakeServer([fixture('browser-1'), fixture('build')]);
    const result = await findReusableStages({ current: context(), requirements: [required('browser-1')], ...server, budget: budget(), now: () => now });
    expect(result.reused['browser-1'].source_build_proof.receipt.stage_id).toBe('build');
    expect(result.missing).toEqual([]);
  });

  it.each(['v1', 'fingerprint', 'failed job', 'digest'])('falls back to actual execution on invalid %s evidence', async (kind) => {
    const proof = fixture();
    if (kind === 'v1') proof.receipt.version = 1;
    if (kind === 'fingerprint') proof.receipt.toolchain_digest = digest('f');
    if (kind === 'failed job') proof.jobs[0]!.conclusion = 'failure';
    if (kind === 'digest') proof.archive_sha256 = digest('f');
    const result = await findReusableStages({ current: context(), requirements: [required()], ...fakeServer([proof]), budget: budget(), now: () => now });
    expect(result.reused).toEqual({});
    expect(result.missing).toEqual(['unit']);
    expect(result.reasons).toContainEqual({
      stage_id: 'unit',
      artifact_id: proof.artifact.id,
      reason: kind === 'failed job' ? 'stage-job-did-not-succeed' : kind === 'digest' ? 'artifact-ownership-or-digest' : 'receipt-mismatch',
    });
  });

  it('falls back on unavailable APIs, missing artifacts and bounded lookup exhaustion', async () => {
    const unavailable = await findReusableStages({
      current: context(),
      requirements: [required()],
      ...fakeServer([]),
      api: async () => {
        throw new Error('Offline');
      },
      budget: budget(),
      now: () => now,
    });
    expect(unavailable.missing).toEqual(['unit']);
    const absent = await findReusableStages({ current: context(), requirements: [required()], ...fakeServer([]), budget: budget(), now: () => now });
    expect(absent.missing).toEqual(['unit']);
    const expired = await findReusableStages({
      current: context(),
      requirements: [required()],
      ...fakeServer([fixture()]),
      budget: budget(),
      now: () => now,
      lookupMs: 0,
    });
    expect(expired.missing).toEqual(['unit']);
  });

  it('propagates the global deadline reached during API lookup', async () => {
    let clock = now;
    const server = fakeServer([fixture()]);
    await expect(
      findReusableStages({
        current: context(),
        requirements: [required()],
        ...server,
        api: async () => {
          clock = origin + 1_800_000;
          return { artifacts: [] };
        },
        budget: budget(() => clock),
        now: () => clock,
      }),
    ).rejects.toMatchObject({ code: 'CI_DEADLINE_EXCEEDED' });
  });

  it.each(['force_full', 'reuse_disabled', 'schedule', 'fork'])('disables lookup for %s runs', async (kind) => {
    const current = { ...context(), force_full: kind === 'force_full', reuse_disabled: kind === 'reuse_disabled' };
    if (kind === 'schedule') current.event.name = 'schedule';
    if (kind === 'fork') Object.assign(current.event, { name: 'pull_request', head_repository: 'fork/site', base_sha: sha('e'), head_sha: sha('f') });
    const server = fakeServer([fixture()]);
    const result = await findReusableStages({ current, requirements: [required()], ...server, budget: budget(), now: () => now });
    expect(result.missing).toEqual(['unit']);
    expect(server.calls).toEqual([]);
  });
});
