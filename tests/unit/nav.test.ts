import { describe, expect, it } from 'vitest';
import { FUTURE, TOOLS, WIKI, sectionOf } from '../../src/app/nav/sections';

const visibleWiki = WIKI.filter((s) => !s.hideNav);
const visibleTools = TOOLS.filter((s) => !s.hideNav);

describe('顶部导航', () => {
  it('只列出已上线的百科与工具入口', () => {
    expect(visibleWiki.map((s) => s.key)).toEqual(['civs', 'units', 'buildings', 'techs', 'tree']);
    expect(visibleWiki.map((s) => s.key)).not.toContain('dlc');
    expect(WIKI.find((s) => s.key === 'dlc')?.hideNav).toBe(true);
    expect(WIKI.find((s) => s.key === 'buildings')?.hideNav).toBeUndefined();
    expect(visibleTools.map((s) => s.key)).toEqual(['builds', 'compare', 'matchup', 'simulator', 'duel', 'production']);
    expect(TOOLS.map((s) => s.key)).toEqual(['builds', 'compare', 'matchup', 'simulator', 'duel', 'production']);
    expect(TOOLS.find((s) => s.key === 'production')?.hideNav).toBeUndefined();
    expect(sectionOf('/production')?.key).toBe('production');
  });

  it('导航入口都不是规划中页面，且路径能被本模块自己匹配', () => {
    for (const s of [...visibleWiki, ...visibleTools]) {
      expect(s.status, s.key).toBeUndefined();
      expect(sectionOf(s.path)?.key, s.path).toBe(s.key);
    }
  });

  it('规划中模块不进入导航', () => {
    const nav = [...visibleWiki, ...visibleTools].map((s) => s.key);
    for (const s of FUTURE) {
      expect(nav, s.key).not.toContain(s.key);
      expect(s.status, s.key).toBe('planned');
    }
  });
});
