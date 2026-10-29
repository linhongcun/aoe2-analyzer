import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import * as historicalUi from '../../scripts/historical-ui.mjs';
const {
  HISTORICAL_UI,
  HISTORICAL_SUITES,
  historicalBaseURL,
  historicalSuiteURL,
  needsHistoricalServer,
  prepareHistoricalSite,
  splitBrowserSubjects,
  startHistoricalServer,
  verifyHistoricalSite,
  verifyHistoricalZip,
} = historicalUi;
// @ts-expect-error Release scripts are plain Node modules
import { createArtifactManifest } from '../../scripts/site-artifact.mjs';

const directories: string[] = [];
function temporary() {
  const path = mkdtempSync(join(tmpdir(), 'historical-ui-486-'));
  directories.push(path);
  return path;
}
function site() {
  const directory = temporary();
  writeFileSync(join(directory, 'index.html'), 'immutable published 185872 site');
  createArtifactManifest({ directory, ...HISTORICAL_UI, plan: { features: ['all'] } });
  return directory;
}
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

it('#486 selects exactly the two approved historical suites, with all other suites current', () => {
  const files = readdirSync('tests/e2e')
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => `tests/e2e/${file}`);
  const subjects = splitBrowserSubjects(files);
  expect(subjects.historical.map((file: string) => file.split('/').at(-1)).sort()).toEqual([...HISTORICAL_SUITES].sort());
  expect([...subjects.current, ...subjects.historical].sort()).toEqual([...files].sort());
  const routed = files.filter((file) => readFileSync(file, 'utf8').includes('historicalSuiteURL('));
  expect(routed.sort()).toEqual(subjects.historical.sort());
  expect(() => splitBrowserSubjects([...files, files[0]])).toThrow(/Duplicate/);
  expect(() => historicalSuiteURL('smoke.spec.ts')).toThrow(/approved/);
});

it.each([
  [],
  ['test'],
  ['test', 'smoke'],
  ['test', 'tests/e2e/.*'],
  ['test', 'tests/e2e/smoke.spec.ts', 'mountedCrossbow'],
  ['test', 'tests/e2e/duelPreset372.spec.ts'],
  ['test', 'tests/e2e/smoke.spec.ts', '--unknown', 'value'],
  ['test', 'tests/e2e/smoke.spec.ts', '--workers'],
  ['test', 'tests/e2e/not-real.spec.ts'],
  ['test', 'tests/e2e/smoke.spec.ts', '--config=other.ts'],
])('#486 conservatively starts the fixture for ambiguous selection %j', (...args) => {
  expect(needsHistoricalServer(args)).toBe(true);
});
it.each([
  ['test', 'tests/e2e/smoke.spec.ts'],
  ['test', './tests/e2e/../e2e/smoke.spec.ts', '--reporter=line', '--workers', '2'],
  ['test', resolve('tests/e2e/smoke.spec.ts'), '--grep', 'mountedCrossbow', '--headed'],
])('#486 exact current selection avoids historical startup %j', (...args) => {
  expect(needsHistoricalServer(args)).toBe(false);
});

it.each(['https://example.com/', 'http://127.0.0.1/', 'http://127.0.0.1:4196/sub/', 'http://user:secret@localhost:4196/', 'http://localhost:4196/?x=1'])(
  '#486 rejects an unmanaged fixture address %s',
  (value) => expect(() => historicalBaseURL(value)).toThrow(),
);
it('#486 accepts a configurable managed loopback server', () => expect(historicalBaseURL('http://localhost:4197/')).toBe('http://localhost:4197/'));

it.each(['version', 'commit', 'tree', 'runId'])('#486 rejects cache manifest %s tampering before opening a server', (key) => {
  const directory = site();
  const path = join(directory, 'build-evidence.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest[key] = key === 'runId' ? 99 : 'changed';
  writeFileSync(path, JSON.stringify(manifest));
  expect(() => startHistoricalServer(directory)).toThrow();
});
it('#486 rejects correlated manifest and extracted-file tampering before opening a server', () => {
  const directory = site();
  // Even a self-consistent digest table with all the real source identity fields is insufficient.
  expect(() => verifyHistoricalSite(directory)).toThrow(/manifest SHA256/);
  writeFileSync(join(directory, 'index.html'), 'modified');
  createArtifactManifest({ directory, ...HISTORICAL_UI, plan: { features: ['all'] } });
  expect(() => startHistoricalServer(directory)).toThrow(/manifest SHA256/);
  expect(() => startHistoricalServer(join(directory, 'missing'))).toThrow();
});
it('#486 validates cached ZIP bytes before extraction even when a plausible site exists', () => {
  const cache = temporary();
  writeFileSync(join(cache, HISTORICAL_UI.asset), 'corrupt ZIP');
  mkdirSync(join(cache, 'site'));
  expect(() => verifyHistoricalZip(join(cache, HISTORICAL_UI.asset))).toThrow(/SHA256/);
  expect(() =>
    prepareHistoricalSite({
      cache,
      download: () => {
        throw new Error('must not redownload corrupt cache');
      },
    }),
  ).toThrow(/SHA256/);
});
it('#486 download failures and wrong download hashes hard fail without publishing a cache', () => {
  const cache = temporary();
  expect(() =>
    prepareHistoricalSite({
      cache,
      download: () => {
        throw new Error('missing release');
      },
    }),
  ).toThrow(/missing release/);
  expect(() => prepareHistoricalSite({ cache, download: (path: string) => writeFileSync(path, 'wrong bytes') })).toThrow(/SHA256/);
  expect(readdirSync(cache)).toEqual([]);
});
