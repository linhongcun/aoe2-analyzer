/**
 * 首页「开一局」的步骤状态（issue 592）。
 * 模式始终在地图前。路位只在组队、并且这一格还在流程里时出现，步数不固定。
 * 跳过不写入默认选择。改更早的答案会清掉它后面的选择。
 */
import { mapPosTips, type MapPosTip } from './mapPositions';

export type StepId = 'mode' | 'map' | 'lane' | 'civ' | 'opponent';
export type GameMode = '1v1' | 'team';
export type TeamSize = '2v2' | '3v3' | '4v4';
export type Lane = 'pocket' | 'flank';

export interface StartChoice {
  mode: GameMode | null;
  teamSize: TeamSize | null;
  mapId: string | null;
  lane: Lane | null;
  civ: string | null;
}

export interface StartState {
  choice: StartChoice;
  skipped: Partial<Record<StepId, boolean>>;
  /** 路径 B 在入口里填上的模式 / 地图，不是从游戏大厅读的。 */
  prefilled: Partial<Record<'mode' | 'map', boolean>>;
  teamArmed: boolean;
  /** 从「已在大厅」进来。路位先不占格，直到玩家按「补路位」。 */
  lobby: boolean;
  laneOpen: boolean;
  /** null 表示本局摘要，摘要本身不占一格。 */
  current: StepId | null;
}

/** 线框里的路径 B 示例：组队 4v4、阿拉伯半岛。入口填好的，不是大厅同步。 */
export const LOBBY_EXAMPLE = { mode: 'team' as const, teamSize: '4v4' as const, mapId: 'arabia' };

const LATER: Record<StepId, readonly StepId[]> = {
  mode: ['map', 'lane', 'civ', 'opponent'],
  map: ['lane', 'civ', 'opponent'],
  lane: ['civ', 'opponent'],
  civ: ['opponent'],
  opponent: [],
};

export function resetStart(): StartState {
  return {
    choice: { mode: null, teamSize: null, mapId: null, lane: null, civ: null },
    skipped: {},
    prefilled: {},
    teamArmed: false,
    lobby: false,
    laneOpen: false,
    current: 'mode',
  };
}

export function decisionSteps(state: StartState): StepId[] {
  const steps: StepId[] = ['mode', 'map'];
  const teamReady = state.choice.mode === 'team' && state.choice.teamSize != null;
  if (teamReady && (!state.lobby || state.laneOpen)) steps.push('lane');
  steps.push('civ', 'opponent');
  return steps;
}

