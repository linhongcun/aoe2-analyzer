import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { civs } from '../../data';
import { useCore } from '../../data/hooks';
import { usePatchArchives } from '../../data/patchHistory';
import { archiveOrderingDate, historyCoverage, type PatchArchive } from '../../domain/patchHistory';
import {
  ARCHIVE_KIND_LABEL,
  ARCHIVE_KINDS,
  PATCH_FILTER_KEYS,
  PATCH_TYPES,
  civSelection,
  filterPatch,
  groupTreeChanges,
  treeChangeLabel,
  partitionByStatedCiv,
  patchTarget,
  statedCivIds,
  type PatchEntry,
} from '../../domain/patches';
import { Icon } from '../../shared/ui/Icon';
import { EntryBody, civZh } from './patchParts';
import { useCivUpdates } from '../../data/civUpdates';
import { historyArchiveFallback, historyReaderPath, projectReaderEvents } from '../../domain/historyReader';
import { safeHistorySourceUrl } from '../../domain/civUpdates';
import { SourceTime } from '../../shared/ui/CivUpdatePrimitives';
import { canPopHistoryReturn, HistoryReaderLink, historyVisitKey, rememberHistoryVisit, savedHistoryVisit } from '../../shared/ui/HistoryReaderLink';
import { Breadcrumbs } from '../../shared/ui/layout';
import { HistoryReader } from './HistoryReader';
import './patches.css';

const UNREVIEWED = '本档案尚未完成逐条原文核对。来源冲突的条目会单独标明，不会按数值改写档案标记。';
const PINNED = '本站数值按此版本固定。这不表示本档案已收录该版本的全部官方说明，也不表示本站是完整更新史。';
const KNOWN_CIVS = civs.map((civ) => civ.en);
const canonicalSearch = (search: string) => {
  const params = new URLSearchParams(search);
  return params.size ? '?' + params.toString() : '';
};

function hasFilter(params: URLSearchParams) {
  return PATCH_FILTER_KEYS.some((key) => (params.get(key) ?? '').trim().length > 0);
}

function clearFilterParams(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  for (const key of PATCH_FILTER_KEYS) next.delete(key);
  return next;
}

function ArchiveDate({ archive }: { archive: PatchArchive }) {
  return (
    <div className="history-archive-dates">
      <p>
        {archive.releaseType === 'release' ? '正式版' : archive.releaseType === 'pup' ? '公开预览' : archive.releaseType === 'hotfix' ? '热修' : '类别未知'}
      </p>
      <p>
        官方发行日（公告当地日期）：
        <SourceTime value={archive.releaseDate ?? null} />
      </p>
      {archive.date && (
        <p>
          档案日期：
          <SourceTime value={archive.date} />
        </p>
      )}
      {archive.publishedAt && (
        <p>
          网页发布时间：
          <SourceTime value={archive.publishedAt} />
        </p>
      )}
      {archive.sourcePublishedAt && (
        <p>
          来源发布时间（原时区）：
          <SourceTime value={archive.sourcePublishedAt} />
        </p>
      )}
    </div>
  );
}

function coverageText(archive: PatchArchive) {
  const text = historyCoverage(archive).trim();
  return text || '这份档案没有填写收录范围。';
}

function PatchLoading({ error, retry }: { error: boolean; retry: () => void }) {
  return (
    <section className="pane patches">
      <h1 className="page-heading">更新历史</h1>
      {error ? (
        <>
          <p role="alert">更新历史加载失败，请重试。</p>
          <button type="button" onClick={retry}>
            重试
          </button>
        </>
      ) : (
        <p role="status">正在加载更新历史</p>
      )}
    </section>
  );
}

