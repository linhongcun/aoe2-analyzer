import { useEffect, useReducer, useRef, useState } from 'react';
import {
  MATCH_REVIEW_LIMITS as limits,
  MATCH_REVIEW_STORAGE_KEY as storageKey,
  emptyMatchReview,
  matchReviewSummary,
  parseMatchReview,
  reviewSaveDecision,
  serializeMatchReview,
  type MatchReviewDraft,
} from '../../domain/matchReview';
import { useShareLink } from '../../shared/ui/useShareLink';
import { matchReviewDraftReducer } from './matchReviewDraftState';
import { ReviewEditor } from './ReviewEditor';
import { ReviewOutput } from './ReviewOutput';
import { ReviewSources } from './ReviewSources';
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
  const [notice, updateNotice] = useState(initial.raw && !initial.lock ? '已载入本机草稿。' : '开始编辑时保存；空白字段表示未记录。');
  const [restoreRaw, setRestoreRaw] = useState('');
  const [importError, setImportError] = useState('');
  const [prepared, setPrepared] = useState<MatchReviewDraft | null>(null);
  const importRevision = useRef(0);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const summary = matchReviewSummary(draft);
  const backup = serializeMatchReview(draft, true);
  const rawDraft = JSON.stringify(draft, null, 2);
  const {
    copy: copyText,
    status: copyNotice,
    reset: resetCopy,
    statusProps,
  } = useShareLink({
    stateKey: rawDraft,
    successMessage: '已复制选定内容的求助摘要，由你自行分享。',
    failureMessage: '复制失败，请在摘要文本框中手动选择并复制；内容仍完整保留。',
  });
  const setNotice = (message: string) => {
    resetCopy();
    updateNotice(message);
  };

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
    if ((await copyText(summary)) === 'manual') {
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

  return (
    <section className="pane match-review-page" aria-labelledby="mr-title" data-testid="match-review-page">
      <div className="mr-screen">
        <header>
          <p className="note">把观察变成一个可验证的练习重点</p>
          <h1 id="mr-title">手填复盘与下局目标</h1>
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
          <p className="mr-notice" {...statusProps}>
            {copyNotice || notice}
          </p>
          {beforeClear && (
            <div className="mr-notice mr-actions">
              <span>可恢复清空前内容；开始输入新内容后不再提供，仅本次页面会话有效。</span>
              <button type="button" onClick={undoClear}>
                撤销
              </button>
            </div>
          )}
        </div>
        <ReviewEditor draft={draft} apply={apply} />
        <ReviewOutput
          draft={draft}
          apply={apply}
          summary={summary}
          summaryRef={summaryRef}
          copySummary={copySummary}
          backup={backup}
          rawDraft={rawDraft}
          downloadBackup={downloadBackup}
          readFile={readFile}
          restoreRaw={restoreRaw}
          onRestoreRawChange={(raw) => {
            importRevision.current += 1;
            setRestoreRaw(raw);
            setPrepared(null);
            setImportError('');
          }}
          inspectImport={inspectImport}
          importError={importError}
          prepared={prepared}
          onUsePrepared={(next) => {
            setPrepared(null);
            apply(() => next);
          }}
        />
        <ReviewSources />
      </div>
      <section className="mr-print" aria-label="选定内容打印稿" data-testid="review-print">
        <pre>{summary}</pre>
        {warning && <p>保存提醒：{warning}</p>}
      </section>
    </section>
  );
}
