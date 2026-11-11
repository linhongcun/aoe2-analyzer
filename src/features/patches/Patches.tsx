import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { civByEn, civs, type Core } from '../../data';
import { useCore } from '../../data/hooks';
import { usePatchArchives } from '../../data/patchHistory';
import { historyCoverage, historyFor, resolveHistoryIdentity, type PatchArchive } from '../../domain/patchHistory';
import {
  ARCHIVE_KIND_LABEL,
  ARCHIVE_KINDS,
  PATCH_FILTER_KEYS,
  PATCH_TYPES,
  civSelection,
  filterPatch,
  groupTreeChanges,
  parseObjectParam,
  treeChangeLabel,
  partitionByStatedCiv,
  patchTarget,
  statedCivIds,
  type ObjectCandidate,
  type PatchEntry,
} from '../../domain/patches';
import { Icon } from '../../shared/ui/Icon';
import { Breadcrumbs } from '../../shared/ui/layout';
import { EntryBody, OBJECT_LABEL, ObjectSearch, civZh } from './patchParts';
import './patches.css';

const UNREVIEWED = '本档案尚未完成逐条原文核对。来源冲突的条目会单独标明，不会按数值改写档案标记。';
const PINNED = '本站数值按此版本固定。这不表示本档案已收录该版本的全部官方说明，也不表示本站是完整更新史。';
const KNOWN_CIVS = civs.map((civ) => civ.en);

function hasFilter(params: URLSearchParams) {
  return PATCH_FILTER_KEYS.some((key) => (params.get(key) ?? '').trim().length > 0);
}

function clearFilterParams(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  for (const key of PATCH_FILTER_KEYS) next.delete(key);
  return next;
}

function ArchiveDate({ archive }: { archive: PatchArchive }) {
  if (archive.releaseDate)
    return (
      <p>
        官方发行日（公告当地日期）{' '}
        <time className="num nw" dateTime={archive.releaseDate}>
          {archive.releaseDate}
        </time>
      </p>
    );
  return (
    <p>
      档案日期{' '}
      <time className="num nw" dateTime={archive.date}>
        {archive.date}
      </time>
      （不是已核对的官方发行日）
    </p>
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

function Browse({ archives }: { archives: PatchArchive[] }) {
  const core = useCore();
  const pinned = String(__DATA_SOURCES__.patch.build);
  const versions = [...archives].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="pane patches">
      <Breadcrumbs />
      <h1 className="page-heading">更新历史</h1>
      <p>先查一个文明、单位、建筑或科技，也可以按版本阅读已收录档案。没有收录，不代表从未改动。</p>
      <ObjectSearch archives={archives} core={core} />
      <div className="patch-versions">
        {versions.map((archive) => (
          <article className="patch-version" key={archive.id} data-testid="patch-version-card">
            <Link to={`/patches/${archive.id}`}>
              <h2>
                DE Update <span className="num nw">{archive.id}</span>
              </h2>
              <ArchiveDate archive={archive} />
              {archive.id === pinned && <p className="patch-pin">当前数据版本</p>}
              <p>收录范围：{coverageText(archive)}</p>
              <p>
                本档案 <span className="num nw">{archive.entries.length}</span> 条
              </p>
            </Link>
          </article>
        ))}
      </div>
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

function MissingObject() {
  return (
    <section className="pane patches" data-testid="patch-object-missing">
      <h1>找不到对象</h1>
      <Link to="/patches">返回更新历史</Link>
    </section>
  );
}

function catalogName(type: ObjectCandidate['type'], id: string, core: Core | null) {
  if (type === 'civ') return civByEn(id)?.zh;
  if (!core) return undefined;
  if (type === 'unit') return core.unitById[Number(id)]?.zh;
  if (type === 'building') return core.buildingById[Number(id)]?.zh;
  return core.techById[Number(id)]?.zh;
}

function ObjectTimeline({ archives, raw }: { archives: PatchArchive[]; raw: string | null }) {
  const core = useCore();
  const parsed = parseObjectParam(raw);
  if (!parsed) return <MissingObject />;
  const name = catalogName(parsed.type, parsed.id, core);
  const identity = resolveHistoryIdentity(archives, { targetType: parsed.type, targetId: parsed.id }, name);
  const waiting = parsed.type !== 'civ' && !name && !identity && !core;
  if (waiting)
    return (
      <section className="pane patches">
        <p role="status">正在加载目录</p>
      </section>
    );
  if (!identity) return <MissingObject />;
  const records = historyFor(archives, { targetType: parsed.type, targetId: parsed.id, targetNameZh: identity.name });
  return (
    <section className="pane patches" data-testid="patch-object">
      <p className="patch-eyebrow">
        <Link to="/patches">更新历史</Link>
      </p>
      <h1>{identity.name}</h1>
      <p>
        {OBJECT_LABEL[parsed.type]}
        {identity.en ? ` · ${identity.en}` : ''} · 已收录 <span className="num nw">{records.length}</span> 条
      </p>
      {!records.length ? (
        <p>尚未收录该对象的更新历史。这不代表它从未改动。</p>
      ) : (
        records.map((record) => (
          <article className="patch-entry" key={`${record.patch.id}:${record.entry.id}`} data-history-entry={record.entry.id}>
            <p>
              <Link to={`/patches/${record.patch.id}`}>
                DE Update <span className="num nw">{record.patch.id}</span>
              </Link>
            </p>
            <ArchiveDate archive={record.patch} />
            <EntryBody entry={record.entry} core={core} />
          </article>
        ))
      )}
    </section>
  );
}

function VersionReading({ archive }: { archive: PatchArchive }) {
  const core = useCore();
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
      setParams(next, { replace: true });
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, params, setParams]);
  const selected = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const toggle = (key: string, value: string) => {
    const values = selected(key);
    const next = new URLSearchParams(params);
    const changed = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    if (changed.length) next.set(key, changed.join(','));
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clear = () => {
    setParams(clearFilterParams(params), { replace: true });
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
      </article>
    ));
  return (
    <section className="pane patches patches-read">
      <p className="patch-eyebrow">
        <Link to="/patches">更新历史</Link>
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
                <Link to={`/tree/${civ.en}`}>{civ.zh}</Link>
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
        <a href={archive.source} target="_blank" rel="noopener noreferrer">
          官方完整说明
        </a>
      </p>
    </section>
  );
}

export default function Patches() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { archives, error, retry } = usePatchArchives();
  if (!archives) return <PatchLoading error={error} retry={retry} />;
  if (id) {
    const archive = archives.find((item) => item.id === id);
    if (!archive) return <MissingVersion id={id} />;
    return <VersionReading key={archive.id} archive={archive} />;
  }
  if (params.has('obj')) return <ObjectTimeline archives={archives} raw={params.get('obj')} />;
  return <Browse archives={archives} />;
}
