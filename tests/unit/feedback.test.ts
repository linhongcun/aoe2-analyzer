import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { entityOf, feedbackUrl, ISSUES_NEW, siegeFeedbackText } from '../../src/shared/utils/feedback';

describe('feedback link', () => {
  it('detects entity type/id from route', () => {
    expect(entityOf('/unit/4')).toEqual({ type: '单位', id: '4' });
    expect(entityOf('/civ/Franks/bonus/2')).toEqual({ type: '文明加成', id: 'Franks/2' });
    expect(entityOf('/duel')?.type).toBe('页面');
  });
  it('prefills title/body with page, entity, civ, data version, UA', () => {
    const u = new URL(feedbackUrl({ pathname: '/unit/4', search: '?civ=Britons', href: 'https://x/#/unit/4?civ=Britons', ua: 'TestUA/1.0' }));
    expect(u.origin + u.pathname).toBe(ISSUES_NEW);
    expect(u.searchParams.get('title')).toBe('单位 4');
    const b = u.searchParams.get('body')!;
    for (const s of [
      'https://x/#/unit/4?civ=Britons',
      '单位 / 4',
      'Britons',
      `${pins.patch.name} (${pins.patch.date})；.dat auto-mods@${pins.sources.dat.commit.slice(0, 7)}`,
      'TestUA/1.0',
    ])
      expect(b).toContain(s);
  });

  it('#555 攻城页带 unit 时标题和类型/ID 写单位中文名与编号，正文仍有地址、数据版本和构建', () => {
    const href = 'https://x/#/siege?unit=36&n=4&bldg=82';
    const ctx = { pathname: '/siege', search: '?unit=36&n=4&bldg=82', href, ua: 'TestUA/1.0', unitName: '手推炮' };
    expect(siegeFeedbackText(ctx)).toBe('手推炮 / 36');
    const u = new URL(feedbackUrl(ctx));
    expect(u.searchParams.get('title')).toBe('手推炮 / 36');
    const b = u.searchParams.get('body')!;
    expect(b).toContain('类型/ID：手推炮 / 36');
    expect(b).toContain(href);
    expect(b).toContain(`数据版本：${pins.patch.name} (${pins.patch.date})；.dat auto-mods@${pins.sources.dat.commit.slice(0, 7)}`);
    expect(b).toContain('构建');
  });

  it('#555 没有 unit 时攻城页反馈保持路径标题和空类型', () => {
    const u = new URL(feedbackUrl({ pathname: '/siege', search: '', href: 'https://x/#/siege', ua: 'TestUA/1.0' }));
    expect(u.searchParams.get('title')).toBe('/siege');
    expect(u.searchParams.get('body')).toContain('类型/ID：—');
    expect(siegeFeedbackText({ pathname: '/siege/', search: '?n=4', href: 'https://x/#/siege', ua: '' })).toBeNull();
  });

  it('#555 单位名不写进其它页面的预填', () => {
    const u = new URL(feedbackUrl({ pathname: '/unit/4', search: '', href: 'https://x/#/unit/4', ua: '', unitName: '手推炮' }));
    expect(u.searchParams.get('title')).toBe('单位 4');
    expect(u.searchParams.get('body')).toContain('类型/ID：单位 / 4');
  });
});
