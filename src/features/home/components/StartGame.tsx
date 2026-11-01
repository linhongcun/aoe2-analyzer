import { useEffect } from 'react';
import { decisionSteps, enterLobby, laneRowVisible, type StartState } from '../../../domain/startGame';
import '../start-game.css';
import { LaneStep, MapStep, ModeStep, Practice, StepBar, loadMaps, type Update } from './startGameEarly';
import { CivStep, OpponentStep, Summary } from './startGameLater';

function lede(state: StartState): string {
  if (state.current == null) return '只汇总点过的选择。没有数据的格子写「暂无建议」，不补胜率。';
  if (state.lobby && state.current === 'civ') return '模式和地图已经在入口里填好。从文明接着选。没有连上游戏大厅。';
  if (state.current === 'mode') return '先定这局怎么打。可以跳过，也可以回头改。';
  return '可以跳过，也可以回头改。';
}

function note(state: StartState): string {
  if (state.current == null) {
    return laneRowVisible(state) ? '摘要不占一格。这局是组队，所以看得到路位。1v1 的摘要没有这一格。' : '摘要不占一格。步数不固定。1v1 没有路位这一格。';
  }
  if (state.current === 'mode') return '路位只在组队出现，现在不占一格。步数不固定。';
  if (state.current === 'lane') return '因为选了组队，路位插在地图和文明之间。1v1 不会插入。这不是固定的第 3 步。';
  if (state.current === 'civ' && state.lobby && !decisionSteps(state).includes('lane')) return '路位还没占一格。从某一侧点文明时再记上那一侧。';
  return '步数不固定。还没到的格子不能点。';
}

export default function StartGame({ state, onChange }: { state: StartState; onChange: Update }) {
  useEffect(() => {
    void loadMaps();
  }, []);
  const lobbyStart = state.lobby && state.current === 'civ';
  return (
    <section className="start-game" data-testid="start-game" aria-labelledby="start-title">
      <p className="start-kicker">{lobbyStart ? '首页 / 已在大厅' : state.current === 'mode' ? '首页' : '首页 / 开一局'}</p>
      <h1 id="start-title">{state.current == null ? '本局摘要' : '开一局'}</h1>
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
          <Practice />
        </div>
      ) : (
        <Practice />
      )}
    </section>
  );
}
