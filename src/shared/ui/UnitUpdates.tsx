import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCivUpdates } from '../../data/civUpdates';
import { VERIFICATION_LABELS, setHistoryQuery, type CivUpdatesData } from '../../domain/civUpdates';
import {
  UNIT_CONDITIONS,
  UNIT_FILTER_KEYS,
  UNIT_SOURCE_LABELS,
  clearUnitFilters,
  filterUnitEvents,
  projectUnitEvents,
  partitionUnitScopes,
  searchUpdateUnits,
  unitHistoryPath,
  unitHistoryReturn,
  unitQueryError,
  unitCoverageQueryError,
  type UnitEventView,
  type UnitSourceState,
} from '../../domain/unitUpdates';
import { UpdateEventCard } from './CivUpdates';
import { SourceTime, UpdateText } from './CivUpdatePrimitives';
import { HistoryEntityLinks } from './HistoryEntityLinks';
import './unit-updates.css';

function Loading({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? (
    <div>
      <p role="alert">单位更新历史读取失败，请检查连接后重试。筛选与对象地址已保留。</p>
      <button type="button" onClick={retry}>
        重试单位历史
      </button>
    </div>
  ) : (
    <p role="status">正在读取单位更新历史，请稍候。</p>
  );
}

export function UnitObjectSearch({ data }: { data: CivUpdatesData }) {
  const [query, setQuery] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const id = useId();
  const options = searchUpdateUnits(data, query.get('histQuery') ?? '').slice(0, 30);
  const pick = (entityId: string) => {
    setOpen(false);
    navigate(unitHistoryPath(entityId, query, 'overview', undefined, data));
    requestAnimationFrame(() => document.getElementById('unit-history-title')?.focus());
  };
  return (
    <div className="unit-history-search">
      <label htmlFor={id}>搜索单位历史</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + '-options'}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        placeholder="当前名称、历史名称或单位 ID"
        value={query.get('histQuery') ?? ''}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(setHistoryQuery(query, 'histQuery', e.target.value), { replace: true });
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((n) => Math.max(0, Math.min(options.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))));
          }
          if (e.key === 'Enter' && open && options[active]) {
            e.preventDefault();
            pick(options[active]!.id);
          }
        }}
      />
      {open && (
        <div id={id + '-options'} role="listbox" aria-label="单位历史搜索结果">
          {options.map((entity, i) => (
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              key={entity.id}
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(entity.id)}
            >
              {entity.nameZh} · <span className="num nw">ID {entity.catalogId}</span>
              <small>
                {entity.nameEn} · {entity.status === 'retired' ? '历史身份' : '独立形态'}
                {entity.aliases.length ? ' · 历史名称：' + entity.aliases.join('、') : ''}
              </small>
            </button>
          ))}
          {!options.length && <p role="status">没有找到相关单位；可以清除搜索重新选择。</p>}
          {options.length === 30 && (
            <p>
              显示前 <span className="num nw">30 项</span>，请补充名称缩小范围。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Coverage({ data, entityId, displayedAnchors }: { data: CivUpdatesData; entityId: string; displayedAnchors: ReadonlyMap<string, string> }) {
  const row = data.units?.rows.find((r) => r.entityId === entityId);
  const own = data.sections.filter((s) => row?.sectionIds.includes(s.id));
  const ids = new Set(own.flatMap((s) => s.entryIds));
  const entries = data.sourceEntries.filter((e) => ids.has(e.id));
  return (
    <details className="civ-update-processing">
      <summary>来源覆盖与逐条处理{row && <> · {UNIT_SOURCE_LABELS[row.sourceState]}</>}</summary>
      <p>
        <UpdateText>{row?.reason ?? '此历史身份没有独立单位页覆盖；保留已知旧档案，不映射到当前同名单位。'}</UpdateText>
      </p>
      <p>
        检查时间：
        <SourceTime value={row?.checkedAt ?? null} missing="未检查" />
      </p>
      <p>
        独立单位页原始条目：<span className="num nw">{row?.sourceEntryCount ?? '未统计'}</span>；现有文明来源章节：
        <span className="num nw">{row?.relatedSectionIds.length ?? 0}</span>。未检查、缺页和已读无日志是不同状态。
      </p>
      <p>来源处理完成不等于游戏事实已核实；混合条目按版本/形态拆分，排除项仍保留。</p>
      {entries.map((entry) => (
        <article key={entry.id} className="civ-update-source">
          <p>
            <UpdateText>{entry.locator}</UpdateText> · {{ mapped: '已映射', pending: '待核', excluded: '已排除' }[entry.processing]}
          </p>
          <blockquote>
            <UpdateText>{entry.originalText ?? '未登记原文'}</UpdateText>
          </blockquote>
          <p>
            <UpdateText>{entry.reason}</UpdateText>
          </p>
          <p>
            对应 <span className="num nw">{entry.eventIds.length} 个事件</span>
          </p>
          {entry.eventIds
            .filter((id) => displayedAnchors.has(id))
            .map((id) => (
              <button
                type="button"
                key={id}
                aria-controls={displayedAnchors.get(id)}
                onClick={() => document.getElementById(displayedAnchors.get(id)!)?.scrollIntoView({ block: 'center' })}
              >
                定位已显示事件
              </button>
            ))}
          {entry.eventIds.some((id) => !displayedAnchors.has(id)) && (
            <p>
              另有 <span className="num nw">{entry.eventIds.filter((id) => !displayedAnchors.has(id)).length} 个关联事件</span>
              未在当前身份或筛选结果中显示；可切换形态或调整筛选。
            </p>
          )}
        </article>
      ))}
    </details>
  );
}

export function VersionEvents({
  data,
  rows,
  anchorPrefix = 'hist-',
  context,
}: {
  data: CivUpdatesData;
  rows: UnitEventView[];
  anchorPrefix?: string;
  context?: (row: UnitEventView) => React.ReactNode;
}) {
  const groups = new Map<string | null, UnitEventView[]>();
  rows.forEach((row) => groups.set(row.event.versionId, [...(groups.get(row.event.versionId) ?? []), row]));
  return [...groups].map(([versionId, views]) => {
    const version = data.versions.find((v) => v.id === versionId);
    return (
      <section className="civ-update-version" key={versionId ?? 'unknown'} aria-label={version?.label ?? '未登记版本'}>
        <div className="civ-update-version-heading">
          <h3>
            <UpdateText>{version?.label ?? '未登记版本'}</UpdateText>
          </h3>
          <span className="civ-update-pill">
            {version?.channel ? { release: '正式', pup: 'PUP', hotfix: '热修', unknown: '版本类别待核' }[version.channel] : '版本类别待核'}
          </span>
          <span>
            发行日期：
            <SourceTime value={version?.releaseDate ?? null} />
          </span>
        </div>
        {version && (
          <p className="note">
            {version.orderReason ??
              (version.build !== null
                ? '按来源明示的 build 排序；日期和版本类别未登记时保持未知。'
                : version.orderKey
                  ? '按已登记版本顺序；不是采集时间或推测发布日期。'
                  : '版本无法比较，列在可排序版本之后。')}
          </p>
        )}
        {views.map(({ event, original, relations }) => (
          <div key={event.id}>
            {relations.some((r) => r.relation !== 'direct') && (
              <p className="civ-update-warning">
                {relations
                  .filter((r) => r.relation !== 'direct')
                  .map((r) => r.note)
                  .join('；')}
              </p>
            )}
            <UpdateEventCard data={data} event={event} sourceEvent={original} anchorId={anchorPrefix + event.id} />
            {context?.({ event, original, relations, unknownScope: false })}
            {!context && <HistoryEntityLinks data={data} event={event} />}
          </div>
        ))}
      </section>
    );
  });
}

export function UnitUpdatesReader({ data, entityId, overview = false }: { data: CivUpdatesData; entityId: string; overview?: boolean }) {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const [copy, setCopy] = useState<{ path: string; text: string; manualUrl?: string }>();
  const request = useRef(0);
  const entity = data.entities.find((r) => r.id === entityId && r.type === 'unit');
  const row = data.units?.rows.find((r) => r.entityId === entityId);
  const error = unitQueryError(data, query);
  const all = projectUnitEvents(data, entityId);
  const shown = filterUnitEvents(data, entityId, query);
  const { known, unknown, mixed } = query.has('histCiv') ? partitionUnitScopes(shown) : { known: shown, unknown: [], mixed: [] };
  const displayedAnchors = new Map([
    ...unknown.map((row) => [row.event.id, 'hist-scope-unknown-' + row.event.id] as const),
    ...known.concat(mixed).map((row) => [row.event.id, 'hist-' + row.event.id] as const),
  ]);
  const anchor = displayedAnchors.get(query.get('histEvent') ?? '');
  useEffect(() => {
    if (anchor) {
      const node = document.getElementById(anchor);
      node?.scrollIntoView({ block: 'center' });
      node?.focus({ preventScroll: true });
    }
  }, [anchor]);
  const returnPath = unitHistoryReturn(query.get('histReturn'), data);
  const sharePath = unitHistoryPath(entityId, query, overview ? 'overview' : 'detail', undefined, data);
  const currentPath =
    unitHistoryReturn(location.pathname + '?' + new URLSearchParams([...query].filter(([key]) => key !== 'histReturn')).toString(), data) ?? '/patches';
  useEffect(() => {
    request.current += 1;
  }, [sharePath]);
  if (!entity || !data.units)
    return (
      <section className="unit-updates">
        <h2>未定位到该单位历史身份</h2>
        <p>不会按同名或当前属性猜测历史身份。</p>
        <Link to="/patches">返回更新历史</Link>
      </section>
    );
  const set = (key: string, value: string) => setQuery(setHistoryQuery(query, key, value));
  const share = async () => {
    const seq = ++request.current;
    const url = new URL(window.location.href);
    url.hash = sharePath;
    try {
      await navigator.clipboard.writeText(url.href);
      if (seq === request.current) setCopy({ path: sharePath, text: '已复制当前历史地址' });
    } catch {
      if (seq === request.current) setCopy({ path: sharePath, text: '复制失败，请手动复制分享地址', manualUrl: url.href });
    }
  };
  const nameEvent = (view: UnitEventView) => ({
    ...view,
    event: {
      ...view.event,
      summary:
        entity.nameZh +
        ' · ' +
        [
          ...new Set(
            view.event.claims.flatMap((c) =>
              c.effects.map((f) => (f.type === 'numeric' || f.type === 'bonus' ? f.attribute : f.type === 'rename' ? '名称变化' : f.text)),
            ),
          ),
        ].join('；'),
    },
  });
  return (
    <section className="unit-updates civ-updates" aria-label="单位更新历史" data-unit-history={entityId}>
      {overview && (
        <>
          <p>
            <Link to="/patches">更新历史总览</Link>
          </p>
          <h1 id="unit-history-title" tabIndex={-1}>
            {entity.nameZh} · 更新历史
          </h1>
          <UnitObjectSearch data={data} />
        </>
      )}
      {!overview && (
        <p id="unit-history-title" tabIndex={-1}>
          {entity.nameZh} · 单位历史身份
        </p>
      )}
      <div className="unit-history-actions">
        <span className="civ-update-pill num nw">ID {entity.catalogId}</span>
        <span className="civ-update-pill">{all.length ? '部分收录' : '尚未收录'}</span>
        <span className="civ-update-pill">{row ? UNIT_SOURCE_LABELS[row.sourceState] : '历史身份'}</span>
        <Link to={unitHistoryPath(entityId, query, overview ? 'detail' : 'overview', currentPath, data)}>
          {overview ? '打开单位详情' : '在更新历史总览查看'}
        </Link>
        {returnPath && <Link to={returnPath}>返回上次历史结果</Link>}
        <button type="button" disabled={!!error} onClick={share}>
          复制历史分享地址
        </button>
      </div>
      <p role="status">{copy?.path === sharePath ? copy.text : ''}</p>
      {copy?.path === sharePath && copy.manualUrl && (
        <label>
          手动复制分享地址
          <input readOnly value={copy.manualUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <p>{data.units.coverageNote}</p>
      <p className="note">
        <UpdateText>{row?.identityNote ?? entity.identityNote}</UpdateText>
      </p>
      {entity.aliases.length > 0 && <p>历史名称：{entity.aliases.join('、')}</p>}
      {row && row.familyIds.length > 1 && (
        <nav className="unit-history-actions" aria-label="单位形态与独立身份">
          {row.familyIds.map((id) => (
            <Link
              key={id}
              aria-current={id === entityId ? 'page' : undefined}
              to={unitHistoryPath(id, query, overview ? 'overview' : 'detail', returnPath ?? undefined, data)}
            >
              {data.entities.find((e) => e.id === id)?.nameZh} · <span className="num nw">ID {id.split('/')[1]}</span>
            </Link>
          ))}
        </nav>
      )}
      <Coverage data={data} entityId={entityId} displayedAnchors={displayedAnchors} />
      <details className="civ-update-processing" open={UNIT_FILTER_KEYS.some((key) => query.has(key)) || !!error}>
        <summary>筛选已收录的单位历史</summary>
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
            事实核验
            <select value={query.get('histVerification') ?? ''} onChange={(e) => set('histVerification', e.target.value)}>
              <option value="">全部核验状态</option>
              {Object.entries(VERIFICATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            文明关系
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
              {Object.entries(UNIT_CONDITIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
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
          <button type="button" onClick={() => setQuery(clearUnitFilters(query, data))}>
            清除历史筛选
          </button>
        </div>
      </details>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <p role="status">
            显示{' '}
            <span className="num nw">
              {shown.length} / {all.length} 个事件
            </span>{' '}
            · <span className="num nw">{new Set(shown.filter((r) => r.event.versionId).map((r) => r.event.versionId)).size} 个已知版本</span>；未登记版本{' '}
            <span className="num nw">{shown.filter((r) => r.event.versionId === null).length} 个</span>。完整原文可能提及其它形态，仅作证据。
          </p>
          {!all.length ? (
            <p>尚未收录该单位的更新历史。这不代表它从未改动；请查看来源覆盖说明。</p>
          ) : !shown.length ? (
            <p>没有符合筛选条件的记录。请调整条件或清除历史筛选；当前身份不会改变。</p>
          ) : null}
          <VersionEvents data={data} rows={known.map(nameEvent)} />
          {unknown.length > 0 && (
            <section aria-label="适用文明待核">
              <h3>适用范围待核</h3>
              <p>这些记录未明确适用文明，单独保留，不当作已确认适用于所选文明。</p>
              <VersionEvents data={data} rows={unknown.map(nameEvent)} anchorPrefix="hist-scope-unknown-" />
            </section>
          )}
          {mixed.length > 0 && (
            <section aria-label="冲突主张范围并列">
              <h3>冲突主张的适用范围并列</h3>
              <p>同一冲突含已登记与待核范围，完整保留双方主张；不把已登记效果改标为未知。</p>
              <VersionEvents data={data} rows={mixed.map(nameEvent)} />
            </section>
          )}
        </>
      )}
    </section>
  );
}

export function UnitUpdates({ entityId, overview = false }: { entityId: string; overview?: boolean }) {
  const state = useCivUpdates();
  return state.data ? <UnitUpdatesReader data={state.data} entityId={entityId} overview={overview} /> : <Loading error={state.error} retry={state.retry} />;
}

export function UnitUpdatesOverview() {
  const state = useCivUpdates();
  const [query, setQuery] = useSearchParams();
  const source = query.get('unitSourceState') ?? '';
  const error = unitCoverageQueryError(query);
  const setSource = (value: string) => setQuery(setHistoryQuery(query, 'unitSourceState', value));
  if (!state.data) return <Loading error={state.error} retry={state.retry} />;
  const data = state.data;
  const matches = new Set(searchUpdateUnits(data, query.get('histQuery') ?? '').map((e) => e.id));
  const rows = error ? [] : (data.units?.rows.filter((r) => matches.has(r.entityId) && (!source || r.sourceState === source)) ?? []);
  return (
    <section className="unit-updates" aria-label="单位历史来源目录">
      <h2>按单位查历史</h2>
      <p>{data.units?.coverageNote}</p>
      <UnitObjectSearch data={data} />
      <details className="civ-update-processing">
        <summary>
          查看单位目录与来源覆盖 · <span className="num nw">{data.units?.catalogSize ?? '未知'} 个 ID</span>
        </summary>
        <label>
          单位来源状态
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">全部来源状态</option>
            {Object.entries(UNIT_SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert">
            {error}{' '}
            <button type="button" onClick={() => setSource('')}>
              清除单位来源筛选
            </button>
          </p>
        )}
        <p role="status">
          显示 <span className="num nw">{rows.length} 个单位</span>；已有文明来源不会把未检查的单位独立来源页标成完成。
        </p>
        <ul className="unit-coverage-list">
          {rows.map((r) => (
            <li key={r.entityId}>
              <Link to={unitHistoryPath(r.entityId, query, 'overview', undefined, data)}>
                {data.entities.find((e) => e.id === r.entityId)?.nameZh} · <span className="num nw">ID {r.entityId.split('/')[1]}</span>
              </Link>
              <p>
                {UNIT_SOURCE_LABELS[r.sourceState as UnitSourceState]} · {r.eventIds.length ? '部分收录' : '尚未收录'} ·{' '}
                <span className="num nw">{r.eventIds.length} 个事件</span>
              </p>
              <p>
                <UpdateText>{r.reason}</UpdateText>
              </p>
            </li>
          ))}
        </ul>
        {!rows.length && <p>没有符合搜索与来源状态的单位。</p>}
      </details>
    </section>
  );
}
