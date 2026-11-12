import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../../data';
import type { Core } from '../../../data';
import type { Civ, Trees } from '../../../domain/types';
import { offColumnSpecialBuildings, treeNodeIdentity } from '../../../domain/treeIdentity';
import { costText, img, TechLink, UnitLink } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { useCoreTrees } from '../../../shared/utils/useCoreTrees';
import { useSticky } from '../../../shared/utils/sticky';
import { AGE_BANDS, extraItems, HD, jumpScrollLeft, layoutTree, TH } from '../logic/layout';
import { JumpToBuilding, type JumpTarget } from './JumpToBuilding';
import '../tree.css';

const JUMP_MS = 1600;

function Mark({ group }: { group: 'unique' | 'regional' }) {
  return <span className={`tmark tmark-${group === 'unique' ? 'uq' : 'rg'}`} aria-hidden="true" />;
}

function Legend({ mine, other }: { mine: string; other: string | null }) {
  return (
    <div className="tleg">
      <span>
        <i className="tl1" />
        可用
      </span>
      <span>
        <i className="tl1 na" />
        不可用
      </span>
      <span>
        <i className="tl1 uq">
          <Mark group="unique" />
        </i>
        独特
      </span>
      <span>
        <i className="tl1 rg">
          <Mark group="regional" />
        </i>
        区域
      </span>
      {other && (
        <>
          <span>
            <i className="tl1 onlyA" />仅 {mine} 有
          </span>
          <span>
            <i className="tl1 onlyB" />仅 {other} 有
          </span>
        </>
      )}
    </div>
  );
}

