/** #478 exact public-output comparison. Baselines are local evidence, never game-data inputs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Run against each worktree with its own Vite root so import.meta.glob loads that tree's BOs.
const root = process.env.PARITY_ROOT ?? process.cwd();
const output = process.env.PARITY_OUTPUT;
if (!output) throw new Error('Set PARITY_OUTPUT to an untracked JSON file; optionally set PARITY_BASELINE to compare.');
const sim = await import(root + '/src/domain/buildSim.ts');
const { buildOrders } = await import(root + '/src/data/buildOrders.ts');
const eco = JSON.parse(readFileSync(root + '/src/data/eco.json', 'utf8'));
const units = JSON.parse(readFileSync(root + '/src/data/units.json', 'utf8'));
const civs = JSON.parse(readFileSync(root + '/src/data/civs.json', 'utf8')).map((c: { en: string }) => c.en);
const upgrades = Object.fromEntries(units.filter((u: { up?: unknown }) => u.up).map((u: { id: number; up: unknown }) => [u.id, u.up]));
const special = ['Portuguese', 'Shu', 'Malians', 'Varangians', 'Tatars', 'Mayans', 'Sicilians', 'Wei', 'Bengalis', 'Armenians', 'Georgians', 'Slavs', 'Khmer'];
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, val) =>
    val === undefined ? { $undefined: true } : typeof val === 'number' && !Number.isFinite(val) ? { $number: String(val) } : val,
  );
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cases: Record<string, string> = {};
function record(label: string, value: unknown) {
  cases[label] = serialize(value);
}
function metadata(data: typeof eco, civ: string) {
  const scope = sim.simScope(data, buildOrders, civ);
  return {
    support: sim.simSupport(data, civ, buildOrders),
    unhandled: sim.unhandledEffects(data, civ, buildOrders),
    noHouses: sim.civNoHouses(data, civ),
    notes: buildOrders.map((bo: { id: string }) => [bo.id, sim.civSimNotes(data, civ, bo.id)]),
    classes: (data.civEco[civ] ?? []).map((row: { effects: unknown[] }) => row.effects.map((effect) => sim.classifyCivEffect(effect, row, scope))),
    atomicity: (data.civEco[civ] ?? []).map((row: unknown) => sim.techAtomicOk(row, scope)),
    rates: Object.keys(data.villager.tasks).flatMap((task) => [0, 2, 7].map((tiles) => ({ task, tiles, rate: sim.gatherRate(data, civ, task, tiles) }))),
  };
}
for (const civ of ['Generic', ...civs]) {
  record('metadata/' + civ, metadata(eco, civ));
  for (const bo of buildOrders) record('timeline/' + civ + '/' + bo.id, sim.simulateBuild(bo, civ, eco, upgrades));
  console.log('captured ' + civ);
}
for (const civ of special) {
  for (const id of ['fast-castle-boom', 'fast-castle-knights']) {
    const bo = buildOrders.find((b: { id: string }) => b.id === id);
    for (const params of [
      { team: true, walkTiles: 7 },
      { team: true, autoHouses: false, walkTiles: 2 },
    ])
      record('variant/' + civ + '/' + id + '/' + serialize(params), sim.simulateBuild(bo, civ, eco, upgrades, params));
  }
  const mutations: Array<[string, (data: typeof eco) => void, string?]> = [
    [
      'missing-first-bonus',
      (data) => {
        const rows = data.civEco[civ];
        rows.splice(
          rows.findIndex((row: { source: string }) => row.source === 'bonus'),
          1,
        );
      },
    ],
    [
      'duplicate-first-bonus',
      (data) => {
        const rows = data.civEco[civ];
        rows.push(structuredClone(rows.find((row: { source: string }) => row.source === 'bonus') ?? rows[0]));
      },
    ],
    [
      'unknown-companion',
      (data) => {
        const rows = data.civEco[civ];
        (rows.find((row: { source: string }) => row.source === 'bonus') ?? rows[0]).effects.push({ kind: 'new-unknown-kind', v: 1 });
      },
    ],
    [
      'invalid-multiplier',
      (data) => {
        const row = data.civEco[civ].find((row: { effects: Array<{ op?: string }> }) => row.effects.some((effect) => effect.op === 'mul'));
        if (row) row.effects.find((effect: { op?: string }) => effect.op === 'mul').v = -1;
      },
    ],
    [
      'missing-building-class',
      (data) => {
        delete data.buildings['109'].class;
        delete data.buildings['70'].class;
      },
    ],
    [
      'wrong-owner',
      (data) => {
        data.civEco.Generic = structuredClone(data.civEco[civ]);
      },
      'Generic',
    ],
  ];
  for (const [name, mutate, owner] of mutations) {
    const data = structuredClone(eco);
    mutate(data);
    const target = owner ?? civ;
    record('mutation/' + civ + '/' + name + '/metadata', metadata(data, target));
    record(
      'mutation/' + civ + '/' + name + '/timeline',
      sim.simulateBuild(
        buildOrders.find((bo: { id: string }) => bo.id === 'fast-castle-boom'),
        target,
        data,
        upgrades,
      ),
    );
  }
}
const sourceFiles = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src/domain', 'src/data'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .sort();
const sourceInputSha256 = hash(serialize(sourceFiles.map((path) => [path, hash(readFileSync(root + '/' + path, 'utf8'))])));
const metadataOut = {
  sourceInputSha256,
  workingTreeDirty: execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).length > 0,
  source: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  civs: civs.length,
  builds: buildOrders.length,
  cases: Object.keys(cases).length,
  sha256: hash(serialize(cases)),
};
if (process.env.PARITY_BASELINE) {
  const baseline = JSON.parse(readFileSync(process.env.PARITY_BASELINE, 'utf8'));
  const differences = Object.keys(cases).filter((key) => cases[key] !== baseline.cases[key]);
  const missing = Object.keys(baseline.cases).filter((key) => !Object.hasOwn(cases, key));
  console.log(JSON.stringify({ ...metadataOut, baseline: baseline.metadata, differences, missing }, null, 2));
  writeFileSync(output, JSON.stringify({ metadata: metadataOut, cases }));
  if (differences.length || missing.length) process.exitCode = 1;
} else {
  writeFileSync(output, JSON.stringify({ metadata: metadataOut, cases }));
  console.log(JSON.stringify(metadataOut, null, 2));
}
