/** Node-only bridge: Playwright must not import the application's JSON module graph. */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuelResult } from '../../src/domain/duel';
import type { SimStats, Unit } from '../../src/domain/types';

export interface ExpectedChampiSide657 {
  key: string;
  unit: Unit;
  stats: SimStats;
  selected: number[];
}
interface ExpectedChampiSnapshot657 {
  units: Unit[];
  civs: { en: string }[];
  sides: Record<string, ExpectedChampiSide657>;
  duels: Record<string, DuelResult>;
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let cached: ExpectedChampiSnapshot657 | undefined;
function expected657() {
  cached ??= JSON.parse(
    execFileSync(resolve(repo, 'node_modules/.bin/vite-node'), [resolve(repo, 'tests/e2e/champi657Engine.ts')], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }),
  ) as ExpectedChampiSnapshot657;
  return cached;
}

// Generate once during collection too, so --list verifies the complete expectation bridge.
export const expectedUnits657 = expected657().units;
export const expectedCivs657 = expected657().civs;
export function expectedSide657(id: number, civ: string, age: number) {
  const key = `${id}.${civ}.${age}`;
  const side = expected657().sides[key];
  if (!side) throw new Error(`Missing independent #657 side: ${key}`);
  return side;
}
export function expectedDuel657(a: ExpectedChampiSide657, b: ExpectedChampiSide657) {
  const key = `${a.key}|${b.key}`;
  const result = expected657().duels[key];
  if (!result) throw new Error(`Missing independent #657 duel: ${key}`);
  return result;
}

/** The required static share URL is independent of the application serializer. */
export function expectedShareUrl657(query: string, base: string) {
  const url = new URL('./duel/', base);
  url.search = new URLSearchParams(query).toString();
  return url.href;
}
