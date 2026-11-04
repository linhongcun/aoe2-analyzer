import type { StartState } from '../../domain/startGame';
import { encodeStartGame } from '../../domain/startGameCodec';
export {
  START_GAME_LIMIT,
  START_SEARCH_LIMIT,
  encodeStartGame,
  decodeStartGame,
  encodeStartSearch,
  decodeStartSearch,
  type StartRestore,
} from '../../domain/startGameCodec';

export const START_GAME_KEY = 'aoe2-start-game-v1';
export interface StartStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function browserStartStorage(): StartStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}
export function readStartGame(storage: () => StartStorage | undefined): string | null {
  try {
    return storage()?.getItem(START_GAME_KEY) ?? null;
  } catch {
    return null;
  }
}
export function writeStartGame(storage: () => StartStorage | undefined, state: StartState): void {
  try {
    storage()?.setItem(START_GAME_KEY, encodeStartGame(state));
  } catch {
    /* 被拒绝时仍可继续当前流程。 */
  }
}
