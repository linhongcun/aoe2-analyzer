import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../../src/content/events.json';

afterEach(() => {
  vi.doUnmock('../../src/content/events.json');
  vi.doUnmock('../../src/content/players.json');
  vi.resetModules();
});

async function render(value: unknown) {
  vi.doMock('../../src/content/events.json', () => ({ default: value }));
  const { default: Events } = await import('../../src/features/events/Events');
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Events)));
}

describe('赛事页实际读取边界及空状态', () => {
  it('真实空目录保留维护说明并诚实呈现空状态', async () => {
    const html = await render({ ...raw, events: [] });
    expect(html).toContain('暂无已核对赛事');
    expect(html).toContain('role="status"');
    expect(html).toContain('人工维护；以主办方最新公告为准');
    expect(html).not.toContain('赛事资料暂不可用');
    expect(html).not.toContain('The Garrison 2026');
    expect(html).not.toMatch(/href="\/(?:players\/|civ\/)/);
  });
  it.each([{}, null, { ...raw, events: [{ id: 'unknown' }] }])('损坏内容被捕获并显示可访问的不可用状态', async (value) => {
    const html = await render(value);
    expect(html).toContain('赛事资料暂不可用');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('The Garrison 2026');
    expect(html).not.toMatch(/href="(?:https:|\/players\/)/);
  });
  it('选手依赖不可用时不生成错误的选手入口', async () => {
    vi.doMock('../../src/content/players.json', () => ({ default: {} }));
    const html = await render(raw);
    expect(html).toContain('赛事资料暂不可用');
    expect(html).not.toMatch(/href="\/players\//);
  });
});
