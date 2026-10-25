import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lines = (count: number) => [...Array.from({ length: count - 1 }, () => '// filler'), 'export {};'].join('\n');
const eslint = new ESLint({ cwd: process.cwd() });
const lintLines = async (count: number, path = 'src/new-size-probe.ts') => (await eslint.lintText(lines(count), { filePath: path }))[0]!;

describe('#288 文件规模门禁', () => {
  it('500 行以内不报警，501–600 行提示拆分', async () => {
    expect((await lintLines(500)).messages.filter((m) => m.ruleId === 'max-lines')).toEqual([]);
    for (const count of [501, 600]) {
      const result = await lintLines(count);
      expect(result.messages.filter((m) => m.ruleId === 'max-lines').map((m) => m.severity)).toEqual([1]);
      expect(result.errorCount).toBe(0);
    }
  });

  it('新 TS 和 TSX 文件超过 600 行报错，包括注释和空行', async () => {
    for (const path of ['src/new-size-probe.ts', 'src/new-size-probe.tsx']) {
      const result = await lintLines(601, path);
      expect(result.errorCount).toBe(1);
      expect(result.messages.some((m) => m.severity === 2 && m.message.includes('600'))).toBe(true);
    }
  });

  it('存量巨文件仅告警，不因本次新增门禁立即阻断维护', async () => {
    const result = await lintLines(601, 'src/domain/buildSim.ts');
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
  });

  it('CSS 800 行以内无告警，801 行只告警；语法错误仍失败', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-size-288-'));
    const file = join(dir, 'probe.css');
    const check = (count: number, rule = '.a { display: block; }') => {
      writeFileSync(file, [...Array.from({ length: count - 1 }, () => '/* filler */'), rule].join('\n') + '\n');
      return spawnSync(process.execPath, [resolve('scripts/check-css.mjs'), dir], { encoding: 'utf8' });
    };
    try {
      const short = check(800);
      expect(short.status).toBe(0);
      expect(short.stderr).toBe('');
      const long = check(801);
      expect(long.status).toBe(0);
      expect(long.stderr).toContain('超过 800 行');
      expect(long.stderr).toContain(file);
      const broken = check(801, '.a {');
      expect(broken.status).toBe(1);
      expect(broken.stderr).toContain('Unclosed block');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('未使用导出只报告，工具无法读取配置时仍失败', () => {
    const dir = mkdtempSync(join(tmpdir(), 'unused-288-'));
    const config = join(dir, 'tsconfig.json');
    writeFileSync(config, JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext' }, files: ['source.ts'] }));
    writeFileSync(join(dir, 'source.ts'), 'export const orphan = 1;\n');
    const report = (project: string) => spawnSync('npm', ['run', 'unused:check', '--', '--project', relative(process.cwd(), project)], { encoding: 'utf8' });
    try {
      const findings = report(config);
      expect(findings.status).toBe(0);
      expect(findings.stdout).toContain('orphan');
      const broken = report(join(dir, 'missing-config.json'));
      expect(broken.status).not.toBe(0);
      expect(broken.stderr).toContain('File not found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
