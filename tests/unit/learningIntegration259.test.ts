import { expect, it } from 'vitest';
import { pageKey, sharePageUrl } from '../../src/domain/sharePage';

it('接受多个尾斜线的路由仍识别为原工具的元数据', () => {
  for (const route of ['/match-review', '/team-plan']) {
    for (const suffix of ['', '/', '//', '///']) {
      expect(pageKey(route + suffix, '?notes=private')).toBe(route);
      expect(sharePageUrl(route + suffix, '', 'https://example.com/aoe2-analyzer/')).toBe('https://example.com/aoe2-analyzer' + route + '/');
    }
  }
});
