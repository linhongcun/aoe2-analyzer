import { describe, expect, it } from 'vitest';
import { entityOf, feedbackUrl, ISSUES_NEW } from '../../src/features/feedback/feedback';

describe('feedback link', () => {
  it('detects entity type/id from route', () => {
    expect(entityOf('/unit/4')).toEqual({ type: '单位', id: '4' });
    expect(entityOf('/civ/Franks/bonus/2')).toEqual({ type: '文明加成', id: 'Franks/2' });
    expect(entityOf('/duel')?.type).toBe('页面');
  });
  it('prefills title/body with page, entity, civ, data version, UA', () => {
    const u = new URL(feedbackUrl({ pathname: '/unit/4', search: '?civ=Britons', href: 'https://x/#/unit/4?civ=Britons', ua: 'TestUA/1.0' }));
    expect(u.origin + u.pathname).toBe(ISSUES_NEW);
    expect(u.searchParams.get('title')).toBe('[数据错误] 单位 4');
    const b = u.searchParams.get('body')!;
    for (const s of ['https://x/#/unit/4?civ=Britons', '单位 / 4', 'Britons', '185872', 'TestUA/1.0']) expect(b).toContain(s);
  });
});
