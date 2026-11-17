import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import { VERIFICATION_LABELS, type CivUpdatesData, type UpdateEntity } from '../../domain/civUpdates';
import {
  HISTORY_FILTERS,
  HISTORY_LABELS,
  HISTORY_TYPES,
  filterReaderEvents,
  historyReaderPath,
  projectReaderEvents,
  readerCoverage,
  readerEntity,
  readerFilters,
  readerNodes,
  readerReturn,
  readerScopePending,
  relatedReaderEntities,
  revealReaderEvent,
  type HistoryFilter,
} from '../../domain/historyReader';
import type { UnitEventView } from '../../domain/unitUpdates';
import { SourceTime, UpdateText } from '../../shared/ui/CivUpdatePrimitives';
import { HistoryEffect } from '../../shared/ui/HistoryEffect';
import { canPopHistoryReturn, HistoryReaderLink, historyVisitKey, rememberHistoryVisit, savedHistoryVisit } from '../../shared/ui/HistoryReaderLink';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import { HistoryCoverage, HistoryDialog, HistoryEvidence, type DialogView } from './HistoryDialog';
import { ObjectPicker, ReaderFilters } from './HistoryReaderFilters';
import './history-reader.css';

const CHANNEL = { release: '正式版', pup: '公开预览', hotfix: '热修', unknown: '类别未知' } as const;
const RELATION = { direct: '本对象变化', related: '相关变化', 'identity-pending': '身份待核', provider: '提供者' } as const;
const headingId = 'history-page-title';
const nodeId = (id: string) => 'history-node-' + id;
const eventKey = (id: string) => 'history-event-' + id;

