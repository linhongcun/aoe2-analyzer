import { emptyMatchReview, type MatchReviewDraft } from '../../domain/matchReview';

interface DraftState {
  draft: MatchReviewDraft;
  beforeClear: MatchReviewDraft | null;
}
type DraftAction = { type: 'edit'; draft: MatchReviewDraft } | { type: 'clear' } | { type: 'undo' };

export function matchReviewDraftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'edit':
      return { ...state, draft: action.draft };
    case 'clear':
      return { draft: emptyMatchReview(), beforeClear: state.draft };
    case 'undo':
      return state.beforeClear ? { draft: state.beforeClear, beforeClear: null } : state;
  }
}
