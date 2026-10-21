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
const render = (open = true) => renderToStaticMarkup(createElement(CommandPalette, { open, onClose: vi.fn() }));

describe('#291 全局搜索语义', () => {
  beforeEach(() => vi.mocked(search).mockReturnValue([]));

  it('提供有名称的模态对话框与控制结果列表的组合框', () => {
    const html = render();
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-label="全局搜索"/);
    const listId = html.match(/<ul[^>]*id="([^"]+)"[^>]*role="listbox"/)?.[1];
    expect(listId).toBeTruthy();
    const input = html.match(/<input[^>]+>/)?.[0] ?? '';
    expect(input).toContain('role="combobox"');
    expect(input).toContain('aria-label="全局搜索"');
    expect(input).toContain(`aria-controls="${listId}"`);
    expect(input).toContain('aria-expanded="true"');
    expect(input).not.toContain('aria-activedescendant');
  });

  it('每个结果都是选项，当前选项 id 与组合框活动后代一致', () => {
    vi.mocked(search).mockReturnValue(results);
    const html = render();
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
