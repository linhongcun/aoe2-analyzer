import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocsBoundary, markdownReads, misplaced, READERS } from '../../scripts/check-docs-boundary.mjs';

describe('#1077 Markdown 只放文档目录，data/ 只放 JSON', () => {
  it('仓库当前状态通过', () => {
    expect(checkDocsBoundary()).toEqual([]);
  });

  it.each(['data/README.md', 'data/reports/ECO-DATA.md', 'data/patch-notes/188329.md', 'src/features/civs/NOTES.md', 'scripts/README.md', 'NOTES.md'])(
    '%s 位置不对',
    (path) => {
      expect(misplaced([path])).toHaveLength(1);
    },
  );

  it.each(['docs/DATA-UPDATE.md', 'docs/reports/ECO-DATA.md', 'role/product-manager.md', '.github/pull_request_template.md', 'README.md', 'CHANGELOG.md'])(
    '%s 位置正确',
    (path) => {
      expect(misplaced([path])).toEqual([]);
    },
  );

  it('data/ 下的脚本、文本等非 JSON 文件被拦下，JSON 放行', () => {
    expect(misplaced(['data/game/units.json', 'data/sources/history_inputs/66692-coverage.json'])).toEqual([]);
    expect(misplaced(['data/sources/notes.txt', 'data/game/build.py'])).toHaveLength(2);
  });
});

describe('#1077 代码不读 Markdown 正文', () => {
  it.each([
    ['tests/unit/a.test.ts', "expect(readFileSync('docs/reports/EFFECTS-AUDIT.md', 'utf8')).toMatch(/小计/);"],
    ['tests/unit/b.test.ts', "const guide = read('docs/DATA-UPDATE.md');"],
    ['tests/py/test_a.py', "text = (ROOT / 'docs/reports/HISTORY-DATA.md').read_text()"],
    ['scripts/a.py', "DOC_PATH = 'docs/DATA-UPDATE.md'\n\ndoc = text(DOC_PATH)"],
    ['tests/unit/c.test.ts', "for (const file of ['README.md', 'AGENTS.md']) {\n  const body = read(file);\n}"],
    ['scripts/b.py', "VIEW = 'docs/reports/ECO-DATA.md'\nold = (ROOT / VIEW).read_text()"],
    ['vite.config.ts', "const notes = readFileSync('docs/patch-notes/188329.md', 'utf8');"],
  ])('%s 被拦下', (path, source) => {
    expect(markdownReads(path, source)).toHaveLength(1);
  });

  it.each([
    ['写出排版不算读取', 'scripts/a.py', "VIEW = 'docs/reports/ECO-DATA.md'\n(ROOT / VIEW).write_text(report_view(out, report))"],
    ['指向 GitHub 的链接', 'src/a.ts', 'export const url = (build: string) => `${REPO}/blob/main/docs/patch-notes/${build}.md`;'],
    ['CHANGELOG.md 可以读', 'tests/unit/a.test.ts', "const changelog = readFileSync('CHANGELOG.md', 'utf8');"],
    ['按提交读 CHANGELOG.md', 'scripts/release.mjs', "const text = git('show', `${ref}:CHANGELOG.md`);"],
    ['只把路径当作改动清单', 'tests/unit/a.test.ts', "expect(planChanges([change('docs/TESTING.md')])).toMatchObject({ full: false });"],
    ['读 JSON 记录', 'tests/unit/a.test.ts', "const audit = JSON.parse(readFileSync('data/reports/effects-audit.json', 'utf8'));"],
  ])('%s', (_, path, source) => {
    expect(markdownReads(path, source)).toEqual([]);
  });

  it('只检查代码文件，文档和数据里的路径不算', () => {
    const files = ['docs/README.md', 'data/sources/x.json', 'tests/unit/a.test.ts'];
    const read = () => "const guide = read('docs/DATA-UPDATE.md');";
    expect(checkDocsBoundary({ files, read })).toEqual(['tests/unit/a.test.ts:1 读取 docs/DATA-UPDATE.md']);
  });

  it('登记的例外都还在，且各有理由', () => {
    for (const [path, reason] of Object.entries(READERS)) {
      expect(existsSync(path), path).toBe(true);
      expect(reason).not.toBe('');
    }
  });
});
