import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs 没有类型声明
import { civCssOnly, classifyChanges, classifyRange, eventBase, releaseScope, versionOnly } from '../../scripts/ci-scope.mjs';

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const change = (path: string, before: string | null = '', after: string | null = '') => ({ path, before, after });
const packageText = (version: string, extra = {}) => JSON.stringify({ name: 'site', version, dependencies: { react: '18.3.1' }, ...extra });
const lockText = (version: string, extra = {}) =>
  JSON.stringify({ version, lockfileVersion: 3, packages: { '': { name: 'site', version }, 'node_modules/react': { version: '18.3.1', ...extra } } });

describe('#427 按实际变更选择验证范围', () => {
  it('文明卡片删除和限定 CSS、相关用例、普通文档与版本变更进入 civ-ui', () => {
    expect(
      classifyChanges([
        change('src/features/civs/components/CivList.tsx'),
        change(
          'src/shared/styles/base.css',
          '.cdl { position: absolute } .card { color: var(--color-text) }',
          '.card { color: var(--color-text) } #grid .card .mini { padding-left: 0 }',
        ),
        change('src/shared/styles/editorial.css', '/* 给旧图标留白 */ .card { display: grid }', '.card { display: grid }'),
        change('tests/e2e/v0290-326.spec.ts'),
        change('tests/e2e/civDlcFilters.spec.ts'),
        change('docs/design/civ-card-dlc-425.md'),
        change('CHANGELOG.md'),
        change('package.json', packageText('0.33.0'), packageText('0.33.1')),
        change('package-lock.json', lockText('0.33.0'), lockText('0.33.1')),
      ]),
    ).toBe('civ-ui');
  });

  it('工作流和发布策略维护只跑相关发布检查，混入文明页面则补视觉检查', () => {
    const maintenance = [
      change('.github/workflows/ci.yml'),
      change('.github/workflows/release.yml'),
      change('scripts/ci-scope.mjs'),
      change('scripts/prepare-release.mjs'),
      change('tests/unit/releaseCiScope.test.ts'),
      change('docs/TESTING.md'),
    ];
    expect(classifyChanges(maintenance)).toBe('maintenance');
    expect(classifyChanges([...maintenance, change('src/features/civs/components/CivList.tsx')])).toBe('civ-ui');
  });

  it('仓库根目录的代理和贡献政策文档属于维护范围', () => {
    expect(classifyChanges([change('AGENTS.md'), change('CONTRIBUTING.md'), change('scripts/ci-scope.mjs')])).toBe('maintenance');
  });

  it.each([
    'src/domain/buildSim.ts',
    'src/data/civs.json',
    'scripts/build_data.py',
    'scripts/data_sources.json',
    'public/img/dlc/0.webp',
    'src/features/units/components/UnitList.tsx',
    'src/shared/ui/widgets.tsx',
    'src/shared/nav/pageRegistry.ts',
    'src/shared/styles/tokens.css',
    'tests/unit/buildSim.test.ts',
    'tests/e2e/newUnknown.spec.ts',
    'docs/PATCH-NOTES/185872.md',
    'vite.config.ts',
  ])('%s 变化即使用完整验证，不因同时含文明 UI 或工作流而跳过', (path) => {
    expect(classifyChanges([change('src/features/civs/components/CivList.tsx'), change('.github/workflows/ci.yml'), change(path)])).toBe('full');
  });

  it.each([null, [], [null], [{}]])('缺失或无效的变更证据 %j 使用完整验证', (changes) => {
    expect(classifyChanges(changes)).toBe('full');
  });
});

describe('#427 共享样式只允许文明徽标与位置缩进变更', () => {
  it('按 CSS 语法比较，忽略注释与排版，保留相同规则及顺序', () => {
    expect(civCssOnly('.card { color: var(--color-text); } /* 旧说明 */', '/* 新说明 */\n.card{color:var(--color-text)}')).toBe(true);
  });

  it.each([
    ['.card { padding: 28px }', '.card { padding: 0 }'],
    ['@media (max-width: 600px) { .card { display: grid } }', '@media (max-width: 600px) { .card { display: block } }'],
    ['.cdl { display: block }', '.cdl, .card { display: none }'],
    ['', '#grid + main { display: none }'],
    ['', '@import "other.css";'],
    ['', '.card {'],
    [null, '#grid .card .mini { padding-left: 0 }'],
  ])('非限定样式、混合选择器或解析失败不进入快通道', (before, after) => {
    expect(civCssOnly(before, after)).toBe(false);
    expect(classifyChanges([change('src/shared/styles/base.css', before, after)])).toBe('full');
  });
});

