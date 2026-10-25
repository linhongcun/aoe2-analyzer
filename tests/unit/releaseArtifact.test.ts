import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Node release scripts are plain modules
import { createArtifactManifest, verifyArtifactManifest } from '../../scripts/site-artifact.mjs';
const directories: string[] = [];
const commit = 'a'.repeat(40),
  tree = 'b'.repeat(40);
const expected = { commit, tree, version: 'v0.34.1', repository: 'linhongcun/aoe2-analyzer', runId: 19 };
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'site-artifact-'));
  directories.push(directory);
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'index.html'), '<html>same deployed website</html>');
  writeFileSync(join(directory, 'assets', 'app.js'), 'console.log("actual build")');
  createArtifactManifest({ directory, ...expected, plan: { scope: 'maintenance', features: [], unit: [], e2e: [], data: false, full: false } });
  return directory;
}
afterEach(() => directories.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));
it('#431 Release uses the exact deployed bytes and identifies the real main run', () => {
  const directory = fixture();
  const manifest = verifyArtifactManifest({ directory, ...expected });
  expect(manifest.commit).toBe(commit);
  expect(Object.keys(manifest.files)).toEqual(['assets/app.js', 'index.html']);
  expect(readFileSync(join(directory, 'index.html'), 'utf8')).toContain('same deployed website');
});
it.each(['commit', 'tree', 'version', 'repository', 'runId'])('#431 refuses an artifact from a different %s', (key) => {
  const directory = fixture();
  const changed = { ...expected, [key]: key === 'runId' ? 20 : key === 'version' ? 'v0.34.2' : 'c'.repeat(40) };
  expect(() => verifyArtifactManifest({ directory, ...changed })).toThrow();
});
it.each(['modify', 'add', 'remove'])('#431 rejects %s of any deployed file before ZIP packaging', (kind) => {
  const directory = fixture();
  if (kind === 'modify') writeFileSync(join(directory, 'assets', 'app.js'), 'changed after deployment');
  if (kind === 'add') writeFileSync(join(directory, 'unreviewed.html'), 'extra');
  if (kind === 'remove') rmSync(join(directory, 'index.html'));
  expect(() => verifyArtifactManifest({ directory, ...expected })).toThrow();
});
it('#431 includes special filenames in the integrity table', () => {
  const directory = fixture();
  writeFileSync(join(directory, '__proto__'), 'unreviewed extra file');
  expect(() => verifyArtifactManifest({ directory, ...expected })).toThrow();
});
it('#431 refuses a symlinked manifest before reading it', () => {
  const directory = fixture();
  const original = readFileSync(join(directory, 'build-evidence.json'));
  const outside = mkdtempSync(join(tmpdir(), 'outside-artifact-'));
  directories.push(outside);
  writeFileSync(join(outside, 'manifest.json'), original);
  rmSync(join(directory, 'build-evidence.json'));
  symlinkSync(join(outside, 'manifest.json'), join(directory, 'build-evidence.json'));
  expect(() => verifyArtifactManifest({ directory, ...expected })).toThrow(/regular file/);
});
