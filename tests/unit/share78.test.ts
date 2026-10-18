import { expect, it } from 'vitest';
import { PAGE_META, pageKey, sharePageUrl } from '../../src/domain/sharePage';
it('真实路径分享保留 PK 参数、子路径和开局设置', () => {
  const base = 'https://example.com/aoe2-analyzer/';
  expect(sharePageUrl('/duel', '?a=38.Franks.3&b=329.Berbers.3&na=20&nb=10', base)).toBe(base + 'duel/?a=38.Franks.3&b=329.Berbers.3&na=20&nb=10');
  expect(sharePageUrl('/builds', '?bo=scouts-18&civ=Franks&house=0', base)).toBe(base + 'builds/scouts-18/?civ=Franks&house=0');
  expect(pageKey('/unit/38/Franks')).toBe('/unit/38');
  expect(sharePageUrl('/unit/38/Franks', '', base)).toBe(base + 'unit/38/#/unit/38/Franks');
});
it('每类详情具备原始元数据和带含义的三项分享数字', () => {
  for (const route of ['/unit/38', '/tech/375', '/civ/Franks']) {
    expect(PAGE_META[route]!.stats).toHaveLength(3);
    expect(PAGE_META[route]!.description.length).toBeGreaterThan(10);
    expect(PAGE_META[route]!.icon).toMatch(/^img\//);
  }
  expect(PAGE_META['/civ/Franks']!.note).toContain('主观');
  expect(PAGE_META['/civ/Franks/bonus/team']!.title).toBe('法兰克团队加成');
});
