/**
 * issue 745：市场交易费与进贡税。
 * 行会、铸币术、银行业只读 effects.json 对应科技，并与 eco.json ecoTechs 的同一条 set 对上。
 * 萨拉森市场文明奖只读 eco.json civEco.Saracens，并与 effects.json 里同一条文明奖对上。
 * 默认 30% 不在这两份导出的基准 set 里，只标 UGC 资源 78 / 46（核对 2026-11-07）。
 * 意大利丝绸之路（资源 78 设为 0.1）不在本条范围，读取时不扫其它科技。
 */
import { DAT, type DatFile } from './datEffects';
import { ECO } from '../data/eco';

export const MARKET_BUILDING_ID = 84;
export const TRADE_FEE_RES = 78;
export const TRIBUTE_TAX_RES = 46;
export const GUILDS_TECH_ID = 15;
export const COINAGE_TECH_ID = 23;
export const BANKING_TECH_ID = 17;
export const SARACEN_MARKET_TECH = 355;
export const SARACENS_EN = 'Saracens';
export const MARKET_FEE_TECH_IDS = [GUILDS_TECH_ID, COINAGE_TECH_ID, BANKING_TECH_ID] as const;

/** UGC Resources。默认交易费 / 进贡税只来自这里，站内导出没有基准 set。 */
export const UGC_MARKET_HREF = 'https://ugc.aoe2.rocks/general/resources/resources/';
export const UGC_MARKET_CHECKED = '2026-11-07';
export const UGC_DEFAULT_RATE = 0.3;

interface RateEffect {
  kind?: unknown;
  op?: unknown;
  res?: unknown;
  v?: unknown;
}

interface MarketEcoTech {
  effects?: unknown;
}

interface MarketCivRow {
  tech?: unknown;
  source?: unknown;
  effects?: unknown;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
export interface MarketEco {
  meta?: { patch?: unknown };
  ecoTechs?: Record<string, MarketEcoTech | null | undefined>;
  civEco?: Record<string, unknown>;
}

export interface MarketRate {
  res: number;
  value: number;
  percent: string;
}

export interface MarketDefault extends MarketRate {
  source: 'ugc';
}

export interface MarketFeeFacts {
  patch: string | null;
  /** effects 与 civEco 里是否已有资源 78 或 46 的 0.3 set。当前导出为 false。 */
  baselineExported: boolean;
  tradeDefault: MarketDefault | null;
  tributeDefault: MarketDefault | null;
  guilds: MarketRate | null;
  coinage: MarketRate | null;
  banking: MarketRate | null;
  saracens: (MarketRate & { tech: number }) | null;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function formatMarketRate(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function formatMarketPercent(value: number): string {
  const pct = Math.round(value * 100 * 1e6) / 1e6;
  return `${Object.is(pct, -0) ? 0 : pct}%`;
}

function effectsOf(value: unknown): RateEffect[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RateEffect => item !== null && typeof item === 'object');
}

/** 恰好一条该资源的 set。多一条、操作不符或不是资源效果时不采用。 */
function singleSet(value: unknown, res: number): number | null {
  const hits = effectsOf(value).filter((effect) => effect.res === res);
  const effect = hits[0];
  if (hits.length !== 1 || !effect || (effect.kind != null && effect.kind !== 'res') || effect.op !== 'set') return null;
  return finite(effect.v);
}

function rate(res: number, value: number): MarketRate {
  return { res, value, percent: formatMarketPercent(value) };
}

function walkBaseline(node: unknown, found: { yes: boolean }) {
  if (found.yes || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkBaseline(item, found);
    return;
  }
  const record = node as Record<string, unknown> & RateEffect;
  if ((record.res === TRADE_FEE_RES || record.res === TRIBUTE_TAX_RES) && record.op === 'set' && record.v === UGC_DEFAULT_RATE) {
    found.yes = true;
    return;
  }
  for (const value of Object.values(record)) walkBaseline(value, found);
}

export function exportHasMarketBaseline(file: unknown, eco: unknown): boolean {
  const found = { yes: false };
  walkBaseline(file, found);
  if (!found.yes) walkBaseline(eco, found);
  return found.yes;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function patchOf(file: DatFile, eco: MarketEco): string | null {
  const ecoPatch = text(eco.meta?.patch);
  const effectPatch = text(file.meta?.sources?.find((source) => source.id === 'DAT')?.patch);
  if (ecoPatch && effectPatch && ecoPatch !== effectPatch) return null;
  return ecoPatch ?? effectPatch;
}

function techById(file: DatFile, id: number) {
  const hits = Object.values(file.techs).filter((tech) => tech.id === id);
  return hits.length === 1 ? hits[0] : undefined;
}

function techRate(file: DatFile, eco: MarketEco, id: number, res: number): MarketRate | null {
  const fromEffects = singleSet(techById(file, id)?.eco, res);
  const fromEco = singleSet(eco.ecoTechs?.[String(id)]?.effects, res);
  if (fromEffects == null || fromEffects !== fromEco) return null;
  return rate(res, fromEffects);
}

function civRows(eco: MarketEco, civ: string): MarketCivRow[] | null {
  const rows = eco.civEco?.[civ];
  if (!Array.isArray(rows) || !rows.every((row) => row !== null && typeof row === 'object')) return null;
  return rows as MarketCivRow[];
}

function saracenRate(file: DatFile, eco: MarketEco): MarketFeeFacts['saracens'] {
  const rows = civRows(eco, SARACENS_EN);
  if (!rows) return null;
  const hits = rows.filter((row) => row.tech === SARACEN_MARKET_TECH && row.source === 'bonus');
  const hit = hits[0];
  if (hits.length !== 1 || !hit) return null;
  const fromEco = singleSet(hit.effects, TRADE_FEE_RES);
  const bonuses = file.civs[SARACENS_EN]?.bonus.filter((bonus) => bonus.tech === SARACEN_MARKET_TECH) ?? [];
  const bonus = bonuses[0];
  if (bonuses.length !== 1 || !bonus) return null;
  const fromEffects = singleSet(bonus.eco, TRADE_FEE_RES);
  if (fromEco == null || fromEco !== fromEffects) return null;
  return { ...rate(TRADE_FEE_RES, fromEco), tech: SARACEN_MARKET_TECH };
}

function ugcDefault(res: number, baselineExported: boolean): MarketDefault | null {
  if (baselineExported) return null;
  return { ...rate(res, UGC_DEFAULT_RATE), source: 'ugc' };
}

export function marketFeeFacts(file: DatFile = DAT, eco: MarketEco = ECO): MarketFeeFacts {
  const baselineExported = exportHasMarketBaseline(file, eco);
  return {
    patch: patchOf(file, eco),
    baselineExported,
    tradeDefault: ugcDefault(TRADE_FEE_RES, baselineExported),
    tributeDefault: ugcDefault(TRIBUTE_TAX_RES, baselineExported),
    guilds: techRate(file, eco, GUILDS_TECH_ID, TRADE_FEE_RES),
    coinage: techRate(file, eco, COINAGE_TECH_ID, TRIBUTE_TAX_RES),
    banking: techRate(file, eco, BANKING_TECH_ID, TRIBUTE_TAX_RES),
    saracens: saracenRate(file, eco),
  };
}
