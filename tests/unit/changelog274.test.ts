import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs 没有类型声明
import { changelogOrderErrors, insertVersionSection, unreleasedBody } from '../../scripts/changelog.mjs';

const changelog = readFileSync('CHANGELOG.md', 'utf8');

/** annotated tag 的北京时间日期。v0.4.0 / v0.5.0 的 GitHub Release 跨过了北京零点，小节日期认 tag。 */
const TAG_DATES: Record<string, string> = {
  '0.30.0': '2026-10-23',
  '0.29.0': '2026-10-22',
  '0.28.0': '2026-10-21',
  '0.27.0': '2026-10-21',
  '0.26.0': '2026-10-20',
  '0.25.0': '2026-10-20',
  '0.24.0': '2026-10-20',
  '0.23.0': '2026-10-20',
  '0.22.0': '2026-10-19',
  '0.21.0': '2026-10-19',
  '0.20.0': '2026-10-19',
  '0.19.0': '2026-10-19',
  '0.18.0': '2026-10-19',
  '0.17.0': '2026-10-19',
  '0.16.0': '2026-10-19',
  '0.15.0': '2026-10-19',
  '0.14.0': '2026-10-19',
  '0.13.0': '2026-10-19',
  '0.12.0': '2026-10-18',
  '0.11.0': '2026-10-17',
  '0.10.0': '2026-10-17',
  '0.9.0': '2026-10-16',
  '0.8.0': '2026-10-16',
  '0.7.0': '2026-10-16',
  '0.6.0': '2026-10-14',
  '0.5.0': '2026-10-12',
  '0.4.0': '2026-10-11',
};

const SHIPPED = ['#190', '#62', '#187', '#6'];

describe('CHANGELOG 结构 #274', () => {
  it('说明和 [Unreleased] 在最前，版本从新到旧', () => {
    expect(changelogOrderErrors(changelog)).toEqual([]);
    expect(changelog.indexOf('## 版本号规则')).toBeLessThan(changelog.indexOf('## [Unreleased]'));
    expect(changelog.indexOf('## 每个版本的写法')).toBeLessThan(changelog.indexOf('## [Unreleased]'));
  });

  it('已发布条目不留在 Unreleased，并进入 v0.13.0', () => {
    const open = unreleasedBody(changelog);
    for (const issue of SHIPPED) expect(open, issue).not.toContain(`（${issue}）`);
    for (const issue of ['#383', '#270']) {
      expect(open).not.toContain(`（${issue}）`);
      expect(section('0.30.1')).toContain(`（${issue}）`);
    }
    const v13 = section('0.13.0');
    expect(v13).toContain('（#190）');
    expect(v13).toContain('（#62）');
    expect(v13).toContain('（#187）');
    expect(v13).toContain('（#6）');
  });

  it('版本日期与 tag 的北京时间一致，v0.12.1 没有单独发版', () => {
    for (const [version, date] of Object.entries(TAG_DATES)) {
      expect(changelog, version).toContain(`## [${version}] - ${date}`);
    }
    expect(section('0.12.1')).toMatch(/没有单独的 tag/);
    expect(section('0.12.1')).toMatch(/v0\.13\.0/);
  });

  it('插入新版本时落在 [Unreleased] 之后，不跑到文首', () => {
    const sample = `# 更新日志\n\n## 版本号规则\n\n说明。\n\n## [Unreleased]\n\n- 未发布。\n\n## [0.30.0] - 2026-10-23\n\n- 已发布。\n`;
    const next = insertVersionSection(sample, '0.31.0', '2026-10-24', '### 更新说明\n\n- 新版本。');
    expect(next.indexOf('## [0.31.0]')).toBeGreaterThan(next.indexOf('## [Unreleased]'));
    expect(next.indexOf('## [0.31.0]')).toBeLessThan(next.indexOf('## [0.30.0]'));
    expect(next.indexOf('## 版本号规则')).toBeLessThan(next.indexOf('## [Unreleased]'));
    expect(changelogOrderErrors(next)).toEqual([]);
  });
});

function section(version: string) {
  const start = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n`, 'm').exec(changelog);
  if (!start) return '';
  const rest = changelog.slice(start.index + start[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
