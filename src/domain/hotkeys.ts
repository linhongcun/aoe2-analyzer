import content from '../content/hotkeys.json';

export interface HotkeySource {
  id: string;
  title: string;
  url: string;
  note: string;
}
export interface HotkeyAction {
  id: string;
  zh: string;
  en: string;
  aliases: string[];
  context: string;
  meaning: string;
  sourceIds: string[];
  defaultBinding: string;
  bindingContext: string;
}

// 人工核对的 DE 网格默认配置；每项默认键对应公开来源。
export const hotkeys: readonly HotkeyAction[] = content.actions;
export const hotkeySources: readonly HotkeySource[] = content.sources;
export const hotkeyMenuNote = content.menuNote;
export const hotkeyCheckedAt = content.checkedAt;
export const HOTKEY_STORAGE_KEY = 'aoe2-hotkeys-v1';
export const HOTKEY_BINDING_LIMIT = 80;
const STORAGE_LIMIT = 16000;
const actionIds = new Set(hotkeys.map((action) => action.id));

export type HotkeyProfile = 'single' | 'multi';
export interface HotkeyState {
  version: 1;
  profiles: Record<HotkeyProfile, { bindings: Record<string, string> }>;
}
export const hotkeyProfileNames: Record<HotkeyProfile, string> = { single: '单人表', multi: '多人表' };

export function emptyHotkeyState(): HotkeyState {
  return { version: 1, profiles: { single: { bindings: {} }, multi: { bindings: {} } } };
}

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

export function findHotkeys(query: string): readonly HotkeyAction[] {
  if (query.length > 1000) return [];
  const words = normalize(query).split(' ').filter(Boolean);
  return hotkeys.filter((action) => {
    const text = normalize([action.zh, action.en, ...action.aliases].join(' '));
    return words.every((word) => text.includes(word));
  });
}

export function hotkeyBindingError(value: string): string | null {
  if (value.length > HOTKEY_BINDING_LIMIT) return `按键说明最多 ${HOTKEY_BINDING_LIMIT} 个字符，请缩短后再保存。`;
  // 不接受换行、控制字符、双向覆盖字符，避免速查/打印时隐藏实际内容。
  if (
    Array.from(value).some((char) => {
      const cp = char.codePointAt(0)!;
      return cp < 32 || (cp >= 127 && cp <= 159) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
    })
  )
    return '按键说明不能包含换行或隐藏的控制字符。';
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** 严格解析浏览器数据；未知版本、动作、配置和额外字段都不能静默并入表。 */
export function parseHotkeyStorage(raw: string | null): { status: 'empty' | 'valid' | 'invalid'; state: HotkeyState } {
  const fallback = () => ({ status: 'invalid' as const, state: emptyHotkeyState() });
  if (raw === null) return { status: 'empty', state: emptyHotkeyState() };
  if (raw.length > STORAGE_LIMIT) return fallback();
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !record(data) ||
      !exactKeys(data, ['version', 'profiles']) ||
      data.version !== 1 ||
      !record(data.profiles) ||
      !exactKeys(data.profiles, ['single', 'multi'])
    )
      return fallback();
    const state = emptyHotkeyState();
    for (const profile of ['single', 'multi'] as const) {
      const entry = data.profiles[profile];
      if (!record(entry) || !exactKeys(entry, ['bindings']) || !record(entry.bindings)) return fallback();
      for (const [id, value] of Object.entries(entry.bindings)) {
        if (!actionIds.has(id) || typeof value !== 'string' || hotkeyBindingError(value)) return fallback();
        if (value) state.profiles[profile].bindings[id] = value;
      }
    }
    return { status: 'valid', state };
  } catch {
    return fallback();
  }
}

export function serializeHotkeyState(state: unknown): string | null {
  try {
    const raw = JSON.stringify(state);
    return raw && parseHotkeyStorage(raw).status === 'valid' ? raw : null;
  } catch {
    return null;
  }
}

export function updateHotkeyBinding(
  state: HotkeyState,
  profile: HotkeyProfile,
  id: string,
  value: string,
): { ok: true; state: HotkeyState } | { ok: false; error: string } {
  if (!actionIds.has(id)) return { ok: false, error: '此操作未收录，不能保存。' };
  const error = hotkeyBindingError(value);
  if (error) return { ok: false, error };
  const bindings = { ...state.profiles[profile].bindings };
  if (value) bindings[id] = value;
  else delete bindings[id];
  return { ok: true, state: { version: 1, profiles: { ...state.profiles, [profile]: { bindings } } } };
}

export type HotkeyEdit = { kind: 'set'; profile: HotkeyProfile; id: string; value: string } | { kind: 'clear'; profile: HotkeyProfile };

/** 写入前重放本页未保存操作，避免另一标签的另一份表被旧快照覆盖。 */
export function applyHotkeyEdits(state: HotkeyState, edits: readonly HotkeyEdit[]): HotkeyState {
  return edits.reduce((current, edit) => {
    if (edit.kind === 'clear') return { version: 1, profiles: { ...current.profiles, [edit.profile]: { bindings: {} } } };
    const result = updateHotkeyBinding(current, edit.profile, edit.id, edit.value);
    return result.ok ? result.state : current;
  }, state);
}
