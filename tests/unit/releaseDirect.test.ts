import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error Node release scripts are plain modules
import { releaseReference } from '../../scripts/prepare-release.mjs';
it('#431 direct-main source is explicit, while optional release branch keeps its SHA', () => {
  const main = 'a'.repeat(40),
    branch = 'b'.repeat(40);
  expect(releaseReference(null, main)).toBe(main);
  expect(releaseReference(branch, main)).toBe(branch);
  expect(() => releaseReference('bad', main)).toThrow();
  expect(() => releaseReference(null, 'bad')).toThrow();
});
it('#431 release dry-run works without manufacturing a release branch or changing refs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'direct-release-'));
  const bare = join(directory, 'origin.git'),
    work = join(directory, 'work'),
    bin = join(directory, 'bin');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    execFileSync('git', ['clone', '-q', bare, work], { stdio: 'pipe' });
    git('config', 'user.name', 'fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(work, 'package.json'), JSON.stringify({ version: '0.34.1' }));
    writeFileSync(join(work, 'CHANGELOG.md'), '# Updates\n\n## [Unreleased]\n\n## [0.34.1] - 2026-10-25\n\n- workflow simplification\n');
    git('add', '.');
    git('commit', '-qm', 'direct main version');
    git('push', '-q', 'origin', 'main');
    const original = git('rev-parse', 'HEAD');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({check_runs:[{name:"test",status:"completed",conclusion:"success"}]}));\n');
    chmodSync(join(bin, 'gh'), 0o755);
    const result = spawnSync(process.execPath, [resolve('scripts/release.mjs'), 'v0.34.1', '--dry-run'], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('直接发布 main');
    expect(git('rev-parse', 'HEAD')).toBe(original);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.34.1', 'refs/heads/release/v0.34.1')).toBe('');
    expect(git('status', '--porcelain')).toBe('');
    writeFileSync(join(work, 'package.json'), JSON.stringify({ version: '0.34.2' }));
    git('commit', '-qam', 'next version');
    git('push', '-q', 'origin', 'main');
    const stale = spawnSync(process.execPath, [resolve('scripts/release.mjs'), 'v0.34.1', '--dry-run'], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain('与请求 v0.34.1 不一致');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
