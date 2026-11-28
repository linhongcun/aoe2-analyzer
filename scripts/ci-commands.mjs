/** Single source of truth for the deterministic check groups run by .github/workflows/ci.yml and full.yml. */
import { execFileSync } from 'node:child_process';
import { GATE_NARROW_SMOKE, BUILD_IDENTITY_TITLE } from './ci-scope.mjs';

export const STATIC_CHECKS = [
  ['lint', 'npm', ['run', 'lint']],
  ['typecheck', 'npx', ['tsc', '-p', '.', '--noEmit']],
  ['content', 'npm', ['run', 'content:check', '--', '--strict']],
  ['sources', 'node', ['scripts/check-source-presentation.mjs']],
  ['validators', 'npm', ['run', 'content:validators', '--', '--check']],
  ['layers', 'npm', ['run', 'lint:layers', '--', '--strict']],
];
export const MAIN_CHECKS = [
  ['unused', 'npm', ['run', 'unused:check']],
  ['contrast', 'python3', ['scripts/contrast.py']],
  ['introductions', 'npm', ['run', 'introductions:check']],
];
/** Kept for callers that still pass the old plan object. */
export function mainChecks() {
  return MAIN_CHECKS;
}
const python = (id, script, ...args) => [id, 'python3', [script, ...args]];
const diff = (id, ...paths) => [id, 'git', ['diff', '--exit-code', '--', ...paths]];
export const DATA_CHECKS = [
  ['python-tests', 'npm', ['run', 'test:py']],
  ['dat', 'npm', ['run', 'dat:check']],
  ['stats', 'npm', ['run', 'stats:check']],
  python('siege', 'scripts/siege_build.py', '--check'),
  python('map-previews', 'scripts/map_previews.py', '--check'),
  python('map-catalog', 'scripts/map_catalog_build.py', '--check'),
  python('core-data', 'scripts/build_data.py'),
  ['pinyin-build', 'node', ['scripts/pinyin_build.mjs']],
  diff('core-diff', 'data/game', 'public/img'),
  ['pinyin-check', 'npm', ['run', 'pinyin:check']],
  python('effects', 'scripts/effects_build.py'),
  diff('effects-diff', 'data/game/effects.json'),
  ['effects-audit', 'npx', ['vite-node', 'scripts/effects_audit.ts', '--check']],
  python('eco', 'scripts/eco_build.py'),
  diff('eco-diff', 'data/game/eco.json', 'data/reports/eco-data.json', 'docs/reports/ECO-DATA.md'),
  ...[
    'market',
    'garrison',
    'garrison_general',
    'trade_income',
    'construction',
    'team_bonuses',
    'garrison_healing',
    'relic_income',
    'generate_resource',
    'charge_attack',
    'army_research',
  ].map((name) => python(name, `scripts/${name}_build.py`, '--check')),
  ['army-cost-usage', 'npx', ['vite-node', 'scripts/army_cost_usage_build.ts', '--check']],
  ['sim-research-prices', 'npx', ['vite-node', 'scripts/sim_research_prices_build.ts', '--check']],
  python('patches', 'scripts/patches_build.py', '--check'),
  python('history', 'scripts/history_build.py', '--check'),
  python('civ-updates', 'scripts/civ_history_build.py', '--check'),
  python('patch-notes', 'scripts/patch_notes.py', '--check'),
  python('civ-backgrounds', 'scripts/import_backgrounds.py', '--check'),
  ['build-orders', 'npm', ['run', 'bo:check']],
];
const escape = (title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const SMOKE_CHECKS = [
  [
    'smoke',
    'npx',
    [
      'playwright',
      'test',
      'tests/e2e/smoke.spec.ts',
      'tests/e2e/ciBuild659.spec.ts',
      '--reporter=line',
      '--grep',
      `(${[...GATE_NARROW_SMOKE.map((entry) => entry.title), BUILD_IDENTITY_TITLE].map(escape).join('|')})$`,
    ],
  ],
];
export const CHECK_GROUPS = { static: STATIC_CHECKS, main: MAIN_CHECKS, data: DATA_CHECKS, smoke: SMOKE_CHECKS };

export function runChecks(commands, { run = execFileSync } = {}) {
  for (const [id, command, args] of commands) {
    console.log(`CI check: ${id}`);
    run(command, args, { stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const group = CHECK_GROUPS[process.argv[2]];
  if (!group) {
    console.error(`Usage: node scripts/ci-commands.mjs <${Object.keys(CHECK_GROUPS).join('|')}>`);
    process.exit(2);
  }
  try {
    runChecks(group);
  } catch (error) {
    console.error(`CI check failed: ${error.message}`);
    process.exit(1);
  }
}
