/**
 * Issue 1429: CLI entrypoint for generating and checking data/game/army_cost_usage.json.
 * Pure library logic lives in scripts/army_cost_usage_lib.ts (zero import side effects).
 *
 * Usage:
 *   npx vite-node scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 *   npx vite-node --script scripts/army_cost_usage_build.ts [--check] [--out <path>] [--civ <CivEn>]
 */
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { ARMY_RESEARCH } from '../src/data/armyResearch';
import { CORE } from '../src/data/core';
import { loadTrees } from '../src/data/index';
import { buildArmyCostUsage, DEFAULT_ARMY_COST_USAGE_DEST, formatArmyCostUsageJson } from './army_cost_usage_lib';

const MAX_SYMLINK_HOPS = 40;
const PATH_SEP_RE = process.platform === 'win32' ? /[/\\]+/ : /\/+/;

interface ResolvedFsPath {
  path: string;
  touchedPaths: string[];
}

interface ProtectedDanglingLink {
  linkPath: string;
  resolvedTarget: string;
}

interface ProtectedTargets {
  protectedDirs: string[];
  protectedPaths: Set<string>;
  protectedInodes: Set<string>;
  protectedDanglingLinks: ProtectedDanglingLink[];
}

function splitPathSegments(p: string): string[] {
  return p.split(PATH_SEP_RE).filter((seg) => seg.length > 0);
}

function endsWithSep(p: string): boolean {
  return p.endsWith('/') || (process.platform === 'win32' && p.endsWith('\\'));
}

function inodeKey(st: { dev: number; ino: number }): string {
  return `${st.dev}:${st.ino}`;
}

/**
 * Resolve a filesystem path in OS segment order (following symlinks before collapsing `..`,
 * preserving literal backslashes on POSIX, honoring trailing `/` on symlink targets as directory
 * constraints, and requiring traversed parent segments to be existing directories). Returns null
 * (fail-closed) on symlink loops, excessive hop depth, non-directory traversal, missing
 * intermediate directories, or filesystem errors.
 */
function resolveFsPath(filePath: string): ResolvedFsPath | null {
  if (!filePath) return null;
  const root = parse(filePath).root;
  const rest = root ? filePath.slice(root.length) : filePath;
  if (rest.length > 0 && endsWithSep(rest)) return null;
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
  const touchedPaths: string[] = [];
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
      touchedPaths.push(next);
      let linkTarget: string;
      try {
        linkTarget = readlinkSync(next);
      } catch {
        return null;
      }
      if (!linkTarget) return null;
      const targetRoot = parse(linkTarget).root;
      const targetRest = targetRoot ? linkTarget.slice(targetRoot.length) : linkTarget;
      const segs = splitPathSegments(targetRest);
      if (targetRest.length > 0 && endsWithSep(targetRest)) segs.push('.');
      if (targetRoot) current = targetRoot;
      pending.unshift(...segs);
      continue;
    }
    if (pending.length > 0 && !stat.isDirectory()) return null;
    try {
      current = realpathSync(next);
    } catch {
      return null;
    }
  }
  touchedPaths.push(current);
  return { path: current, touchedPaths };
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

function collectProtectedTargets(protectedDir: string, defaultDest: string): ProtectedTargets | null {
  const protectedDirs = [protectedDir];
  const protectedPaths = new Set<string>();
  const protectedInodes = new Set<string>();
  const protectedDanglingLinks: ProtectedDanglingLink[] = [];
  const seenLinkPaths = new Set<string>();

  const registerSymlink = (linkPath: string): boolean => {
    if (seenLinkPaths.has(linkPath)) return true;
    seenLinkPaths.add(linkPath);
    const resolved = resolveFsPath(linkPath);
    if (resolved === null) return true;
    try {
      const st = statSync(resolved.path);
      if (st.isDirectory()) {
        protectedDirs.push(resolved.path);
      } else {
        protectedPaths.add(resolved.path);
        protectedInodes.add(inodeKey(st));
      }
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        protectedDanglingLinks.push({ linkPath, resolvedTarget: resolved.path });
        return true;
      }
      return false;
    }
  };

  const stack = [protectedDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    for (const name of entries) {
      const entryPath = join(dir, name);
      let st;
      try {
        st = lstatSync(entryPath);
      } catch {
        return null;
      }
      if (st.isSymbolicLink()) {
        if (!registerSymlink(entryPath)) return null;
      } else if (st.isDirectory()) {
        stack.push(entryPath);
      } else {
        protectedInodes.add(inodeKey(st));
      }
    }
  }

  try {
    if (lstatSync(defaultDest).isSymbolicLink() && !registerSymlink(defaultDest)) return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return null;
  }

  return { protectedDirs, protectedPaths, protectedInodes, protectedDanglingLinks };
}

