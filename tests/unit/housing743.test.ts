import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json' with { type: 'json' };
import {
  HOUSING_GUIDE_HREF as BUILDING_GUIDE_HREF,
  HousingGuideLink,
  POP_ANCHOR as BUILDING_POP_ANCHOR,
} from '../../src/features/buildings/components/HousingGuideLink';
import {
  HOUSING_BONUS_NOTE,
  HOUSING_CAP_NOTE,
  HOUSING_GUIDE_HREF,
  HOUSING_LEAD,
  POP_ANCHOR,
  UGC_HOUSING_NOTE,
  UGC_HOUSING_SOURCE,
  buildingPopHref,
  catalogGaps,
  gapText,
  housingFacts,
  housingPatch,
  housingRows,
} from '../../src/features/gameGuide/housing';
import HousingCard from '../../src/features/gameGuide/housingCard';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LOCKED = [
  { id: 70, zh: '房屋', en: 'House', pop: 5 },
  { id: 109, zh: '城镇中心', en: 'Town Center', pop: 5 },
  { id: 1734, zh: '大庄园', en: 'Folwark', pop: 5 },
  { id: 2556, zh: '聚落', en: 'Settlement', pop: 5 },
  { id: 82, zh: '城堡', en: 'Castle', pop: 20 },
  { id: 1251, zh: '营垒', en: 'Krepost', pop: 20 },
] as const;

describe('#743 提供人口只读建筑资料的 pop', () => {
  it('正整数 pop 与建筑页会显示的条目一致，并按时代和编号排列', () => {
    const fromFile = buildings
      .filter((building) => Number.isInteger(building.pop) && building.pop > 0)
      .map((building) => ({ id: building.id, zh: building.zh, en: building.en, pop: building.pop }));
    expect(housingFacts().rows).toEqual(fromFile);
    expect(housingFacts().rows).toEqual(LOCKED.map((row) => ({ ...row })));
    expect(housingFacts().patchBuild).toBe('188329');
    expect(housingFacts().patchDate).toBe('2026-10-28');
  });

  it('0、小数和缺名字不编成另一套人口', () => {
    expect(
      housingRows([
        { id: 1, zh: '甲', pop: 0 },
        { id: 2, zh: '乙', pop: 1.5 },
        { id: 3, pop: 5 },
      ]),
    ).toEqual([{ id: 3, zh: null, en: null, pop: 5 }]);
    expect(
      housingRows([
        { id: 9, zh: '后', en: 'Later', pop: 4, age: 3 },
        { id: 8, zh: '先', en: 'Soon', pop: 4, age: 1 },
      ]).map((row) => row.id),
    ).toEqual([8, 9]);
    expect(housingPatch(undefined)).toEqual({ patchBuild: null, patchDate: null });
    expect(housingPatch('昨天')).toEqual({ patchBuild: null, patchDate: null });
    expect(housingPatch('DE Update 188329 (2026-10-28)')).toEqual({ patchBuild: '188329', patchDate: '2026-10-28' });
  });

  it('经济数据点了名、建筑资料没有的编号标待确认', () => {
    const facts = housingFacts();
    expect(facts.gaps).toEqual([
      { id: 2558, zh: '聚落' },
      { id: 2560, zh: '聚落' },
      { id: 2418, zh: '城堡' },
    ]);
    expect(gapText('聚落', [2558, 2560])).toContain('待确认');
    expect(gapText('城堡', [2418])).toContain('这条');
    expect(catalogGaps(undefined, facts.rows)).toEqual([]);
    expect(catalogGaps({ of: [{ zh: '城堡', b: [82, 2418] }] }, facts.rows)).toEqual([{ id: 2418, zh: '城堡' }]);
  });
});

describe('#743 短卡写明上限来自开房设置，并链到提供人口', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HousingCard)));
  const visible = text(html);

  it('六座建筑的数字和建筑页锚点都在', () => {
    for (const row of LOCKED) {
      expect(html).toContain(`data-housing-id="${row.id}"`);
      expect(html).toContain(`href="${buildingPopHref(row.id)}"`);
      expect(visible).toContain(row.zh);
    }
    expect(visible).toContain(HOUSING_LEAD);
    expect(visible).toContain('5');
    expect(visible).toContain('20');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('世界奇观');
    expect(html).not.toContain('大商站');
  });

  it('不写天梯默认上限，也不写该盖几座', () => {
    expect(visible).toContain(HOUSING_CAP_NOTE);
    expect(visible).toContain(HOUSING_BONUS_NOTE);
    expect(visible).not.toMatch(/该盖|2000|人口上限\s*\d+|天梯默认上限为/);
    expect(visible).not.toContain('哥特');
    expect(visible).toContain('是否提供人口：待确认');
    expect(visible).toContain('标成聚落');
    expect(visible).toContain('标成城堡');
    expect(html).toContain('>2558<');
    expect(html).toContain('>2560<');
    expect(html).toContain('>2418<');
  });

  it('出处带数据版本和 UGC 核对日', () => {
    expect(html).toContain('href="/about-data"');
    expect(html).toContain(`href="${UGC_HOUSING_SOURCE.url}"`);
    expect(html).toContain('dateTime="2026-11-05"');
    expect(html).toContain('dateTime="2026-11-07"');
    expect(html).toContain('dateTime="2026-10-28"');
    expect(visible).toContain('188329');
    expect(visible).toContain(UGC_HOUSING_NOTE);
    expect(HOUSING_GUIDE_HREF).toBe(BUILDING_GUIDE_HREF);
    expect(POP_ANCHOR).toBe(BUILDING_POP_ANCHOR);
    expect(buildingPopHref(70)).toBe('/building/70#pop');
  });

  it('没有 pop 时不画空表', () => {
    const empty = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(HousingCard, { facts: { rows: [], gaps: [], patchBuild: null, patchDate: null } })),
    );
    expect(empty).toContain('data-housing="empty"');
    expect(empty).not.toContain('<table');
    expect(text(empty)).toContain('待确认');
    expect(text(empty)).not.toContain('188329');
  });

  it('建筑页回链用同一地址', () => {
    const link = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HousingGuideLink)));
    expect(link).toContain('data-testid="building-housing-link"');
    expect(link).toContain(`href="${HOUSING_GUIDE_HREF}"`);
    expect(text(link)).toContain('人口与房屋一览');
  });
});
