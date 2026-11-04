import { describe, expect, it } from 'vitest';
import {
  choose1v1,
  chooseLane,
  chooseMap,
  chooseTeamSize,
  civPanels,
  editorialReason,
  enterLobby,
  finishFlow,
  jumpTo,
  laneRowVisible,
  pickCiv,
  skipStep,
} from '../../src/domain/startGame';

describe('大厅入口只记录实际输入 #632', () => {
  it('未填写的模式和地图是已跳过，不把示例当作已预填', () => {
    const state = enterLobby();
    expect(state.choice).toEqual({ mode: null, teamSize: null, mapId: null, lane: null, civ: null });
    expect(state.skipped).toEqual({ mode: true, map: true });
    expect(state.prefilled).toEqual({});
    expect(state.teamArmed).toBe(false);
    expect(state.current).toBe('civ');
    expect(civPanels(state)).toEqual({ kind: 'empty' });
    const summary = finishFlow(pickCiv(state, 'Franks'));
    expect(summary.choice.civ).toBe('Franks');
    expect(editorialReason(summary)).toBeNull();
    expect(laneRowVisible(summary)).toBe(false);
  });

  it('自己补单挑或只补地图，不借用组队编辑推荐', () => {
    const lobby = enterLobby();
    const solo = chooseMap(choose1v1(jumpTo(lobby, 'mode')), 'arabia');
    expect(civPanels(solo)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(solo, 'Franks'))).toBeNull();
    const mapOnly = chooseMap(jumpTo(lobby, 'map'), 'arabia');
    expect(civPanels(mapOnly)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(mapOnly, 'Franks'))).toBeNull();
  });

  it('组队也须明确选图；有真实模式与地图才恢复按侧推荐', () => {
    const team = chooseTeamSize(jumpTo(enterLobby(), 'mode'), '4v4');
    const noMap = skipStep(team);
    expect(civPanels(noMap)).toEqual({ kind: 'empty' });
    expect(editorialReason(pickCiv(noMap, 'Franks'))).toBeNull();
    const mapped = chooseMap(team, 'arabia');
    expect(mapped.current).toBe('lane');
    expect(civPanels(mapped).kind).toBe('empty');
    const picked = pickCiv(chooseLane(mapped, 'pocket'), 'Franks');
    expect(editorialReason(picked)).toContain('中路适合');
    expect(picked.choice).toMatchObject({ mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Franks' });
  });
});
