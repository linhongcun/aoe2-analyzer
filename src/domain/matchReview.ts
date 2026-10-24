import content from '../content/match-review.json';
import { hasExactKeys as exactKeys, isClockText, isRecord as record, textCharacterProblem, textLength } from './validate';

export const MATCH_REVIEW_STORAGE_KEY = 'aoe2-match-review-v1';
export const MATCH_REVIEW_LIMITS = { events: 8, attempts: 8, short: 120, long: 400, link: 2048, time: 32, date: 10, bytes: 256 * 1024 } as const;
export const matchReviewContent = content;
export const reviewResultLabels = { unassessed: '未评估', done: '做到', 'not-done': '未做到', uncertain: '无法判断' } as const;
export type ReviewResult = keyof typeof reviewResultLabels;
export interface ReviewContext {
  title: string;
  map: string;
  selfCiv: string;
  opponentCiv: string;
  gameVersion: string;
  link: string;
}
export interface ReviewEvent {
  id: string;
  gameTime: string;
  videoTime: string;
  visible: string;
  action: string;
  revealed: string;
  explanation: string;
  question: string;
}
export interface ReviewGoal {
  trigger: string;
  action: string;
  evidence: string;
}
export interface ReviewAttempt {
  id: string;
  date: string;
  scene: string;
  result: ReviewResult;
  observation: string;
}
export interface ReviewOutput {
  context: boolean;
  events: boolean;
  goal: boolean;
  attempts: boolean;
}
export interface MatchReviewDraft {
  version: 1;
  context: ReviewContext;
  events: ReviewEvent[];
  goal: ReviewGoal;
  attempts: ReviewAttempt[];
  output: ReviewOutput;
}
export type ReviewValidation = { ok: true; draft: MatchReviewDraft } | { ok: false; error: string };
export type ReviewParse = ReviewValidation & { raw: string };

export function emptyMatchReview(): MatchReviewDraft {
  return {
    version: 1,
    context: { title: '', map: '', selfCiv: '', opponentCiv: '', gameVersion: '', link: '' },
    events: [],
    goal: { trigger: '', action: '', evidence: '' },
    attempts: [],
    output: { context: true, events: true, goal: true, attempts: true },
  };
}
export function emptyReviewEvent(id: string): ReviewEvent {
  return { id, gameTime: '', videoTime: '', visible: '', action: '', revealed: '', explanation: '', question: '' };
}
export function emptyReviewAttempt(id: string): ReviewAttempt {
  return { id, date: '', scene: '', result: 'unassessed', observation: '' };
}
export function nextReviewId(rows: readonly { id: string }[], prefix: 'event' | 'attempt'): string {
  let n = 1;
  while (rows.some((row) => row.id === prefix + '-' + n)) n += 1;
  return prefix + '-' + n;
}
export const reviewTextLength = (value: string): number => textLength(value, 'code-points');
export const reviewByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

export function reviewTextProblem(value: string, limit: number, multiline = false): string | null {
  if (reviewTextLength(value) > limit) return '最多 ' + limit + ' 个字符；当前内容未截断，请缩短。';
  const problem = textCharacterProblem(value, { multiline, rejectUnpairedSurrogates: true, rejectDirectionalMarks: true });
  if (problem === 'unicode') return '含不完整的 Unicode 字符，请修正。';
  if (problem === 'control') return '不能包含隐藏控制字符；长文仅允许换行和制表符。';
  return null;
}
export function reviewTimeProblem(value: string): string | null {
  if (!value) return null;
  return isClockText(value, { minuteDigits: 4, hourDigits: 3 }) ? null : '使用 分:秒 或 时:分:秒；未知请留空。原文已保留。';
}
export function reviewDateProblem(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '使用真实日期 YYYY-MM-DD；未知请留空。';
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? null : '该日期不存在，原文已保留。';
}
export function reviewLinkProblem(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return value === value.trim() &&
      !reviewTextProblem(value, MATCH_REVIEW_LIMITS.link) &&
      ['https:', 'http:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
      ? null
      : '链接需为不含账号口令的完整 http/https 地址；原文保留，不会打开。';
  } catch {
    return '链接需为完整 http/https 地址；原文保留，不会打开。';
  }
}
export const hasReviewGoal = (draft: MatchReviewDraft): boolean => Object.values(draft.goal).some(Boolean);