function TreeCanvas({ trees, core, civ, cmp, jumpSlot }: { trees: Trees; core: Core; civ: Civ; cmp: string | null; jumpSlot: HTMLElement | null }) {
  const location = useLocation();
  const get = (k: 'u' | 't' | 'b', id: number) => (k === 'u' ? core.unitById[id] : k === 'b' ? core.buildingById[id] : core.techById[id]);
  const dir = { u: ['unit', 'units'], t: ['tech', 'techs'], b: ['building', 'buildings'] } as const;
  const blocks = trees.t[civ.en];
  const L = layoutTree(trees, civ.en, cmp, (k, id) => !!get(k, id));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gen = useRef(0);
  const [located, setLocated] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [atEnd, setAtEnd] = useState(false);
  const targets: JumpTarget[] = L.buildings.flatMap((b) => {
    const row = trees.b[b.bid];
    if (!row) return [];
    return [{ bid: b.bid, name: row[0], kind: treeNodeIdentity('b', b.bid, null)?.label }];
  });
  const missing = blocks ? offColumnSpecialBuildings(civ.en, core.buildings, blocks) : [];
  const civQuery = `?civ=${civ.en}`;

  useEffect(() => {
    const token = gen;
    return () => {
      token.current += 1;
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [civ.en, cmp]);

  const locate = (bid: number) => {
    const scroller = scrollerRef.current;
    const col = L.buildings.find((b) => b.bid === bid);
    const name = trees.b[bid]?.[0];
    if (!scroller || !col || !name) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({
      left: jumpScrollLeft(col.x, scroller.scrollWidth - scroller.clientWidth),
      behavior: reduce ? 'auto' : 'smooth',
    });
    const next = ++gen.current;
    setLocated(bid);
    setStatus(`已定位：${name}`);
    window.setTimeout(() => {
      if (gen.current !== next) return;
      setLocated(null);
      setStatus('');
    }, JUMP_MS);
  };

  const openNode = (event: ReactMouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (location.pathname === `/civ/${civ.en}` && location.hash === '#techtree') return;
    const next = new URL(window.location.href);
    next.hash = `/civ/${civ.en}#techtree`;
    window.history.replaceState(window.history.state, '', next.href);
  };

  const jump = <JumpToBuilding key={`${civ.en}|${cmp ?? ''}`} targets={targets} status={status} onConfirm={locate} />;

  return (
    <>
      {jumpSlot ? createPortal(jump, jumpSlot) : null}
      {missing.length > 0 && (
        <div className="tother" data-civ={civ.en}>
          <p className="tother-title">其他独特/区域建筑</p>
          <p className="tother-note">这些建筑在本文明目录中，但科技树没有对应列（没有单位或科技格子）。此处只作补充，不表示时代位置、升级线或可用性。</p>
          <ul className="tother-list">
            {missing.map((b) => {
              const ident = treeNodeIdentity('b', b.id, null);
              const to = `/building/${b.id}${civQuery}`;
              return (
                <li key={b.id}>
                  <Link
                    className="tother-link"
                    to={to}
                    title={`${b.en}${ident ? ` ${ident.label}` : ''}`}
                    aria-label={`${b.zh}，${ident?.label ?? '建筑'}，打开建筑详情。此建筑不在科技树列中。`}
                    onClick={openNode}
                  >
                    <img src={img(`buildings/${b.pic}.webp`)} alt="" width={28} height={28} />
                    <span>{b.zh}</span>
                    {ident && <span className={`tother-kind is-${ident.group === 'unique' ? 'uq' : 'rg'}`}>{ident.label}</span>}
                    <span className="tother-go">详情</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className={`civ-tt-frame${atEnd ? ' is-end' : ''}`}>
        <div
          className="tscroll"
          ref={scrollerRef}
          tabIndex={0}
          role="region"
          aria-label={`${civ.zh}科技树，可横向滚动`}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -64 : 64 });
          }}
        >
          <div className="tree" style={{ width: L.W, height: L.H }}>
            {AGE_BANDS.map(([n, r, h], i) => (
              <div key={n} className={`tband b${i}`} style={{ top: HD + r * TH, height: h * TH, width: L.W }}>
                <span>{n}</span>
              </div>
            ))}
            <svg width={L.W} height={L.H}>
              {L.lines.map((l, i) => (
                <path key={i} d={l.d} className={l.avail ? '' : 'na'} />
              ))}
            </svg>
            {L.buildings.map((b) => {
              const B = trees.b[b.bid]!;
              const identB = treeNodeIdentity('b', b.bid, null);
              const to = `/building/${b.bid}${civQuery}`;
              return (
                <Link
                  key={b.bid}
                  className={`tbld${identB ? ' has-kind' : ''}${located === b.bid ? ' t-jump' : ''}`}
                  data-bid={b.bid}
                  style={{ left: b.x, width: b.w }}
                  to={to}
                  title={identB ? `${B[0]} ${B[1]} ${identB.label}` : `${B[0]} ${B[1]}`}
                  aria-label={identB ? `${B[0]}，${identB.label}` : undefined}
                  onClick={openNode}
                >
                  <img src={img(`buildings/${B[2]}.webp`)} alt="" />
                  <span className="tbld-name">{B[0]}</span>
                  {identB ? <span className={`tbld-kind is-${identB.group === 'unique' ? 'uq' : 'rg'}`}>{identB.label}</span> : null}
                </Link>
              );
            })}
            {L.cells.map((c) => {
              const o = get(c.k, c.id)!;
              const ident = treeNodeIdentity(c.k, c.id, c.k === 'b' ? null : o.type);
              const title = `${o.zh} ${o.en}${ident ? `\n${ident.label}` : ''}\n${costText(o.cost)}${c.k === 't' ? '，' + (o as { rt: number }).rt + 's' : ''}${c.avail ? '' : '\n（该文明不可用）'}`;
              const cls = ['tcell', c.avail ? '' : 'na', ident?.group === 'unique' ? 'uq' : '', ident?.group === 'regional' ? 'rg' : '', c.diff]
                .filter(Boolean)
                .join(' ');
              const to = `/${dir[c.k][0]}/${c.id}${civQuery}`;
              return (
                <Link
                  key={c.k + c.id}
                  className={cls}
                  to={to}
                  style={{ left: c.x, top: c.y }}
                  title={title}
                  aria-label={ident ? `${o.zh}，${ident.label}` : undefined}
                  onClick={openNode}
                >
                  <img src={img(`${dir[c.k][1]}/${o.pic}.webp`)} alt="" loading="lazy" />
                  {ident ? <Mark group={ident.group} /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function DiffLists({ trees, core, mine, other }: { trees: Trees; core: Core; mine: Civ; other: Civ }) {
  const items = (x: string, y: string) =>
    extraItems(trees, x, y)
      .map(([k, id]) => {
        if (k === 'b') return null;
        const o = k === 'u' ? core.unitById[id] : core.techById[id];
        return o ? k === 'u' ? <UnitLink key={k + id} u={core.unitById[id]!} /> : <TechLink key={k + id} t={core.techById[id]!} /> : null;
      })
      .filter(Boolean);
  const missingHere = items(mine.en, other.en);
  const missingThere = items(other.en, mine.en);
  return (
    <div className="civ-tt-diff">
      <h3>
        {other.zh} 有而 {mine.zh} 树中没有的项目（<span className="num nw">{missingHere.length}</span>）
      </h3>
      <div className="uchips">{missingHere.length ? missingHere : '—'}</div>
      <h3>
        {mine.zh} 有而 {other.zh} 树中没有的项目（<span className="num nw">{missingThere.length}</span>）
      </h3>
      <div className="uchips">{missingThere.length ? missingThere : '—'}</div>
    </div>
  );
}

function Placeholder({ text, alert, onRetry }: { text: string; alert?: boolean; onRetry?: () => void }) {
  return (
    <div className="civ-tt-frame is-end">
      <div className="civ-tt-skel" role={alert ? 'alert' : 'status'}>
        <p>{text}</p>
        {alert && onRetry && (
          <button type="button" className="civ-tt-retry" onClick={onRetry}>
            重试科技树
          </button>
        )}
      </div>
    </div>
  );
}

export default function CivTechTree({ civEn }: { civEn: string }) {
  const nav = useNavigate();
  const { core, trees, retry } = useCoreTrees();
  const [compare, setCompare] = useSticky('civ.techtree.compare', '');
  const [jumpSlot, setJumpSlot] = useState<HTMLDivElement | null>(null);
  const civ = civByEn(civEn);
  if (compare === civEn) setCompare('');
  const activeCompare = compare && compare !== civEn ? civByEn(compare) : undefined;
  const ready = !!(core.data && trees.data && civ);
  const failed = core.error || trees.error;
  const blocks = ready && trees.data ? trees.data.t[civEn] : undefined;
  const showTree = !!(ready && blocks && trees.data && core.data && civ);

  if (!civ) return null;

  return (
    <section id="techtree" className="civ-techtree tree-pane" data-tree-civ={civ.en} data-testid="civ-techtree" aria-labelledby="civ-tt-title">
      <div className="civ-tt-head">
        <div className="civ-tt-title">
          <p className="civ-kicker">能造什么、缺什么</p>
          <h2 id="civ-tt-title">科技树</h2>
        </div>
        <div className="civ-tt-tools">
          <CivPicker
            id="civ-tt-civ"
            label="换文明看科技树"
            value={civ.en}
            onChange={(en) => {
              if (en && en !== civ.en) nav(`/civ/${en}#techtree`);
            }}
          />
          <span className="civ-tt-cmp">
            <CivPicker
              id="civ-tt-cmp"
              label="差异对照"
              value={activeCompare?.en ?? ''}
              emptyText="差异对照"
              hideEmptyIcon
              selectedPrefix={activeCompare ? '对照' : undefined}
              disabled={!showTree}
              onChange={(en) => setCompare(!en || en === civ.en ? '' : en)}
            />
            {activeCompare && (
              <button type="button" className="civ-tt-clear" aria-label="取消差异对照" onClick={() => setCompare('')}>
                <Icon name="x" />
              </button>
            )}
          </span>
          <div className="civ-tt-jump" ref={setJumpSlot}>
            {showTree ? null : (
              <div className="tjump-field">
                <button type="button" className="tjump-btn" disabled>
                  跳到建筑
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="civ-tt-meta">
        <Legend mine={civ.zh} other={showTree && activeCompare ? activeCompare.zh : null} />
        {showTree ? (
          <span className="civ-tt-hint">
            <Icon name="move-horizontal" />共 <span className="num nw">{blocks!.length}</span> 列建筑，横向滚动查看
          </span>
        ) : null}
      </div>
      {failed ? (
        <Placeholder text="科技树资料加载失败，页面其他内容仍可查看。" alert onRetry={retry} />
      ) : !ready ? (
        <Placeholder text="正在加载科技树…" />
      ) : !blocks ? (
        <Placeholder text="暂无该文明的科技树数据" />
      ) : (
        <TreeCanvas trees={trees.data!} core={core.data!} civ={civ} cmp={activeCompare?.en ?? null} jumpSlot={jumpSlot} />
      )}
      {showTree && activeCompare ? <DiffLists trees={trees.data!} core={core.data!} mine={civ} other={activeCompare} /> : null}
    </section>
  );
}
