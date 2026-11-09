/**
 * issue 747 Standard 奇观 / 圣物倒计时。
 * 倒计时延长的年数和资源削减百分比，只在科技 21 的中英说明对得上时读出。
 * 资源 196 / 198 只报告效果导出里的原规则；没有规则就待确认，不把 UGC 页面上的附加时间写进来。
 * 按地图尺寸的基础秒数没有站内 DE 导出，baseSeconds 保持 null。
 */
import civsRaw from '../data/raw/civs';
import techsRaw from '../data/raw/techs';
import { DAT } from './datEffects';

export const ATHEISM_ID = 21;
export const FLAG_RES = 33;
export const WONDER_TIME_RES = 196;
export const RELIC_TIME_RES = 198;
export const WONDER_TIME_NAME = 'Wonder Time Modifier';
export const RELIC_TIME_NAME = 'Relic Time Modifier';
const YEAR_ZH = /世界奇观和圣物胜利的倒计时 \+(\d+) 年/;
const YEAR_EN = /Wonder and Relic victory takes \+(\d+) years/;
const CUT_ZH = /敌方圣物产生的资源 -(\d+)%/;
const CUT_EN = /Enemy Relics generate -(\d+)% resources/;
const OPS = new Set(['set', 'add', 'mul']);

export interface CatalogTech {
  id: number;
  en: string;
  zh: string;
  desc: string;
  descEn: string;
  civs?: string[];
}

export interface CatalogCiv {
  en?: string;
  zh?: string;
}

export interface EcoRule {
  res?: number;
  op?: string;
  v?: number;
}

export interface StandardEffects {
  meta?: { sources?: { id?: string; patch?: string }[] };
  techs?: Record<string, { id?: number; eco?: EcoRule[] } | undefined>;
}

export interface ResourceRule {
  state: 'absent' | 'pending' | 'value';
  op: string | null;
  value: number | null;
}

export interface StandardVictoryFacts {
  techId: number | null;
  techZh: string | null;
  civZh: string | null;
  years: number | null;
  relicCutPercent: number | null;
  flag: ResourceRule;
  wonder: ResourceRule;
  relic: ResourceRule;
  /** 没有地图尺寸秒数导出。这个字段保持 null，界面不得改成秒数。 */
  baseSeconds: null;
  patchBuild: string | null;
  patchDate: string | null;
}

const pending = (): ResourceRule => ({ state: 'pending', op: null, value: null });
const absent = (): ResourceRule => ({ state: 'absent', op: null, value: null });

export function agreedCount(zh: string | undefined, en: string | undefined, zhPattern: RegExp, enPattern: RegExp): number | null {
  const z = zhPattern.exec(zh ?? '');
  const e = enPattern.exec(en ?? '');
  if (!z?.[1] || !e?.[1] || z[1] !== e[1]) return null;
  const value = Number(z[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function resourceRule(root: unknown, res: number): ResourceRule {
  const hits: { op: string; value: number }[] = [];
  let broken = false;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.res === res && ('op' in record || 'v' in record)) {
      const op = record.op;
      const value = record.v;
      if (typeof op !== 'string' || !OPS.has(op) || typeof value !== 'number' || !Number.isFinite(value)) broken = true;
      else hits.push({ op, value });
    }
    for (const value of Object.values(record)) visit(value);
  };
  visit(root);
  if (broken) return pending();
  const first = hits[0];
  if (!first) return absent();
  if (hits.some((hit) => hit.op !== first.op || hit.value !== first.value)) return pending();
  return { state: 'value', op: first.op, value: first.value };
}

function flagRule(effects: StandardEffects): ResourceRule {
  const techs = effects.techs ?? {};
  const named = techs.Atheism;
  const tech = named?.id === ATHEISM_ID ? named : Object.values(techs).find((item) => item?.id === ATHEISM_ID);
  if (!tech) return absent();
  const rules = (tech.eco ?? []).filter((rule) => rule.res === FLAG_RES);
  const rule = rules[0];
  if (!rule || rules.length !== 1) return rules.length ? pending() : absent();
  if (rule.op !== 'set' || typeof rule.v !== 'number' || !Number.isFinite(rule.v)) return pending();
  return { state: 'value', op: 'set', value: rule.v };
}

export function standardVictoryFacts(
  techs: readonly CatalogTech[] = techsRaw as CatalogTech[],
  effects: StandardEffects = DAT,
  civs: readonly CatalogCiv[] = civsRaw as CatalogCiv[],
): StandardVictoryFacts {
  const tech = techs.find((item) => item.id === ATHEISM_ID && item.en === 'Atheism');
  const patch = effects.meta?.sources?.find((source) => source.id === 'DAT')?.patch ?? effects.meta?.sources?.[0]?.patch ?? '';
  const civEn = tech?.civs?.[0];
  return {
    techId: tech ? tech.id : null,
    techZh: tech?.zh ?? null,
    civZh: civs.find((civ) => civ.en === civEn)?.zh ?? null,
    years: tech ? agreedCount(tech.desc, tech.descEn, YEAR_ZH, YEAR_EN) : null,
    relicCutPercent: tech ? agreedCount(tech.desc, tech.descEn, CUT_ZH, CUT_EN) : null,
    flag: flagRule(effects),
    wonder: resourceRule(effects, WONDER_TIME_RES),
    relic: resourceRule(effects, RELIC_TIME_RES),
    baseSeconds: null,
    patchBuild: /DE Update (\d+)/.exec(patch)?.[1] ?? null,
    patchDate: /\((\d{4}-\d{2}-\d{2})\)/.exec(patch)?.[1] ?? null,
  };
}
