import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import raw from '../../data/patches/185872.json';
import { civs } from '../../data';
import { filterPatch, patchTarget, PATCH_KINDS, PATCH_TYPES, type PatchEntry, type PatchKind } from '../../domain/patches';
import { Icon, type IconName } from '../../shared/ui/Icon';
import './patches.css';

const entries = raw.entries as PatchEntry[];
const kinds = Object.keys(PATCH_KINDS) as PatchKind[];
const icons: Record<PatchKind, IconName> = { new: 'plus', buff: 'arrow-up', nerf: 'arrow-down', adjust: 'info', fix: 'info' };

export default function Patches() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const search = draft?.base === params.toString() ? draft.value : (params.get('q') ?? '');
  const setSearch = (value: string) => setDraft({ base: params.toString(), value });
  const [civSearch, setCivSearch] = useState('');
  const [civOpen, setCivOpen] = useState(false);
  const [active, setActive] = useState(0);
  const sheet = useRef<HTMLDialogElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
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
  const selectedCivs = selected('civ');
  const toggle = (key: string, value: string) => {
    const values = selected(key),
      next = new URLSearchParams(params);
    const changed = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
    if (changed.length) next.set(key, changed.join(','));
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const options = civs.filter((c) => !selectedCivs.includes(c.en) && `${c.zh} ${c.en}`.toLowerCase().includes(civSearch.toLowerCase()));
  const pick = (en: string) => {
    toggle('civ', en);
    setCivSearch('');
    setActive(0);
  };
  const clear = () => {
    setParams({}, { replace: true });
    setDraft(null);
  };
  const closeSheet = () => {
    sheet.current?.close();
    filterButton.current?.focus();
  };
  const shown = filterPatch(entries, params);
  const filters = (
    <>
      <label>
        搜索改动
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="名称或摘要" />
      </label>
      <fieldset>
        <legend>改动类型</legend>
        {kinds.map((k) => (
          <label key={k}>
            <input type="checkbox" checked={selected('kind').includes(k)} onChange={() => toggle('kind', k)} />
            {PATCH_KINDS[k]}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>目标类型</legend>
        {Object.entries(PATCH_TYPES).map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={selected('type').includes(k)} onChange={() => toggle('type', k)} />
            {label}
          </label>
        ))}
      </fieldset>
      <button onClick={clear}>清除筛选</button>
    </>
  );
  if (!id)
    return (
      <section className="pane patches">
        <h2>版本补丁</h2>
        <p>按版本列出加强、削弱和新内容；数值以本站解析的游戏数据为准</p>
        <Link to="/about-data">关于数据</Link>
        <article className="patch-version">
          <Link to="/patches/185872">
            <h3>DE Update 185872</h3>
            <time>{raw.date}</time>
            <p>维京传奇新内容与通用、文明平衡调整</p>
            <p>
              {kinds
                .filter((k) => entries.some((e) => e.kind === k))
                .map((k) => (
                  <span className="patch-count" key={k}>
                    {PATCH_KINDS[k]} {entries.filter((e) => e.kind === k).length}
                  </span>
                ))}
            </p>
          </Link>
        </article>
      </section>
    );
  if (id !== raw.id)
    return (
      <section className="pane patches">
        <h2>找不到版本 {id}</h2>
        <p>可能是链接写错了，或这个版本还没收录。</p>
        <Link to="/patches">返回版本补丁</Link>
      </section>
    );
  return (
    <section className="pane patches">
      <Link to="/patches">返回版本补丁</Link>
      <h2>DE Update {id}</h2>
      <p>
        <time>{raw.date}</time> · <Link to="/about-data">当前数据版本：DE 185872 · 关于数据</Link>
      </p>
      <p className="note">{raw.note}</p>
      <p className="note">仅展示基础数值，文明与科技的最终效果请看详情。条目数按属性和目标拆分，不等于官方项目数；“来源冲突”归入调整，不判定为已验证削弱。</p>
      <section className="patch-civs" aria-label="按文明看">
        <h3>按文明看</h3>
        <p>选你玩的文明，只看它的专属改动和全局改动</p>
        <div className="patch-chips">
          {selectedCivs.map((en) => (
            <button key={en} onClick={() => toggle('civ', en)} aria-label={`移除${civs.find((c) => c.en === en)?.zh ?? en}`}>
              {civs.find((c) => c.en === en)?.zh ?? en}
              <Icon name="x" />
            </button>
          ))}
        </div>
        <div
          className="patch-combo"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setCivOpen(false);
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
            onChange={(e) => {
              setCivSearch(e.target.value);
              setActive(0);
              setCivOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCivOpen(false);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setCivOpen(true);
                setActive((i) => Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
              }
              if (e.key === 'Enter' && civOpen && options[active]) {
                e.preventDefault();
                pick(options[active]!.en);
              }
              if (e.key === 'Backspace' && !civSearch && selectedCivs.length) toggle('civ', selectedCivs.at(-1)!);
            }}
          />
          {civOpen && (
            <div id="patch-civ-options" role="listbox" aria-label="文明选项" aria-multiselectable="true">
              {options.map((c, i) => (
                <button
                  type="button"
                  role="option"
                  id={`patch-civ-${c.en}`}
                  aria-selected={false}
                  className={i === active ? 'active' : ''}
                  key={c.en}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.en)}
                >
                  {c.zh} <small>{c.en}</small>
                </button>
              ))}
              {!options.length && (
                <p role="status">
                  没有找到「{civSearch}」相关的文明
                  <br />
                  支持中文名或英文名
                </p>
              )}
            </div>
          )}
        </div>
        <p aria-live="polite">
          {selectedCivs.length
            ? `${selectedCivs.map((en) => civs.find((c) => c.en === en)?.zh ?? en).join('、')}专属 ${shown.filter((e) => e.civIds.length).length} 条 · 全局 ${shown.filter((e) => !e.civIds.length).length} 条`
            : `全部文明 · 显示 ${shown.length} / ${entries.length} 条`}
        </p>
      </section>
      <button className="patch-mobile-filter" ref={filterButton} onClick={() => sheet.current?.showModal()}>
        筛选 · {selected('kind').length + selected('type').length + (params.has('q') ? 1 : 0)}
      </button>
      <dialog className="patch-filter-sheet" ref={sheet} onCancel={() => filterButton.current?.focus()}>
        <h3>筛选改动</h3>
        {filters}
        <button onClick={closeSheet}>显示 {shown.length} 条</button>
      </dialog>
      <div className="patch-layout">
        <aside className="patch-desktop-filter" aria-label="筛选改动">
          {filters}
        </aside>
        <div>
          <p role="status">
            显示 {shown.length} / {entries.length} 条
          </p>
          {!shown.length && (
            <div>
              <h3>没有符合筛选条件的改动</h3>
              <p>换个条件试试。</p>
              <button onClick={clear}>清除筛选</button>
            </div>
          )}
          {kinds.map((kind) => {
            const group = shown.filter((e) => e.kind === kind);
            return group.length ? (
              <section key={kind} aria-label={PATCH_KINDS[kind]}>
                <h3>{PATCH_KINDS[kind]}</h3>
                {kind === 'fix' && <p className="note">已与 {id} 原版 .dat 核对，属于数据来源修正，不是平衡改动。</p>}
                {group.map((e) => (
                  <article className={`patch-entry patch-${kind}`} key={e.id} data-civs={e.civIds.join(',')}>
                    <span className="patch-kind">
                      <Icon name={icons[kind]} />
                      {PATCH_KINDS[kind]} · {PATCH_TYPES[e.targetType]}
                    </span>
                    <h4>
                      <Link to={patchTarget(e)}>{e.targetNameZh}</Link>
                    </h4>
                    <p>{e.summaryZh}</p>
                    {e.before !== undefined && (
                      <div className="patch-values">
                        <span>
                          改动前 <b>{e.before}</b>
                        </span>
                        <Icon name="arrow-right" />
                        <span>
                          改动后 <b>{e.after}</b>
                        </span>
                      </div>
                    )}
                    <p className="note">
                      {e.civIds.map((en) => civs.find((c) => c.en === en)?.zh ?? en).join('、') || '全局改动'} ·{' '}
                      <a href={e.source} target="_blank" rel="noopener noreferrer">
                        官方记录
                      </a>
                    </p>
                  </article>
                ))}
              </section>
            ) : null;
          })}
          <section>
            <h3>其他</h3>
            <p>新增地图 Arabian Desert；排位死亡竞赛开放队伍位置与 Turbo 设置。地图与天梯细节见官方原文。</p>
            <details>
              <summary>Bug 修复</summary>
              <p>本页不展开战役、寻路和编辑器修复清单；完整记录见官方说明。</p>
            </details>
            <a href={raw.source} target="_blank" rel="noopener noreferrer">
              官方完整补丁说明
            </a>
          </section>
        </div>
      </div>
    </section>
  );
}
