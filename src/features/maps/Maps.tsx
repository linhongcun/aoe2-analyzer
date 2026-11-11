import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../data';
import { buildOrders } from '../../data/buildOrders';
import catalog from '../../data/mapCatalog.json';
import { CivIcon } from '../../shared/ui/art';
import { Icon } from '../../shared/ui/Icon';
import { Breadcrumbs } from '../../shared/ui/layout';
import { mapGuides } from './guides';
import { mapMatchesQuery, selectMap } from './mapSelection';
import { MapPositions } from './MapPositions';
import SuddenDessaster3 from './SuddenDessaster3';
import SuddenDessasterMechanics from './SuddenDessasterMechanics';
import SuddenDessasterWatch from './SuddenDessasterWatch';
import './maps.css';

const GROUPS: Record<string, string> = {
  open: '开放陆图',
  closed: '封闭陆图',
  hybrid: '水陆混合',
  water: '海图',
  nomad: '游牧开局',
  other: '其他地图',
};
const KNOWN_IDS = catalog.maps.map((map) => map.id);
const mapName = (map: (typeof catalog.maps)[number]) => `${map.name} ${map.en}`;

export default function Maps() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('map');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [implicitId, setImplicitId] = useState(KNOWN_IDS[0] ?? '');
  const [listHold, setListHold] = useState<string | null>(null);
  const focusDetail = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const filtered = catalog.maps.filter((map) => (group === 'all' || map.group === group) && mapMatchesQuery(map, query));
  const selection = selectMap({ raw, filteredIds: filtered.map((map) => map.id), knownIds: KNOWN_IDS, implicitId });
  const selected = selection.kind === 'map' ? catalog.maps.find((map) => map.id === selection.id) : undefined;
  const missing = selection.kind === 'missing';
  const guide = selected ? mapGuides[selected.id] : undefined;
  const showDetail = raw != null && listHold !== raw;

  useEffect(() => {
    const pane = listRef.current;
    const row = pane?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!pane || !row) return;
    const paneTop = pane.getBoundingClientRect().top;
    const rowTop = row.getBoundingClientRect().top;
    const delta = rowTop - paneTop;
    if (delta < 0 || delta > pane.clientHeight - row.offsetHeight) pane.scrollTop += delta - 8;
  }, [selected?.id, filtered.length]);

  useEffect(() => {
    detailPaneRef.current?.scrollTo(0, 0);
    if (!focusDetail.current) return;
    focusDetail.current = false;
    detailRef.current?.focus({ preventScroll: true });
  }, [selected?.id, missing, showDetail]);

  const chooseMap = (id: string) => {
    focusDetail.current = true;
    setListHold(null);
    setParams({ map: id });
  };
  const retarget = (nextQuery: string, nextGroup: string) => {
    const nextFiltered = catalog.maps.filter((map) => (nextGroup === 'all' || map.group === nextGroup) && mapMatchesQuery(map, nextQuery));
    const next = selectMap({ raw, filteredIds: nextFiltered.map((map) => map.id), knownIds: KNOWN_IDS, implicitId });
    if (next.implicitId !== implicitId) setImplicitId(next.implicitId);
    if (next.kind === 'map' && next.replaceParam) {
      setParams({ map: next.id }, { replace: true });
      setListHold((held) => (held == null ? held : next.id));
    }
    setQuery(nextQuery);
    setGroup(nextGroup);
  };
  const clearFilters = () => retarget('', 'all');

  return (
    <section className={`pane map-guide${showDetail ? ' is-detail' : ' is-list'}`}>
      <Breadcrumbs />
      <div className="map-head">
        <h1 className="page-heading">地图与开局</h1>
        <p className="note map-source">
          图像和地图说明来自{' '}
          <a href="https://app.aoe2companion.com/" target="_blank" rel="noopener noreferrer">
            AoE2 Companion
          </a>
          。预览用于辨认地形，实际布局随版本和随机种子变化；这里不表示当前天梯地图池。
        </p>
      </div>
      <div className="map-filters">
        <label className="map-search">
          <span>搜索地图</span>
          <span className="map-search-wrap">
            <Icon name="search" />
            <input type="search" value={query} placeholder="黑森林、Black Forest、BF" onChange={(event) => retarget(event.target.value, group)} />
          </span>
        </label>
        <div className="map-filter-row">
          <label>
            <span>地图类型</span>
            <select value={group} onChange={(event) => retarget(query, event.target.value)}>
              <option value="all">全部类型</option>
              {Object.entries(GROUPS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
      </div>
      <p className="note map-result-count" role="status">
        {filtered.length ? (
          <>
            显示{' '}
            <span className="num nw">
              {filtered.length} / {catalog.maps.length} 张
            </span>
            地图
          </>
        ) : (
          '没有匹配的地图，请换一个名称或清除筛选。'
        )}
      </p>
      <div className="map-workspace">
        <div className="map-list-pane" ref={listRef}>
          {filtered.length > 0 && (
            <nav className="map-catalog" id="map-list" aria-label="选择地图">
              {filtered.map((map) => (
                <button
                  type="button"
                  key={map.id}
                  aria-label={mapName(map)}
                  aria-pressed={selected?.id === map.id}
                  aria-controls={selected ? 'map-details' : undefined}
                  onClick={() => chooseMap(map.id)}
                >
                  <img src={`${import.meta.env.BASE_URL}${map.preview.image}`} width="48" height="48" loading="lazy" alt="" />
                  <span className="map-row-meta">
                    <span className="map-row-zh">{map.name}</span>
                    <span className="map-row-en" lang="en">
                      {map.en}
                    </span>
                    <span className="map-row-tags">
                      <span className="map-tag">{GROUPS[map.group] ?? GROUPS.other}</span>
                      {mapGuides[map.id] && <span className="map-tag map-tag-guide">指南</span>}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          )}
        </div>
        {(selected || missing) && (
          <div className="map-detail-pane" ref={detailPaneRef}>
            <button type="button" className="map-back" onClick={() => setListHold(raw)}>
              <Icon name="arrow-left" />
              返回目录
            </button>
            {missing && (
              <p className="map-missing" role="alert">
                链接里的地图不存在
              </p>
            )}
            {selected && (
              <article id="map-details" ref={detailRef} aria-label={mapName(selected)} tabIndex={-1} data-map-id={selected.id}>
                <h3 className="map-detail-title">
                  {selected.name} <span className="map-english">{selected.en}</span>
                  <span className="map-tag">{GROUPS[selected.group] ?? GROUPS.other}</span>
                  {guide && <span className="map-tag map-tag-guide">指南</span>}
                </h3>
                <div className="map-overview">
                  <figure>
                    <img
                      src={`${import.meta.env.BASE_URL}${selected.preview.image}`}
                      width={selected.preview.width}
                      height={selected.preview.height}
                      alt={`${mapName(selected)}地图预览`}
                    />
                    <figcaption className="note">{mapName(selected)} · 地形示意</figcaption>
                  </figure>
                  <div>
                    <h4>地图特点</h4>
                    <p>{selected.description}</p>
                    <h4>地形与侦察</h4>
                    <p>{selected.scouting}</p>
                    {guide && (
                      <>
                        <h4>资源特点</h4>
                        <p>{guide.resources}</p>
                      </>
                    )}
                  </div>
                </div>
                <h4>开局参考</h4>
                <p>{guide?.opening ?? selected.opening}</p>
                {guide && (
                  <>
                    <div className="map-links">
                      {guide.builds.map((id) => (
                        <Link key={id} to={`/builds?bo=${id}`}>
                          {buildOrders.find((order) => order.id === id)?.name.zh}
                        </Link>
                      ))}
                    </div>
                    {selected.id === 'islands' && (
                      <section aria-label="码头与渔船经济">
                        <h4>码头与渔船经济</h4>
                        <p>混合图速封参考：先建一座码头，安排三艘渔船，再以封建军舰保护捕鱼。村民数、渔船数与总人口要分开读，渔船也占人口。</p>
                        <p>
                          第一个码头放在可持续捕鱼且容易保护的位置。补码头前先检查木材和持续造船能力；一开始连铺多个空码头会挤占经济。保持造房，受攻击时把渔船撤到军舰保护范围，失去水域后及时转农田。
                        </p>
                        <p>
                          <a href="https://aoebuddy.com/build-orders/18-fishing-ship-build" target="_blank" rel="noopener noreferrer">
                            查看已核对的单码头速封流程（外部）
                          </a>
                        </p>
                      </section>
                    )}
                    <h4>推荐文明</h4>
                    <ul className="map-civs">
                      {guide.civs.map(([id, why]) => (
                        <li key={id}>
                          <Link to={`/civ/${id}`}>
                            <CivIcon alt="" c={{ en: id }} />
                            {civByEn(id)?.zh}
                          </Link>
                          <span>：{why}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <MapPositions mapId={selected.id} />
                <details>
                  <summary>来源与核对日期</summary>
                  <ul>
                    <li>
                      <a href={selected.preview.sourceUrl} target="_blank" rel="noopener noreferrer">
                        AoE2 Companion · {mapName(selected)}预览图（固定版本）
                      </a>
                    </li>
                    <li>
                      <a href={catalog.meta.sourceUrls.zh} target="_blank" rel="noopener noreferrer">
                        AoE2 Companion · 中文地图名称与说明
                      </a>
                    </li>
                    <li>
                      <a href={catalog.meta.sourceUrls.en} target="_blank" rel="noopener noreferrer">
                        AoE2 Companion · 英文地图名称与说明
                      </a>
                    </li>
                    {guide?.sources.map(([name, url]) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {name}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="note">
                    名称、地图说明与图片于{' '}
                    <time className="nw" dateTime={catalog.meta.checkedAt}>
                      {catalog.meta.checkedAt}
                    </time>{' '}
                    核对。侦察与开局提示为本站整理，具体布局和资源以游戏内侦察为准。游戏图像及地图说明 © Microsoft。
                  </p>
                </details>
              </article>
            )}
          </div>
        )}
      </div>
      <details className="map-sd3" data-testid="map-sd3">
        <summary>赛事地图专题（SD3，本届已结束）</summary>
        <SuddenDessasterWatch />
        <SuddenDessaster3 />
        <SuddenDessasterMechanics />
      </details>
    </section>
  );
}
