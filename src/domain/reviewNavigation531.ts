import civs from '../data/raw/civs';
import { MATCH_REVIEW_LIMITS, reviewLinkProblem, type MatchReviewDraft, type ReviewContext } from './matchReview';

export type ReviewSourceKey = 'selfCiv' | 'opponentCiv' | 'link';
type SourceContext = Partial<Pick<ReviewContext, ReviewSourceKey>>;
export interface ReviewNavigationPreview {
  context: SourceContext;
  sourcePath: string | null;
  warning: string | null;
}
interface ReviewNavigationSource {
  back: string | null;
  me?: string;
  opp?: string;
}
const sourceKeys: readonly ReviewSourceKey[] = ['selfCiv', 'opponentCiv', 'link'];
const controls = (value: string) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** The shared navigation decoder supplies registered paths; this guard also rejects ambiguous path forms. */
function safePath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path) || controls(path)) return false;
  try {
    const decoded = decodeURIComponent(path.split('?')[0]!);
    return (
      !decoded.startsWith('//') && !/[\\#]/.test(decoded) && !controls(decoded) && !decoded.split('/').some((segment) => segment === '.' || segment === '..')
    );
  } catch {
    return false;
  }
}

/** A preview is data only: callers decide whether the player explicitly adds it to the latest draft. */
export function reviewNavigationPreview(source: ReviewNavigationSource, pageUrl: string): ReviewNavigationPreview {
  const context: SourceContext = {};
  const me = civs.find((civ) => civ.en === source.me);
  const opp = civs.find((civ) => civ.en === source.opp);
  if (me) context.selfCiv = me.zh;
  if (opp) context.opponentCiv = opp.zh;
  let warning: string | null = null;
  if (source.back) {
    try {
      if (!safePath(source.back)) throw new Error('invalid source');
      const url = new URL(pageUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid page');
      // Keep the application's deployment path, but never copy the current document query into the source URL.
      url.search = '';
      url.hash = source.back;
      const link = url.href;
      if (Array.from(link).length > MATCH_REVIEW_LIMITS.link) warning = '完整来源链接超过 2048 个字符，未填入也未截短；仍可补入文明。';
      else if (reviewLinkProblem(link)) warning = '来源链接不可用，未填入链接；仍可补入文明。';
      else context.link = link;
    } catch {
      warning = '来源链接不可用，未填入链接；仍可补入文明。';
    }
  }
  return { context, sourcePath: source.back, warning };
}

export function reviewNavigationChanges(draft: MatchReviewDraft, preview: ReviewNavigationPreview): ReviewSourceKey[] {
  return sourceKeys.filter((key) => draft.context[key] === '' && !!preview.context[key]);
}

/** Merge only genuinely empty fields. Events, the single goal, attempts and output choices keep their identity. */
export function reviewNavigationMerge(draft: MatchReviewDraft, preview: ReviewNavigationPreview): MatchReviewDraft {
  const fields = reviewNavigationChanges(draft, preview);
  if (!fields.length) return draft;
  const context = { ...draft.context };
  for (const key of fields) context[key] = preview.context[key]!;
  return { ...draft, context };
}
