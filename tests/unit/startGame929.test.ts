import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { enterLobby } from '../../src/domain/startGame';
import { encodeStartSearch } from '../../src/domain/startGameCodec';
import Home from '../../src/features/home/components/Home';
import StartPage from '../../src/features/home/components/StartPage';
import { hasLegacyStartQuery } from '../../src/features/home/legacyStartQuery';
import { PAGES } from '../../src/shared/nav/pageRegistry';

async function renderAt(entry: string) {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/', element: createElement(Home) }),
          createElement(Route, { path: '/start', element: createElement(StartPage) }),
        ),
      ),
    );
  });
  return view;
}

describe('#929 开一局独立页', () => {
  it('只有带 sgv 或 sg 的查询才算旧首页进度', () => {
    expect(hasLegacyStartQuery('')).toBe(false);
    expect(hasLegacyStartQuery('?')).toBe(false);
    expect(hasLegacyStartQuery('?foo=1')).toBe(false);
    expect(hasLegacyStartQuery('?SGV=1')).toBe(false);
    expect(hasLegacyStartQuery('?sgv=1')).toBe(true);
    expect(hasLegacyStartQuery('?sg=')).toBe(true);
    expect(hasLegacyStartQuery('?x=1&sgv=1&sg=nope')).toBe(true);
  });

  it('登记在对局计划，开局流程仍是另一页', () => {
    expect(PAGES.find((page) => page.path === '/start')).toMatchObject({
      lane: 'tool',
      group: 'planning',
      label: '开一局',
      component: 'StartPage',
    });
    expect(PAGES.find((page) => page.path === '/builds')).toMatchObject({ label: '开局流程', path: '/builds' });
  });

  it('普通首页不跳；旧查询 replace 后仍显示链接错误，不改成另一套向导', async () => {
    const home = await renderAt('/');
    expect(home.root.findAllByProps({ 'data-testid': 'home-catalog' })).toHaveLength(1);
    expect(home.root.findAllByProps({ 'data-testid': 'start-game' })).toHaveLength(0);
    expect(JSON.stringify(home.toJSON())).not.toContain('已在大厅');

    const other = await renderAt('/?mode=1v1');
    expect(other.root.findAllByProps({ 'data-testid': 'home-catalog' })).toHaveLength(1);

    const broken = await renderAt('/?sgv=1&sg=not-json');
    expect(broken.root.findAllByProps({ 'data-testid': 'home-catalog' })).toHaveLength(0);
    expect(JSON.stringify(broken.toJSON())).toContain('链接中的本局进度无法恢复');
    expect(broken.root.findByProps({ 'data-testid': 'start-step' }).props['data-step']).toBe('mode');
  });

  it('/start 直接恢复已在大厅的本局', async () => {
    const lobby = await renderAt('/start' + encodeStartSearch(enterLobby()));
    expect(lobby.root.findByProps({ 'data-testid': 'start-step' }).props['data-step']).toBe('civ');
    expect(JSON.stringify(lobby.toJSON())).toContain('没有连上游戏大厅');
    expect(JSON.stringify(lobby.toJSON())).toContain('开一局 / 已在大厅');
  });
});
