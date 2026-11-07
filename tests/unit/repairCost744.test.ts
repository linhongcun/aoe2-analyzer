import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { civByEn, loadCore } from '../../src/data';
import { DAT } from '../../src/domain/datEffects';
import eco from '../../src/data/raw/eco';
import BuildingDetail from '../../src/features/buildings/components/BuildingDetail';
import { RepairCosts } from '../../src/features/buildings/components/RepairCosts';
import {
  BUILDING_REPAIR_RES,
  GEORGIANS_EN,
  REPAIR_ANCHOR,
  REPAIR_COST_HREF,
  TOWN_CENTER_ID,
  UGC_REPAIR_CHECKED,
  UNIT_REPAIR_RES,
  repairCostFacts,
  type RepairEco,
} from '../../src/features/buildings/repairCost';
import { BonusRows } from '../../src/features/civs/components/BonusRows';
import { VillagerGather } from '../../src/features/units/components/VillagerGather';

const liveEco = eco as unknown as RepairEco;
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const renderRepair = (facts?: Parameters<typeof RepairCosts>[0]['facts']) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/building/${TOWN_CENTER_ID}` }, createElement(RepairCosts, facts ? { facts } : {})));
const renderBuilding = (id: number) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/building/${id}`] },
      createElement(Routes, null, createElement(Route, { path: '/building/:id', element: createElement(BuildingDetail) })),
    ),
  );
const cell = (html: string, step: string) => {
  const row = html.match(new RegExp(`<div[^>]*data-step="${step}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const value = row.match(/data-field="(?:res|mul|limit)"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '';
  return visible(value);
};

beforeAll(async () => {
  await loadCore();
});

describe('issue 744 修复费用', () => {
  it('格鲁吉亚团队加成只读 civEco 与 effects 的资源 271 相乘，没有其它 270/271', () => {
    const beforeEffects = structuredClone(DAT);
    const beforeEco = structuredClone(liveEco);
    const facts = repairCostFacts();
    expect(DAT).toEqual(beforeEffects);
    expect(liveEco).toEqual(beforeEco);
    expect(facts.otherRepairEffects).toBe(false);
    expect(facts.georgians).toEqual({ res: BUILDING_REPAIR_RES, op: 'mul', v: 0.75, text: '×0.75' });
    expect(facts.patch).toContain('188329');
    expect(readFileSync('src/data/effects.json', 'utf8')).toContain('"res":271,"name":"资源271","op":"mul","v":0.75');
    expect(readFileSync('src/features/buildings/components/RepairCosts.tsx', 'utf8')).not.toMatch(/0\.75|#744|#748/);
    expect(readFileSync('src/features/civs/components/BonusRows.tsx', 'utf8')).not.toMatch(/0\.75|#744|#748/);
    expect(readFileSync('src/features/units/components/VillagerGather.tsx', 'utf8')).not.toMatch(/0\.75|#744|#748/);
  });

  it('团队相乘对不上或出现其它 270/271 时不再把未知效果写成倍率', () => {
    const shifted = structuredClone(liveEco);
    const rows = shifted.civEco?.[GEORGIANS_EN];
    expect(Array.isArray(rows)).toBe(true);
    const team = (rows as { source?: string; effects?: { res?: number; v?: number }[] }[]).find((row) => row.source === 'team');
    expect(team?.effects?.[0]).toBeTruthy();
    team!.effects![0]!.v = 0.5;
    expect(repairCostFacts(DAT, shifted).georgians).toBeNull();

    const extra = structuredClone(DAT);
    extra.civs.Britons?.team.eco.push({ res: UNIT_REPAIR_RES, op: 'mul', v: 0.4, name: '资源270' });
    const mixed = repairCostFacts(extra, liveEco);
    expect(mixed.georgians?.v).toBe(0.75);
    expect(mixed.otherRepairEffects).toBe(true);
    const mixedText = visible(renderRepair(mixed));
    expect(mixedText).toContain('×0.75');
    expect(mixedText).toContain('对不上单独这一条团队相乘');
    expect(mixedText).not.toContain('0.4');
    expect(mixedText).toContain('城镇中心、城门复合体倍率待确认');
    expect(mixedText).toContain('固定每分钟修复量待确认');
  });

  it('建筑页写出 270/271、格鲁吉亚乘法和待确认边界，不用表格', () => {
    const html = renderRepair();
    const text = visible(html);
    expect(cell(html, 'unit')).toBe(String(UNIT_REPAIR_RES));
    expect(cell(html, 'building')).toBe(String(BUILDING_REPAIR_RES));
    expect(cell(html, 'georgians')).toBe('×0.75');
    expect(cell(html, 'tc-gate')).toBe('待确认');
    expect(cell(html, 'rate')).toBe('待确认');
    expect(text).toContain('修理攻城单位和船');
    expect(text).toContain('修理建筑');
    expect(text).toContain('按造价计算的比例');
    expect(text).toContain(`核对 ${UGC_REPAIR_CHECKED}`);
    expect(text).toContain('这不是 DE 导出的基准比例');
    expect(text).toContain('格鲁吉亚团队加成把资源 271 乘以 0.75');
    expect(text).toContain('eco.json civEco.Georgians 的 team 行');
    expect(text).toContain('没有资源 270 或 271 的基准比例');
    expect(text).toContain('不估算要花多少资源');
    expect(text).not.toMatch(/一半|50%|每分钟\s*\d/);
    expect(html).toContain(`id="${REPAIR_ANCHOR}"`);
    expect(html).toContain(`href="/civ/${GEORGIANS_EN}"`);
    expect(html).toContain('https://ugc.aoe2.rocks/general/resources/resources/');
    expect(html).not.toContain('<table');
    const hidden = visible(renderRepair({ patch: null, otherRepairEffects: false, georgians: null }));
    expect(hidden).toContain('格鲁吉亚建筑修复倍率待确认');
    expect(hidden).not.toContain('×');
  });

  it('每座建筑都挂出说明，村民和格鲁吉亚页链到城镇中心', () => {
    expect(REPAIR_COST_HREF).toBe(`/building/${TOWN_CENTER_ID}#${REPAIR_ANCHOR}`);
    expect(visible(renderBuilding(TOWN_CENTER_ID))).toContain('这不是 DE 导出的基准比例');
    expect(renderBuilding(12)).toContain('data-t="repair-cost"');
    const georgians = civByEn(GEORGIANS_EN);
    expect(georgians).toBeTruthy();
    const civ = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Georgians' }, createElement(BonusRows, { c: georgians! })));
    expect(civ).toContain(`href="${REPAIR_COST_HREF}"`);
    expect(visible(civ)).toContain('查看建筑修复费用');
    expect(civ).not.toContain('<table');
    const franks = civByEn('Franks');
    expect(franks).toBeTruthy();
    const otherCiv = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Franks' }, createElement(BonusRows, { c: franks! })));
    expect(otherCiv).not.toContain(REPAIR_COST_HREF);
    const villager = renderToStaticMarkup(createElement(StaticRouter, { location: '/unit/83' }, createElement(VillagerGather, { unitId: 83 })));
    expect(villager).toContain(`href="${REPAIR_COST_HREF}"`);
    expect(visible(villager)).toContain('查看修复费用');
    expect(renderToStaticMarkup(createElement(VillagerGather, { unitId: 4 }))).toBe('');
  });
});
