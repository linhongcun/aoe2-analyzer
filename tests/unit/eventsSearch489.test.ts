import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { search, type SearchItem } from '../../src/domain/search';
import { useSearchIndex } from '../../src/features/search/hooks';

function SearchProbe() {
  return createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
}

describe('赛事登记派生唯一全局搜索入口', () => {
  it('中文、拼音及缩写均匹配赛事公告的准确路径', async () => {
    await loadCore();
    const html = renderToStaticMarkup(createElement(SearchProbe));
    const items: SearchItem[] = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
    expect(items.filter((item) => item.href === '/events')).toHaveLength(1);
    const item = items.find((entry) => entry.href === '/events');
    expect(item?.py).toBe('saishigonggao');
    expect(item?.pyi).toBe('ssgg');
    for (const query of ['赛事公告', 'saishigonggao', 'ssgg']) {
      expect(search(items, query).filter((entry) => entry.href === '/events')).toHaveLength(1);
    }
    expect(items.filter((entry) => entry.href.startsWith('/events/'))).toHaveLength(0);
  });
});
