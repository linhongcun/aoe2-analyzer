import { describe, expect, it } from 'vitest';
import {
  MATCH_REVIEW_LIMITS,
  MATCH_REVIEW_STORAGE_KEY,
  emptyMatchReview,
  emptyReviewAttempt,
  emptyReviewEvent,
  hasReviewGoal,
  matchReviewSummary,
  moveReviewEvent,
  nextReviewId,
  parseMatchReview,
  reviewByteLength,
  reviewDateProblem,
  reviewLinkProblem,
  reviewResultLabels,
  reviewSaveDecision,
  reviewTextLength,
  reviewTextProblem,
  reviewTimeProblem,
  serializeMatchReview,
  validateMatchReview,
  type MatchReviewDraft,
} from '../../src/domain/matchReview';

function withRows(): MatchReviewDraft {
  const draft = emptyMatchReview();
  draft.context.title = '本局记录';
  draft.events = [
    { ...emptyReviewEvent('event-1'), visible: '最初看到的事实', action: '当时选择' },
    { ...emptyReviewEvent('event-2'), visible: '第二个事件事实', action: '第二个行动' },
    { ...emptyReviewEvent('event-3'), visible: '第三个事件事实', action: '第三个行动' },
  ];
  draft.goal = { trigger: '出现待练情境', action: '只做这一项动作', evidence: '用可观察结果核对' };
  draft.attempts = [{ ...emptyReviewAttempt('attempt-1'), observation: '仅为用户观察' }];
  return draft;
}

function roundTrip(draft: MatchReviewDraft, pretty = false): MatchReviewDraft {
  const serialized = serializeMatchReview(draft, pretty);
  expect(serialized.ok).toBe(true);
  if (!serialized.ok) throw new Error(serialized.error);
  const restored = parseMatchReview(serialized.raw);
  expect(restored.ok).toBe(true);
  if (!restored.ok) throw new Error(restored.error);
  expect(restored.draft).toEqual(draft);
  return restored.draft;
}

const face = String.fromCodePoint(0x1f642);

function markedText(length: number, marker: string, multiline: boolean): string {
  const pattern = multiline ? ['汉', face, '\n', '\t'] : ['汉', face];
  const tail = '结束-' + marker;
  const padding = length - Array.from(tail).length;
  if (padding < 0) throw new Error('marker too long');
  return Array.from({ length: padding }, (_, index) => pattern[index % pattern.length]!).join('') + tail;
}

function maximumDraft(): MatchReviewDraft {
  const draft = emptyMatchReview();
  for (const key of ['title', 'map', 'selfCiv', 'opponentCiv', 'gameVersion'] as const) draft.context[key] = markedText(120, key, false);
  const base = 'https://example.com/';
  draft.context.link = base + 'x'.repeat(2048 - base.length);
  draft.events = Array.from({ length: 8 }, (_, index) => {
    const event = emptyReviewEvent('event-' + (index + 1));
    event.gameTime = '123:45:56';
    event.videoTime = '02:34';
    for (const key of ['visible', 'action', 'revealed', 'explanation', 'question'] as const) event[key] = markedText(400, 'event-' + index + '-' + key, true);
    return event;
  });
  for (const key of ['trigger', 'action', 'evidence'] as const) draft.goal[key] = markedText(400, 'goal-' + key, true);
  draft.attempts = Array.from({ length: 8 }, (_, index) => ({
    ...emptyReviewAttempt('attempt-' + (index + 1)),
    date: '2026-10-20',
    scene: markedText(400, 'attempt-' + index + '-scene', true),
    observation: markedText(400, 'attempt-' + index + '-observation', true),
    result: (['unassessed', 'done', 'not-done', 'uncertain'] as const)[index % 4]!,
  }));
  return draft;
}

