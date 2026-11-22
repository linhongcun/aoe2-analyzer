import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL, FUTURE, HOME_GROUPS, SEARCH_QUICK_SECTIONS, TOOL_GROUPS, WIKI, sectionOf } from '../../src/shared/nav/sections';
import { ToolsMenu } from '../../src/app/nav/ToolsMenu';
import Home from '../../src/features/home/components/Home';

const visibleWiki = WIKI.filter((s) => !s.hideNav);
const visibleWikiKeys = new Set(visibleWiki.map((s) => s.key));
const home = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Home)));

describe('导航与首页入口 #272 / Issue 1282', () => {
  it('顶部保留紧凑的百科快捷入口', () => {
    expect(visibleWiki.map((s) => s.key)).toEqual(['civs', 'units', 'buildings', 'techs', 'maps', 'patches']);
  });

  it('每个已上线页面在首页渲染至少一个入口；桌面工具菜单去重顶栏 6 个百科项并保留其余 25 项', () => {
    const html = home();
    const menu = TOOL_GROUPS.flatMap((group) => group.sections);
    const menuHtml = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ToolsMenu, { path: '/' })));
    const active = ALL.filter((s) => s.status !== 'planned');
    for (const s of active) {
      expect(html, s.key).toContain(`href="${s.path}"`);
      if (visibleWikiKeys.has(s.key)) {
        expect(menuHtml, `${s.key} 不应在桌面工具菜单重复`).not.toContain(`href="${s.path}"`);
      } else {
        expect(menuHtml, s.key).toContain(`href="${s.path}"`);
      }
      expect(
        menu.some((entry) => entry.path === s.path),
        s.key,
      ).toBe(true);
      expect(sectionOf(s.path)?.key, s.path).toBe(s.key);
    }
    expect(active.filter((s) => !visibleWikiKeys.has(s.key))).toHaveLength(25);
    expect(menuHtml).toContain('顶栏已提供「文明 / 单位 / 建筑 / 科技 / 地图 / 更新历史」，此处不再重复');
  });

  it('四组按高频工具优先排序，有标题与登记说明且去重后组内图标互不重复', () => {
    const html = home();
    for (const groups of [HOME_GROUPS, TOOL_GROUPS]) {
      expect(groups.map((group) => group.title)).toEqual(['对局计划', '经济计算', '资料', '新手入门']);
      for (const group of groups) {
        expect(group.desc.length).toBeGreaterThan(0);
        expect(group.sections.length).toBeGreaterThan(0);
        expect(html).toContain(group.title);
        for (const s of group.sections) expect(s.group, s.key).toBe(group.key);
        const deduped = group.sections.filter((s) => !visibleWikiKeys.has(s.key));
        const icons = deduped.map((s) => s.icon);
        expect(new Set(icons).size, `${group.key} 组内图标不应重复: ${icons.join(', ')}`).toBe(icons.length);
      }
      const keys = groups.flatMap((group) => group.sections.map((s) => s.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('全局搜索空态 6 项直达列表从登记表单源派生且全部已上线', () => {
    expect(SEARCH_QUICK_SECTIONS.map((s) => s.key)).toEqual(['duel', 'matchup', 'production', 'simulator', 'compare', 'civs']);
    for (const s of SEARCH_QUICK_SECTIONS) {
      expect(s.status).toBeUndefined();
      expect(s.lane).toMatch(/^(wiki|tool|secondary)$/);
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
