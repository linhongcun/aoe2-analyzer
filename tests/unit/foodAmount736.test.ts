import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import eco from '../../src/data/raw/eco';
import BuildingDetail from '../../src/features/buildings/components/BuildingDetail';
import { FoodAmount } from '../../src/features/buildings/components/FoodAmount';
import {
  UGC_CHINESE_FARM_FOOD,
  UGC_FARM_FOOD_DEFAULT,
  UGC_FISH_TRAP_FOOD_DEFAULT,
  farmFoodAmount,
  fishTrapFoodAmount,
  type FoodCivRow,
  type FoodEcoSlice,
} from '../../src/features/buildings/foodAmount';

const live = eco as unknown as FoodEcoSlice & {
  meta: { patch: string };
  ecoTechs: Record<string, { effects: { kind?: string; op?: string; res?: number; v?: number; attr?: string }[] }>;
  civEco: Record<string, FoodCivRow[]>;
};
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const renderFood = (buildingId: number, source?: FoodEcoSlice) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/building/${buildingId}` }, createElement(FoodAmount, { buildingId, source })));
const renderBuilding = (id: number) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/building/${id}`] },
      createElement(Routes, null, createElement(Route, { path: '/building/:id', element: createElement(BuildingDetail) })),
    ),
  );
const cell = (html: string, marker: string, step: string, field: string) => {
  const root = html.match(new RegExp(`<dl[^>]*data-t="${marker}"[^>]*>([\\s\\S]*?)<\\/dl>`))?.[1] ?? '';
  const row = root.match(new RegExp(`<div[^>]*data-step="${step}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const value = row.match(new RegExp(`data-field="${field}"[^>]*>([\\s\\S]*?)<\\/(?:dd|span)>`))?.[1] ?? '';
  return visible(value);
};

let core: Core | null = null;
beforeAll(async () => {
  core = await loadCore();
});

describe('issue 736 农田与养鱼场食物总量', () => {
  it('通用新田按 UGC 起始加 ecoTechs 的资源 36，中国队起始只在 civEco 没有该行时展示', () => {
    const before = structuredClone(live);
    const data = farmFoodAmount();
    expect(live).toEqual(before);
    expect(UGC_FARM_FOOD_DEFAULT).toBe(175);
    expect(UGC_CHINESE_FARM_FOOD).toBe(220);
    expect(live.ecoTechs['14']!.effects.find((effect) => effect.res === 36)).toMatchObject({ op: 'add', v: 75 });
    expect(live.ecoTechs['13']!.effects.find((effect) => effect.res === 36)).toMatchObject({ op: 'add', v: 125 });
    expect(live.ecoTechs['12']!.effects.find((effect) => effect.res === 36)).toMatchObject({ op: 'add', v: 175 });
    expect(data.steps.map((step) => [step.key, step.add, step.total])).toEqual([
      ['base', null, 175],
      ['14', 75, 250],
      ['13', 125, 375],
      ['12', 175, 550],
    ]);
    expect(JSON.stringify(live.civEco.Chinese)).not.toContain('"res":36');
    expect(data.chineseFromUgc).toBe(true);
    expect(data.chineseSteps.map((step) => step.total)).toEqual([220, 295, 420, 595]);
    expect(data.patch).toContain('188329');
  });

  it('累计跟随切片里的 add，缺一条或中国队出现资源 36 时不再编造后续满额', () => {
    const shifted = structuredClone(live);
    const horse = shifted.ecoTechs['14']!.effects.find((effect) => effect.res === 36);
    expect(horse).toBeTruthy();
    horse!.v = 80;
    const shiftedData = farmFoodAmount(shifted);
    expect(shiftedData.steps.map((step) => step.total)).toEqual([175, 255, 380, 555]);
    expect(shiftedData.chineseSteps.map((step) => step.total)).toEqual([220, 300, 425, 600]);

    const broken = structuredClone(live);
    broken.ecoTechs['14']!.effects = broken.ecoTechs['14']!.effects.filter((effect) => effect.res !== 36);
    const brokenData = farmFoodAmount(broken);
    expect(brokenData.steps.map((step) => step.total)).toEqual([175, null, null, null]);
    expect(brokenData.chineseSteps[0]?.total).toBe(220);
    expect(brokenData.chineseSteps.slice(1).every((step) => step.total == null)).toBe(true);

    const exported = structuredClone(live);
    const chinese = exported.civEco.Chinese;
    expect(chinese).toBeTruthy();
    chinese!.push({ effects: [{ kind: 'res', op: 'set', res: 36, v: 220 }] });
    const exportedData = farmFoodAmount(exported);
    expect(exportedData.chineseFromUgc).toBe(false);
    expect(exportedData.chineseSteps).toEqual([]);
    expect(exportedData.steps[3]?.total).toBe(550);
  });

  it('养鱼场基准锁 710，马来读取 tech 637 的 set，且不把 715 写进计算', () => {
    const before = structuredClone(live);
    const data = fishTrapFoodAmount();
    expect(live).toEqual(before);
    expect(UGC_FISH_TRAP_FOOD_DEFAULT).toBe(710);
    expect(data.base).toBe(710);
    expect(data.base).not.toBe(715);
    const malay = live.civEco.Malay?.find((row) => row.tech === 637);
    expect(malay?.effects).toEqual([expect.objectContaining({ op: 'set', res: 88, v: 2130 })]);
    expect(data.malay).toMatchObject({ tech: 637, value: 2130, triple: true });
    expect(data.malay?.value).toBe(710 * 3);
    expect(readFileSync('src/features/buildings/foodAmount.ts', 'utf8')).not.toMatch(/715/);
    expect(readFileSync('src/features/buildings/components/FoodAmount.tsx', 'utf8')).not.toMatch(/715/);

    const other = structuredClone(live);
    const malayRows = other.civEco.Malay;
    expect(malayRows).toBeTruthy();
    const row = malayRows!.find((item) => item.tech === 637);
    const effect = (row?.effects as { v?: number }[] | undefined)?.[0];
    expect(effect).toBeTruthy();
    effect!.v = 2000;
    expect(fishTrapFoodAmount(other).malay).toMatchObject({ value: 2000, triple: false });
    malayRows!.push({ tech: 1, effects: [{ kind: 'res', op: 'set', res: 88, v: 1 }] });
    expect(fishTrapFoodAmount(other).malay).toBeNull();
  });

  it('农田页展示满额表、中国队差异和短链，养鱼场展示 710 与 2130', () => {
    expect(core?.techById[14]?.zh).toBe('马轭');
    const farm = renderFood(50);
    expect(visible(farm)).toContain('已有农田提供的食物数量较少');
    expect(visible(farm)).toContain('不做补种或配田');
    expect(cell(farm, 'farm-food-generic', 'base', 'total')).toBe('175');
    expect(cell(farm, 'farm-food-generic', '14', 'total')).toBe('250');
    expect(cell(farm, 'farm-food-generic', '14', 'add')).toBe('+75');
    expect(cell(farm, 'farm-food-generic', '13', 'total')).toBe('375');
    expect(cell(farm, 'farm-food-generic', '13', 'add')).toBe('+125');
    expect(cell(farm, 'farm-food-generic', '12', 'total')).toBe('550');
    expect(cell(farm, 'farm-food-generic', '12', 'add')).toBe('+175');
    expect(visible(farm)).toContain('civEco.Chinese 没有导出这条起始行');
    expect(cell(farm, 'farm-food-chinese', 'base', 'total')).toBe('220');
    expect(cell(farm, 'farm-food-chinese', '12', 'total')).toBe('595');
    expect(farm).toContain('href="/tech/14"');
    expect(farm).toContain('href="/tech/13"');
    expect(farm).toContain('href="/tech/12"');
    expect(farm).toContain('href="/production"');
    expect(farm).toContain('https://ugc.aoe2.rocks/general/resources/resources/');
    expect(farm).toContain('188329');
    expect(farm).not.toContain('715');
    expect(farm).not.toMatch(/<table\b/);
    expect(visible(renderFood(50, { ecoTechs: {}, civEco: { Chinese: [{ effects: [{ res: 36 }] }] } }))).toContain('中国队起始量待确认');

    const trap = renderFood(199);
    expect(cell(trap, 'fish-trap-food-table', 'base', 'total')).toBe('710');
    expect(cell(trap, 'fish-trap-food-table', 'malay', 'total')).toBe('2130');
    expect(visible(trap)).toContain('3 倍');
    expect(visible(trap)).toContain('civEco.Malay');
    expect(trap).toContain('href="/civ/Malay"');
    expect(trap).not.toContain('715');
    expect(trap).not.toMatch(/<table\b/);
    expect(visible(renderFood(199, { civEco: { Malay: [] } }))).toContain('马来食物总量待确认');
    expect(renderFood(68)).toBe('');
    expect(renderFood(12)).toBe('');
  });

  it('建筑详情只在农田和养鱼场挂出这张表', () => {
    expect(core?.buildingById[50]?.zh).toBe('农田');
    expect(core?.buildingById[199]?.zh).toBe('养鱼场');
    const farm = renderBuilding(50);
    expect(farm).toContain('data-t="farm-food"');
    expect(farm).not.toContain('data-t="fish-trap-food"');
    expect(visible(farm)).toContain('550');
    const trap = renderBuilding(199);
    expect(trap).toContain('data-t="fish-trap-food"');
    expect(trap).not.toContain('data-t="farm-food"');
    expect(visible(trap)).toContain('710');
    expect(renderBuilding(68)).not.toContain('data-t="farm-food"');
    expect(renderBuilding(12)).not.toContain('食物总量');
  });
});
