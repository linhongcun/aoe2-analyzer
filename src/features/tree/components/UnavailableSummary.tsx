import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Civ } from '../../../domain/types';
import { consumeTreeSummaryHistory, treeSummaryDetail, treeSummaryMemory } from '../../../domain/treeSummaryNavigation';
import {
  unavailableSummary,
  unavailableText,
  UNAVAILABLE_AGE_NOTE,
  UNAVAILABLE_COUNT_NOTE,
  UNAVAILABLE_SCOPE,
  type UnavailableItem,
} from '../../../domain/treeUnavailable';
import { img } from '../../../shared/ui/art';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import type { CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import '../unavailable-summary.css';

function useSummaryInsets() {
  const root = useRef<HTMLElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const context = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 0, head: 0, compact: false });
  useLayoutEffect(() => {
    const topbar = document.querySelector('header.topbar');
    const chapters = document.querySelector('nav.civ-chapters');
    const measure = () => {
      const top = (topbar?.getBoundingClientRect().height ?? 0) + (chapters?.getBoundingClientRect().height ?? 0);
      const full = header.current?.getBoundingClientRect().height ?? 0;
      const compact = full + 44 > Math.max(0, innerHeight - top) / 3;
      const head = compact ? (context.current?.getBoundingClientRect().height ?? 0) : full;
      setInsets((old) => (old.top === top && old.head === head && old.compact === compact ? old : { top, head, compact }));
    };
    const observer = new ResizeObserver(measure);
    for (const node of [topbar, chapters, header.current, context.current]) if (node) observer.observe(node);
    addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      removeEventListener('resize', measure);
    };
  }, []);
  return { root, header, context, insets };
}

function SummaryCount({ count, groups, unresolved }: { count: number; groups: number; unresolved: number }) {
  return unresolved ? (
    <>
      已列出 <span className="num nw">{count} 条</span> · 另有 <span className="num nw">{unresolved} 个</span>条目待核对
    </>
  ) : (
    <>
      <span className="num nw">{groups} 个建筑组</span> · <span className="num nw">{count} 条</span>（按建筑内条目计）
    </>
  );
}

