import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
// @ts-expect-error Node release scripts are plain modules
import { assertFooter, checkSite, smokeFeatures } from '../../scripts/deployment-smoke.mjs';
const commit = 'a'.repeat(40);
it('#431 footer cannot accept another version or an ancestor build', () => {
  assertFooter({ version: 'v0.34.1', build: '构建 aaaaaaa' }, { version: 'v0.34.1', commit });
  expect(() => assertFooter({ version: 'v0.34.0', build: 'aaaaaaa' }, { version: 'v0.34.1', commit })).toThrow();
  expect(() => assertFooter({ version: 'v0.34.1', build: 'bbbbbbb' }, { version: 'v0.34.1', commit })).toThrow();
  expect(smokeFeatures(['patches', 'patches', 'matchup'])).toEqual(['matchup', 'patches']);
  expect(smokeFeatures(['all'])).toEqual(['simulator', 'units']);
});
it('#431 smoke really reads a rendered footer and fails a mismatched deployment', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(
      '<html><main><h1>fixture</h1></main><footer id="f"></footer><script>document.querySelector("#f").innerHTML=\'<span data-t="footer-app-version">v0.34.1</span><span data-t="footer-build">构建 aaaaaaa</span>\'</script></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const site = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    expect(await checkSite({ site, version: 'v0.34.1', commit, features: [] })).toEqual(['/']);
    await expect(checkSite({ site, version: 'v0.34.1', commit: 'b'.repeat(40), features: [] })).rejects.toThrow(/exact main commit/);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
