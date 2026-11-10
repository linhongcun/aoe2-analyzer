import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { civIndex, civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import type { Civ, Trees } from '../../../domain/types';
import { offColumnSpecialBuildings, treeNodeIdentity } from '../../../domain/treeIdentity';
import { CivIcon, costText, img, TechLink, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { Loading } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { AGE_BANDS, extraItems, HD, jumpScrollLeft, layoutTree, TH } from '../logic/layout';
import type { Core } from '../../../data';
import { JumpToBuilding, type JumpTarget } from './JumpToBuilding';
import '../tree.css';

const JUMP_MS = 1600;

function Mark({ group }: { group: 'unique' | 'regional' }) {
  return <span className={`tmark tmark-${group === 'unique' ? 'uq' : 'rg'}`} aria-hidden="true" />;
}

function Legend({ mode, mine, other }: { mode: string; mine: string; other: string }) {
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
      {mode === '2' && (
        <>
          <span>
            <i className="tl1 onlyA" />仅 {mine} 有
          </span>
          <span>
            <i className="tl1 onlyB" />仅 {other} 有
          </span>
        </>
      )}
      <span className="note">完整类别见名称（单位 / 科技 / 建筑）</span>
      <span className="note">点击节点查看详情</span>
    </div>
  );
}

function Tree({
  trees,
  core,
  civ,
  cmp,
  legend,
  detail,
  resetKey,
}: {
  trees: Trees;
  core: Core;
  civ: Civ;
  cmp: string | null;
  legend: { mode: string; mine: string; other: string } | null;
  detail: boolean;
  resetKey: string;
}) {
  const get = (k: 'u' | 't' | 'b', id: number) => (k === 'u' ? core.unitById[id] : k === 'b' ? core.buildingById[id] : core.techById[id]);
  const dir = { u: ['unit', 'units'], t: ['tech', 'techs'], b: ['building', 'buildings'] } as const;
  const blocks = trees.t[civ.en];
  const L = layoutTree(trees, civ.en, cmp, (k, id) => !!get(k, id));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gen = useRef(0);
  const [located, setLocated] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const targets: JumpTarget[] = L.buildings.flatMap((b) => {
    const row = trees.b[b.bid];
    if (!row) return [];
    return [{ bid: b.bid, name: row[0], kind: treeNodeIdentity('b', b.bid, null)?.label }];
  });
  const missing = offColumnSpecialBuildings(civ.en, core.buildings, blocks);

  useEffect(() => {
    const token = gen;
    return () => {
      token.current += 1;
    };
  }, []);

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
    const text = `已定位：${name}`;
    setLocated(bid);
    setStatus(text);
    window.setTimeout(() => {
      if (gen.current !== next) return;
      setLocated(null);
      setStatus('');
    }, JUMP_MS);
  };

  const jump = <JumpToBuilding key={resetKey} targets={targets} status={status} onConfirm={locate} />;

  return (
    <div className="tree-pane" data-tree-civ={civ.en}>
      <div className="tree-head-row">
        <h3>
          <CivIcon c={civ} /> {civ.zh} <small>{civ.en}</small>
          {detail && (
            <>
              {' '}
              <Link className="ulink" to={`/civ/${civ.en}`}>
                文明详情 <Icon name="arrow-right" />
              </Link>
            </>
          )}
        </h3>
        {legend ? null : jump}
      </div>
      {legend && (
        <div className="tree-tools">
          <Legend mode={legend.mode} mine={legend.mine} other={legend.other} />
          {jump}
        </div>
      )}
      {missing.length > 0 && (
        <div className="tother" data-civ={civ.en}>
          <p className="tother-title">其他独特/区域建筑</p>
          <p className="tother-note">这些建筑在本文明目录中，但科技树没有对应列（没有单位或科技格子）。此处只作补充，不表示时代位置、升级线或可用性。</p>
          <ul className="tother-list">
            {missing.map((b) => {
              const ident = treeNodeIdentity('b', b.id, null);
              return (
                <li key={b.id}>
                  <Link
                    className="tother-link"
                    to={`/building/${b.id}`}
                    title={`${b.en}${ident ? ` ${ident.label}` : ''}`}
                    aria-label={`${b.zh}，${ident?.label ?? '建筑'}，打开建筑详情。此建筑不在科技树列中。`}
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
      <div className="tscroll" ref={scrollerRef}>
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
            return (
              <Link
                key={b.bid}
                className={`tbld${identB ? ' has-kind' : ''}${located === b.bid ? ' t-jump' : ''}`}
                data-bid={b.bid}
                style={{ left: b.x, width: b.w }}
                to={`/building/${b.bid}`}
                title={identB ? `${B[0]} ${B[1]} ${identB.label}` : `${B[0]} ${B[1]}`}
                aria-label={identB ? `${B[0]}，${identB.label}` : undefined}
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
            return (
              <Link
                key={c.k + c.id}
                className={cls}
                to={`/${dir[c.k][0]}/${c.id}`}
                style={{ left: c.x, top: c.y }}
                title={title}
                aria-label={ident ? `${o.zh}，${ident.label}` : undefined}
              >
                <img src={img(`${dir[c.k][1]}/${o.pic}.webp`)} alt="" loading="lazy" />
                {ident ? <Mark group={ident.group} /> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TreeView() {
  const { civ } = useParams();
  const nav = useNavigate();
  const trees = useTrees(),
    core = useCore();
  const [m, setM] = useSticky('tree.m', '1'),
    [ib, setB] = useSticky('tree.b', 5);
  const a: Civ = civs[civ && civIndex(civ) >= 0 ? civIndex(civ) : 16]!,
    b = civs[ib]!;
  const extras = (x: string, y: string) =>
    trees && core
      ? extraItems(trees, x, y)
          .map(([k, id]) => {
            if (k === 'b') return null;
            const o = k === 'u' ? core.unitById[id] : core.techById[id];
            return o ? k === 'u' ? <UnitLink key={k + id} u={core.unitById[id]!} /> : <TechLink key={k + id} t={core.techById[id]!} /> : null;
          })
          .filter(Boolean)
      : [];
  const ea = m === '2' ? extras(a.en, b.en) : [],
    eb = m === '2' ? extras(b.en, a.en) : [];
  let body: ReactNode = <Loading />;
  if (trees && core) {
    body = (
      <>
        <Tree
          key={a.en}
          trees={trees}
          core={core}
          civ={a}
          cmp={m === '2' ? b.en : null}
          legend={{ mode: m, mine: a.zh, other: b.zh }}
          detail
          resetKey={`${a.en}|${m}|${b.en}`}
        />
        {m === '2' && (
          <Fragment>
            <h4>
              {b.zh} 有而 {a.zh} 树中没有的项目（{ea.length}）
            </h4>
            <div className="uchips">{ea.length ? ea : '—'}</div>
            <h4>
              {a.zh} 有而 {b.zh} 树中没有的项目（{eb.length}）
            </h4>
            <div className="uchips">{eb.length ? eb : '—'}</div>
          </Fragment>
        )}
        {m === '3' && <Tree key={b.en} trees={trees} core={core} civ={b} cmp={a.en} legend={null} detail={false} resetKey={`${b.en}|${m}|${a.en}`} />}
      </>
    );
  }
  return (
    <section id="tree" className="pane">
      <ListHead level={1} title="科技树" desc="按建筑分列、按时代分行；可对比两个文明" />
      <div className="bar fbar">
        <CivPicker id="tra" label="文明" value={a.en} onChange={(en) => nav('/tree/' + en, { replace: true })} />
        <select id="trm" value={m} onChange={(e) => setM(e.target.value)}>
          <option value="1">单个文明</option>
          <option value="2">差异高亮</option>
          <option value="3">上下对照</option>
        </select>
        {m !== '1' && <CivPicker id="trb" label="对比文明" value={civs[ib]!.en} onChange={(en) => setB(civs.findIndex((c) => c.en === en))} />}
      </div>
      <div id="treebox">{body}</div>
    </section>
  );
}
