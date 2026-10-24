import { describe, expect, it } from 'vitest';
import { emptyHotkeyState, hotkeyBindingError, hotkeys, parseHotkeyStorage, serializeHotkeyState } from '../../src/domain/hotkeys';
import { decodeScouting, defaultScoutingConfig, encodeScouting, isScoutingTimeText, scoutingTimeError } from '../../src/domain/scouting';
import { emptyMatchReview, emptyReviewEvent, reviewTextLength, reviewTextProblem, reviewTimeProblem, validateMatchReview } from '../../src/domain/matchReview';
import { hasExactKeys, isClockText, isRecord, textCharacterProblem, textLength } from '../../src/domain/validate';

describe('#279 共用校验原语', () => {
  it('对象与字段检查仍按原有自有键规则，不擅自收紧对象种类', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord(new Date())).toBe(true);
    expect(hasExactKeys({ a: 1 }, ['a'])).toBe(true);
    expect(hasExactKeys({ a: 1, b: 2 }, ['a'])).toBe(false);
    expect(hasExactKeys(Object.create({ a: 1 }) as Record<string, unknown>, ['a'])).toBe(false);
  });
  it('长度单位可选，字符检查不归一化合法文本', () => {
    expect(textLength('😀e\u0301')).toBe(4);
    expect(textLength('😀e\u0301', 'code-points')).toBe(3);
    expect(textCharacterProblem('Ｃtrl + 😀')).toBeNull();
    expect(textCharacterProblem('\ud800')).toBeNull();
    expect(textCharacterProblem('\ud800', { rejectUnpairedSurrogates: true })).toBe('unicode');
  });
  it('只在指定策略中拒绝方向标记或允许多行，并返回首个非法字符类别', () => {
    expect(textCharacterProblem('\u200f')).toBeNull();
    expect(textCharacterProblem('\u200f', { rejectDirectionalMarks: true })).toBe('control');
    expect(textCharacterProblem('\t\n\r', { multiline: true })).toBeNull();
    expect(textCharacterProblem('\u0000', { multiline: true })).toBe('control');
    expect(textCharacterProblem('\n\ud800', { rejectUnpairedSurrogates: true })).toBe('control');
    expect(textCharacterProblem('\ud800\n', { rejectUnpairedSurrogates: true })).toBe('unicode');
  });
  it('只判断调用方给定的时间位数，不替调用方决定可选空值', () => {
    expect(isClockText('', { minuteDigits: 4, hourDigits: 3 })).toBe(false);
    expect(isClockText('9999:59', { minuteDigits: 4, hourDigits: 3 })).toBe(true);
    expect(isClockText('9999:59', { minuteDigits: 3, hourDigits: 2 })).toBe(false);
    expect(isClockText('9:60', { minuteDigits: 4, hourDigits: 3 })).toBe(false);
  });
});

