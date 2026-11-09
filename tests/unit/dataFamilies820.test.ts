import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  it('当前仓库 14 条登记完整', () => {
    const result = checkDataFamilies(process.cwd());
    expect(result.errors).toEqual([]);
    expect(result.files).toHaveLength(14);
  });

  it('未登记的生成文件会失败', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'src/data'), { recursive: true });
    mkdirSync(join(root, 'tests/unit'), { recursive: true });
    writeFileSync(join(root, 'tests/unit/guard.test.ts'), '// fixture');
    writeFileSync(
      join(root, 'scripts/data-families.json'),
      JSON.stringify({
        families: [
          {
            file: 'src/data/garrison_hosts.json',
            generator: null,
            pin: 'manual',
            check: [],
            tests: ['tests/unit/guard.test.ts'],
            auditStatus: 'manual-input',
          },
        ],
      }),
    );
    writeFileSync(join(root, 'scripts/data_sources.json'), readFileSync('scripts/data_sources.json'));
    writeFileSync(join(root, 'src/data/garrison_hosts.json'), '[]');
    writeFileSync(join(root, 'src/data/extra.json'), JSON.stringify({ meta: { generatedBy: 'scripts/extra_build.py', patch: 'DE Update 188329' } }));
    const result = checkDataFamilies(root);
    expect(result.errors.some((error) => error.includes('src/data/extra.json') && error.includes('未登记'))).toBe(true);
  });

  it('错误审计状态、缺失测试与非 manual 生成器都会失败', () => {
    const root = tempRoot();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'src/data'), { recursive: true });
    mkdirSync(join(root, 'tests/unit'), { recursive: true });
    writeFileSync(join(root, 'tests/unit/guard.test.ts'), '// fixture');
    writeFileSync(join(root, 'scripts/data_sources.json'), readFileSync('scripts/data_sources.json'));
    writeFileSync(join(root, 'src/data/garrison_hosts.json'), '[]');
    const registryPath = join(root, 'scripts/data-families.json');
    const write = (overrides: Record<string, unknown>) =>
      writeFileSync(
        registryPath,
        JSON.stringify({
          families: [
            {
              file: 'src/data/garrison_hosts.json',
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
});
