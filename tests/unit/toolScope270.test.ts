import { describe, expect, it } from 'vitest';
import contentCatalog from '../../src/content/contentCatalog.json';
import matchReview from '../../src/content/match-review.json';

const SHARED = new Set(['base-package', 'gift-announcement']);

describe('#270 内容指南战役中文名与共用依据', () => {
  it('具名战役和剧本都有中文，英文仍保留', () => {
    const names = contentCatalog.products.flatMap((product) =>
      product.contents.filter((block) => block.kind === 'campaigns' || block.kind === 'scenarios').flatMap((block) => block.names),
    );
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !name.zh || name.zh === name.en)).toEqual([]);
    expect(names.find((name) => name.en === 'Edward Longshanks')?.zh).toBe('长腿爱德华');
    expect(names.find((name) => name.en === 'Jadwiga')?.zh).toBe('雅德维加');
    expect(names.find((name) => name.en === 'The Grand Dukes of the West')?.zh).toBe('西方大公爵');
  });
  it('本体购买项和五周年公告在目录里各只有一份文案，供页面只列一次', () => {
    const shared = contentCatalog.products.flatMap((product) => product.sources).filter((source) => SHARED.has(source.id));
    expect(new Set(shared.map((source) => source.id)).size).toBe(2);
    expect(new Set(shared.filter((source) => source.id === 'gift-announcement').map((source) => source.note)).size).toBe(1);
    expect(new Set(shared.filter((source) => source.id === 'base-package').map((source) => source.note)).size).toBe(1);
  });
});

describe('#270 手填复盘来源说明', () => {
  it('用正常中文写出帖子发布日期，不再写页面日期导航', () => {
    expect(matchReview.sources.map((source) => source.note)).toEqual([
      expect.stringMatching(/^Reddit 帖子，发布于 2025-10-20/),
      expect.stringMatching(/^Reddit 帖子，发布于 2024-11-20/),
      expect.stringMatching(/^Reddit 帖子，发布于 2023-05-02/),
    ]);
    expect(JSON.stringify(matchReview)).not.toContain('页面日期导航');
  });
});
