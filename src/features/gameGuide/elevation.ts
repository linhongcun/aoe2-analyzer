/**
 * issue 734 高地伤害乘子。资源增量只读 eco.json。1.25 与 0.75 是 UGC 公式里的基数，经济数据不存这一对基数。
 * 悬崖没有专用字段，文案保持待确认，不补写乘子。
 */
import civsRaw from '../../data/raw/civs';
import { ECO } from '../../data/eco';

export const ELEVATION_HIGHER_RES = 211;
export const ELEVATION_LOWER_RES = 212;
export const HIGHER_BASE = 1.25;
export const LOWER_BASE = 0.75;
export const TATARS_EN = 'Tatars';

/** UGC Resources。lastModified 用响应头 Last-Modified 的日期，不猜正文发布日。 */
export const UGC_ELEVATION_SOURCE = {
  title: 'UGC Resources',
  url: 'https://ugc.aoe2.rocks/general/resources/resources/',
  lastModified: '2026-11-05',
} as const;

/** 官方新闻页 JSON-LD 的 datePublished。正文只承认高地加成存在，不给乘子。 */
export const HOTFIX_82587 = {
  title: '官方 Hotfix 82587',
  url: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-hotfix-82587/',
  publishedAt: '2023-04-27',
  build: '82587',
  quote: 'Organ Guns would largely ignore hill bonuses/penalties',
} as const;

export const CLIFF_PENDING = '悬崖是否与山体同一套乘子：待确认。站内经济数据没有悬崖专用字段，本页不补写。';
export const TERRAIN_OMISSION = '单位 PK 和对局助手的伤害计算未计入地形高低差。';

interface ResEffect {
  kind?: string;
  op?: string;
  res?: number;
  v?: number;
}

interface EcoRow {
  tech?: number;
  effects?: ResEffect[];
}

export interface ElevationEco {
  meta?: { patch?: string };
  civEco?: Record<string, EcoRow[] | undefined>;
}

interface ElevationCivRow {
  en?: string;
  zh?: string;
  bon?: string[];
  bonEn?: string[];
}

export type ResourceAdd = { state: 'absent' } | { state: 'value'; value: number } | { state: 'pending' };

export interface ElevationCiv {
  en: string;
  zh: string | null;
  higherAdd: ResourceAdd;
  lowerAdd: ResourceAdd;
  higherAddText: string | null;
  lowerAddText: string | null;
  higher: string | null;
  lower: string | null;
  techs: number[];
  bonusZh: string | null;
  bonusEn: string | null;
  bonusIndex: number | null;
  catalogMatches: boolean;
}

export interface ElevationFacts {
  patchBuild: string | null;
  patchDate: string | null;
  defaultHigherAdd: string | null;
  defaultLowerAdd: string | null;
  defaultHigher: string | null;
  defaultLower: string | null;
  tatars: ElevationCiv;
  others: ElevationCiv[];
}

export function formatElevationNumber(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const scaled = Math.round(value * 100);
  if (Math.abs(value * 100 - scaled) > 1e-6) return null;
  const sign = scaled < 0 ? '-' : '';
  const abs = Math.abs(scaled);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return sign + (frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`);
}

export function resourceAdd(rows: readonly EcoRow[] | undefined, res: number): ResourceAdd {
  let sum = 0;
  let seen = false;
  for (const row of rows ?? []) {
    for (const effect of row.effects ?? []) {
      if (effect.kind !== 'res' || effect.res !== res) continue;
      if (effect.op !== 'add' || typeof effect.v !== 'number' || !Number.isFinite(effect.v)) return { state: 'pending' };
      sum += effect.v;
      seen = true;
    }
  }
  return seen ? { state: 'value', value: sum } : { state: 'absent' };
}

function addText(add: ResourceAdd): string | null {
  return add.state === 'value' ? formatElevationNumber(add.value) : null;
}

function multiplied(base: number, add: ResourceAdd): string | null {
  return add.state === 'value' ? formatElevationNumber(base + add.value) : null;
}

function techsFor(rows: readonly EcoRow[] | undefined): number[] {
  const ids: number[] = [];
  for (const row of rows ?? []) {
    const hit = (row.effects ?? []).some((effect) => effect.kind === 'res' && (effect.res === ELEVATION_HIGHER_RES || effect.res === ELEVATION_LOWER_RES));
    if (!hit || typeof row.tech !== 'number' || ids.includes(row.tech)) continue;
    ids.push(row.tech);
  }
  return ids;
}

function catalogMatches(bonus: string | null, add: ResourceAdd): boolean {
  if (!bonus || add.state !== 'value') return false;
  const percent = formatElevationNumber(add.value * 100);
  return percent !== null && bonus.includes(`${percent}%`);
}

function describeCiv(en: string, rows: readonly EcoRow[] | undefined, civs: readonly ElevationCivRow[]): ElevationCiv {
  const civ = civs.find((item) => item.en === en);
  const bonusIndex = (civ?.bonEn ?? []).findIndex((line) => /higher elevation/i.test(line));
  const higherAdd = resourceAdd(rows, ELEVATION_HIGHER_RES);
  const lowerAdd = resourceAdd(rows, ELEVATION_LOWER_RES);
  const index = bonusIndex >= 0 ? bonusIndex : null;
  const bonusZh = index === null ? null : (civ?.bon?.[index] ?? null);
  return {
    en,
    zh: civ?.zh ?? null,
    higherAdd,
    lowerAdd,
    higherAddText: addText(higherAdd),
    lowerAddText: addText(lowerAdd),
    higher: multiplied(HIGHER_BASE, higherAdd),
    lower: multiplied(LOWER_BASE, lowerAdd),
    techs: techsFor(rows),
    bonusZh,
    bonusEn: index === null ? null : (civ?.bonEn?.[index] ?? null),
    bonusIndex: index,
    catalogMatches: catalogMatches(bonusZh, higherAdd),
  };
}

function notable(civ: ElevationCiv): boolean {
  const odd = (add: ResourceAdd) => add.state === 'pending' || (add.state === 'value' && add.value !== 0);
  return odd(civ.higherAdd) || odd(civ.lowerAdd);
}

export function elevationFacts(eco: ElevationEco = ECO, civs: readonly ElevationCivRow[] = civsRaw as ElevationCivRow[]): ElevationFacts {
  const patch = eco.meta?.patch ?? '';
  const civEco = eco.civEco ?? {};
  const zero: ResourceAdd = { state: 'value', value: 0 };
  const others = Object.keys(civEco)
    .filter((en) => en !== TATARS_EN)
    .map((en) => describeCiv(en, civEco[en], civs))
    .filter(notable);
  return {
    patchBuild: /DE Update (\d+)/.exec(patch)?.[1] ?? null,
    patchDate: /\((\d{4}-\d{2}-\d{2})\)/.exec(patch)?.[1] ?? null,
    defaultHigherAdd: formatElevationNumber(0),
    defaultLowerAdd: formatElevationNumber(0),
    defaultHigher: multiplied(HIGHER_BASE, zero),
    defaultLower: multiplied(LOWER_BASE, zero),
    tatars: describeCiv(TATARS_EN, civEco[TATARS_EN], civs),
    others,
  };
}