describe('#257 recoverable draft contract', () => {
  it('starts with unknown context, no events, no goal and no claims about the game', () => {
    const draft = emptyMatchReview();
    expect(MATCH_REVIEW_STORAGE_KEY).toBe('aoe2-match-review-v1');
    expect(MATCH_REVIEW_LIMITS).toEqual({ events: 8, attempts: 8, short: 120, long: 400, link: 2048, time: 32, date: 10, bytes: 256 * 1024 });
    expect(Object.values(draft.context)).toEqual(['', '', '', '', '', '']);
    expect(draft.events).toEqual([]);
    expect(draft.attempts).toEqual([]);
    expect(hasReviewGoal(draft)).toBe(false);
    expect(roundTrip(draft)).toEqual(draft);
    const summary = matchReviewSummary(draft);
    expect(summary).toContain('游戏版本：未记录');
    expect(summary).toContain('本方文明：未记录');
    expect(summary).toContain('暂未设置目标');
    expect(summary).not.toContain('游戏版本：185872');
  });

  it('preserves incomplete, semantically wrong clocks, dates and URLs without guessing a correction', () => {
    const draft = withRows();
    draft.context.link = 'javascript:alert(1)';
    draft.events[0]!.gameTime = '到达城堡之后';
    draft.events[0]!.videoTime = '01:99';
    draft.attempts[0]!.date = '2026-02-30';
    const restored = roundTrip(draft, true);
    expect(restored.context.link).toBe('javascript:alert(1)');
    expect(restored.events[0]!.gameTime).toBe('到达城堡之后');
    expect(restored.events[0]!.videoTime).toBe('01:99');
    expect(restored.attempts[0]!.date).toBe('2026-02-30');
    expect(reviewLinkProblem(restored.context.link)).not.toBeNull();
    expect(reviewTimeProblem(restored.events[0]!.gameTime)).not.toBeNull();
    expect(reviewDateProblem(restored.attempts[0]!.date)).not.toBeNull();
    expect(matchReviewSummary(restored)).toContain('链接格式待修正，以上仅为原始文本');
    expect(matchReviewSummary(restored)).toContain('游戏时间：到达城堡之后（格式待修正）');
  });

  it('does not infer a video position from game time, or fill an unknown clock with zero', () => {
    const draft = emptyMatchReview();
    draft.events = [{ ...emptyReviewEvent('event-1'), gameTime: '25:30' }];
    const restored = roundTrip(draft);
    expect(restored.events[0]!.videoTime).toBe('');
    const text = matchReviewSummary(restored);
    expect(text).toContain('游戏时间：25:30');
    expect(text).toContain('视频播放位置：未记录');
    expect(text).not.toContain('视频播放位置：0');
  });

  it('returns an explicit failed import with the original payload and no substitute draft', () => {
    const current = withRows();
    const before = structuredClone(current);
    for (const raw of ['not-json', '{"version":77}', '{"version":1,"context":null}', 'null', '[]']) {
      const parsed = parseMatchReview(raw);
      expect(parsed.ok).toBe(false);
      expect(parsed.raw).toBe(raw);
      expect(Object.hasOwn(parsed, 'draft')).toBe(false);
    }
    expect(current).toEqual(before);
    const badExport = serializeMatchReview({ ...current, version: 77 });
    expect(badExport.ok).toBe(false);
    expect(Object.hasOwn(badExport, 'raw')).toBe(false);
  });

  it.each([
    ['unknown top-level key', (draft: MatchReviewDraft) => ({ ...draft, secret: 'unexpected' })],
    ['missing context key', (draft: MatchReviewDraft) => ({ ...draft, context: { title: draft.context.title } })],
    ['extra context key', (draft: MatchReviewDraft) => ({ ...draft, context: { ...draft.context, idleTc: 0 } })],
    ['goal list in place of one object', (draft: MatchReviewDraft) => ({ ...draft, goal: [draft.goal] })],
    ['extra goal key', (draft: MatchReviewDraft) => ({ ...draft, goal: { ...draft.goal, confidence: 1 } })],
    ['numeric event time', (draft: MatchReviewDraft) => ({ ...draft, events: [{ ...draft.events[0], gameTime: 0 }] })],
    ['extra event key', (draft: MatchReviewDraft) => ({ ...draft, events: [{ ...draft.events[0], autoCause: 'a guess' }] })],
    ['unknown result', (draft: MatchReviewDraft) => ({ ...draft, attempts: [{ ...draft.attempts[0], result: 'success' }] })],
    ['extra attempt key', (draft: MatchReviewDraft) => ({ ...draft, attempts: [{ ...draft.attempts[0], successRate: 1 }] })],
    ['non-boolean output setting', (draft: MatchReviewDraft) => ({ ...draft, output: { ...draft.output, events: 'false' } })],
    ['missing output key', (draft: MatchReviewDraft) => ({ ...draft, output: { context: true, events: true, goal: true } })],
  ])('rejects %s rather than importing only the fields it recognizes', (_name, change) => {
    const invalid = change(withRows());
    expect(validateMatchReview(invalid).ok).toBe(false);
    expect(parseMatchReview(JSON.stringify(invalid)).ok).toBe(false);
  });

  it('accepts eight independent events and attempts, then refuses a ninth without changing the source', () => {
    const draft = maximumDraft();
    expect(validateMatchReview(draft).ok).toBe(true);
    const original = structuredClone(draft);
    expect(validateMatchReview({ ...draft, events: [...draft.events, emptyReviewEvent('event-9')] }).ok).toBe(false);
    expect(validateMatchReview({ ...draft, attempts: [...draft.attempts, emptyReviewAttempt('attempt-9')] }).ok).toBe(false);
    expect(draft).toEqual(original);
  });

  it('refuses duplicate identities, missing identities and identity strings outside the backup alphabet', () => {
    const draft = withRows();
    const first = draft.events[0]!;
    expect(validateMatchReview({ ...draft, events: [first, { ...first }] }).ok).toBe(false);
    const attempt = draft.attempts[0]!;
    expect(validateMatchReview({ ...draft, attempts: [attempt, { ...attempt }] }).ok).toBe(false);
    for (const id of ['', 'a'.repeat(65), '事件一', 'bad id', 'bad/id']) {
      expect(validateMatchReview({ ...draft, events: [{ ...first, id }] }).ok).toBe(false);
      expect(validateMatchReview({ ...draft, attempts: [{ ...attempt, id }] }).ok).toBe(false);
    }
  });

  it('treats the one target as a possibly incomplete user note and retains attempts when it is cleared', () => {
    const draft = emptyMatchReview();
    expect(hasReviewGoal(draft)).toBe(false);
    draft.goal.trigger = '先记一个触发情境';
    expect(hasReviewGoal(draft)).toBe(true);
    expect(roundTrip(draft).goal.action).toBe('');
    draft.attempts = [{ ...emptyReviewAttempt('attempt-1'), result: 'uncertain' }];
    draft.goal = { trigger: '', action: '', evidence: '' };
    const restored = roundTrip(draft);
    expect(hasReviewGoal(restored)).toBe(false);
    expect(restored.attempts[0]!.result).toBe('uncertain');
  });
});

