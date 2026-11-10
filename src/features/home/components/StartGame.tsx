import { useEffect } from 'react';
import { enterLobby, laneRowVisible, type StartState } from '../../../domain/startGame';
import '../start-game.css';
import { LaneStep, MapStep, ModeStep, StepBar, loadMaps, type Update } from './startGameEarly';
import { CivStep, OpponentStep, Summary } from './startGameLater';
import StartFeatureMenu from './StartFeatureMenu';

function lede(state: StartState): string {
  if (state.lobby) return '可按当前选择继续，也可以回头改条件。没有连上游戏大厅。';
  if (state.current == null) return '查看并修改本局选择。这里不估算本局胜率。';
  if (state.current === 'mode') return '先定这局怎么打。可以跳过，也可以回头改。';
  return '可以跳过，也可以回头改。';
}

function note(state: StartState): string {
  if (state.current == null) {
    return laneRowVisible(state) ? '可修改本局的模式、地图、路位和文明。' : '可修改本局的模式、地图和文明。';
  }
  if (state.current === 'mode') return '先选单挑或组队，也可以跳过。';
  if (state.current === 'lane') return '按队伍安排选择路位，也可以跳过。';
  if (state.current === 'civ' && state.lobby && state.choice.mode === 'team' && state.choice.mapId && state.choice.lane == null)
    return '路位尚未选择。可点「补路位」补选，也可以自主选择文明。';
  return '点已完成的步骤可返回修改。';
}

export default function StartGame({ state, onChange }: { state: StartState; onChange: Update }) {
  useEffect(() => {
    void loadMaps().catch(() => {
      /* 地图步或恢复区显示失败与重试。 */
    });
  }, []);
  const lobbyStart = state.lobby && state.current === 'civ';
  return (
    <section className="start-game" data-testid="start-game" aria-labelledby="start-title">
      <p className="start-kicker">{lobbyStart ? '首页 / 已在大厅' : state.current === 'mode' ? '首页' : '首页 / 开一局'}</p>
      <h2 id="start-title">{state.current == null ? '本局摘要' : '开一局'}</h2>
      <p className="start-lede">{lede(state)}</p>
      <StepBar state={state} onChange={onChange} />
      <p className="start-note">{note(state)}</p>
      {state.current === 'mode' ? <ModeStep state={state} onChange={onChange} /> : null}
      {state.current === 'map' ? <MapStep state={state} onChange={onChange} /> : null}
      {state.current === 'lane' ? <LaneStep state={state} onChange={onChange} /> : null}
      {state.current === 'civ' ? <CivStep state={state} onChange={onChange} /> : null}
      {state.current === 'opponent' ? <OpponentStep state={state} onChange={onChange} /> : null}
      {state.current == null ? <Summary state={state} onChange={onChange} /> : null}
      {state.current === 'mode' ? (
        <div className="start-alts">
          <button type="button" className="start-lobby" data-testid="start-lobby" onClick={() => onChange(() => enterLobby())}>
            已在大厅
          </button>
        </div>
      ) : null}
      <StartFeatureMenu state={state} />
    </section>
  );
}
