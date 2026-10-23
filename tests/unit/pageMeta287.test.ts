import { describe, expect, it } from 'vitest';
import { canonicalMetaKey, pageKey, sharePageUrl } from '../../src/domain/sharePage';

const base = 'https://example.com/aoe2-analyzer/';

describe('页面元信息跟随匹配到的路由 #287', () => {
  it('静态页用路由 pattern，不看地址栏大小写', () => {
    for (const [pattern, alias] of [
      ['/game-clock', '/GAME-CLOCK'],
      ['/duel', '/DUEL'],
      ['/hotkeys', '/HOTKEYS'],
    ] as const) {
      expect(canonicalMetaKey(pattern, alias)).toBe(pattern);
      expect(pageKey(alias)).toBe('/');
      expect(sharePageUrl(alias, '', base, pattern)).toBe(`${base}${pattern.slice(1)}/`);
    }
  });

  it('带参数的页面仍指向具体条目', () => {
    expect(canonicalMetaKey('/unit/*', '/unit/38/Franks')).toBe('/unit/38');
    expect(canonicalMetaKey('/civ/:en', '/civ/Franks')).toBe('/civ/Franks');
    expect(canonicalMetaKey('/builds', '/BUILDS', '?bo=scouts-18')).toBe('/builds/scouts-18');
    expect(sharePageUrl('/GAME-CLOCK', '?speed=1.7', base, '/game-clock')).toBe(`${base}game-clock/?speed=1.7`);
  });

  it('复盘和团战去掉查询后仍是该页，而不是首页', () => {
    for (const pattern of ['/match-review', '/team-plan']) {
      expect(canonicalMetaKey(pattern, pattern.toUpperCase(), '?notes=private')).toBe(pattern);
      expect(sharePageUrl(pattern.toUpperCase(), '', base, pattern)).toBe(`${base}${pattern.slice(1)}/`);
    }
  });
});
