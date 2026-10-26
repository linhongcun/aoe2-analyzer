/** Issue 228: a source viewer only. These selections never enter a simulator. */
import raw from '../data/team_bonuses.json';
import validateTeamBonuses from '../content/schema/compiled/team-bonuses.mjs';
import { readValidatedJson } from '../data/validatedJson';
import civsRaw from '../data/raw/civs';
import unitsRaw from '../data/raw/units';
import type { Cost } from './types';

export type TeamEffectKind = 'attributes' | 'production' | 'unlock' | 'economy' | 'research' | 'other';
export interface TeamRawCommand {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
  index: number;
  effectId: number;
}
export type TeamEffectType =
  'attack' | 'attack-speed' | 'health' | 'armor' | 'range' | 'vision' | 'production' | 'cost' | 'attributes' | 'resource' | 'unlock' | 'research' | 'other';
export const TEAM_EFFECT_ZH: Record<TeamEffectType, string> = {
  attack: '攻击',
  'attack-speed': '攻击间隔',
  health: '生命值',
  armor: '护甲',
  range: '射程',
  vision: '视野',
  production: '生产与施工',
  cost: '费用',
  attributes: '其他属性',
  resource: '资源与经济机制',
  unlock: '解锁与升级',
  research: '科技触发',
  other: '未归类机制',
};
export interface TeamTargetSource {
  effectId: number;
  targetUnits: number[];
  targetBuildings: number[];
  productionUnits: number[];
  kinds: TeamEffectKind[];
  effectTypes: TeamEffectType[];
  targetCoverage: 'complete' | 'partial' | 'unknown';
  notes: string[];
}
export interface PermanentTeamSource extends TeamTargetSource {
  id: string;
  civ: string;
  commands: TeamRawCommand[];
}
export interface TeamTechnologySource extends TeamTargetSource {
  id: number;
  civs: string[];
  teamCommands: TeamRawCommand[];
  age: number;
  building: number;
  prerequisites: number[];
  requiredCount: number;
  cost: Cost;
  researchTime: number;
}
export interface TeamBonusData {
  meta: { patch: number; engineVerifiedInPinnedBuild: false; scopeNotes: string[] };
  permanent: PermanentTeamSource[];
  technologies: TeamTechnologySource[];
}
export const TEAM_BONUS_DATA = readValidatedJson(raw, validateTeamBonuses, '团队来源');
export const TEAM_TARGETS = ['all', 'units', 'buildings', 'attack', 'economy', 'production', 'unlock', 'research'] as const;
export type TeamTarget = (typeof TEAM_TARGETS)[number];
export const TEAM_TARGET_ZH: Record<TeamTarget, string> = {
  all: '全部来源',
  units: '单位关联',
  buildings: '建筑关联',
  attack: '攻击与攻击间隔',
  economy: '经济与资源',
  production: '生产、施工与工作速率',
  unlock: '单位解锁与触发',
  research: '研究关联',
};
export interface TeamBonusConfig {
  players: string[];
  age: number;
  target: TeamTarget;
  unit: number | null;
  /** At least one source player has researched this technology. Viewer state only. */
  researched: number[];
}
export interface TeamProvider {
  player: number;
  civ: string;
}
export interface TeamPermanentRow {
  source: PermanentTeamSource;
  providers: TeamProvider[];
}
export interface TeamTechnologyRow {
  source: TeamTechnologySource;
  providers: TeamProvider[];
}
export type TeamResearchStatus = 'unavailable' | 'unresearched' | 'researched';
const knownCivs = new Set(civsRaw.map((civ) => civ.en));
const knownUnits = new Set(unitsRaw.map((unit) => unit.id));
const integer = /^(0|[1-9]\d*)$/;
const keys = ['tv', 'players', 'age', 'target', 'unit', 'researched'];

