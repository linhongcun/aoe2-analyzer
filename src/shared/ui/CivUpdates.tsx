import { Fragment, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import {
  SOURCE_CATEGORY_LABELS,
  SOURCE_STATE_LABELS,
  VERIFICATION_LABELS,
  clearHistoryQuery,
  compareUpdateVersions,
  detailQueryError,
  eventSourceEntries,
  filterCivUpdates,
  safeHistorySourceUrl,
  setHistoryQuery,
  updateEventCounts,
  validHistoryReturn,
  type CivUpdateEvent,
  type CivUpdatesData,
  type UpdateEntity,
} from '../../domain/civUpdates';
import './civ-updates.css';
import { CivUpdatesLoading, SourceTime, UpdateText } from './CivUpdatePrimitives';
import { HistoryEntityLinks } from './HistoryEntityLinks';
import { HistoryEffect, ScopeText } from './HistoryEffect';
import { readerScopePending, relatedReaderEntities } from '../../domain/historyReader';
import type { UnitEventView } from '../../domain/unitUpdates';

type InlineEvent = { view: UnitEventView; entity: UpdateEntity; evidenceOpen: boolean; toggleEvidence: () => void };

function SourceReferences({ data, event, inline }: { data: CivUpdatesData; event: CivUpdateEvent; inline?: InlineEvent }) {
  const evidenceEvent =
    inline && event.verification !== 'conflict'
      ? { ...event, claims: event.claims.filter((claim) => inline.view.event.claims.some((row) => row.id === claim.id && row.effects.length)) }
      : event;
  const entries = eventSourceEntries(data, evidenceEvent);
  const related = inline ? relatedReaderEntities(data, inline.view, inline.entity.id) : [];
  return (
    <details
      className="civ-update-references"
      open={inline?.evidenceOpen}
      onToggle={
        inline
          ? (event) => {
              if (event.currentTarget.open !== inline.evidenceOpen) inline.toggleEvidence();
            }
          : undefined
      }
    >
      <summary>
        {inline ? (
          '依据与原文'
        ) : (
          <>
            来源与原文（<span className="num nw">{entries.length} 条引用</span>）
          </>
        )}
      </summary>
      <p>
        <UpdateText>{event.verificationNote}</UpdateText>
      </p>
      {inline && (
        <>
          <p>原文和事实核验分别保留。处理完成不代表事实已核实。</p>
          {evidenceEvent.claims.map((claim) => (
            <section key={claim.id}>
              <p>
                {VERIFICATION_LABELS[claim.verification]} · <UpdateText>{claim.verificationNote}</UpdateText>
              </p>
              {claim.effects.map((effect) => (
                <div key={effect.id}>
                  <p>
                    <UpdateText>{effect.text}</UpdateText>
                  </p>
                  {'legacyBefore' in effect && (effect.legacyBefore !== null || effect.legacyAfter !== null) && (
                    <p>
                      旧记录：<UpdateText>{`${effect.legacyBefore ?? '未知'} 变为 ${effect.legacyAfter ?? '未知'}`}</UpdateText>
                    </p>
                  )}
                </div>
              ))}
            </section>
          ))}
          {!!related.length && <p>关联对象：{related.map((entity) => entity.nameZh).join('、')}</p>}
          {!entries.length && <p>来源与原文未登记。</p>}
        </>
      )}
      {entries.map((entry) => {
        const source = data.sources.find((row) => row.id === entry.sourceId)!;
        const section = data.sections.find((row) => row.id === entry.sectionId);
        const url = safeHistorySourceUrl(source.url);
        const verification = [...new Set(event.claims.filter((claim) => claim.sourceEntryIds.includes(entry.id)).map((claim) => claim.verification))];
        return (
          <section className="civ-update-source" key={entry.id} aria-label={source.title}>
            <h5>
              <UpdateText>{source.title}</UpdateText>
            </h5>
            <p>
              来源类别：{SOURCE_CATEGORY_LABELS[source.category]} · 事实核验：{verification.map((value) => VERIFICATION_LABELS[value]).join('、')}
            </p>
            <p>
              章节：<UpdateText>{section?.title ?? '既有版本档案'}</UpdateText>
              {entry.group && <UpdateText>{` / ${entry.group}`}</UpdateText>} · 定位：<UpdateText>{entry.locator}</UpdateText>
            </p>
            <p>
              来源发布时间：
              <SourceTime value={section ? section.sourcePublishedAt : source.sourcePublishedAt} />
            </p>
            <p>
              采集时间：
              <SourceTime value={section?.capturedAt ?? source.capturedAt} missing="未登记" />
            </p>
            {url ? (
              <a href={url + (section?.anchor ?? '')} target="_blank" rel="noopener noreferrer">
                打开来源页面
              </a>
            ) : (
              <p>来源链接未登记</p>
            )}
            {entry.originalText !== null ? (
              <blockquote>
                <UpdateText>{entry.originalText}</UpdateText>
              </blockquote>
            ) : (
              <p>原文未登记；保留旧档案摘要及核验依据。</p>
            )}
            {event.claims
              .filter((claim) => claim.sourceEntryIds.includes(entry.id))
              .map((claim) => (
                <p key={claim.id}>
                  <UpdateText>{claim.verificationNote}</UpdateText>
                </p>
              ))}
          </section>
        );
      })}
      {event.candidates.length > 0 && (
        <p>
          另有 <span className="num nw">{event.candidates.length} 条</span> 同版记录的对应关系待核，未据此合并或判定冲突。
        </p>
      )}
    </details>
  );
}

export function UpdateEventCard({
  data,
  event,
  sourceEvent = event,
  anchorId = `hist-${event.id}`,
  inline,
}: {
  data: CivUpdatesData;
  event: CivUpdateEvent;
  sourceEvent?: CivUpdateEvent;
  anchorId?: string;
  inline?: InlineEvent;
}) {
  const categories = [...new Set(eventSourceEntries(data, event).map((entry) => data.sources.find((source) => source.id === entry.sourceId)!.category))];
  const scopes = inline
    ? [...new Set(event.claims.flatMap((claim) => claim.effects.map((effect) => (effect.scope ?? sourceEvent.scope).scopeKind)))]
    : [event.scope.scopeKind];
  const verifications =
    inline && event.verification !== 'conflict'
      ? [...new Set(event.claims.filter((claim) => claim.effects.length).map((claim) => claim.verification))]
      : [event.verification];
  return (
    <article
      className={`civ-update-event civ-update-${event.verification}`}
      id={anchorId}
      data-testid="civ-update-event"
      data-event-id={event.id}
      data-history-event={inline ? event.id : undefined}
      tabIndex={-1}
    >
      <div className="civ-update-badges">
        {scopes.map((scope) => (
          <span key={scope} className="civ-update-pill" data-inline-scope={inline ? scope : undefined}>
            {{ civ: '文明专属', team: '团队', global: '全局', unknown: '范围待核' }[scope]}
          </span>
        ))}
        {verifications.map((verification) => (
          <span key={verification} className="civ-update-pill" data-inline-verification={inline ? verification : undefined}>
            {VERIFICATION_LABELS[verification]}
          </span>
        ))}
      </div>
      <h4>{inline ? '历史变化' : <UpdateText>{event.summary}</UpdateText>}</h4>
      {!inline && <ScopeText data={data} scope={event.scope} />}
      {event.verification === 'conflict' && <p className="civ-update-warning">来源冲突，尚未确认。以下并列保留各方主张。</p>}
      <div className={event.verification === 'conflict' ? 'civ-update-conflict-claims' : undefined}>
        {event.claims
          .filter((claim) => !inline || claim.effects.length)
          .map((claim, index) => (
            <section className="civ-update-claim" key={claim.id} aria-label={`主张${index + 1}`}>
              {event.claims.length > 1 && (
                <p>
                  主张 <span className="num nw">{index + 1}</span> · {VERIFICATION_LABELS[claim.verification]}
                </p>
              )}
              {claim.effects.map((effect) => (
                <Fragment key={effect.id}>
                  <HistoryEffect
                    data={data}
                    effect={effect}
                    fallbackScope={inline ? sourceEvent.scope : undefined}
                    inline={!!inline}
                    showEntities={!inline || inline.entity.type === 'civ'}
                  />
                  {inline && (effect.scope ?? sourceEvent.scope).scopeKind !== 'unknown' && readerScopePending(inline.view, effect, inline.entity) && (
                    <p>适用范围待核</p>
                  )}
                </Fragment>
              ))}
              {!claim.effects.length && <p>此主张未将效果明确归于当前稳定身份；完整主张与原文保留在来源中。</p>}
            </section>
          ))}
      </div>
      {!inline && (
        <p className="civ-update-meta">
          {categories.map((category) => SOURCE_CATEGORY_LABELS[category]).join('、')}来源 · {VERIFICATION_LABELS[event.verification]}
        </p>
      )}
      <SourceReferences data={data} event={sourceEvent} inline={inline} />
    </article>
  );
}

function SourceProcessing({ data, civId }: { data: CivUpdatesData; civId: string }) {
  const civ = data.civilizations.find((row) => row.civId === civId)!;
  const sections = data.sections.filter((section) => section.civId === civId);
  const ids = new Set(sections.flatMap((section) => section.entryIds));
  const entries = data.sourceEntries.filter((entry) => ids.has(entry.id));
  const labels = { mapped: '已映射', pending: '待核', excluded: '已排除' };
  return (
    <details className="civ-update-processing" data-testid="civ-update-processing">
      <summary>
        查看来源章节与逐条处理情况（<span className="num nw">{entries.length} 条原文</span>）
      </summary>
      <p>{civ.reason}</p>
      <p>
        已映射 <span className="num nw">{entries.filter((entry) => entry.processing === 'mapped').length} 条</span> · 待核{' '}
        <span className="num nw">{entries.filter((entry) => entry.processing === 'pending').length} 条</span> · 已排除{' '}
        <span className="num nw">{entries.filter((entry) => entry.processing === 'excluded').length} 条</span>。处理完成不代表游戏事实已核实。
      </p>
      {sections.map((section) => {
        const source = data.sources.find((row) => row.id === section.sourceId)!;
        const url = safeHistorySourceUrl(source.url);
        return (
          <p key={section.id}>
            {url ? (
              <a href={url + section.anchor} target="_blank" rel="noopener noreferrer">
                {source.title} · {section.title}
              </a>
            ) : (
              source.title
            )}{' '}
            · {SOURCE_STATE_LABELS[section.sourceState]} · {section.reason}
          </p>
        );
      })}
      {entries.map((entry) => (
        <div className="civ-update-source" key={entry.id}>
          <p>
            <strong>{labels[entry.processing]}</strong> · {entry.group ?? '未登记分组'} · <UpdateText>{entry.locator}</UpdateText>
          </p>
          <p>
            <UpdateText>{entry.originalText ?? '原文未登记'}</UpdateText>
          </p>
          <p>{entry.reason}</p>
        </div>
      ))}
    </details>
  );
}

export function CivUpdatesReader({ data, civId }: { data: CivUpdatesData; civId: string }) {
  const [query] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const civ = data.civilizations.find((row) => row.civId === civId);
  const error = detailQueryError(query, data, civId);
  const focusEvent = query.get('histEvent');
  useEffect(() => {
    if (focusEvent) {
      const node = document.getElementById('hist-' + focusEvent);
      node?.scrollIntoView({ block: 'center' });
      node?.focus({ preventScroll: true });
    }
  }, [focusEvent]);
  if (!civ) return <p role="alert">未找到这个文明的历史目录。</p>;
  const filtered = filterCivUpdates(data, civId, query);
  const counts = updateEventCounts(filtered);
  const allEvents = data.events.filter((event) => civ.eventIds.includes(event.id));
  const versionIds = new Set(allEvents.flatMap((event) => (event.versionId === null ? [] : [event.versionId])));
  const versions = data.versions.filter((version) => versionIds.has(version.id)).sort(compareUpdateVersions);
  const sectionIds = new Set(civ.sectionIds);
  const pendingCount = data.sourceEntries.filter(
    (entry) => entry.sectionId !== null && sectionIds.has(entry.sectionId) && entry.processing === 'pending',
  ).length;
  const groups = new Map<string | null, CivUpdateEvent[]>();
  for (const event of filtered) groups.set(event.versionId, [...(groups.get(event.versionId) ?? []), event]);
  const writeQuery = (next: URLSearchParams, replace = false) =>
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : '', hash: '#patches' }, { replace });
  const change = (key: string, value: string) => writeQuery(setHistoryQuery(query, key, value), key === 'histQuery');
  const clear = () => writeQuery(clearHistoryQuery(query, 'detail', data));
  const returnPath = validHistoryReturn(query.get('histReturn'), data) ?? '/patches';
  return (
    <section className="civ-updates" aria-label={`${civ.nameZh}更新历史`} data-testid="civ-updates-reader">
      <h2>更新历史</h2>
      <p>
        {data.meta.coverageNote} <Link to={returnPath}>{returnPath === '/patches' ? '返回文明历史总览' : '返回上次历史结果'}</Link>
      </p>
      <div className="civ-update-stats">
        <div>
          <span>来源章节</span>
          <strong className={`civ-update-pill civ-update-state-${civ.sourceState}`}>{SOURCE_STATE_LABELS[civ.sourceState]}</strong>
          <small>来源处理不代表事实核验。</small>
        </div>
        <div>
          <span>历史覆盖</span>
          <strong className="civ-update-pill">{civ.historyCoverage === 'partial' ? '部分收录' : '尚未收录'}</strong>
          <small>仅代表本站已登记的记录。</small>
        </div>
        <div>
          <span>指定章节原文</span>
          <strong className="num nw">{civ.sourceEntryCount ?? '未统计'}</strong>
        </div>
        <div>
          <span>去重事件</span>
          <strong className="num nw">{civ.eventCount ?? '未统计'}</strong>
        </div>
        <div>
          <span>涉及版本</span>
          <strong className="num nw">{civ.versionCount ?? '未统计'}</strong>
          <small>
            另有 <span className="num nw">{civ.unknownVersionEventCount ?? '未统计'} 条</span> 未登记版本。
          </small>
        </div>
      </div>
      {civ.sourceState === 'pending' && (
        <p className="civ-update-warning">
          来源章节仍有导入待核条目（待核 <span className="num nw">{pendingCount} 条</span>），已留存原文和具体原因；已有历史可继续查阅。
        </p>
      )}
      {civ.sourceState === 'no-log' && <p>指定来源页面存在，但日志章节暂无记录。这不表示该文明从未改动。</p>}
      {civ.sourceState === 'page-not-found' && <p>在已登记来源查找范围中未找到页面；请查看来源处理说明。</p>}
      <SourceProcessing data={data} civId={civId} />
      <div className="civ-update-filters">
        <label>
          关键词
          <input value={query.get('histQuery') ?? ''} placeholder="搜索变化、实体或原文" onChange={(e) => change('histQuery', e.target.value)} />
        </label>
        <label>
          版本
          <select aria-label="版本" value={query.get('histVersion') ?? ''} onChange={(e) => change('histVersion', e.target.value)}>
            <option value="">全部版本</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
            <option value="unknown">未登记版本</option>
          </select>
        </label>
        <label>
          来源类别
          <select value={query.get('histSource') ?? ''} onChange={(e) => change('histSource', e.target.value)}>
            <option value="">全部来源</option>
            <option value="official">官方</option>
            <option value="community">社区</option>
            <option value="other">其他 / 未知类别</option>
          </select>
        </label>
        <label>
          核验状态
          <select value={query.get('histVerification') ?? ''} onChange={(e) => change('histVerification', e.target.value)}>
            <option value="">全部核验状态</option>
            {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          排序
          <select value={query.get('histOrder') ?? 'newest'} onChange={(e) => change('histOrder', e.target.value)}>
            <option value="newest">版本：从新到旧</option>
            <option value="oldest">版本：从旧到新</option>
          </select>
        </label>
        <button type="button" onClick={clear}>
          清除历史筛选
        </button>
      </div>
      {error ? (
        <p role="alert" className="civ-update-warning">
          {error}
        </p>
      ) : (
        <>
          <p role="status">
            命中 <span className="num nw">{counts.events} 个事件</span> / <span className="num nw">{counts.versions} 个版本</span>；另有{' '}
            <span className="num nw">{counts.unknown} 个</span> 未登记版本的事件。无法比较版本号的记录列在末尾。
          </p>
          {!allEvents.length ? (
            <p>尚未收录该文明的更新历史。这不代表它从未改动。</p>
          ) : !filtered.length ? (
            <p>没有符合筛选条件的记录。可调整条件，或清除筛选后查看全部已收录历史。</p>
          ) : (
            [...groups].map(([versionId, events]) => {
              const version = data.versions.find((row) => row.id === versionId);
              return (
                <section className="civ-update-version" key={versionId ?? 'unknown'} aria-label={version?.label ?? '未登记版本'}>
                  <div className="civ-update-version-heading">
                    <h3>{version ? <UpdateText>{version.label}</UpdateText> : '未登记版本'}</h3>
                    <span className="civ-update-pill">
                      {version?.releaseDate ? (
                        <>
                          发行日期 <span className="num nw">{version.releaseDate}</span>
                        </>
                      ) : (
                        '发行日期未知'
                      )}
                    </span>
                  </div>
                  {version?.build && data.meta.legacyBaseline.some((archive) => archive.path === `data/game/patches/${version.build}.json`) && (
                    <p>
                      <Link to={`/patches/${version.build}?civ=${civId}`}>查看本版本的文明分组改动（含未写明适用文明的记录）</Link>
                    </p>
                  )}
                  {events.map((event) => (
                    <Fragment key={event.id}>
                      <UpdateEventCard data={data} event={event} />
                      <HistoryEntityLinks data={data} event={event} sourceEntityId={'civ/' + civId} />
                    </Fragment>
                  ))}
                </section>
              );
            })
          )}
        </>
      )}
    </section>
  );
}

export function CivUpdates({ civId }: { civId: string }) {
  const { data, error, retry } = useCivUpdates();
  return data ? <CivUpdatesReader data={data} civId={civId} /> : <CivUpdatesLoading error={error} retry={retry} />;
}
