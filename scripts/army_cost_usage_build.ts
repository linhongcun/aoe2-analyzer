/**
 * Issue 1429: CLI entrypoint for generating and checking data/game/army_cost_usage.json.
 * Pure library logic lives in scripts/army_cost_usage_lib.ts (zero import side effects).
 *
 * Usage:
 *   npx vite-node scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 *   npx vite-node --script scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse } from 'node:path';
import { ARMY_RESEARCH } from '../src/data/armyResearch';
import { CORE } from '../src/data/core';
import { loadTrees } from '../src/data/index';
import { buildArmyCostUsage, DEFAULT_ARMY_COST_USAGE_DEST, formatArmyCostUsageJson } from './army_cost_usage_lib';

const MAX_SYMLINK_HOPS = 40;
const PATH_SEP_RE = process.platform === 'win32' ? /[/\\]+/ : /\/+/;

function splitPathSegments(p: string): string[] {
  return p.split(PATH_SEP_RE).filter((seg) => seg.length > 0);
}

/**
 * Resolve a filesystem path in OS segment order (following symlinks before collapsing `..`,
 * preserving literal backslashes on POSIX, and requiring traversed parent segments to be
 * existing directories). Returns null (fail-closed) on symlink loops, excessive hop depth,
 * non-directory traversal, missing intermediate directories, or filesystem errors.
 */
function resolveFsPath(filePath: string): string | null {
  if (!filePath) return null;
  const root = parse(filePath).root;
  const rest = root ? filePath.slice(root.length) : filePath;
  if (rest.length > 0 && (rest.endsWith('/') || (process.platform === 'win32' && rest.endsWith('\\')))) {
    return null;
  }
  let current: string;
  if (root) {
    current = root;
  } else {
    try {
      current = realpathSync(process.cwd());
    } catch {
      return null;
    }
  }
  const pending = splitPathSegments(rest);
  let symlinkHops = 0;
  while (pending.length > 0) {
    const seg = pending.shift()!;
    if (seg === '.') continue;
    if (seg === '..') {
      current = dirname(current);
      continue;
    }
    const next = join(current, seg);
    let stat;
    try {
      stat = lstatSync(next);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' && pending.length === 0) {
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
        pending.unshift(...splitPathSegments(linkTarget.slice(targetRoot.length)));
      } else {
        pending.unshift(...splitPathSegments(linkTarget));
      }
      continue;
    }
    if (pending.length > 0 && !stat.isDirectory()) return null;
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

function canonicalFilename(name: string): string {
  return name
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .normalize('NFKC')
    .toUpperCase()
    .toLowerCase()
    .normalize('NFKC');
}

function samePathOrInode(a: string, b: string): boolean {
  return a === b || sameInode(a, b);
}

function isWithinDir(targetPath: string, protectedDir: string): boolean {
  let cur = targetPath;
  while (true) {
    if (samePathOrInode(cur, protectedDir)) return true;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

function targetsDefaultDest(candidate: string, defaultDest = DEFAULT_ARMY_COST_USAGE_DEST): boolean {
  const ca = resolveFsPath(candidate);
  const cb = resolveFsPath(defaultDest);
  const protectedDir = resolveFsPath(dirname(defaultDest));
  if (ca === null || cb === null || protectedDir === null) return true;
  if (samePathOrInode(ca, cb) || sameInode(candidate, defaultDest)) return true;
  // Block any --civ write into data/game/ at any nesting depth (resolving data/game/ independently
  // of the default snapshot target, including firmlink aliases and arbitrary Unicode/case
  // equivalents on case-insensitive filesystems such as APFS `army_coſt_usage.json`).
  if (isWithinDir(ca, protectedDir)) return true;
  // When the default snapshot resolves to a non-existent external path (e.g. a dangling symlink),
  // sameInode cannot match it yet; also block case/Unicode-folding aliases in that same directory
  // while keeping unrelated sibling files in the external directory writable.
  return samePathOrInode(dirname(ca), dirname(cb)) && canonicalFilename(basename(ca)) === canonicalFilename(basename(cb));
}

function parseArgs(argv: readonly string[]): { check: boolean; out: string; civList?: string[] } {
  let check = false;
  let out = DEFAULT_ARMY_COST_USAGE_DEST;
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
  if (civs.length && targetsDefaultDest(out)) {
    throw new Error('--civ requires an explicit --out path outside data/game and distinct from the default snapshot');
  }
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
