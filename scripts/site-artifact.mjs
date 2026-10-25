/** The Pages upload and downloadable ZIP share these exact, hash-verified bytes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const manifestName = 'build-evidence.json';
const sha = /^[0-9a-f]{40}$/;
function filesIn(directory, prefix = '') {
  const files = new Map();
  for (const name of readdirSync(join(directory, prefix)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const info = lstatSync(join(directory, relative));
    assert.ok(!info.isSymbolicLink(), 'Deployment artifacts must not contain symlinks');
    if (relative === manifestName) {
      assert.ok(info.isFile(), 'Deployment manifest must be a regular file');
      continue;
    }
    if (info.isDirectory()) for (const entry of Object.entries(filesIn(directory, relative))) files.set(...entry);
    else {
      assert.ok(info.isFile(), 'Deployment artifacts must contain regular files');
      files.set(
        relative,
        createHash('sha256')
          .update(readFileSync(join(directory, relative)))
          .digest('hex'),
      );
    }
  }
  return Object.fromEntries(files);
}
function validateIdentity({ commit, tree, version, repository, runId }) {
  assert.match(commit, sha, 'Expected a full build commit');
  assert.match(tree, sha, 'Expected a full source tree');
  assert.match(version, /^v\d+\.\d+\.\d+$/, 'Expected a release version');
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/, 'Expected a repository');
  assert.ok(Number.isSafeInteger(runId) && runId > 0, 'Expected a real source CI run ID');
}
export function createArtifactManifest({ directory, commit, tree, version, repository, runId, plan }) {
  validateIdentity({ commit, tree, version, repository, runId });
  assert.ok(plan && Array.isArray(plan.features), 'Missing validation plan');
  const files = filesIn(directory);
  assert.ok(files['index.html'], 'Missing built site index');
  const manifest = { schema: 1, commit, tree, version, repository, runId, plan, files };
  writeFileSync(join(directory, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function verifyArtifactManifest({ directory, commit, tree, version, repository, runId }) {
  validateIdentity({ commit, tree, version, repository, runId });
  assert.ok(lstatSync(join(directory, manifestName)).isFile() && !lstatSync(join(directory, manifestName)).isSymbolicLink(), 'Manifest must be a regular file');
  const manifest = JSON.parse(readFileSync(join(directory, manifestName), 'utf8'));
  assert.equal(manifest.schema, 1, 'Unsupported deployment artifact');
  for (const [key, value] of Object.entries({ commit, tree, version, repository, runId }))
    assert.equal(manifest[key], value, `Deployment artifact ${key} does not match the verified main run`);
  assert.ok(manifest.plan && Array.isArray(manifest.plan.features), 'Missing deployment validation plan');
  assert.ok(manifest.files?.['index.html'], 'Missing deployment index digest');
  assert.deepEqual(filesIn(directory), manifest.files, 'Deployment artifact bytes changed');
  return manifest;
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function main() {
  const directory = resolve(process.env.SITE_ARTIFACT_DIR || 'dist');
  const options = {
    directory,
    commit: process.env.EXPECTED_DEPLOYED_SHA || git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    version: process.env.RELEASE_VERSION || `v${JSON.parse(readFileSync('package.json', 'utf8')).version}`,
    repository: process.env.GITHUB_REPOSITORY,
    runId: Number(process.env.SOURCE_CI_RUN_ID || process.env.GITHUB_RUN_ID),
  };
  if (process.argv.includes('--write')) {
    const plan = JSON.parse(readFileSync(process.env.CI_PLAN_PATH || join(process.env.RUNNER_TEMP || '.', 'ci-plan.json'), 'utf8'));
    createArtifactManifest({ ...options, plan });
    console.log(`Recorded deployed site ${options.version} / ${options.commit} from CI ${options.runId}`);
  } else if (process.argv.includes('--verify')) {
    verifyArtifactManifest(options);
    console.log(`Verified exact deployed bytes for ${options.version} / ${options.commit} from CI ${options.runId}`);
  } else throw new Error('Use --write or --verify');
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
