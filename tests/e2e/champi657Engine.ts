/** Invoked only through vite-node by champi657Expected.ts, never collected as a test. */
import { civs, loadCore, loadTrees } from '../../src/data';
import { makeSimContext, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { duel, fighterFrom, type DuelResult } from '../../src/domain/duel';
import type { ExpectedChampiSide657 } from './champi657Expected';

const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
const ctx = makeSimContext(core.techs, trees);
const sides: Record<string, ExpectedChampiSide657> = {};
const duels: Record<string, DuelResult> = {};
function side(id: number, civ: string, age: number) {
  const key = `${id}.${civ}.${age}`;
  if (sides[key]) return sides[key];
  const unit = core.unitById[id];
  if (!unit) throw new Error(`Missing current unit ${id}`);
  const selected = presetUpTo(simTechs(ctx, unit, civ), age);
  return (sides[key] = { key, unit, stats: simulate(ctx, unit, civ, age, selected, new Set()), selected: [...selected].sort((a, b) => a - b) });
}

// Enumerate the frozen inputs, independently of the feature's analysis and preset functions.
for (const [age, champiId, candidates] of [
  [2, 2588, [75, 448, 4]],
  [3, 2552, [38, 77, 24]],
  [4, 2554, [567, 5, 546]],
] as const) {
  const champi = side(champiId, 'Muisca', age);
  for (const id of candidates) {
    const candidate = side(id, 'Franks', age);
    duels[`${candidate.key}|${champi.key}`] = duel(fighterFrom(candidate.unit, candidate.stats), fighterFrom(champi.unit, champi.stats));
    duels[`${champi.key}|${candidate.key}`] = duel(fighterFrom(champi.unit, champi.stats), fighterFrom(candidate.unit, candidate.stats));
  }
}
const needed = new Set([2550, 2588, 2552, 2554, 38, 93, 75, 448, 4, 77, 24, 567, 5, 546]);
process.stdout.write(JSON.stringify({ units: core.units.filter((unit) => needed.has(unit.id)), civs: civs.map(({ en }) => ({ en })), sides, duels }));
