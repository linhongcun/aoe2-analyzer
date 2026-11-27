/**
 * Issue 1429: CLI entrypoint for generating and checking data/game/army_cost_usage.json.
 * Pure library logic lives in scripts/army_cost_usage_lib.ts (zero import side effects).
 *
 * Usage:
 *   npx vite-node scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 *   npx vite-node --script scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { ARMY_RESEARCH } from '../src/data/armyResearch';
import { CORE } from '../src/data/core';
import { loadTrees } from '../src/data/index';
import { buildArmyCostUsage, DEFAULT_ARMY_COST_USAGE_DEST, formatArmyCostUsageJson } from './army_cost_usage_lib';

const MAX_SYMLINK_HOPS = 40;

/**
 * Resolve a filesystem path in POSIX segment order (following symlinks before collapsing `..`),
 * supporting non-existent leaf targets and failing closed (returning null) on symlink loops,
 * excessive hop depth, or unexpected filesystem errors.
 */
function resolveFsPath(filePath: string): string | null {
  const root = parse(filePath).root;
  let current: string;
  let pending: string[];
  if (root) {
    current = root;
    pending = filePath.slice(root.length).split(/[/\\]+/);
  } else {
    try {
      current = realpathSync(process.cwd());
    } catch {
      return null;
    }
    pending = filePath.split(/[/\\]+/);
  }
  let symlinkHops = 0;
  while (pending.length > 0) {
    const seg = pending.shift()!;
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      current = dirname(current);
      continue;
    }
    const next = join(current, seg);
    let stat;
    try {
      stat = lstatSync(next);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        current = next;
        continue;
      }
      return null;
    }
    if (stat.isSymbolicLink()) {
      if (++symlinkHops > MAX_SYMLINK_HOPS) return null;
      let linkTarget: string;
      try {
        linkTarget = readlinkSync(next);
      } catch {
        return null;
      }
      const targetRoot = parse(linkTarget).root;
      if (targetRoot) {
        current = targetRoot;
        pending.unshift(...linkTarget.slice(targetRoot.length).split(/[/\\]+/));
      } else {
        pending.unshift(...linkTarget.split(/[/\\]+/));
      }
      continue;
    }
    try {
      current = realpathSync(next);
    } catch {
      return null;
    }
  }
  return current;
}

function sameInode(a: string, b: string): boolean {
  if (!existsSync(a) || !existsSync(b)) return false;
  try {
    const sa = statSync(a);
    const sb = statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

function targetsDefaultDest(candidate: string, defaultDest = DEFAULT_ARMY_COST_USAGE_DEST): boolean {
  const ca = resolveFsPath(candidate);
  const cb = resolveFsPath(defaultDest);
  if (ca === null || cb === null) return true;
  if (ca === cb) return true;
  if (sameInode(candidate, defaultDest) || sameInode(ca, cb)) return true;
  // Fail-closed for firmlink/symlink aliases (e.g. macOS /System/Volumes/Data/...) and
  // case-insensitive filename variants (e.g. ARMY_COST_USAGE.JSON) even when the snapshot is missing.
  const sameName = basename(ca).toLowerCase() === basename(cb).toLowerCase();
  return sameName && (dirname(ca) === dirname(cb) || sameInode(dirname(ca), dirname(cb)));
}

function parseArgs(argv: readonly string[]): { check: boolean; out: string; civList?: string[] } {
  let check = false;
  let rawOut = DEFAULT_ARMY_COST_USAGE_DEST;
  const civs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--check') check = true;
    else if (arg === '--out') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--out requires a file path');
      rawOut = next;
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
  if (civs.length && targetsDefaultDest(rawOut)) {
    throw new Error('--civ requires an explicit --out path distinct from the default snapshot');
  }
  const out = resolveFsPath(rawOut) ?? resolve(rawOut);
  return { check, out, ...(civs.length ? { civList: civs } : {}) };
}

const { check, out, civList } = parseArgs(process.argv.slice(2));
if (check && !existsSync(out)) {
  throw new Error('army_cost_usage.json missing; run npx vite-node scripts/army_cost_usage_build.ts');
}
const trees = await loadTrees();
const payload = buildArmyCostUsage({ core: CORE, trees }, ARMY_RESEARCH, civList ? { civList } : {});
const text = formatArmyCostUsageJson(payload);
if (check) {
  if (readFileSync(out, 'utf8') !== text) {
    throw new Error('army_cost_usage.json drift; run npx vite-node scripts/army_cost_usage_build.ts');
  }
  console.log(`army cost usage pinned reproduction OK (${Object.keys(payload.bonuses).length} bonuses)`);
} else {
  writeFileSync(out, text, 'utf8');
  console.log(`wrote ${out} (${Object.keys(payload.bonuses).length} bonuses)`);
}