describe('#257 Unicode and bounded backup integrity', () => {
  it('round-trips maximum-size Chinese text, whole non-BMP characters and multiline data for all rows', () => {
    const draft = maximumDraft();
    expect(draft.events).toHaveLength(8);
    expect(draft.attempts).toHaveLength(8);
    expect(reviewTextLength(draft.context.title)).toBe(120);
    expect(reviewTextLength(draft.events[7]!.question)).toBe(400);
    expect(draft.events[7]!.question).toContain(face);
    expect(draft.events[7]!.question).toContain('\n');
    expect(draft.events[7]!.question).toContain('\t');
    const restored = roundTrip(draft, true);
    const summary = matchReviewSummary(restored);
    for (const event of restored.events) {
      for (const key of ['visible', 'action', 'revealed', 'explanation', 'question'] as const) expect(summary).toContain(event[key]);
    }
    for (const attempt of restored.attempts) {
      expect(summary).toContain(attempt.scene);
      expect(summary).toContain(attempt.observation);
    }
  });

  it('counts code points independently from UTF-16 units and UTF-8 bytes', () => {
    expect(reviewTextLength(face)).toBe(1);
    expect(face.length).toBe(2);
    expect(reviewByteLength(face)).toBe(4);
    expect(reviewTextProblem(face.repeat(400), 400, true)).toBeNull();
    expect(reviewTextProblem(face.repeat(401), 400, true)).not.toBeNull();
    const draft = emptyMatchReview();
    draft.context.title = face.repeat(120);
    expect(validateMatchReview(draft).ok).toBe(true);
    draft.context.title += face;
    expect(validateMatchReview(draft).ok).toBe(false);
  });

  it('retains the exact boundary value instead of truncating an overlong field during serialization', () => {
    const draft = emptyMatchReview();
    draft.events = [{ ...emptyReviewEvent('event-1'), visible: '汉'.repeat(400) }];
    expect(roundTrip(draft).events[0]!.visible).toHaveLength(400);
    draft.events[0]!.visible += '尾';
    expect(serializeMatchReview(draft).ok).toBe(false);
    expect(draft.events[0]!.visible).toHaveLength(401);
    expect(draft.events[0]!.visible.endsWith('尾')).toBe(true);
  });

  it('accepts newlines and tabs only in multiline fields', () => {
    const draft = emptyMatchReview();
    draft.goal.action = '第一行\r\n第二行\t备注';
    expect(roundTrip(draft).goal.action).toBe('第一行\r\n第二行\t备注');
    draft.context.map = '第一行\n第二行';
    expect(validateMatchReview(draft).ok).toBe(false);
  });

  it.each([0x0000, 0x001f, 0x007f, 0x0085, 0x061c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0xd800, 0xdc00])(
    'refuses hidden control or isolated surrogate U+%s even inside a long-note field',
    (cp) => {
      const draft = emptyMatchReview();
      draft.goal.evidence = '前文' + String.fromCharCode(cp) + '后文';
      expect(validateMatchReview(draft).ok).toBe(false);
      expect(parseMatchReview(JSON.stringify(draft)).ok).toBe(false);
    },
  );

  it('checks the raw backup byte boundary before parsing without discarding the payload', () => {
    const minimal = JSON.stringify(emptyMatchReview());
    const atLimit = minimal + ' '.repeat(256 * 1024 - minimal.length);
    expect(reviewByteLength(atLimit)).toBe(256 * 1024);
    expect(parseMatchReview(atLimit).ok).toBe(true);
    const tooBig = atLimit + ' ';
    const parsed = parseMatchReview(tooBig);
    expect(parsed.ok).toBe(false);
    expect(parsed.raw).toBe(tooBig);
    expect(Object.hasOwn(parsed, 'draft')).toBe(false);
    const multiByte = JSON.stringify({ ...emptyMatchReview(), context: { ...emptyMatchReview().context, title: face.repeat(65536) } });
    expect(multiByte.length).toBeLessThan(256 * 1024);
    const unicodeResult = parseMatchReview(multiByte);
    expect(unicodeResult.ok).toBe(false);
    if (!unicodeResult.ok) expect(unicodeResult.error).toContain('256 KiB');
  });
});

