import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';
import units from '../../src/data/units.json';
import { enterLobby, resetStart } from '../../src/domain/startGame';
import { encodeStartSearch } from '../../src/domain/startGameCodec';
import Home from '../../src/features/home/components/Home';
import { isIdleStart } from '../../src/features/home/homeEntry';
import { HOME_AGE_PICS, HOME_BUILDING_PIC, HOME_EMBLEM_CIVS, HOME_TECH_PIC, HOME_UNIT_PICS } from '../../src/features/home/homeReference';
import { PAGES } from '../../src/shared/nav/pageRegistry';

const home = (search = '') => renderToStaticMarkup(createElement(StaticRouter, { location: { pathname: '/', search } }, createElement(Home)));

describe('首页方向 B #876', () => {
  it('空白局收起，已有大厅进度直接进入文明步', () => {
    expect(isIdleStart(resetStart())).toBe(true);
    expect(isIdleStart(enterLobby())).toBe(false);
    const idle = home();
    expect(idle).toContain('data-testid="home-configure"');
    expect(idle).not.toContain('data-step="mode"');
    const lobby = home(encodeStartSearch(enterLobby()));
    expect(lobby).toContain('data-step="civ"');
    expect(lobby).toContain('没有连上游戏大厅');
    expect(lobby).not.toContain('data-testid="home-configure"');
  });

  it('配置本局展开原来的模式步', async () => {
    let configured!: ReactTestRenderer;
    await act(async () => {
      configured = create(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(Home)));
    });
    await act(async () => {
      configured.root.findByProps({ 'data-testid': 'home-configure' }).props.onClick();
    });
    expect(configured.root.findByProps({ 'data-testid': 'start-step' }).props['data-step']).toBe('mode');
    expect(configured.root.findAllByProps({ 'data-testid': 'home-configure' })).toHaveLength(0);
  });

  it('五项资料在目录之外，其余已上线页面都能从首页找到', () => {
    const html = home();
    const catalog = html.slice(html.indexOf('data-testid="home-catalog"'));
    for (const path of ['/civs', '/units', '/tree', '/buildings', '/techs']) {
      expect(html).toContain(`href="${path}"`);
      expect(catalog).not.toContain(`href="${path}"`);
    }
    const pages = PAGES.filter((page) => page.kind === 'page' && page.lane && page.status !== 'planned' && !page.path.includes(':'));
    expect(pages).toHaveLength(31);
    for (const page of pages) expect(html, page.path).toContain(`href="${page.path}"`);
    expect(html).not.toContain('设计选例');
    expect(html).not.toContain('规划中');
    expect(html).not.toContain('评分与团战位置');
    expect(html).toContain('加成、特色单位与科技、完整科技树。');
  });

  it('例示图标对照当前数据，不是另一套名单', () => {
    const civNames = new Set((civs as { en: string }[]).map((civ) => civ.en));
    for (const en of HOME_EMBLEM_CIVS) expect(civNames.has(en)).toBe(true);
    const unitPic = new Map((units as { id: number; pic: number }[]).map((unit) => [unit.id, unit.pic]));
    expect([74, 4, 24, 38, 83].map((id) => unitPic.get(id))).toEqual([...HOME_UNIT_PICS]);
    const techPic = new Map((techs as { id: number; pic: number }[]).map((tech) => [tech.id, tech.pic]));
    expect([101, 102, 103].map((id) => techPic.get(id))).toEqual([...HOME_AGE_PICS]);
    expect(techPic.get(103)).toBe(HOME_TECH_PIC);
    expect((buildings as { id: number; pic: number }[]).find((building) => building.id === 82)?.pic).toBe(HOME_BUILDING_PIC);
  });
});
