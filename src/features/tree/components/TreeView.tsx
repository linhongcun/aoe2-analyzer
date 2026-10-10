import { ListHead } from '../../../shared/ui/layout';
import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { civIndex, civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import type { Civ, Trees } from '../../../domain/types';
import { CivIcon, costText, img, TechLink, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { CivOptions, Loading } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { AGE_BANDS, extraItems, HD, layoutTree, TH } from '../logic/layout';
import type { Core } from '../../../data';

function Tree({ trees, core, civ, cmp }: { trees: Trees; core: Core; civ: string; cmp: string | null }) {
  const get = (k: 'u' | 't', id: number) => (k === 'u' ? core.unitById[id] : core.techById[id]);
  const L = layoutTree(trees, civ, cmp, (k, id) => !!get(k, id));
  return (
    <div className="tscroll">
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
          return (
            <div key={b.bid} className="tbld" style={{ left: b.x, width: b.w }}>
              <img src={img(`buildings/${B[2]}.webp`)} alt="" />
              <span>{B[0]}</span>
            </div>
          );
        })}
        {L.cells.map((c) => {
          const o = get(c.k, c.id)!;
          const uq = o.type === 'UniqueUnit' || o.type === 'UniqueTech';
          const title = `${o.zh} ${o.en}\n${costText(o.cost)}${c.k === 'u' ? '' : '，' + (o as { rt: number }).rt + 's'}${c.avail ? '' : '\n（该文明不可用）'}`;
          return (
            <Link
              key={c.k + c.id}
              className={`tcell${c.avail ? '' : ' na'}${uq ? ' uq' : ''}${c.diff ? ' ' + c.diff : ''}`}
              to={`/${c.k === 'u' ? 'unit' : 'tech'}/${c.id}`}
              style={{ left: c.x, top: c.y }}
              title={title}
            >
              <img src={img(`${c.k === 'u' ? 'units' : 'techs'}/${o.pic}.webp`)} alt="" loading="lazy" />
            </Link>
          );
        })}
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
            const o = k === 'u' ? core.unitById[id] : core.techById[id];
            return o ? k === 'u' ? <UnitLink key={k + id} u={core.unitById[id]!} /> : <TechLink key={k + id} t={core.techById[id]!} /> : null;
          })
          .filter(Boolean)
      : [];
  const ea = m === '2' ? extras(a.en, b.en) : [],
    eb = m === '2' ? extras(b.en, a.en) : [];
  return (
    <section id="tree" className="pane">
      <ListHead title="科技树" desc="按建筑分列、按时代分行；可对比两个文明" />
      <div className="bar fbar">
        <img id="trimg" className="ico" alt="" src={img(`civs/${a.en.toLowerCase()}.webp`)} />
        <select id="tra" value={civs.indexOf(a)} onChange={(e) => nav('/tree/' + civs[+e.target.value]!.en, { replace: true })}>
          <CivOptions />
        </select>
        <select id="trm" value={m} onChange={(e) => setM(e.target.value)}>
          <option value="1">单个文明</option>
          <option value="2">差异高亮</option>
          <option value="3">上下对照</option>
        </select>
        <select id="trb" value={ib} onChange={(e) => setB(+e.target.value)} style={m === '1' ? { display: 'none' } : undefined}>
          <CivOptions />
        </select>
      </div>
      <div id="treebox">
        {!trees || !core ? (
          <Loading />
        ) : (
          <>
            <h3>
              <CivIcon c={a} /> {a.zh} <small>{a.en}</small>{' '}
              <Link className="ulink" to={`/civ/${a.en}`}>
                文明详情 <Icon name="arrow-right" />
              </Link>
            </h3>
            <div className="tleg">
              <span>
                <i className="tl1 uq" />
                独特单位/科技
              </span>
              <span>
                <i className="tl1 na" />
                该文明不可用
              </span>
              {m === '2' && (
                <>
                  <span>
                    <i className="tl1 onlyA" />仅 {a.zh} 有
                  </span>
                  <span>
                    <i className="tl1 onlyB" />仅 {b.zh} 有
                  </span>
                </>
              )}
              <span className="note">悬停查看名称与费用，点击查看详情；小屏可左右滑动</span>
            </div>
            <Tree trees={trees} core={core} civ={a.en} cmp={m === '2' ? b.en : null} />
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
            {m === '3' && (
              <>
                <h3>
                  <CivIcon c={b} /> {b.zh} <small>{b.en}</small>
                </h3>
                <Tree trees={trees} core={core} civ={b.en} cmp={a.en} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
