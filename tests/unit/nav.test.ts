import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL, FUTURE, HOME_GROUPS, TOOL_GROUPS, WIKI, sectionOf } from '../../src/shared/nav/sections';
import { ToolsMenu } from '../../src/app/nav/ToolsMenu';
import Home from '../../src/features/home/components/Home';

const visibleWiki = WIKI.filter((s) => !s.hideNav);
const home = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Home)));

describe('导航与首页入口 #272', () => {
  it('顶部保留紧凑的百科快捷入口', () => {
    expect(visibleWiki.map((s) => s.key)).toEqual(['civs', 'units', 'buildings', 'techs', 'tree']);
  });

  it('每个已上线页面在首页渲染至少一个入口，且工具菜单数据包含入口', () => {
    const html = home();
    const menu = TOOL_GROUPS.flatMap((group) => group.sections);
    const menuHtml = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ToolsMenu, { path: '/' })));
    for (const s of ALL.filter((s) => s.status !== 'planned')) {
      expect(html, s.key).toContain(`href="${s.path}"`);
      expect(menuHtml, s.key).toContain(`href="${s.path}"`);
      expect(
        menu.some((entry) => entry.path === s.path),
        s.key,
      ).toBe(true);
      expect(sectionOf(s.path)?.key, s.path).toBe(s.key);
    }
  });

  it('四组都有标题、说明，页面按自己的 group 归类且不重复', () => {
    const html = home();
    for (const groups of [HOME_GROUPS, TOOL_GROUPS]) {
      expect(groups.map((group) => group.title)).toEqual(['新手入门', '对局计划', '经济计算', '资料']);
      for (const group of groups) {
        expect(group.desc.length).toBeGreaterThan(0);
        expect(group.sections.length).toBeGreaterThan(0);
        expect(html).toContain(group.title);
        expect(html).toContain(group.desc);
        for (const s of group.sections) expect(s.group, s.key).toBe(group.key);
      }
      const keys = groups.flatMap((group) => group.sections.map((s) => s.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('市场买卖与经济科技收益归入经济计算', () => {
    const economy = HOME_GROUPS.find((group) => group.key === 'economy')!;
    expect(economy.sections.map((s) => s.path)).toEqual(expect.arrayContaining(['/market', '/eco-payoff']));
  });

  it('规划中模块不进入首页与工具菜单', () => {
    const html = home();
    const entries = [...HOME_GROUPS, ...TOOL_GROUPS].flatMap((group) => group.sections);
    for (const s of FUTURE) {
      expect(s.status, s.key).toBe('planned');
      expect(
        entries.some((entry) => entry.key === s.key),
        s.key,
      ).toBe(false);
      expect(html, s.key).not.toContain(`href="${s.path}"`);
    }
  });
});