function targetsDefaultDest(candidate: string, defaultDest = DEFAULT_ARMY_COST_USAGE_DEST): boolean {
  const ca = resolveFsPath(candidate);
  const cb = resolveFsPath(defaultDest);
  const protectedDir = resolveFsPath(dirname(defaultDest));
  if (ca === null || cb === null || protectedDir === null) return true;
  if (samePathOrInode(ca.path, cb.path) || sameInode(candidate, defaultDest)) return true;

  const targets = collectProtectedTargets(protectedDir.path, defaultDest);
  if (targets === null) return true;

  // Block any --civ write that traverses a symlink inside data/game/ or resolves inside data/game/
  // (or any directory symlinked from data/game/).
  for (const dir of targets.protectedDirs) {
    if (ca.touchedPaths.some((p) => isWithinDir(p, dir))) return true;
  }

  // Block exact path matches against any symlink target (existing or dangling) inside data/game/.
  if (targets.protectedPaths.has(ca.path)) return true;
  if (targets.protectedDanglingLinks.some((entry) => entry.resolvedTarget === ca.path)) return true;

  // Block any existing file sharing an inode with a regular file or symlink target inside data/game/
  // (covers hardlinks into data/game/ and external targets referenced by symlinks inside data/game/).
  try {
    const st = statSync(ca.path);
    if (targets.protectedInodes.has(inodeKey(st))) return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return true;
  }

  return false;
}

function writeOutputSafely(out: string, text: string, isSubset: boolean, defaultDest = DEFAULT_ARMY_COST_USAGE_DEST): void {
  if (isSubset) {
    const ca = resolveFsPath(out);
    const protectedDir = resolveFsPath(dirname(defaultDest));
    if (ca === null || protectedDir === null) {
      throw new Error('--civ requires an explicit --out path outside data/game and distinct from the default snapshot');
    }
    const targets = collectProtectedTargets(protectedDir.path, defaultDest);
    if (targets === null) {
      throw new Error('--civ requires an explicit --out path outside data/game and distinct from the default snapshot');
    }
    const matchingLinks = targets.protectedDanglingLinks.filter((entry) => samePathOrInode(dirname(ca.path), dirname(entry.resolvedTarget)));
    if (matchingLinks.length > 0 && !existsSync(ca.path)) {
      // OS-kernel exact guard for any volume-specific equivalence (e.g. APFS Unicode case-folding)
      // when defaultDest or another data/game/ symlink is a dangling symlink into this directory.
      const fd = openSync(ca.path, 'wx');
      let committed = false;
      let isAlias = false;
      try {
        if (matchingLinks.some((entry) => sameInode(ca.path, entry.linkPath))) {
          isAlias = true;
        } else {
          writeFileSync(fd, text, 'utf8');
          committed = true;
        }
      } finally {
        try {
          closeSync(fd);
        } finally {
          if (!committed) {
            try {
              unlinkSync(ca.path);
            } catch {
              // Preserve the original write or alias error if cleanup itself fails.
            }
          }
        }
      }
      if (isAlias) {
        throw new Error('--civ requires an explicit --out path outside data/game and distinct from the default snapshot');
      }
      return;
    }
  }
  writeFileSync(out, text, 'utf8');
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
  writeOutputSafely(out, text, Boolean(civList?.length));
  console.log(`wrote ${out} (${Object.keys(payload.bonuses).length} bonuses)`);
}
