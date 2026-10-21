import { emptyMatchReview, type MatchReviewDraft } from '../../domain/matchReview';

interface DraftState {
  draft: MatchReviewDraft;
  beforeClear: MatchReviewDraft | null;
}
type DraftAction = { type: 'edit'; draft: MatchReviewDraft } | { type: 'clear' } | { type: 'undo' };

export function matchReviewDraftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'edit':
      // A new edit after clearing supersedes the undo snapshot, so undo can never overwrite newer input.
      return { draft: action.draft, beforeClear: null };
    case 'clear':
      return { draft: emptyMatchReview(), beforeClear: state.draft };
    case 'undo':
      return state.beforeClear ? { draft: state.beforeClear, beforeClear: null } : state;
  }
}
