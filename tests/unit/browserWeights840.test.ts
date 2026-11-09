import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { compareBrowserWeights } from '../../scripts/check-browser-weights.mjs';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import { buildShardManifest, canonicalCases, missingWeightFiles } from '../../scripts/ci-shards.mjs';

const weights = JSON.parse(readFileSync('scripts/ci-browser-weights.json', 'utf8')) as {
  schema: number;
  defaultCaseMs: number;
  staticSweepMs: number;
  files: Record<string, number>;
};
const specNames = readdirSync('tests/e2e', { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

function testCase(file = 'smoke.spec.ts') {
  return canonicalCases([
    {
      id: `id-${file}`,
      project: '',
      file: `tests/e2e/${file}`,
      selectorFile: file,
      titlePath: ['case'],
      repeatEachIndex: 0,
      expectedStatus: 'passed',
      allowedSkip: null,
    },
  ])[0];
}

describe('浏览器分片权重覆盖（issue 840）', () => {
  it('真实权重覆盖全部 spec，且值都是正安全整数', () => {
    expect(compareBrowserWeights(specNames, weights)).toEqual([]);
    expect(Object.keys(weights.files)).toHaveLength(specNames.filter((name) => name.endsWith('.spec.ts')).length);
    for (const value of Object.values(weights.files)) expect(Number.isSafeInteger(value) && value > 0).toBe(true);
    expect(weights.files['tests/e2e/staticSweep338.spec.ts']).toBe(weights.staticSweepMs);
  });

  it('缺失、多余、非法权重和 schema 都会失败', () => {
    const base = { schema: 1, defaultCaseMs: 1500, staticSweepMs: 85000, files: { 'tests/e2e/a.spec.ts': 1 } };
    expect(compareBrowserWeights(['a.spec.ts'], base)).toEqual([]);
    expect(compareBrowserWeights(['a.spec.ts', 'b.spec.ts'], base).join('\n')).toContain('缺失权重: tests/e2e/b.spec.ts');
    expect(compareBrowserWeights(['a.spec.ts'], { ...base, files: { ...base.files, 'tests/e2e/c.spec.ts': 1 } }).join('\n')).toContain(
      '多余权重: tests/e2e/c.spec.ts',
    );
    expect(compareBrowserWeights(['a.spec.ts'], { ...base, files: { ...base.files, 'tests/e2e/a.spec.ts': 0 } }).join('\n')).toContain('正整数');
    expect(compareBrowserWeights(['a.spec.ts'], { ...base, schema: 2 }).join('\n')).toContain('schema');
    expect(compareBrowserWeights(['a.spec.ts'], { ...base, defaultCaseMs: 0 }).join('\n')).toContain('defaultCaseMs');
  });

  it('缺失权重会进入 manifest 的 missingWeightFiles 并有保守回退', () => {
    const cases = [testCase('a.spec.ts')];
    expect(missingWeightFiles(cases, { files: {} })).toEqual(['tests/e2e/a.spec.ts']);
    expect(missingWeightFiles(cases, { files: { 'tests/e2e/a.spec.ts': 1500 } })).toEqual([]);
    const manifest = buildShardManifest({ cases, sourceBuild: null, shardCount: 1, weights: { files: {}, defaultCaseMs: 1500 } });
    expect(manifest.missingWeightFiles).toEqual(['tests/e2e/a.spec.ts']);
    const unit = manifest.shards[0]?.units[0];
    expect(unit?.weightSource).toBe('conservative-case');
  });

  it('CLI 对未登记 fixture 非 0 退出', () => {
    const root = mkdtempSync(join(tmpdir(), 'browser-weights-'));
    try {
      mkdirSync(join(root, 'tests/e2e'), { recursive: true });
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'tests/e2e/a.spec.ts'), '');
      writeFileSync(join(root, 'scripts/ci-browser-weights.json'), JSON.stringify({ schema: 1, defaultCaseMs: 1500, staticSweepMs: 85000, files: {} }));
      const result = spawnSync(process.execPath, ['scripts/check-browser-weights.mjs', '--root', root], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('tests/e2e/a.spec.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
