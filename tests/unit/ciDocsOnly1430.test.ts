import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error CI scripts are plain Node modules.
import { isDocsOnlyDiff, isDocsOnlyPullRequest } from '../../scripts/check-pr-docs-only.mjs';

const modified = (path: string) => `:100644 100644 aaaaaaa bbbbbbb M\0${path}\0`;

describe('documentation-only PR checks', () => {
  it('accepts ordinary Markdown across the existing documentation locations', () => {
    expect(isDocsOnlyDiff(['README.md', 'docs/A B.md', 'role/software-development.md', '.github/pull_request_template.md'].map(modified).join(''))).toBe(true);
  });

  it.each([
    'CHANGELOG.md',
    'docs/reports/ECO-DATA.md',
    'docs/patch-notes/188329.md',
    'docs/assets/photo.png',
    '.github/workflows/ci.yml',
    'src/domain/duel.ts',
    'data/game/units.json',
    'src/notes.md',
  ])('keeps the default checks for a mixed PR with %s', (path) => {
    expect(isDocsOnlyDiff(modified('README.md') + modified(path))).toBe(false);
  });

  it('keeps default checks for an empty or incomplete diff', () => {
    expect(isDocsOnlyDiff('')).toBe(false);
    expect(isDocsOnlyDiff(modified('README.md').slice(0, -1))).toBe(false);
  });

  it('checks the actual checkout and both paths of a rename', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aoe2-ci-docs-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    const head = () => git('rev-parse', 'HEAD');
    const commit = () => {
      git('add', '-A');
      git('commit', '-m', 'Fixture');
    };

    try {
      git('init', '-b', 'main');
      mkdirSync(join(cwd, 'docs'));
      writeFileSync(join(cwd, 'README.md'), 'Title');
      writeFileSync(join(cwd, 'source.js'), 'export default 1;');
      commit();
      const ancestor = head();
      git('switch', '-c', 'pr');
      writeFileSync(join(cwd, 'docs', 'Guide.md'), 'Guide');
      commit();
      git('switch', 'main');
      writeFileSync(join(cwd, 'source.js'), 'export default 2;');
      commit();
      const base = head();
      git('merge', '--no-ff', 'pr', '-m', 'Simulated PR checkout');
      expect(isDocsOnlyPullRequest(base, head(), cwd)).toBe(true);
      expect(isDocsOnlyPullRequest(ancestor, head(), cwd)).toBe(false);
      expect(isDocsOnlyPullRequest(base, ancestor, cwd)).toBe(false);
      expect(isDocsOnlyPullRequest(undefined, head(), cwd)).toBe(false);

      const docsHead = head();
      git('mv', 'source.js', 'docs/Source.md');
      commit();
      expect(isDocsOnlyPullRequest(docsHead, head(), cwd)).toBe(false);

      const prior = head();
      symlinkSync('../README.md', join(cwd, 'docs', 'Link.md'));
      commit();
      expect(isDocsOnlyPullRequest(prior, head(), cwd)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