export function stepPhase(state: StartState, step: StepId): 'done' | 'current' | 'future' {
  const list = decisionSteps(state);
  const index = list.indexOf(step);
  if (index < 0) return 'future';
  if (state.current == null) return 'done';
  const currentIndex = list.indexOf(state.current);
  if (currentIndex < 0 || index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'future';
}

/** 摘要里的路位行：1v1 不渲染。组队且这一格出现过，或已经从某一侧记下路位，才渲染。 */
export function laneRowVisible(state: StartState): boolean {
  if (state.choice.mode !== 'team' || state.choice.teamSize == null) return false;
  if (decisionSteps(state).includes('lane')) return true;
  return state.choice.lane != null;
}

export type CivPanel = { kind: 'empty' } | { kind: 'side'; side: Lane; tips: MapPosTip[] } | { kind: 'split'; groups: { side: Lane; tips: MapPosTip[] }[] };

/** 1v1 和跳过模式都不借用路位稿。未选路位的组队（路径 B）按侧分开，不合成一张榜。 */
export function civPanels(state: StartState): CivPanel {
  if (state.choice.mode !== 'team') return { kind: 'empty' };
  if (state.choice.lane) {
    const tips = state.choice.mapId ? mapPosTips(state.choice.mapId, state.choice.lane) : [];
    return tips.length ? { kind: 'side', side: state.choice.lane, tips } : { kind: 'empty' };
  }
  if (!decisionSteps(state).includes('lane')) {
    return {
      kind: 'split',
      groups: (['pocket', 'flank'] as const).map((side) => ({
        side,
        tips: state.choice.mapId ? mapPosTips(state.choice.mapId, side) : [],
      })),
    };
  }
  return { kind: 'empty' };
}

export function editorialReason(state: StartState): string | null {
  const { mapId, civ, lane } = state.choice;
  if (!mapId || !civ) return null;
  const sides: Lane[] = lane ? [lane] : ['pocket', 'flank'];
  for (const side of sides) {
    const tip = mapPosTips(mapId, side).find((item) => item.civ === civ);
    if (tip) return tip.reason;
  }
  return null;
}

function clearDownstream(state: StartState, step: StepId): StartState {
  const choice = { ...state.choice };
  const skipped = { ...state.skipped };
  const prefilled = { ...state.prefilled };
  for (const id of LATER[step]) {
    skipped[id] = false;
    if (id === 'map') {
      choice.mapId = null;
      prefilled.map = false;
    } else if (id === 'lane') choice.lane = null;
    else if (id === 'civ') choice.civ = null;
  }
  return { ...state, choice, skipped, prefilled };
}

function advanceFrom(state: StartState, step: StepId): StartState {
  const list = decisionSteps(state);
  const index = list.indexOf(step);
  const next = index < 0 ? state.current : (list[index + 1] ?? null);
  return { ...state, current: next };
}

export function armTeam(state: StartState): StartState {
  if (state.choice.mode !== '1v1') return { ...state, teamArmed: true };
  const cleared = clearDownstream(
    {
      ...state,
      teamArmed: true,
      choice: { ...state.choice, mode: null, teamSize: null },
      skipped: { ...state.skipped, mode: false },
      prefilled: { ...state.prefilled, mode: false },
    },
    'mode',
  );
  return { ...cleared, current: 'mode' };
}

export function choose1v1(state: StartState): StartState {
  const changed = state.choice.mode !== '1v1' || state.choice.teamSize != null || state.choice.lane != null;
  let next: StartState = {
    ...state,
    teamArmed: false,
    choice: { ...state.choice, mode: '1v1', teamSize: null },
    skipped: { ...state.skipped, mode: false },
    prefilled: { ...state.prefilled, mode: false },
  };
  if (changed) next = clearDownstream(next, 'mode');
  next = { ...next, choice: { ...next.choice, lane: null } };
  return advanceFrom(next, 'mode');
}

export function chooseTeamSize(state: StartState, teamSize: TeamSize): StartState {
  const changed = state.choice.mode !== 'team' || state.choice.teamSize !== teamSize;
  let next: StartState = {
    ...state,
    teamArmed: true,
    choice: { ...state.choice, mode: 'team', teamSize },
    skipped: { ...state.skipped, mode: false },
    prefilled: { ...state.prefilled, mode: false },
  };
  if (changed) next = clearDownstream(next, 'mode');
  return advanceFrom(next, 'mode');
}

export function chooseMap(state: StartState, mapId: string): StartState {
  const changed = state.choice.mapId !== mapId;
  let next: StartState = {
    ...state,
    choice: { ...state.choice, mapId },
    skipped: { ...state.skipped, map: false },
    prefilled: { ...state.prefilled, map: false },
  };
  if (changed) next = clearDownstream(next, 'map');
  return advanceFrom(next, 'map');
}

export function chooseLane(state: StartState, lane: Lane): StartState {
  const changed = state.choice.lane !== lane;
  let next: StartState = {
    ...state,
    choice: { ...state.choice, lane },
    skipped: { ...state.skipped, lane: false },
  };
  if (changed) next = clearDownstream(next, 'lane');
  return advanceFrom(next, 'lane');
}

export function pickCiv(state: StartState, civ: string, lane?: Lane): StartState {
  const laneChanged = lane != null && state.choice.lane !== lane;
  const civChanged = state.choice.civ !== civ;
  let next: StartState = {
    ...state,
    choice: { ...state.choice, civ, lane: lane ?? state.choice.lane },
    skipped: { ...state.skipped, civ: false, ...(lane != null ? { lane: false } : {}) },
  };
  if (laneChanged || civChanged) next = clearDownstream(next, 'civ');
  return advanceFrom(next, 'civ');
}

export function skipStep(state: StartState): StartState {
  const step = state.current;
  if (step == null) return state;
  let next = clearDownstream(state, step);
  const choice = { ...next.choice };
  const prefilled = { ...next.prefilled };
  if (step === 'mode') {
    choice.mode = null;
    choice.teamSize = null;
    choice.lane = null;
    prefilled.mode = false;
    next = { ...next, teamArmed: false };
  } else if (step === 'map') {
    choice.mapId = null;
    prefilled.map = false;
  } else if (step === 'lane') choice.lane = null;
  else if (step === 'civ') choice.civ = null;
  next = { ...next, choice, prefilled, skipped: { ...next.skipped, [step]: true } };
  return advanceFrom(next, step);
}

export function backStep(state: StartState): StartState {
  const step = state.current;
  if (step == null) return state;
  const list = decisionSteps(state);
  const index = list.indexOf(step);
  if (index <= 0) return state;
  const prev = list[index - 1];
  if (!prev) return state;
  return { ...state, current: prev };
}

export function jumpTo(state: StartState, step: StepId): StartState {
  if (stepPhase(state, step) !== 'done') return state;
  return { ...state, current: step };
}

/** 摘要里修改路位：路径 B 还没把路位插进步骤条时，先补上这一格再进去。 */
export function editStep(state: StartState, step: StepId): StartState {
  if (step === 'lane' && state.choice.mode === 'team' && state.choice.teamSize != null && !decisionSteps(state).includes('lane')) {
    return { ...state, laneOpen: true, current: 'lane' };
  }
  return jumpTo(state, step);
}

export function finishFlow(state: StartState): StartState {
  if (state.current !== 'opponent') return state;
  return { ...state, current: null };
}

export function openLane(state: StartState): StartState {
  if (state.choice.mode !== 'team' || state.choice.teamSize == null) return state;
  return { ...state, laneOpen: true, current: 'lane' };
}

export function enterLobby(): StartState {
  return {
    ...resetStart(),
    choice: { mode: LOBBY_EXAMPLE.mode, teamSize: LOBBY_EXAMPLE.teamSize, mapId: LOBBY_EXAMPLE.mapId, lane: null, civ: null },
    prefilled: { mode: true, map: true },
    teamArmed: true,
    lobby: true,
    laneOpen: false,
    current: 'civ',
  };
}
