/**
 * 招降机制（issue 731）。
 * 基准间隔与概率只引用官方 Update 99311；站内没有对应字段。
 * 虔诚 / 信念的最短、最长增量只读 effects.json 资源 178 / 179，不手写游戏数字。
 */
import { DAT, type DatFile, type DatTech } from '../../domain/datEffects';

export const MONK_ID = 125;
export const MISSIONARY_ID = 775;
/** 本刀只挂僧侣与传教士。其他僧侣类单位未单独核过，不共用这段说明。 */
export const CONVERSION_UNIT_IDS = [MONK_ID, MISSIONARY_ID] as const;
export const CONVERSION_ANCHOR = 'conversion';
export const DEVOTION_ID = 46;
export const FAITH_ID = 45;
export const CONVERT_RESIST_MIN_RES = 178;
export const CONVERT_RESIST_MAX_RES = 179;

/** 官方 Update 99311（2023-12-11）记载。增量对照用，不代替站内 effects.json。 */
export const UPDATE_99311 = {
  url: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-99311/',
  date: '2023-12-11',
  build: 99311,
  intervalMin: 5,
  intervalMax: 9,
  chancePercent: 40,
  deltas: {
    [DEVOTION_ID]: { min: 1, max: 1 },
    [FAITH_ID]: { min: 4, max: 4 },
  },
} as const;

export type ResistDelta = { min: number; max: number };
export type ConversionTechSource = { id: number; zh: string; en: string; desc: string };
export type ConversionTech = { id: number; zh: string; en: string; desc: string; delta: ResistDelta };
export type ConversionFacts = { devotion: ConversionTech | null; faith: ConversionTech | null; matchesOfficial: boolean };

export const showsConversion = (unitId: number) => (CONVERSION_UNIT_IDS as readonly number[]).includes(unitId);
export const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${value}`;
export const baselineIntervalText = () => `${UPDATE_99311.intervalMin}–${UPDATE_99311.intervalMax} 秒`;
export const baselineChanceText = () => `${UPDATE_99311.chancePercent}%`;

const sameDelta = (site: ResistDelta, official: ResistDelta) => site.min === official.min && site.max === official.max;

function catalogTech(techs: readonly ConversionTechSource[], id: number) {
  const hits = techs.filter((tech) => tech.id === id);
  const tech = hits[0];
  if (hits.length !== 1 || !tech?.zh || !tech.en || !tech.desc.trim()) return undefined;
  return tech;
}

function datTech(file: DatFile, id: number): DatTech | undefined {
  const hits = Object.values(file.techs).filter((tech) => tech.id === id);
  return hits.length === 1 ? hits[0] : undefined;
}

/** 只接受「恰好两条加法：资源 178 与 179」。其它形状视为尚未核对。 */
export function resistDelta(entry: DatTech | undefined): ResistDelta | null {
  if (!entry || entry.rules.length !== 0 || entry.eco.length !== 2) return null;
  const row = (res: number) => entry.eco.filter((item) => item.res === res && item.op === 'add' && Number.isFinite(item.v));
  const min = row(CONVERT_RESIST_MIN_RES);
  const max = row(CONVERT_RESIST_MAX_RES);
  const minRow = min[0];
  const maxRow = max[0];
  if (min.length !== 1 || max.length !== 1 || !minRow || !maxRow) return null;
  return { min: minRow.v, max: maxRow.v };
}

function pack(file: DatFile, techs: readonly ConversionTechSource[], id: number): ConversionTech | null {
  const meta = catalogTech(techs, id);
  const delta = resistDelta(datTech(file, id));
  if (!meta || !delta) return null;
  return { id, zh: meta.zh, en: meta.en, desc: meta.desc, delta };
}

export function conversionFacts(techs: readonly ConversionTechSource[], file: DatFile = DAT): ConversionFacts {
  const devotion = pack(file, techs, DEVOTION_ID);
  const faith = pack(file, techs, FAITH_ID);
  const official = UPDATE_99311.deltas;
  const matchesOfficial = !!devotion && !!faith && sameDelta(devotion.delta, official[DEVOTION_ID]) && sameDelta(faith.delta, official[FAITH_ID]);
  return { devotion, faith, matchesOfficial };
}
