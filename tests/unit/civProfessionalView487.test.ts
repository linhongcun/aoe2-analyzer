import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PRO_SOURCES, readProSources } from '../../src/features/civs/proSources';
import CivProfessionalView from '../../src/features/civs/components/CivProfessionalView';

const VERIFIED = {
  id: 'hera-civilizations-2026-10-29',
  kind: 'original-video',
  authorId: 'hera',
  author: 'Hera',
  originalTitle: 'I Ranked All 56 Civilizations in Age of Empires 2',
  originalUrl: 'https://www.youtube.com/watch?v=AaxJADJGjvU',
  discoveryUrl: 'https://ageofnews.com/en/aoe2/2026-10-25/',
  publishedAt: null,
  gamePatch: null,
  mapScope: null,
  checkedAt: '2026-10-29',
} as const;

const source = (changes: Record<string, unknown> = {}) => ({ ...VERIFIED, ...changes });
const render = (catalogue: unknown) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(CivProfessionalView, { catalogue })));

describe('#487 verified professional original-source catalogue', () => {
  it('publishes only the frozen Hera original record and retains explicit unknown fields', () => {
    expect(PRO_SOURCES).toEqual([VERIFIED]);
    expect(readProSources(PRO_SOURCES)).toEqual({ status: 'ready', sources: [VERIFIED] });
  });

  it('distinguishes a deliberately empty catalogue from unavailable input', () => {
    expect(readProSources([])).toEqual({ status: 'empty' });
    for (const input of [null, undefined, {}, '', '[]', 0, true]) expect(readProSources(input)).toEqual({ status: 'unavailable' });
  });

  it('accepts a valid calendar date, including a real leap day', () => {
    const leapDay = source({ checkedAt: '2024-02-29', discoveryUrl: 'https://ageofnews.com/en/aoe2/2024-02-29/' });
    expect(readProSources([leapDay])).toEqual({ status: 'ready', sources: [leapDay] });
  });

  it('rejects missing required fields instead of supplying plausible source facts', () => {
    for (const key of Object.keys(VERIFIED)) {
      const incomplete: Record<string, unknown> = source();
      delete incomplete[key];
      expect(readProSources([incomplete]), key).toEqual({ status: 'unavailable' });
    }
  });

  it('rejects unknown fields, including invented rankings and discovery dates as publication facts', () => {
    for (const extra of [{ rank: 1 }, { tier: 'S' }, { rating: 10 }, { indexDate: '2026-10-25' }, { unexpected: null }]) {
      expect(readProSources([source(extra)])).toEqual({ status: 'unavailable' });
    }
  });

  it('rejects malformed members and duplicate source records as a whole catalogue', () => {
    for (const input of [[null], [[]], [42], ['Hera'], [source(), null], [source(), source()]]) {
      expect(readProSources(input)).toEqual({ status: 'unavailable' });
    }
    expect(readProSources([source(), source({ originalTitle: 'Duplicate ID with different text' })])).toEqual({ status: 'unavailable' });
  });

  it('rejects sparse catalogues instead of silently rendering an empty ready state', () => {
    expect(readProSources(Array(1))).toEqual({ status: 'unavailable' });
    const sparse = [source()];
    sparse.length = 2;
    expect(readProSources(sparse)).toEqual({ status: 'unavailable' });
    const html = render(sparse);
    expect(html).toContain('资料暂不可用');
    expect(html).not.toContain('href=');
  });

  it('requires nonempty source and author identity/title strings and the supported source kind', () => {
    for (const key of ['id', 'authorId', 'author', 'originalTitle']) {
      for (const value of ['', '   ', null, 1]) expect(readProSources([source({ [key]: value })]), key).toEqual({ status: 'unavailable' });
    }
    for (const kind of ['tier-list', 'article', '', null]) expect(readProSources([source({ kind })])).toEqual({ status: 'unavailable' });
  });

  it('keeps publication, game patch and map unknown rather than accepting unverified values', () => {
    for (const key of ['publishedAt', 'gamePatch', 'mapScope']) {
      for (const value of ['unknown', '2026-10-25', '185872', 'Arabia', '', 0, false, {}]) {
        expect(readProSources([source({ [key]: value })]), `${key}: ${JSON.stringify(value)}`).toEqual({ status: 'unavailable' });
      }
    }
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-12', '2026-10-00', '2026-10-32', '2026-2-01', '2026-10-29T00:00:00Z', '', null])(
    'rejects malformed or impossible checkedAt %s',
    (checkedAt) => {
      expect(readProSources([source({ checkedAt })])).toEqual({ status: 'unavailable' });
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,source',
    '//www.youtube.com/watch?v=AaxJADJGjvU',
    'http://www.youtube.com/watch?v=AaxJADJGjvU',
    'https://user:password@www.youtube.com/watch?v=AaxJADJGjvU',
    'https://www.youtube.com.evil.example/watch?v=AaxJADJGjvU',
    'https://evil.example/watch?v=AaxJADJGjvU',
    'https://youtu.be/AaxJADJGjvU',
    'https://www.youtube.com/embed/AaxJADJGjvU',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=AaxJADJGjvUU',
    'https://www.youtube.com/watch?v=AaxJADJGjv!',
    '',
    null,
  ])('rejects unsafe or unsupported original video URL %s', (originalUrl) => {
    expect(readProSources([source({ originalUrl })])).toEqual({ status: 'unavailable' });
  });

  it.each([
    'javascript:alert(1)',
    'http://ageofnews.com/en/aoe2/2026-10-25/',
    'https://reader:password@ageofnews.com/en/aoe2/2026-10-25/',
    'https://ageofnews.com.evil.example/en/aoe2/2026-10-25/',
    'https://example.com/en/aoe2/2026-10-25/',
    'https://ageofnews.com/en/aoe4/2026-10-25/',
    'https://ageofnews.com/en/aoe2/2026-02-30/',
    'https://ageofnews.com/en/aoe2/2026-13-01/',
    'https://ageofnews.com/en/aoe2/2026-2-01/',
    'https://ageofnews.com/en/aoe2/',
    '',
    null,
  ])('rejects unsafe or unsupported discovery URL %s', (discoveryUrl) => {
    expect(readProSources([source({ discoveryUrl })])).toEqual({ status: 'unavailable' });
  });
});

describe('#487 actual source component boundary states', () => {
  it('renders the verified source with honest unknown states and no inferred ranking or media', () => {
    const html = render(PRO_SOURCES);
    expect(html).toContain('职业选手原始资料');
    expect(html).toContain(VERIFIED.originalTitle);
    expect(html).toContain('Hera');
    expect(html).toContain(`href="${VERIFIED.originalUrl}"`);
    expect(html).toContain(`href="${VERIFIED.discoveryUrl}"`);
    for (const label of ['仅参考', '原视频发布日期未核实', '适用游戏版本未核实', '地图范围未核实', '2026-10-29', '本站综合参考']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('未摘录本文明的名次、档位或分数，请查看原视频了解完整观点。');
    expect(html).not.toMatch(/<(?:iframe|video|audio|object|embed|img|canvas)\b|data-stat="rating-/);
    expect(html).toContain('href="/players/hera"');
    expect(html.match(/href="\/players\//g)).toHaveLength(1);
  });

  it('keeps an unknown author readable without generating a dead profile link', () => {
    const html = render([source({ authorId: 'unknown-author', author: 'Unknown author' })]);
    expect(html).toContain('Unknown author');
    expect(html).toContain(`href="${VERIFIED.originalUrl}"`);
    expect(html).not.toMatch(/href="[^"]*\/players\//);
  });

  it('renders a genuine empty catalogue without inventing a source or link', () => {
    const html = render([]);
    expect(html).toContain('暂无已核对原链接');
    expect(html).not.toContain('资料暂不可用');
    expect(html).not.toContain(VERIFIED.originalTitle);
    expect(html).not.toMatch(/<a\b|href=/);
  });

  it.each(
    [
      null,
      {},
      [source({ originalUrl: 'javascript:alert(1)' })],
      [source({ discoveryUrl: 'https://evil.example/source' })],
      [source(), source({ id: 'unsupported', kind: 'tier-list', originalUrl: 'https://evil.example/source' })],
      [source(), source()],
    ].map((catalogue) => ({ catalogue })),
  )('renders unavailable for invalid catalogue without leaking any valid or unsafe href: %j', ({ catalogue }) => {
    const html = render(catalogue);
    expect(html).toContain('资料暂不可用');
    expect(html).not.toContain('暂无已核对原链接');
    expect(html).not.toContain(VERIFIED.originalTitle);
    expect(html).not.toMatch(/<a\b|href=/);
  });
});
