import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import { useCore } from '../../data/hooks';
import { VERIFICATION_LABELS, setHistoryQuery, type CivUpdatesData } from '../../domain/civUpdates';
import {
  TECH_FILTER_KEYS,
  techCoverageRows,
  revealTechEvent,
  techEvidenceStats,
  TECH_SOURCE_LABELS,
  techHistoryPath,
  techHistoryReturn,
  techQueryErrors,
  clearTechFilters,
  filterTechEvents,
  projectTechEvents,
  recoverTechQuery,
  searchUpdateTechs,
} from '../../domain/techUpdates';
import { UNIT_CONDITIONS, partitionUnitScopes, type UnitEventView } from '../../domain/unitUpdates';
import { SourceTime, UpdateText } from './CivUpdatePrimitives';
import { TechIcon } from './art';
import { HistoryEntityLinks } from './HistoryEntityLinks';
import { VersionEvents } from './UnitUpdates';
import './unit-updates.css';
import './tech-updates.css';

function TechLoading({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? (
    <div>
      <p role="alert">科技历史加载失败；对象和筛选地址已保留，请重试。</p>
      <button type="button" onClick={retry}>
        重试科技历史
      </button>
    </div>
  ) : (
    <p role="status">正在读取科技更新历史</p>
  );
}

function EvidenceSummary({ data, entityId }: { data: CivUpdatesData; entityId: string }) {
  const stats = techEvidenceStats(data, entityId);
  return (
    <div className="tech-evidence-summary">
      <p>
        关联科技原文 <span className="num nw">{stats.linked} 条</span>；关联章节及旧原件共 <span className="num nw">{stats.originals} 条</span>
        （包含其它实体、去重计数）。
      </p>
      <p>
        原文处置：已映射 <span className="num nw">{stats.mapped}</span> · 待核 <span className="num nw">{stats.pending}</span> · 排除{' '}
        <span className="num nw">{stats.excluded}</span>。
      </p>
      <p>
        事实主张：已核验 <span className="num nw">{stats.verified}</span> · 未核验 <span className="num nw">{stats.unverified}</span> · 冲突事件{' '}
        <span className="num nw">{stats.conflicts}</span>。独立来源仍未检查；未收录不代表从未改动。
      </p>
    </div>
  );
}

function TechSearch({
  data,
  query,
  setQuery,
}: {
  data: CivUpdatesData;
  query: URLSearchParams;
  setQuery: (q: URLSearchParams, options?: { replace: boolean }) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(query.get('histQuery') ?? '');
  const core = useCore();
  const snapshot = new URLSearchParams(query);
  snapshot.delete('histReturn');
  const back = techHistoryReturn(data, '/patches?' + snapshot.toString());
  const matches = searchUpdateTechs(data, query.getAll('histQuery').length === 1 ? query.get('histQuery')! : '');
  return (
    <div className="unit-history-search">
      <label htmlFor={id}>搜索科技历史</label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(setHistoryQuery(query, 'histQuery', draft));
        }}
      >
        <input id={id} value={draft} placeholder="科技中英文名、历史别名或 ID" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit">搜索科技</button>
      </form>
      {!!query.get('histQuery') && (
        <button type="button" onClick={() => setQuery(setHistoryQuery(query, 'histQuery', ''))}>
          清空搜索
        </button>
      )}
      <nav className="tech-history-choices" aria-label="选择精确科技身份">
        {matches.map((entity) => (
          <Link key={entity.id} to={techHistoryPath(data, entity.id, query, 'overview', back ?? undefined)}>
            {entity.status === 'current' && entity.catalogId && core?.techById[+entity.catalogId] && <TechIcon t={core.techById[+entity.catalogId]!} />}
            {entity.nameZh} <span className="num nw">ID {entity.catalogId ?? '未登记'}</span>
            <small>
              {entity.nameEn} · {entity.status === 'current' ? '独立科技身份' : '退役历史身份'}
              {entity.aliases.length ? ' · ' + entity.aliases.join('、') : ''}
            </small>
          </Link>
        ))}
        {!matches.length && <p role="status">没有找到该科技，可清除搜索或查看来源覆盖。</p>}
      </nav>
    </div>
  );
}

