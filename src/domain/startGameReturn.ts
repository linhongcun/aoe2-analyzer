import type { StartState } from './startGame';
import { decodeStartSearch, encodeStartSearch } from './startGameCodec';

const START_PATH = '/start';

function startQuery(target: string): string | null {
  if (target.startsWith(`${START_PATH}?`)) return target.slice(START_PATH.length);
  if (target.startsWith('/?')) return target.slice(1);
  return null;
}

export function startCivPath(en: string, state: StartState): string {
  const back = START_PATH + encodeStartSearch({ ...state, current: 'civ' });
  return `/civ/${encodeURIComponent(en)}?${new URLSearchParams({ returnTo: back })}`;
}

/** 只接受同一严格本局协议，并回到 /start。旧首页 /?sgv 也归一到 /start，不写回首页。 */
export function startReturnPath(search: string): string | null {
  if (!search.startsWith('?')) return null;
  try {
    decodeURIComponent(search.slice(1).replace(/\+/g, ' '));
    const values = new URLSearchParams(search).getAll('returnTo');
    if (values.length !== 1) return null;
    const target = values[0];
    const query = target ? startQuery(target) : null;
    if (
      !target ||
      query == null ||
      target.trim() !== target ||
      /[\\#]/.test(target) ||
      [...target].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      return null;
    const restored = decodeStartSearch(query);
    if (restored.kind === 'invalid' || restored.kind === 'absent' || restored.state.current !== 'civ') return null;
    return START_PATH + encodeStartSearch(restored.state);
  } catch {
    return null;
  }
}