export function UnavailableSummary({
  civ,
  resources,
  onCollapse,
  restoreFocus,
}: {
  civ: Civ;
  resources: CoreTreesResources;
  onCollapse: () => void;
  restoreFocus?: string;
}) {
  const { core, trees, retry } = resources;
  const summary = useMemo(() => (core.data && trees.data ? unavailableSummary(trees.data, core.data, civ.en) : null), [core.data, trees.data, civ.en]);
  const failed = core.error || trees.error;
  const pending = !failed && (!core.data || !trees.data);
  const available = !failed && !pending && summary !== null;
  const version = DATA_SOURCES.patch ? `DE Update ${DATA_SOURCES.patch.build}` : '数据版本未核实';
  const treeUrl = new URL(window.location.href);
  treeUrl.hash = `/civ/${civ.en}#techtree`;
  const text = summary ? unavailableText(summary, civ.zh, version, treeUrl.href) : '';
  const [copy, setCopy] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const [selected, setSelected] = useState(false);
  const [fallback, setFallback] = useState(false);
  const request = useRef(0);
  const busy = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const restored = useRef(false);
  const returnCopyFocus = useRef(false);
  const { root, header, context, insets } = useSummaryInsets();

  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    if (copy === 'success' && returnCopyFocus.current) {
      copyButton.current?.focus();
      returnCopyFocus.current = false;
    }
  }, [copy]);
  useEffect(() => {
    if (!restoreFocus || restored.current || pending) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const target =
          [...(root.current?.querySelectorAll<HTMLElement>('[data-summary-key]') ?? [])].find((node) => node.dataset.summaryKey === restoreFocus) ??
          root.current?.querySelector<HTMLElement>('#tree-unavailable-title');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'center' });
        restored.current = true;
        window.history.replaceState(consumeTreeSummaryHistory(window.history.state, civ.en), '');
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreFocus, pending, summary, root, civ.en]);

  const doCopy = async (fromFallback = false) => {
    if (!available || busy.current) return;
    busy.current = true;
    const ticket = ++request.current;
    returnCopyFocus.current = fromFallback;
    setCopy('pending');
    setSelected(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (ticket !== request.current) return;
      setCopy('success');
      setFallback(false);
    } catch {
      if (ticket === request.current) {
        setCopy('failed');
        setFallback(true);
      }
    } finally {
      if (ticket === request.current) busy.current = false;
    }
  };

  const remember = (event: MouseEvent, key: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const previous = window.history.state;
    window.history.replaceState(
      {
        ...previous,
        usr: { ...previous?.usr, treeSummary: treeSummaryMemory(civ.en, key) },
      },
      '',
      treeUrl.href,
    );
  };
  const renderItem = (item: UnavailableItem, building: number) => {
    const key = `${building}:${item.kind}${item.id}`;
    return item.name ? (
      <li key={key}>
        <Link
          className="tsum-item"
          data-summary-key={key}
          to={`/${item.kind === 'u' ? 'unit' : 'tech'}/${item.id}?civ=${encodeURIComponent(civ.en)}`}
          state={treeSummaryDetail(civ.en, building, item.kind, item.id)}
          onClick={(event) => remember(event, key)}
        >
          <span className="tsum-name">
            {item.pic !== null && <img src={img(`${item.kind === 'u' ? 'units' : 'techs'}/${item.pic}.webp`)} alt="" loading="lazy" />}
            <span>
              {item.name}
              {item.identity && <span className="tsum-identity">{item.identity}</span>}
            </span>
          </span>
          <span className="tsum-type">{item.type}</span>
          <span className="tsum-age">
            <span className="tsum-mobile-label">树中时代：</span>
            {item.age}
          </span>
        </Link>
      </li>
    ) : (
      <li className="tsum-unresolved" key={key}>
        <strong>
          待核对条目{' '}
          <span className="nw">
            {item.kind}
            {item.id}
          </span>
        </strong>
        <span>
          {item.type} · 树中时代：{item.age}
        </span>
        <span>目录资料不可用，暂不提供详情链接。</span>
      </li>
    );
  };
  const count = failed ? (
    '资料尚未加载成功'
  ) : pending ? (
    '等待科技树资料'
  ) : !summary ? (
    '暂无可汇总的资料'
  ) : !summary.groups.length ? (
    '当前树中无不可用项'
  ) : (
    <SummaryCount count={summary.count} groups={summary.groups.length} unresolved={summary.unresolved} />
  );

  return (
    <section
      className={`tsum${insets.compact ? ' tsum-compact' : ''}`}
      aria-labelledby="tree-unavailable-title"
      aria-busy={pending}
      ref={root}
      style={{ '--summary-top': `${insets.top}px`, '--summary-head': `${insets.head}px` } as CSSProperties}
      data-testid="tree-unavailable-summary"
    >
      <div className="tsum-head" ref={header}>
        <div>
          <h3 id="tree-unavailable-title" tabIndex={-1}>
            {civ.zh} · 不可用项汇总
          </h3>
          <p className="tsum-count">{count}</p>
          <p className="tsum-short">仅当前科技树内的不可用项，不含建筑</p>
        </div>
        <div className="tsum-actions">
          <button
            type="button"
            className="tsum-copy"
            ref={copyButton}
            disabled={!available || copy === 'pending'}
            onClick={() => {
              void doCopy();
            }}
          >
            {copy === 'pending' ? '正在复制…' : summary?.complete === false ? '复制已列出清单' : '复制清单'}
          </button>
          <button type="button" onClick={onCollapse}>
            收起汇总
          </button>
        </div>
      </div>
      <div className="tsum-context" ref={context} aria-hidden="true">
        <strong>{civ.zh} · 不可用项</strong>
        <span>仅当前树，不含建筑</span>
      </div>
      <div className="tsum-scope">
        <p>{UNAVAILABLE_SCOPE}</p>
        <p>{UNAVAILABLE_AGE_NOTE}</p>
      </div>
      <div className="tsum-feedback" role="status">
        {copy === 'success' ? (summary?.complete ? `已复制${civ.zh}的全部清单。可粘贴到文本中查看。` : `已复制${civ.zh}的已列出清单（汇总不完整）。`) : null}
        {copy === 'failed' ? '未能自动复制。请选中下方全部文本后手动复制，或再次尝试。清单已保留。' : null}
        {selected ? '已选中全部文本，请使用系统复制。' : null}
      </div>
      {fallback && (
        <div className="tsum-fallback">
          <label htmlFor="tree-unavailable-text">{civ.zh}不可用项清单（完整文本）</label>
          <textarea id="tree-unavailable-text" ref={textarea} readOnly value={text} wrap="soft" />
          <div className="tsum-actions">
            <button
              type="button"
              onClick={() => {
                textarea.current?.focus();
                textarea.current?.select();
                setSelected(true);
              }}
            >
              选择全部文本
            </button>
            <button
              type="button"
              disabled={copy === 'pending'}
              onClick={() => {
                void doCopy(true);
              }}
            >
              重试复制
            </button>
          </div>
        </div>
      )}
      {failed ? (
        <div className="tsum-empty" role="alert">
          <h4>科技树资料加载失败</h4>
          <p>页面其他内容仍可查看；重试不会切换文明。</p>
          <button type="button" onClick={retry}>
            重试加载
          </button>
        </div>
      ) : pending ? (
        <div className="tsum-empty">
          <p>正在加载科技树…</p>
          <p>资料就绪后显示当前文明汇总。</p>
        </div>
      ) : !summary ? (
        <div className="tsum-empty">
          <h4>暂无该文明的科技树数据</h4>
          <p>这不代表该文明没有不可用项。</p>
        </div>
      ) : (
        <>
          {!summary.complete && (
            <p className="tsum-warning" role="alert">
              汇总不完整：有不可用条目或建筑暂时无法匹配目录。下方清单与复制文本均不代表全部结果。
            </p>
          )}
          {!summary.groups.length && (
            <div className="tsum-empty">
              <h4>当前树中未发现不可用项</h4>
              <p>仅限已收录且明确标记的单位、升级与科技。</p>
            </div>
          )}
          {!!summary.groups.length && (
            <div className="tsum-columns" aria-hidden="true">
              <span>条目</span>
              <span>种类</span>
              <span>树中时代</span>
            </div>
          )}
          {summary.groups.map((group) => (
            <section className="tsum-group" key={group.id} aria-labelledby={`tsum-building-${group.id}`}>
              <h4 id={`tsum-building-${group.id}`}>
                <span>{group.name}</span>
                <span className="tsum-group-count num nw">{group.items.filter((item) => item.name).length} 条</span>
                {group.items.some((item) => !item.name) && <span> · 待核对条目</span>}
              </h4>
              <ul>{group.items.map((item) => renderItem(item, group.id))}</ul>
            </section>
          ))}
        </>
      )}
      <footer className="tsum-source">
        <p>
          数据版本：<span className="nw">{version}</span> · 来自当前文明科技树
        </p>
        <p>{UNAVAILABLE_COUNT_NOTE}</p>
      </footer>
    </section>
  );
}
