/** Issue 242: conditional reading aids, never a battlefield or civilization simulator. */
import content from '../content/castle-defense.json';

export const CASTLE_OBSERVATIONS = ['stone', 'construction', 'completed'] as const;
export type CastleObservation = (typeof CASTLE_OBSERVATIONS)[number];
export const CASTLE_OBSERVATION_ZH: Record<CastleObservation, string> = {
  stone: '只看到提前采石',
  construction: '前压村民或堡基出现',
  completed: '城堡已经完工',
};
export const CASTLE_ESCORTS = ['unknown', 'present', 'absent'] as const;
export type CastleEscort = (typeof CASTLE_ESCORTS)[number];
export const CASTLE_ESCORT_ZH: Record<CastleEscort, string> = { unknown: '未知，尚未确认', present: '已看到护军', absent: '已确认当前未见护军' };
export const CASTLE_PATHS = ['unknown', 'safe', 'unsafe'] as const;
export type CastlePath = (typeof CASTLE_PATHS)[number];
export const CASTLE_PATH_ZH: Record<CastlePath, string> = { unknown: '未知，尚未查证', safe: '已确认有安全通路', unsafe: '无法安全到场或撤回' };
export const CASTLE_RESOURCES = ['unknown', 'movable', 'blocked'] as const;
export type CastleResource = (typeof CASTLE_RESOURCES)[number];
export const CASTLE_RESOURCE_ZH: Record<CastleResource, string> = { unknown: '未知，先查替代资源', movable: '有可迁移的资源点', blocked: '关键资源已被封锁' };
export type CastleStage = 'stone' | 'construction' | 'relocate' | 'blocked' | 'resources-unknown';
export interface CastleDefenseConfig {
  observation: CastleObservation;
  age: number;
  escort: CastleEscort;
  path: CastlePath;
  resources: CastleResource;
}
export interface CastleDefenseAction {
  id: string;
  title: string;
  body: string;
  cost: string;
  counterexample: string;
  next: string;
  sources: string[];
}
export interface CastleDefensePlan {
  stage: CastleStage;
  title: string;
  summary: string;
  checks: string[];
  notices: string[];
  actions: CastleDefenseAction[];
  preparations: CastleDefenseAction[];
}
export const CASTLE_DEFENSE_SOURCES = content.sources;
export const CASTLE_DEFENSE_REVIEWED_AT = content.reviewedAt;
export const CASTLE_AGE_ZH: Record<number, string> = { 1: '黑暗时代', 2: '封建时代', 3: '城堡时代', 4: '帝王时代' };
export function defaultCastleDefense(): CastleDefenseConfig {
  return { observation: 'stone', age: 2, escort: 'unknown', path: 'unknown', resources: 'unknown' };
}
const includes = (values: readonly string[], value: unknown) => typeof value === 'string' && values.includes(value);
export function castleDefenseErrors(config: CastleDefenseConfig): string[] {
  const errors: string[] = [];
  if (!includes(CASTLE_OBSERVATIONS, config.observation)) errors.push('观察状态不在本页收录范围。');
  if (!Number.isInteger(config.age) || config.age < 1 || config.age > 4) errors.push('当前时代必须是黑暗至帝王时代。');
  if (!includes(CASTLE_ESCORTS, config.escort)) errors.push('护军状态无效。');
  if (!includes(CASTLE_PATHS, config.path)) errors.push('安全通路状态无效。');
  if (!includes(CASTLE_RESOURCES, config.resources)) errors.push('资源状态无效。');
  return errors;
}
const keys = ['dv', 'observation', 'age', 'escort', 'path', 'resources'];
export function encodeCastleDefense(config: CastleDefenseConfig): string {
  if (castleDefenseErrors(config).length) throw new TypeError('不能分享无效的城堡前置观察。');
  return new URLSearchParams({
    dv: '1',
    observation: config.observation,
    age: String(config.age),
    escort: config.escort,
    path: config.path,
    resources: config.resources,
  }).toString();
}
export function decodeCastleDefense(search: string): { config: CastleDefenseConfig; errors: string[] } {
  const fallback = () => ({ config: defaultCastleDefense(), errors: ['观察链接参数损坏或不完整，请显式重置后重新选择。'] });
  if (!search || search === '?') return { config: defaultCastleDefense(), errors: [] };
  if (search.length > 1200) return fallback();
  const raw = search.startsWith('?') ? search.slice(1) : search;
  try {
    // URLSearchParams replaces malformed UTF-8; reject it before that lossy step.
    decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return fallback();
  }
  const params = new URLSearchParams(raw);
  if ([...params.keys()].some((key) => !keys.includes(key)) || keys.some((key) => params.getAll(key).length !== 1)) return fallback();
  if (params.get('dv') !== '1' || !/^[1-4]$/.test(params.get('age') ?? '')) return fallback();
  const config = {
    observation: params.get('observation') as CastleObservation,
    age: Number(params.get('age')),
    escort: params.get('escort') as CastleEscort,
    path: params.get('path') as CastlePath,
    resources: params.get('resources') as CastleResource,
  };
  return castleDefenseErrors(config).length ? fallback() : { config, errors: [] };
}
function action(id: keyof typeof content.actions): CastleDefenseAction {
  const item = content.actions[id];
  return { id, ...item, sources: [...item.sources] };
}
export function planCastleDefense(config: CastleDefenseConfig): CastleDefensePlan | null {
  if (castleDefenseErrors(config).length) return null;
  const stage: CastleStage =
    config.observation !== 'completed'
      ? config.observation
      : config.resources === 'movable'
        ? 'relocate'
        : config.resources === 'blocked'
          ? 'blocked'
          : 'resources-unknown';
  const row = content.stages[stage];
  const actions = row.actions.map((id) => action(id as keyof typeof content.actions));
  const preparations: CastleDefenseAction[] = [],
    notices: string[] = [];
  if (config.observation === 'construction') {
    if (config.escort === 'absent' && config.path === 'safe') actions.unshift(action('intercept'));
    else {
      notices.push(
        config.escort === 'unknown'
          ? '护军尚未确认：先补侦察，不把未知当作没有护军。'
          : config.escort === 'present'
            ? '已看到护军：先核对现有兵力能否应付，不把拉村民当作立即行动。'
            : '未见护军也不代表可以安全抵达。',
      );
      if (config.path !== 'safe')
        notices.push(config.path === 'unknown' ? '安全通路未知：先确认到场和撤回路线，不建议村民强冲。' : '无法安全到场或撤回：先保护经济，不建议村民强冲。');
    }
  }
  if (config.observation === 'completed') {
    if (config.path !== 'safe')
      notices.push(
        config.path === 'unknown' ? '即使有替代资源，安全通路仍未确认；先查路线，再安排迁移。' : '通路不安全：不直接向替代点派村民，先保住剩余空间。',
      );
    if (stage === 'blocked') {
      if (config.age >= 3) actions.push(action('castle'), action('siege'));
      else preparations.push(action('future-castle'));
      if (config.age === 4) actions.push(action('trebuchet'));
      else preparations.push(action('future-trebuchet'));
    }
  }
  return { stage, title: row.title, summary: row.summary, checks: [...row.checks], notices, actions, preparations };
}
