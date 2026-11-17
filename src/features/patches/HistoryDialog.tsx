import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { SourceTime, UpdateText } from '../../shared/ui/CivUpdatePrimitives';
import { SOURCE_CATEGORY_LABELS, VERIFICATION_LABELS, safeHistorySourceUrl, type CivUpdatesData, type UpdateSourceEntry } from '../../domain/civUpdates';
import { PROCESSING_LABEL, PROVENANCE_LABEL, readerCoverage, readerProcessing, type HISTORY_TYPES } from '../../domain/historyReader';
import type { UpdateEntity } from '../../domain/civUpdates';
import type { UnitEventView } from '../../domain/unitUpdates';

export type DialogView = { kind: 'coverage' } | { kind: 'event'; view: UnitEventView };

export function HistoryDialog({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const top = useRef<HTMLButtonElement>(null);
  const bottom = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    element.showModal();
    top.current?.focus();
    return () => {
      root.style.overflow = overflow;
      if (element.open) element.close();
    };
  }, []);
  return (
    <dialog
      className="history-dialog"
      ref={dialog}
      aria-labelledby="history-dialog-title"
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        if (e.shiftKey && document.activeElement === top.current) {
          e.preventDefault();
          bottom.current?.focus();
        } else if (!e.shiftKey && document.activeElement === bottom.current) {
          e.preventDefault();
          top.current?.focus();
        }
      }}
    >
      <header>
        <div>
          <h2 id="history-dialog-title">{title}</h2>
          {subtitle && (
            <p>
              <UpdateText>{subtitle}</UpdateText>
            </p>
          )}
        </div>
        <button type="button" ref={top} onClick={close} aria-label="关闭">
          <Icon name="x" />
        </button>
      </header>
      <div className="history-dialog-body" role="region" aria-label={title + '内容'} tabIndex={0}>{children}</div>
      <footer>
        <span>关闭后继续阅读</span>
        <button type="button" ref={bottom} onClick={close}>
          关闭
        </button>
      </footer>
    </dialog>
  );
}

function SourceCard({ data, entry, children }: { data: CivUpdatesData; entry: UpdateSourceEntry; children?: ReactNode }) {
  const source = data.sources.find((s) => s.id === entry.sourceId);
  const section = data.sections.find((s) => s.id === entry.sectionId);
  const safe = safeHistorySourceUrl(source?.url ?? null);
  const url = safe && new URL(safe);
  if (url && section?.anchor) url.hash = section.anchor;
  return (
    <section className="history-source">
      <h3>
        {source?.title ?? '来源未登记'}
        {source && ' · ' + SOURCE_CATEGORY_LABELS[source.category]}
      </h3>
      {entry.originalText ? <blockquote>{entry.originalText}</blockquote> : <p>此来源未保存原文；本页不补写原文。</p>}
      <p>
        定位：<UpdateText>{entry.locator || '未登记'}</UpdateText>
        {section && ' · ' + section.title}
        {entry.group && ' · ' + entry.group}
      </p>
      <p>
        来源发布日期：
        <SourceTime value={section ? section.sourcePublishedAt : (source?.sourcePublishedAt ?? null)} />
      </p>
      {section && source?.sourcePublishedAt && source.sourcePublishedAt !== section.sourcePublishedAt && (
        <p>原页面发布日期：<SourceTime value={source.sourcePublishedAt} /></p>
      )}
      {url ? (
        <a href={url.href} target="_blank" rel="noopener noreferrer">
          <Icon name="external-link" />
          打开原始来源
        </a>
      ) : (
        <p>来源链接缺失；现有原文仍可阅读。</p>
      )}
      {children}
    </section>
  );
}

export function HistoryEvidence({ data, view }: { data: CivUpdatesData; view: UnitEventView }) {
  const claimIds = new Set(view.event.claims.filter((c) => c.effects.length).map((c) => c.id));
  const conflict = view.event.verification === 'conflict';
  const entries = new Map(data.sourceEntries.map((e) => [e.id, e]));
  return (
    <>
      <p>原文和事实核验分别保留。处理完成不代表事实已核实。</p>
      <p>{view.original.verificationNote}</p>
      {view.original.claims
        .filter((c) => claimIds.has(c.id) || conflict)
        .map((claim, i) => (
          <section key={claim.id}>
            <h3>
              {conflict ? (
                <>
                  说法 <span className="num nw">{i + 1}</span> ·{' '}
                </>
              ) : null}
              {VERIFICATION_LABELS[claim.verification]}
              {claim.verification === 'verified' && ' · 继承'}
            </h3>
            {!claimIds.has(claim.id) && <p>这方说法未能归属当前精确对象，保留原证据。</p>}
            <p>{claim.verificationNote}</p>
            {!claim.sourceEntryIds.length && <p>来源与原文未登记。</p>}
            {claim.sourceEntryIds.map((id) => {
              const entry = entries.get(id);
              return entry ? <SourceCard key={id} data={data} entry={entry} /> : <p key={id}>来源与原文未登记。</p>;
            })}
          </section>
        ))}
      {!!view.original.candidates.length && <p>同版候选记录的对应关系仍待核，不据此合并或判定冲突。</p>}
    </>
  );
}

