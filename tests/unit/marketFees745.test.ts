import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { DAT } from '../../src/domain/datEffects';
import eco from '../../src/data/raw/eco';
import BuildingDetail from '../../src/features/buildings/components/BuildingDetail';
import { MarketFees } from '../../src/features/buildings/components/MarketFees';
import {
  BANKING_TECH_ID,
  COINAGE_TECH_ID,
  GUILDS_TECH_ID,
  MARKET_BUILDING_ID,
  MARKET_FEE_ANCHOR,
  SARACEN_MARKET_TECH,
  SARACENS_EN,
  UGC_DEFAULT_RATE,
  UGC_MARKET_CHECKED,
  exportHasMarketBaseline,
  formatMarketPercent,
  marketFeeFacts,
  type MarketEco,
} from '../../src/features/buildings/marketFees';
import { MarketFeeTechLinks } from '../../src/features/techs/components/MarketFeeTechLinks';
import TechDetail from '../../src/features/techs/components/TechDetail';

const liveEco = eco as unknown as MarketEco;
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const renderFees = (buildingId: number) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/building/${buildingId}` }, createElement(MarketFees, { buildingId })));
const renderBuilding = (id: number) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/building/${id}`] },
      createElement(Routes, null, createElement(Route, { path: '/building/:id', element: createElement(BuildingDetail) })),
    ),
  );
const renderTech = (id: number) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/tech/${id}`] },
      createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) })),
    ),
  );
const cell = (html: string, marker: string, step: string) => {
  const root = html.match(new RegExp(`<dl[^>]*data-t="${marker}"[^>]*>([\\s\\S]*?)<\\/dl>`))?.[1] ?? '';
  const row = root.match(new RegExp(`<div[^>]*data-step="${step}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const value = row.match(/data-field="rate"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '';
  return visible(value);
};

beforeAll(async () => {
  await loadCore();
});