export function defaultTeamBonusConfig(): TeamBonusConfig {
  return { players: ['Franks'], age: 4, target: 'all', unit: null, researched: [] };
}
export function teamBonusSources(config: Pick<TeamBonusConfig, 'players'>): { permanent: TeamPermanentRow[]; technologies: TeamTechnologyRow[] } {
  const providers = (civs: readonly string[]) => config.players.flatMap((civ, index) => (civs.includes(civ) ? [{ player: index + 1, civ }] : []));
  return {
    permanent: TEAM_BONUS_DATA.permanent.flatMap((source) => {
      const people = providers([source.civ]);
      return people.length ? [{ source, providers: people }] : [];
    }),
    technologies: TEAM_BONUS_DATA.technologies.flatMap((source) => {
      const people = providers(source.civs);
      return people.length ? [{ source, providers: people }] : [];
    }),
  };
}
export function teamTechnologyStatus(source: TeamTechnologySource, config: Pick<TeamBonusConfig, 'age' | 'researched'>): TeamResearchStatus {
  if (config.age < source.age) return 'unavailable';
  return config.researched.includes(source.id) ? 'researched' : 'unresearched';
}
export function teamBonusErrors(config: TeamBonusConfig): string[] {
  const errors: string[] = [];
  if (!Array.isArray(config.players)) return ['玩家列表无效。'];
  if (config.players.length < 1 || config.players.length > 4) errors.push('玩家人数必须为 1–4 人。');
  if (config.players.some((civ) => !knownCivs.has(civ))) errors.push('存在未知文明。');
  if (!Number.isInteger(config.age) || config.age < 1 || config.age > 4) errors.push('时代必须为 1–4。');
  if (!TEAM_TARGETS.includes(config.target)) errors.push('目标类别无效。');
  if (config.unit !== null && (!Number.isInteger(config.unit) || !knownUnits.has(config.unit))) errors.push('单位无效。');
  if (config.unit !== null && config.target !== 'units') errors.push('具体单位筛选必须使用单位关联类别。');
  if (new Set(config.researched).size !== config.researched.length) errors.push('研究状态存在重复科技。');
  const available = teamBonusSources(config).technologies.map((row) => row.source);
  if (config.researched.some((id) => !Number.isInteger(id) || !available.some((source) => source.id === id)))
    errors.push('研究状态包含当前阵容没有的团队科技。');
  if (config.researched.some((id) => available.some((source) => source.id === id && config.age < source.age)))
    errors.push('研究状态包含当前时代尚不可研究的科技。');
  return errors;
}
export function encodeTeamBonuses(config: TeamBonusConfig): string {
  return new URLSearchParams({
    tv: '1',
    players: config.players.join(','),
    age: String(config.age),
    target: config.target,
    unit: config.unit === null ? '' : String(config.unit),
    researched: [...config.researched].sort((a, b) => a - b).join(','),
  }).toString();
}
export function decodeTeamBonuses(search: string): { config: TeamBonusConfig; errors: string[]; locked: boolean } {
  const fallback = defaultTeamBonusConfig();
  if (!search || search === '?') return { config: fallback, errors: [], locked: false };
  const fail = (errors: string[]) => ({ config: fallback, errors, locked: true });
  if (search.length > 4096) return fail(['分享链接过长，请重置阵容。']);
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    return fail(['分享链接编码损坏，请重置阵容。']);
  }
  const params = new URLSearchParams(search);
  const errors: string[] = [];
  for (const key of params.keys()) {
    if (!keys.includes(key)) errors.push(`未知参数：${key}。`);
  }
  for (const key of keys) {
    if (params.getAll(key).length !== 1) errors.push(`参数 ${key} 缺失或重复。`);
  }
  if (errors.length) return fail([...new Set(errors)]);
  if (params.get('tv') !== '1') errors.push('分享链接版本无效。');
  const age = params.get('age')!;
  const unit = params.get('unit')!;
  const research = params.get('researched')!;
  if (!integer.test(age) || (unit !== '' && !integer.test(unit))) errors.push('时代或单位参数不是有效整数。');
  if (research !== '' && !research.split(',').every((id) => integer.test(id))) errors.push('研究参数不是有效整数列表。');
  if (errors.length) return fail(errors);
  const config: TeamBonusConfig = {
    players: params.get('players')!.split(','),
    age: Number(age),
    target: params.get('target') as TeamTarget,
    unit: unit === '' ? null : Number(unit),
    researched: research === '' ? [] : research.split(',').map(Number),
  };
  errors.push(...teamBonusErrors(config));
  return errors.length ? fail(errors) : { config, errors: [], locked: false };
}
/** Drop only viewer research flags made unavailable by an explicit configuration edit. */
export function updateTeamRoster(config: TeamBonusConfig, players: string[], age = config.age): TeamBonusConfig {
  const sources = teamBonusSources({ players }).technologies.map((row) => row.source);
  return { ...config, players, age, researched: config.researched.filter((id) => sources.some((source) => source.id === id && source.age <= age)) };
}
export function setTeamResearched(config: TeamBonusConfig, id: number, selected: boolean): TeamBonusConfig {
  const source = teamBonusSources(config).technologies.find((row) => row.source.id === id)?.source;
  if (!source || source.age > config.age) return config;
  return {
    ...config,
    researched: selected ? [...new Set([...config.researched, id])].sort((a, b) => a - b) : config.researched.filter((value) => value !== id),
  };
}
export type TeamTargetMatch = 'match' | 'unknown' | 'none';
/** Partial/unknown relations remain visible separately; an absent audited link is not proof of no effect. */
export function teamTargetMatch(source: TeamTargetSource, config: Pick<TeamBonusConfig, 'target' | 'unit'>): TeamTargetMatch {
  if (config.target === 'all') return 'match';
  const units = [...source.targetUnits, ...source.productionUnits];
  let match: boolean;
  if (config.target === 'units') match = config.unit === null ? units.length > 0 : units.includes(config.unit);
  else if (config.target === 'buildings') match = source.targetBuildings.length > 0;
  else if (config.target === 'attack') match = source.effectTypes.some((type) => type === 'attack' || type === 'attack-speed');
  else match = source.kinds.includes(config.target as TeamEffectKind);
  return match ? 'match' : source.targetCoverage === 'complete' ? 'none' : 'unknown';
}
