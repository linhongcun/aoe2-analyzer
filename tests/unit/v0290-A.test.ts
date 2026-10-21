/**
 * v0.29.0 验收（#329）A 组：数据与内容正确性。Kent 写，先失败。
 * - #265 内容指南：官方支持站文章的「发布日期」应为文章创建日期（北京时间）。
 * #317 / #312 / #314 的块已原样并入 main（tests/unit/v0290-317|312|314.test.ts），本文件不再重复。
 * 公开来源见各 describe 注释。
 */
import { describe, expect, it } from 'vitest';
import catalog from '../../src/content/contentCatalog.json';

// ---------- #265 ----------
// 公开接口 https://support.ageofempires.com/api/v2/help_center/en-us/articles/<id>.json（2026-10-21 18:16 北京时间读取）：
//   15552096234644 created_at 2023-05-10T20:33:21Z（北京 2023-05-11），edited_at 2026-01-20T21:57:09Z
//   31839163606932 created_at 2024-11-04T18:47:03Z（北京 2024-11-05），edited_at 2026-07-17T19:23:26Z
// Steve 2026-10-21（#334 设计通过 @ 55272f2）：仍叫「发布日期」，取 created_at 换算成北京时间（UTC+8）的日期；不接受 UTC 日期，也不接受改名「更新于」。
const SUPPORT_CREATED: Record<string, string> = {
  '15552096234644': '2023-05-11',
  '31839163606932': '2024-11-05',
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
    it(`${product}/${s.id}：publishedAt 恰为创建日期的北京时间 ${SUPPORT_CREATED[article]}，不是编辑日期`, () => {
      expect(s.publishedAt).toBe(SUPPORT_CREATED[article]);
      expect(SUPPORT_EDITED[article]).not.toContain(s.publishedAt);
    });
  }
});
