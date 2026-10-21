/**
 * v0.29.0 验收（#329）A 组 #265 部分：取自 Kent Beck test/v0290-acceptance @ 04c4123 tests/unit/v0290-A.test.ts，断言原样未改。
 */
import { describe, expect, it } from 'vitest';
import catalog from '../../src/content/contentCatalog.json';

// ---------- #265 ----------
// 公开接口 https://support.ageofempires.com/api/v2/help_center/en-us/articles/<id>.json（2026-10-21 18:16 北京时间读取）：
//   15552096234644 created_at 2023-05-10T20:33:21Z（北京 2023-05-11），edited_at 2026-01-20T21:57:09Z
//   31839163606932 created_at 2024-11-04T18:47:03Z（北京 2024-11-05），edited_at 2026-07-17T19:23:26Z
// 验收二选一：改用 created_at 仍叫「发布日期」；或改名为「更新于」。日期取 UTC 还是北京时间未规定，两种都接受。
const SUPPORT_CREATED: Record<string, string[]> = {
  '15552096234644': ['2023-05-10', '2023-05-11'],
  '31839163606932': ['2024-11-04', '2024-11-05'],
};
const SUPPORT_EDITED: Record<string, string[]> = {
  '15552096234644': ['2026-01-20', '2026-01-21'],
  '31839163606932': ['2026-07-17', '2026-07-18'],
};
type Src = { id: string; url: string; publishedAt?: string; [k: string]: unknown };
const supportSources = () =>
  (catalog.products as unknown as { id: string; sources: Src[] }[]).flatMap((p) =>
    p.sources.filter((s) => s.url.includes('support.ageofempires.com')).map((s) => ({ product: p.id, s })),
  );

describe('#265 内容指南：官方支持站文章的日期', () => {
  it('共 3 处引用支持站文章（回归罗马 1 处、编年史 FAQ 2 处）', () => {
    expect(supportSources().map(({ product, s }) => `${product}/${s.id}`)).toEqual([
      'return-of-rome/mode-support',
      'chronicles-battle-for-greece/chronicles-faq',
      'chronicles-alexander-the-great/chronicles-faq',
    ]);
  });
  for (const { product, s } of supportSources()) {
    const article = s.url.match(/articles\/(\d+)/)![1]!;
    it(`${product}/${s.id}：标成发布日期的必须是创建日期（${SUPPORT_CREATED[article]!.join(' 或 ')}），编辑日期不能再记在 publishedAt`, () => {
      if (s.publishedAt !== undefined) expect(SUPPORT_CREATED[article]).toContain(s.publishedAt);
      // 改名方案：若保留编辑日期，必须换成别的字段名（页面显示「更新于」，由 e2e 核对）
      else expect(Object.values(s).some((v) => typeof v === 'string' && SUPPORT_EDITED[article]!.includes(v))).toBe(true);
    });
  }
});
