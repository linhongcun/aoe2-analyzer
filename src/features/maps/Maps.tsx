import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { buildOrders } from '../../data/buildOrders';
import catalog from '../../data/mapCatalog.json';
import { mapGuides } from './guides';
import { MapPositions } from './MapPositions';
import './maps.css';

const GROUPS: Record<string, string> = {
  open: '开放陆图',
  closed: '封闭陆图',
  hybrid: '水陆混合',
  water: '海图',
  nomad: '游牧开局',
  other: '其他地图',
};
const PREVIEW_LIMIT = 8;
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
const mapName = (map: (typeof catalog.maps)[number]) => `${map.name} ${map.en}`;

export default function Maps() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState(catalog.maps[0]?.id ?? '');
  const detailRef = useRef<HTMLElement>(null);
  const focusOnChoose = useRef(false);
  const term = normalize(query);
  const filtered = catalog.maps.filter((map) => {
    if (group !== 'all' && map.group !== group) return false;
    const initials = map.en.match(/[A-Z]/g)?.join('') ?? '';
    return [map.name, map.en, map.id, `rm_${map.id}`, initials].some((name) => normalize(name).includes(term));
  });
  const selected = filtered.find((map) => map.id === activeId) ?? filtered[0];
  const guide = selected ? mapGuides[selected.id] : undefined;
  let visible = expanded ? filtered : filtered.slice(0, PREVIEW_LIMIT);
  if (!expanded && selected && !visible.some((map) => map.id === selected.id)) visible = [...visible, selected];
  const remaining = filtered.length - visible.length;

  useEffect(() => {
    if (!focusOnChoose.current) return;
    focusOnChoose.current = false;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: 'start' });
  }, [selected?.id, activeId]);

  const chooseMap = (id: string) => {
    if (id === activeId) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: 'start' });
    } else {
      focusOnChoose.current = true;
      setActiveId(id);
    }
  };
  const clearFilters = () => {
    setQuery('');
    setGroup('all');
    setExpanded(false);
  };

  return (
    <section className="pane map-guide">
      <h2>地图与开局</h2>
      <p>
        收录 <span className="num nw">{catalog.maps.length} 张</span>标准地图，常见地图优先排列。选择地图，查看预览、地形与开局提示。
      </p>
      <p className="note">
        图像和地图说明来自{' '}
        <a href="https://app.aoe2companion.com/" target="_blank" rel="noopener noreferrer">
          AoE2 Companion
        </a>
        。预览用于辨认地形，实际布局随版本和随机种子变化；这里不表示当前天梯地图池。
      </p>
      <div className="map-filters">
        <label className="map-search">
          <span>搜索地图</span>
          <input
            type="search"
            value={query}
            placeholder="黑森林、Black Forest、BF"
            onChange={(event) => {
              setQuery(event.target.value);
              setExpanded(false);
            }}
          />
        </label>
        <label>
          <span>地图类型</span>
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setExpanded(false);
            }}
          >
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
      <p className="note map-result-count" role="status">
        {filtered.length ? (
          <>
            显示{' '}
            <span className="num nw">
              {visible.length} / {filtered.length} 张
            </span>
            地图
          </>
        ) : (
          '没有匹配的地图，请换一个名称或清除筛选。'
        )}
      </p>
      {filtered.length > 0 && (
        <>
          <nav className="map-selector" id="map-list" aria-label="选择地图">
            {visible.map((map) => (
              <button
                type="button"
                key={map.id}
                aria-label={mapName(map)}
                aria-pressed={selected?.id === map.id}
                aria-controls="map-details"
                onClick={() => chooseMap(map.id)}
              >
                <img src={`${import.meta.env.BASE_URL}${map.preview.image}`} width="88" height="88" loading="lazy" alt="" />
                <span>{map.name}</span>
                <small>{map.en}</small>
              </button>
            ))}
          </nav>
          {(remaining > 0 || (expanded && filtered.length > PREVIEW_LIMIT)) && (
            <button className="map-expand" type="button" aria-expanded={expanded} aria-controls="map-list" onClick={() => setExpanded(!expanded)}>
              {expanded ? (
                '收起列表'
              ) : (
                <>
                  展开其余 <span className="num nw">{remaining} 张</span>地图
                </>
              )}
            </button>
          )}
        </>
      )}
      {selected && (
        <article id="map-details" ref={detailRef} aria-label={mapName(selected)} tabIndex={-1} data-map-id={selected.id}>
          <h3>
            {selected.name} <span className="map-english">{selected.en}</span>
            <small>{GROUPS[selected.group] ?? GROUPS.other}</small>
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
              <ul>
                {guide.civs.map(([id, why]) => (
                  <li key={id}>
                    <Link to={`/civ/${id}`}>{civByEn(id)?.zh}</Link>：{why}
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
    </section>
  );
}
