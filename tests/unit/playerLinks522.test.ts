import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rawPlayers from '../../src/content/players.json';

afterEach(() => {
  vi.doUnmock('../../src/content/players.json');
  vi.resetModules();
});

async function profile(path: string, raw: unknown = rawPlayers) {
  vi.doMock('../../src/content/players.json', () => ({ default: raw }));
  const { default: PlayerDetail } = await import('../../src/features/players/PlayerDetail');
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(Routes, null, createElement(Route, { path: '/players/:id', element: createElement(PlayerDetail) })),
    ),
  );
}

const facts = [
  { id: 'hera', ownCiv: 'Armenians', opponent: 'liereyy', handle: 'Liereyy', opponentCiv: 'Wu', zh: '吴' },
  { id: 'liereyy', ownCiv: 'Franks', opponent: 'hera', handle: 'Hera', opponentCiv: 'Chinese', zh: '中国' },
  { id: 'theviper', ownCiv: 'Vikings', opponent: 'liereyy', handle: 'Liereyy', opponentCiv: 'Ethiopians', zh: '埃塞俄比亚' },
];

describe('#522 actual player profile navigation', () => {
  it.each(facts)('$id links the recorded opponent player and civilization without replacing the match facts', async (fact) => {
    const html = await profile(`/players/${fact.id}`);
    expect(html).toContain(`href="/players/${fact.opponent}">${fact.handle}</a>`);
    expect(html).toContain(`href="/civ/${fact.opponentCiv}">${fact.zh}</a>`);
    expect(html).toContain(`href="/civ/${fact.ownCiv}"`);
    expect(html).toContain('不表示选手的代表、擅长或最爱文明');
    expect(html).toContain('来源与核对说明');
  });

  it.each(facts)('$id can return to event announcements and open existing builds for the recorded own civilization', async (fact) => {
    const html = await profile(`/players/${fact.id}`);
    expect(html).toMatch(/href="\/events"[^>]*>.*?返回赛事公告/s);
    expect(html).toContain(`href="/builds?civ=${fact.ownCiv}"`);
    expect(html).toContain('该文明开局');
    expect(html).toContain('使用站内现有开局模板，并非该场比赛的实战流程。');
    expect(html).not.toContain('/events/the-garrison-2026');
    expect(html).toContain('返回选手目录');
  });

  it.each(['/players/unknown522', '/players/Hera'])('unknown identity %s does not generate new player/civilization/builds CTAs', async (path) => {
    const html = await profile(path);
    expect(html).toContain('未收录该选手');
    expect(html).not.toMatch(/href="\/(?:civ\/|builds\?|events)/);
  });

  it.each(['unknown-player', 'unknown-civilization', 'missing-player'] as const)(
    'invalid %s references retain unavailable state without new CTAs',
    async (kind) => {
      const broken = structuredClone(rawPlayers);
      if (kind === 'unknown-player') broken.players[0]!.match.opponentId = 'unknown522';
      else if (kind === 'unknown-civilization') broken.players[0]!.match.opponentCivId = 'Unknown522';
      else delete (broken.players[0]!.match as Partial<(typeof broken.players)[number]['match']>).opponentId;
      const html = await profile('/players/hera', broken);
      expect(html).toContain('资料暂不可用');
      expect(html).toContain('role="status"');
      expect(html).not.toMatch(/href="\/(?:players\/|civ\/|builds\?|events)/);
    },
  );
});
