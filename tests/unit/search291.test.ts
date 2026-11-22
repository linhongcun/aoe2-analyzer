import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { search, type SearchItem } from '../../src/domain/search';
import CommandPalette from '../../src/features/search/components/CommandPalette';

vi.mock('../../src/features/search/hooks', () => ({ useSearchIndex: () => [] }));
vi.mock('../../src/domain/search', () => ({ search: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const results: SearchItem[] = [
  { kind: 'page', id: 'civs', zh: '文明', en: 'Civilizations', href: '/civs', sub: '文明列表' },
  { kind: 'page', id: 'units', zh: '单位', en: 'Units', href: '/units', sub: '单位列表' },
];
const render = (open = true, initialQuery?: string) => renderToStaticMarkup(createElement(CommandPalette, { open, initialQuery, onClose: vi.fn() }));

describe('#291 / Issue 1282 全局搜索语义与空态直达', () => {
  beforeEach(() => vi.mocked(search).mockReturnValue([]));

  it('空输入时展示 6 项常用工具直达并选中首项；无匹配查询时清空活动后代', () => {
    const emptyHtml = render(true);
    expect(emptyHtml).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-label="全局搜索"/);
    const listId = emptyHtml.match(/<ul[^>]*id="([^"]+)"[^>]*role="listbox"/)?.[1];
    expect(listId).toBeTruthy();
    const emptyOptions = [...emptyHtml.matchAll(/<li[^>]*role="option"[^>]*>/g)].map((match) => match[0]);
    expect(emptyOptions).toHaveLength(6);
    expect(emptyOptions[0]).toContain('aria-selected="true"');
    const firstQuickId = emptyOptions[0]?.match(/id="([^"]+)"/)?.[1];
    const emptyInput = emptyHtml.match(/<input[^>]+>/)?.[0] ?? '';
    expect(emptyInput).toContain('role="combobox"');
    expect(emptyInput).toContain('aria-label="全局搜索"');
    expect(emptyInput).toContain(`aria-controls="${listId}"`);
    expect(emptyInput).toContain('aria-expanded="true"');
    expect(emptyInput).toContain(`aria-activedescendant="${firstQuickId}"`);
    expect(emptyHtml).toContain('常用工具直达');

    const missHtml = render(true, 'zzzz-no-result');
    const missInput = missHtml.match(/<input[^>]+>/)?.[0] ?? '';
    expect(missInput).not.toContain('aria-activedescendant');
    expect(missHtml).toContain('无匹配结果');
  });

  it('每个搜索结果都是选项，当前选项 id 与组合框活动后代一致', () => {
    vi.mocked(search).mockReturnValue(results);
    const html = render(true, '文明');
    const options = [...html.matchAll(/<li[^>]*role="option"[^>]*>/g)].map((match) => match[0]);
    expect(options).toHaveLength(2);
    expect(options[0]).toContain('aria-selected="true"');
    expect(options[1]).toContain('aria-selected="false"');
    const selectedId = options[0]?.match(/id="([^"]+)"/)?.[1];
    expect(selectedId).toBeTruthy();
    expect(html.match(/<input[^>]+>/)?.[0]).toContain(`aria-activedescendant="${selectedId}"`);
  });

  it('关闭后不渲染对话框和搜索控件', () => {
    expect(render(false)).toBe('');
  });
});
