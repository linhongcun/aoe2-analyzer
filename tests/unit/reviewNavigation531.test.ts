import { describe, expect, it } from 'vitest';
import { emptyMatchReview, emptyReviewEvent } from '../../src/domain/matchReview';
import { reviewNavigationChanges, reviewNavigationMerge, reviewNavigationPreview } from '../../src/domain/reviewNavigation531';

const location = 'https://linhongcun.github.io/aoe2-analyzer/?temporary=not-for-sharing#/match-review';
const source = { back: '/production?civ=Mongols&age=3&rows=38%3A101%3A2', me: 'Franks', opp: 'Britons' };

describe('#531 explicit review source import', () => {
  it('previews original civilizations and a complete same-site source without inventing game facts', () => {
    const preview = reviewNavigationPreview(source, location);
    expect(preview.context).toEqual({
      selfCiv: '法兰克',
      opponentCiv: '不列颠',
      link: 'https://linhongcun.github.io/aoe2-analyzer/#/production?civ=Mongols&age=3&rows=38%3A101%3A2',
    });
    expect(preview.sourcePath).toBe(source.back);
    expect(preview.warning).toBeNull();
    const draft = emptyMatchReview();
    const next = reviewNavigationMerge(draft, preview);
    expect(next.context.title).toBe('');
    expect(next.context.map).toBe('');
    expect(next.context.gameVersion).toBe('');
    expect(next.events).toBe(draft.events);
    expect(next.goal).toBe(draft.goal);
    expect(next.attempts).toBe(draft.attempts);
  });

  it('only fills empty context fields in the latest draft and preserves every existing record', () => {
    const draft = emptyMatchReview();
    draft.context = { ...draft.context, title: '原复盘', map: '已有地图', selfCiv: '用户手记', gameVersion: '用户记录的版本' };
    draft.events = [{ ...emptyReviewEvent('event-1'), question: '原问题', visible: '原事实' }];
    draft.goal = { trigger: '原情境', action: '唯一目标', evidence: '原标准' };
    draft.output.events = false;
    const original = structuredClone(draft);
    const preview = reviewNavigationPreview(source, location);
    expect(reviewNavigationChanges(draft, preview)).toEqual(['opponentCiv', 'link']);
    const next = reviewNavigationMerge(draft, preview);
    expect(next.context).toEqual({ ...original.context, opponentCiv: '不列颠', link: preview.context.link });
    expect(next.events).toBe(draft.events);
    expect(next.goal).toBe(draft.goal);
    expect(next.output).toBe(draft.output);
    expect(draft).toEqual(original);
  });

  it('does not replace whitespace or other user content and does not create a new draft for a no-op', () => {
    const draft = emptyMatchReview();
    draft.context.selfCiv = ' ';
    draft.context.opponentCiv = '自记对方';
    draft.context.link = '原有但待修正的链接';
    const preview = reviewNavigationPreview(source, location);
    expect(reviewNavigationChanges(draft, preview)).toEqual([]);
    expect(reviewNavigationMerge(draft, preview)).toBe(draft);
  });

  it('keeps a long source intact in the preview but never truncates it into a stored link', () => {
    const path = '/production?civ=Franks&note=' + 'x'.repeat(2050);
    const preview = reviewNavigationPreview({ ...source, back: path }, location);
    expect(preview.sourcePath).toBe(path);
    expect(preview.context).toEqual({ selfCiv: '法兰克', opponentCiv: '不列颠' });
    expect(preview.warning).toContain('2048');
    expect(reviewNavigationMerge(emptyMatchReview(), preview).context.link).toBe('');
  });

  it.each(['https://example.com/steal', '//example.com/steal', '/unit/1\\evil', '/unit/../production', '/unit/%2e%2e/production'])(
    'does not create a link from an unsafe path %s',
    (back) => {
      const preview = reviewNavigationPreview({ ...source, back }, location);
      expect(preview.context.link).toBeUndefined();
      expect(preview.warning).toBeTruthy();
    },
  );

  it.each(['file:///tmp/index.html', 'javascript:alert(1)', 'https://user:pass@example.com/'])(
    'does not create a source link from an invalid page URL %s',
    (page) => {
      const preview = reviewNavigationPreview(source, page);
      expect(preview.context.link).toBeUndefined();
      expect(preview.warning).toBeTruthy();
    },
  );

  it('accepts no source and ignores unknown civilization names', () => {
    const preview = reviewNavigationPreview({ back: null, me: 'Unknown', opp: '' }, location);
    expect(preview.context).toEqual({});
    expect(preview.sourcePath).toBeNull();
    expect(reviewNavigationChanges(emptyMatchReview(), preview)).toEqual([]);
  });
});
