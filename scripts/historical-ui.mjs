/** Immutable DE 185872 browser subject; never substitute a current build. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyArtifactManifest } from './site-artifact.mjs';

export const HISTORICAL_UI = Object.freeze({
  version: 'v0.58.1',
  commit: '7f3521c2e88a36e7236d290fdbe9bc698df82e81',
  tree: '433c8b045f6fa7ca9b4f29896a172aef72dffea0',
  repository: 'linhongcun/aoe2-analyzer',
  runId: 40800504444,
  sha256: '2776fb98d0e4f9f49b4b1c332803628d5047585c59aadc0ce31a93a23d216ab1',
  manifestSha256: '57d77d6a0e85a1ffddafc9cc27782c114f74eb0dc23a2bda3e09a13abcd7a0ca',
  asset: 'aoe2-analyzer-v0.58.1.zip',
});
export const HISTORICAL_SUITES = Object.freeze(['duelPreset372.spec.ts', 'mountedCrossbowPresets441.spec.ts']);

/** This setting chooses our verified server's address, never an unverified external site. */
export function historicalBaseURL(value = process.env.HISTORICAL_185872_BASE_URL ?? 'http://127.0.0.1:4196/') {
  const url = new URL(value);
  assert.ok(
    url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.port &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    'HISTORICAL_185872_BASE_URL must be an HTTP loopback origin with an explicit port and root path',
  );
  return url.href;
}

export function historicalSuiteURL(file) {
  assert.ok(HISTORICAL_SUITES.includes(file), `Not an approved historical suite: ${file}`);
  return historicalBaseURL();
}

export function splitBrowserSubjects(files) {
  assert.equal(new Set(files).size, files.length, 'Duplicate browser suite selection');
  const historical = files.filter((file) => HISTORICAL_SUITES.includes(file.split('/').at(-1)));
  return { current: files.filter((file) => !historical.includes(file)), historical };
}

/** Omit the server only for unambiguous, existing exact current-suite selectors. */
export function needsHistoricalServer(args = process.argv.slice(2), directory = process.cwd()) {
  const selectors = [];
  const valueOptions = new Set([
    '--reporter',
    '--workers',
    '--timeout',
    '--retries',
    '--repeat-each',
    '--max-failures',
    '--grep',
    '--grep-invert',
    '--shard',
    '--output',
    '--project',
  ]);
  const switches = new Set(['--headed', '--debug', '--list', '--forbid-only', '--quiet', '--pass-with-no-tests', '--fail-on-flaky-tests']);
  const values = args[0] === 'test' ? args.slice(1) : args;
  const root = resolve(directory, 'tests/e2e');
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value.startsWith('-')) {
      const [option, inline] = value.split('=', 2);
      if (switches.has(option) && inline === undefined) continue;
      if (!valueOptions.has(option)) return true;
      if (inline === undefined && (!values[++index] || values[index].startsWith('-'))) return true;
      continue;
    }
    const file = resolve(directory, value);
    if (
      !file.endsWith('.spec.ts') ||
      !existsSync(file) ||
      !statSync(file).isFile() ||
      realpathSync(file) !== file ||
      !file.startsWith(root + sep) ||
      file.slice(root.length + 1).includes(sep)
    )
      return true;
    selectors.push(file);
  }
  if (!selectors.length || new Set(selectors).size !== selectors.length) return true;
  return splitBrowserSubjects(selectors).historical.length > 0;
}

export function verifyHistoricalZip(archive) {
  assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), HISTORICAL_UI.sha256, 'Historical UI ZIP SHA256 mismatch');
}

export function verifyHistoricalSite(directory) {
  // Bind the digest table itself to the published ZIP, so correlated file+manifest edits fail.
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(directory, 'build-evidence.json')))
      .digest('hex'),
    HISTORICAL_UI.manifestSha256,
    'Historical UI manifest SHA256 mismatch',
  );
  return verifyArtifactManifest({ directory, ...HISTORICAL_UI });
}

export function prepareHistoricalSite({ cache = resolve('scripts/.cache/historical-ui-185872'), download = downloadRelease } = {}) {
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, HISTORICAL_UI.asset);
  if (!existsSync(archive)) {
    const partial = `${archive}.${process.pid}.partial`;
    try {
      download(partial);
      verifyHistoricalZip(partial);
      renameSync(partial, archive);
    } finally {
      rmSync(partial, { force: true });
    }
  }
  // Cache hits recheck the immutable ZIP and every extracted file, including source identity.
  verifyHistoricalZip(archive);
  const directory = join(cache, 'site');
  if (!existsSync(directory)) {
    const temporary = `${directory}.${process.pid}.partial`;
    try {
      mkdirSync(temporary);
      execFileSync('unzip', ['-q', archive, '-d', temporary]);
      verifyHistoricalSite(temporary);
      renameSync(temporary, directory);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  verifyHistoricalSite(directory);
  return directory;
}

function downloadRelease(destination) {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    execFileSync(
      'gh',
      ['release', 'download', HISTORICAL_UI.version, '--repo', HISTORICAL_UI.repository, '--pattern', HISTORICAL_UI.asset, '--output', destination],
      { stdio: 'pipe' },
    );
  } else {
    const url = `https://github.com/${HISTORICAL_UI.repository}/releases/download/${HISTORICAL_UI.version}/${HISTORICAL_UI.asset}`;
    execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', url, '--output', destination], { stdio: 'pipe' });
  }
}

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
export function startHistoricalServer(directory, address = historicalBaseURL()) {
  // A missing/mutated fixture cannot open a listening socket.
  verifyHistoricalSite(directory);
  const url = new URL(historicalBaseURL(address));
  const server = createServer((request, response) => {
    let file;
    try {
      file = resolve(directory, '.' + decodeURIComponent(new URL(request.url, url).pathname));
      assert.ok(file === directory || file.startsWith(directory + sep));
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      assert.ok(statSync(file).isFile());
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(response);
  });
  server.listen(Number(url.port), url.hostname.replace(/^\[|\]$/g, ''));
  return server;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    assert.equal(process.argv[2], '--serve', 'Usage: node scripts/historical-ui.mjs --serve');
    const directory = prepareHistoricalSite();
    const server = startHistoricalServer(directory);
    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.on('listening', () => console.log(`Historical subject DE 185872: ${HISTORICAL_UI.version} / ${HISTORICAL_UI.commit} / CI ${HISTORICAL_UI.runId}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