describe('#279 保留各模块已有的输入边界', () => {
  it('快捷键与侦察按UTF-16计数，复盘按code point计数', () => {
    expect(hotkeyBindingError('村'.repeat(80))).toBeNull();
    expect(hotkeyBindingError('村'.repeat(81))).toContain('最多 80');
    expect(hotkeyBindingError('😀'.repeat(40))).toBeNull();
    expect(hotkeyBindingError('😀'.repeat(41))).toContain('最多 80');
    expect(isScoutingTimeText('😀'.repeat(16))).toBe(true);
    expect(isScoutingTimeText('😀'.repeat(17))).toBe(false);
    expect(reviewTextLength('😀')).toBe(1);
    expect(reviewTextLength('e\u0301')).toBe(2);
    for (const limit of [32, 120, 400]) {
      expect(reviewTextProblem('😀'.repeat(limit), limit)).toBeNull();
      expect(reviewTextProblem('😀'.repeat(limit + 1), limit)).toContain('最多 ' + limit);
    }
  });

  it.each(['\u061c', '\u200e', '\u200f'])('方向标记%j仍只在复盘中拒绝', (value) => {
    expect(hotkeyBindingError(value)).toBeNull();
    expect(isScoutingTimeText(value)).toBe(true);
    expect(reviewTextProblem(value, 120)).toContain('隐藏控制字符');
  });

  it.each(['\ud800', '\udfff'])('不完整surrogate%j保持原有三种策略', (value) => {
    expect(hotkeyBindingError(value)).toBeNull();
    expect(isScoutingTimeText(value)).toBe(false);
    expect(reviewTextProblem(value, 120)).toBe('含不完整的 Unicode 字符，请修正。');
  });

  it.each(['\u0000', '\u001f', '\u007f', '\u0085', '\u009f', '\u202a', '\u202e', '\u2066', '\u2069'])('隐藏字符%j在三个模块均拒绝', (value) => {
    expect(hotkeyBindingError(value)).not.toBeNull();
    expect(isScoutingTimeText(value)).toBe(false);
    expect(reviewTextProblem(value, 120, true)).not.toBeNull();
  });

  it('复盘只有多行字段允许TAB/LF/CR，错误仍按长度及字符出现顺序返回', () => {
    expect(reviewTextProblem('\t\n\r', 400, true)).toBeNull();
    expect(reviewTextProblem('\t\n\r', 400)).toContain('隐藏控制字符');
    expect(hotkeyBindingError('\n')).not.toBeNull();
    expect(isScoutingTimeText('\n')).toBe(false);
    expect(reviewTextProblem('\ud800\n', 120)).toContain('不完整的 Unicode');
    expect(reviewTextProblem('\n\ud800', 120)).toContain('隐藏控制字符');
    expect(reviewTextProblem('\ud800\n', 1)).toContain('最多 1');
    expect(hotkeyBindingError('村'.repeat(80) + '\n')).toContain('最多 80');
  });

  it.each([
    ['', true, true],
    ['0:00', true, true],
    ['999:59', true, true],
    ['99:59:59', true, true],
    ['9999:59', true, false],
    ['999:59:59', true, false],
    ['10000:00', false, false],
    ['1000:00:00', false, false],
    ['1:60', false, false],
    ['1:00:60', false, false],
    ['1:2', false, false],
    [' 1:00', false, false],
  ] as const)('时间%j的复盘/侦察位数限制保持独立', (value, review, scouting) => {
    expect(reviewTimeProblem(value) === null).toBe(review);
    expect(scoutingTimeError(value) === null).toBe(scouting);
  });

  it('语义上错误的时间仍可完整恢复，格式问题不升级为结构损坏', () => {
    const scouting = defaultScoutingConfig();
    scouting.observations['military-building'].at = '稍后';
    expect(isScoutingTimeText('稍后')).toBe(true);
    expect(decodeScouting('?' + encodeScouting(scouting))).toEqual({ config: scouting, locked: false, errors: [] });
    expect(scoutingTimeError('稍后')).not.toBeNull();
    const draft = emptyMatchReview();
    draft.events = [{ ...emptyReviewEvent('event-1'), gameTime: '稍后' }];
    expect(validateMatchReview(draft)).toEqual({ ok: true, draft });
    expect(reviewTimeProblem(draft.events[0]!.gameTime)).not.toBeNull();
  });

  it('快捷键保存往返不归一化文本，额外字段与非对象结构仍被拒绝', () => {
    const state = emptyHotkeyState();
    state.profiles.single.bindings[hotkeys[0]!.id] = 'Ｃtrl + 😀';
    const raw = serializeHotkeyState(state)!;
    expect(parseHotkeyStorage(raw)).toEqual({ status: 'valid', state });
    expect(parseHotkeyStorage(JSON.stringify({ ...state, extra: true })).status).toBe('invalid');
    expect(parseHotkeyStorage('[]').status).toBe('invalid');
    expect(validateMatchReview({ ...emptyMatchReview(), extra: true }).ok).toBe(false);
  });
});
