import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';
import units from '../../src/data/units.json';
import Home from '../../src/features/home/components/Home';
import { HOME_AGE_PICS, HOME_BUILDING_PIC, HOME_EMBLEM_CIVS, HOME_TECH_PIC, HOME_UNIT_PICS } from '../../src/features/home/homeReference';
import { PAGES } from '../../src/shared/nav/pageRegistry';

const home = (search = '') => renderToStaticMarkup(createElement(StaticRouter, { location: { pathname: '/', search } }, createElement(Home)));

describe('首页方向 B #876', () => {
  it('首页不再嵌开一局，目录里只有一条普通入口', () => {
    const idle = home();
    expect(idle).not.toContain('data-testid="start-game"');
    expect(idle).not.toContain('data-testid="home-configure"');
    expect(idle).not.toContain('>已在大厅<');
    expect(idle).not.toContain('>配置本局<');
    const catalog = idle.slice(idle.indexOf('data-testid="home-catalog"'));
    expect(catalog.match(/href="\/start"/g)).toEqual(['href="/start"']);
    expect(catalog).toContain('>开一局<');
    expect(catalog).toContain('>开局流程<');
  });

  it('五项资料在目录之外，其余已上线页面都能从首页找到', () => {
    const html = home();
    const catalog = html.slice(html.indexOf('data-testid="home-catalog"'));
    for (const path of ['/civs', '/units', '/buildings', '/techs']) {
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
