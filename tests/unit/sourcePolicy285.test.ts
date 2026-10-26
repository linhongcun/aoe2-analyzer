import { describe, expect, it } from 'vitest';
import { isPublicSourceText, isPublicSourceUrl } from '../../src/content/schema/policy.mjs';

describe('#285 可见来源格式与内部证据的边界', () => {
  it.each([
    'https://github.com/owner/project/blob/0123456789abcdef0123456789abcdef01234567/data.json',
    'https://www.ageofempires.com/games/age-of-empires-ii/',
    'http://example.com/guide',
    'https://8.8.8.8/guide',
    'https://[2606:4700:4700::1111]/guide',
  ])('允许外部 HTTP(S) 格式 %s', (url) => expect(isPublicSourceUrl(url)).toBe(true));

  it.each([
    'file:///data/source.csv',
    '/source/data.json',
    'javascript:alert(1)',
    'https://user:password@github.com/repo',
    'http://localhost/guide',
    'http://127.0.0.1/guide',
    'http://0x7f000001/guide',
    'http://192.168.1.1/guide',
    'http://169.254.169.254/latest',
    'https://[::1]/guide',
    'http://[::ffff:127.0.0.1]/guide',
    'http://[fc00::1]/guide',
    'https://[2001:db8::1]/guide',
    'https://[3fff::1]/guide',
    'http://192.88.99.1/guide',
    'https:example.com/guide',
    'https:///example.com/guide',
    'https://example.com\\guide',
    'https://source.internal/guide',
  ])('拒绝内部或非公开来源格式 %s', (url) => expect(isPublicSourceUrl(url)).toBe(false));

  it.each([
    'DE185872',
    'DE Update 185872',
    '2026-10-26 核对',
    'AOE2 Guide',
    'decade',
    'defaced',
    '官方语言与游戏说明',
    '来源 https://github.com/owner/project/blob/0123456789abcdef0123456789abcdef01234567/data.json',
  ])('保留正常玩家来源文案 %s', (value) => expect(isPublicSourceText(value)).toBe(true));

  it.each([
    '075ead2',
    '来源 075ead2',
    'main @ 075ead2',
    'repo/source@f09ed56',
    'SHA256',
    '内部 CSV 行',
    '提交 f09ed56',
    'src/content/build-orders/scouts.yaml',
  ])('拒绝内部来源文案 %s', (value) => expect(isPublicSourceText(value)).toBe(false));
});
