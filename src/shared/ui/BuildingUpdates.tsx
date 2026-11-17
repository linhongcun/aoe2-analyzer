import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import { useCore } from '../../data/hooks';
import { VERIFICATION_LABELS, safeHistorySourceUrl, setHistoryQuery, type CivUpdatesData } from '../../domain/civUpdates';
import {
  BUILDING_FILTER_KEYS,
  BUILDING_SOURCE_LABELS,
  buildingHistoryPath,
  buildingHistoryReturn,
  buildingQueryErrors,
  clearBuildingFilters,
  filterBuildingEvents,
  projectBuildingEvents,
  recoverBuildingQuery,
  searchUpdateBuildings,
} from '../../domain/buildingUpdates';
import { UNIT_CONDITIONS, partitionUnitScopes, type UnitEventView } from '../../domain/unitUpdates';
import { SourceTime, UpdateText } from './CivUpdatePrimitives';
import { BuildingIcon } from './art';
import { VersionEvents } from './UnitUpdates';
import './unit-updates.css';
import './building-updates.css';

function BuildingLoading({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? (
    <div>
      <p role="alert">建筑更新历史读取失败；对象和筛选地址已保留，请重试。</p>
      <button type="button" onClick={retry}>
        重试建筑历史
      </button>
    </div>
  ) : (
    <p role="status">正在读取建筑更新历史</p>
  );
}

function BuildingSearch({
  data,
  query,
  setQuery,
}: {
  data: CivUpdatesData;
  query: URLSearchParams;
  setQuery: (q: URLSearchParams, options?: { replace: boolean }) => void;
}) {
  const id = useId();
  const core = useCore();
  const matches = searchUpdateBuildings(data, query.getAll('histQuery').length === 1 ? query.get('histQuery')! : '');
  return (
    <div className="unit-history-search">
      <label htmlFor={id}>搜索建筑历史</label>
      <input
        id={id}
        value={query.getAll('histQuery').length === 1 ? query.get('histQuery')! : ''}
        placeholder="建筑中英文名、历史别名或 ID"
        onChange={(e) => setQuery(setHistoryQuery(query, 'histQuery', e.target.value), { replace: true })}
      />
      {!!query.get('histQuery') && (
        <button type="button" onClick={() => setQuery(setHistoryQuery(query, 'histQuery', ''))}>
          清空搜索
        </button>
      )}
      <nav className="building-history-choices" aria-label="选择精确建筑身份">
        {matches.map((entity) => (
          <Link key={entity.id} to={buildingHistoryPath(data, entity.id, query, 'overview')}>
            {entity.catalogId && core?.buildingById[+entity.catalogId] && <BuildingIcon b={core.buildingById[+entity.catalogId]!} />}
            {entity.nameZh} <span className="num nw">ID {entity.catalogId ?? '未登记'}</span>
            <small>
              {entity.nameEn} · {entity.status === 'current' ? '独立建筑身份' : '历史身份'}
              {entity.aliases.length ? ' · ' + entity.aliases.join('、') : ''}
            </small>
          </Link>
        ))}
        {!matches.length && <p role="status">没有找到该建筑，可清除搜索或查看来源覆盖。</p>}
      </nav>
    </div>
  );
}

function Recovery({ data, query, setQuery }: { data: CivUpdatesData; query: URLSearchParams; setQuery: (q: URLSearchParams) => void }) {
  const errors = buildingQueryErrors(data, query);
  if (!errors.length) return null;
  const candidates = [...new Set([...query.getAll('obj').map((s) => s.replace(':', '/')), ...query.getAll('histEntity')])].filter((id) =>
    data.entities.some((e) => e.type === 'building' && e.id === id),
  );
  return (
    <div className="civ-update-warning" role="alert">
      <p>历史地址有重复、失效或不适用的参数：{errors.join('、')}。未显示旧对象结果。</p>
      <button type="button" onClick={() => setQuery(recoverBuildingQuery(data, query))}>
        仅清除错误参数
      </button>
      {candidates.map((id) => (
        <Link key={id} to={buildingHistoryPath(data, id, query, 'overview')}>
          选择{data.entities.find((e) => e.id === id)?.nameZh}
        </Link>
      ))}
    </div>
  );
}

function BuildingCoverage({
  data,
  entityId,
  anchors,
  reset,
}: {
  data: CivUpdatesData;
  entityId: string;
  anchors: ReadonlyMap<string, string>;
  reset: () => void;
}) {
  const row = data.buildings?.rows.find((r) => r.entityId === entityId);
  const sections = data.sections.filter((s) => row?.sectionIds.includes(s.id));
  const entries = data.sourceEntries.filter((e) => sections.some((s) => s.id === e.sectionId));
  return (
    <details className="civ-update-processing">
      <summary>来源覆盖与逐条处理 · {row ? BUILDING_SOURCE_LABELS[row.sourceState] : '目录外历史身份'}</summary>
      <p>
        <UpdateText>{row?.identityNote ?? '此身份不计入当前建筑目录分母，不按同名推定当前身份。'}</UpdateText>
      </p>
      <p>
        <UpdateText>{row?.reason ?? '仅保留已知历史证据，无当前独立来源覆盖行。'}</UpdateText>
      </p>
      {row?.sourceUrl && (
        <p>
          <a href={safeHistorySourceUrl(row.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
            索引已定位：{row.indexLabel}
          </a>
          ；索引检查时间 <SourceTime value={data.buildings?.sourceIndex.capturedAt ?? null} />
        </p>
      )}
      <p>
        独立来源检查时间：
        <SourceTime value={row?.checkedAt ?? null} missing="尚未检查" />
      </p>
      <p>
        独立建筑章节原文 <span className="num nw">{row?.sourceEntryCount ?? '未统计'} 条</span>；其他关联证据章节{' '}
        <span className="num nw">{row?.relatedSectionIds.length ?? 0} 个</span>。关联证据不会把独立建筑页标成完成。
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
          {e.eventIds.map((eventId) => {
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

function BuildingReader({ data, entityId, overview, retry }: { data: CivUpdatesData; entityId: string; overview: boolean; retry: () => void }) {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const [copy, setCopy] = useState<{ path: string; message: string; url?: string }>();
  const request = useRef(0);
  const entity = data.entities.find((e) => e.id === entityId && e.type === 'building');
  const row = data.buildings?.rows.find((r) => r.entityId === entityId);
  const errors = buildingQueryErrors(data, query);
  const all = projectBuildingEvents(data, entityId);
  const shown = filterBuildingEvents(data, entityId, query);
  const groups = query.has('histCiv') ? partitionUnitScopes(shown) : { known: shown, unknown: [], mixed: [] };
  const anchors = new Map([...groups.known, ...groups.mixed].map((r) => [r.event.id, 'building-hist-' + r.event.id]));
  groups.unknown.forEach((r) => {
    if (!anchors.has(r.event.id)) anchors.set(r.event.id, 'building-unknown-' + r.event.id);
  });
  const sharePath = buildingHistoryPath(data, entityId, query, overview ? 'overview' : 'detail');
  const currentQuery = new URLSearchParams(query);
  currentQuery.delete('histReturn');
  const currentPath = buildingHistoryReturn(data, location.pathname + '?' + currentQuery.toString());
  const back = buildingHistoryReturn(data, query.get('histReturn'));
  const reset = () => setQuery(clearBuildingFilters(query));
  useEffect(() => {
    request.current += 1;
  }, [sharePath]);
  const anchor = anchors.get(query.get('histEvent') ?? '');
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'center' });
  }, [anchor]);
  if (!entity || !data.buildings)
    return (
      <div>
        <h2>未定位到建筑历史身份</h2>
        <p>不按名称或当前属性猜测历史关系。</p>
        <Link to="/patches?histView=buildings">重新选择建筑</Link>
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
    rows.map((v) => ({
      ...v,
      event: {
        ...v.event,
        summary:
          entity.nameZh +
          ' · ' +
          [...new Set(v.event.claims.flatMap((c) => c.effects.map((f) => (f.type === 'numeric' || f.type === 'bonus' ? f.attribute : f.text))))].join('；'),
      },
    }));
  const context = (view: UnitEventView) => {
    const scopes = view.event.claims.flatMap((c) => c.effects.map((f) => f.scope ?? view.event.scope));
    const ids = new Set([...view.original.civRelations.map((r) => r.civId), ...scopes.flatMap((s) => [...s.providerCivIds, ...s.affectedCivIds])]);
    const backQuery = new URLSearchParams(currentQuery);
    backQuery.set('histEvent', view.event.id);
    const returnTo = buildingHistoryReturn(data, location.pathname + '?' + backQuery.toString());
    return (
      <nav className="unit-history-actions" aria-label="关联文明历史">
        {data.civilizations
          .filter((c) => ids.has(c.civId))
          .map((c) => {
            const target = new URLSearchParams({ tab: 'history' });
            if (view.event.versionId) target.set('histVersion', view.event.versionId);
            if (returnTo) target.set('histReturn', returnTo);
            return (
              <Link key={c.civId} to={'/civ/' + c.civId + '?' + target.toString()}>
                查看{c.nameZh}文明历史
              </Link>
            );
          })}
      </nav>
    );
  };
  return (
    <section className="building-history civ-updates unit-updates" aria-label="建筑更新历史" data-building-history={entityId}>
      {overview ? (
        <>
          <Link to="/patches?histView=buildings">建筑历史总览</Link>
          <h1>{entity.nameZh} · 更新历史</h1>
          <details>
            <summary>切换建筑</summary>
            <BuildingSearch data={data} query={query} setQuery={setQuery} />
          </details>
        </>
      ) : (
        <h3>{entity.nameZh} · 建筑历史身份</h3>
      )}
      <Recovery data={data} query={query} setQuery={setQuery} />
      <p>当前目录值与历史主张分开；这里的改动不参与当前游戏计算。</p>
      <div className="unit-history-actions">
        <span className="civ-update-pill num nw">ID {entity.catalogId ?? '未登记'}</span>
        <span className="civ-update-pill">{row ? BUILDING_SOURCE_LABELS[row.sourceState] : '目录外历史身份'}</span>
        {(!overview || row) && (
          <Link to={buildingHistoryPath(data, entityId, query, overview ? 'detail' : 'overview', currentPath ?? undefined)}>
            {overview ? '打开建筑详情' : '在更新历史总览查看'}
          </Link>
        )}
        {back && <Link to={back}>返回上次历史结果</Link>}
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
      <p>{data.buildings.coverageNote}</p>
      {row?.sourceState === 'read-failed' && (
        <div role="alert">
          <p>来源读取失败；以下保留既有快照，不当作空结果。</p>
          <button type="button" onClick={retry}>
            重新读取应用快照
          </button>
          <p>不会在前端重新采集站外历史页面；历史失败状态仍保留。</p>
        </div>
      )}
      <BuildingCoverage data={data} entityId={entityId} anchors={anchors} reset={reset} />
      <details className="civ-update-processing" open={BUILDING_FILTER_KEYS.some((key) => query.has(key)) || !!errors.length}>
        <summary>筛选已收录的建筑历史</summary>
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
          {query.has('histEvent') && !anchor && <p role="status">原事件位置不在当前结果中；已回到该建筑结果标题，可调整筛选。</p>}
          {!all.length ? (
            <p>尚未收录此建筑的已映射事件；不代表从未改动，请查看来源覆盖。</p>
          ) : !shown.length ? (
            <p>
              没有符合筛选的记录。
              <button type="button" onClick={reset}>
                清除历史筛选
              </button>
            </p>
          ) : null}
          <VersionEvents data={data} rows={titleRows(groups.known)} anchorPrefix="building-hist-" context={context} />
          {!!groups.unknown.length && (
            <section aria-label="适用范围待核">
              <h3>适用范围待核</h3>
              <p>以下记录不当作已确认适用于所选文明。</p>
              <VersionEvents data={data} rows={titleRows(groups.unknown)} anchorPrefix="building-unknown-" context={context} />
            </section>
          )}
          {!!groups.mixed.length && (
            <section aria-label="冲突范围并列">
              <h3>冲突主张范围并列</h3>
              <p>保留双方主张，不用筛选裁定哪方为真。</p>
              <VersionEvents data={data} rows={titleRows(groups.mixed)} anchorPrefix="building-hist-" context={context} />
            </section>
          )}
        </>
      )}
    </section>
  );
}

function BuildingsOverview({ data }: { data: CivUpdatesData }) {
  const [query, setQuery] = useSearchParams();
  const errors = buildingQueryErrors(data, query);
  const matches = new Set(searchUpdateBuildings(data, query.get('histQuery') ?? '').map((e) => e.id));
  const rows = errors.length
    ? []
    : (data.buildings?.rows.filter(
        (r) => matches.has(r.entityId) && (!query.has('buildingSourceState') || query.get('buildingSourceState') === r.sourceState),
      ) ?? []);
  return (
    <section className="building-history civ-updates unit-updates" aria-label="建筑历史来源目录">
      <h1>建筑更新历史</h1>
      <Link to="/patches">更新历史总览</Link>
      <p>{data.buildings?.coverageNote}</p>
      <Recovery data={data} query={query} setQuery={setQuery} />
      <BuildingSearch data={data} query={query} setQuery={setQuery} />
      <details className="civ-update-processing" open={query.get('histView') === 'buildingCoverage' || query.has('buildingSourceState')}>
        <summary>
          全部建筑来源覆盖 · <span className="num nw">{data.buildings?.catalogSize ?? '未知'} 个当前目录 ID</span>
        </summary>
        <p>
          当前目录指纹 <code>{data.buildings?.directorySha256}</code>
        </p>
        <p>
          来源索引指纹 <code>{data.buildings?.sourceIndex.documentSha256}</code>
        </p>
        <label>
          建筑独立来源状态
          <select value={query.get('buildingSourceState') ?? ''} onChange={(e) => setQuery(setHistoryQuery(query, 'buildingSourceState', e.target.value))}>
            <option value="">全部来源状态</option>
            {Object.entries(BUILDING_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setQuery(setHistoryQuery(query, 'buildingSourceState', ''))}>
          清除覆盖筛选
        </button>
        <p role="status">
          当前匹配 <span className="num nw">{rows.length} 个建筑</span>。独立来源与文明关联证据分开；目录外身份不计分母。
        </p>
        <ul className="unit-coverage-list">
          {rows.map((r) => (
            <li key={r.entityId}>
              <Link to={buildingHistoryPath(data, r.entityId, query, 'overview')}>
                {data.entities.find((e) => e.id === r.entityId)?.nameZh} <span className="num nw">ID {r.entityId.split('/')[1]}</span>
              </Link>
              <p>
                {BUILDING_SOURCE_LABELS[r.sourceState]} · <span className="num nw">{r.eventIds.length} 个事件</span>
              </p>
              <p>
                <UpdateText>{r.reason}</UpdateText>
              </p>
            </li>
          ))}
        </ul>
        {!rows.length && <p>没有符合搜索或来源状态的建筑；可清除覆盖筛选或搜索。</p>}
      </details>
    </section>
  );
}

export function BuildingUpdates({ entityId }: { entityId?: string }) {
  const state = useCivUpdates();
  const [query, setQuery] = useSearchParams();
  if (!state.data) return <BuildingLoading error={state.error} retry={state.retry} />;
  const errors = buildingQueryErrors(state.data, query);
  if (errors.length)
    return (
      <section className="building-history civ-updates">
        <h2>建筑历史地址需要修复</h2>
        <Recovery data={state.data} query={query} setQuery={setQuery} />
      </section>
    );
  const selected = entityId ?? (query.has('obj') ? 'building/' + query.get('obj')!.slice(9) : query.get('histEntity'));
  return (
    <>
      {state.error && <BuildingLoading error retry={state.retry} />}
      {selected ? <BuildingReader data={state.data} entityId={selected} overview={!entityId} retry={state.retry} /> : <BuildingsOverview data={state.data} />}
    </>
  );
}
