import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDataFamilies } from '../../scripts/check-data-families.mjs';

const roots: string[] = [];
const tempRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'data-families-820-'));
  roots.push(root);
  return root;
};
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('#820 数据族索引', () => {
  it('当前仓库登记完整（含有界历史证据）', () => {
    const result = checkDataFamilies(process.cwd());
    expect(result.errors).toEqual([]);
    expect(result.files).toHaveLength(18);
    expect(result.files).toContain('data/game/army_cost_usage.json');
    expect(result.files).toContain('data/content/civ-updates.json');
  });

  it('未登记的生成文件会失败', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'data/sources'), { recursive: true });
    mkdirSync(join(root, 'data/game'), { recursive: true });
    mkdirSync(join(root, 'tests/unit'), { recursive: true });
    writeFileSync(join(root, 'tests/unit/guard.test.ts'), '// fixture');
    writeFileSync(
      join(root, 'data/sources/data-families.json'),
      JSON.stringify({
        families: [
          {
            file: 'data/game/garrison_hosts.json',
            generator: null,
            pin: 'manual',
            check: [],
            tests: ['tests/unit/guard.test.ts'],
            auditStatus: 'manual-input',
          },
        ],
      }),
    );
    writeFileSync(join(root, 'data/sources/data_sources.json'), readFileSync('data/sources/data_sources.json'));
    writeFileSync(join(root, 'data/game/garrison_hosts.json'), '[]');
    writeFileSync(join(root, 'data/game/extra.json'), JSON.stringify({ meta: { generatedBy: 'scripts/extra_build.py', patch: 'DE Update 188329' } }));
    const result = checkDataFamilies(root);
    expect(result.errors.some((error) => error.includes('data/game/extra.json') && error.includes('未登记'))).toBe(true);
  });

  it('错误审计状态、缺失测试与非 manual 生成器都会失败', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'data/sources'), { recursive: true });
    mkdirSync(join(root, 'data/game'), { recursive: true });
    mkdirSync(join(root, 'tests/unit'), { recursive: true });
    writeFileSync(join(root, 'tests/unit/guard.test.ts'), '// fixture');
    writeFileSync(join(root, 'data/sources/data_sources.json'), readFileSync('data/sources/data_sources.json'));
    writeFileSync(join(root, 'data/game/garrison_hosts.json'), '[]');
    const registryPath = join(root, 'data/sources/data-families.json');
    const write = (overrides: Record<string, unknown>) =>
      writeFileSync(
        registryPath,
        JSON.stringify({
          families: [
            {
              file: 'data/game/garrison_hosts.json',
              generator: null,
              pin: 'manual',
              check: [],
              tests: ['tests/unit/guard.test.ts'],
              auditStatus: 'manual-input',
              ...overrides,
            },
          ],
        }),
      );
    write({ auditStatus: 'unknown' });
    expect(checkDataFamilies(root).errors.some((error) => error.includes('auditStatus 未知'))).toBe(true);
    write({ tests: ['tests/unit/missing.test.ts'] });
    expect(checkDataFamilies(root).errors.some((error) => error.includes('测试不存在'))).toBe(true);
    write({ generator: 'scripts/extra_build.py' });
    expect(checkDataFamilies(root).errors.some((error) => error.includes('generator 必须为 null'))).toBe(true);
  });

  it('keeps tracked payload JSON out of legacy code, docs, test, and tool directories', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const misplaced = tracked.filter((path) => {
      if (!path.endsWith('.json')) return false;
      return (
        path.startsWith('src/data/') ||
        (path.startsWith('src/content/') && !path.startsWith('src/content/schema/compiled/')) ||
        path.startsWith('src/domain/') ||
        path.startsWith('src/features/') ||
        path.startsWith('docs/data/') ||
        path.startsWith('docs/design/') ||
        path.startsWith('tests/') ||
        path.startsWith('scripts/')
      );
    });
    expect(misplaced).toEqual([]);
  });
});