function textRecord(value: unknown, fields: Record<string, { limit: number; multiline?: boolean }>, label: string): string | null {
  if (!record(value) || !exactKeys(value, Object.keys(fields))) return label + '字段缺失或含未知字段。';
  for (const [name, rule] of Object.entries(fields)) {
    const text = value[name];
    if (typeof text !== 'string') return label + '的 ' + name + ' 必须为文本。';
    const error = reviewTextProblem(text, rule.limit, rule.multiline);
    if (error) return label + '的 ' + name + '：' + error;
  }
  return null;
}
const short = { limit: MATCH_REVIEW_LIMITS.short };
const long = { limit: MATCH_REVIEW_LIMITS.long, multiline: true };
const time = { limit: MATCH_REVIEW_LIMITS.time };
const id = { limit: 64 };
const eventFields = { id, gameTime: time, videoTime: time, visible: long, action: long, revealed: long, explanation: long, question: long };
const attemptFields = { id, date: { limit: MATCH_REVIEW_LIMITS.date }, scene: long, observation: long };
const invalid = (error: string): ReviewValidation => ({ ok: false, error });

/** Structure and capacity are strict. Editable semantic mistakes are preserved. */
export function validateMatchReview(value: unknown): ReviewValidation {
  if (!record(value) || !exactKeys(value, ['version', 'context', 'events', 'goal', 'attempts', 'output']) || value.version !== 1)
    return invalid('备份结构损坏、含未知字段或版本不兼容；当前草稿未被替换。');
  const contextError = textRecord(
    value.context,
    { title: short, map: short, selfCiv: short, opponentCiv: short, gameVersion: short, link: { limit: MATCH_REVIEW_LIMITS.link } },
    '上下文',
  );
  if (contextError) return invalid(contextError);
  const goalError = textRecord(value.goal, { trigger: long, action: long, evidence: long }, '单一目标');
  if (goalError) return invalid(goalError);
  if (!Array.isArray(value.events) || value.events.length > MATCH_REVIEW_LIMITS.events) return invalid('最多保存 8 个关键事件。');
  if (!Array.isArray(value.attempts) || value.attempts.length > MATCH_REVIEW_LIMITS.attempts) return invalid('最多保存 8 次跟进尝试。');
  for (const [index, entry] of value.events.entries()) {
    const error = textRecord(entry, eventFields, '事件 ' + (index + 1));
    if (error) return invalid(error);
  }
  for (const [index, entry] of value.attempts.entries()) {
    if (!record(entry) || !exactKeys(entry, [...Object.keys(attemptFields), 'result'])) return invalid('尝试 ' + (index + 1) + ' 字段不完整或含未知字段。');
    const { result, ...texts } = entry;
    const error = textRecord(texts, attemptFields, '尝试 ' + (index + 1));
    if (error) return invalid(error);
    if (typeof result !== 'string' || !Object.hasOwn(reviewResultLabels, result)) return invalid('尝试结果不在支持的自报状态中。');
  }
  for (const [name, rows] of [
    ['事件', value.events],
    ['尝试', value.attempts],
  ] as const) {
    const ids = rows.map((row) => (row as { id: string }).id);
    if (new Set(ids).size !== ids.length || ids.some((key) => !/^[A-Za-z0-9_-]{1,64}$/.test(key)))
      return invalid(name + ' ID 必须唯一，且仅含字母、数字、横线或下划线。');
  }
  if (
    !record(value.output) ||
    !exactKeys(value.output, ['context', 'events', 'goal', 'attempts']) ||
    Object.values(value.output).some((item) => typeof item !== 'boolean')
  )
    return invalid('输出区段设置损坏。');
  try {
    if (reviewByteLength(JSON.stringify(value)) > MATCH_REVIEW_LIMITS.bytes) return invalid('草稿超过 256 KiB，请减少内容；没有截断。');
  } catch {
    return invalid('草稿无法序列化。');
  }
  return { ok: true, draft: value as unknown as MatchReviewDraft };
}
export function parseMatchReview(raw: string): ReviewParse {
  if (raw.length > MATCH_REVIEW_LIMITS.bytes || reviewByteLength(raw) > MATCH_REVIEW_LIMITS.bytes)
    return { ok: false, error: '备份超过 256 KiB，未读取也未替换当前草稿。', raw };
  try {
    return { ...validateMatchReview(JSON.parse(raw) as unknown), raw };
  } catch {
    return { ok: false, error: '备份不是有效 JSON；当前草稿未被替换。', raw };
  }
}
export function serializeMatchReview(value: unknown, pretty = false): { ok: true; raw: string } | { ok: false; error: string } {
  const validation = validateMatchReview(value);
  if (!validation.ok) return validation;
  const raw = JSON.stringify(validation.draft, null, pretty ? 2 : undefined);
  if (reviewByteLength(raw) > MATCH_REVIEW_LIMITS.bytes) return { ok: false, error: '格式化备份超过 256 KiB；内容未截断。' };
  return { ok: true, raw };
}
export function reviewSaveDecision(expected: string | null, current: string | null, next: string): 'save' | 'unchanged' | 'conflict' {
  if (current === next) return 'unchanged';
  return current === expected ? 'save' : 'conflict';
}
export function moveReviewEvent(draft: MatchReviewDraft, eventId: string, direction: -1 | 1): MatchReviewDraft {
  const index = draft.events.findIndex((event) => event.id === eventId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.events.length) return draft;
  const events = [...draft.events];
  [events[index], events[target]] = [events[target]!, events[index]!];
  return { ...draft, events };
}
const shown = (text: string): string => text || '未记录';
export function matchReviewSummary(draft: MatchReviewDraft): string {
  const lines = ['手填复盘与下局目标', '范围：随机地图 1v1；内容为用户手填，不自动判定败因或能力。'];
  if (draft.output.context) {
    lines.push(
      '',
      '对局上下文',
      '标题：' + shown(draft.context.title),
      '地图：' + shown(draft.context.map),
      '本方文明：' + shown(draft.context.selfCiv),
      '对方文明：' + shown(draft.context.opponentCiv),
      '游戏版本：' + shown(draft.context.gameVersion),
      '比赛或视频链接：' + shown(draft.context.link),
    );
    if (reviewLinkProblem(draft.context.link)) lines.push('链接格式待修正，以上仅为原始文本。');
  }
  if (draft.output.events) {
    lines.push('', '关键事件（按用户排列）');
    if (!draft.events.length) lines.push('尚未记录关键事件。');
    draft.events.forEach((event, index) => {
      lines.push(
        '',
        '事件 ' + (index + 1),
        '游戏时间：' + shown(event.gameTime) + (reviewTimeProblem(event.gameTime) ? '（格式待修正）' : ''),
        '视频播放位置：' + shown(event.videoTime) + (reviewTimeProblem(event.videoTime) ? '（格式待修正）' : ''),
        '当时可见事实：' + shown(event.visible),
        '当时行动：' + shown(event.action),
        '回看新事实：' + shown(event.revealed),
        '可能解释（未验证）：' + shown(event.explanation),
        '未解问题：' + shown(event.question),
      );
    });
  }
  if (draft.output.goal) {
    lines.push('', '唯一的下局目标');
    if (!hasReviewGoal(draft)) lines.push('暂未设置目标。');
    else lines.push('触发情境：' + shown(draft.goal.trigger), '想做的动作：' + shown(draft.goal.action), '如何观察是否做到：' + shown(draft.goal.evidence));
  }
  if (draft.output.attempts) {
    lines.push('', '跟进尝试（结果均为用户自报）');
    if (!draft.attempts.length) lines.push('尚未记录尝试。');
    draft.attempts.forEach((attempt, index) => {
      lines.push(
        '',
        '尝试 ' + (index + 1),
        '日期：' + shown(attempt.date) + (reviewDateProblem(attempt.date) ? '（格式待修正）' : ''),
        '场景：' + shown(attempt.scene),
        '自报结果：' + reviewResultLabels[attempt.result],
        '观察：' + shown(attempt.observation),
      );
    });
  }
  if (!Object.values(draft.output).some(Boolean)) lines.push('', '未选择任何输出区段。');
  lines.push(
    '',
    '说明：未知不等于 0；回看全知信息不代表当时可见。游戏时间与视频时间分别记录。自报做到不证明能力或胜率提升。',
    '引导文字由本站整理；来源与核对说明见本站手填复盘页面。',
  );
  return lines.join('\n');
}