describe('issue 745 市场交易费与进贡税', () => {
  it('行会、铸币术、银行业和萨拉森市场奖只读 effects 与 civEco，默认 30% 不是导出基准', () => {
    const beforeEffects = structuredClone(DAT);
    const beforeEco = structuredClone(liveEco);
    const facts = marketFeeFacts();
    expect(DAT).toEqual(beforeEffects);
    expect(liveEco).toEqual(beforeEco);
    expect(UGC_DEFAULT_RATE).toBe(0.3);
    expect(exportHasMarketBaseline(DAT, liveEco)).toBe(false);
    expect(facts.baselineExported).toBe(false);
    expect(facts.tradeDefault).toMatchObject({ res: 78, value: 0.3, percent: '30%', source: 'ugc' });
    expect(facts.tributeDefault).toMatchObject({ res: 46, value: 0.3, percent: '30%', source: 'ugc' });
    expect(facts.guilds).toEqual({ res: 78, value: 0.15, percent: formatMarketPercent(0.15) });
    expect(facts.coinage).toEqual({ res: 46, value: 0.2, percent: formatMarketPercent(0.2) });
    expect(facts.banking).toEqual({ res: 46, value: 0, percent: formatMarketPercent(0) });
    expect(facts.saracens).toEqual({ res: 78, value: 0.05, percent: formatMarketPercent(0.05), tech: SARACEN_MARKET_TECH });
    expect([facts.tradeDefault?.value, facts.guilds?.value, facts.saracens?.value]).toEqual([0.3, 0.15, 0.05]);
    expect(facts.patch).toContain('188329');
    expect([facts.guilds?.value, facts.saracens?.value]).not.toContain(0.1);
  });

  it('导出对不上或出现 0.3 基准时不再编造费率', () => {
    const shifted = structuredClone(DAT);
    const shiftedEco = structuredClone(liveEco);
    const guilds = shifted.techs.Guilds?.eco.find((effect) => effect.res === 78);
    expect(guilds).toBeTruthy();
    guilds!.v = 0.12;
    expect(marketFeeFacts(shifted, shiftedEco).guilds).toBeNull();

    const extra = structuredClone(DAT);
    extra.techs.Guilds?.eco.push({ res: 78, op: 'set', v: 0.15, name: '资源78' });
    expect(marketFeeFacts(extra, liveEco).guilds).toBeNull();

    const missing = structuredClone(liveEco);
    missing.civEco = { ...missing.civEco, [SARACENS_EN]: [] };
    expect(marketFeeFacts(DAT, missing).saracens).toBeNull();

    const baseline = structuredClone(DAT);
    baseline.techs['Grand Trunk Road']?.eco.push({ res: 46, op: 'set', v: 0.3, name: '资源46' });
    const hidden = marketFeeFacts(baseline, liveEco);
    expect(hidden.baselineExported).toBe(true);
    expect(hidden.tradeDefault).toBeNull();
    expect(hidden.tributeDefault).toBeNull();
    expect(hidden.guilds?.value).toBe(0.15);
  });

  it('市场页展示对照和三科技互链，其它建筑不显示', () => {
    const market = renderFees(MARKET_BUILDING_ID);
    const text = visible(market);
    expect(cell(market, 'market-fee-trade', 'trade-default')).toBe('30%');
    expect(cell(market, 'market-fee-trade', 'guilds')).toBe('15%');
    expect(cell(market, 'market-fee-trade', 'saracens')).toBe('5%');
    expect(cell(market, 'market-fee-tribute', 'tribute-default')).toBe('30%');
    expect(cell(market, 'market-fee-tribute', 'coinage')).toBe('20%');
    expect(cell(market, 'market-fee-tribute', 'banking')).toBe('0%');
    expect(text).toContain(`UGC #78 / #46（核对 ${UGC_MARKET_CHECKED}）`);
    expect(text).toContain('这不是 DE 导出');
    expect(text).toContain('行会把资源 78 设为 0.15');
    expect(text).toContain('铸币术把资源 46 设为 0.2');
    expect(text).toContain('银行业把资源 46 设为 0。');
    expect(text).toContain('萨拉森市场文明奖（civEco tech 355）把资源 78 设为 0.05');
    expect(text).toContain('不写买卖顺序，也不写进贡节奏');
    expect(text).not.toMatch(/丝绸之路|Grand Trunk|套利/);
    expect(text).not.toMatch(/10%/);
    expect(market).toContain(`id="${MARKET_FEE_ANCHOR}"`);
    expect(market).toContain('href="/tech/15"');
    expect(market).toContain('href="/tech/23"');
    expect(market).toContain('href="/tech/17"');
    expect(market).toContain(`href="/civ/${SARACENS_EN}"`);
    expect(market).toContain('https://ugc.aoe2.rocks/general/resources/resources/');
    expect(market).not.toContain('<table');
    expect(renderFees(12)).not.toContain('data-t="market-fees"');
    expect(readFileSync('src/data/effects.json', 'utf8')).toContain('"v":0.15');
    expect(readFileSync('src/features/buildings/components/MarketFees.tsx', 'utf8')).not.toMatch(/#745|#748/);
  });

  it('建筑页挂出机制条，三科技页链回市场', () => {
    const page = renderBuilding(MARKET_BUILDING_ID);
    expect(page).toContain('data-t="market-fees"');
    expect(visible(page)).toContain('这不是 DE 导出');
    expect(renderBuilding(12)).not.toContain('data-t="market-fees"');

    const guilds = renderTech(GUILDS_TECH_ID);
    expect(guilds).toContain('data-t="market-fee-tech-links"');
    expect(guilds).toContain('href="/building/84#market-fees"');
    expect(guilds).toContain('href="/tech/23"');
    expect(guilds).toContain('href="/tech/17"');
    expect(visible(guilds)).toContain('铸币术');
    expect(visible(guilds)).toContain('银行业');
    const coinage = renderTech(COINAGE_TECH_ID);
    expect(coinage).toContain('href="/tech/15"');
    expect(coinage).toContain('href="/tech/17"');
    const banking = renderTech(BANKING_TECH_ID);
    expect(banking).toContain('href="/tech/15"');
    expect(banking).toContain('href="/tech/23"');
    expect(renderTech(101)).not.toContain('data-t="market-fee-tech-links"');
    const alone = renderToStaticMarkup(createElement(StaticRouter, { location: '/tech/15' }, createElement(MarketFeeTechLinks, { techId: 15 })));
    expect(alone).toContain('href="/building/84#market-fees"');
  });
});