function ArchiveList({ from }: { from: string }) {
  const { archives, error, retry } = usePatchArchives();
  const [oldest, setOldest] = useState(false);
  const pinned = String(__DATA_SOURCES__.patch.build);
  const versions = [...(archives ?? [])].sort(
    (a, b) => (oldest ? 1 : -1) * archiveOrderingDate(a).localeCompare(archiveOrderingDate(b)) || a.id.localeCompare(b.id),
  );
  return (
    <section className="history-archives" aria-labelledby="history-archives">
      <h2 id="history-archives" tabIndex={-1}>
        版本档案
      </h2>
      <p>档案与对象时间线各自保留原记录，不合并计数。</p>
      {error ? (
        <>
          <p role="alert">版本档案加载失败。</p>
          <button type="button" onClick={retry}>
            重试版本档案
          </button>
        </>
      ) : !archives ? (
        <p role="status">正在加载版本档案</p>
      ) : (
        <>
          <label>
            档案排序{' '}
            <select value={oldest ? 'oldest' : 'newest'} onChange={(e) => setOldest(e.target.value === 'oldest')}>
              <option value="newest">新到旧</option>
              <option value="oldest">旧到新</option>
            </select>
          </label>
          <div className="patch-versions">
            {versions.map((archive) => (
              <article className="patch-version" key={archive.id} data-testid="patch-version-card">
                <HistoryReaderLink to={`/patches/${archive.id}`} from={from} id={'history-archive-' + archive.id}>
                  <h3>
                    DE Update <span className="num nw">{archive.id}</span>
                  </h3>
                  <ArchiveDate archive={archive} />
                  {archive.id === pinned && <p className="patch-pin">当前数据版本</p>}
                  <p>收录范围：{coverageText(archive)}</p>
                  <p>
                    本档案 <span className="num nw">{archive.entries.length} 条</span>
                  </p>
                </HistoryReaderLink>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MissingVersion({ id }: { id: string }) {
  return (
    <section className="pane patches">
      <h1>找不到版本 {id}</h1>
      <Link to="/patches">返回更新历史</Link>
    </section>
  );
}

function VersionReading({ archive }: { archive: PatchArchive }) {
  const core = useCore();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigationType();
  const { data, error } = useCivUpdates();
  const readerPrefix = '/patches?';
  const fromState = typeof location.state?.historyFrom === 'string' && location.state.historyFrom.startsWith(readerPrefix) ? location.state.historyFrom : null;
  const versionList = '/patches?read=versions';
  const browseFrom = data && fromState ? historyArchiveFallback(data, new URLSearchParams(fromState.slice(readerPrefix.length))) : versionList;
  const checkingReturn = fromState && fromState !== versionList && !data && !error;
  const from = location.pathname + canonicalSearch(location.search);
  const safeSource = safeHistorySourceUrl(archive.source);
  useEffect(() => {
    if (navigation !== 'POP' || !data) return;
    const saved = savedHistoryVisit(location);
    if (!saved?.focusId?.startsWith('archive-object-')) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(saved.focusId!)?.focus({ preventScroll: true });
      window.scrollTo(0, saved.y);
      rememberHistoryVisit(location, { y: saved.y });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, location, navigation]);
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const [filterOpen, setFilterOpen] = useState(() => hasFilter(params));
  const [civSearch, setCivSearch] = useState('');
  const [civOpen, setCivOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = draft?.base === params.toString() ? draft.value : (params.get('q') ?? '');
  const filtered = hasFilter(params);
  const filtersOpen = filtered || filterOpen;
  useEffect(() => {
    if (!draft || draft.base !== params.toString()) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft.value) next.set('q', draft.value);
      else next.delete('q');
      setParams(next, { replace: true, state: location.state });
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, location.state, params, setParams]);
  const selected = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const toggle = (key: string, value: string) => {
    const values = selected(key);
    const next = new URLSearchParams(params);
    const changed = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    if (changed.length) next.set(key, changed.join(','));
    else next.delete(key);
    setParams(next, { replace: true, state: location.state });
  };
  const clear = () => {
    setParams(clearFilterParams(params), { replace: true, state: location.state });
    setDraft(null);
    setFilterOpen(false);
  };
  const selection = civSelection(params, KNOWN_CIVS);
  const shown = filterPatch(archive.entries, params, KNOWN_CIVS);
  const groups = selection.requested.length ? partitionByStatedCiv(shown, selection.recognized) : null;
  const treeChanges = groupTreeChanges(shown);
  const pinned = archive.id === String(__DATA_SOURCES__.patch.build);
  const options = civs.filter((civ) => !selection.recognized.includes(civ.en) && `${civ.zh} ${civ.en}`.toLowerCase().includes(civSearch.toLowerCase()));
  const pick = (en: string) => {
    toggle('civ', en);
    setCivSearch('');
    setActive(0);
  };
  const entries = (list: PatchEntry[]) =>
    list.map((entry) => (
      <article className={`patch-entry patch-${entry.kind}`} key={entry.id} data-entry={entry.id} data-civs={statedCivIds(entry).join(',')}>
        <EntryBody entry={entry} core={core} />
        {(() => {
          const matches = data?.entities.filter((entity) => entity.type === entry.targetType && entity.catalogId === String(entry.targetId)) ?? [];
          const entity = matches.length === 1 ? matches[0] : undefined;
          const mapping = data?.legacyMap.find((row) => row.patchId === archive.id && row.entryId === entry.id);
          const id =
            data && entity && mapping?.eventId && projectReaderEvents(data, entity).some((r) => r.event.id === mapping.eventId) ? mapping.eventId : undefined;
          return (
            entity && (
              <HistoryReaderLink from={from} to={historyReaderPath(entity.id, undefined, id, from)} id={'archive-object-' + entry.id}>
                在对象时间线阅读
              </HistoryReaderLink>
            )
          );
        })()}
      </article>
    ));
  return (
    <section className="pane patches patches-read">
      <p className="patch-eyebrow">
        {checkingReturn ? <span role="status">正在恢复更新历史来处…</span> : (
          <Link to={browseFrom} onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && fromState && canPopHistoryReturn(location.state, fromState)) {
              e.preventDefault();
              navigate(-1);
            }
          }}>更新历史</Link>
        )}
      </p>
      <h1>
        DE Update <span className="num nw">{archive.id}</span>
      </h1>
      <ArchiveDate archive={archive} />
      <p>收录范围：{coverageText(archive)}</p>
      {pinned && (
        <p>
          <span className="patch-pin">当前数据版本</span> {PINNED}
        </p>
      )}
      {archive.id === '185872' && <p>{UNREVIEWED}</p>}
      <details className="patch-tree-summary">
        <summary>按文明汇总科技树开放与移除</summary>
        {!treeChanges.size && <p role="status">当前筛选下没有科技树开放或移除项。</p>}
        {civs
          .filter((civ) => treeChanges.has(civ.en))
          .map((civ) => (
            <section key={civ.en} aria-label={`${civ.zh}科技树开放与移除`}>
              <h4>
                <Link to={`/civ/${civ.en}?tab=techtree`}>{civ.zh}</Link>
              </h4>
              <ul>
                {treeChanges.get(civ.en)!.map((entry) => (
                  <li key={entry.id}>
                    <Link to={patchTarget(entry)}>{entry.targetNameZh}</Link>
                    <p>{treeChangeLabel(entry)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </details>
      <details
        className="patch-filters"
        open={filtersOpen}
        onToggle={(event) => {
          if (filtered) return;
          setFilterOpen(event.currentTarget.open);
        }}
      >
        <summary>筛选本版</summary>
        <label>
          搜索改动
          <input value={search} onChange={(event) => setDraft({ base: params.toString(), value: event.target.value })} placeholder="名称或摘要" />
        </label>
        <fieldset>
          <legend>按档案标记筛选（人工标记，不是对局评价）</legend>
          <div className="patch-chips">
            {ARCHIVE_KINDS.map((kind) => (
              <button key={kind} type="button" aria-pressed={selected('kind').includes(kind)} onClick={() => toggle('kind', kind)}>
                {ARCHIVE_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>游戏修复（记录修正，与上面的档案标记分开）</legend>
          <div className="patch-chips">
            <button type="button" aria-pressed={params.get('ctype') === 'fix'} onClick={() => toggle('ctype', 'fix')}>
              游戏修复
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>目标类型</legend>
          <div className="patch-chips">
            {Object.entries(PATCH_TYPES).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={selected('type').includes(key)} onClick={() => toggle('type', key)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>适用文明（可多选，取并集）</legend>
          <div className="patch-chips">
            {selection.recognized.map((en) => (
              <button key={en} type="button" onClick={() => toggle('civ', en)} aria-label={`移除${civZh(en)}`}>
                {civZh(en)}
                <Icon name="x" />
              </button>
            ))}
          </div>
          <div
            className="patch-combo"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setCivOpen(false);
            }}
          >
            <input
              role="combobox"
              aria-label="搜索文明"
              placeholder="搜索文明"
              aria-expanded={civOpen}
              aria-controls="patch-civ-options"
              aria-autocomplete="list"
              aria-activedescendant={civOpen && options[active] ? `patch-civ-${options[active]!.en}` : undefined}
              value={civSearch}
              onFocus={() => setCivOpen(true)}
              onChange={(event) => {
                setCivSearch(event.target.value);
                setActive(0);
                setCivOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setCivOpen(false);
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCivOpen(true);
                  setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
                }
                if (event.key === 'Enter' && civOpen && options[active]) {
                  event.preventDefault();
                  pick(options[active]!.en);
                }
              }}
            />
            {civOpen && (
              <div id="patch-civ-options" role="listbox" aria-label="文明选项">
                {options.map((civ, index) => (
                  <button
                    type="button"
                    role="option"
                    id={`patch-civ-${civ.en}`}
                    aria-selected={false}
                    className={index === active ? 'active' : undefined}
                    key={civ.en}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(civ.en)}
                  >
                    {civ.zh} <small>{civ.en}</small>
                  </button>
                ))}
                {!options.length && <p role="status">没有找到「{civSearch}」相关的文明</p>}
              </div>
            )}
          </div>
        </fieldset>
        <button type="button" onClick={clear}>
          清除筛选
        </button>
      </details>
      {selection.allUnknown ? (
        <div>
          <p role="alert">找不到这些文明，不能当作查看全部改动。</p>
          <button type="button" onClick={clear}>
            清除筛选
          </button>
        </div>
      ) : (
        <>
          {selection.unknown.map((id) => (
            <p key={id} role="status">
              无法识别文明 {id}，已从本次筛选中忽略。
            </p>
          ))}
          {!shown.length && (
            <div>
              <h2>没有符合筛选条件的改动</h2>
              <button type="button" onClick={clear}>
                清除筛选
              </button>
            </div>
          )}
          {groups ? (
            <>
              {groups.stated.length > 0 && (
                <section data-testid="patch-stated" aria-label={`写明适用于${selection.recognized.map(civZh).join('、')}`}>
                  <h2>
                    写明适用于{selection.recognized.map(civZh).join('、')} · <span className="num nw">{groups.stated.length}</span>
                  </h2>
                  {entries(groups.stated)}
                </section>
              )}
              {groups.unstated.length > 0 && (
                <section data-testid="patch-unstated" aria-label="未写明适用文明">
                  <h2>
                    未写明适用文明 · <span className="num nw">{groups.unstated.length}</span>
                  </h2>
                  <p>这些条目没有列出文明，不能当成所选文明的专属改动，也不从当前科技树反推。</p>
                  {entries(groups.unstated)}
                </section>
              )}
            </>
          ) : (
            entries(shown)
          )}
        </>
      )}
      <p>
        {safeSource ? (
          <a href={safeSource} target="_blank" rel="noopener noreferrer">
            官方完整说明
          </a>
        ) : (
          '来源链接缺失'
        )}
      </p>
    </section>
  );
}

function VersionPage({ id }: { id: string }) {
  const { archives, error, retry } = usePatchArchives();
  if (!archives) return <PatchLoading error={error} retry={retry} />;
  const archive = archives.find((item) => item.id === id);
  return archive ? <VersionReading key={archive.id} archive={archive} /> : <MissingVersion id={id} />;
}

const archiveVisits = new Set<string>();
function ReaderPage() {
  const location = useLocation();
  const navigation = useNavigationType();
  const visitKey = historyVisitKey(location);
  const archiveParams = new URLSearchParams(location.search);
  archiveParams.delete('histReturn');
  const archiveFrom = archiveParams.size ? '/patches?' + archiveParams.toString() : '/patches?read=versions';
  const [archives, setArchives] = useState<{ key: string; active: boolean }>();
  const active = archives?.key === visitKey ? archives.active :
    archiveVisits.has(visitKey) || new URLSearchParams(location.search).get('read') === 'versions';
  const [opened, setOpened] = useState({ archives: active, objects: !active });
  useEffect(() => {
    if (!active || navigation !== 'POP') return;
    const saved = savedHistoryVisit(location);
    if (!saved?.focusId?.startsWith('history-archive-')) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(saved.focusId!)?.focus({ preventScroll: true });
      window.scrollTo(0, saved.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, location, navigation]);
  function select(next: boolean) {
    if (next) {
      archiveVisits.add(visitKey);
      if (archiveVisits.size > 60) archiveVisits.delete(archiveVisits.keys().next().value!);
    } else archiveVisits.delete(visitKey);
    setArchives({ key: visitKey, active: next });
    setOpened((current) => ({ archives: current.archives || next, objects: current.objects || !next }));
  }
  return <section className="pane patches history-reader">
    <Breadcrumbs />
    <h1 className="page-heading" id="history-page-title" tabIndex={-1}>更新历史</h1>
    <p>按对象和版本阅读已收录的变化。部分收录；未收录不代表从未改动。</p>
    <div className="history-controls" role="group" aria-label="阅读方式">
      <button type="button" aria-pressed={!active} onClick={() => select(false)}>按对象</button>
      <button type="button" aria-pressed={active} onClick={() => select(true)}>按版本</button>
    </div>
    <div hidden={active}>{(!active || opened.objects) && <HistoryReader active={!active} />}</div>
    <div hidden={!active}>{(active || opened.archives) && <ArchiveList from={archiveFrom} />}</div>
  </section>;
}

export default function Patches() {
  const { id } = useParams();
  return id ? <VersionPage id={id} /> : <ReaderPage />;
}