type CoverageTab = 'current' | 'directory' | 'entries';
const COVERAGE_TABS: Record<CoverageTab, string> = { current: '当前对象', directory: '全部目录', entries: '逐条处置' };

export function HistoryCoverage({
  data,
  entity,
  views,
  locate,
  types,
}: {
  data: CivUpdatesData;
  entity: UpdateEntity | undefined;
  views: UnitEventView[];
  locate: (id: string) => void;
  types: typeof HISTORY_TYPES;
}) {
  const [tab, setTab] = useState<CoverageTab>(entity ? 'current' : 'directory');
  const [directory, setDirectory] = useState(entity?.type ?? 'civ');
  const [entry, setEntry] = useState<UpdateSourceEntry | null>(null);
  const originalTrigger = useRef<string>();
  const originalReturn = useRef<HTMLButtonElement>(null);
  const coverage = entity && readerCoverage(data, entity);
  const processing = entity ? readerProcessing(data, entity, views) : [];
  const own = processing.filter((r) => r.labels.includes('own'));
  const entryTitle = (id: string) =>
    views.find((v) => v.event.id === id)?.event.claims.flatMap((c) => c.effects.map((f) => ('attribute' in f ? f.attribute : f.text)))[0] ?? '对应变化';
  const sectionTitle = (id: string) => data.sections.find((s) => s.id === id)?.title;
  useLayoutEffect(() => {
    if (entry) originalReturn.current?.focus();
  }, [entry]);
  if (entry)
    return (
      <>
        <button
          ref={originalReturn}
          type="button"
          onClick={() => {
            setEntry(null);
            requestAnimationFrame(() => {
              if (originalTrigger.current) document.getElementById(originalTrigger.current)?.focus();
            });
          }}
        >
          返回逐条处置
        </button>
        <SourceCard data={data} entry={entry}>
          <p>
            {PROCESSING_LABEL[entry.processing]} · {entry.reason}
          </p>
        </SourceCard>
      </>
    );
  return (
    <>
      <p>部分收录；未收录不代表从未改动。</p>
      <div className="history-controls" aria-label="收录视图">
        {(Object.keys(COVERAGE_TABS) as CoverageTab[]).map((key) => (
          <button type="button" key={key} disabled={!entity && key !== 'directory'} aria-pressed={key === tab} onClick={() => setTab(key)}>
            {COVERAGE_TABS[key]}
          </button>
        ))}
      </div>
      {tab === 'current' && (
        <>
          <h3>
            {entity?.nameZh} · {coverage?.label ?? '来源状态未登记'}
          </h3>
          <p>{coverage?.reason}</p>
          <p>{views.length ? '已有共享关联记录。独立来源状态不代表游戏事实已核实。' : '没有收录此对象的变化；不代表它从未改动。'}</p>
          {!!coverage?.own.length && <p>自有章节：{coverage.own.map(sectionTitle).join('、')}</p>}
          {!!coverage?.related.length && <p>相关章节：{coverage.related.map(sectionTitle).join('、')}</p>}
          {!!own.length && (
            <p>
              自有章节处置：
              {(Object.keys(PROCESSING_LABEL) as (keyof typeof PROCESSING_LABEL)[]).map((key) => (
                <span key={key} className="num nw">
                  {PROCESSING_LABEL[key]} {own.filter((r) => r.entry.processing === key).length} 条{' '}
                </span>
              ))}
            </p>
          )}
          <div className="history-source">
            <h3>不同状态，不是同一种「没有历史」</h3>
            <p>未检查：尚未核对来源。缺页：未找到来源页面。</p>
            <p>读取失败：无法读取来源。已读无日志：页面已读，未发现更新日志。</p>
          </div>
        </>
      )}
      {tab === 'directory' && (
        <>
          <label>
            目录类型{' '}
            <select value={directory} onChange={(e) => setDirectory(e.target.value as UpdateEntity['type'])}>
              {Object.entries(types).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ul className="history-directory">
            {data.entities
              .filter((e) => e.type === directory)
              .map((e) => {
                const row = readerCoverage(data, e);
                return (
                  <li key={e.id}>
                    <strong>
                      {e.nameZh}
                      {e.status === 'retired' && '（退役）'}
                    </strong>{' '}
                    · {row?.label ?? '来源状态未登记'}
                    <p>{row?.reason}</p>
                  </li>
                );
              })}
          </ul>
        </>
      )}
      {tab === 'entries' && (
        <>
          <p>已关联、待核与排除是原文处理状态，不是事实核验。</p>
          {!processing.length && <p>尚无可显示的逐条处置。</p>}
          {processing.map(({ entry, labels, targets }) => (
            <section className="history-source" key={entry.id}>
              <p>
                <strong>{PROCESSING_LABEL[entry.processing]}</strong> · {labels.map((label) => PROVENANCE_LABEL[label]).join('、')} ·{' '}
                <UpdateText>{entry.locator}</UpdateText>
              </p>
              <p>{entry.reason}</p>
              <div className="history-controls">
                <button
                  id={'history-entry-original-' + entry.id}
                  type="button"
                  onClick={(event) => {
                    originalTrigger.current = event.currentTarget.id;
                    setEntry(entry);
                  }}
                >
                  查看原文
                </button>
                {targets.map((id) => (
                  <button type="button" key={id} onClick={() => locate(id)}>
                    定位：{entryTitle(id)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
