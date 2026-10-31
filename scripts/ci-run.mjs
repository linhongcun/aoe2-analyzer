import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyBrowserPolicy } from './ci-scope.mjs';

export function validatePlan(plan) {
  if (
    !plan ||
    !['maintenance', 'civ-ui', 'targeted', 'full'].includes(plan.scope) ||
    typeof plan.full !== 'boolean' ||
    typeof plan.data !== 'boolean' ||
    plan.full !== (plan.scope === 'full') ||
    (plan.data && !plan.full) ||
    (plan.browser !== undefined && !['full', 'capped', 'none'].includes(plan.browser)) ||
    (plan.browser === 'full' && !plan.full) ||
    (plan.browser === 'none' && (plan.full || plan.e2e?.length)) ||
    (plan.browser === 'capped' && !plan.e2e?.length) ||
    !Array.isArray(plan.features) ||
    plan.features.some((feature) => typeof feature !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*$/.test(feature)) ||
    !Array.isArray(plan.unit) ||
    plan.unit.some((path) => typeof path !== 'string') ||
    !Array.isArray(plan.e2e) ||
    plan.e2e.some((path) => typeof path !== 'string')
  )
    throw new Error('Invalid CI validation plan');
  return plan;
}

/** Only flat test files and basename * patterns are accepted; every nonempty pattern must match. */
export function resolveTestFiles(patterns, kind, directory = process.cwd()) {
  if (!['unit', 'e2e'].includes(kind) || !Array.isArray(patterns)) throw new Error('Invalid test selection');
  if (!patterns.length) return [];
  const suffix = kind === 'unit' ? 'test' : 'spec';
  const allowed = new RegExp(`^tests/${kind}/[A-Za-z0-9_.*-]+\\.${suffix}\\.ts$`);
  const expectedRoot = join(realpathSync(directory), 'tests', kind);
  const root = realpathSync(expectedRoot);
  if (root !== expectedRoot) throw new Error(`Test directory must not be a symlink: tests/${kind}`);
  const entries = readdirSync(root);
  const selected = new Set();
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !allowed.test(pattern)) throw new Error(`Unsafe ${kind} test pattern: ${String(pattern)}`);
    const basename = pattern.split('/').at(-1);
    const regex = new RegExp(
      `^${basename
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    const matches = entries.filter((entry) => regex.test(entry));
    if (!matches.length) throw new Error(`No tests match ${pattern}`);
    for (const name of matches) {
      const path = join(root, name);
      if (!lstatSync(path).isFile() || !realpathSync(path).startsWith(root + sep))
        throw new Error(`Test must be a regular file within tests/${kind}: ${pattern}`);
      selected.add(`tests/${kind}/${name}`);
    }
  }
  return [...selected].sort();
}

export function testCommand(plan, kind, directory = process.cwd()) {
  validatePlan(plan);
  if (!['unit', 'e2e'].includes(kind)) throw new Error('Expected --unit or --e2e');
  // browser:"capped" keeps a full unit run but lists Playwright files (#514).
  const entire = kind === 'unit' ? plan.full : plan.browser === 'full' || (plan.full && plan.browser !== 'capped');
  const files = entire ? [] : resolveTestFiles(plan[kind], kind, directory);
  if (!entire && !files.length) return null;
  return { command: 'npx', args: kind === 'unit' ? ['vitest', 'run', ...files] : ['playwright', 'test', ...files, '--reporter=line'] };
}

export function executePlan(plan, kind, { directory = process.cwd(), run = spawnSync, log = console.log } = {}) {
  const command = testCommand(plan, kind, directory);
  if (!command) {
    log(`CI plan ${plan.scope}: no ${kind} tests selected`);
    return 0;
  }
  log(`CI plan ${plan.scope}: ${command.command} ${command.args.join(' ')}`);
  const result = run(command.command, command.args, { cwd: directory, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (!Number.isInteger(result.status)) throw new Error(`${kind} checks terminated without an exit status`);
  return result.status;
}

function main() {
  const kind = { '--unit': 'unit', '--e2e': 'e2e' }[process.argv[2]];
  if (!kind || process.argv.length !== 3) throw new Error('Usage: node scripts/ci-run.mjs --unit|--e2e');
  const path = process.env.CI_PLAN_PATH ?? join(process.env.RUNNER_TEMP || '.', 'ci-plan.json');
  const plan = validatePlan(applyBrowserPolicy(JSON.parse(readFileSync(path, 'utf8'))));
  if (kind === 'e2e' && plan.browser === 'capped' && plan.full)
    console.log(`PR browser cap: ${plan.e2e.length} Playwright files; the full suite stays on main, nightly, and CI_E2E_FULL`);
  process.exitCode = executePlan(plan, kind);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
