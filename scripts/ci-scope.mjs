import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';

const sha = /^[0-9a-f]{40}$/;
const version = /^\d+\.\d+\.\d+$/;
const civFiles = new Set([
  'src/features/civs/components/CivList.tsx',
  'tests/e2e/civDlcFilters.spec.ts',
  'tests/e2e/civRequirements206.spec.ts',
  'tests/e2e/v0290-326.spec.ts',
  'tests/e2e/catalogLayout187.spec.ts',
  'tests/e2e/layout62.spec.ts',
]);
const cssFiles = new Set(['src/shared/styles/base.css', 'src/shared/styles/editorial.css']);
const maintenanceFiles = new Set(['scripts/release.mjs', 'scripts/prepare-release.mjs', 'scripts/check-pr-title.mjs', 'scripts/ci-scope.mjs']);

/** Dependency, script, lock resolution and integrity changes always retain full checks. */
export function versionOnly(path, before, after) {
  try {
    const a = JSON.parse(before),
      b = JSON.parse(after);
    if (!version.test(a.version) || !version.test(b.version)) return false;
    delete a.version;
    delete b.version;
    if (path === 'package-lock.json') {
      if (!version.test(a.packages?.['']?.version) || !version.test(b.packages?.['']?.version)) return false;
      delete a.packages[''].version;
      delete b.packages[''].version;
    }
    return isDeepStrictEqual(a, b);
  } catch {
    return false;
  }
}

/** Only the removed civilization badge and its replacement spacing can use the visual subset. */
export function civCssOnly(before, after) {
  const normalize = (source) => {
    if (typeof source !== 'string') throw new Error('Missing stylesheet');
    const root = postcss.parse(source);
    root.walkComments((comment) => comment.remove());
    root.walkRules((rule) => {
      if (rule.selectors.every((selector) => ['.cdl', '#grid .card .mini'].includes(selector.trim()))) rule.remove();
    });
    // Compare syntax nodes rather than formatting, source positions or comments.
    const node = (item) => {
      if (item.type === 'decl') return ['decl', item.prop, item.value, !!item.important];
      if (item.type === 'rule') return ['rule', item.selector, item.nodes.map(node)];
      if (item.type === 'atrule') return ['at', item.name, item.params, item.nodes?.map(node)];
      return [item.type, item.nodes?.map(node)];
    };
    return node(root);
  };
  try {
    return isDeepStrictEqual(normalize(before), normalize(after));
  } catch {
    return false;
  }
}

export function classifyChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return 'full';
  let civ = false;
  for (const change of changes) {
    if (!change || typeof change.path !== 'string') return 'full';
    const { path, before, after } = change;
    if (civFiles.has(path)) civ = true;
    else if (cssFiles.has(path)) {
      if (!civCssOnly(before, after)) return 'full';
      civ = true;
    } else if (path === 'package.json' || path === 'package-lock.json') {
      if (!versionOnly(path, before, after)) return 'full';
    } else if (
      path === 'CHANGELOG.md' ||
      path === 'AGENTS.md' ||
      path === 'CONTRIBUTING.md' ||
      (path.startsWith('docs/') && !path.startsWith('docs/PATCH-NOTES/')) ||
      path.startsWith('.github/') ||
      maintenanceFiles.has(path) ||
      /^tests\/unit\/release[^/]*\.test\.ts$/.test(path)
    ) {
      // Maintenance uses release-policy unit checks, while mixed UI changes also run visual checks.
    } else return 'full';
  }
  return civ ? 'civ-ui' : 'maintenance';
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function classifyRange(base, head) {
  try {
    if (!sha.test(base) || !sha.test(head) || base === head) return 'full';
    if (spawnSync('git', ['merge-base', '--is-ancestor', base, head]).status !== 0) return 'full';
    const paths = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean);
    const content = (ref, path) => {
      try {
        return git('show', `${ref}:${path}`);
      } catch {
        return null;
      }
    };
    return classifyChanges(paths.map((path) => ({ path, before: content(base, path), after: content(head, path) })));
  } catch {
    return 'full';
  }
}

/** No implicit HEAD^ fallback: a multi-commit push must include every changed source. */
export function eventBase(eventName, event, ref, initialReleaseBase = null) {
  if (eventName === 'pull_request') return event.pull_request?.base?.sha ?? null;
  if (eventName !== 'push') return null;
  if (sha.test(event.before) && event.before !== '0'.repeat(40)) return event.before;
  if (event.before === '0'.repeat(40) && ref?.startsWith('refs/heads/release/')) return initialReleaseBase;
  return null;
}

/** Called only after prepare-release validates the successful main run that owns this artifact. */
export function releaseScope(manifest, expectedHead, classify = classifyRange) {
  if (!manifest || !sha.test(expectedHead) || manifest.head !== expectedHead || !sha.test(manifest.base)) return 'full';
  if (!['civ-ui', 'maintenance'].includes(manifest.scope)) return 'full';
  return classify(manifest.base, expectedHead) === manifest.scope ? manifest.scope : 'full';
}

function main() {
  let scope = 'full';
  if (process.argv[2] === '--release') {
    try {
      scope = releaseScope(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.env.EXPECTED_DEPLOYED_SHA);
    } catch {
      // Older deployments or missing/invalid artifacts retain the complete online verification.
    }
  } else {
    const head = git('rev-parse', 'HEAD');
    let base = null;
    try {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      let initialReleaseBase = null;
      if (process.env.GITHUB_EVENT_NAME === 'push' && event.before === '0'.repeat(40) && process.env.GITHUB_REF?.startsWith('refs/heads/release/'))
        initialReleaseBase = git('merge-base', 'origin/main', head);
      base = eventBase(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REF, initialReleaseBase);
      scope = classifyRange(base, head);
    } catch {
      // Missing history or an unsupported event cannot select a reduced test profile.
    }
    writeFileSync(join(process.env.RUNNER_TEMP || '.', 'ci-scope.json'), JSON.stringify({ base, head, scope }) + '\n');
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
  console.log(`Validation scope: ${scope}`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();
