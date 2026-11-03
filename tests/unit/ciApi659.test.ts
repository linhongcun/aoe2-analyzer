import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { artifactDownloader } from '../../scripts/ci-api.mjs';
// @ts-expect-error CI infrastructure uses plain Node modules.
import { createBudget } from '../../scripts/ci-budget.mjs';

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function fixture(kind: string) {
  const directory = mkdtempSync(join(tmpdir(), 'ci659-archive-'));
  folders.push(directory);
  const archive = join(directory, 'source.zip');
  execFileSync('python3', [
    '-c',
    `
import json,stat,sys,zipfile
kind=sys.argv[2]
with zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED) as z:
    if kind=='symlink':
        info=zipfile.ZipInfo('receipt.json');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(info,'/etc/passwd')
    elif kind=='oversize':z.writestr('receipt.json','x'*(8*1024*1024+1))
    elif kind=='nested':z.writestr('../receipt.json','{}')
    elif kind=='multiple':z.writestr('receipt.json','{}');z.writestr('extra','x')
    else:z.writestr('receipt.json',json.dumps({'proof':'real','largeExactCaseTable':'x'*(1100*1024)}))
`,
    archive,
    kind,
  ]);
  const bytes = readFileSync(archive),
    digest = createHash('sha256').update(bytes).digest('hex');
  const budget = createBudget({ originMs: Date.now(), runId: 659, runAttempt: 1, fetchImpl: async () => new Response(bytes) });
  const download = artifactDownloader(budget, { RUNNER_TEMP: directory, GH_TOKEN: 'fixture', GITHUB_REPOSITORY: 'owner/repo' });
  return { download, artifact: { id: 123, size_in_bytes: bytes.length, digest: 'sha256:' + digest } };
}
it('validates real compressed archive bytes and permits bounded exact unit case tables', async () => {
  const { download, artifact } = fixture('valid');
  const result = await download(artifact);
  expect(result.archive_sha256).toBe(artifact.digest.slice(7));
  expect(result.receipt.proof).toBe('real');
  expect(result.receipt.largeExactCaseTable).toHaveLength(1100 * 1024);
});
it.each(['symlink', 'oversize', 'nested', 'multiple'])('rejects %s evidence before parsing host files or unbounded contents', async (kind) => {
  const { download, artifact } = fixture(kind);
  await expect(download(artifact)).rejects.toThrow();
});
it('rejects bytes that differ from the official artifact digest', async () => {
  const { download, artifact } = fixture('valid');
  await expect(download({ ...artifact, digest: 'sha256:' + '0'.repeat(64) })).rejects.toThrow(/digest mismatch/);
});
