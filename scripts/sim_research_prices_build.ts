/**
 * Issue 1496: CLI entrypoint for generating and checking data/game/sim_research_prices.json.
 * Pure library logic lives in scripts/sim_research_prices_lib.ts (zero import side effects).
 *
 * Usage:
 *   npx vite-node scripts/sim_research_prices_build.ts [--check] [--out <path>] [--civ <CivEn>]
 *   npx vite-node --script scripts/sim_research_prices_build.ts [--check] [--out <path>] [--civ <CivEn>]
 */
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ARMY_RESEARCH } from '../src/data/armyResearch';
import { CORE } from '../src/data/core';
import { buildSimResearchPrices, DEFAULT_SIM_RESEARCH_PRICES_DEST, formatSimResearchPricesJson } from './sim_research_prices_lib';

function resolvePathBestEffort(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return resolve(p);
    tail.unshift(basename(cur));
    cur = parent;
  }
  return join(realpathSync(cur), ...tail);
}

function isInsideDir(filePath: string, dirPath: string): boolean {
  const rel = relative(dirPath, filePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function targetsProtectedOutput(candidate: string, defaultDest = DEFAULT_SIM_RESEARCH_PRICES_DEST): boolean {
  const outPath = resolvePathBestEffort(candidate);
  const defaultPath = resolvePathBestEffort(defaultDest);
  const gameDir = resolvePathBestEffort(dirname(defaultDest));
  if (outPath === defaultPath || isInsideDir(outPath, gameDir)) return true;
  if (existsSync(outPath) && existsSync(defaultPath)) {
    const sa = statSync(outPath);
    const sb = statSync(defaultPath);
    if (sa.dev === sb.dev && sa.ino === sb.ino) return true;
  }
  return false;
}

function parseArgs(argv: readonly string[]): { check: boolean; out: string; civList?: string[] } {
  let check = false;
  let out = DEFAULT_SIM_RESEARCH_PRICES_DEST;
  const civs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--check') check = true;
    else if (arg === '--out') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--out requires a file path');
      out = next;
    } else if (arg === '--civ') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--civ requires a civilization name');
      const names = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!names.length) throw new Error('--civ requires a civilization name');
      civs.push(...names);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (civs.length && targetsProtectedOutput(out)) {
    throw new Error('--civ requires an explicit --out path outside data/game and distinct from the default snapshot');
  }
  return { check, out: resolve(out), ...(civs.length ? { civList: civs } : {}) };
}

const { check, out, civList } = parseArgs(process.argv.slice(2));
if (check && !existsSync(out)) {
  throw new Error('sim_research_prices.json missing; run npx vite-node scripts/sim_research_prices_build.ts');
}
const payload = buildSimResearchPrices(CORE, ARMY_RESEARCH, civList ? { civList } : {});
const text = formatSimResearchPricesJson(payload);
if (check) {
  if (readFileSync(out, 'utf8') !== text) {
    throw new Error('sim_research_prices.json drift; run npx vite-node scripts/sim_research_prices_build.ts');
  }
  console.log(
    `sim research prices pinned reproduction OK (${Object.keys(payload.civs).length} civs, ${Object.keys(payload.orderModifiers).length} order modifiers)`,
  );
} else {
  writeFileSync(out, text, 'utf8');
  console.log(`wrote ${out} (${Object.keys(payload.civs).length} civs, ${Object.keys(payload.orderModifiers).length} order modifiers)`);
}
