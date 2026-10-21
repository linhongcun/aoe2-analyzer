/**
 * v0.29.0 验收（#329）B 组的单测部分：#313 清空撤销、#315 404 建议。Kent 写，先失败。
 * #316 已并入 main（tests/unit/v0290-316.test.ts）。排版类（#275）和交互时序（#325）在 e2e。
 */
import { describe, expect, it } from 'vitest';
import { emptyMatchReview } from '../../src/domain/matchReview';
import { suggestRoutes } from '../../src/domain/routeSuggestions';
import { matchReviewDraftReducer } from '../../src/features/matchReview/matchReviewDraftState';
import { ALL } from '../../src/shared/nav/sections';

// ---------- #313 ----------
const withTitle = (title: string) => {
  const d = emptyMatchReview();
  d.context.title = title;
  return d;
};
describe('#313 手填复盘：连续清空两次后撤销', () => {
  it('clear 后 clear 后 undo 恢复最后一次非空的内容「旧草稿」', () => {
    let s = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'undo' });
    expect(s.draft.context.title).toBe('旧草稿');
  });
  it('守卫（#307 已验收）：清空 后 直接撤销恢复原内容；清空 后 编辑后撤销快照作废、新内容保留', () => {
    const cleared = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    expect(matchReviewDraftReducer(cleared, { type: 'undo' }).draft.context.title).toBe('旧草稿');
    const edited = matchReviewDraftReducer(cleared, { type: 'edit', draft: withTitle('新内容') });
    expect(edited.beforeClear).toBeNull();
    expect(matchReviewDraftReducer(edited, { type: 'undo' }).draft.context.title).toBe('新内容');
  });
  it('守卫：清空 后 编辑 后 清空 后 撤销，恢复的是编辑后的「新内容」，不是更早的旧草稿', () => {
    let s = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'edit', draft: withTitle('新内容') });
    s = matchReviewDraftReducer(s, { type: 'clear' });
    expect(matchReviewDraftReducer(s, { type: 'undo' }).draft.context.title).toBe('新内容');
  });
});

// ---------- #315 ----------
// 与 NotFound.tsx 一致：已登记入口 + 关于数据。别名若登记在 sections 的条目上，会随条目一起传入。
const destinations = [...ALL, { path: '/about-data', label: '关于数据' }];
const first = (path: string) => suggestRoutes(path, destinations)[0]?.path;
describe('#315 404 页「你是不是要找」容错', () => {
  it.each([
    ['/glossery', '/glossary'],
    ['/glosary', '/glossary'],
    ['/buildorder', '/builds'],
    ['/build-orders', '/builds'],
    ['/tradeincome', '/trade-income'],
  ])('%s 第 1 条建议是 %s', (input, want) => {
    expect(first(input)).toBe(want);
  });
  it('最多 3 条，且都是已登记入口', () => {
    for (const input of ['/glossery', '/buildorder', '/tradeincome', '/team']) {
      const got = suggestRoutes(input, destinations);
      expect(got.length).toBeLessThanOrEqual(3);
      got.forEach((r) => expect(destinations.map((d) => d.path)).toContain(r.path));
    }
  });
  it('守卫：#/hotkey 到 快捷键速查，#/civ 到 文明 排第 1', () => {
    expect(first('/hotkey')).toBe('/hotkeys');
    expect(first('/civ')).toBe('/civs');
  });
  it('反例：很短的乱写路径 #/ab、明显无关的 #/this-page-does-not-exist-xyz 不出建议', () => {
    expect(suggestRoutes('/ab', destinations)).toEqual([]);
    expect(suggestRoutes('/this-page-does-not-exist-xyz', destinations)).toEqual([]);
  });
});
