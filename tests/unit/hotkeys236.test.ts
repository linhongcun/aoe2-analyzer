import { describe, expect, it } from 'vitest';
import {
  HOTKEY_BINDING_LIMIT,
  applyHotkeyEdits,
  emptyHotkeyState,
  findHotkeys,
  hotkeyBindingError,
  hotkeys,
  hotkeySources,
  parseHotkeyStorage,
  serializeHotkeyState,
  updateHotkeyBinding,
} from '../../src/domain/hotkeys';

describe('#236 可审计动作目录与个人表', () => {
  it('支持中英文、别名、组合词和空查询，来源不伪造默认按键', () => {
    expect(hotkeys).toHaveLength(20);
    expect(findHotkeys('训练村民').map((a) => a.id)).toEqual(findHotkeys('Train Villager').map((a) => a.id));
    expect(findHotkeys('Ｓｅｌｅｃｔ   Town Centers').map((a) => a.id)).toEqual(['select-town-centers']);
    expect(findHotkeys('全选闲兵').map((a) => a.id)).toEqual(['select-idle-military']);
    expect(findHotkeys('')).toHaveLength(hotkeys.length);
    expect(findHotkeys('missing-operation')).toEqual([]);
    expect(new Set(hotkeys.map((a) => a.id)).size).toBe(hotkeys.length);
    for (const action of hotkeys) {
      expect(action.defaultBinding).toBeNull();
      expect(action.sourceIds.length).toBeGreaterThan(0);
      expect(action.sourceIds.every((id) => hotkeySources.some((s) => s.id === id))).toBe(true);
      expect(action.meaning.length).toBeGreaterThan(15);
    }
  });

  it('两份表隔离，跨上下文同键合法，更新不改变原值', () => {
    const original = emptyHotkeyState();
    const single = updateHotkeyBinding(original, 'single', 'train-villager', 'Q');
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    const second = updateHotkeyBinding(single.state, 'single', 'economic-menu', 'Q');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const multi = updateHotkeyBinding(second.state, 'multi', 'train-villager', 'Mouse 4');
    expect(multi.ok).toBe(true);
    if (!multi.ok) return;
    expect(original.profiles.single.bindings).toEqual({});
    expect(multi.state.profiles.single.bindings).toEqual({ 'train-villager': 'Q', 'economic-menu': 'Q' });
    expect(multi.state.profiles.multi.bindings).toEqual({ 'train-villager': 'Mouse 4' });
    const saved = serializeHotkeyState(multi.state);
    expect(saved).not.toBeNull();
    expect(parseHotkeyStorage(saved).state).toEqual(multi.state);
  });

  it('清空按键后删除记录，严格拒绝未知动作和非法输入', () => {
    const original = emptyHotkeyState();
    const first = updateHotkeyBinding(original, 'single', 'train-villager', 'Q');
    if (!first.ok) throw new Error('valid binding rejected');
    const cleared = updateHotkeyBinding(first.state, 'single', 'train-villager', '');
    expect(cleared.ok && cleared.state.profiles.single.bindings).toEqual({});
    expect(updateHotkeyBinding(original, 'single', '__proto__', 'Q').ok).toBe(false);
    expect(updateHotkeyBinding(original, 'single', 'unknown-action', 'Q').ok).toBe(false);
    expect(hotkeyBindingError('x'.repeat(HOTKEY_BINDING_LIMIT))).toBeNull();
    expect(hotkeyBindingError('x'.repeat(HOTKEY_BINDING_LIMIT + 1))).not.toBeNull();
    expect(hotkeyBindingError('Q\nW')).not.toBeNull();
    expect(hotkeyBindingError('Q\u0000')).not.toBeNull();
    expect(hotkeyBindingError('Q\u202e')).not.toBeNull();
  });

  it.each([
    '{broken',
    'null',
    '[]',
    '{"version":2,"profiles":{"single":{"bindings":{}},"multi":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":{}},"multi":{"bindings":{}},"other":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":{"unknown":"Q"}},"multi":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":{"__proto__":"Q"}},"multi":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":{"train-villager":42}},"multi":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":[]},"multi":{"bindings":{}}}}',
    '{"version":1,"profiles":{"single":{"bindings":{}},"multi":{"bindings":{}}},"name":"ignored"}',
    JSON.stringify({ version: 1, profiles: { single: { bindings: { 'train-villager': 'x'.repeat(81) } }, multi: { bindings: {} } } }),
    'x'.repeat(30000),
  ])('损坏或不兼容存储回退空表且保留显式状态：%s', (raw) => {
    const result = parseHotkeyStorage(raw);
    expect(result.status).toBe('invalid');
    expect(result.state).toEqual(emptyHotkeyState());
  });

  it('空存储与合法空表可区分，不对非法对象序列化', () => {
    expect(parseHotkeyStorage(null).status).toBe('empty');
    expect(parseHotkeyStorage(serializeHotkeyState(emptyHotkeyState())).status).toBe('valid');
    expect(serializeHotkeyState({ version: 1, profiles: null })).toBeNull();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeHotkeyState(circular)).toBeNull();
  });

  it('在最新表上重放待保存操作，保留另一配置及其他动作，清空也只影响指定配置', () => {
    const latest = emptyHotkeyState();
    latest.profiles.single.bindings['train-villager'] = 'Q';
    latest.profiles.multi.bindings['select-military'] = 'Mouse 4';
    const next = applyHotkeyEdits(latest, [
      { kind: 'set', profile: 'multi', id: 'train-villager', value: 'W' },
      { kind: 'set', profile: 'multi', id: 'attack-move', value: 'Ctrl + A' },
    ]);
    expect(next.profiles.single.bindings).toEqual({ 'train-villager': 'Q' });
    expect(next.profiles.multi.bindings).toEqual({ 'select-military': 'Mouse 4', 'train-villager': 'W', 'attack-move': 'Ctrl + A' });
    expect(applyHotkeyEdits(next, [{ kind: 'clear', profile: 'multi' }]).profiles.single).toEqual(next.profiles.single);
    expect(applyHotkeyEdits(next, [{ kind: 'clear', profile: 'multi' }]).profiles.multi.bindings).toEqual({});
    expect(latest.profiles.multi.bindings).toEqual({ 'select-military': 'Mouse 4' });
  });
});
