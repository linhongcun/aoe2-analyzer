import {
  MATCH_REVIEW_LIMITS as limits,
  emptyReviewAttempt,
  emptyReviewEvent,
  hasReviewGoal,
  matchReviewContent,
  moveReviewEvent,
  nextReviewId,
  reviewDateProblem,
  reviewLinkProblem,
  reviewResultLabels,
  reviewTimeProblem,
  type MatchReviewDraft,
  type ReviewContext,
  type ReviewEvent,
  type ReviewGoal,
  type ReviewResult,
} from '../../domain/matchReview';
import { Icon } from '../../shared/ui/Icon';
import { Field } from './ReviewField';

const eventLabels: Record<keyof Omit<ReviewEvent, 'id'>, string> = {
  gameTime: '游戏时间',
  videoTime: '视频播放位置',
  visible: '当时可见事实',
  action: '当时行动',
  revealed: '回看新事实',
  explanation: '可能解释（未验证）',
  question: '未解问题',
};
const contextLabels: Record<keyof ReviewContext, string> = {
  title: '复盘标题',
  map: '地图',
  selfCiv: '本方文明',
  opponentCiv: '对方文明',
  gameVersion: '已知游戏版本',
  link: '比赛或视频链接',
};
const goalLabels: Record<keyof ReviewGoal, string> = { trigger: '触发情境', action: '想做的动作', evidence: '如何观察是否做到' };

interface ReviewEditorProps {
  draft: MatchReviewDraft;
  apply: (change: (current: MatchReviewDraft) => MatchReviewDraft) => void;
}