describe('#427 版本号不能掩盖包管理变化', () => {
  it('仅 package 和锁文件的项目版本变化可缩小范围', () => {
    expect(versionOnly('package.json', packageText('0.33.0'), packageText('0.33.1'))).toBe(true);
    expect(versionOnly('package-lock.json', lockText('0.33.0'), lockText('0.33.1'))).toBe(true);
  });

  it.each([
    ['package.json', packageText('0.33.0'), packageText('0.33.1', { dependencies: { react: '19.0.0' } })],
    ['package.json', packageText('0.33.0'), packageText('0.33.1', { scripts: { test: 'exit 0' } })],
    ['package.json', packageText('0.33.0'), packageText('0.33.1-rc.1')],
    ['package-lock.json', lockText('0.33.0'), lockText('0.33.1', { version: '19.0.0' })],
    ['package-lock.json', lockText('0.33.0'), lockText('0.33.1', { integrity: 'changed' })],
    ['package-lock.json', lockText('0.33.0'), lockText('0.33.1', { resolved: 'https://example.invalid/react.tgz' })],
    ['package.json', null, packageText('0.33.1')],
    ['package-lock.json', lockText('0.33.0'), '{}'],
  ])('%s 的依赖、脚本、锁定内容、格式错误或文件缺失必须完整验证', (path, before, after) => {
    expect(versionOnly(path, before, after)).toBe(false);
    expect(classifyChanges([change(path, before, after)])).toBe('full');
  });
});

describe('#427 所有事件均明确界定完整提交范围', () => {
  it('PR 使用 base SHA；普通多提交 push 使用 before 而不是 HEAD 的父提交', () => {
    expect(eventBase('pull_request', { pull_request: { base: { sha: base } } }, 'refs/pull/1/merge')).toBe(base);
    expect(eventBase('push', { before: base }, 'refs/heads/main')).toBe(base);
  });

  it('仅首次 release 分支 push 可使用 origin/main 的 merge-base', () => {
    const event = { before: '0'.repeat(40) };
    expect(eventBase('push', event, 'refs/heads/release/v0.33.1', base)).toBe(base);
    expect(eventBase('push', event, 'refs/heads/main', base)).toBeNull();
    expect(eventBase('push', event, 'refs/heads/release/v0.33.1')).toBeNull();
  });

  it('手动运行、未知事件或缺失历史均不能隐式缩小范围', () => {
    expect(eventBase('workflow_dispatch', { before: base }, 'refs/heads/main')).toBeNull();
    expect(eventBase('push', {}, 'refs/heads/main')).toBeNull();
    expect(classifyRange(null, head)).toBe('full');
    expect(classifyRange(base, head)).toBe('full');
  });
});

describe('#427 Release 仅复用匹配已部署 SHA 且重新核实的 CI 范围', () => {
  it('匹配的已验证主干运行产物可复用 civ-ui 或 maintenance', () => {
    for (const scope of ['civ-ui', 'maintenance']) expect(releaseScope({ base, head, scope }, head, () => scope)).toBe(scope);
  });

  it.each([null, {}, { base, head, scope: 'unknown' }, { base, head: base, scope: 'civ-ui' }, { base: 'missing', head, scope: 'civ-ui' }])(
    '缺失或错误的范围产物 %j 使用完整线上核验',
    (manifest) => {
      expect(releaseScope(manifest, head, () => 'civ-ui')).toBe('full');
    },
  );

  it('产物声称快通道但实际源码范围不同或历史缺失时仍完整核验', () => {
    expect(releaseScope({ base, head, scope: 'civ-ui' }, head, () => 'full')).toBe('full');
    expect(releaseScope({ base, head, scope: 'civ-ui' }, head)).toBe('full');
  });
});

const repositories: string[] = [];
afterEach(() => {
  for (const directory of repositories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it('#427 真实 Git 多提交范围不会遗漏更早的领域变更，单独文明变更可走快通道', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  repositories.push(directory);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const commit = (path: string, content: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
    git('add', '.');
    git('-c', 'user.name=Scope test', '-c', 'user.email=scope@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  const first = commit('docs/guide.md', 'guide');
  const domain = commit('src/domain/buildSim.ts', 'changed calculation');
  const civ = commit('src/features/civs/components/CivList.tsx', 'changed civilization card');
  const entry = join(process.cwd(), 'scripts/ci-scope.mjs');
  const classify = (from: string) =>
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { classifyRange } from ${JSON.stringify(entry)}; console.log(classifyRange(${JSON.stringify(from)}, ${JSON.stringify(civ)}));`,
      ],
      { cwd: directory, encoding: 'utf8' },
    ).trim();
  expect(classify(first)).toBe('full');
  expect(classify(domain)).toBe('civ-ui');
});
