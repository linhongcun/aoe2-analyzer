import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import scouting from '../../src/content/scouting.json';
import campaigns from '../../src/content/campaigns.json';
import units from '../../src/data/units.json';
import construction from '../../src/data/construction.json';
import { checkDirectory, LEGACY_SOURCE_BASELINE, ratchetProblems, validateDocument } from '../../scripts/content-schema.mjs';

describe('#285 每份内容和生成 JSON 都有可诊断的 schema', () => {
  it('覆盖完整数据目录且有效数据不被修改', () => {
    const before = JSON.stringify(scouting);
    const result = checkDirectory(process.cwd());
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return path.startsWith('src/content/schema') ? [] : entry.isDirectory() ? files(path) : path.endsWith('.json') ? [path] : [];
      });
    expect(result.files.sort()).toEqual([...files('src/content'), ...files('src/data')].sort());
    expect(result.files.length).toBeGreaterThan(0);
    const migration = ratchetProblems(result.problems);
    expect(migration.errors).toEqual([]);
    expect(migration.warnings).toHaveLength(LEGACY_SOURCE_BASELINE.length);
    expect(JSON.stringify(scouting)).toBe(before);
  });

  it('新增未登记 JSON 不能被通用 object schema 放过', () => {
    expect(validateDocument('src/content/not-registered.json', {}).valid).toBe(false);
  });

  it('固定对象未知字段和嵌套错误类型都会被拒绝', () => {
    expect(validateDocument('src/content/scouting.json', { ...scouting, privateNote: 'internal' }).valid).toBe(false);
    expect(validateDocument('src/data/units.json', [{ ...units[0], hp: '100' }]).valid).toBe(false);
  });

  it.each([
    'file:///cache/raw.csv',
    'javascript:alert(1)',
    '/data/source.json',
    'http://localhost/source',
    'https://192.168.1.3/source',
    'https://[::1]/source',
    'http://[::ffff:127.0.0.1]/source',
    'http://0x7f000001/source',
  ])('玩家来源拒绝 %s', (url) => {
    const bad = structuredClone(scouting);
    bad.sources[0]!.url = url;
    expect(validateDocument('src/content/scouting.json', bad).valid).toBe(false);
  });

  it('合法公开 pin URL 与隐藏战役证据不被误判成可见 SHA 泄露', () => {
    const good = structuredClone(scouting);
    good.sources[0]!.url = 'https://github.com/SiegeEngineers/aoe2techtree/blob/0123456789abcdef0123456789abcdef01234567/data/data.json';
    expect(validateDocument('src/content/scouting.json', good).valid).toBe(true);
    expect(validateDocument('src/content/campaigns.json', campaigns).valid).toBe(true);
  });

  it('正常游戏版本与核对日期不会被短十六进制正则误杀', () => {
    const good = structuredClone(scouting);
    good.sources[0]!.title = 'DE185872 数据（2026-10-26 核对）';
    expect(validateDocument('src/content/scouting.json', good).valid).toBe(true);
  });

  it.each([
    'SHA256: 0123456789abcdef',
    '来自 internal.csv 的 CSV 行',
    '提交号 0123456789abcdef0123456789abcdef01234567',
    'main @ 075ead2',
    '075ead2',
    '来源 075ead2',
  ])('可见来源标题拒绝内部用语 %s', (title) => {
    const bad = structuredClone(scouting);
    bad.sources[0]!.title = title;
    expect(validateDocument('src/content/scouting.json', bad).valid).toBe(false);
  });

  it('施工索引的范围与结构一同检查', () => {
    const bad = structuredClone(construction);
    bad.civs.Franks.automatic = bad.automaticSets.length;
    expect(validateDocument('src/data/construction.json', bad).valid).toBe(false);
  });

  it('分享统计 tuple 不接受多余项', () => {
    expect(
      validateDocument('src/data/page-metadata.json', {
        '/': { title: '页面', description: '页面说明', stats: [['数量', 1, '未知列']] },
      }).valid,
    ).toBe(false);
  });

  it('默认告警与 CI strict 模式的实际退出码不同', () => {
    const root = mkdtempSync(join(tmpdir(), 'content-285-'));
    mkdirSync(join(root, 'src/content'), { recursive: true });
    writeFileSync(join(root, 'src/content/scouting.json'), JSON.stringify({ ...scouting, unknownField: 1 }));
    const run = (strict: boolean) =>
      spawnSync(process.execPath, [resolve('scripts/check-content.mjs'), '--root', root, ...(strict ? ['--strict'] : [])], { encoding: 'utf8' });
    try {
      const warning = run(false);
      expect(warning.status).toBe(0);
      expect(warning.stdout + warning.stderr).toContain('src/content/scouting.json');
      expect(warning.stdout + warning.stderr).toContain('unknownField');
      expect(run(true).status).toBe(1);
      writeFileSync(join(root, 'src/content/scouting.json'), JSON.stringify(scouting));
      expect(run(true).status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('真实文件发现器报告未登记 JSON 和坏语法，strict CLI 必须失败', () => {
    const root = mkdtempSync(join(tmpdir(), 'content-discovery-285-'));
    mkdirSync(join(root, 'src/content'), { recursive: true });
    mkdirSync(join(root, 'src/data'), { recursive: true });
    writeFileSync(join(root, 'src/content/scouting.json'), JSON.stringify(scouting));
    writeFileSync(join(root, 'src/content/not-registered.json'), '{}');
    writeFileSync(join(root, 'src/data/construction.json'), '{broken');
    try {
      const result = checkDirectory(root);
      expect(result.files).toEqual(['src/content/not-registered.json', 'src/content/scouting.json', 'src/data/construction.json']);
      expect(result.problems.map((entry) => [entry.file, entry.code])).toEqual([
        ['src/content/not-registered.json', 'coverage'],
        ['src/data/construction.json', 'syntax'],
      ]);
      const cli = spawnSync(process.execPath, [resolve('scripts/check-content.mjs'), '--root', root, '--strict'], { encoding: 'utf8' });
      expect(cli.status).toBe(1);
      expect(cli.stderr).toContain('src/content/not-registered.json');
      expect(cli.stderr).toContain('src/data/construction.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('新问题不能通过新增或修改候选 baseline 放行', () => {
    const problems = checkDirectory(process.cwd()).problems;
    const bad = structuredClone(scouting);
    bad.sources[0]!.title = 'commit abcdef12';
    const fresh = validateDocument('src/content/scouting.json', bad).problems;
    const issue = fresh.find((entry) => entry.keyword === 'format')!;
    const extra = { file: issue.file, path: issue.path, format: 'source-text', valueSha256: issue.valueSha256! };
    expect(ratchetProblems([...problems, ...fresh], [...LEGACY_SOURCE_BASELINE, extra]).errors.some((entry) => entry.code === 'baseline')).toBe(true);
    const modified = LEGACY_SOURCE_BASELINE.map((entry, index) => (index === 0 ? { ...entry, valueSha256: '0'.repeat(64) } : entry));
    expect(ratchetProblems(problems, modified).errors.some((entry) => entry.code === 'baseline')).toBe(true);
  });

  it('同一路径和旧指纹也不能豁免结构或 URL 错误', () => {
    const problems = checkDirectory(process.cwd()).problems;
    const legacy = problems[0]!;
    for (const forged of [
      { ...legacy, keyword: 'additionalProperties', params: { additionalProperty: 'privateCsv' } },
      { ...legacy, keyword: 'format', params: { format: 'public-url' } },
    ])
      expect(ratchetProblems([...problems, forged]).errors).toContainEqual(forged);
  });

  it('陈旧 baseline 必须删掉，清理后不能留下未来回归豁免', () => {
    const first = LEGACY_SOURCE_BASELINE[0]!;
    const remaining = checkDirectory(process.cwd()).problems.filter((entry) => entry.file !== first.file || entry.path !== first.path);
    expect(ratchetProblems(remaining).errors.some((entry) => entry.code === 'baseline-stale')).toBe(true);
    const reduced = LEGACY_SOURCE_BASELINE.filter((entry) => entry !== first);
    expect(ratchetProblems(remaining, reduced).errors).toEqual([]);
  });
});
