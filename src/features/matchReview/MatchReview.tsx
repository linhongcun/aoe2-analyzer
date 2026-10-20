import { useEffect, useReducer, useRef, useState } from 'react';
import {
  MATCH_REVIEW_LIMITS as limits,
  MATCH_REVIEW_STORAGE_KEY as storageKey,
  emptyMatchReview,
  emptyReviewAttempt,
  emptyReviewEvent,
  hasReviewGoal,
  matchReviewContent,
  matchReviewSummary,
  moveReviewEvent,
  nextReviewId,
  parseMatchReview,
  reviewDateProblem,
  reviewLinkProblem,
  reviewResultLabels,
  reviewSaveDecision,
  reviewTextLength,
  reviewTextProblem,
  reviewTimeProblem,
  serializeMatchReview,
  type MatchReviewDraft,
  type ReviewContext,
  type ReviewEvent,
  type ReviewGoal,
  type ReviewOutput,
  type ReviewResult,
} from '../../domain/matchReview';
import { Icon } from '../../shared/ui/Icon';
import { matchReviewDraftReducer } from './matchReviewDraftState';
import './matchReview.css';

type Lock = 'corrupt' | 'conflict' | null;
function loadInitial() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return { draft: emptyMatchReview(), raw, warning: '', lock: null as Lock };
    const parsed = parseMatchReview(raw);
    if (parsed.ok) return { draft: parsed.draft, raw, warning: '', lock: null as Lock };
    return {
      draft: emptyMatchReview(),
      raw,
      warning: '本机草稿损坏或版本不兼容。原始内容保留在恢复区，尚未覆盖；可以编辑本页并明确决定如何保存。',
      lock: 'corrupt' as Lock,
    };
  } catch {
    return { draft: emptyMatchReview(), raw: null, warning: '浏览器存储不可用。仍可编辑、备份和打印；当前内容没有保存到本机。', lock: null as Lock };
  }
}
interface FieldProps {
  id: string;
  label: string;
  value: string;
  limit?: number;
  multiline?: boolean;
  problem?: string | null;
  hint?: string;
  onChange: (value: string) => void;
}
function Field({ id, label, value, limit = limits.long, multiline = false, problem, hint, onChange }: FieldProps) {
  const error = reviewTextProblem(value, limit, multiline) ?? problem;
  const attributes = {
    id,
    value,
    'aria-invalid': !!error,
    'aria-describedby': id + '-help' + (error ? ' ' + id + '-error' : ''),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <div className="mr-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...attributes} rows={3} /> : <input {...attributes} type="text" autoComplete="off" />}
      <small id={id + '-help'}>
        {hint ? hint + ' ' : ''}
        <span className="mr-number">{`${reviewTextLength(value)} / ${limit}`}</span> 个字符
      </small>
      {error && (
        <p id={id + '-error'} className="mr-error">
          {error}
        </p>
      )}
    </div>
  );
}
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
const outputLabels: Record<keyof ReviewOutput, string> = { context: '对局上下文', events: '关键事件', goal: '下局目标', attempts: '跟进尝试' };