export function ReviewEditor({ draft, apply }: ReviewEditorProps) {
  const contextField = (key: keyof ReviewContext) => (
    <Field
      key={key}
      id={'mr-context-' + key}
      label={contextLabels[key]}
      value={draft.context[key]}
      limit={key === 'link' ? limits.link : limits.short}
      hint={key === 'link' ? '可留空；只打开完整 http/https 地址，不自动读取。' : '未知可留空。'}
      problem={key === 'link' ? reviewLinkProblem(draft.context.link) : null}
      onChange={(value) => apply((current) => ({ ...current, context: { ...current.context, [key]: value } }))}
    />
  );

  return (
    <>
      <section className="mr-panel" aria-labelledby="mr-context-heading">
        <h2 id="mr-context-heading">对局上下文</h2>
        <div className="mr-grid">{(Object.keys(contextLabels) as (keyof ReviewContext)[]).map(contextField)}</div>
        {draft.context.link && !reviewLinkProblem(draft.context.link) && (
          <a href={draft.context.link} target="_blank" rel="noopener noreferrer">
            打开已填写的比赛或视频链接
          </a>
        )}
      </section>
      <details className="mr-panel mr-prompts">
        <summary>选择一个观察方向，不必填满所有问题</summary>
        <div className="mr-grid">
          {matchReviewContent.groups.map((group) => (
            <article key={group.id}>
              <h3>{group.title}</h3>
              <ul>
                {group.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </details>
      <section className="mr-panel" aria-labelledby="mr-events-title">
        <div className="mr-section-head">
          <h2 id="mr-events-title">关键事件</h2>
          <span className="mr-number">{`${draft.events.length} / ${limits.events} 个`}</span>
        </div>
        <p>保留当时自己的视野，再补回看时发现的事实。推测单独写，未知时间留空。</p>
        {!draft.events.length && <p className="mr-empty">尚未记录事件。可以先写一个你想请别人帮忙解释的时刻。</p>}
        {draft.events.map((event, index) => (
          <fieldset key={event.id} className="mr-row" data-testid="review-event" data-event-id={event.id}>
            <legend>事件 {index + 1}</legend>
            <div className="mr-actions">
              <button
                type="button"
                disabled={index === 0}
                aria-label={'上移事件 ' + (index + 1)}
                onClick={() => apply((current) => moveReviewEvent(current, event.id, -1))}
              >
                <Icon name="arrow-up" />
                上移
              </button>
              <button
                type="button"
                disabled={index === draft.events.length - 1}
                aria-label={'下移事件 ' + (index + 1)}
                onClick={() => apply((current) => moveReviewEvent(current, event.id, 1))}
              >
                <Icon name="arrow-down" />
                下移
              </button>
              <button
                type="button"
                aria-label={'删除事件 ' + (index + 1)}
                onClick={() => apply((current) => ({ ...current, events: current.events.filter((item) => item.id !== event.id) }))}
              >
                删除此事件
              </button>
            </div>
            <div className="mr-grid">
              {(Object.keys(eventLabels) as (keyof Omit<ReviewEvent, 'id'>)[]).map((key) => {
                const clock = key === 'gameTime' || key === 'videoTime';
                return (
                  <Field
                    key={key}
                    id={'mr-event-' + event.id + '-' + key}
                    label={'事件 ' + (index + 1) + '：' + eventLabels[key]}
                    value={event[key]}
                    limit={clock ? limits.time : limits.long}
                    multiline={!clock}
                    hint={clock ? '分:秒 或 时:分:秒；两个时钟独立，不根据倍速换算。' : undefined}
                    problem={clock ? reviewTimeProblem(event[key]) : null}
                    onChange={(value) =>
                      apply((current) => ({ ...current, events: current.events.map((item) => (item.id === event.id ? { ...item, [key]: value } : item)) }))
                    }
                  />
                );
              })}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={draft.events.length >= limits.events}
          onClick={() => apply((current) => ({ ...current, events: [...current.events, emptyReviewEvent(nextReviewId(current.events, 'event'))] }))}
        >
          <Icon name="plus" />
          添加关键事件
        </button>
        {draft.events.length >= limits.events && (
          <p className="note" role="status">
            已达 8 个事件上限，可修改或删除已有事件。不会截断内容。
          </p>
        )}
      </section>
      <section className="mr-panel" aria-labelledby="mr-goal-title">
        <h2 id="mr-goal-title">唯一的下局目标</h2>
        <p>一次只选一个练习重点；也可以先不设目标。想做的动作和可观察标准分开写。</p>
        <div className="mr-grid">
          {(Object.keys(goalLabels) as (keyof ReviewGoal)[]).map((key) => (
            <Field
              key={key}
              id={'mr-goal-' + key}
              label={'目标：' + goalLabels[key]}
              value={draft.goal[key]}
              multiline
              onChange={(value) => apply((current) => ({ ...current, goal: { ...current.goal, [key]: value } }))}
            />
          ))}
        </div>
        {!hasReviewGoal(draft) && <p className="mr-empty">暂未设置目标。</p>}
        {!!draft.attempts.length && !hasReviewGoal(draft) && <p className="mr-warning">已有尝试但未写目标，记录保留；可以补充目标，网站不会推定你在练什么。</p>}
      </section>
      <section className="mr-panel" aria-labelledby="mr-attempts-title">
        <div className="mr-section-head">
          <h2 id="mr-attempts-title">跟进尝试</h2>
          <span className="mr-number">{`${draft.attempts.length} / ${limits.attempts} 次`}</span>
        </div>
        <p className="note">每次练习后自己记一条结果。</p>
        {draft.attempts.map((attempt, index) => (
          <fieldset key={attempt.id} className="mr-row" data-testid="review-attempt">
            <legend>尝试 {index + 1}</legend>
            <div className="mr-actions">
              <button
                type="button"
                aria-label={'删除尝试 ' + (index + 1)}
                onClick={() => apply((current) => ({ ...current, attempts: current.attempts.filter((item) => item.id !== attempt.id) }))}
              >
                删除此尝试
              </button>
            </div>
            <div className="mr-grid">
              <Field
                id={'mr-attempt-' + attempt.id + '-date'}
                label={'尝试 ' + (index + 1) + '：日期'}
                value={attempt.date}
                limit={limits.date}
                hint="YYYY-MM-DD；未知可留空。"
                problem={reviewDateProblem(attempt.date)}
                onChange={(value) =>
                  apply((current) => ({ ...current, attempts: current.attempts.map((item) => (item.id === attempt.id ? { ...item, date: value } : item)) }))
                }
              />
              <div className="mr-field">
                <label htmlFor={'mr-attempt-' + attempt.id + '-result'}>尝试 {index + 1}：自报结果</label>
                <select
                  id={'mr-attempt-' + attempt.id + '-result'}
                  value={attempt.result}
                  onChange={(event) => {
                    const result = event.target.value as ReviewResult;
                    apply((current) => ({ ...current, attempts: current.attempts.map((item) => (item.id === attempt.id ? { ...item, result } : item)) }));
                  }}
                >
                  {Object.entries(reviewResultLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {(['scene', 'observation'] as const).map((key) => (
                <Field
                  key={key}
                  id={'mr-attempt-' + attempt.id + '-' + key}
                  label={'尝试 ' + (index + 1) + '：' + (key === 'scene' ? '场景' : '观察')}
                  value={attempt[key]}
                  multiline
                  onChange={(value) =>
                    apply((current) => ({
                      ...current,
                      attempts: current.attempts.map((item) => (item.id === attempt.id ? { ...item, [key]: value } : item)),
                    }))
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
        {!draft.attempts.length && <p className="mr-empty">尚未记录尝试，可以在下次练习后自行填写。</p>}
        <button
          type="button"
          disabled={draft.attempts.length >= limits.attempts}
          onClick={() => apply((current) => ({ ...current, attempts: [...current.attempts, emptyReviewAttempt(nextReviewId(current.attempts, 'attempt'))] }))}
        >
          <Icon name="plus" />
          添加跟进尝试
        </button>
        {draft.attempts.length >= limits.attempts && (
          <p className="note" role="status">
            已达 8 次尝试上限，可以备份当前记录后另建复盘。
          </p>
        )}
      </section>
    </>
  );
}
