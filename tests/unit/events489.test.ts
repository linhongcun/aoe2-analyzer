import { describe, expect, it } from 'vitest';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { HOME_GROUPS } from '../../src/shared/nav/sections';
import { PAGE_META } from '../../src/domain/sharePage';

describe('赛事公告登记（issue 489）', () => {
  it('唯一静态页面在资料分组，首页和导航从登记派生', () => {
    const pages = PAGES.filter((page) => page.path === '/events');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ key: 'events', kind: 'page', lane: 'secondary', group: 'reference', label: '赛事公告', component: 'Events' });
    expect(HOME_GROUPS.find((group) => group.key === 'reference')?.sections.map((section) => section.path)).toContain('/events');
    expect(pages[0]?.match?.test('/events/the-garrison-2026')).toBe(false);
  });

  it('既有公开 metadata API 提供赛事页的中文标题与公告说明', () => {
    expect(PAGE_META['/events']).toMatchObject({ title: '赛事公告', description: '查看人工维护的赛事公告、公布日期范围、部分参赛选手与主办方来源。' });
  });
});
