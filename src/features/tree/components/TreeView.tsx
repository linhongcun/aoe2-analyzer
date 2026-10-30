import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Fragment, useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { civIndex, civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import type { Civ, Trees } from '../../../domain/types';
import { CivIcon, costText, img, TechLink, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { Loading } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { AGE_BANDS, extraItems, HD, layoutTree, TH } from '../logic/layout';
import type { Core } from '../../../data';
import { contextPath, entityPath, type EntityContext } from '../../../shared/nav/context';
import { NavigationContext } from '../../../shared/ui/NavigationContext';

function Tree({ trees, core, civ, cmp, context }: { trees: Trees; core: Core; civ: string; cmp: string | null; context: EntityContext }) {
  const get = (k: 'u' | 't' | 'b', id: number) => (k === 'u' ? core.unitById[id] : k === 'b' ? core.buildingById[id] : core.techById[id]);
  const dir = { u: ['unit', 'units'], t: ['tech', 'techs'], b: ['building', 'buildings'] } as const;
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
            <Link
              key={b.bid}
              className="tbld"
              style={{ left: b.x, width: b.w }}
              to={entityPath('building', b.bid, civ, context.search ?? '', context.source)}
              title={`${B[0]} ${B[1]}`}
            >
              <img src={img(`buildings/${B[2]}.webp`)} alt="" />
              <span>{B[0]}</span>
            </Link>
          );
        })}
        {L.cells.map((c) => {
          const o = get(c.k, c.id)!;
          const uq = o.type === 'UniqueUnit' || o.type === 'UniqueTech';
          const title = `${o.zh} ${o.en}\n${costText(o.cost)}${c.k === 't' ? '，' + (o as { rt: number }).rt + 's' : ''}${c.avail ? '' : '\n（该文明不可用）'}`;
          return (
            <Link
              key={c.k + c.id}
              className={`tcell${c.avail ? '' : ' na'}${uq ? ' uq' : ''}${c.diff ? ' ' + c.diff : ''}`}
              to={entityPath(dir[c.k][0], c.id, civ, context.search ?? '', context.source)}
              style={{ left: c.x, top: c.y }}
              title={title}
            >
              <img src={img(`${dir[c.k][1]}/${o.pic}.webp`)} alt="" loading="lazy" />
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
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const trees = useTrees(),
    core = useCore();
  const [storedMode, setM] = useSticky('tree.m', '1'),
    [ib, setB] = useSticky('tree.b', 5);
  const validMode = params.getAll('mode').length === 1 && ['1', '2', '3'].includes(params.get('mode') ?? '');
  const validCompare = params.getAll('compare').length === 1 && civIndex(params.get('compare') ?? '') >= 0;
  const m = validMode ? params.get('mode')! : ['1', '2', '3'].includes(storedMode) ? storedMode : '1';
  const a: Civ = civs[civ && civIndex(civ) >= 0 ? civIndex(civ) : 16]!,
    b = validCompare ? civs[civIndex(params.get('compare')!)]! : (civs[ib] ?? civs[5]!);
  const invalid = (params.has('mode') && !validMode) || (params.has('compare') && !validCompare);
  const canonical = new URLSearchParams(location.search);
  if (!params.has('mode')) canonical.set('mode', m);
  if (m !== '1' && !params.has('compare')) canonical.set('compare', b.en);
  const canonicalSearch = canonical.size ? '?' + canonical : '';
  useEffect(() => {
    if (location.search !== canonicalSearch) nav(location.pathname + canonicalSearch, { replace: true });
    if (storedMode !== m) setM(m);
    const index = civIndex(b.en);
    if (ib !== index) setB(index);
  }, [location.pathname, location.search, canonicalSearch, m, b.en, ib, storedMode, nav, setM, setB]);
  const context: EntityContext = { civ: a.en, search: location.search, source: location.pathname + canonicalSearch };
  const choose = (mode: string, other: string) => {
    const next = new URLSearchParams(location.search);
    next.set('mode', mode);
    next.set('compare', other);
    nav(location.pathname + '?' + next, { replace: true });
  };
  const extras = (x: string, y: string) =>
    trees && core
      ? extraItems(trees, x, y)
          .map(([k, id]) => {
            if (k === 'b') return null;
            const o = k === 'u' ? core.unitById[id] : core.techById[id];
            return o ? (
              k === 'u' ? (
                <UnitLink key={k + id} u={core.unitById[id]!} context={{ ...context, civ: y }} />
              ) : (
                <TechLink key={k + id} t={core.techById[id]!} context={{ ...context, civ: y }} />
              )
            ) : null;
          })
          .filter(Boolean)
      : [];
  const ea = m === '2' ? extras(a.en, b.en) : [],
    eb = m === '2' ? extras(b.en, a.en) : [];
  return (
    <section id="tree" className="pane">
      <ListHead title="科技树" desc="按建筑分列、按时代分行；可对比两个文明" />
      <NavigationContext currentCiv={a.en}>
        <Link className="community-tool-entry" to={contextPath('/match-review', location.search, location.pathname + location.search)}>
          记录一个练习问题
        </Link>
      </NavigationContext>
      {invalid && <p className="note">链接中的科技树对照条件无效，已使用上次有效选择；可重新选择后分享。</p>}
      <div className="bar fbar">
        <CivPicker id="tra" label="文明" value={a.en} onChange={(en) => nav('/tree/' + en + canonicalSearch, { replace: true })} />
        <select id="trm" aria-label="科技树显示方式" value={m} onChange={(e) => choose(e.target.value, b.en)}>
          <option value="1">单个文明</option>
          <option value="2">差异高亮</option>
          <option value="3">上下对照</option>
        </select>
        {m !== '1' && <CivPicker id="trb" label="对比文明" value={b.en} onChange={(en) => choose(m, en)} />}
      </div>
      <div id="treebox">
        {!trees || !core ? (
          <Loading />
        ) : (
          <>
            <h3>
              <CivIcon c={a} /> {a.zh} <small>{a.en}</small>{' '}
              <Link className="ulink" to={contextPath(`/civ/${a.en}`, location.search, location.pathname + canonicalSearch)}>
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
            <Tree trees={trees} core={core} civ={a.en} cmp={m === '2' ? b.en : null} context={context} />
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
                <Tree trees={trees} core={core} civ={b.en} cmp={a.en} context={{ ...context, civ: b.en }} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