describe('#257 editable semantic guidance', () => {
  it.each(['', '0:00', '05:09', '9999:59', '2:03:04', '123:59:59'])('accepts a recorded clock or unknown value %s', (time) => {
    expect(reviewTimeProblem(time)).toBeNull();
  });

  it.each(['-1:00', '1:60', '1:2', '1:02:60', ' 1:02', '文字', '1.5'])('flags a clock needing repair %s', (time) => {
    expect(reviewTimeProblem(time)).not.toBeNull();
  });

  it('handles calendar dates, leap days and unknown dates without accepting rollover dates', () => {
    for (const value of ['', '2024-02-29', '2026-10-20']) expect(reviewDateProblem(value)).toBeNull();
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '2026-10-20x']) expect(reviewDateProblem(value)).not.toBeNull();
  });

  it('only offers safe HTTP links while allowing a missing link', () => {
    for (const value of ['', 'https://www.youtube.com/watch?v=abc&t=20', 'http://example.com/review']) expect(reviewLinkProblem(value)).toBeNull();
    for (const value of [
      'javascript:alert(1)',
      'data:text/plain,hello',
      'file:///private',
      'ftp://example.com',
      'https://user:password@example.com',
      '//example.com',
      'https://',
      ' https://example.com',
      'https://exa\nmple.com',
    ])
      expect(reviewLinkProblem(value)).not.toBeNull();
  });
});

