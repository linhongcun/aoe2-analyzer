/** All CI network I/O shares the absolute workflow budget, including response bodies. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

export function githubApi(budget, env = process.env) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  assert.ok(token, 'Missing GitHub Actions API token');
  return (endpoint, options = {}) =>
    budget.fetchJson(
      `https://api.github.com/${endpoint}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      },
      { maxMs: options.timeoutMs ?? 15_000 },
    );
}
export async function pages(api, endpoint, key) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const data = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const entries = key ? data[key] : data;
    assert.ok(Array.isArray(entries), 'Invalid paginated GitHub response');
    result.push(...entries);
    if (entries.length < 100) return result;
  }
  throw new Error('GitHub pagination exceeded the safe bound');
}
export async function currentRun(api, env = process.env) {
  const run = await api(`repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`);
  assert.equal(run.id, Number(env.GITHUB_RUN_ID));
  assert.equal(run.run_attempt, Number(env.GITHUB_RUN_ATTEMPT));
  return run;
}
export const runJobs = (api, repository, id, attempt) => pages(api, `repos/${repository}/actions/runs/${id}/attempts/${attempt}/jobs`, 'jobs');
export async function actualJob(api, name, env = process.env) {
  const jobs = await runJobs(api, env.GITHUB_REPOSITORY, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const matches = jobs.filter((job) => job.name === name);
  assert.equal(matches.length, 1, `Expected one actual GitHub job named ${name}`);
  assert.ok(Number.isSafeInteger(matches[0].id) && matches[0].id > 0);
  return matches[0];
}
export function artifactDownloader(budget, env = process.env) {
  return async (artifact, options = {}) => {
    assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 1_048_576, 'Evidence archive exceeds limit');
    const response = await budget.fetchBytes(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
      {
        headers: { Authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      },
      { maxMs: options.timeoutMs ?? 15_000 },
    );
    const bytes = Buffer.from(response);
    assert.ok(bytes.length > 0 && bytes.length <= 1_048_576, 'Evidence response exceeds limit');
    const archive_sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(artifact.digest, `sha256:${archive_sha256}`, 'GitHub artifact digest mismatch');
    const folder = join(env.RUNNER_TEMP || 'work', `evidence-${artifact.id}-${process.pid}`);
    mkdirSync(folder, { recursive: true });
    const archive = join(folder, 'archive.zip');
    writeFileSync(archive, bytes);
    try {
      const destination = join(folder, 'receipt.json');
      // Bound decompression before allocating/parsing. Unit receipts contain two exact 6k-case tables.
      await budget.run('python3', [
        '-c',
        `
import stat,sys,zipfile
limit=8*1024*1024
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries=archive.infolist()
    assert len(entries)==1 and entries[0].filename=='receipt.json', 'Evidence ZIP must contain exactly receipt.json'
    entry=entries[0]
    assert stat.S_IFMT(entry.external_attr >> 16) in (0,stat.S_IFREG), 'Evidence member must be regular'
    assert 0 < entry.file_size <= limit, 'Evidence receipt exceeds uncompressed limit'
    with archive.open(entry) as member:
        content=member.read(limit+1)
    assert len(content)<=limit, 'Evidence decompression exceeds limit'
    with open(sys.argv[2],'xb') as output: output.write(content)
`,
        archive,
        destination,
      ]);
      const info = lstatSync(destination);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 8 * 1024 * 1024, 'Evidence receipt must be a bounded regular file');
      const receipt = JSON.parse(readFileSync(destination, 'utf8'));
      budget.assertRemaining('downloaded evidence');
      return { receipt, archive_sha256 };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
}