export default function MatchReview() {
  const [initial] = useState(loadInitial);
  const [draftState, dispatchDraft] = useReducer(matchReviewDraftReducer, { draft: initial.draft, beforeClear: null });
  const { draft, beforeClear } = draftState;
  const draftRef = useRef(draft);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const snapshot = useRef(initial.raw);
  const [lock, setLock] = useState<Lock>(initial.lock);
  const lockRef = useRef<Lock>(initial.lock);
  const [recoveryRaw, setRecoveryRaw] = useState(initial.lock ? (initial.raw ?? '') : '');
  const blockedSnapshot = useRef<string | null>(initial.raw);
  const [warning, setWarning] = useState(initial.warning);
  const [notice, setNotice] = useState(initial.raw && !initial.lock ? '已载入本机草稿。' : '开始编辑时保存；空白字段表示未记录。');
  const [restoreRaw, setRestoreRaw] = useState('');
  const [importError, setImportError] = useState('');
  const [prepared, setPrepared] = useState<MatchReviewDraft | null>(null);
  const importRevision = useRef(0);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const summary = matchReviewSummary(draft);
  const backup = serializeMatchReview(draft, true);
  const rawDraft = JSON.stringify(draft, null, 2);

  const block = (kind: Exclude<Lock, null>, raw: string | null, message: string) => {
    lockRef.current = kind;
    setLock(kind);
    blockedSnapshot.current = raw;
    setRecoveryRaw(raw ?? '');
    setWarning(message);
  };
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if ((event.key === storageKey || event.key === null) && event.storageArea === window.localStorage) {
        const raw = event.key === null ? null : event.newValue;
        if (raw !== snapshot.current) {
          lockRef.current = 'conflict';
          setLock('conflict');
          blockedSnapshot.current = raw;
          setRecoveryRaw(raw ?? '');
          setWarning('另一个标签修改或清除了本机草稿，自动保存已暂停。本页输入仍保留；请先备份，再明确选择重载或覆盖。');
        }
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);

  const persist = (next: MatchReviewDraft) => {
    const serialized = serializeMatchReview(next);
    if (!serialized.ok) {
      setWarning('当前修改未保存：' + serialized.error + ' 页面输入仍保留，可在备份区复制原始内容。');
      setNotice('本页已更新，当前修改未保存。');
      return false;
    }
    if (lockRef.current) {
      setNotice('本页已更新；本机保存仍暂停，输入没有丢弃。');
      return false;
    }
    try {
      const current = window.localStorage.getItem(storageKey);
      const decision = reviewSaveDecision(snapshot.current, current, serialized.raw);
      if (decision === 'conflict') {
        block('conflict', current, '本机草稿已被其他标签修改，自动保存暂停。本页输入仍保留；请备份后选择重载或覆盖。');
        setNotice('当前修改未保存到本机。');
        return false;
      }
      if (decision === 'save') window.localStorage.setItem(storageKey, serialized.raw);
      snapshot.current = serialized.raw;
      setWarning('');
      setNotice('草稿已保存到此浏览器。');
      return true;
    } catch {
      setWarning('浏览器存储不可用或容量不足，当前修改未保存。页面输入仍保留；请导出备份，关闭页面前不要依赖本机保存。');
      setNotice('本页已更新，当前修改未保存到本机。');
      return false;
    }
  };
  const apply = (change: (current: MatchReviewDraft) => MatchReviewDraft) => {
    const next = change(draftRef.current);
    draftRef.current = next;
    dispatchDraft({ type: 'edit', draft: next });
    persist(next);
  };
  const clearDraft = () => {
    const next = matchReviewDraftReducer(draftState, { type: 'clear' });
    draftRef.current = next.draft;
    dispatchDraft({ type: 'clear' });
    const saved = persist(next.draft);
    setNotice(saved ? '已清空，本机草稿已更新。' : '已清空本页；本机草稿未更新，请查看保存提示。');
    clearDialogRef.current?.close();
  };
  const undoClear = () => {
    if (!beforeClear) return;
    draftRef.current = beforeClear;
    dispatchDraft({ type: 'undo' });
    const saved = persist(beforeClear);
    setNotice(saved ? '已撤销清空，复盘草稿已恢复并保存到本机。' : '已撤销清空，本页内容已恢复；本机草稿未更新，请查看保存提示。');
    clearButtonRef.current?.focus();
  };
  const overwriteLocal = () => {
    const serialized = serializeMatchReview(draftRef.current);
    if (!serialized.ok) {
      setWarning('无法覆盖本机：' + serialized.error);
      return;
    }
    try {
      const current = window.localStorage.getItem(storageKey);
      if (current !== blockedSnapshot.current) {
        block('conflict', current, '本机内容再次变化，尚未覆盖。请先查看下方最新原始内容，再次决定。');
        return;
      }
      window.localStorage.setItem(storageKey, serialized.raw);
      snapshot.current = serialized.raw;
      lockRef.current = null;
      setLock(null);
      setWarning('');
      setRecoveryRaw('');
      setNotice('已按你的选择，用本页草稿替换本机草稿。');
    } catch {
      setWarning('覆盖失败，本页与原始内容均保留。请复制备份后再重试。');
    }
  };
  const reloadLocal = () => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw === null ? { ok: true as const, draft: emptyMatchReview() } : parseMatchReview(raw);
      if (!parsed.ok) {
        block('corrupt', raw, '最新本机草稿仍无效，本页输入没有替换。请查看或复制原始内容。');
        return;
      }
      draftRef.current = parsed.draft;
      dispatchDraft({ type: 'edit', draft: parsed.draft });
      snapshot.current = raw;
      lockRef.current = null;
      setLock(null);
      setWarning('');
      setRecoveryRaw('');
      setNotice('已按你的选择，读取本机最新草稿并替换本页。');
    } catch {
      setWarning('读取本机失败，本页输入保留。仍可复制备份和打印。');
    }
  };
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setNotice('已复制选定内容的求助摘要，由你自行分享。');
    } catch {
      setNotice('复制失败，请在摘要文本框中手动选择并复制；内容仍完整保留。');
      summaryRef.current?.focus();
      summaryRef.current?.select();
    }
  };
  const downloadBackup = () => {
    if (!backup.ok) {
      setNotice('备份尚不能导入：请修正上限/结构问题，或先复制下方原始内容。');
      return;
    }
    const url = URL.createObjectURL(new Blob([backup.raw], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aoe2-match-review-v1.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('已生成完整 JSON 备份；请确认文件保存在你的设备上。');
  };
  const inspectImport = () => {
    importRevision.current += 1;
    const result = parseMatchReview(restoreRaw);
    if (!result.ok) {
      setImportError(result.error);
      setPrepared(null);
      return;
    }
    setPrepared(result.draft);
    setImportError('');
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const revision = ++importRevision.current;
    setPrepared(null);
    setImportError('');
    if (file.size > limits.bytes) {
      setImportError('文件超过 256 KiB，未读取；当前草稿未替换。');
      return;
    }
    try {
      const raw = await file.text();
      if (revision !== importRevision.current) return;
      setRestoreRaw(raw);
      setPrepared(null);
      setImportError('文件内容已读到待恢复区，检查并预览后才会替换本页。');
    } catch {
      if (revision !== importRevision.current) return;
      setPrepared(null);
      setImportError('文件读取失败，当前草稿未替换。');
    }
  };
  const jumpTo = (id: string) => {
    const panel = document.getElementById(id);
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  };
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
    <section className="pane match-review-page" aria-labelledby="mr-title" data-testid="match-review-page">
      <div className="mr-screen">
        <header>
          <p className="note">把观察变成一个可验证的练习重点</p>
          <h1 id="mr-title">手填复盘与下局目标</h1>
          <p>{matchReviewContent.scope}</p>
          <p className="mr-boundary">{matchReviewContent.boundary}</p>
        </header>
        <div className="mr-panel mr-storage" aria-label="草稿保存状态">
          <p>草稿只保存在此浏览器的本机存储，不会上传。清除网站数据、换设备或存储被拒绝时，请使用 JSON 备份。</p>
          <div className="mr-actions">
            <button type="button" onClick={() => persist(draftRef.current)}>
              重试保存本页
            </button>
            <button
              type="button"
              ref={clearButtonRef}
              aria-haspopup="dialog"
              onClick={() => {
                clearDialogRef.current?.showModal();
                cancelClearRef.current?.focus();
              }}
            >
              清空本页内容
            </button>
            <button type="button" onClick={() => jumpTo('mr-backup')}>
              备份与恢复
            </button>
            <button type="button" onClick={() => jumpTo('mr-output')}>
              求助摘要与打印
            </button>
          </div>
          <dialog
            ref={clearDialogRef}
            className="mr-clear-dialog"
            aria-labelledby="mr-clear-title"
            aria-describedby="mr-clear-description"
            onClose={() => clearButtonRef.current?.focus()}
          >
            <h2 id="mr-clear-title">确认清空本页内容？</h2>
            <p id="mr-clear-description">将清除本页内容及本机保存的复盘草稿。本次页面会话内可撤销刚才的清空，刷新或离开后无法恢复；需要长期保留请先备份。</p>
            <div className="mr-actions">
              <button type="button" ref={cancelClearRef} onClick={() => clearDialogRef.current?.close()}>
                取消
              </button>
              <button type="button" onClick={clearDraft}>
                确认清空
              </button>
            </div>
          </dialog>
          {warning && (
            <p className="mr-warning" role="alert">
              {warning}
            </p>
          )}
          {lock && (
            <div className="mr-recovery">
              <p>以下为本机原始内容；不会自动与本页合并。可以先复制保存，再选择操作。</p>
              <label htmlFor="mr-recovery">本机原始内容（保存暂停）</label>
              <textarea id="mr-recovery" readOnly value={recoveryRaw} rows={4} />
              <div className="mr-actions">
                <button type="button" onClick={reloadLocal}>
                  读取本机并替换本页
                </button>
                <button type="button" onClick={overwriteLocal}>
                  保留本页并覆盖已显示的本机内容
                </button>
              </div>
            </div>
          )}
          <p role="status" className="mr-notice" aria-live="polite">
            {notice}
          </p>
          {beforeClear && (
            <div className="mr-notice mr-actions">
              <span>已清空。可恢复清空前内容，仅本次页面会话有效。</span>
              <button type="button" onClick={undoClear}>
                撤销
              </button>
            </div>
          )}
        </div>
        <section className="mr-panel" aria-labelledby="mr-context-heading">
          <h2 id="mr-context-heading">对局上下文</h2>
          <p className="note">适用于随机地图 1v1 的人工复盘。游戏版本由你记录；不默认认定录像使用本站数据版本。</p>
          <div className="mr-grid">{(Object.keys(contextLabels) as (keyof ReviewContext)[]).map(contextField)}</div>
          {draft.context.link && !reviewLinkProblem(draft.context.link) && (
            <a href={draft.context.link} target="_blank" rel="noopener noreferrer">
              打开已填写的比赛或视频链接
            </a>
          )}
        </section>
        <details className="mr-panel mr-prompts">
          <summary>选择一个观察方向，不必填满所有问题</summary>
          <p className="note">本站整理的可选引导。可以复盘胜局或败局，不预设你一定犯错，也不自动给出原因。</p>
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
          <p>一次只选一个练习重点；草稿也可以暂不设目标。把想做的动作与可观察标准分开，自报结果不等于水平提升。</p>
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
          {!!draft.attempts.length && !hasReviewGoal(draft) && (
            <p className="mr-warning">已有尝试但未写目标，记录保留；可以补充目标，网站不会推定你在练什么。</p>
          )}
        </section>
        <section className="mr-panel" aria-labelledby="mr-attempts-title">
          <div className="mr-section-head">
            <h2 id="mr-attempts-title">跟进尝试</h2>
            <span className="mr-number">{`${draft.attempts.length} / ${limits.attempts} 次`}</span>
          </div>
          <p className="note">结果由你手动记录；未评估和无法判断不会被自动算成失败，不展示成功率。</p>
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
        <section id="mr-output" tabIndex={-1} className="mr-panel" aria-labelledby="mr-output-title">
          <h2 id="mr-output-title">求助摘要与打印</h2>
          <p>勾选希望包含的区段。预览、复制与打印使用同一份内容；完整 JSON 备份始终包含所有草稿字段。</p>
          <div className="mr-output-choices">
            {(Object.keys(outputLabels) as (keyof ReviewOutput)[]).map((key) => (
              <label className="mr-check" key={key}>
                <input
                  type="checkbox"
                  checked={draft.output[key]}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    apply((current) => ({ ...current, output: { ...current.output, [key]: checked } }));
                  }}
                />
                包含{outputLabels[key]}
              </label>
            ))}
          </div>
          <div className="mr-actions">
            <button type="button" onClick={copySummary}>
              <Icon name="copy" />
              复制选定求助摘要
            </button>
            <button
              type="button"
              onClick={() => {
                summaryRef.current?.focus();
                summaryRef.current?.select();
              }}
            >
              手动选择摘要
            </button>
            <button type="button" onClick={() => window.print()}>
              <Icon name="printer" />
              打印选定内容
            </button>
          </div>
          <label htmlFor="mr-summary">选定内容的完整求助摘要</label>
          <textarea id="mr-summary" ref={summaryRef} readOnly value={summary} rows={12} />
          <details>
            <summary>查看完整静态预览</summary>
            <pre className="mr-summary">{summary}</pre>
          </details>
        </section>
        <section id="mr-backup" tabIndex={-1} className="mr-panel" aria-labelledby="mr-backup-title">
          <h2 id="mr-backup-title">完整备份与恢复</h2>
          <p>备份包含全部事件、单一目标、尝试和输出设置；最多 256 KiB。这里没有上传操作，文件在此浏览器中读取。</p>
          {!backup.ok && (
            <p className="mr-warning" role="alert">
              {backup.error} 下方仍提供当前原始内容，可先复制留存，修正后才能作为有效备份恢复。
            </p>
          )}
          <button type="button" disabled={!backup.ok} onClick={downloadBackup}>
            下载完整 JSON 备份
          </button>
          <details>
            <summary>复制完整 JSON 或当前原始内容</summary>
            <label htmlFor="mr-backup-text">完整草稿 JSON（含所有区段）</label>
            <textarea id="mr-backup-text" readOnly rows={8} value={backup.ok ? backup.raw : rawDraft} />
          </details>
          <div className="mr-import">
            <label htmlFor="mr-import-file">从本机 JSON 文件读取到待恢复区</label>
            <input
              id="mr-import-file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <label htmlFor="mr-import-text">待恢复 JSON</label>
            <textarea
              id="mr-import-text"
              rows={6}
              value={restoreRaw}
              onChange={(event) => {
                importRevision.current += 1;
                setRestoreRaw(event.target.value);
                setPrepared(null);
                setImportError('');
              }}
            />
            <button type="button" onClick={inspectImport}>
              检查备份并预览
            </button>
            {importError && (
              <p role="alert" className="mr-warning">
                {importError}
              </p>
            )}
            {prepared && (
              <div className="mr-import-preview" data-testid="review-import-preview">
                <h3>准备替换本页的备份</h3>
                <p>
                  标题：{prepared.context.title || '未记录'}；<span className="mr-number">{`${prepared.events.length} 个事件`}</span>、
                  <span className="mr-number">{`${prepared.attempts.length} 次尝试`}</span>。本页现有内容将被替换，请先备份。
                </p>
                <pre className="mr-summary">{matchReviewSummary(prepared)}</pre>
                <button
                  type="button"
                  onClick={() => {
                    const next = prepared;
                    setPrepared(null);
                    apply(() => next);
                  }}
                >
                  使用此备份替换本页草稿
                </button>
              </div>
            )}
          </div>
        </section>
        <details className="mr-panel">
          <summary>查看引导来源、核对日期与边界</summary>
          <p>
            核对日期：{matchReviewContent.checkedAt}。原始问题来自围绕 YouTube 学习的 Reddit 问答；没有读取 YouTube
            评论。引导是本站整理，不采用旧游戏数值或能力承诺。
          </p>
          <ul>
            {matchReviewContent.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <p className="note">{source.note}</p>
              </li>
            ))}
          </ul>
          <p>不上传或解析录像，不读取游戏、截图或视频，不自动统计闲置/APM/资源，不生成败因、最优打法或 Elo 评价。</p>
        </details>
      </div>
      <section className="mr-print" aria-label="选定内容打印稿" data-testid="review-print">
        <pre>{summary}</pre>
        {warning && <p>保存提醒：{warning}</p>}
      </section>
    </section>
  );
}