function Recovery({
  data,
  query,
  setQuery,
  detailId,
}: {
  data: CivUpdatesData;
  query: URLSearchParams;
  setQuery: (q: URLSearchParams) => void;
  detailId?: string;
}) {
  const errors = techQueryErrors(data, query, true, detailId);
  if (!errors.length) return null;
  const candidates = [...new Set([...query.getAll('obj').map((s) => s.replace(':', '/')), ...query.getAll('histEntity')])].filter((id) =>
    data.entities.some((e) => e.type === 'tech' && e.id === id),
  );
  return (
    <div className="civ-update-warning" role="alert">
      <p>历史地址有重复、失效或不适用的参数：{errors.join('、')}。未显示旧对象结果。</p>
      <button type="button" onClick={() => setQuery(recoverTechQuery(data, query, detailId))}>
        仅清除错误参数
      </button>
      {candidates.map((id) => (
        <Link key={id} to={techHistoryPath(data, id, query, 'overview')}>
          选择{data.entities.find((e) => e.id === id)?.nameZh}
        </Link>
      ))}
    </div>
  );
}

function TechCoverage({ data, entityId, anchors, reset }: { data: CivUpdatesData; entityId: string; anchors: ReadonlyMap<string, string>; reset: () => void }) {
  const row = techCoverageRows(data).find((r) => r.entityId === entityId);
  const sections = data.sections.filter((s) => row?.sectionIds.includes(s.id) || row?.relatedSectionIds.includes(s.id));
  const ownEvents = new Set(row?.eventIds);
  const legacyEntries = new Set(data.events.filter((e) => ownEvents.has(e.id)).flatMap((e) => e.claims.flatMap((c) => c.sourceEntryIds)));
  const entries = data.sourceEntries.filter((e) => sections.some((s) => s.id === e.sectionId) || legacyEntries.has(e.id));
  return (
    <details className="civ-update-processing">
      <summary>来源覆盖与逐条处理 · {row ? TECH_SOURCE_LABELS[row.sourceState] : '目录外历史身份'}</summary>
      <p>
        <UpdateText>{row?.identityNote ?? '此身份不计入当前科技目录分母，不按同名推定当前身份。'}</UpdateText>
      </p>
      <p>
        <UpdateText>{row?.reason ?? '仅保留已知历史证据，无当前独立来源覆盖行。'}</UpdateText>
      </p>
      <p>
        独立来源检查时间：
        <SourceTime value={row?.checkedAt ?? null} missing="尚未检查" />
      </p>
      <p>
        独立科技章节原文 <span className="num nw">{row?.sourceEntryCount ?? '未统计'} 条</span>；其他关联证据章节{' '}
        <span className="num nw">{row?.relatedSectionIds.length ?? 0} 个</span>。关联证据不会把独立科技页标成完成。
      </p>
      <p>
        以下分母是关联来源原件（包含其它实体），不是新增科技变更数量：<span className="num nw">{entries.length} 条</span>。
      </p>
      <p>
        已映射 <span className="num nw">{entries.filter((e) => e.processing === 'mapped').length} 条</span> · 待核{' '}
        <span className="num nw">{entries.filter((e) => e.processing === 'pending').length} 条</span> · 排除{' '}
        <span className="num nw">{entries.filter((e) => e.processing === 'excluded').length} 条</span>；处理完成不等于事实已核验。
      </p>
      {sections.map((s) => (
        <p key={s.id}>
          固定章节 {s.revisionId}
          <br />
          文档指纹 <code>{s.documentSha256}</code>
          <br />
          章节指纹 <code>{s.sectionTextSha256}</code>
        </p>
      ))}
      {entries.map((e) => (
        <article key={e.id} className="civ-update-source">
          <p>
            <UpdateText>{e.locator}</UpdateText> · {{ mapped: '已映射', pending: '待核', excluded: '已排除' }[e.processing]} · {e.group ?? '分支未注明'}
          </p>
          <blockquote>
            <UpdateText>{e.originalText ?? '原文未登记'}</UpdateText>
          </blockquote>
          <p>
            <UpdateText>{e.reason}</UpdateText>
          </p>
          {e.eventIds
            .filter((eventId) => ownEvents.has(eventId))
            .map((eventId) => {
              const event = data.events.find((ev) => ev.id === eventId)!;
              const claims = event.claims.filter((c) => c.sourceEntryIds.includes(e.id));
              return (
                <div key={eventId}>
                  <p>
                    事件 <code>{eventId}</code>
                  </p>
                  {claims.map((c) => (
                    <p key={c.id}>
                      主张 <code>{c.id}</code>；效果{' '}
                      {c.effects.map((f) => (
                        <code key={f.id}>{f.id} </code>
                      ))}
                    </p>
                  ))}
                  {anchors.has(eventId) ? (
                    <button
                      type="button"
                      aria-controls={anchors.get(eventId)}
                      onClick={() => document.getElementById(anchors.get(eventId)!)?.scrollIntoView({ block: 'center' })}
                    >
                      定位已显示事件
                    </button>
                  ) : (
                    <p>
                      该事件未在当前筛选/身份中显示。
                      <button type="button" onClick={reset}>
                        清除历史筛选以定位
                      </button>
                    </p>
                  )}
                </div>
              );
            })}
        </article>
      ))}
    </details>
  );
}