describe('#257 identities, conflict checks and selected output', () => {
  it('generates a free stable ID without rewriting existing event or attempt identities', () => {
    const rows = [{ id: 'event-1' }, { id: 'event-3' }];
    const before = structuredClone(rows);
    const generated = nextReviewId(rows, 'event');
    expect(rows.some((row) => row.id === generated)).toBe(false);
    expect(generated).toMatch(/^event-\d+$/);
    expect(nextReviewId([{ id: 'attempt-1' }], 'attempt')).not.toBe('attempt-1');
    expect(rows).toEqual(before);
  });

  it('moves one complete event without mixing its facts with adjacent events or mutating the original', () => {
    const draft = withRows();
    const before = structuredClone(draft);
    const second = draft.events[1]!;
    const moved = moveReviewEvent(draft, second.id, -1);
    expect(moved.events.map((row) => row.id)).toEqual(['event-2', 'event-1', 'event-3']);
    expect(moved.events[0]).toBe(second);
    expect(moved.events[0]!.visible).toBe('第二个事件事实');
    expect(moved.events[0]!.action).toBe('第二个行动');
    expect(moved.goal).toBe(draft.goal);
    expect(moved.attempts).toBe(draft.attempts);
    expect(draft).toEqual(before);
    expect(moveReviewEvent(draft, 'event-1', -1)).toBe(draft);
    expect(moveReviewEvent(draft, 'event-3', 1)).toBe(draft);
    expect(moveReviewEvent(draft, 'removed-event', 1)).toBe(draft);
    expect(roundTrip(moved).events[0]!.id).toBe('event-2');
  });

  it('uses compare-and-swap semantics so another tab or deletion cannot be silently overwritten', () => {
    expect(reviewSaveDecision(null, null, 'first-draft')).toBe('save');
    expect(reviewSaveDecision('old', 'old', 'new')).toBe('save');
    expect(reviewSaveDecision('old', 'other-tab', 'new')).toBe('conflict');
    expect(reviewSaveDecision('old', null, 'new')).toBe('conflict');
    expect(reviewSaveDecision(null, 'other-tab', 'new')).toBe('conflict');
    expect(reviewSaveDecision('old', 'new', 'new')).toBe('unchanged');
  });

  it('omits unselected private sections completely while backups retain the complete draft', () => {
    const draft = withRows();
    draft.context.title = 'PRIVATE_CONTEXT_TOKEN';
    draft.events[0]!.visible = 'PRIVATE_EVENT_TOKEN';
    draft.goal.action = 'PRIVATE_GOAL_TOKEN';
    draft.attempts[0]!.observation = 'PRIVATE_ATTEMPT_TOKEN';
    const tokens = { context: 'PRIVATE_CONTEXT_TOKEN', events: 'PRIVATE_EVENT_TOKEN', goal: 'PRIVATE_GOAL_TOKEN', attempts: 'PRIVATE_ATTEMPT_TOKEN' };
    for (const selected of ['context', 'events', 'goal', 'attempts'] as const) {
      draft.output = { context: false, events: false, goal: false, attempts: false, [selected]: true };
      const text = matchReviewSummary(draft);
      for (const [section, token] of Object.entries(tokens)) expect(text.includes(token), section + ' selected=' + selected).toBe(section === selected);
      const restored = roundTrip(draft);
      expect(restored.context.title).toBe('PRIVATE_CONTEXT_TOKEN');
      expect(restored.events[0]!.visible).toBe('PRIVATE_EVENT_TOKEN');
      expect(restored.goal.action).toBe('PRIVATE_GOAL_TOKEN');
      expect(restored.attempts[0]!.observation).toBe('PRIVATE_ATTEMPT_TOKEN');
    }
    draft.output = { context: false, events: false, goal: false, attempts: false };
    const text = matchReviewSummary(draft);
    for (const token of Object.values(tokens)) expect(text).not.toContain(token);
    expect(text).toContain('未选择任何输出区段');
  });

  it('distinguishes then-visible facts, later facts and unverified explanation in the output', () => {
    const draft = emptyMatchReview();
    draft.events = [{ ...emptyReviewEvent('event-1'), visible: '当时只看到一座建筑', revealed: '回看才看到另外一座', explanation: '尚需验证的解释' }];
    const text = matchReviewSummary(draft);
    expect(text).toContain('当时可见事实：当时只看到一座建筑');
    expect(text).toContain('回看新事实：回看才看到另外一座');
    expect(text).toContain('可能解释（未验证）：尚需验证的解释');
  });

  it('keeps all four user-reported results distinct and never computes a success rate', () => {
    const draft = emptyMatchReview();
    draft.attempts = (['unassessed', 'done', 'not-done', 'uncertain'] as const).map((result, index) => ({ ...emptyReviewAttempt('attempt-' + index), result }));
    const restored = roundTrip(draft);
    expect(restored.attempts.map((row) => row.result)).toEqual(['unassessed', 'done', 'not-done', 'uncertain']);
    expect(reviewResultLabels).toEqual({ unassessed: '未评估', done: '做到', 'not-done': '未做到', uncertain: '无法判断' });
    const text = matchReviewSummary(restored);
    expect(text).toContain('结果均为用户自报');
    for (const label of ['未评估', '做到', '未做到', '无法判断']) expect(text).toContain('自报结果：' + label);
    expect(text).not.toMatch(/\d+(?:\.\d+)?\s*%/);
    expect(text).not.toContain('成功率：');
    expect(text).not.toContain('已掌握');
  });
});
