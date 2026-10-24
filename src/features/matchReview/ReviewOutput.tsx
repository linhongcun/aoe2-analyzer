import type { RefObject } from 'react';
import { matchReviewSummary, type MatchReviewDraft, type ReviewOutput, type serializeMatchReview } from '../../domain/matchReview';
import { Icon } from '../../shared/ui/Icon';

const outputLabels: Record<keyof ReviewOutput, string> = { context: '对局上下文', events: '关键事件', goal: '下局目标', attempts: '跟进尝试' };

interface ReviewOutputProps {
  draft: MatchReviewDraft;
  apply: (change: (current: MatchReviewDraft) => MatchReviewDraft) => void;
  summary: string;
  summaryRef: RefObject<HTMLTextAreaElement>;
  copySummary: () => Promise<void>;
  backup: ReturnType<typeof serializeMatchReview>;
  rawDraft: string;
  downloadBackup: () => void;
  readFile: (file: File | undefined) => Promise<void>;
  restoreRaw: string;
  onRestoreRawChange: (raw: string) => void;
  inspectImport: () => void;
  importError: string;
  prepared: MatchReviewDraft | null;
  onUsePrepared: (draft: MatchReviewDraft) => void;
}

export function ReviewOutput({
  draft,
  apply,
  summary,
  summaryRef,
  copySummary,
  backup,
  rawDraft,
  downloadBackup,
  readFile,
  restoreRaw,
  onRestoreRawChange,
  inspectImport,
  importError,
  prepared,
  onUsePrepared,
}: ReviewOutputProps) {
  return (
    <>
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
          <textarea id="mr-import-text" rows={6} value={restoreRaw} onChange={(event) => onRestoreRawChange(event.target.value)} />
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
              <button type="button" onClick={() => onUsePrepared(prepared)}>
                使用此备份替换本页草稿
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
