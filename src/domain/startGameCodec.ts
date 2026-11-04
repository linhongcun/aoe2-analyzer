import { civByEn } from '../data';
import { sceneSupported, validSceneInput, validRouteInput } from './startGameInputs';
import { decisionSteps, type StartState, type StepId } from './startGame';

export const START_GAME_LIMIT = 4096;
export type StartRestore = { kind: 'valid' | 'needs-maps'; state: StartState } | { kind: 'invalid' };
const STEPS: StepId[] = ['mode', 'map', 'lane', 'civ', 'opponent'];
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function keys(value: Record<string, unknown>, allowed: readonly string[], required = allowed) {
  return Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => own(value, key));
}
function flags(value: unknown, allowed: readonly string[]): value is Record<string, boolean> {
  return object(value) && keys(value, allowed, []) && Object.values(value).every((flag) => typeof flag === 'boolean');
}
const nullable = (value: unknown, allowed: readonly string[]) => value === null || (typeof value === 'string' && allowed.includes(value));

export function encodeStartGame(state: StartState): string {
  return JSON.stringify({ version: 1, state });
}

/** 白名单重建；地图目录只由调用者异步提供。 */
export function decodeStartGame(raw: string, mapIds?: ReadonlySet<string>): StartRestore {
  if (new TextEncoder().encode(raw).length > START_GAME_LIMIT) return { kind: 'invalid' };
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  if (!object(input) || !keys(input, ['version', 'state']) || input.version !== 1 || !object(input.state)) return { kind: 'invalid' };
  const s = input.state;
  if (
    !keys(
      s,
      ['choice', 'skipped', 'prefilled', 'teamArmed', 'lobby', 'laneOpen', 'current', 'sceneConfig', 'routeConfig'],
      ['choice', 'skipped', 'prefilled', 'teamArmed', 'lobby', 'laneOpen', 'current'],
    ) ||
    !object(s.choice)
  )
    return { kind: 'invalid' };
  const c = s.choice;
  if (
    !keys(c, ['mode', 'teamSize', 'mapId', 'lane', 'civ']) ||
    !nullable(c.mode, ['1v1', 'team']) ||
    !nullable(c.teamSize, ['2v2', '3v3', '4v4']) ||
    !nullable(c.lane, ['pocket', 'flank']) ||
    !(c.mapId === null || (typeof c.mapId === 'string' && c.mapId.length > 0)) ||
    !(c.civ === null || (typeof c.civ === 'string' && civByEn(c.civ) != null)) ||
    !flags(s.skipped, STEPS) ||
    !flags(s.prefilled, ['mode', 'map']) ||
    ![s.teamArmed, s.lobby, s.laneOpen].every((flag) => typeof flag === 'boolean') ||
    !nullable(s.current, STEPS)
  )
    return { kind: 'invalid' };
  if (
    (c.mode === 'team' && (c.teamSize === null || s.teamArmed !== true)) ||
    (c.teamSize !== null && c.mode !== 'team') ||
    (c.lane !== null && c.mode !== 'team') ||
    (c.mode !== 'team' && (c.teamSize !== null || c.lane !== null)) ||
    (c.mode === '1v1' && s.teamArmed !== false)
  )
    return { kind: 'invalid' };
  const choices = { mode: c.mode, map: c.mapId, lane: c.lane, civ: c.civ };
  for (const [step, choice] of Object.entries(choices)) {
    if (choice !== null && s.skipped[step] === true) return { kind: 'invalid' };
  }
  for (const step of ['mode', 'map'] as const) {
    if (s.prefilled[step] === true && (choices[step] === null || s.skipped[step] === true)) return { kind: 'invalid' };
  }
  const sceneConfig = own(s, 'sceneConfig') ? s.sceneConfig : null;
  const routeConfig = own(s, 'routeConfig') ? s.routeConfig : null;
  const supported = sceneSupported(c as unknown as StartState['choice']);
  if (
    (sceneConfig !== null && (!supported || !validSceneInput(sceneConfig, c.lane as 'flank' | 'pocket'))) ||
    (routeConfig !== null && (!supported || !validRouteInput(routeConfig, c.lane as 'flank' | 'pocket')))
  )
    return { kind: 'invalid' };
  const state: StartState = {
    choice: { mode: c.mode, teamSize: c.teamSize, mapId: c.mapId, lane: c.lane, civ: c.civ } as StartState['choice'],
    sceneConfig: sceneConfig as StartState['sceneConfig'],
    routeConfig: routeConfig as StartState['routeConfig'],
    skipped: { ...s.skipped },
    prefilled: { ...s.prefilled },
    teamArmed: s.teamArmed as boolean,
    lobby: s.lobby as boolean,
    laneOpen: s.laneOpen as boolean,
    current: s.current as StartState['current'],
  };
  const steps = decisionSteps(state);
  if (state.current !== null && !steps.includes(state.current)) return { kind: 'invalid' };
  const prior = state.current === null ? steps : steps.slice(0, steps.indexOf(state.current));
  if (prior.some((step) => step !== 'opponent' && choices[step] === null && state.skipped[step] !== true)) return { kind: 'invalid' };
  if (state.choice.mapId !== null) {
    if (!mapIds) return { kind: 'needs-maps', state };
    if (!mapIds.has(state.choice.mapId)) return { kind: 'invalid' };
  }
  return { kind: 'valid', state };
}

export const START_SEARCH_LIMIT = START_GAME_LIMIT * 3 + 64;
export function encodeStartSearch(state: StartState): string {
  return `?${new URLSearchParams({ sgv: '1', sg: JSON.stringify(state) })}`;
}
export function decodeStartSearch(search: string, mapIds?: ReadonlySet<string>): StartRestore | { kind: 'absent' } {
  if (search === '') return { kind: 'absent' };
  if (!search.startsWith('?') || new TextEncoder().encode(search).length > START_SEARCH_LIMIT) return { kind: 'invalid' };
  try {
    // URLSearchParams本身容忍坏percent/UTF-8；这里只验证，不把解码结果再次解析。
    decodeURIComponent(search.slice(1).replace(/\+/g, ' '));
    const params = new URLSearchParams(search);
    if ([...params].length !== 2 || params.getAll('sgv').length !== 1 || params.getAll('sg').length !== 1 || params.get('sgv') !== '1')
      return { kind: 'invalid' };
    const raw = params.get('sg');
    if (!raw || new TextEncoder().encode(`{"version":1,"state":${raw}}`).length > START_GAME_LIMIT) return { kind: 'invalid' };
    const state: unknown = JSON.parse(raw);
    return decodeStartGame(JSON.stringify({ version: 1, state }), mapIds);
  } catch {
    return { kind: 'invalid' };
  }
}
