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

describe('Issue 1259 图片只能放在允许的资产与基线目录', () => {
  it.each([
    'docs/design/mockups/x.png',
    'role/x.webp',
    '.github/x.png',
    'feedback.JPG',
    'public/img-extra/x.jpeg',
    'src/features/civs/assets-extra/x.gif',
    'tests/e2e/__baselines__-extra/x.svg',
    'tests/e2e/artifacts/x.avif',
    'scripts/x.ico',
  ])('通过边界检查拦截 %s，并提示使用原生附件', (path) => {
    const problems = checkDocsBoundary({ files: [path] });
    expect(problems).toEqual([expect.stringContaining(`${path}：`)]);
    expect(problems[0]).toContain('GitHub Issue 原生附件');
  });

  it('放行运行时素材、测试基线和非图片源码', () => {
    const files = [
      'public/img/units/354.webp',
      'src/features/civs/assets/backgrounds/文明 图.WEBP',
      'tests/e2e/__baselines__/pre-redesign/x.png',
      'src/icon.svg.ts',
    ];
    expect(misplaced(files)).toEqual([]);
  });
});

describe('#1304 已退役的 docs/design/ 目录禁止回流', () => {
  it.each(['docs/design/README.md', 'docs/design/notes.md', 'docs/design/spec.json', 'docs/design/nested/deep/file.md', 'docs/design/.gitkeep'])(
    '通过边界检查拦截 %s 并指向 role/experience-design.md',
    (path) => {
      const problems = checkDocsBoundary({ files: [path] });
      expect(problems).toEqual([expect.stringContaining(`${path}：`)]);
      expect(problems[0]).toContain('docs/design/ 已退役');
      expect(problems[0]).toContain('role/experience-design.md');
      expect(problems[0]).toContain('GitHub Issue 原生附件');
    },
  );

  it('不误拦相似前缀路径', () => {
    expect(misplaced(['docs/design-notes.md', 'docs/designer/notes.md'])).toEqual([]);
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