function TechReader({ data, entityId, overview, retry }: { data: CivUpdatesData; entityId: string; overview: boolean; retry: () => void }) {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const [copy, setCopy] = useState<{ path: string; message: string; url?: string }>();
  const request = useRef(0);
  const entity = data.entities.find((e) => e.id === entityId && e.type === 'tech');
  const row = techCoverageRows(data).find((r) => r.entityId === entityId);
  const errors = techQueryErrors(data, query);
  const all = projectTechEvents(data, entityId);
  const shown = filterTechEvents(data, entityId, query);
  const groups = query.has('histCiv') ? partitionUnitScopes(shown) : { known: shown, unknown: [], mixed: [] };
  const anchors = new Map([...groups.known, ...groups.mixed].map((r) => [r.event.id, 'tech-hist-' + r.event.id]));
  groups.unknown.forEach((r) => {
    if (!anchors.has(r.event.id)) anchors.set(r.event.id, 'tech-unknown-' + r.event.id);
  });
  const sharePath = techHistoryPath(data, entityId, query, overview ? 'overview' : 'detail');
  const currentQuery = new URLSearchParams(query);
  currentQuery.delete('histReturn');
  const currentPath = techHistoryReturn(data, location.pathname + '?' + currentQuery.toString());
  const back = techHistoryReturn(data, query.get('histReturn'));
  const reset = () => setQuery(clearTechFilters(query));
  useEffect(() => {
    request.current += 1;
  }, [sharePath]);
  const anchor = anchors.get(query.get('histEvent') ?? '');
  useEffect(() => {
    if (anchor) {
      const node = document.getElementById(anchor);
      node?.scrollIntoView({ block: 'center' });
      node?.focus({ preventScroll: true });
    }
  }, [anchor]);
  if (!entity || !data.techs)
    return (
      <div>
        <h2>未定位到科技历史身份</h2>
        <p>不按名称或当前属性猜测历史关系。</p>
        <Link to="/patches?histView=techs">重新选择科技</Link>
      </div>
    );
  const set = (key: string, value: string) => setQuery(setHistoryQuery(query, key, value));
  const share = async () => {
    const seq = ++request.current;
    const url = new URL(window.location.href);
    url.hash = sharePath;
    try {
      await navigator.clipboard.writeText(url.href);
      if (request.current === seq) setCopy({ path: sharePath, message: '已复制当前历史地址' });
    } catch {
      if (request.current === seq) setCopy({ path: sharePath, message: '复制失败，请手动复制地址', url: url.href });
    }
  };
  const titleRows = (rows: typeof shown) =>
    rows.map((v) => {
      const directIds = new Set(v.relations.filter((r) => r.relation === 'direct').flatMap((r) => r.effectIds));
      const effects = v.event.claims.flatMap((c) => c.effects);
      const direct = effects.filter((f) => directIds.has(f.id));
      return {
        ...v,
        event: {
          ...v.event,
          summary:
            entity.nameZh +
            ' · ' +
            [...new Set((direct.length ? direct : effects).map((f) => (f.type === 'numeric' || f.type === 'bonus' ? f.attribute : f.text)))].join('；'),
        },
      };
    });
  const context = (view: UnitEventView) => {
    return <HistoryEntityLinks data={data} event={view.event} sourceEntityId={entityId} />;
  };
  return (
    <section className="tech-history civ-updates unit-updates" aria-label="科技更新历史" data-tech-history={entityId}>
      {overview ? (
        <>
          <Link to="/patches?histView=techs">科技历史总览</Link>
          <h1>{entity.nameZh} · 更新历史</h1>
          <details>
            <summary>切换科技</summary>
            <TechSearch key={query.get('histQuery') ?? ''} data={data} query={query} setQuery={setQuery} />
          </details>
        </>
      ) : (
        <h3>{entity.nameZh} · 科技历史身份</h3>
      )}
      <Recovery data={data} query={query} setQuery={setQuery} />
      <p>当前目录值与历史主张分开；这里的改动不参与当前游戏计算。</p>
      <div className="unit-history-actions">
        <span className="civ-update-pill num nw">ID {entity.catalogId ?? '未登记'}</span>
        <span className="civ-update-pill">{row ? TECH_SOURCE_LABELS[row.sourceState] : '目录外历史身份'}</span>
        {entity.status === 'current' && (
          <Link to={techHistoryPath(data, entityId, query, overview ? 'detail' : 'overview', currentPath ?? undefined)}>
            {overview ? '打开科技详情' : '在更新历史总览查看'}
          </Link>
        )}
        {back && <Link to={back}>返回上次历史结果</Link>}
        <Link
          to={
            '/patches?' +
            new URLSearchParams({
              histView: 'techCoverage',
              histQuery: entity.nameZh,
              techIdentity: entity.status === 'current' ? 'current' : 'retired',
              ...(currentPath ? { histReturn: currentPath } : {}),
            }).toString()
          }
        >
          查看此科技来源覆盖
        </Link>
        <button type="button" disabled={!!errors.length} onClick={share}>
          复制历史分享地址
        </button>
      </div>
      <p role="status">{copy?.path === sharePath ? copy.message : ''}</p>
      {copy?.path === sharePath && copy.url && (
        <label>
          手动复制地址
          <input value={copy.url} readOnly onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p>{data.techs.coverageNote}</p>
      <EvidenceSummary data={data} entityId={entityId} />
      {row?.sourceState === 'read-failed' && (
        <div role="alert">
          <p>来源读取失败；以下保留既有快照，不当作空结果。</p>
          <button type="button" onClick={retry}>
            重新读取应用快照
          </button>
          <p>不会在前端重新采集站外历史页面；历史失败状态仍保留。</p>
        </div>
      )}
      <TechCoverage data={data} entityId={entityId} anchors={anchors} reset={reset} />
      <details className="civ-update-processing" open={TECH_FILTER_KEYS.some((key) => query.has(key)) || !!errors.length}>
        <summary>筛选已收录的科技历史</summary>
        <div className="civ-update-filters">
          <label>
            版本
            <select value={query.get('histVersion') ?? ''} onChange={(e) => set('histVersion', e.target.value)}>
              <option value="">全部版本</option>
              <option value="unknown">未登记版本</option>
              <option value="unordered">无法比较版本</option>
              {data.versions
                .filter((v) => all.some((r) => r.event.versionId === v.id))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            文明或团队提供者
            <select value={query.get('histCiv') ?? ''} onChange={(e) => set('histCiv', e.target.value)}>
              <option value="">全部文明关系</option>
              {data.civilizations.map((c) => (
                <option key={c.civId} value={c.civId}>
                  {c.nameZh}
                </option>
              ))}
            </select>
          </label>
          <label>
            条件
            <select value={query.get('histCondition') ?? ''} onChange={(e) => set('histCondition', e.target.value)}>
              <option value="">全部条件</option>
              {Object.entries(UNIT_CONDITIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            事实核验
            <select value={query.get('histVerification') ?? ''} onChange={(e) => set('histVerification', e.target.value)}>
              <option value="">全部核验状态</option>
              {Object.entries(VERIFICATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            排序
            <select value={query.get('histOrder') ?? 'newest'} onChange={(e) => set('histOrder', e.target.value)}>
              <option value="newest">由新到旧</option>
              <option value="oldest">由旧到新</option>
            </select>
          </label>
          <button type="button" onClick={reset}>
            清除历史筛选
          </button>
        </div>
      </details>
      {!errors.length && (
        <>
          <p role="status">
            显示{' '}
            <span className="num nw">
              {new Set(shown.map((r) => r.event.id)).size} / {all.length} 个事件
            </span>
            ；同事件的不同条件分组不重复计数。完整原文可提及其他实体，仅作证据。
          </p>
          {query.has('histEvent') && !anchor && (
            <div role="status">
              <p>关联记录被当前筛选隐藏；可仅解除阻碍本条的条件。</p>
              <button type="button" onClick={() => setQuery(revealTechEvent(data, entityId, query))}>
                显示这条关联记录
              </button>
              <button type="button" onClick={() => setQuery(setHistoryQuery(query, 'histEvent', ''))}>
                保留当前筛选
              </button>
            </div>
          )}
          {!all.length ? (
            <p>尚未收录该科技的更新历史；这不代表它从未改动，请查看来源覆盖。</p>
          ) : !shown.length ? (
            <p>
              没有符合筛选条件的记录。
              <button type="button" onClick={reset}>
                清除历史筛选
              </button>
            </p>
          ) : null}
          <VersionEvents data={data} rows={titleRows(groups.known)} anchorPrefix="tech-hist-" context={context} />
          {!!groups.unknown.length && (
            <section aria-label="适用范围待核">
              <h3>适用范围待核</h3>
              <p>以下记录不当作已确认适用于所选文明。</p>
              <VersionEvents data={data} rows={titleRows(groups.unknown)} anchorPrefix="tech-unknown-" context={context} />
            </section>
          )}
          {!!groups.mixed.length && (
            <section aria-label="冲突范围并列">
              <h3>冲突主张范围并列</h3>
              <p>保留双方主张，不用筛选裁定哪方为真。</p>
              <VersionEvents data={data} rows={titleRows(groups.mixed)} anchorPrefix="tech-hist-" context={context} />
            </section>
          )}
        </>
      )}
    </section>
  );
}

function TechsOverview({ data }: { data: CivUpdatesData }) {
  const [query, setQuery] = useSearchParams();
  const errors = techQueryErrors(data, query);
  const matches = new Set(searchUpdateTechs(data, query.get('histQuery') ?? '').map((e) => e.id));
  const rows = errors.length
    ? []
    : techCoverageRows(data).filter(
        (r) =>
          matches.has(r.entityId) &&
          (!query.has('techSourceState') || query.get('techSourceState') === r.sourceState) &&
          (!query.has('techIdentity') || data.entities.find((e) => e.id === r.entityId)?.status === query.get('techIdentity')),
      );
  return (
    <section className="tech-history civ-updates unit-updates" aria-label="科技历史来源目录">
      <h1>科技更新历史</h1>
      <Link to="/patches">更新历史总览</Link>
      {techHistoryReturn(data, query.get('histReturn')) && <Link to={techHistoryReturn(data, query.get('histReturn'))!}>返回上次历史结果</Link>}
      <p>{data.techs?.coverageNote}</p>
      <Recovery data={data} query={query} setQuery={setQuery} />
      <TechSearch key={query.get('histQuery') ?? ''} data={data} query={query} setQuery={setQuery} />
      <details className="civ-update-processing" open={query.get('histView') === 'techCoverage' || query.has('techSourceState')}>
        <summary>
          全部科技来源覆盖 · <span className="num nw">{data.techs?.catalogSize ?? '未知'} 个当前目录 ID</span>
        </summary>
        <p>
          当前目录指纹 <code>{data.techs?.directorySha256}</code>
        </p>
        <p>独立科技来源页未检查；关联章节、原件处理和事实核验分别列示。退役身份不计当前目录分母。</p>
        <label>
          科技身份范围
          <select value={query.get('techIdentity') ?? ''} onChange={(e) => setQuery(setHistoryQuery(query, 'techIdentity', e.target.value))}>
            <option value="">当前与退役</option>
            <option value="current">当前目录</option>
            <option value="retired">退役身份</option>
          </select>
        </label>
        <label>
          科技独立来源状态
          <select value={query.get('techSourceState') ?? ''} onChange={(e) => setQuery(setHistoryQuery(query, 'techSourceState', e.target.value))}>
            <option value="">全部来源状态</option>
            {Object.entries(TECH_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setQuery(setHistoryQuery(query, 'techSourceState', ''))}>
          清除覆盖筛选
        </button>
        <p role="status">
          当前匹配 <span className="num nw">{rows.length} 个科技</span>。独立来源与文明关联证据分开；目录外身份不计分母。
        </p>
        <ul className="unit-coverage-list">
          {rows.map((r) => (
            <li key={r.entityId}>
              <Link
                to={techHistoryPath(
                  data,
                  r.entityId,
                  query,
                  'overview',
                  techHistoryReturn(data, '/patches?' + new URLSearchParams([...query].filter(([key]) => key !== 'histReturn')).toString()) ?? undefined,
                )}
              >
                {data.entities.find((e) => e.id === r.entityId)?.nameZh} <span className="num nw">ID {r.entityId.split('/')[1]}</span>
              </Link>
              <p>
                {TECH_SOURCE_LABELS[r.sourceState]} · <span className="num nw">{r.eventIds.length} 个事件</span>
              </p>
              <EvidenceSummary data={data} entityId={r.entityId} />
              <p>
                <UpdateText>{r.reason}</UpdateText>
              </p>
            </li>
          ))}
        </ul>
        {!rows.length && <p>没有符合搜索或来源状态的科技；可清除覆盖筛选或搜索。</p>}
      </details>
    </section>
  );
}

export function TechUpdates({ entityId }: { entityId?: string }) {
  const state = useCivUpdates();
  const [query, setQuery] = useSearchParams();
  if (!state.data) return <TechLoading error={state.error} retry={state.retry} />;
  const errors = techQueryErrors(state.data, query, true, entityId);
  if (errors.length)
    return (
      <section className="tech-history civ-updates">
        <h2>科技历史地址需要修复</h2>
        <Recovery data={state.data} query={query} setQuery={setQuery} detailId={entityId} />
      </section>
    );
  const selected = entityId ?? (query.has('obj') ? 'tech/' + query.get('obj')!.slice(5) : query.get('histEntity'));
  return (
    <>
      {state.error && <TechLoading error retry={state.retry} />}
      {selected ? <TechReader data={state.data} entityId={selected} overview={!entityId} retry={state.retry} /> : <TechsOverview data={state.data} />}
    </>
  );
}