function EventCard({
  data,
  entity,
  view,
  from,
  expanded,
  evidence,
}: {
  data: CivUpdatesData;
  entity: UpdateEntity;
  view: UnitEventView;
  from: string;
  expanded: string[];
  evidence: (button: HTMLButtonElement) => void;
}) {
  const { event, original } = view;
  const related = relatedReaderEntities(data, view, entity.id);
  const conflict = event.verification === 'conflict';
  const claims = conflict ? original.claims : event.claims.filter((c) => c.effects.length);
  const title = claims
    .flatMap((c) => event.claims.find((a) => a.id === c.id)?.effects ?? [])
    .map((effect) =>
      'attribute' in effect
        ? effect.attribute
        : effect.type === 'rename'
          ? '名称变化'
          : effect.type === 'availability'
            ? '可用性'
            : effect.type === 'lifecycle'
              ? '收录时期'
              : '机制调整',
    );
  const effectIds = new Set(event.claims.flatMap((c) => c.effects.map((f) => f.id)));
  const relations = view.relations.filter((r) => r.effectIds.some((id) => effectIds.has(id)));
  const civRelations = entity.type === 'civ' ? original.civRelations.filter((r) => r.civId === entity.catalogId) : [];
  return (
    <article className="history-event" id={eventKey(event.id)} tabIndex={-1} data-history-event={event.id}>
      <header>
        <h3>{[...new Set(title)].join('、') || '历史变化'}</h3>
        <span>{VERIFICATION_LABELS[event.verification]}</span>
      </header>
      {[...relations, ...civRelations].map((relation, i) => (
        <p className="history-muted" key={i}>
          {RELATION[relation.relation]} · <UpdateText>{relation.note}</UpdateText>
        </p>
      ))}
      {claims.map((claim, index) => {
        const effects = event.claims.find((c) => c.id === claim.id)?.effects ?? [];
        return (
          <section className="history-claim" key={claim.id}>
            {conflict && (
              <h4>
                说法 <span className="num nw">{index + 1}</span> · {VERIFICATION_LABELS[claim.verification]}
              </h4>
            )}
            {!effects.length && <p>无法归属当前精确对象；依据中保留此方原证据。</p>}
            <ul className="civ-update-effects">
              {effects.map((effect) => (
                <li key={effect.id}>
                  <HistoryEffect data={data} effect={effect} fallbackScope={original.scope} />
                  {readerScopePending(view, effect, entity) && <p className="history-muted">适用范围待核</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="history-controls">
        <button type="button" onClick={(e) => evidence(e.currentTarget)}>
          依据与原文
        </button>
        {related.length > 0 && (
          <details>
            <summary>继续阅读</summary>
            <ul>
              {related.map((other) => {
                const id = 'history-related-' + event.id + '-' + other.id;
                const includes = projectReaderEvents(data, other).some((v) => v.event.id === event.id);
                return (
                  <li key={other.id}>
                    <HistoryReaderLink
                      id={id}
                      expanded={expanded}
                      from={from}
                      to={historyReaderPath(other.id, undefined, includes ? event.id : undefined, from)}
                    >
                      {other.nameZh} · {HISTORY_TYPES[other.type]}
                      {other.status === 'retired' && '（退役）'}
                    </HistoryReaderLink>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

function ReaderContent({ data, active }: { data: CivUpdatesData; active: boolean }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const type = useNavigationType();
  const navigate = useNavigate();
  const entity = readerEntity(data, params);
  const hasObject = params.has('obj') || params.has('histEntity');
  const rawReturn = params.getAll('histReturn');
  const back = rawReturn.length === 1 ? readerReturn(data, rawReturn[0]!) : null;
  const { valid, invalid } = readerFilters(data, params);
  const projected = useMemo(() => (entity ? projectReaderEvents(data, entity) : []), [data, entity]);
  const visible = filterReaderEvents(data, projected, valid);
  const nodes = readerNodes(data, visible, valid.get('histOrder') === 'oldest');
  const rawEvent = params.getAll('histEvent');
  const target = rawEvent.length === 1 ? projected.find((row) => row.event.id === rawEvent[0]) : undefined;
  const targetVisible = target && visible.some((row) => row.event.id === target.event.id);
  const saved = type === 'POP' ? savedHistoryVisit(location) : undefined;
  const visitKey = historyVisitKey(location);
  const initial = () => saved?.expanded ?? (targetVisible ? [target.event.versionId ?? 'unknown'] : !rawEvent.length && nodes[0] ? [nodes[0].id] : []);
  const [expansion, setExpansion] = useState<{ key: string; ids: string[] }>({ key: visitKey, ids: initial() });
  const expanded = expansion.key === visitKey ? expansion.ids : initial();
  const visit = useRef(expanded);
  useLayoutEffect(() => { visit.current = expanded; }, [expanded]);
  const [dialog, setDialog] = useState<DialogView | null>(null);
  const [located, setLocated] = useState<string>();
  const [dismissed, setDismissed] = useState<string>();
  const trigger = useRef<{ button: HTMLButtonElement; event?: string; y: number } | null>(null);
  const sharePath = entity ? historyReaderPath(entity.id, valid, located ?? target?.event.id) : '/patches';
  const share = useShareLink({ stateKey: sharePath, successMessage: '分享链接已复制。' });
  const focus = (id: string) => document.getElementById(id)?.focus({ preventScroll: true });
  useLayoutEffect(() => {
    if (!active) return;
    const heading = document.getElementById(headingId);
    const frame = requestAnimationFrame(() => {
      if (saved) {
        if (saved.focusId) {
          const target = document.getElementById(saved.focusId);
          if (target instanceof HTMLElement) {
            if (target.closest('details')) target.closest('details')!.open = true;
            target.focus({ preventScroll: true });
          }
        }
        window.scrollTo(0, saved.y);
      } else if (targetVisible) {
        const element = document.getElementById(eventKey(target.event.id));
        element?.scrollIntoView({ block: 'start' });
        element?.focus({ preventScroll: true });
      } else if (rawEvent.length) {
        focus('history-target-warning');
      } else if (type !== 'POP' && !location.state?.historyKeepFocus && !heading?.closest('[hidden]')) {
        heading?.focus({ preventScroll: true });
      }
    });
    const capture = () =>
      rememberHistoryVisit(location, {
        y: window.scrollY,
        expanded: visit.current,
        focusId: document.activeElement instanceof HTMLElement ? document.activeElement.id || undefined : undefined,
      });
    window.addEventListener('scroll', capture, { passive: true });
    document.addEventListener('focusin', capture);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', capture);
      document.removeEventListener('focusin', capture);
    };
    // An entry's initial focus must not run again when a node toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visitKey]);
  function updateExpanded(ids: string[]) {
    setExpansion({ key: visitKey, ids });
    rememberHistoryVisit(location, { expanded: ids, y: window.scrollY });
  }
  useLayoutEffect(() => {
    if (!entity || !params.has('histEntity')) return;
    const next = new URLSearchParams(params);
    next.delete('histEntity');
    next.set('obj', entity.id.replace('/', ':'));
    setParams(next, { replace: true, state: location.state });
  }, [entity, location.state, params, setParams]);
  const origin = entity ? historyReaderPath(entity.id, valid, target?.event.id) : '/patches';
  const apply = (next: URLSearchParams, preserveTarget = false) => {
    const address = entity ? historyReaderPath(entity.id, next, preserveTarget ? target?.event.id : undefined, back ?? undefined) : '/patches';
    navigate(address, { state: { ...location.state, historyKeepFocus: !preserveTarget }, replace: true });
    setLocated(undefined);
  };
  const close = (id?: string) => {
    setDialog(null);
    if (id) {
      setLocated(id);
      const row = visible.find((v) => v.event.id === id);
      if (row) updateExpanded([...new Set([...expanded, row.event.versionId ?? 'unknown'])]);
      requestAnimationFrame(() => {
        const element = document.getElementById(row ? eventKey(id) : 'history-target-warning');
        element?.scrollIntoView({ block: 'nearest' });
        element?.focus({ preventScroll: true });
      });
      return;
    }
    requestAnimationFrame(() => {
      if (trigger.current?.button.isConnected) trigger.current.button.focus({ preventScroll: true });
      else {
        const node = projected.find((row) => row.event.id === trigger.current?.event)?.event.versionId ?? 'unknown';
        focus(trigger.current?.event && document.getElementById(nodeId(node)) ? nodeId(node) : headingId);
      }
      if (trigger.current) window.scrollTo(0, trigger.current.y);
    });
  };
  const locationTarget = projected.find((v) => v.event.id === (located ?? target?.event.id));
  const hiddenTarget = locationTarget && !visible.some((v) => v.event.id === locationTarget.event.id) ? locationTarget : undefined;
  const recovery = hiddenTarget && revealReaderEvent(data, hiddenTarget, valid);
  const coverage = entity && readerCoverage(data, entity);
  const showWarning = dismissed !== visitKey && (!!hiddenTarget || (!!rawEvent.length && !target));
  return (
    <>
      <ObjectPicker
        key={entity?.id ?? 'browse'}
        entities={data.entities}
        choose={(selected) => {
          setLocated(undefined);
          navigate(historyReaderPath(selected.id));
        }}
      />
      <div className="history-controls">
        <button
          type="button"
          onClick={(e) => {
            trigger.current = { button: e.currentTarget, y: window.scrollY };
            setDialog({ kind: 'coverage' });
          }}
        >
          <Icon name="info" />
          收录说明
        </button>
        {back && (
          <Link
            to={back}
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && canPopHistoryReturn(location.state, back)) {
                e.preventDefault();
                navigate(-1);
              }
            }}
          >
            返回来处
          </Link>
        )}
        {entity && (
          <button type="button" onClick={() => void share.copy(new URL('#' + sharePath, window.location.href).href)}>
            复制链接
          </button>
        )}
      </div>
      {invalid.length > 0 && (
        <div role="alert" className="history-notice">
          以下条件无效：{invalid.map((k) => HISTORY_LABELS[k as HistoryFilter] ?? '排序').join('、')}。
          <button type="button" onClick={() => apply(valid, true)}>
            移除无效条件
          </button>
        </div>
      )}
      {!!rawReturn.length && !back && (
        <div className="history-notice">
          <p role="status">返回地址不可用，仍可阅读当前历史。</p>
          <Link to="/patches">返回更新历史</Link>
        </div>
      )}
      {hasObject && !entity && (
        <div className="history-notice" role="alert">
          找不到对象，或链接包含多个对象。请明确选择一个精确身份。
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('obj');
              next.delete('histEntity');
              next.delete('histEvent');
              next.delete('histReturn');
              setParams(next);
            }}
          >
            重新选择对象
          </button>
        </div>
      )}
      <div {...share.statusProps}>{share.status}</div>
      {share.manualLink && (
        <label>
          手动复制链接 <input readOnly value={share.manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {!entity && !hasObject && <p>先选一个对象，查看它的变化。支持文明、单位、建筑与科技，也可按版本阅读。</p>}
      {entity && (
        <section className="history-selection" aria-label="对象时间线" data-testid="patch-object">
          <h2>
            {entity.nameZh}
            {entity.status === 'retired' && '（退役）'}
          </h2>
          <p>
            {HISTORY_TYPES[entity.type]} · {entity.nameEn && entity.nameEn + ' · '}
            <span className="num nw">ID {entity.catalogId}</span>
          </p>
          {entity.status === 'retired' && <p>{entity.identityNote}</p>}
          <p className="history-muted">部分收录 · {coverage?.label ?? '来源状态未登记'}</p>
          <ReaderFilters data={data} views={projected} query={valid} apply={apply} />
          <p role="status">
            显示{' '}
            <span className="num nw">
              {visible.length} / {projected.length} 条
            </span>
            变化
          </p>
          {showWarning && (
            <div className="history-notice" id="history-target-warning" tabIndex={-1}>
              {hiddenTarget && recovery ? (
                <>
                  <p>目标变化被当前筛选隐藏。定位只需清除：{recovery.removed.map((k) => HISTORY_LABELS[k]).join('、')}。</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLocated(undefined);
                      navigate(historyReaderPath(entity.id, recovery.next, hiddenTarget.event.id, back ?? undefined), { replace: true, state: location.state });
                    }}
                  >
                    清除冲突筛选并定位
                  </button>
                  <button type="button" onClick={() => {
                    setDismissed(visitKey);
                    focus(headingId);
                  }}>保留筛选</button>
                </>
              ) : (
                <>
                  <p>找不到链接指定的变化。没有跳到其他对象或把首条当作目标。</p>
                  <button type="button" onClick={() => apply(valid)}>查看本对象历史</button>
                </>
              )}
            </div>
          )}
          {!projected.length ? (
            <p>尚未收录该对象的更新历史。这不代表它从未改动。</p>
          ) : !visible.length ? (
            <div>
              <p>当前筛选下没有变化。</p>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(valid);
                  HISTORY_FILTERS.forEach((k) => next.delete(k));
                  apply(next);
                }}
              >
                清除筛选
              </button>
            </div>
          ) : (
            <div className="history-timeline">
              {nodes.map((node) => {
                const open = expanded.includes(node.id);
                const label = node.version?.label ?? '版本未登记';
                return (
                  <section key={node.id} className="history-node" data-history-version={node.id}>
                    <h3>
                      <button
                        id={nodeId(node.id)}
                        type="button"
                        aria-expanded={open}
                        aria-controls={nodeId(node.id) + '-body'}
                        onClick={() => updateExpanded(open ? expanded.filter((id) => id !== node.id) : [...expanded, node.id])}
                      >
                        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
                        <span>
                          <UpdateText>{label}</UpdateText>
                        </span>
                        <span className="num nw">{node.rows.length} 条</span>
                      </button>
                    </h3>
                    <div className="history-node-meta">
                      {CHANNEL[node.version?.channel ?? 'unknown']} · 官方发行日：
                      <SourceTime value={node.version?.releaseDate ?? null} />
                      {!node.version?.orderKey && ' · 不参与版本先后排序'}
                      <p>
                        <UpdateText>
                          {[
                            ...new Set(
                              node.rows.flatMap((row) =>
                                row.event.claims.flatMap((c) =>
                                  c.effects.map((f) => ('attribute' in f ? f.attribute : f.type === 'mechanic' ? '机制' : '可用性或身份')),
                                ),
                              ),
                            ),
                          ]
                            .slice(0, 4)
                            .join('、')}
                        </UpdateText>
                        {node.rows.some(({ event }) => event.verification === 'unverified') && ' · 有未核实'}
                        {node.rows.some(({ event }) => event.verification === 'conflict') && ' · 有来源冲突'}
                        {node.rows.some((row) => row.unknownScope || row.relations.some((r) => r.relation === 'identity-pending')) && ' · 有范围或身份待核'}
                      </p>
                    </div>
                    <div id={nodeId(node.id) + '-body'} hidden={!open}>
                      {open &&
                        node.rows.map((view) => (
                          <EventCard
                            key={view.event.id}
                            data={data}
                            entity={entity}
                            view={view}
                            expanded={expanded}
                            from={origin}
                            evidence={(button) => {
                              trigger.current = { button, event: view.event.id, y: window.scrollY };
                              setDialog({ kind: 'event', view });
                            }}
                          />
                        ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}
      {dialog && (
        <HistoryDialog
          title={dialog.kind === 'coverage' ? '收录说明' : '依据与原文'}
          subtitle={
            dialog.kind === 'event'
              ? (data.versions.find((v) => v.id === dialog.view.event.versionId)?.label ?? '版本未登记') + ' · ' + entity?.nameZh
              : undefined
          }
          close={() => close()}
        >
          {dialog.kind === 'event' ? (
            <HistoryEvidence data={data} view={dialog.view} />
          ) : (
            <HistoryCoverage data={data} entity={entity} views={projected} locate={close} types={HISTORY_TYPES} />
          )}
        </HistoryDialog>
      )}
    </>
  );
}

export function HistoryReader({ active }: { active: boolean }) {
  const state = useCivUpdates();
  if (state.data) return <ReaderContent data={state.data} active={active} />;
  return (
    <>
      {state.error ? (
        <>
          <p role="alert">共享历史加载失败；这不是来源未检查或没有历史。</p>
          <button type="button" onClick={state.retry}>
            重试共享历史
          </button>
        </>
      ) : (
        <p role="status">正在加载共享历史</p>
      )}
    </>
  );
}
