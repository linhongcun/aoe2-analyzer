/**
 * v0.29.0 验收（#329）B 组 #313 部分：取自 Kent Beck test/v0290-acceptance @ cd1b938 tests/unit/v0290-B.test.ts，断言原样未改。
 */
import { describe, expect, it } from 'vitest';
import { emptyMatchReview } from '../../src/domain/matchReview';
import { matchReviewDraftReducer } from '../../src/features/matchReview/matchReviewDraftState';

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

