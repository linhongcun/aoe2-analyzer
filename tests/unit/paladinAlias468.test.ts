import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadCore, type Core } from '../../src/data';
import { UNIT_ALIASES } from '../../src/data/aliases';
import { searchRequirements } from '../../src/domain/civRequirements';
import { search, type SearchItem } from '../../src/domain/search';
import { useSearchIndex } from '../../src/features/search/hooks';

let core: Core;
let index: SearchItem[];

function IndexProbe() {
  const items = useSearchIndex();
  return createElement('script', { type: 'application/json', dangerouslySetInnerHTML: { __html: JSON.stringify(items) } });
}

beforeAll(async () => {
  core = await loadCore();
  const html = renderToStaticMarkup(createElement(IndexProbe));
  index = JSON.parse(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'))) as SearchItem[];
});

describe('#468 已核实的圣骑士别名', () => {
  it('唯一单位别名表指向569，中文主名仍为游侠', () => {
    expect(UNIT_ALIASES[569]).toContain('圣骑士');
    expect(core.unitById[569]!.zh).toBe('游侠');
    expect(
      Object.entries(UNIT_ALIASES)
        .filter(([, aliases]) => aliases.includes('圣骑士'))
        .map(([id]) => Number(id)),
    ).toEqual([569]);
  });

  it.each(['圣骑士', ' 圣骑士 '])('真实全局索引搜索%s得到游侠原详情', (query) => {
    const hits = search(index, query).filter((item) => item.kind === 'unit');
    expect(hits.map((item) => item.id)).toEqual(['569']);
    expect(hits[0]).toMatchObject({ zh: '游侠', en: 'Paladin', href: '/unit/569' });
  });

  it.each(['圣骑士', ' 圣骑士 '])('文明必备检索%s保留精确单位类型', (query) => {
    expect(searchRequirements(core, query, 'unit').map((option) => option.ref)).toEqual([{ kind: 'unit', id: 569 }]);
    expect(searchRequirements(core, query, 'all').map((option) => option.ref)).toContainEqual({ kind: 'unit', id: 569 });
    expect(searchRequirements(core, query, 'tech')).toEqual([]);
  });

  it('文明检索共享已有单位别名，和尚对应僧侣125', () => {
    expect(searchRequirements(core, '和尚', 'unit').map((option) => option.ref)).toContainEqual({ kind: 'unit', id: 125 });
  });

  it('剑士仍可找到吴的真实单位，不误映成日本武士291', () => {
    expect(core.unitById[1974]!.zh).toBe('剑士');
    const requirements = searchRequirements(core, '剑士', 'unit').map((option) => option.ref.id);
    expect(requirements).toContain(1974);
    expect(requirements).not.toContain(291);
    const global = search(index, '剑士', 100)
      .filter((item) => item.kind === 'unit')
      .map((item) => item.id);
    expect(global).toContain('1974');
    expect(global).not.toContain('291');
  });
});
