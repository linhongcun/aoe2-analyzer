import { expect, it } from 'vitest';
import { ladderShareUrl } from '../../src/features/ladder/shareLink';

it('#633 默认切片分享保留托管路径并使用完整规范URL', () => {
  expect(ladderShareUrl('https://example.test/aoe2-analyzer/?lang=zh#/ladder?old=1', { mode: '4v4', elo: 'all', pendingView: null })).toBe(
    'https://example.test/aoe2-analyzer/?lang=zh#/ladder',
  );
});

it('#633 非默认视图和可分享Elo参数按现有查询协议编码', () => {
  const href = ladderShareUrl('https://example.test/aoe2-analyzer/ladder/#/ladder', { mode: 'arabia1v1', elo: '1900+', pendingView: 'meta' });
  const query = new URLSearchParams(new URL(href).hash.split('?')[1]);
  expect(query.get('mode')).toBe('arabia1v1');
  expect(query.get('elo')).toBe('1900+');
  expect(query.get('view')).toBe('meta');
  expect(new URL(href).pathname).toBe('/aoe2-analyzer/ladder/');
});
