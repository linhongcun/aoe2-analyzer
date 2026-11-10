import { resetStart, type StartState } from '../../domain/startGame';

/** 无选择、无跳过、仍停在模式步：首页只显示入口，不把空白局当成进行中的流程。 */
export function isIdleStart(state: StartState): boolean {
  const idle = resetStart();
  return (
    state.current === idle.current &&
    state.lobby === idle.lobby &&
    state.teamArmed === idle.teamArmed &&
    state.laneOpen === idle.laneOpen &&
    state.sceneConfig == null &&
    state.routeConfig == null &&
    state.choice.mode == null &&
    state.choice.teamSize == null &&
    state.choice.mapId == null &&
    state.choice.lane == null &&
    state.choice.civ == null &&
    state.choice.opponent == null &&
    state.choice.mates.length === 0 &&
    !Object.values(state.skipped).some(Boolean) &&
    !Object.values(state.prefilled).some(Boolean)
  );
}
