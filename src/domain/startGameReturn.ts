import type { StartState } from './startGame';
import { decodeStartSearch, encodeStartSearch } from './startGameCodec';

export function startCivPath(en: string, state: StartState): string {
  const home = '/' + encodeStartSearch({ ...state, current: 'civ' });
  return `/civ/${encodeURIComponent(en)}?${new URLSearchParams({ returnTo: home })}`;
}

/** 只接受同一严格本局协议的根首页，不导航到原始输入。 */
export function startReturnPath(search: string): string | null {
  if (!search.startsWith('?')) return null;
  try {
    decodeURIComponent(search.slice(1).replace(/\+/g, ' '));
    const values = new URLSearchParams(search).getAll('returnTo');
    if (values.length !== 1) return null;
    const target = values[0];
    if (
      !target ||
      !target.startsWith('/?') ||
      target.trim() !== target ||
      /[\\#]/.test(target) ||
      [...target].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      return null;
    const restored = decodeStartSearch(target.slice(1));
    if (restored.kind === 'invalid' || restored.kind === 'absent' || restored.state.current !== 'civ') return null;
    return '/' + encodeStartSearch(restored.state);
  } catch {
    return null;
  }
}
