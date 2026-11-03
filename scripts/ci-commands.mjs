/** Stable command IDs are recorded only after the corresponding command exits successfully. */
export const STATIC_CHECKS = [
  ['lint', 'npm', ['run', 'lint']],
  ['typecheck', 'npx', ['tsc', '-p', '.', '--noEmit']],
  ['content', 'npm', ['run', 'content:check', '--', '--strict']],
  ['sources', 'node', ['scripts/check-source-presentation.mjs']],
  ['validators', 'npm', ['run', 'content:validators', '--', '--check']],
  ['layers', 'npm', ['run', 'lint:layers', '--', '--strict']],
];
export function mainChecks(plan) {
  return [
    ['unused', 'npm', ['run', 'unused:check']],
    ['contrast', 'python3', ['docs/design/contrast.py']],
    ...(plan.full ? [['introductions', 'npm', ['run', 'introductions:check']]] : []),
  ];
}
const python = (id, script, ...args) => [id, 'python3', [script, ...args]];
const diff = (id, ...paths) => [id, 'git', ['diff', '--exit-code', '--', ...paths]];
export const DATA_CHECKS = [
  ['python-tests', 'npm', ['run', 'test:py']],
  ['dat', 'npm', ['run', 'dat:check']],
  ['stats', 'npm', ['run', 'stats:check']],
  python('map-previews', 'scripts/map_previews.py', '--check'),
  python('map-catalog', 'scripts/map_catalog_build.py', '--check'),
  python('core-data', 'scripts/build_data.py'),
  ['pinyin-build', 'node', ['scripts/pinyin_build.mjs']],
  diff('core-diff', 'src/data', 'public/img'),
  ['pinyin-check', 'npm', ['run', 'pinyin:check']],
  python('effects', 'scripts/effects_build.py'),
  diff('effects-diff', 'src/data/effects.json'),
  python('eco', 'scripts/eco_build.py'),
  diff('eco-diff', 'src/data/eco.json', 'docs/ECO-DATA.md'),
  ...['market', 'garrison', 'garrison_general', 'trade_income', 'construction', 'team_bonuses', 'garrison_healing', 'relic_income', 'generate_resource'].map(
    (name) => python(name, `scripts/${name}_build.py`, '--check'),
  ),
  python('patches', 'scripts/patches_build.py', '--check'),
  python('history', 'scripts/history_build.py', '--check'),
  python('civ-backgrounds', 'src/features/civs/import_backgrounds.py', '--check'),
  ['build-orders', 'npm', ['run', 'bo:check']],
];
export async function executeChecks(commands, budget, options = {}) {
  const completed = [];
  for (const [id, command, args] of commands) {
    console.log(`CI check: ${id}`);
    await budget.run(command, args, options);
    completed.push(id);
  }
  budget.assertRemaining('completed checks');
  return completed;
}
export async function installBrowser(budget) {
  await budget.run('bash', [
    '-e',
    '-c',
    `
for source_file in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources /etc/apt/apt-mirrors.txt; do
  if [ -f "$source_file" ]; then
    sudo sed -i 's|azure\\.archive\\.ubuntu\\.com|archive.ubuntu.com|g' "$source_file"
  fi
done
`,
  ]);
  await budget.run('npx', ['playwright', 'install', '--with-deps', 'chromium']);
}
