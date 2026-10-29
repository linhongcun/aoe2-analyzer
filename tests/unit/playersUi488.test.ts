import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rawPlayers from '../../src/content/players.json';

afterEach(() => {
  vi.doUnmock('../../src/content/players.json');
  vi.resetModules();
});

async function page(raw: unknown, path: string) {
  vi.doMock('../../src/content/players.json', () => ({ default: raw }));
  const [{ default: Players }, { default: PlayerDetail }] = await Promise.all([
    import('../../src/features/players/Players'),
    import('../../src/features/players/PlayerDetail'),
  ]);
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/players', element: createElement(Players) }),
        createElement(Route, { path: '/players/:id', element: createElement(PlayerDetail) }),
      ),
    ),
  );
}

describe('#488 actual players UI fails closed at its content reader', () => {
  it('renders a real empty directory without an unavailable warning or invented profiles', async () => {
    const html = await page({ ...rawPlayers, players: [] }, '/players');
    expect(html).toContain('暂无已收录选手');
    expect(html).not.toContain('资料暂不可用');
    expect(html).not.toMatch(/href="\/players\//);
  });
  it.each(['/players', '/players/hera'])('renders malformed content accessibly without any profile/civ CTA on %s', async (path) => {
    const broken = structuredClone(rawPlayers);
    broken.players[0]!.match.civId = 'Unknown488';
    const html = await page(broken, path);
    expect(html).toContain('资料暂不可用');
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/href="\/(?:players\/|civ\/)/);
    expect(html).not.toContain('Hamzah El-Baher');
  });
  it('keeps a wrong-case ID unknown rather than substituting the real Hera', async () => {
    const html = await page(rawPlayers, '/players/Hera');
    expect(html).toContain('未收录该选手');
    expect(html).not.toContain('Hamzah El-Baher');
    expect(html).not.toMatch(/href="\/civ\//);
  });
  it.each([
    { label: 'unavailable', raw: {} },
    { label: 'empty', raw: { ...rawPlayers, players: [] } },
  ])('retains the verified video source without author dead links for $label player content', async ({ raw }) => {
    vi.doMock('../../src/content/players.json', () => ({ default: raw }));
    const { default: View } = await import('../../src/features/civs/components/CivProfessionalView');
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(View)));
    expect(html).toContain('I Ranked All 56 Civilizations');
    expect(html).toContain('https://www.youtube.com/watch?v=AaxJADJGjvU');
    expect(html).not.toMatch(/href="[^"]*\/players\//);
    expect(html).toContain('原视频发布日期未核实');
  });
});
