import rawContent from '../content/scouting.json';
import validateScouting from '../content/schema/compiled/scouting.mjs';
import { readValidatedJson } from '../data/validatedJson';
import { hasExactKeys as exactKeys, isClockText, isRecord as record, textCharacterProblem, textLength } from './validate';

export const SCOUTING_SCENARIOS = ['early', 'walled'] as const;
export const SCOUTING_MAPS = ['arabia', 'arena', 'nomad', 'water', 'other', 'unknown'] as const;
export const SCOUTING_MODES = ['one-v-one', 'team', 'other', 'unknown'] as const;
export const SCOUTING_STAGES = ['dark', 'feudal', 'castle', 'imperial', 'unknown'] as const;
export const SCOUTING_PLANS = ['undecided', 'press', 'hold', 'develop'] as const;
export const SCOUTING_STATES = ['unknown', 'unseen', 'seen', 'absent'] as const;
export const SCOUTING_AREAS = ['unknown', 'enemy-front', 'enemy-edge', 'own-approach'] as const;
export const SCOUTING_OBSERVATIONS = ['military-building', 'field-army', 'army-departure', 'new-town-center', 'forward-production', 'forward-move'] as const;
export type ScoutingScenarioId = (typeof SCOUTING_SCENARIOS)[number];
export type ScoutingObservationId = (typeof SCOUTING_OBSERVATIONS)[number];
export type ScoutingObservationState = (typeof SCOUTING_STATES)[number];
export type ScoutingArea = (typeof SCOUTING_AREAS)[number];
export interface ScoutingObservation {
  state: ScoutingObservationState;
  at: string;
  area: ScoutingArea;
  stale: boolean;
}
export interface ScoutingConfig {
  scenario: ScoutingScenarioId;
  map: (typeof SCOUTING_MAPS)[number];
  mode: (typeof SCOUTING_MODES)[number];
  stage: (typeof SCOUTING_STAGES)[number];
  plan: (typeof SCOUTING_PLANS)[number];
  observations: Record<ScoutingObservationId, ScoutingObservation>;
}
export interface ScoutingSource {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  kind: string;
  note: string;
}
interface EvidenceRule {
  observation: ScoutingObservationId;
  state: 'seen' | 'absent';
}
export interface ScoutingHypothesis {
  id: string;
  title: string;
  body: string;
  support: EvidenceRule[];
  counter: EvidenceRule[];
  evidenceMeaning: string;
  counterMeaning: string;
  next: string;
  sourceIds: string[];
}
export interface ScoutingSignal {
  id: string;
  seen: string;
  meaning: string;
  next: string;
  sourceIds: string[];
  editorial: boolean;
}
export interface ScoutingScenario {
  id: ScoutingScenarioId;
  title: string;
  stage: 'feudal' | 'castle';
  observationIds: ScoutingObservationId[];
  summary: string;
  signals: ScoutingSignal[];
  hypotheses: ScoutingHypothesis[];
}
export interface ScoutingContent {
  checkedAt: string;
  dataVersion: string;
  editorialNotice: string;
  sources: ScoutingSource[];
  observations: { id: ScoutingObservationId; title: string; meaning: string }[];
  scenarios: ScoutingScenario[];
}
export const SCOUTING_CONTENT = readValidatedJson(rawContent, validateScouting, '侦察内容');
export const SCOUTING_STATE_ZH: Record<ScoutingObservationState, string> = {
  unknown: '未知',
  unseen: '没看到',
  seen: '看到',
  absent: '限定时刻与可见范围内确认不存在',
};
export const SCOUTING_AREA_ZH: Record<ScoutingArea, string> = {
  unknown: '范围未确认',
  'enemy-front': '敌方正面当前可见区域',
  'enemy-edge': '敌方侧面或外围当前可见区域',
  'own-approach': '接近自家的一段当前可见通路',
};
export const SCOUTING_URL_LIMIT = 8000;
export const SCOUTING_TIME_LIMIT = 32;
const configKeys = ['scenario', 'map', 'mode', 'stage', 'plan', 'observations'];
const observationKeys = ['state', 'at', 'area', 'stale'];
function member<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}
/** Structural safety only; an editable clock format mistake is checked separately. */
export function isScoutingTimeText(value: unknown): value is string {
  return typeof value === 'string' && textLength(value) <= SCOUTING_TIME_LIMIT && textCharacterProblem(value, { rejectUnpairedSurrogates: true }) === null;
}
export function isScoutingConfig(value: unknown): value is ScoutingConfig {
  if (
    !record(value) ||
    !exactKeys(value, configKeys) ||
    !member(SCOUTING_SCENARIOS, value.scenario) ||
    !member(SCOUTING_MAPS, value.map) ||
    !member(SCOUTING_MODES, value.mode) ||
    !member(SCOUTING_STAGES, value.stage) ||
    !member(SCOUTING_PLANS, value.plan) ||
    !record(value.observations) ||
    !exactKeys(value.observations, SCOUTING_OBSERVATIONS)
  )
    return false;
  const observations = value.observations;
  return SCOUTING_OBSERVATIONS.every((id) => {
    const entry = observations[id];
    return (
      record(entry) &&
      exactKeys(entry, observationKeys) &&
      member(SCOUTING_STATES, entry.state) &&
      isScoutingTimeText(entry.at) &&
      member(SCOUTING_AREAS, entry.area) &&
      typeof entry.stale === 'boolean'
    );
  });
}
export function defaultScoutingConfig(): ScoutingConfig {
  const observations = Object.fromEntries(
    SCOUTING_OBSERVATIONS.map((id) => [id, { state: 'unknown', at: '', area: 'unknown', stale: false }]),
  ) as ScoutingConfig['observations'];
  return { scenario: 'early', map: 'arabia', mode: 'one-v-one', stage: 'feudal', plan: 'undecided', observations };
}
/** issue 312：切换情境时阶段跟随该情境（早期 → 封建时代，城堡阶段 → 城堡时代），其他选项不动。分享链接里显式的 stage 由 decodeScouting 原样保留，不经过这里。 */
export function withScenario(config: ScoutingConfig, scenario: ScoutingScenarioId): ScoutingConfig {
  const stage = SCOUTING_CONTENT.scenarios.find((row) => row.id === scenario)!.stage;
  return { ...config, scenario, stage };
}
/** A teaching example only; clearing or loading a saved empty config keeps it empty. */
export function exampleScoutingConfig(): ScoutingConfig {
  const config = defaultScoutingConfig();
  config.observations['military-building'].state = 'seen';
  config.observations['field-army'].state = 'seen';
  return config;
}
export function scoutingTimeError(value: string): string | null {
  if (value === '') return null;
  return isClockText(value, { minuteDigits: 3, hourDigits: 2 }) ? null : '游戏时间请填分:秒或时:分:秒，秒和小时后的分须在 00–59；也可留空表示未记录。';
}
export function scoutingInputErrors(config: ScoutingConfig): string[] {
  if (!isScoutingConfig(config)) return ['情报结构或字段无效，解释已暂停。'];
  const errors: string[] = [];
  // Hidden observations are preserved too; invalid entries must never disappear from a shared state.
  for (const definition of SCOUTING_CONTENT.observations) {
    const observation = config.observations[definition.id];
    const timeError = scoutingTimeError(observation.at);
    if (timeError) errors.push(`${definition.title}：${timeError}`);
    if (observation.state === 'absent' && (!observation.at || observation.area === 'unknown'))
      errors.push(`${definition.title}：确认不存在必须填写该观察时刻与明确可见范围；不能代表全图或之后一直不存在。`);
  }
  return errors;
}
/** Encoding preserves editable semantic mistakes; sharing is separately disabled until they are fixed. */
export function encodeScouting(config: ScoutingConfig): string {
  if (!isScoutingConfig(config)) throw new TypeError('不能编码无效情报结构。');
  const encoded = new URLSearchParams({ sv: '1', data: JSON.stringify(config) }).toString();
  if (encoded.length > SCOUTING_URL_LIMIT) throw new RangeError('情报链接超出上限，未截断。');
  return encoded;
}
export function decodeScouting(search: string): { config: ScoutingConfig; locked: boolean; errors: string[] } {
  const fallback = () => ({ config: defaultScoutingConfig(), locked: true, errors: ['情报链接无效、损坏或版本不兼容，解释已暂停；默认值不代表恢复结果。'] });
  if (search === '' || search === '?') return { config: exampleScoutingConfig(), locked: false, errors: [] };
  if (search.length > SCOUTING_URL_LIMIT + 1) return fallback();
  const raw = search.startsWith('?') ? search.slice(1) : search;
  try {
    decodeURIComponent(raw.replace(/\+/g, ' '));
    const params = new URLSearchParams(raw);
    if (
      [...params.keys()].some((key) => key !== 'sv' && key !== 'data') ||
      params.getAll('sv').length !== 1 ||
      params.getAll('data').length !== 1 ||
      params.get('sv') !== '1'
    )
      return fallback();
    const config: unknown = JSON.parse(params.get('data')!);
    return isScoutingConfig(config) ? { config, locked: false, errors: [] } : fallback();
  } catch {
    return fallback();
  }
}
export interface ScoutingHypothesisResult {
  hypothesis: ScoutingHypothesis;
  status: 'needs-evidence' | 'local-support' | 'recheck';
  support: ScoutingObservationId[];
  counter: ScoutingObservationId[];
}
export interface ScoutingAnalysis {
  status: 'covered' | 'not-covered' | 'invalid';
  title: string;
  summary: string;
  errors: string[];
  gaps: string[];
  planNote: string;
  hypotheses: ScoutingHypothesisResult[];
}
export const SCOUTING_RESULT_ZH: Record<ScoutingHypothesisResult['status'], string> = {
  'needs-evidence': '待观察',
  'local-support': '有观察支持',
  recheck: '需重新评估',
};
const planNotes: Record<ScoutingConfig['plan'], string> = {
  undecided: '结合下方信号选择下一步。',
  press: '考虑施压：先核对现有军队、接近路线与撤回条件。',
  hold: '考虑防守：优先确认实际兵种和接近资源点的路线。',
  develop: '考虑发展：同时关注侧路视野与已有防守。',
};
function usable(observation: ScoutingObservation) {
  return !observation.stale && (observation.state === 'seen' || (observation.state === 'absent' && observation.at !== '' && observation.area !== 'unknown'));
}
export function analyseScouting(config: ScoutingConfig): ScoutingAnalysis {
  const errors = scoutingInputErrors(config);
  const empty = { errors, gaps: [], planNote: '', hypotheses: [] };
  if (errors.length) return { ...empty, status: 'invalid', title: '先修正观察，解释已暂停', summary: '原输入保留供修正，不把缺少限定的不存在当成事实。' };
  const scenario = SCOUTING_CONTENT.scenarios.find((row) => row.id === config.scenario)!;
  if (config.map !== 'arabia' || config.mode !== 'one-v-one' || config.stage !== scenario.stage)
    return {
      ...empty,
      status: 'not-covered',
      title: '暂未覆盖这组模式、地图或阶段',
      summary: `本组只覆盖常规开局 1v1 Arabia 的${scenario.stage === 'feudal' ? '封建' : '城堡'}阶段；保留所选条件，不套用资料。`,
    };
  const gaps: string[] = [];
  for (const id of scenario.observationIds) {
    const observation = config.observations[id];
    const title = SCOUTING_CONTENT.observations.find((row) => row.id === id)!.title;
    if (observation.stale) gaps.push(`${title}：已标记陈旧，复查。`);
    else if (observation.state === 'unknown') gaps.push(`${title}：未知。`);
    else if (observation.state === 'unseen') gaps.push(`${title}：没看到，复查视野与其他方向。`);
  }
  const matches = (rules: EvidenceRule[]) =>
    rules
      .filter((rule) => {
        const observation = config.observations[rule.observation];
        return scenario.observationIds.includes(rule.observation) && usable(observation) && observation.state === rule.state;
      })
      .map((rule) => rule.observation);
  const hypotheses = scenario.hypotheses.map((hypothesis) => {
    const support = matches(hypothesis.support),
      counter = matches(hypothesis.counter);
    return {
      hypothesis,
      support,
      counter,
      status: counter.length ? ('recheck' as const) : support.length ? ('local-support' as const) : ('needs-evidence' as const),
    };
  });
  return {
    status: 'covered',
    title: '当前判断与下一步',
    summary:
      config.scenario === 'early' && hypotheses[0]!.support.length
        ? '已见实际军队或移动，倾向已有军事投入；优先看进军方向，保护伐木场与金矿。'
        : config.scenario === 'walled' && hypotheses[1]!.support.length
          ? hypotheses[0]!.support.length
            ? '已见经济扩张与侧面部署，倾向同时发展和施压；优先查侧路去向并保护资源点。'
            : '已见侧面设施或移动，可能正从侧路部署；优先查去向与实际出兵。'
          : config.scenario === 'walled' && hypotheses[0]!.support.length
            ? '已见新增城镇中心，倾向扩张经济；结合自己的军队考虑施压或同步发展，并关注侧路。'
            : scenario.summary,
    errors: [],
    gaps,
    planNote: planNotes[config.plan],
    hypotheses,
  };
}
